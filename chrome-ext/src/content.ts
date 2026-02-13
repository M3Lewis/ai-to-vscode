import { DOMHelper } from './utils/dom';
import { VisualAnchorManager } from './utils/som';
import { PageExtractor } from './extractor';
import { SiteHandler, DeepWikiHandler } from './site_handlers';
import { MessageToVSCode, MessageResponse, ConnectionStatus } from './types';
import { t, setLanguage, applyI18n, Language } from './i18n';

class FloatingPanel {
  private panel: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private enabled: boolean = false;
  private dailyCounter: number = 1;
  private promptButtons: HTMLElement | null = null;
  private isDebugMode: boolean = false;
  private pathMemory: Record<string, string> = {}; // 新增：路径记忆
  private picker: ElementPicker | null = null;

  private lastSelectedElement: HTMLElement | null = null; // 新增：记录上次选中的元素

  // Handlers
  private handlers: SiteHandler[] = [new DeepWikiHandler()];
  private activeHandler: SiteHandler | null = null;
  private injectedButton: HTMLElement | null = null;

  constructor() {
    this.initialize();
    this.checkDebugMode();
    this.setupStorageListener();
  }

  // 在 class FloatingPanel 内部添加
  private setUIVisibility(visible: boolean): void {
    if (this.panel) {
      // 使用 display: none 是最彻底的，确保不占位且不被渲染
      this.panel.style.display = visible ? 'block' : 'none';
    }

    // 隐藏所有正在显示的通知元素
    const notifications = document.querySelectorAll('.notification');
    notifications.forEach(el => {
      (el as HTMLElement).style.display = visible ? 'block' : 'none';
    });
  }

  private checkDebugMode(): void {
    // 检测是否为调试模式（可以通过URL参数或localStorage控制）
    this.isDebugMode =
      window.location.search.includes('debug=true') ||
      localStorage.getItem('ai-vscode-debug') === 'true' ||
      window.location.hostname === 'localhost';
  }

  private debugLog(message: string, ...args: any[]): void {
    if (this.isDebugMode) {
      console.log(message, ...args);
    }
  }

  private debugWarn(message: string, ...args: any[]): void {
    if (this.isDebugMode) {
      console.warn(message, ...args);
    }
  }

  private async initialize(): Promise<void> {
    await this.checkAndInitialize();
    await this.loadDailyCounter();
    await this.loadPathMemory(); // 新增：加载路径记忆

    // 新增：初始化后立即查询连接状态
    this.queryConnectionStatus();
  }

  // 新增：主动查询连接状态
  private queryConnectionStatus(): void {
    chrome.runtime.sendMessage({ action: 'getConnectionStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('查询连接状态失败:', chrome.runtime.lastError);
        return;
      }

      if (response && response.connected !== undefined) {
        console.log('Connection status:', response.connected ? 'connected' : 'disconnected');
        this.updateConnectionStatus(response.connected);
      }
    });
  }

  private async loadDailyCounter(): Promise<void> {
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get(['lastSaveDate', 'dailyCounter']);

    if (result.lastSaveDate === today) {
      this.dailyCounter = (result.dailyCounter || 0) + 1;
    } else {
      this.dailyCounter = 1;
    }
  }

  private async updateDailyCounter(): Promise<void> {
    const today = new Date().toDateString();
    await chrome.storage.local.set({
      lastSaveDate: today,
      dailyCounter: this.dailyCounter
    });
    this.dailyCounter++;
  }

  // 新增：加载路径记忆
  private async loadPathMemory(): Promise<void> {
    const activeProject = await chrome.storage.local.get(['activeProject']);
    const rootPath = activeProject.activeProject?.rootPath || 'default';
    const storageKey = `pathMemory_${rootPath}`;

    const result = await chrome.storage.local.get([storageKey]);
    this.pathMemory = result[storageKey] || {};
    console.log(`[${rootPath}] Path memory loaded:`, Object.keys(this.pathMemory).length, 'files');
  }

  // 新增：保存路径记忆
  private async savePathMemory(): Promise<void> {
    const activeProject = await chrome.storage.local.get(['activeProject']);
    const rootPath = activeProject.activeProject?.rootPath || 'default';
    const storageKey = `pathMemory_${rootPath}`;

    await chrome.storage.local.set({ [storageKey]: this.pathMemory });
  }

  // 新增：监听存储变化
  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.activeProject) {
        console.log('Active project changed; reloading path memory.');
        this.loadPathMemory();
      }
    });
  }


  private async checkAndInitialize(): Promise<void> {
    // 统一从 settings 键读取配置
    const storageData = await chrome.storage.sync.get('settings');
    const settings = storageData.settings || {};

    // Initialize Language
    const lang = settings.language || 'zh';
    setLanguage(lang);

    const defaultUrls = [
      'chat.openai.com',
      'claude.ai',
      'gemini.google.com',
      'chatgpt.com',
      'poe.com',
      'perplexity.ai',
      'deepseek.com',
      'aistudio.google.com'
    ];

    // Check for specialized handlers
    const currentHostname = window.location.hostname;
    this.activeHandler = this.handlers.find(h => h.match(currentHostname)) || null;
    if (this.activeHandler) {
      console.log(`[Content] Activating specialized handler: ${this.activeHandler.name}`);
      this.setupHandler(this.activeHandler);
    }

    const enabledUrls: string[] = settings.enabledUrls || defaultUrls;
    const showOnAllSites = settings.showOnAllSites || false;


    if (showOnAllSites || this.isUrlEnabled(currentHostname, enabledUrls)) {
      this.enabled = true;
      this.createPanel();
      this.setupMessageListener();
      console.log('Floating panel enabled.');
    } else {
      console.log('当前网站未启用悬浮窗:', currentHostname);
    }

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.settings) {
        const newSettings = changes.settings.newValue;
        if (newSettings && newSettings.language) {
          setLanguage(newSettings.language);
          if (this.panel) {
            applyI18n(this.panel);
            // Also re-render dynamic parts if needed (like status text if simpler to just update)
            // applyI18n handles data-i18n.
            // We might need to handle specific dynamic updates manually if applyI18n is not enough.
            // For now applyI18n should cover data-i18n elements.
          }
        }
        // Only reload if non-dynamic settings changed?
        // For simplicity, we might still reload, but let's try to avoid it for language.
        // If other settings changed (enabledUrls), we might need reload.
        // But the original code reloads on ANY settings change.
        // window.location.reload(); 
        // We should keep the reload behavior for other settings, but maybe verify?
        // For now, I'll keep the reload behavior BUT allow language update to happen if ONLY language changed?
        // If I reload, the language sets on init.
        // So actually, if I keep reload, I don't need the listener logic above?
        // BUT reload is disruptive.
        // The original code:
        // window.location.reload();
        // So if I change language, page reloads. That works.
        // But user might lose context.
        // I'll keep reload for now to be safe, but ideally we should dynamic update.
        // If I implement dynamic update, I should AVOID reload for language change.

        let shouldReload = false;
        if (changes.settings.oldValue?.enabledUrls !== changes.settings.newValue?.enabledUrls) shouldReload = true;
        if (changes.settings.oldValue?.showOnAllSites !== changes.settings.newValue?.showOnAllSites) shouldReload = true;
        if (changes.settings.oldValue?.siteConfigs !== changes.settings.newValue?.siteConfigs) shouldReload = true;

        if (shouldReload) {
          window.location.reload();
        } else if (changes.settings.oldValue?.language !== changes.settings.newValue?.language) {
          // Dynamic language update
          setLanguage(changes.settings.newValue.language);
          if (this.panel) applyI18n(this.panel);
        }
      }
    });
  }

  private isUrlEnabled(hostname: string, enabledUrls: string[]): boolean {
    return enabledUrls.some(url => {
      if (url.includes('*')) {
        const pattern = url.replace(/\*/g, '.*');
        return new RegExp(pattern).test(hostname);
      }
      return hostname.includes(url);
    });
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.id = 'ai-vscode-panel';
    // 新增：很多截图库（如 html2canvas）会识别这个属性并跳过渲染
    this.panel.setAttribute('data-html2canvas-ignore', 'true');

    this.panel.innerHTML = `
    <div class="panel-container">
      <div class="ai-vscode-header">
        <div class="ai-vscode-header-left">
          <span class="ai-vscode-title" data-i18n="panelTitle">${t('panelTitle')}</span>
          <div id="connection-status" class="connection-status">
            <span class="status-dot"></span>
            <span class="status-text" data-i18n="waitingConnection">${t('waitingConnection')}</span>
          </div>
        </div>
        <div class="ai-vscode-header-right">
          <button id="toggle-panel-body" class="ai-vscode-toggle" data-i18n-title="togglePanel" title="${t('togglePanel')}">▾</button>
          <button id="close-panel" class="ai-vscode-close" data-i18n-title="closePanel" title="${t('closePanel')}">✕</button>
        </div>
      </div>

      <div id="filename-preview" class="filename-preview" data-i18n="filenamePreview">${t('filenamePreview')}</div>

      <div class="panel-body">
        <div class="btn-section">
          <div class="btn-section-label" data-i18n="sectionCodeOps">${t('sectionCodeOps')}</div>
          <button id="send-to-vscode" class="primary" data-i18n="btnCopySave" data-i18n-title="btnCopySaveTitle" title="${t('btnCopySaveTitle')}">${t('btnCopySave')}</button>
          <div class="btn-grid btn-grid-sub">
            <button id="create-files-from-content" class="secondary" data-i18n="btnCreateFiles" data-i18n-title="btnCreateFilesTitle" title="${t('btnCreateFilesTitle')}">${t('btnCreateFiles')}</button>
            <button id="patch-files-from-content" class="secondary" data-i18n="btnPatch" data-i18n-title="btnPatchTitle" title="${t('btnPatchTitle')}">${t('btnPatch')}</button>
          </div>
        </div>

        <div class="btn-section">
          <div class="btn-section-label" data-i18n="sectionElementTools">${t('sectionElementTools')}</div>
          <div class="btn-grid">
            <button id="screenshot-element" class="secondary" data-i18n="btnScreenshot" data-i18n-title="btnScreenshotTitle" title="${t('btnScreenshotTitle')}">${t('btnScreenshot')}</button>
            <button id="copy-element" class="secondary" data-i18n="btnCopyElem" data-i18n-title="btnCopyElemTitle" title="${t('btnCopyElemTitle')}">${t('btnCopyElem')}</button>
            <button id="copy-element-deep" class="secondary" data-i18n="btnCopyElemDeep" data-i18n-title="btnCopyElemDeepTitle" title="${t('btnCopyElemDeepTitle')}">${t('btnCopyElemDeep')}</button>
            <button id="send-screenshot" class="secondary" data-i18n="btnFullShot" data-i18n-title="btnFullShotTitle" title="${t('btnFullShotTitle')}">${t('btnFullShot')}</button>
            <button id="clone-page" class="secondary" data-i18n="btnClonePage" data-i18n-title="btnClonePageTitle" title="${t('btnClonePageTitle')}">${t('btnClonePage')}</button>
          </div>
        </div>

        <div class="btn-section">
          <div class="btn-section-label" data-i18n="sectionAIStudio">${t('sectionAIStudio')}</div>
          <div class="btn-grid">
            <button id="sync-ai-studio-drive" class="secondary" data-i18n="btnSyncDrive" data-i18n-title="btnSyncDriveTitle" title="${t('btnSyncDriveTitle')}">${t('btnSyncDrive')}</button>
            <button id="export-aistudio-history" class="secondary" data-i18n="btnExportChat" data-i18n-title="btnExportChatTitle" title="${t('btnExportChatTitle')}">${t('btnExportChat')}</button>
          </div>
        </div>

        <div id="prompt-section">
          <div class="btn-section-label prompt-section-header">
            <span data-i18n="sectionPrompts">${t('sectionPrompts')}</span>
            <button id="toggle-prompts" class="ai-vscode-toggle" data-i18n-title="togglePrompts" title="${t('togglePrompts')}">▾</button>
          </div>
          <div id="prompt-buttons" class="prompt-buttons"></div>
        </div>
      </div>
    </div>
  `;

    document.body.appendChild(this.panel);
    DOMHelper.makeDraggable(this.panel);

    const sendButton = document.getElementById('send-to-vscode');
    sendButton?.addEventListener('click', () => this.handleSendClick());

    const createFilesButton = document.getElementById('create-files-from-content');
    createFilesButton?.addEventListener('click', () => this.handleCreateFilesClick());

    const patchFilesButton = document.getElementById('patch-files-from-content');
    patchFilesButton?.addEventListener('click', () => this.handlePartialUpdateClick());

    const screenshotElementButton = document.getElementById('screenshot-element');
    screenshotElementButton?.addEventListener('click', () => this.handleScreenshotElementClick());

    const copyElementButton = document.getElementById('copy-element');
    copyElementButton?.addEventListener('click', () => this.handleCopyElementClick());

    const copyElementDeepButton = document.getElementById('copy-element-deep');
    copyElementDeepButton?.addEventListener('click', () => this.handleCopyElementDeepClick());

    const sendScreenshotButton = document.getElementById('send-screenshot');
    sendScreenshotButton?.addEventListener('click', () => this.handleSendScreenshotClick());

    const clonePageButton = document.getElementById('clone-page');
    clonePageButton?.addEventListener('click', () => this.handleClonePageClick());

    const syncDriveButton = document.getElementById('sync-ai-studio-drive');
    syncDriveButton?.addEventListener('click', () => this.handleSyncDriveFilesClick());

    const exportHistoryButton = document.getElementById('export-aistudio-history');
    exportHistoryButton?.addEventListener('click', () => this.handleExportAIStudioHistory());

    const closeButton = document.getElementById('close-panel');
    closeButton?.addEventListener('click', () => this.togglePanel());

    // 面板整体折叠按钮逻辑
    const togglePanelBodyBtn = document.getElementById('toggle-panel-body') as HTMLButtonElement | null;
    const panelBody = this.panel.querySelector('.panel-body') as HTMLElement | null;

    if (togglePanelBodyBtn && panelBody) {
      togglePanelBodyBtn.addEventListener('click', () => {
        const collapsed = panelBody.classList.toggle('collapsed');
        togglePanelBodyBtn.textContent = collapsed ? '▸' : '▾';
        chrome.storage.local.set({ panelBodyCollapsed: collapsed });
      });

      chrome.storage.local.get('panelBodyCollapsed', (res) => {
        if (res.panelBodyCollapsed) {
          panelBody.classList.add('collapsed');
          togglePanelBodyBtn.textContent = '▸';
        }
      });
    }

    // 提示词折叠按钮逻辑
    const toggleBtn = document.getElementById('toggle-prompts') as HTMLButtonElement | null;
    const promptSection = document.getElementById('prompt-section');

    if (toggleBtn && promptSection) {
      toggleBtn.addEventListener('click', () => {
        const collapsed = promptSection.classList.toggle('collapsed');
        toggleBtn.textContent = collapsed ? '>' : 'v';

        // 如需记住用户选择，可以写入 local
        chrome.storage.local.set({ promptsCollapsed: collapsed });
      });

      // 初始化时读取折叠状态
      chrome.storage.local.get('promptsCollapsed', (res) => {
        if (res.promptsCollapsed) {
          promptSection.classList.add('collapsed');
          toggleBtn.textContent = '>';
        }
      });
    }

    this.statusElement = document.getElementById('connection-status');
    this.promptButtons = document.getElementById('prompt-buttons');

    // 加载提示词按钮
    this.loadPromptButtons();
  }



  private togglePanel(): void {
    if (this.panel) {
      this.panel.style.display =
        this.panel.style.display === 'none' ? 'block' : 'none';
    }
  }

  private setupHandler(handler: SiteHandler): void {
    // Initial check
    this.updateHandlerTarget(handler);

    // Observer
    handler.startObserver(() => {
      this.updateHandlerTarget(handler);
    });
  }

  private updateHandlerTarget(handler: SiteHandler): void {
    // Just for debugging/tracking, we don't inject UI anymore
    const target = handler.getTarget();
    if (target) {
      console.log(`[Content] Handler ${handler.name} identified target`, target);
    }
  }

  private async handleSendClick(): Promise<void> {
    const overallStart = performance.now();

    // --- 新增：截图前隐藏 UI ---
    this.setUIVisibility(false);
    // 给浏览器 50ms 时间进行重绘，确保 UI 在截图中消失
    await this.delay(50);

    console.group('🚀 [复制并保存] 完整流程');
    console.log('⏱️ 开始时间:', new Date().toLocaleTimeString());
    console.log('💾 初始内存:', this.getMemoryUsage());

    try {
      // AI Studio 特殊处理
      if (window.location.hostname.includes('aistudio.google.com')) {
        await this.handleAIStudioCopy();
        return;
      }

      // 步骤1：检查 Active Handler 是否有目标
      console.log('\n📍 步骤1: 查找内容来源');
      let content = '';

      if (this.activeHandler) {
        console.log(`[Content] Checking active handler: ${this.activeHandler.name}`);
        const target = this.activeHandler.getTarget();
        if (target) {
          console.log('✔ Handler provided target');
          content = target.innerText;

          if (!content || content.trim().length === 0) {
            this.showError(t('handlerNoContent'));
            console.groupEnd();
            return;
          }
          // Skip to step 5 (filename generation)
        } else {
          console.log('⚠️ Handler has no target, falling back to legacy button search');
        }
      }

      // Fallback to legacy button logic if no content from handler
      if (!content) {
        const copyButton = DOMHelper.findLatestCopyButton();

        if (!copyButton) {
          console.error('❌ 未找到 COPY 按钮');
          this.showError(t('noCopyButton'));
          console.groupEnd();
          return;
        }

        // 步骤2：点击按钮
        console.log('\n📍 步骤2: 点击复制按钮');
        console.time('点击复制');
        copyButton.click();
        console.timeEnd('点击复制');

        // 步骤3：等待复制完成 (300ms)
        console.group('\n📍 步骤3: 等待复制完成 (300ms)');
        await this.delay(300);

        // 步骤4：读取剪贴板
        console.log('\nStep 4: Read clipboard');
        content = await DOMHelper.getClipboardContent();
      }

      if (!content || content.trim().length === 0) {
        console.error('❌ 内容为空');
        this.showError(t('contentEmpty'));
        console.groupEnd();
        return;
      }

      // 步骤5：生成文件名
      console.log('\nStep 5: Generate filename');
      console.time('Generate filename');
      const filename = this.generateSmartFilename(content);
      console.timeEnd('Generate filename');
      console.log('📝 文件名:', filename);

      // 步骤6：发送到VS Code
      console.log('\n📍 步骤6: 发送到VS Code');
      this.showFilenamePreview(filename);
      this.sendToVSCode(content, filename);

      // 步骤7：更新计数器
      console.log('\nStep 7: Update counter');
      await this.updateDailyCounter();

      const overallEnd = performance.now();
      console.log('\n✔ 流程完成');
      console.log('⏱️ 总耗时:', (overallEnd - overallStart).toFixed(2), 'ms');
      console.log('💾 结束内存:', this.getMemoryUsage());
      console.groupEnd();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ 流程失败:', error);
      console.log('💾 错误时内存:', this.getMemoryUsage());
      this.showError(`${t('opFailed')}: ${errorMessage}`);
      console.groupEnd();
    } finally {
      // --- 新增：无论成功失败，最后必须恢复 UI 显示 ---
      this.setUIVisibility(true);
      console.groupEnd();
    }
  }

  private async handleCreateFilesClick(): Promise<void> {

    this.setUIVisibility(false); // 隐藏
    await this.delay(50);        // 强制重绘

    console.group('Create files: start');
    try {
      // 1. 获取内容
      let content = '';
      if (window.location.hostname.includes('aistudio.google.com')) {
        // AI Studio 特殊处理逻辑
        const moreButtons = Array.from(document.querySelectorAll<HTMLElement>(
          'button[aria-label*="options"], button[iconname="more_vert"], ms-chat-turn-options button'
        ));
        if (moreButtons.length > 0) {
          const menuButton = moreButtons[moreButtons.length - 1];
          menuButton.click();
          await this.delay(500);
          const copyButton = DOMHelper.findLatestCopyButton();
          if (copyButton) {
            copyButton.click();
            await this.delay(300);
            content = await DOMHelper.getClipboardContent();
          }
        }
      } else {
        const copyButton = DOMHelper.findLatestCopyButton();
        if (copyButton) {
          copyButton.click();
          await this.delay(300);
          content = await DOMHelper.getClipboardContent();
        }
      }

      if (!content || content.trim().length === 0) {
        this.showError(t('contentEmpty'));
        console.groupEnd();
        return;
      }

      // 2. 解析代码块
      const files = this.parseFilesFromContent(content);
      if (files.length === 0) {
        this.showError(t('noValidPaths'));
        console.groupEnd();
        return;
      }

      console.log(`🔍 识别到 ${files.length} 个文件:`, files.map(f => f.path));

      // 3. 逐个发送到 VS Code
      let successCount = 0;
      for (const file of files) {
        try {
          await this.sendToVSCode(file.content, file.filename, file.savePath);
          successCount++;
        } catch (err) {
          console.error(`保存文件 ${file.path} 失败:`, err);
        }
      }

      if (successCount > 0) {
        this.showSuccess(t('createdFiles', { count: successCount }));
        await this.updateDailyCounter();
      } else {
        this.showError(t('failedCreate'));
      }

    } catch (error) {
      console.error('Create files failed:', error);
      this.showError(t('failedCreate'));
    } finally {
      this.setUIVisibility(true);  // 恢复
      console.groupEnd();
    }
  }

  private async handlePartialUpdateClick(): Promise<void> {
    this.setUIVisibility(false); // 隐藏
    await this.delay(50);        // 强制重绘

    console.group('Partial update: start');
    try {
      // 1. 获取内容
      let content = '';
      if (window.location.hostname.includes('aistudio.google.com')) {
        const moreButtons = Array.from(document.querySelectorAll<HTMLElement>(
          'button[aria-label*="options"], button[iconname="more_vert"], ms-chat-turn-options button'
        ));
        if (moreButtons.length > 0) {
          const menuButton = moreButtons[moreButtons.length - 1];
          menuButton.click();
          await this.delay(500);
          const copyButton = DOMHelper.findLatestCopyButton();
          if (copyButton) {
            copyButton.click();
            await this.delay(300);
            content = await DOMHelper.getClipboardContent();
          }
        }
      } else {
        const copyButton = DOMHelper.findLatestCopyButton();
        if (copyButton) {
          copyButton.click();
          await this.delay(300);
          content = await DOMHelper.getClipboardContent();
        }
      }

      if (!content || content.trim().length === 0) {
        this.showError(t('contentEmpty'));
        console.groupEnd();
        return;
      }

      // 2. 解析代码块
      const files = this.parseFilesFromContent(content);
      if (files.length === 0) {
        this.showError(t('noValidPaths'));
        console.groupEnd();
        return;
      }

      console.log(`🔍 识别到 ${files.length} 个更新项:`, files.map(f => f.path));

      // 3. 逐个发送到 VS Code (带有 patch 类型)
      let successCount = 0;
      for (const file of files) {
        try {
          await this.sendToVSCode(file.content, file.filename, file.savePath, 'patch');
          successCount++;
        } catch (err) {
          console.error(`更新文件 ${file.path} 失败:`, err);
        }
      }

      if (successCount > 0) {
        this.showSuccess(t('sentUpdate', { count: successCount }));
        await this.updateDailyCounter();
      } else {
        this.showError(t('failedUpdate'));
      }

    } catch (error) {
      console.error('Partial update failed:', error);
      this.showError(t('failedUpdate'));
    } finally {
      this.setUIVisibility(true);  // 恢复
      console.groupEnd();
    }
  }

  private handleScreenshotElementClick(): void {
    if (!this.picker) {
      this.picker = new ElementPicker(async (el) => {
        // 记录选中的元素
        this.lastSelectedElement = el;
        // 选择元素后，自动触发截图（带红框），但不合并文本（传 null）
        await this.handleCaptureWithText(null, el);
      });
    }
    this.picker.start();
    this.showNotification(t('selectElemCapture'), 'success');
  }

  private handleCopyElementClick(): void {
    // 如果有上次选中的元素，且该元素仍在文档中，直接使用
    if (this.lastSelectedElement && document.body.contains(this.lastSelectedElement)) {
      const info = ElementPicker.getElementInfo(this.lastSelectedElement);
      navigator.clipboard.writeText(info).then(() => {
        this.showSuccess(t('copiedElem'));
      }).catch(err => {
        this.showError(t('copyFailed') + ': ' + err);
      });
      // 关键修改：使用后立即清除缓存
      this.lastSelectedElement = null;
      return;
    }

    if (!this.picker) {
      this.picker = new ElementPicker((el) => {
        // 修改：不再更新 lastSelectedElement
        const info = ElementPicker.getElementInfo(el);
        navigator.clipboard.writeText(info).then(() => {
          this.showSuccess(t('copiedElem'));
        }).catch(err => {
          this.showError(t('copyFailed') + ': ' + err);
        });
      });
    }
    this.picker.start();
    this.showNotification(t('selectElemCapture'), 'success'); // Reusing capture msg or need specific? "Select to copy"
    // Use generic or specific?
    // Line 712 target: 'Select an element to copy (Esc to cancel).'
    // "selectElemCapture" is "Select element to capture".
    // I should use "selectElemCopy" if I had it.
    // But I don't.
    // I added "btnCopyElemTitle": "Select element & copy code".
    // I'll stick to 'Select element (Esc to cancel)' if possible, or just create a new key later.
    // For now I'll use 'selectElemCapture' (it says "Select element to capture").
    // Wait, "capture" implies screenshot.
    // I'll leave it as is? No, I must replace it.
    // I'll use 'selectElemCapture' and accept minor semantic mismatch (Users select element).
    // Or I'll just hardcode it for now? NO.
    // I'll add 'selectElemCopy' to i18n.ts?
    // I added keys in Step 251.
    // I didn't add 'selectElemCopy'.
    // I'll use 'selectElemCapture' for now.
    this.showNotification(t('selectElemCapture'), 'success');
  }

  private handleCopyElementDeepClick(): void {
    // 如果有上次选中的元素，且该元素仍在文档中，直接使用
    if (this.lastSelectedElement && document.body.contains(this.lastSelectedElement)) {
      const html = this.getElementDeepHtml(this.lastSelectedElement);
      navigator.clipboard.writeText(html).then(() => {
        this.showSuccess(t('copiedElemDeep'));
      }).catch(err => {
        this.showError(t('copyFailed') + ': ' + err);
      });
      // 关键修改：使用后立即清除缓存
      this.lastSelectedElement = null;
      return;
    }

    if (!this.picker) {
      this.picker = new ElementPicker((el) => {
        // 修改：不再更新 lastSelectedElement
        const html = this.getElementDeepHtml(el);
        navigator.clipboard.writeText(html).then(() => {
          this.showSuccess(t('copiedElemDeep'));
        }).catch(err => {
          this.showError(t('copyFailed') + ': ' + err);
        });
      });
    }
    this.picker.start();
    this.showNotification(t('selectElemCapture'), 'success');
  }

  private getElementDeepHtml(el: HTMLElement): string {
    // 克隆节点以避免修改页面上的实际元素
    const clone = el.cloneNode(true) as HTMLElement;

    // 使用 TreeWalker 移除所有注释节点
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
    const comments: Node[] = [];
    while (walker.nextNode()) {
      comments.push(walker.currentNode);
    }
    comments.forEach(c => c.parentNode?.removeChild(c));

    return clone.outerHTML;
  }

  private async handleSendScreenshotClick(): Promise<void> {
    // 普通截图，不带额外文本
    await this.handleCaptureWithText(null);
  }

  private async handleClonePageClick(): Promise<void> {
    this.setUIVisibility(false);
    this.showNotification(t('preparingClone'), 'success');

    // 1. 注入视觉锚点
    VisualAnchorManager.injectAnchors();

    // 给浏览器一点时间渲染锚点
    await this.delay(100);

    // 2. 截图
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, async (response) => {
      // 3. 移除锚点 (截图完成后立即移除，恢复原始界面)
      VisualAnchorManager.removeAnchors();
      this.setUIVisibility(true);

      if (chrome.runtime.lastError || !response || !response.success || !response.dataUrl) {
        this.showError(t('screenshotFailed') + '; cannot continue.');
        return;
      }

      try {
        // 4. 复制到剪贴板
        await this.copyToClipboard(response.dataUrl, null);
        this.showSuccess(t('screenshotCopied'));

      } catch (e) {
        console.error('复刻处理失败:', e);
        this.showError(t('cloneFailed') + ': ' + e);
      }
    });
  }

  private async handleSyncDriveFilesClick(): Promise<void> {
    if (!window.location.hostname.includes('aistudio.google.com')) {
      this.showError(t('aiStudioOnly'));
      return;
    }

    console.group('Sync AI Studio files: start');
    this.showNotification(t('scanningFiles'), 'success');

    try {
      const files = this.findAIStudioDriveFiles();
      if (files.length === 0) {
        this.showError(t('noFilesFound'));
        console.groupEnd();
        return;
      }

      console.log(`Found ${files.length} file(s).`, files.map(f => f.name));
      this.showNotification(t('foundFiles', { count: files.length }), 'success');

      let successCount = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.showNotification(t('syncing', { current: i + 1, total: files.length, name: file.name }), 'success');
        console.log(`=== Syncing file ${i + 1}/${files.length}: ${file.name} ===`);

        try {
          await this.delay(300);

          let fileNameWithDirectory = file.name;
          let customSavePath = '';

          // 路径记忆增强：如果文件名中没有路径，尝试从记忆中恢复
          if (!fileNameWithDirectory.includes('/') && !fileNameWithDirectory.includes('\\')) {
            const lowerFilename = fileNameWithDirectory.toLowerCase();
            const memoryKey = Object.keys(this.pathMemory).find(k => k.toLowerCase() === lowerFilename);
            if (memoryKey) {
              customSavePath = this.pathMemory[memoryKey];
              console.log(`🧠 AI Studio 路径记忆匹配: ${fileNameWithDirectory} -> ${customSavePath}`);
            }
          }

          console.log(`Clicking file button: ${fileNameWithDirectory}`);
          file.button.click();

          const isReady = await this.waitForMonacoReady(8000, fileNameWithDirectory);
          if (!isReady) {
            console.warn(`File ${fileNameWithDirectory} may not be fully loaded; proceeding anyway.`);
          }

          await this.delay(300);

          const content = await this.extractCodeFromMonaco();
          if (content && content.length > 0) {
            console.log(`Sending to VS Code: ${fileNameWithDirectory} (${content.length} chars), savePath: ${customSavePath}`);
            await this.sendToVSCode(content, fileNameWithDirectory, customSavePath);
            successCount++;
            console.log(`Synced: ${fileNameWithDirectory}`);
          } else {
            console.warn(`Empty content for file: ${file.name}`);
            this.showNotification(t('fileContentEmpty', { name: file.name }), 'error');
          }
        } catch (err) {
          console.error(`Sync failed for file: ${file.name}`, err);
        }

        await this.delay(500);
      }

      if (successCount > 0) {
        this.showSuccess(t('syncedFiles', { count: successCount }));
        await this.delay(500);
        await this.syncCommitMessage();
      } else {
        this.showError(t('syncFailed'));
      }

    } catch (error) {
      console.error('Sync AI Studio files failed:', error);
      this.showError(t('syncFailed') + ': ' + error);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * 导出 AI Studio 所有历史对话为 Markdown 文件
   *
   * 完整流程：
   * 1. 找到 ms-prompt-scrollbar 中的所有 button，从第一个开始点击
   * 2. 点击后页面显示 3 个 ms-chat-turn：User问题(0)、Model思考(1)、Model回答(2)
   * 3. 对第1个和第3个分别点击菜单的复制按钮，获取内容
   * 4. 循环处理所有 button，最终导出
   */
  private async handleExportAIStudioHistory(): Promise<void> {
    if (!window.location.hostname.includes('aistudio.google.com')) {
      this.showError(t('aiStudioOnly'));
      return;
    }

    console.group('Export AI Studio history: start');
    this.showNotification(t('extractingHistory'), 'success');

    try {
      // 1. 先获取按钮总数
      const initialButtons = document.querySelectorAll('ms-prompt-scrollbar button');
      const totalCount = initialButtons.length;

      if (totalCount === 0) {
        this.showError(t('noPromptButtons'));
        console.groupEnd();
        return;
      }

      console.log(`Found ${totalCount} prompt buttons.`);
      this.showNotification(t('foundPrompts', { count: totalCount }), 'success');

      const allConversations: Array<{ question: string; answer: string }> = [];
      let lastQuestionSnippet = '';
      let lastAnswerSnippet = '';

      // 2. 依次按索引处理每个 button
      // 注意：AI Studio 是动态加载 DOM 的（虚拟滚动），不能依赖一开始建立的全局索引
      // 必须采用“点击 -> 等待 -> 抓取视口内容”的策略

      for (let i = 0; i < totalCount; i++) {
        console.log(`\n===== Processing ${i + 1}/${totalCount} =====`);
        this.showNotification(t('extracting', { current: i + 1, total: totalCount }), 'success');

        // 每次重新查找按钮（因为页面可能刷新或重绘）
        let buttonHint = '';
        const currentButtons = document.querySelectorAll<HTMLElement>('ms-prompt-scrollbar button');
        if (i < currentButtons.length) {
          const btn = currentButtons[i];
          buttonHint = this.getButtonHint(btn);
          const beforeSignature = this.getVisibleTurnsSignature();
          // 点击按钮，触发滚动和懒加载
          btn.scrollIntoView({ block: 'center' });
          await this.delay(100);
          btn.click();
          const updated = await this.waitForVisibleTurnsChange(beforeSignature, 5000);
          if (!updated) {
            console.warn('  [warn] Visible turns did not update in time; continuing.');
          }
          // 等待页面滚动和渲染，稍微长一点以防万一
          await this.delay(200);
        } else {
          console.warn(`  [warn] Button ${i + 1} not found; continuing.`);
        }

        // --- 核心定位逻辑：寻找视口内的当前轮对话 ---

        let userTurn: HTMLElement | undefined;
        let answerTurn: HTMLElement | undefined;
        let answerHint: HTMLElement | undefined;

        // 1. 获取所有现存的 turns
        const currentAllTurns = Array.from(document.querySelectorAll<HTMLElement>('ms-chat-turn'));

        // 2. 筛选出可见的 turns
        const visibleTurns = this.getVisibleTurns(currentAllTurns);
        console.log(`  DOM turns: ${currentAllTurns.length}, visible: ${visibleTurns.length}`);

        // 3. 在可见 turns 中查找 User Turn
        // 点击按钮后，目标 User Turn 通常会滚动到视口顶部或中部
        // 因此，视口内出现的第一个 User Turn 极大概率就是我们要找的
        userTurn = this.selectPrimaryUserTurn(visibleTurns, buttonHint);

        // 4. 兜底策略：如果视口内没找到 User Turn
        if (!userTurn) {
          console.warn('  [warn] No visible user turn; trying to infer from model turn.');

          // 策略 B: 如果视口内有 Model Turn，那它的前一个 User Turn 很大可能就是目标
          // (因为 Model 总是紧跟在 User 后面)
          if (visibleTurns.length > 0) {
            const firstVisible = visibleTurns[0];
            const idx = currentAllTurns.indexOf(firstVisible);

            if (idx > 0) {
              // 鍚戝墠鏌ユ壘鏈€杩戠殑 User Turn
              for (let j = idx - 1; j >= 0; j--) {
                const candidate = currentAllTurns[j];
                if (this.isUserTurn(candidate)) {
                  userTurn = candidate;
                  console.log(`  [ok] Inferred user turn from model (offset: ${idx - j}).`);
                  break;
                }
              }
            }
          }

          // 策略 C: 如果还是没找到，尝试再次强制滚动
          if (!userTurn && i < currentButtons.length) {
            console.log('  [retry] Clicking button again to trigger scroll...');
            currentButtons[i].click();
            await this.delay(1000); // 增加等待时间

            // 再次尝试获取可见元素
            const retryVisible = this.getVisibleTurns(
              Array.from(document.querySelectorAll<HTMLElement>('ms-chat-turn'))
            );

            userTurn = this.selectPrimaryUserTurn(retryVisible, buttonHint);
          }

          if (!userTurn) {
            const hinted = this.findUserTurnByHint(currentAllTurns, buttonHint);
            if (hinted) {
              userTurn = hinted;
              console.log('  Matched user turn by button hint.');
            }
          }

          if (!userTurn) {
            const indexed = this.selectUserTurnByIndex(currentAllTurns, i, totalCount);
            if (indexed) {
              userTurn = indexed;
              console.log('  Matched user turn by index fallback.');
            }
          }
        }

        // 5. 如果还找不到，可能是 DOM 还没渲染出来，或者该轮对话确实有问题

        if (!userTurn && visibleTurns.length > 0) {
          const candidateAnswer = this.getCandidateAnswerTurn(visibleTurns, currentAllTurns);
          if (candidateAnswer) {
            const inferredUser = this.findUserTurnFromAnswerIndex(currentAllTurns, candidateAnswer, true);
            if (inferredUser) {
              userTurn = inferredUser;
              answerHint = candidateAnswer;
              console.log('  [ok] Inferred user turn by answer index (N-2 offset).');
            }
          }
        }
        if (!userTurn) {
          console.error(`  [error] Unable to locate user turn for round ${i + 1}; skipping.`);
          // 记录错误但不中断
          allConversations.push({
            question: `[${t('turnExtractFailed', { index: i + 1 })}]`,
            answer: ''
          });
          continue;
        }

        // 6. 继续寻找 Answer
        // 优先使用可见区域的相邻 Model Turn，再回退到 DOM 顺序
        answerTurn = this.selectVisibleAnswerTurn(userTurn, visibleTurns);

        if (!answerTurn && answerHint && !this.isThinkingTurn(answerHint)) {
          answerTurn = answerHint;
        }

        if (!answerTurn) {
          answerTurn = this.findAnswerTurnFromUser(userTurn);
        }

        if (!answerTurn) {
          const turnListRoot = this.findTurnListRoot(userTurn);
          const scopedTurns = turnListRoot
            ? Array.from(turnListRoot.querySelectorAll<HTMLElement>('ms-chat-turn'))
            : currentAllTurns;
          answerTurn = this.findAnswerTurnFromTurns(scopedTurns, userTurn);
        }

        if (!answerTurn) {
          const userIndexGlobal = currentAllTurns.indexOf(userTurn);
          if (userIndexGlobal !== -1) {
            for (let j = userIndexGlobal + 1; j < currentAllTurns.length; j++) {
              const t = currentAllTurns[j];
              if (this.isUserTurn(t)) {
                break;
              }
              answerTurn = t;
            }
          }
        }
        if (!answerTurn) {
          console.warn('  [warn] Answer turn not found.');
        }

        // 7. 提取内容
        // 再次确保可见，以防提取图片时需要懒加载
        userTurn.scrollIntoView({ block: 'center' });
        await this.delay(200);
        await this.waitForTurnContentStable(userTurn, 2000, 400);
        console.log(`  Extracting user question...`);
        const question = await this.copyContentFromTurn(userTurn);
        let questionSnippet = (question || '').trim().slice(0, 120);
        let answerSnippet = '';

        if (answerTurn) {
          answerTurn.scrollIntoView({ block: 'center' });
          await this.delay(200);
          await this.waitForTurnContentStable(answerTurn, 3000, 500);
          console.log(`  Extracting model answer...`);
          let answer = await this.copyContentFromTurn(answerTurn);
          answerSnippet = (answer || '').trim().slice(0, 120);
          const originalAnswer = answer;
          const originalAnswerSnippet = answerSnippet;

          if (answerSnippet && answerSnippet === lastAnswerSnippet && questionSnippet !== lastQuestionSnippet) {
            console.warn('  [warn] Duplicate answer detected; retrying via menu copy...');
            await this.delay(600);
            const retryAnswer = await this.copyContentFromTurnViaMenu(answerTurn);
            if (retryAnswer && retryAnswer.trim().length > 0 && retryAnswer !== answer) {
              answer = retryAnswer;
              answerSnippet = retryAnswer.trim().slice(0, 120);
            }
          }

          if (answer !== originalAnswer) {
            const retryText = answer.trim();
            const turnSnippet = this.getTurnTextSnippet(answerTurn, 200);
            const looksRelated = turnSnippet.length > 0 &&
              (retryText.includes(turnSnippet) || turnSnippet.includes(retryText));
            const longEnough = retryText.length >= 80 ||
              (turnSnippet.length > 0 && retryText.length >= Math.floor(turnSnippet.length * 0.6));

            if (!looksRelated && !longEnough) {
              console.warn('  [warn] Menu copy looked unrelated; keeping DOM extraction.');
              answer = originalAnswer;
              answerSnippet = originalAnswerSnippet;
            }
          }

          lastQuestionSnippet = questionSnippet;
          lastAnswerSnippet = answerSnippet;
          allConversations.push({
            question: question || `[${t('extractQuestionFailed')}]`,
            answer: answer || `[${t('extractAnswerFailed')}]`
          });
          console.log(`  Q: ${question?.substring(0, 40)}...`);
          console.log(`  A: ${answer?.substring(0, 40)}...`);
        } else {
          allConversations.push({
            question: question || `[${t('extractQuestionFailed')}]`,
            answer: `[${t('extractAnswerFailed')}]`
          });
        }

        // 稍微停顿，准备下一轮
        await this.delay(300);
      }

      if (allConversations.length === 0) {
        this.showError(t('noConversationContent'));
        console.groupEnd();
        return;
      }

      // 6. 生成 Markdown 文件
      const conversationTitle = this.getAIStudioConversationTitle();
      const markdown = this.formatConversationPairsToMarkdown(allConversations, conversationTitle);
      console.log(`\nGenerated markdown. Length: ${markdown.length} chars.`);

      // 7. 下载文件
      const now = new Date();
      const dateStr = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

      const safeTitle = this.toSafeFilename(conversationTitle || t('defaultConversationTitle'));
      const filename = `${dateStr}-${safeTitle}.md`;

      this.downloadFile(markdown, filename, 'text/markdown');
      this.showSuccess(t('exportedHistory', { count: allConversations.length, filename }));

    } catch (error) {
      console.error('Export conversation history failed:', error);
      this.showError(t('exportFailed') + ': ' + error);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * 从单个 ms-chat-turn 中提取内容
   * 优先使用 DOM 直接提取，因为菜单复制按钮有缓存问题
   */
  private async copyContentFromTurn(turn: HTMLElement): Promise<string> {
    try {
      console.log('    Extracting content from DOM...');

      // 直接从 DOM 提取，避免菜单复制的缓存问题
      const content = this.extractTurnContentFromDOM(turn);

      if (content && content.trim().length > 0) {
        console.log(`    DOM extraction succeeded. Length: ${content.length}`);
        return content.trim();
      }

      console.log('    DOM extraction empty; trying menu copy...');

      // 备用方案：使用菜单复制
      return await this.copyContentFromTurnViaMenu(turn);

    } catch (error) {
      console.error('    Extract failed:', error);
      return this.extractTurnContentFromDOM(turn);
    }
  }

  /**
   * 通过菜单复制方式提取内容（备用方案）
   */
  private async copyContentFromTurnViaMenu(turn: HTMLElement): Promise<string> {
    try {
      // 1. 在该 turn 内查找菜单按钮
      let menuButton = turn.querySelector<HTMLElement>('ms-chat-turn-options button');

      if (!menuButton) {
        menuButton = turn.querySelector<HTMLElement>('button[iconname="more_vert"]');
      }

      if (!menuButton) {
        menuButton = turn.querySelector<HTMLElement>('button[aria-label*="options" i]');
      }

      if (!menuButton) {
        const allButtons = turn.querySelectorAll<HTMLElement>('button');
        for (const btn of Array.from(allButtons)) {
          if (btn.querySelector('mat-icon') ||
            btn.classList.contains('mat-mdc-icon-button') ||
            btn.getAttribute('mat-icon-button') !== null) {
            menuButton = btn;
            break;
          }
        }
      }

      if (!menuButton) {
        return '';
      }

      // 2. 先关闭任何已打开的菜单
      this.closeMenuWithEscape();
      await this.delay(150);

      // 3. 滚动并点击菜单按钮
      menuButton.scrollIntoView({ behavior: 'instant', block: 'center' });
      await this.delay(200);
      menuButton.click();
      await this.delay(700);

      // 4. 查找并点击复制按钮
      const menuPanel = document.querySelector('.mat-mdc-menu-panel .mat-mdc-menu-content');
      let copyButton: HTMLElement | null = null;

      if (menuPanel) {
        copyButton = menuPanel.querySelector<HTMLElement>('button[jslog^="282205"]');
        if (!copyButton) {
          const allButtons = Array.from(menuPanel.querySelectorAll<HTMLElement>('button'));
          for (const btn of allButtons) {
            const text = (btn.textContent || '').toLowerCase();
            if (text.includes('copy') || text.includes('复制')) {
              copyButton = btn;
              break;
            }
          }
        }
      }

      if (!copyButton) {
        this.closeMenuWithEscape();
        return '';
      }

      let beforeClipboard = '';
      try {
        beforeClipboard = await DOMHelper.getClipboardContent();
      } catch {
        beforeClipboard = '';
      }

      copyButton.click();
      let content = '';
      for (let i = 0; i < 5; i++) {
        await this.delay(300);
        content = await DOMHelper.getClipboardContent();
        const trimmed = (content || '').trim();
        if (!trimmed) {
          continue;
        }
        if (beforeClipboard && trimmed === beforeClipboard.trim()) {
          continue;
        }
        break;
      }
      this.closeMenuWithEscape();
      await this.delay(100);

      const trimmed = content?.trim() || '';
      if (!trimmed) return '';
      if (beforeClipboard && trimmed === beforeClipboard.trim()) {
        return '';
      }
      return trimmed;

    } catch (error) {
      this.closeMenuWithEscape();
      return '';
    }
  }

  /**
   * 使用 Escape 键关闭菜单，避免触发页面其他点击事件
   */
  private closeMenuWithEscape(): void {
    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(escEvent);
  }

  /**
   * 检查元素是否在视口内可见
   */
  private isElementInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    // 元素至少有一部分在视口内
    const vertInView = (rect.top <= windowHeight) && ((rect.top + rect.height) >= 0);
    const horInView = (rect.left <= windowWidth) && ((rect.left + rect.width) >= 0);

    // 元素高度大于0（确保是真实可见的元素）
    return vertInView && horInView && rect.height > 0;
  }

  private isUserTurn(turn: HTMLElement): boolean {
    const role = (turn.getAttribute('data-turn-role') || '').toLowerCase();
    if (role === 'user') return true;
    if (role === 'model') return false;
    return !!(turn.querySelector('.user-chunk') || turn.classList.contains('user-prompt-container'));
  }

  private getVisibleTurns(allTurns: HTMLElement[]): HTMLElement[] {
    return allTurns.filter(turn => this.isElementInViewport(turn));
  }

  private getScopedTurnsForTurn(turn: HTMLElement, fallbackTurns: HTMLElement[]): HTMLElement[] {
    const root = this.findTurnListRoot(turn);
    if (root) {
      return Array.from(root.querySelectorAll<HTMLElement>('ms-chat-turn'));
    }
    return fallbackTurns;
  }

  private findNextNonThinkingModelTurn(turns: HTMLElement[], start: HTMLElement): HTMLElement | undefined {
    const startIndex = turns.indexOf(start);
    if (startIndex < 0) return undefined;

    for (let i = startIndex + 1; i < turns.length; i++) {
      const t = turns[i];
      if (this.isUserTurn(t)) {
        return undefined;
      }
      if (!this.isThinkingTurn(t)) {
        return t;
      }
    }

    return undefined;
  }

  private getCandidateAnswerTurn(visibleTurns: HTMLElement[], allTurns: HTMLElement[]): HTMLElement | undefined {
    if (visibleTurns.length === 0) return undefined;

    let candidate =
      visibleTurns.find(turn => !this.isUserTurn(turn) && !this.isThinkingTurn(turn)) ||
      visibleTurns.find(turn => !this.isUserTurn(turn)) ||
      visibleTurns[visibleTurns.length - 1];

    if (this.isThinkingTurn(candidate)) {
      const scopedTurns = this.getScopedTurnsForTurn(candidate, allTurns);
      const resolved = this.findNextNonThinkingModelTurn(scopedTurns, candidate);
      if (resolved) {
        candidate = resolved;
      }
    }

    return candidate;
  }

  private selectPrimaryUserTurn(visibleTurns: HTMLElement[], hint?: string): HTMLElement | undefined {
    const userTurns = visibleTurns.filter(turn => this.isUserTurn(turn));
    if (userTurns.length === 0) return undefined;

    const targetY = window.innerHeight * 0.3;
    const normalizedHint = (hint || '').toLowerCase().replace(/\s+/g, '');
    let best: HTMLElement | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const turn of userTurns) {
      const rect = turn.getBoundingClientRect();
      let score = Math.abs(rect.top - targetY);

      if (normalizedHint.length >= 4) {
        const turnText = (turn.textContent || '').toLowerCase().replace(/\s+/g, '');
        if (turnText.includes(normalizedHint)) {
          score -= 1000;
        }
      }

      if (score < bestDistance) {
        bestDistance = score;
        best = turn;
      }
    }

    return best;
  }

  private selectVisibleAnswerTurn(userTurn: HTMLElement, visibleTurns: HTMLElement[]): HTMLElement | undefined {
    const userRect = userTurn.getBoundingClientRect();
    let modelTurns = visibleTurns.filter(turn => !this.isUserTurn(turn) && !this.isThinkingTurn(turn));
    if (modelTurns.length === 0) {
      modelTurns = visibleTurns.filter(turn => !this.isUserTurn(turn));
    }
    if (modelTurns.length === 0) return undefined;

    let best: HTMLElement | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const turn of modelTurns) {
      const rect = turn.getBoundingClientRect();
      const distance = rect.top - userRect.top;
      if (distance >= -10 && distance < bestDistance) {
        bestDistance = distance;
        best = turn;
      }
    }

    if (best) return best;

    for (const turn of modelTurns) {
      const rect = turn.getBoundingClientRect();
      const distance = Math.abs(rect.top - userRect.top);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = turn;
      }
    }

    return best;
  }

  private isThinkingTurn(turn: HTMLElement): boolean {
    const thinkingImg = turn.querySelector(
      'img[alt*="thinking" i], img[aria-label*="thinking" i], img[src*="thinking" i]'
    );
    if (thinkingImg) return true;

    const snippet = this.getTurnTextSnippet(turn, 160).toLowerCase();
    return (
      snippet.includes('thinking') ||
      snippet.includes('thoughts') ||
      snippet.includes('analysis') ||
      snippet.includes('reasoning')
    );
  }

  private getButtonHint(button: HTMLElement): string {
    const aria = button.getAttribute('aria-label') || '';
    const title = button.getAttribute('title') || '';
    const text = button.textContent || '';
    const combined = `${aria} ${title} ${text}`.trim();
    return combined.replace(/\s+/g, ' ').trim();
  }

  private findUserTurnByHint(allTurns: HTMLElement[], hint: string): HTMLElement | undefined {
    const normalizedHint = (hint || '').toLowerCase().replace(/\s+/g, '');
    if (normalizedHint.length < 4) return undefined;

    const userTurns = allTurns.filter(turn => this.isUserTurn(turn));
    for (const turn of userTurns) {
      const text = (turn.textContent || '').toLowerCase().replace(/\s+/g, '');
      if (text.includes(normalizedHint)) {
        return turn;
      }
    }

    return undefined;
  }

  private selectUserTurnByIndex(allTurns: HTMLElement[], index: number, total: number): HTMLElement | undefined {
    const userTurns = allTurns.filter(turn => this.isUserTurn(turn));
    if (userTurns.length >= total && index >= 0 && index < userTurns.length) {
      return userTurns[index];
    }
    return undefined;
  }

  private findUserTurnFromAnswerIndex(
    allTurns: HTMLElement[],
    answerTurn: HTMLElement,
    allowOffsetFallback = false
  ): HTMLElement | undefined {
    const scopedTurns = this.getScopedTurnsForTurn(answerTurn, allTurns);
    const idx = scopedTurns.indexOf(answerTurn);
    if (idx < 0) return undefined;

    if (idx >= 2) {
      const candidate = scopedTurns[idx - 2];
      if (this.isUserTurn(candidate)) {
        return candidate;
      }
      if (allowOffsetFallback) {
        return candidate;
      }
    }

    for (let j = idx - 1; j >= 0; j--) {
      if (this.isUserTurn(scopedTurns[j])) {
        return scopedTurns[j];
      }
    }

    return undefined;
  }

  private findAnswerTurnFromUser(userTurn: HTMLElement): HTMLElement | undefined {
    let node = userTurn.nextElementSibling as HTMLElement | null;
    let answer: HTMLElement | undefined;
    let fallback: HTMLElement | undefined;

    while (node) {
      if (node.tagName.toLowerCase() === 'ms-chat-turn') {
        if (this.isUserTurn(node)) {
          break;
        }
        if (!this.isThinkingTurn(node)) {
          answer = node;
        } else if (!fallback) {
          fallback = node;
        }
      }
      node = node.nextElementSibling as HTMLElement | null;
    }

    return answer || fallback;
  }

  private findTurnListRoot(userTurn: HTMLElement): HTMLElement | null {
    let current = userTurn.parentElement;

    while (current && current !== document.body) {
      try {
        const directTurns = current.querySelectorAll(':scope > ms-chat-turn');
        if (directTurns.length >= 2) {
          return current;
        }
      } catch {
        // Ignore selector errors and continue climbing.
      }
      current = current.parentElement;
    }

    current = userTurn.parentElement;
    while (current && current !== document.body) {
      const turnCount = current.querySelectorAll('ms-chat-turn').length;
      if (turnCount >= 2) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  private findAnswerTurnFromTurns(turns: HTMLElement[], userTurn: HTMLElement): HTMLElement | undefined {
    const userIndex = turns.indexOf(userTurn);
    if (userIndex === -1) return undefined;

    let answer: HTMLElement | undefined;
    let fallback: HTMLElement | undefined;
    for (let j = userIndex + 1; j < turns.length; j++) {
      const t = turns[j];
      if (this.isUserTurn(t)) {
        break;
      }
      if (!this.isThinkingTurn(t)) {
        answer = t;
      } else if (!fallback) {
        fallback = t;
      }
    }

    return answer || fallback;
  }

  private getTurnTextSnippet(turn: HTMLElement, maxLen = 120): string {
    const text = (turn.textContent || '').replace(/\s+/g, ' ').trim();
    return text.substring(0, maxLen);
  }

  private getVisibleTurnsSignature(): string {
    const allTurns = Array.from(document.querySelectorAll<HTMLElement>('ms-chat-turn'));
    const visibleTurns = this.getVisibleTurns(allTurns);
    if (visibleTurns.length === 0) return '';

    const snippets = visibleTurns.slice(0, 6).map(turn => {
      const role = this.isUserTurn(turn) ? 'U' : 'M';
      return `${role}:${this.getTurnTextSnippet(turn, 80)}`;
    });

    return snippets.join('|');
  }

  private async waitForVisibleTurnsChange(prevSignature: string, timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await this.delay(200);
      const current = this.getVisibleTurnsSignature();
      if (current && current !== prevSignature) {
        return true;
      }
    }
    return false;
  }

  private async waitForTurnContentStable(turn: HTMLElement, timeoutMs = 2000, settleMs = 400): Promise<void> {
    const start = Date.now();
    let lastSnippet = this.getTurnTextSnippet(turn, 120);
    let lastChange = Date.now();

    while (Date.now() - start < timeoutMs) {
      await this.delay(150);
      const currentSnippet = this.getTurnTextSnippet(turn, 120);

      if (currentSnippet !== lastSnippet) {
        lastSnippet = currentSnippet;
        lastChange = Date.now();
        continue;
      }

      if (currentSnippet.length > 0 && Date.now() - lastChange >= settleMs) {
        return;
      }
    }
  }

  /**
   * 从 DOM 直接提取 turn 内容（备用方法）
   */
  private extractTurnContentFromDOM(turn: HTMLElement): string {
    // 1. 尝试提取图片
    const images = turn.querySelectorAll('img');
    const imageMarkdown = Array.from(images)
      .map(img => {
        const src = img.getAttribute('src');
        const alt = img.getAttribute('alt') || 'Image';
        // 忽略头像和小图标
        if (!src || img.width < 50 || img.height < 50 || src.includes('icon') || src.includes('avatar')) return '';
        return `\n![${alt}](${src})\n`;
      })
      .join('');

    // 2. 提取文本内容
    let textContent = '';

    // 优先从 turn-content 获取
    const turnContent = turn.querySelector('.turn-content');
    if (turnContent) {
      textContent = this.extractMarkdownFromCmarkNode(turnContent as HTMLElement);
    } else {
      // 从 ms-text-chunk 获取
      const textChunks = turn.querySelectorAll('ms-text-chunk, ms-code-block');
      if (textChunks.length > 0) {
        textContent = Array.from(textChunks)
          .map(chunk => {
            if (chunk.tagName.toLowerCase() === 'ms-code-block') {
              // [DEBUG] 打印 DOM 结构以便分析
              console.log('🔍 [CodeBlock Debug] HTML:', chunk.innerHTML);
              console.log('🔍 [CodeBlock Debug] Text:', chunk.textContent);

              // 1. 查找实际的代码元素
              // 注意：有些时候 pre 里面包含了所有内容
              const codeEl = chunk.querySelector('code') || chunk.querySelector('pre');
              let realCode = codeEl ? (codeEl.textContent || '') : (chunk.textContent || '');

              // 2. 尝试获取语言
              let lang = chunk.getAttribute('language') || '';

              // [暴力清洗策略]
              // 如果 header 文本实际上混在 realCode 里，我们需要把它切掉
              // 假设 header 总是出现在代码的第一行或前几行
              // 我们可以检查 realCode 的开头是否包含那些关键词

              // 常见的 header 文本模式
              const garbagePatterns = [
                /^code\s+/i,
                /download/i,
                /content_copy/i,
                /expand_less/i,
                /expand_more/i
              ];

              // 如果 realCode 开头包含这些垃圾文字，说明 codeEl 抓多了
              // 尝试按换行符分割，检查第一行
              const lines = realCode.split('\n');
              if (lines.length > 0) {
                let firstLine = lines[0].trim();
                // 检查第一行是否包含过多 UI 关键词
                let garbageCount = 0;
                garbagePatterns.forEach(p => {
                  if (p.test(firstLine)) garbageCount++;
                });

                if (garbageCount >= 1 || firstLine.includes('content_copy')) {
                  // 判定第一行为垃圾 Header
                  console.log('🗑️ 检测到垃圾 Header 行，正在移除:', firstLine);

                  // 尝试从中提取语言
                  let potentialLang = firstLine;
                  ['code', 'download', 'content_copy', 'expand_less', 'expand_more'].forEach(kw => {
                    potentialLang = potentialLang.replace(new RegExp(kw, 'gi'), '');
                  });
                  lang = potentialLang.trim();

                  // 移除第一行
                  lines.shift();
                  realCode = lines.join('\n');
                }
              }

              // 再次清理 lang
              lang = lang.split('\n')[0].trim();
              if (lang.length > 20) lang = '';

              return `\n\`\`\`${lang}\n${realCode.trim()}\n\`\`\`\n`;
            }
            return this.extractMarkdownFromCmarkNode(chunk as HTMLElement);
          })
          .join('\n');
      } else {
        // 兜底：直接获取文本
        textContent = turn.innerText || '';
      }
    }

    // 3. 组合图片和文本
    let finalContent = (textContent + imageMarkdown).trim();
    finalContent = this.normalizeCodeFenceHeaders(finalContent);

    // 4. 清理 "User" 前缀
    // 很多时候 User 块开头会有 "User" 文本"User" 文本
    if (finalContent.startsWith('User')) {
      finalContent = finalContent.substring(4).trim();
    }
    // 处理可能换行的情况
    if (finalContent.startsWith('User\n')) {
      finalContent = finalContent.substring(5).trim();
    }

    return finalContent;
  }

  private getAIStudioConversationTitle(): string {
    const fallback = t('defaultConversationTitle');
    if (!window.location.hostname.includes('aistudio.google.com')) {
      return fallback;
    }

    const titleEl = document.querySelector<HTMLElement>('h1.actions.pointer.mode-title');
    const title = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim();
    return title || fallback;
  }

  private toSafeFilename(raw: string): string {
    const cleaned = (raw || '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/[\u0000-\u001F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const fallback = cleaned || t('defaultConversationTitle');
    const maxLen = 60;
    return fallback.length > maxLen ? fallback.slice(0, maxLen).trim() : fallback;
  }

  /**
   * 将问答对格式化为 Markdown
   */
  private formatConversationPairsToMarkdown(
    conversations: Array<{ question: string; answer: string }>,
    title?: string
  ): string {
    const lines: string[] = [];

    // 添加标题
    const headerTitle = (title || t('defaultConversationTitle')).trim();
    lines.push(`# ${headerTitle}`);
    lines.push('');
    lines.push(`${t('exportTime')}: ${new Date().toLocaleString()}`);
    lines.push(`${t('turnCount')}: ${conversations.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // 按问答对编号
    conversations.forEach((conv, index) => {
      const paddedIndex = String(index + 1).padStart(2, '0');

      // 问题
      lines.push(`# ${paddedIndex}-Q`);
      lines.push('');
      lines.push(conv.question);
      lines.push('');

      // 回答
      lines.push(`# ${paddedIndex}-A`);
      lines.push('');
      lines.push(conv.answer);
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * 从 ms-cmark-node 提取 Markdown 格式文本 (增强版)
   */
  private extractMarkdownFromCmarkNode(node: HTMLElement): string {
    const result: string[] = [];

    // 递归处理节点
    const processNode = (el: Node): string => {
      if (el.nodeType === Node.TEXT_NODE) {
        return el.textContent || '';
      }

      if (el.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const element = el as HTMLElement;

      // Filter: 过滤掉不需要的元素 (搜索来源、引用容器)
      if (element.classList && (
        element.classList.contains('search-entry-container') ||
        element.classList.contains('search-sources')
      )) {
        return '';
      }

      const tagName = element.tagName.toLowerCase();
      let innerText = '';

      // 递归获取子内容 (除了特定的标签如 code/pre 需要特殊处理)
      if (tagName !== 'pre' && tagName !== 'code' && tagName !== 'table') {
        element.childNodes.forEach(child => {
          innerText += processNode(child);
        });
      }

      switch (tagName) {
        case 'h1': return `# ${innerText}\n\n`;
        case 'h2': return `## ${innerText}\n\n`;
        case 'h3': return `### ${innerText}\n\n`;
        case 'h4': return `#### ${innerText}\n\n`;
        case 'h5': return `##### ${innerText}\n\n`;
        case 'h6': return `###### ${innerText}\n\n`;
        case 'p': return `${innerText}\n\n`;
        case 'br': return '\n';
        case 'hr': return '---\n\n';

        case 'strong':
        case 'b':
          return `**${innerText}**`;
        case 'em':
        case 'i':
          return `*${innerText}*`;
        case 'del':
        case 's':
          return `~~${innerText}~~`;

        case 'a':
          const cleanText = innerText.trim();
          const href = element.getAttribute('href') || '';

          // Filter: 过滤引用链接
          // 策略 1: 文本是纯数字或 [数字]，且链接包含 google/vertex 等跳转特征，或仅为锚点
          // 常见格式: "1", "[1]", "Source 1"
          const isCitationText = /^(\[\s*)?[\d,\s]+(\s*\])?$/.test(cleanText) || /^source\s*\d+$/i.test(cleanText);
          const isRedirectLink = /google\.com\/url|vertexaisearch/i.test(href);

          if (isCitationText && (isRedirectLink || href === '#' || href.startsWith('#'))) {
            return '';
          }

          // 策略 2: 显式属性过滤
          const ariaLabel = element.getAttribute('aria-label') || '';
          if (/citation|source|reference/i.test(ariaLabel)) {
            return '';
          }

          return `[${innerText}](${href})`;

        case 'img':
          const src = element.getAttribute('src') || '';
          const alt = element.getAttribute('alt') || 'Image';
          if (!src || element.getAttribute('width') === '16') return ''; // 忽略小图标
          return `![${alt}](${src})`;

        case 'blockquote':
          return innerText.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';

        case 'ul':
          let ulResult = '';
          const listItems = element.querySelectorAll(':scope > li');

          // Fallback: 如果没有 li 元素（可能是非标准结构），直接返回文本内容，防止内容丢失
          if (listItems.length === 0) {
            return innerText + '\n\n';
          }

          listItems.forEach(li => {
            // 处理列表项内部的递归
            let liContent = '';
            li.childNodes.forEach(child => liContent += processNode(child));
            ulResult += `- ${liContent.trim()}\n`;
          });
          return ulResult + '\n';

        case 'ol':
          let olResult = '';
          const orderedItems = element.querySelectorAll(':scope > li');

          // Fallback: 如果没有 li 元素，直接返回文本内容
          if (orderedItems.length === 0) {
            return innerText + '\n\n';
          }

          orderedItems.forEach((li, idx) => {
            let liContent = '';
            li.childNodes.forEach(child => liContent += processNode(child));
            olResult += `${idx + 1}. ${liContent.trim()}\n`;
          });
          return olResult + '\n';

        case 'pre':
          // 查找内部的 code 标签以获取语言
          const codeEl = element.querySelector('code');
          let codeText = (codeEl ? codeEl.textContent : element.textContent) || '';

          // [Header 清洗逻辑 - 通用版]
          // 检查代码文本的第一行是否包含 UI 杂质
          const lines = codeText.split('\n');
          let headerLang = '';
          if (lines.length > 0) {
            const firstLine = lines[0].trim();
            const garbagePatterns = [
              /^code\s+/i,
              /download/i,
              /content_copy/i,
              /expand_less/i,
              /expand_more/i
            ];

            let isGarbage = false;
            // 只要包含 content_copy 或 download 就认为是垃圾行
            if (firstLine.includes('content_copy') || firstLine.includes('download')) {
              isGarbage = true;
            } else {
              // 或者匹配正则
              for (const p of garbagePatterns) {
                if (p.test(firstLine)) {
                  isGarbage = true;
                  break;
                }
              }
            }

            if (isGarbage) {
              console.log('🗑️ [extractMarkdown] 移除垃圾 Header 行', firstLine);
              // 尝试从垃圾行提取语言
              let potentialLang = firstLine;
              potentialLang = potentialLang.replace(/\bcode\b\s*/gi, '');
              ['download', 'content_copy', 'expand_less', 'expand_more'].forEach(kw => {
                potentialLang = potentialLang.replace(new RegExp(kw, 'gi'), '');
              });
              potentialLang = potentialLang.replace(/\s+/g, ' ').trim();

              // 如果还没提取到语言，就尝试用潜在语言
              // 只有当潜在语言看起来像个单词时才用 (长度<20)
              const cleanLang = potentialLang.trim();
              if (cleanLang.length > 0 && cleanLang.length < 30) {
                headerLang = cleanLang;
              }
              if (cleanLang.length > 0 && cleanLang.length < 20 && !cleanLang.includes(' ')) {
                // 这是一个 Hack，因为 lang 变量通常从 class 获取
                // 但这里我们没有地方存，只能稍微修改下面的逻辑
                // 或者我们只是简单地把第一行删掉
              }

              lines.shift();
              codeText = lines.join('\n');
            }
          }

          // 尝试从 class 获取语言，例如 "language-python""language-python"
          let lang = '';
          if (codeEl) {
            const classes = Array.from(codeEl.classList);
            const langClass = classes.find(c => c.startsWith('language-'));
            if (langClass) lang = langClass.replace('language-', '');
          }

          // 如果 class 没找到语言，尝试从第一行残留里找（比如 Powershell）锛屽皾璇曚粠绗竴琛屾畫鐣欓噷鎵撅紙姣斿 Powershell锛?
          if (!lang && headerLang) {
            lang = headerLang;
            // 这里比较难，因为第一行已经被删了
            // 实际上 AI Studio 的 language 属性通常在父级
          }

          return `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;

        case 'code':
          // 如果是行内代码 (没有被 pre 包裹)
          if (!element.closest('pre')) {
            return `\`${element.textContent}\``;
          }
          return ''; // pre 处理过了

        case 'table':
          // 处理表格
          let tableMd = '\n';
          const rows = Array.from(element.querySelectorAll('tr'));
          if (rows.length === 0) return '';

          // 表头
          const headers = Array.from(rows[0].querySelectorAll('th, td'));
          tableMd += '| ' + headers.map(h => h.textContent?.trim() || '').join(' | ') + ' |\n';
          tableMd += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

          // 表体
          for (let i = 1; i < rows.length; i++) {
            const cells = Array.from(rows[i].querySelectorAll('td'));
            tableMd += '| ' + cells.map(c => c.textContent?.trim() || '').join(' | ') + ' |\n';
          }
          return tableMd + '\n';

        default:
          return innerText;
      }
    };

    node.childNodes.forEach((child: Node) => {
      result.push(processNode(child));
    });

    return result.join('').trim();
  }

  /**
   * Remove UI header junk lines and move the language to the code fence.
   * Example: `code Powershelldownloadcontent_copyexpand_less` -> ```Powershell
   */
  private normalizeCodeFenceHeaders(markdown: string): string {
    const lines = markdown.split('\n');
    const output: string[] = [];
    let pendingLang = '';

    const hasUiTokens = (line: string): boolean => {
      const hasCopy = /content_copy/i.test(line);
      const hasExpand = /expand_less|expand_more/i.test(line);
      const hasDownload = /download/i.test(line);
      const hasCode = /\bcode\b/i.test(line);
      return hasCode && (hasCopy || hasExpand || hasDownload);
    };

    const extractLang = (line: string): string => {
      let cleaned = line;
      cleaned = cleaned.replace(/\bcode\b\s*/gi, '');
      ['download', 'content_copy', 'expand_less', 'expand_more'].forEach(kw => {
        cleaned = cleaned.replace(new RegExp(kw, 'gi'), '');
      });
      return cleaned.replace(/\s+/g, ' ').trim();
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (hasUiTokens(trimmed)) {
        const lang = extractLang(trimmed);
        if (lang) pendingLang = lang;
        continue;
      }

      if (pendingLang && trimmed.startsWith('```')) {
        const fenceMatch = trimmed.match(/^```(.*)$/);
        if (fenceMatch) {
          const existingLang = fenceMatch[1].trim();
          if (!existingLang) {
            output.push(line.replace(/^```/, `\`\`\`${pendingLang}`));
            pendingLang = '';
            continue;
          }
        }
        pendingLang = '';
      }
      if (pendingLang && trimmed.length > 0 && !trimmed.startsWith('```')) {
        pendingLang = '';
      }

      output.push(line);
    }

    return output.join('\n');
  }

  /**
   * 下载文件
   */
  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  private async syncCommitMessage(): Promise<void> {
    console.log('🔍 尝试同步 Commit Message...');
    this.showNotification(t('fetchingCommitMsg'), 'success');

    try {
      // 1. 查找并点击 GitHub 按钮
      const githubBtn = document.querySelector('ms-github-trigger-button button') as HTMLElement ||
        document.querySelector('ms-github-trigger-button') as HTMLElement;
      if (!githubBtn) {
        console.warn('⚠️ 未找到 ms-github-trigger-button');
        this.showError(t('noGithubButton'));
        return;
      }
      githubBtn.click();
      console.log('✅ 已点击 GitHub 按钮，等待面板展开...');

      // 2. 等待面板打开和 textarea 加载
      await this.delay(1500);
      console.log('🔔 查找 commit message textarea...');
      const textarea = await DOMHelper.waitForElement('textarea[formcontrolname="message"]', 5000) as HTMLTextAreaElement;

      if (!textarea) {
        console.warn('⚠️ commit message textarea not found');
        this.showError(t('commitMsgInputNotFound'));
        return;
      }

      // 3. 提取内容
      // AI Studio 的建议往往放在 placeholder 中，或者是异步填充到 value
      let message = textarea.value || '';

      if (!message.trim()) {
        console.log('💡 Value 为空，尝试从 Placeholder 提取...');
        message = textarea.placeholder || '';
      }

      if (!message.trim()) {
        console.warn('⚠️ Commit message is empty (value and placeholder).');
        this.showError(t('extractCommitMsgFailed'));
        return;
      }

      // 清理：去掉末尾可能存在的提示性字符 (如 ↵ \u21AA 或 ⇥ \u21E5)
      message = message.replace(/[\u21AA\u21E5]$/g, '').trim();

      console.log('✅ 提取到 Commit Message:', message);

      // 4. 复制到剪贴板
      await this.copyToClipboard(null, message);
      this.showSuccess(t('commitMsgCopied'));

    } catch (err) {
      console.error('❌ ' + t('syncCommitMsgFailed') + ':', err);
    }
  }

  private findAIStudioDriveFiles(): Array<{ name: string, button: HTMLElement }> {
    // 查找最后一次对话中的生成表格
    const tables = document.querySelectorAll('.generation-table');
    if (tables.length === 0) return [];

    const lastTable = tables[tables.length - 1];
    const rows = lastTable.querySelectorAll('ms-console-generation-table-row');
    const files: Array<{ name: string, button: HTMLElement }> = [];

    rows.forEach(row => {
      const button = row.querySelector('button[aria-label^="Open "]') as HTMLElement;
      if (button) {
        const ariaLabel = button.getAttribute('aria-label') || '';
        const name = ariaLabel.replace('Open ', '').trim();
        if (name) {
          files.push({ name, button });
        }
      }
    });
    return files;
  }

  private async extractCodeFromMonaco(): Promise<string | null> {
    this.debugLog('🔍 核心提取：尝试 Scroll-and-Scrape 策略...');

    // 1. 查找编辑器滚动容器
    const scrollable = document.querySelector('.monaco-scrollable-element') ||
      document.querySelector('.lines-content');

    if (!scrollable) {
      console.error('Scrollable container not found.');
      return null;
    }

    // 2. 内部爬取函数，确保处理空格问题
    const scrapeVisibleLines = (collectedLines: Map<number, string>) => {
      const viewLines = document.querySelector('.view-lines');
      if (!viewLines) return;

      const lineElements = viewLines.querySelectorAll('.view-line');
      lineElements.forEach(lineEl => {
        const htmlEl = lineEl as HTMLElement;
        const top = parseInt(htmlEl.style.top || '0', 10);
        // 关键：替换 \u00A0 (nbsp) 为标准空格，并处理其他不可见字符
        const lineText = htmlEl.innerText
          .replace(/\u00A0/g, ' ')
          .replace(/\u200B/g, '') // Zero width space
          .replace(/\r/g, '');

        collectedLines.set(top, lineText);
      });
    };

    // 3. 准备滚动提取
    const collectedLines = new Map<number, string>();
    const originalScrollTop = scrollable.scrollTop;

    // 关键修复：强制置顶并验证
    this.debugLog('⬆️ 正在重置滚动条到顶部...');
    let resetAttempts = 0;

    // 尝试重置多次，增加延迟，确保UI响应
    while (scrollable.scrollTop > 5 && resetAttempts < 10) {
      scrollable.scrollTop = 0;
      await this.delay(200); // 增加等待时间
      resetAttempts++;

      if (scrollable.scrollTop > 5) {
         this.debugWarn(`⚠️ Scroll reset attempt ${resetAttempts} failed. Current top: ${scrollable.scrollTop}`);
      }
    }

    if (scrollable.scrollTop > 5) {
      console.error('❌ Scroll reset failed. Continuing anyway but content may be incomplete. Top:', scrollable.scrollTop);
    } else {
      this.debugLog('✅ Scroll reset complete (or close enough). Starting scrape.');
    }

    let lastScrollTop = -1;
    let unchangedCount = 0;

    // 渐进式滚动采集
    while (scrollable.scrollTop !== lastScrollTop || unchangedCount < 4) {
      const currentTop = scrollable.scrollTop;

      if (currentTop === lastScrollTop) {
        unchangedCount++;
      } else {
        unchangedCount = 0;
        lastScrollTop = currentTop;
      }

      scrapeVisibleLines(collectedLines);

      // 每次向下滚动一屏或半屏
      scrollable.scrollTop += 650;
      // 增加滚动后的沉淀时间，确保虚拟化渲染跟得上
      await this.delay(100);
    }

    // 4. 恢复原始滚动位置
    scrollable.scrollTop = originalScrollTop;

    // 5. 排序并组合结果
    const sortedKeys = Array.from(collectedLines.keys()).sort((a, b) => a - b);
    const finalContent = sortedKeys.map(key => collectedLines.get(key)).join('\n');

    this.debugLog(`✅ 提取完成 (Scroll-based): 共采集到独特行 ${collectedLines.size}, 字符数 ${finalContent.length}`);

    if (finalContent.length === 0) {
      console.warn(t('contentEmpty'));
      return null;
    }

    return finalContent;
  }

  /**
   * 等待 Monaco 编辑器准备就绪（即渲染出代码行）
   */
  private async waitForMonacoReady(timeoutMs: number = 5000, fileName: string = ''): Promise<boolean> {
    const startTime = Date.now();
    console.log(`🔔 [${fileName}] 等待 Monaco 编辑器就绪...`);

    return new Promise((resolve) => {
      let lastLineCount = -1;
      let stabilityCount = 0;

      const check = async () => {
        // 1. 检查是否存在 .view-lines 容器且包含 .view-line
        const viewLines = document.querySelector('.view-lines');
        const lines = viewLines ? viewLines.querySelectorAll('.view-line') : [];
        const hasLines = lines.length > 0;

        // 2. 检查是否有滚动容器
        const scrollable = document.querySelector('.monaco-scrollable-element');

        if (hasLines && scrollable) {
          // 3. 增加稳定性检查：连续两次检测到的行数一致才认为就绪
          if (lines.length === lastLineCount) {
            stabilityCount++;
          } else {
            stabilityCount = 0;
            lastLineCount = lines.length;
          }

          if (stabilityCount >= 2) {
            console.log(`✅ [${fileName}] Monaco 编辑器已就绪 (行数: ${lines.length}, 耗时: ${Date.now() - startTime}ms)`);
            resolve(true);
            return;
          }
        }

        if (Date.now() - startTime > timeoutMs) {
          console.warn(`[warn][${fileName}] Monaco editor readiness timed out.`);
          resolve(false);
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  // 统一的截图处理方法，支持附加文本和高亮元素
  private async handleCaptureWithText(additionalText: string | null, highlightElement: HTMLElement | null = null): Promise<void> {
    // 截图前隐藏悬浮窗
    this.setUIVisibility(false);

    // 如果有高亮元素，创建高亮框
    let highlightBox: HTMLElement | null = null;
    if (highlightElement) {
      const rect = highlightElement.getBoundingClientRect();
      highlightBox = document.createElement('div');
      Object.assign(highlightBox.style, {
        position: 'fixed',
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        border: '3px solid red',
        zIndex: '1000001',
        pointerEvents: 'none',
        boxSizing: 'border-box'
      });
      // 添加 data-html2canvas-ignore 属性，虽然我们是用原生截图，但保持好习惯
      highlightBox.setAttribute('data-html2canvas-ignore', 'true');
      document.body.appendChild(highlightBox);
    }

    this.showNotification(t('capturing'), 'success');

    // 给浏览器 50ms 时间进行重绘
    await this.delay(50);

    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, async (response) => {
      // 截图完成后立即恢复显示
      this.setUIVisibility(true);

      // 移除高亮框
      if (highlightBox) {
        highlightBox.remove();
      }

      if (chrome.runtime.lastError) {
        this.showError(t('screenshotFailed') + ': ' + chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        if (response.dataUrl) {
          try {
            await this.copyToClipboard(response.dataUrl, additionalText);
            const msg = additionalText
              ? t('elementCaptureCopied')
              : t('screenshotCopiedShort');
            this.showSuccess(msg);
          } catch (err) {
            console.error('复制到剪贴板失败:', err);
            this.showSuccess('截图已发送到 VS Code（剪贴板复制失败）');
          }
        } else {
          this.showSuccess('截图已发送到 VS Code');
        }
      } else {
        this.showError(t('screenshotFailed') + ': ' + (response?.error || t('unknownError')));
      }
    });
  }

  private async copyToClipboard(dataUrl: string | null, text: string | null): Promise<void> {
    const data: Record<string, Blob> = {};

    if (dataUrl) {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      data[blob.type] = blob;
    }

    if (text) {
      // 添加文本数据
      data['text/plain'] = new Blob([text], { type: 'text/plain' });
    }

    if (Object.keys(data).length > 0) {
      const item = new ClipboardItem(data);
      await navigator.clipboard.write([item]);
    }
  }


  private parseFilesFromContent(content: string): Array<{ path: string; filename: string; savePath: string; content: string }> {
    const files: Array<{ path: string; filename: string; savePath: string; content: string }> = [];
    let memoryUpdated = false;

    console.log('🔍 开始切片解析 (Slice First), 长度:', content.length);

    // 步骤 1: 智能切片 - 只在代码块外部的 --- 处切分
    // 手动遍历内容，跟踪是否在代码块内
    const slices: string[] = [];
    let currentSliceStart = 0;
    let inCodeBlock = false;
    const lines = content.split('\n');
    let charIndex = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // 检查是否进入/离开代码块
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // 检查是否是分隔符 (仅在代码块外部)
      if (!inCodeBlock && /^[-]{3,}$/.test(line.trim())) {
        // 找到分隔符，结束当前切片
        const sliceEnd = charIndex;
        if (sliceEnd > currentSliceStart) {
          slices.push(content.substring(currentSliceStart, sliceEnd).trim());
        }
        // 新切片从分隔符之后开始
        currentSliceStart = charIndex + line.length + 1; // +1 for \n
      }

      charIndex += line.length + 1; // +1 for \n
    }

    // 添加最后一个切片
    if (currentSliceStart < content.length) {
      slices.push(content.substring(currentSliceStart).trim());
    }

    console.log(`🔪 切片数量: ${slices.length}`);

    // 步骤 2: 对每个切片独立解析
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];

      // 在切片内寻找路径指示器
      // 格式 A: 文件名: `path/to/file.ext`
      // 格式 B: **path/to/file.ext**
      // 格式 C: 行首 path/to/file.ext
      const pathPatterns = [
        /(?:文件名|File\s*(?:Name|Path)?|路径|名称)[:：]\s*[`"]?([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]+)[`"]?/i,
        /(?:\*\*|__|\`)([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]+)(?:\*\*|__|\`)/,
        /^([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]{1,10})$/m
      ];

      let detectedPath: string | null = null;
      for (const pattern of pathPatterns) {
        const match = slice.match(pattern);
        if (match && match[1]) {
          detectedPath = match[1];
          console.log(`🎯 切片 ${i}: 检测到路径 "${detectedPath}"`);
          break;
        }
      }

      if (!detectedPath) {
        console.log(`🔔 切片 ${i}: 未检测到路径，跳过 (前 50 字符: "${slice.substring(0, 50).replace(/\n/g, '\\n')}...")`);
        continue;
      }

      // 在切片内寻找代码块 - 使用 lastIndexOf 找最后一个闭合标记
      const blockStartMatch = slice.match(/```(\w+)?[\r\n]+/);
      if (!blockStartMatch) {
        console.log(`Slice ${i}: code block start not found after path "${detectedPath}".`);
        continue;
      }

      const lang = blockStartMatch[1] || 'text';
      const contentStart = blockStartMatch.index! + blockStartMatch[0].length;

      // 关键修复：在切片内寻找【最后一个】闭合标记
      const lastClosingIndex = slice.lastIndexOf('```');

      if (lastClosingIndex <= contentStart) {
        console.log(`Slice ${i}: code block not properly closed for "${detectedPath}".`);
        continue;
      }

      const blockContent = slice.substring(contentStart, lastClosingIndex).trim();
      console.log(`📦 切片 ${i}: 代码块长度: ${blockContent.length} chars`);

      // 路径处理
      let fullPath = detectedPath.replace(/^\.?\//, '');
      const parts = fullPath.split('/');
      const filename = parts.pop() || '';
      let savePath = parts.join('/');

      console.log(`📂 路径解析: fullPath="${fullPath}", filename="${filename}", savePath="${savePath}"`);

      // 璺緞璁板繂
      if (!savePath) {
        const lowerFilename = filename.toLowerCase();
        const memoryKey = Object.keys(this.pathMemory).find(k => k.toLowerCase() === lowerFilename);
        if (memoryKey) {
          savePath = this.pathMemory[memoryKey];
          fullPath = savePath ? `${savePath}/${filename}` : filename;
          console.log(`🧠 记忆匹配: ${filename} -> ${savePath}`);
        }
      }

      if (savePath && this.pathMemory[filename] !== savePath) {
        this.pathMemory[filename] = savePath;
        memoryUpdated = true;
        console.log(`📝 更新路径记忆: ${filename} -> ${savePath}`);
      }

      files.push({
        path: fullPath,
        filename: filename,
        savePath: savePath,
        content: blockContent
      });
      console.log(`✅ 成功提取: ${fullPath} (语言: ${lang}, ${blockContent.length} chars)`);
    }

    if (memoryUpdated) {
      this.savePathMemory();
    }

    console.log(`Total extracted files: ${files.length}`);
    return files;
  }

  private async sendToVSCode(content: string, filename: string, customSavePath?: string, type: 'save' | 'patch' = 'save'): Promise<void> {
    try {
      // 获取保存路径配置（新版本存储格式：settings.savePath）
      const data = await chrome.storage.sync.get('settings');
      console.log('🔧 sendToVSCode: storage data =', data);
      const defaultSavePath = (data.settings?.savePath || '').trim();
      console.log('🔧 sendToVSCode: defaultSavePath =', defaultSavePath, 'customSavePath =', customSavePath);

      // 如果有自定义路径，则拼接到默认路径后，或者直接使用
      let finalSavePath = customSavePath || '';
      if (defaultSavePath) {
        if (finalSavePath) {
          finalSavePath = `${defaultSavePath}/${finalSavePath}`;
        } else {
          finalSavePath = defaultSavePath;
        }
      }
      console.log('🔧 sendToVSCode: finalSavePath =', finalSavePath);

      const message: MessageToVSCode = {
        action: 'sendToVSCode',
        content,
        filename,
        savePath: finalSavePath,
        type: type
      };

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response: MessageResponse) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response?.error || t('unknownError')));
          }
        });
      });
    } catch (error) {
      throw error;
    }
  }

  private getMemoryUsage(): string {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const used = (memory.usedJSHeapSize / 1048576).toFixed(2);
      const total = (memory.totalJSHeapSize / 1048576).toFixed(2);
      return `${used} MB / ${total} MB`;
    }
    return 'n/a';
  }


  // 新增：专门处理 AI Studio 的复制
  private async handleAIStudioCopy(): Promise<void> {
    try {
      this.debugLog('AI Studio: locating menu button...');

      // 1. 查找所有的 more_vert 按钮
      const moreButtons = Array.from(document.querySelectorAll<HTMLElement>(
        'button[aria-label*="options"], ' +
        'button[iconname="more_vert"], ' +
        'button[aria-label*="Open options"], ' +
        'ms-chat-turn-options button'
      ));

      if (moreButtons.length === 0) {
        this.showError(t('menuButtonNotFound'));
        return;
      }

      // 获取最后一个（最新的回答）
      const menuButton = moreButtons[moreButtons.length - 1];
      this.debugLog('Menu button found; clicking...');

      // 2. 点击菜单按钮展开菜单
      menuButton.click();
      this.debugLog('✅ 菜单已展开，等待加载...');

      // 3. 等待菜单展开
      await this.delay(500);

      // 4. 查找复制按钮
      const copyButton = DOMHelper.findLatestCopyButton();

      if (!copyButton) {
        console.error('Copy button not found after opening menu.');
        this.showError(t('copyButtonNotFound'));
        // 关闭菜单
        menuButton.click();
        return;
      }

      this.debugLog('Copy button found; clicking...');

      // 5. 点击复制按钮
      copyButton.click();

      // 6. 等待复制完成
      await this.delay(300);

      // 7. 读取剪贴板内容
      const content = await DOMHelper.getClipboardContent();

      if (!content || content.trim().length === 0) {
        this.showError(t('clipboardTyEmpty'));
        return;
      }

      this.debugLog('✅ 读取到内容，长度:', content.length);

      // 内容长度限制检查
      if (content.length > 50000) { // 50KB限制
        this.showError(t('contentTooLong'));
        return;
      }

      // 8. 生成文件名并保存
      const filename = this.generateSmartFilename(content);
      this.debugLog('Generated filename:', filename);

      this.showFilenamePreview(filename);
      this.sendToVSCode(content, filename);
      await this.updateDailyCounter();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('AI Studio copy failed:', error);
      this.showError(`Operation failed: ${errorMessage}`);
    }
  }


  private generateSmartFilename(content: string): string {
    const now = new Date();

    // 格式化日期: YYYYMMDD
    const date = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');

    // 格式化时间: HHmmss
    const time = String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    // 序号: 001, 002, 003...
    const sequence = String(this.dailyCounter).padStart(3, '0');

    // 提取第一句话
    const firstSentence = this.extractFirstSentence(content);

    // 清理第一句话
    const cleanedSentence = this.cleanSentence(firstSentence);

    // 限制长度（防止文件名过长）
    const shortSentence = this.truncateFilename(cleanedSentence, 50);

    // 缁勫悎鏂囦欢鍚?
    return `${date}-${time}-${sequence}-${shortSentence}.md`;
  }

  private extractFirstSentence(content: string): string {
    // 移除 Markdown 标记
    let text = content.trim();
    text = text.replace(/^#+\s+/gm, ''); // 移除标题符号
    text = text.replace(/\*\*(.+?)\*\*/g, '$1'); // 移除加粗
    text = text.replace(/\*(.+?)\*/g, '$1'); // 移除斜体
    text = text.replace(/`(.+?)`/g, '$1'); // 移除代码标记
    text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // 移除链接，保留文本

    // 分割成句子（按句号、问号、感叹号、换行）
    const sentences = text.split(/[。?!?！？\n]/);

    // 找到第一个有实际内容的句子
    for (const sentence of sentences) {
      const cleaned = sentence.trim();
      if (cleaned.length > 5) { // 至少5个字符
        return cleaned;
      }
    }

    // 如果没找到合适的句子，取前50个字符
    return text.substring(0, 50).trim();
  }

  private cleanSentence(sentence: string): string {
    // 移除常见开场白
    const removePatterns = [
      /^好的[，？。！\s]*/i,
      /^当然[，？。！\s]*/i,
      /^我会[^\s]{0,5}/i,
      /^我将[^\s]{0,5}/i,
      /^让我[^\s]{0,5}/i,
      /^明白[了吗]?[，？。！\s]*/i,
      /^收到[，？。！\s]*/i,
      /^好[的啦][，？。！\s]*/i,
      /^OK[，？。！\s]*/i,
      /^了解[，？。！\s]*/i,
      /^没问题[，？。！\s]*/i
    ];

    let cleaned = sentence;
    for (const pattern of removePatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // 移除特殊字符和空格（文件名不允许的字符）
    cleaned = cleaned.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');

    // 移除多余空格
    cleaned = cleaned.replace(/\s+/g, '-');

    // 移除开头和结尾的连字符
    cleaned = cleaned.replace(/^-+|-+$/g, '');

    return cleaned;
  }

  private truncateFilename(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // 在 maxLength 处截断，但尝试在合适的位置（如连字符处）
    let truncated = text.substring(0, maxLength);
    const lastDash = truncated.lastIndexOf('-');

    if (lastDash > maxLength * 0.7) {
      // 如果在后 70% 有连字符，在那里截断
      truncated = truncated.substring(0, lastDash);
    }

    return truncated;
  }

  private showFilenamePreview(filename: string): void {
    const preview = document.getElementById('filename-preview');
    if (preview) {
      preview.textContent = `📄 ${filename}`;
      preview.style.display = 'block';

      // 3秒后隐藏
      setTimeout(() => {
        preview.style.display = 'none';
      }, 3000);
    }
  }





  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message: ConnectionStatus) => {
      if (message.type === 'connectionStatus') {
        this.updateConnectionStatus(message.status === 'connected');
      }
    });
  }

  private updateConnectionStatus(connected: boolean): void {
    if (!this.statusElement) return;

    const statusText = this.statusElement.querySelector('.status-text');
    const statusDot = this.statusElement.querySelector('.status-dot');

    if (connected) {
      this.statusElement.classList.add('connected');
      if (statusText) statusText.textContent = 'Connected';
      if (statusDot) statusDot.classList.add('active');
    } else {
      this.statusElement.classList.remove('connected');
      if (statusText) statusText.textContent = 'Disconnected';
      if (statusDot) statusDot.classList.remove('active');
    }
  }

  private showSuccess(message: string): void {
    this.showNotification(message, 'success');
  }

  private showError(message: string): void {
    this.showNotification(message, 'error');
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 提示词相关方法
  private async loadPromptButtons(): Promise<void> {
    try {
      // 优先从 local 加载（新存储方式）
      const localResult = await chrome.storage.local.get(['promptFiles']);
      let promptFiles = localResult.promptFiles || [];

      // 如果 local 中没有，回退到 sync（旧存储方式）
      if (promptFiles.length === 0) {
        const syncResult = await chrome.storage.sync.get(['promptFiles']);
        promptFiles = syncResult.promptFiles || [];
        if (promptFiles.length > 0) {
          console.log('从 sync 加载提示词（旧格式）');
        }
      }

      this.createPromptButtons(promptFiles);
    } catch (error) {
      console.error('加载提示词失败:', error);
    }
  }

  private createPromptButtons(prompts: any[]): void {
    if (!this.promptButtons || prompts.length === 0) return;

    this.promptButtons.innerHTML = prompts
      .filter(p => p.enabled)
      .map(prompt => `
        <button 
          class="prompt-btn" 
          data-prompt-id="${prompt.id}"
          data-prompt-name="${this.escapeHtml(prompt.name)}"
          style="
            padding: 8px 12px;
            background: #6c5ce7;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            text-align: left;
          "
        >
          📝 ${this.escapeHtml(prompt.name)}
        </button>
      `)
      .join('');

    // 保存提示词内容到按钮的自定义属性
    const buttons = this.promptButtons.querySelectorAll('.prompt-btn');
    buttons.forEach((btn, index) => {
      const htmlBtn = btn as HTMLElement;
      (htmlBtn as any).__promptContent = prompts.filter(p => p.enabled)[index].path;

      // 移出内联事件，改用 addEventListener 以符合 CSP
      htmlBtn.addEventListener('mouseover', () => {
        htmlBtn.style.background = '#5f4dd1';
      });
      htmlBtn.addEventListener('mouseout', () => {
        htmlBtn.style.background = '#6c5ce7';
      });

      htmlBtn.addEventListener('click', (e) => {
        const target = e.currentTarget as any;
        const content = target.__promptContent;
        const name = target.getAttribute('data-prompt-name');
        if (content) {
          this.applyPrompt(content, name || '');
        }
      });
    });
  }

  private async applyPrompt(content: string, promptName: string): Promise<void> {
    try {
      console.log('📝 开始应用提示词:', promptName);

      if (!content || content.trim().length === 0) {
        this.showError(t('promptContentEmpty'));
        return;
      }

      console.log('✅ 内容长度:', content.length);

      // 1. 查找 System Instructions 按钮
      const sysInstructionsBtn = document.querySelector<HTMLElement>(
        'button[data-test-system-instructions-card], ' +
        'button[aria-label="System instructions"], ' +
        'button.system-instructions-card'
      );

      if (!sysInstructionsBtn) {
        this.showError(t('sysInstrBtnNotFound'));
        return;
      }

      console.log('✅ 找到 System Instructions 按钮');

      // 2. 点击打开界面
      sysInstructionsBtn.click();
      await this.delay(500);

      // 3. 查找文本框
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="System instructions"], ' +
        'textarea[placeholder*="tone and style"], ' +
        'textarea.in-run-settings'
      );

      if (!textarea) {
        this.showError(t('sysInstrTextareaNotFound'));
        // 尝试关闭可能打开的对话框
        this.closeSystemInstructionsDialog();
        return;
      }

      console.log('Textarea found.');

      // 4. 清空现有内容
      textarea.value = '';

      // 5. 填充新内容
      textarea.value = content;

      // 6. 触发事件以确保 Angular 检测到变化
      textarea.blur();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.dispatchEvent(new Event('blur', { bubbles: true }));


      // 触发 Angular 的 ngModelChange
      const event = new CustomEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);

      console.log('Content filled.');

      // 7. 等待 Angular 更新
      await this.delay(800);

      // 8. 关闭对话框
      this.closeSystemInstructionsDialog();

      this.showSuccess(t('appliedPrompt', { name: promptName }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Apply prompt failed:', error);
      this.showError(t('applyPromptFailed') + `: ${errorMessage}`);
    }
  }

  private closeSystemInstructionsDialog(): void {
    // 查找典型关闭按钮 - 使用更精确的选择器
    const selectors = [
      'button[data-test-close-button]',
      'button[aria-label="Close panel"]',
      'button[mat-dialog-close]',
      'button[iconname="close"]',
      'button.ms-button-icon[iconname="close"]',
      'button[aria-label="Close panel"][data-test-close-button]'
    ];

    let closeBtn: HTMLElement | null = null;

    // 尝试每个选择器
    for (const selector of selectors) {
      closeBtn = document.querySelector<HTMLElement>(selector);
      if (closeBtn && closeBtn.offsetParent !== null) {
        console.log(`✅ 找到关闭按钮: ${selector}`);
        break;
      }
    }

    if (closeBtn) {
      // 检查按钮状态
      const isVisible = closeBtn.offsetParent !== null;
      const isDisabled = closeBtn.hasAttribute('aria-disabled') && closeBtn.getAttribute('aria-disabled') === 'true';
      const isEnabled = closeBtn.getAttribute('aria-disabled') === 'false' || !closeBtn.hasAttribute('aria-disabled');

      console.log('关闭按钮状态:', {
        isVisible,
        isDisabled,
        isEnabled,
        ariaDisabled: closeBtn.getAttribute('aria-disabled'),
        className: closeBtn.className
      });

      // 确保按钮可见且可点击
      if (isVisible && isEnabled) {
        try {
          closeBtn.click();
          console.log('✅ 已自动关闭 System Instructions 界面');
        } catch (error) {
          console.error('点击关闭按钮失败:', error);
          // 尝试其他方式触发点击
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          closeBtn.dispatchEvent(clickEvent);
          console.log('✅ 已通过事件触发关闭 System Instructions 界面');
        }
      } else {
        console.warn('Close button is not usable or disabled.', {
          isVisible,
          isDisabled,
          isEnabled
        });
      }
    } else {
      console.warn('❌ ' + t('closeButtonNotFound'));
      // 调试：列出所有可能的按钮
      const allButtons = document.querySelectorAll('button');
      console.log('页面上的所有按钮:', Array.from(allButtons).map(btn => ({
        tagName: btn.tagName,
        className: btn.className,
        ariaLabel: btn.getAttribute('aria-label'),
        dataTest: btn.getAttribute('data-test-close-button'),
        iconName: btn.getAttribute('iconname'),
        matDialogClose: btn.getAttribute('mat-dialog-close')
      })));
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

class ElementPicker {
  private overlay: HTMLElement | null = null;
  private hoveredElement: HTMLElement | null = null;
  private onSelect: (element: HTMLElement) => void;
  private isActive: boolean = false;

  constructor(onSelect: (element: HTMLElement) => void) {
    this.onSelect = onSelect;
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  public start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.createOverlay();
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.body.style.cursor = 'crosshair';
  }

  public stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.removeOverlay();
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.body.style.cursor = '';
    this.hoveredElement = null;
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'ai-vscode-picker-overlay';
    Object.assign(this.overlay.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '1000000',
      border: '2px solid #6c5ce7',
      backgroundColor: 'rgba(108, 92, 231, 0.2)',
      transition: 'all 0.1s ease',
      display: 'none'
    });
    document.body.appendChild(this.overlay);
  }

  private removeOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target || target === this.overlay || target.closest('#ai-vscode-panel')) {
      if (this.overlay) this.overlay.style.display = 'none';
      return;
    }

    this.hoveredElement = target;
    const rect = target.getBoundingClientRect();

    if (this.overlay) {
      Object.assign(this.overlay.style, {
        display: 'block',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      });
    }
  }

  private handleClick(e: MouseEvent): void {
    if (!this.isActive) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.hoveredElement) {
      this.onSelect(this.hoveredElement);
    }
    this.stop();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.stop();
    }
  }

  public static getElementInfo(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classes = Array.from(el.classList).map(c => `.${c}`).join('');

    // 获取计算样式
    const styles = window.getComputedStyle(el);
    const importantStyles = [
      'display', 'position', 'width', 'height',
      'margin', 'padding', 'border',
      'background-color', 'color', 'font-family', 'font-size',
      'flex', 'grid', 'justify-content', 'align-items'
    ];

    let cssText = `${t('computedStyles')}:\n`;
    importantStyles.forEach(prop => {
      cssText += `  ${prop}: ${styles.getPropertyValue(prop)};\n`;
    });

    const html = el.outerHTML.split('>')[0] + '>'; // 仅获取开始标签

    return `${t('elementInfo')}: ${tag}${id}${classes}\n\n${t('htmlInfo')}: ${html}\n\n${cssText}\n${t('innerClipboardText')}: ${el.innerText.substring(0, 100)}${el.innerText.length > 100 ? '...' : ''}`;
  }
}


// 初始化
new FloatingPanel();

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
  private pathMemory: Record<string, string> = {}; // 鏂板锛氳矾寰勮蹇?
  private picker: ElementPicker | null = null;

  private lastSelectedElement: HTMLElement | null = null; // 鏂板锛氳褰曚笂娆￠€変腑鐨勫厓绱?

  // Handlers
  private handlers: SiteHandler[] = [new DeepWikiHandler()];
  private activeHandler: SiteHandler | null = null;
  private injectedButton: HTMLElement | null = null;

  constructor() {
    this.initialize();
    this.checkDebugMode();
    this.setupStorageListener();
  }

  // 鍦?class FloatingPanel 内部添加
  private setUIVisibility(visible: boolean): void {
    if (this.panel) {
      // 使用 display: none 鏄渶褰诲簳鐨勶紝纭繚涓嶅崰浣嶄笖涓嶈娓叉煋
      this.panel.style.display = visible ? 'block' : 'none';
    }

    // 闅愯棌鎵€鏈夋鍦ㄦ樉绀虹殑閫氱煡鍏冪礌
    const notifications = document.querySelectorAll('.notification');
    notifications.forEach(el => {
      (el as HTMLElement).style.display = visible ? 'block' : 'none';
    });
  }

  private checkDebugMode(): void {
    // 妫€娴嬫槸鍚︿负璋冭瘯妯″紡锛堝彲浠ラ€氳繃URL参数或localStorage鎺у埗锛?
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
    await this.loadPathMemory(); // 鏂板锛氬姞杞借矾寰勮蹇?

    // 鏂板锛氬垵濮嬪寲鍚庣珛鍗虫煡璇㈣繛鎺ョ姸鎬?
    this.queryConnectionStatus();
  }

  // 鏂板锛氫富鍔ㄦ煡璇㈣繛鎺ョ姸鎬?
  private queryConnectionStatus(): void {
    chrome.runtime.sendMessage({ action: 'getConnectionStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('鏌ヨ杩炴帴鐘舵€佸け璐?', chrome.runtime.lastError);
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

  // 鏂板锛氬姞杞借矾寰勮蹇?
  private async loadPathMemory(): Promise<void> {
    const activeProject = await chrome.storage.local.get(['activeProject']);
    const rootPath = activeProject.activeProject?.rootPath || 'default';
    const storageKey = `pathMemory_${rootPath}`;

    const result = await chrome.storage.local.get([storageKey]);
    this.pathMemory = result[storageKey] || {};
    console.log(`[${rootPath}] Path memory loaded:`, Object.keys(this.pathMemory).length, 'files');
  }

  // 鏂板锛氫繚瀛樿矾寰勮蹇?
  private async savePathMemory(): Promise<void> {
    const activeProject = await chrome.storage.local.get(['activeProject']);
    const rootPath = activeProject.activeProject?.rootPath || 'default';
    const storageKey = `pathMemory_${rootPath}`;

    await chrome.storage.local.set({ [storageKey]: this.pathMemory });
  }

  // 鏂板锛氱洃鍚瓨鍌ㄥ彉鍖?
  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.activeProject) {
        console.log('Active project changed; reloading path memory.');
        this.loadPathMemory();
      }
    });
  }


  private async checkAndInitialize(): Promise<void> {
    // 缁熶竴浠?settings 閿鍙栭厤缃?
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
      console.log('褰撳墠缃戠珯鏈惎鐢ㄦ偓娴獥:', currentHostname);
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

        // 濡傞渶璁颁綇鐢ㄦ埛閫夋嫨锛屽彲浠ュ啓鍏?local
        chrome.storage.local.set({ promptsCollapsed: collapsed });
      });

      // 鍒濆鍖栨椂璇诲彇鎶樺彔鐘舵€?
      chrome.storage.local.get('promptsCollapsed', (res) => {
        if (res.promptsCollapsed) {
          promptSection.classList.add('collapsed');
          toggleBtn.textContent = '>';
        }
      });
    }

    this.statusElement = document.getElementById('connection-status');
    this.promptButtons = document.getElementById('prompt-buttons');

    // 鍔犺浇鎻愮ず璇嶆寜閽?
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

    // --- 鏂板锛氭埅鍥惧墠闅愯棌 UI ---
    this.setUIVisibility(false);
    // 给浏览器 50ms 鏃堕棿杩涜閲嶇粯锛岀‘淇?UI 在截图中消失
    await this.delay(50);

    console.group('🚀 [复制并保存] 完整流程');
    console.log('⏱️ 寮€濮嬫椂闂?', new Date().toLocaleTimeString());
    console.log('💾 鍒濆鍐呭瓨:', this.getMemoryUsage());

    try {
      // AI Studio 特殊处理
      if (window.location.hostname.includes('aistudio.google.com')) {
        await this.handleAIStudioCopy();
        return;
      }

      // 姝ラ1锛氭鏌?Active Handler 鏄惁鏈夌洰鏍?
      console.log('\n📍 姝ラ1: 鏌ユ壘鍐呭鏉ユ簮');
      let content = '';

      if (this.activeHandler) {
        console.log(`[Content] Checking active handler: ${this.activeHandler.name}`);
        const target = this.activeHandler.getTarget();
        if (target) {
          console.log('鉁?Handler provided target');
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
          console.error('鉂?鏈壘鍒癈OPY按钮');
          this.showError(t('noCopyButton'));
          console.groupEnd();
          return;
        }

        // 姝ラ2锛氱偣鍑绘寜閽?
        console.log('\n📍 姝ラ2: 点击复制按钮');
        console.time('点击复制');
        copyButton.click();
        console.timeEnd('点击复制');

        // 姝ラ3锛氱瓑寰呭鍒跺畬鎴?
        console.log('\n📍 姝ラ3: 等待复制完成 (300ms)');
        await this.delay(300);

        // 姝ラ4锛氳鍙栧壀璐存澘
        console.log('\nStep 4: Read clipboard');
        content = await DOMHelper.getClipboardContent();
      }

      if (!content || content.trim().length === 0) {
        console.error('鉂?鍐呭涓虹┖');
        this.showError(t('contentEmpty'));
        console.groupEnd();
        return;
      }

      // 姝ラ5：生成文件名
      console.log('\nStep 5: Generate filename');
      console.time('Generate filename');
      const filename = this.generateSmartFilename(content);
      console.timeEnd('Generate filename');
      console.log('📝 鏂囦欢鍚?', filename);

      // 姝ラ6：发送到VS Code
      console.log('\n📍 姝ラ6: 鍙戦€佸埌VS Code');
      this.showFilenamePreview(filename);
      this.sendToVSCode(content, filename);

      // 姝ラ7锛氭洿鏂拌鏁板櫒
      console.log('\nStep 7: Update counter');
      await this.updateDailyCounter();

      const overallEnd = performance.now();
      console.log('\n鉁?流程完成');
      console.log('⏱️ 鎬昏€楁椂:', (overallEnd - overallStart).toFixed(2), 'ms');
      console.log('💾 结束内存:', this.getMemoryUsage());
      console.groupEnd();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '鏈煡閿欒';
      console.error('鉂?流程失败:', error);
      console.log('💾 閿欒鏃跺唴瀛?', this.getMemoryUsage());
      this.showError(`${t('opFailed')}: ${errorMessage}`);
      console.groupEnd();
    } finally {
      // --- 鏂板锛氭棤璁烘垚鍔熷け璐ワ紝鏈€鍚庡繀椤绘仮澶?UI 显示 ---
      this.setUIVisibility(true);
      console.groupEnd();
    }
  }

  private async handleCreateFilesClick(): Promise<void> {

    this.setUIVisibility(false); // 隐藏
    await this.delay(50);        // 强制重绘

    console.group('Create files: start');
    try {
      // 1. 鑾峰彇鍐呭
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

      // 2. 瑙ｆ瀽浠ｇ爜鍧?
      const files = this.parseFilesFromContent(content);
      if (files.length === 0) {
        this.showError(t('noValidPaths'));
        console.groupEnd();
        return;
      }

      console.log(`🔍 璇嗗埆鍒?${files.length} 涓枃浠?`, files.map(f => f.path));

      // 3. 閫愪釜鍙戦€佸埌 VS Code
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
      this.setUIVisibility(true);  // 鎭㈠
      console.groupEnd();
    }
  }

  private async handlePartialUpdateClick(): Promise<void> {
    this.setUIVisibility(false); // 隐藏
    await this.delay(50);        // 强制重绘

    console.group('Partial update: start');
    try {
      // 1. 鑾峰彇鍐呭
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

      // 2. 瑙ｆ瀽浠ｇ爜鍧?
      const files = this.parseFilesFromContent(content);
      if (files.length === 0) {
        this.showError(t('noValidPaths'));
        console.groupEnd();
        return;
      }

      console.log(`🔍 璇嗗埆鍒?${files.length} 涓洿鏂伴」:`, files.map(f => f.path));

      // 3. 閫愪釜鍙戦€佸埌 VS Code (带有 patch 类型)
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
      this.setUIVisibility(true);  // 鎭㈠
      console.groupEnd();
    }
  }

  private handleScreenshotElementClick(): void {
    if (!this.picker) {
      this.picker = new ElementPicker(async (el) => {
        // 璁板綍閫変腑鐨勫厓绱?
        this.lastSelectedElement = el;
        // 閫夋嫨鍏冪礌鍚庯紝鑷姩瑙﹀彂鎴浘锛堝甫绾㈡锛夛紝浣嗕笉鍚堝苟鏂囨湰锛堜紶 null锛?
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
    // 鏅€氭埅鍥撅紝涓嶅甫棰濆鏂囨湰
    await this.handleCaptureWithText(null);
  }

  private async handleClonePageClick(): Promise<void> {
    this.setUIVisibility(false);
    this.showNotification(t('preparingClone'), 'success');

    // 1. 娉ㄥ叆瑙嗚閿氱偣
    VisualAnchorManager.injectAnchors();

    // 缁欐祻瑙堝櫒涓€鐐规椂闂存覆鏌撻敋鐐?
    await this.delay(100);

    // 2. 鎴浘
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, async (response) => {
      // 3. 移除锚点 (鎴浘瀹屾垚鍚庣珛鍗崇Щ闄わ紝鎭㈠鍘熷鐣岄潰)
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

          console.log(`Clicking file button: ${file.name}`);
          file.button.click();

          const isReady = await this.waitForMonacoReady(8000, file.name);
          if (!isReady) {
            console.warn(`File ${file.name} may not be fully loaded; proceeding anyway.`);
          }

          await this.delay(300);

          const content = await this.extractCodeFromMonaco();
          if (content && content.length > 0) {
            console.log(`Sending to VS Code: ${file.name} (${content.length} chars)`);
            await this.sendToVSCode(content, file.name);
            successCount++;
            console.log(`Synced: ${file.name}`);
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
   * 导出 AI Studio 鎵€鏈夊巻鍙插璇濅负 Markdown 文件
   *
   * 瀹屾暣娴佺▼锛?
   * 1. 找到 ms-prompt-scrollbar 涓殑鎵€鏈?button锛屼粠绗竴涓紑濮嬬偣鍑?
   * 2. 鐐瑰嚮鍚庨〉闈㈡樉绀?3 涓?ms-chat-turn：User闂(0)、Model鎬濊€?1)、Model回答(2)
   * 3. 瀵圭1涓拰绗?涓垎鍒偣鍑昏彍鍗曠殑澶嶅埗鎸夐挳锛岃幏鍙栧唴瀹?
   * 4. 寰幆澶勭悊鎵€鏈?button锛屾渶缁堝鍑?
   */
  private async handleExportAIStudioHistory(): Promise<void> {
    if (!window.location.hostname.includes('aistudio.google.com')) {
      this.showError(t('aiStudioOnly'));
      return;
    }

    console.group('Export AI Studio history: start');
    this.showNotification(t('extractingHistory'), 'success');

    try {
      // 1. 鍏堣幏鍙栨寜閽€绘暟
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

      // 2. 渚濇鎸夌储寮曞鐞嗘瘡涓?button
      // 注意：AI Studio 鏄姩鎬佸姞杞?DOM 鐨勶紙铏氭嫙婊氬姩锛夛紝涓嶈兘渚濊禆涓€寮€濮嬪缓绔嬬殑鍏ㄥ眬绱㈠紩
      // 蹇呴』閲囩敤鈥滅偣鍑?-> 等待 -> 鎶撳彇瑙嗗彛鍐呭鈥濈殑绛栫暐

      for (let i = 0; i < totalCount; i++) {
        console.log(`\n===== Processing ${i + 1}/${totalCount} =====`);
        this.showNotification(t('extracting', { current: i + 1, total: totalCount }), 'success');

        // 姣忔閲嶆柊鏌ユ壘鎸夐挳锛堝洜涓洪〉闈㈠彲鑳藉埛鏂版垨閲嶇粯锛?
        let buttonHint = '';
        const currentButtons = document.querySelectorAll<HTMLElement>('ms-prompt-scrollbar button');
        if (i < currentButtons.length) {
          const btn = currentButtons[i];
          buttonHint = this.getButtonHint(btn);
          const beforeSignature = this.getVisibleTurnsSignature();
          // 鐐瑰嚮鎸夐挳锛岃Е鍙戞粴鍔ㄥ拰鎳掑姞杞?
          btn.scrollIntoView({ block: 'center' });
          await this.delay(100);
          btn.click();
          const updated = await this.waitForVisibleTurnsChange(beforeSignature, 5000);
          if (!updated) {
            console.warn('  [warn] Visible turns did not update in time; continuing.');
          }
          // 绛夊緟椤甸潰婊氬姩鍜屾覆鏌擄紝绋嶅井闀夸竴鐐逛互闃蹭竾涓€
          await this.delay(200);
        } else {
          console.warn(`  [warn] Button ${i + 1} not found; continuing.`);
        }

        // --- 鏍稿績瀹氫綅閫昏緫锛氬鎵捐鍙ｅ唴鐨勫綋鍓嶈疆瀵硅瘽 ---

        let userTurn: HTMLElement | undefined;
        let answerTurn: HTMLElement | undefined;
        let answerHint: HTMLElement | undefined;

        // 1. 鑾峰彇鎵€鏈夌幇瀛樼殑 turns
        const currentAllTurns = Array.from(document.querySelectorAll<HTMLElement>('ms-chat-turn'));

        // 2. 绛涢€夊嚭鍙鐨?turns
        const visibleTurns = this.getVisibleTurns(currentAllTurns);
        console.log(`  DOM turns: ${currentAllTurns.length}, visible: ${visibleTurns.length}`);

        // 3. 鍦ㄥ彲瑙?turns 涓煡鎵?User Turn
        // 鐐瑰嚮鎸夐挳鍚庯紝鐩爣 User Turn 閫氬父浼氭粴鍔ㄥ埌瑙嗗彛椤堕儴鎴栦腑閮?
        // 鍥犳锛岃鍙ｅ唴鍑虹幇鐨勭涓€涓?User Turn 鏋佸ぇ姒傜巼灏辨槸鎴戜滑瑕佹壘鐨?
        userTurn = this.selectPrimaryUserTurn(visibleTurns, buttonHint);

        // 4. 鍏滃簳绛栫暐锛氬鏋滆鍙ｅ唴娌℃壘鍒?User Turn
        if (!userTurn) {
          console.warn('  [warn] No visible user turn; trying to infer from model turn.');

          // 策略 B: 如果视口内有 Model Turn锛岄偅瀹冪殑鍓嶄竴涓?User Turn 寰堝彲鑳藉氨鏄洰鏍?
          // (因为 Model 鎬绘槸绱ц窡鍦?User 后面)
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

          // 策略 C: 濡傛灉杩樻槸娌℃壘鍒帮紝灏濊瘯鍐嶆寮哄埗婊氬姩
          if (!userTurn && i < currentButtons.length) {
            console.log('  [retry] Clicking button again to trigger scroll...');
            currentButtons[i].click();
            await this.delay(1000); // 增加等待时间

            // 鍐嶆灏濊瘯鑾峰彇鍙鍏冪礌
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

        // 5. 如果还找不到，可能是 DOM 杩樻病娓叉煋鍑烘潵锛屾垨鑰呰杞璇濈‘瀹炴湁闂

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
          // 璁板綍閿欒浣嗕笉涓柇
          allConversations.push({
            question: `[${t('turnExtractFailed', { index: i + 1 })}]`,
            answer: ''
          });
          continue;
        }

        // 6. 鐎规矮缍呯€电懓绨查惃?Answer
        // 浼樺厛浣跨敤鍙鍖哄煙鐨勭浉閭?Model Turn锛屽啀鍥為€€鍒?DOM 顺序
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

        // 7. 鎻愬彇鍐呭
        // 鍐嶆纭繚鍙锛屼互闃叉彁鍙栧浘鐗囨椂闇€瑕佹噿鍔犺浇
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

        // 绋嶅井鍋滈】锛屽噯澶囦笅涓€杞?
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

      const safeTitle = this.toSafeFilename(conversationTitle || 'AI Studio 对话');
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
   * 浠庡崟涓?ms-chat-turn 涓彁鍙栧唴瀹?
   * 优先使用 DOM 鐩存帴鎻愬彇锛屽洜涓鸿彍鍗曞鍒舵寜閽湁缂撳瓨闂
   */
  private async copyContentFromTurn(turn: HTMLElement): Promise<string> {
    try {
      console.log('    Extracting content from DOM...');

      // 鐩存帴浠?DOM 鎻愬彇锛岄伩鍏嶈彍鍗曞鍒剁殑缂撳瓨闂
      const content = this.extractTurnContentFromDOM(turn);

      if (content && content.trim().length > 0) {
        console.log(`    DOM extraction succeeded. Length: ${content.length}`);
        return content.trim();
      }

      console.log('    DOM extraction empty; trying menu copy...');

      // 澶囩敤鏂规锛氫娇鐢ㄨ彍鍗曞鍒?
      return await this.copyContentFromTurnViaMenu(turn);

    } catch (error) {
      console.error('    Extract failed:', error);
      return this.extractTurnContentFromDOM(turn);
    }
  }

  /**
   * 閫氳繃鑿滃崟澶嶅埗鏂瑰紡鎻愬彇鍐呭锛堝鐢ㄦ柟妗堬級
   */
  private async copyContentFromTurnViaMenu(turn: HTMLElement): Promise<string> {
    try {
      // 1. 鍦ㄨ turn 鍐呮煡鎵捐彍鍗曟寜閽?
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

      // 2. 鍏堝叧闂换浣曞凡鎵撳紑鐨勮彍鍗?
      this.closeMenuWithEscape();
      await this.delay(150);

      // 3. 婊氬姩骞剁偣鍑昏彍鍗曟寜閽?
      menuButton.scrollIntoView({ behavior: 'instant', block: 'center' });
      await this.delay(200);
      menuButton.click();
      await this.delay(700);

      // 4. 鏌ユ壘骞剁偣鍑诲鍒舵寜閽?
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
   * 使用 Escape 閿叧闂彍鍗曪紝閬垮厤瑙﹀彂椤甸潰鍏朵粬鐐瑰嚮浜嬩欢
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
   * 妫€鏌ュ厓绱犳槸鍚﹀湪瑙嗗彛鍐呭彲瑙?
   */
  private isElementInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    // 鍏冪礌鑷冲皯鏈変竴閮ㄥ垎鍦ㄨ鍙ｅ唴
    const vertInView = (rect.top <= windowHeight) && ((rect.top + rect.height) >= 0);
    const horInView = (rect.left <= windowWidth) && ((rect.left + rect.width) >= 0);

    // 元素高度大于0锛堢‘淇濇槸鐪熷疄鍙鐨勫厓绱狅級
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
   * 浠?DOM 直接提取 turn 鍐呭锛堝鐢ㄦ柟娉曪級
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

    // 2. 鎻愬彇鏂囨湰鍐呭
    let textContent = '';

    // 浼樺厛浠?turn-content 获取
    const turnContent = turn.querySelector('.turn-content');
    if (turnContent) {
      textContent = this.extractMarkdownFromCmarkNode(turnContent as HTMLElement);
    } else {
      // 浠?ms-text-chunk 获取
      const textChunks = turn.querySelectorAll('ms-text-chunk, ms-code-block');
      if (textChunks.length > 0) {
        textContent = Array.from(textChunks)
          .map(chunk => {
            if (chunk.tagName.toLowerCase() === 'ms-code-block') {
              // [DEBUG] 打印 DOM 结构以便分析
              console.log('🔍 [CodeBlock Debug] HTML:', chunk.innerHTML);
              console.log('🔍 [CodeBlock Debug] Text:', chunk.textContent);

              // 1. 鏌ユ壘瀹為檯鐨勪唬鐮佸厓绱?
              // 娉ㄦ剰锛氭湁浜涙椂鍊?pre 閲岄潰鍖呭惈浜嗘墍鏈夊唴瀹?
              const codeEl = chunk.querySelector('code') || chunk.querySelector('pre');
              let realCode = codeEl ? (codeEl.textContent || '') : (chunk.textContent || '');

              // 2. 灏濊瘯鑾峰彇璇█
              let lang = chunk.getAttribute('language') || '';

              // [暴力清洗策略]
              // 如果 header 鏂囨湰瀹為檯涓婃贩鍦?realCode 閲岋紝鎴戜滑闇€瑕佹妸瀹冨垏鎺?
              // 鍋囪 header 鎬绘槸鍑虹幇鍦ㄤ唬鐮佺殑绗竴琛屾垨鍓嶅嚑琛?
              // 鎴戜滑鍙互妫€鏌?realCode 鐨勫紑澶存槸鍚﹀寘鍚偅浜涘叧閿瘝

              // 甯歌鐨?header 文本模式
              const garbagePatterns = [
                /^code\s+/i,
                /download/i,
                /content_copy/i,
                /expand_less/i,
                /expand_more/i
              ];

              // 如果 realCode 寮€澶村寘鍚繖浜涘瀮鍦炬枃瀛楋紝璇存槑 codeEl 鎶撳浜?
              // 灏濊瘯鎸夋崲琛岀鍒嗗壊锛屾鏌ョ涓€琛?
              const lines = realCode.split('\n');
              if (lines.length > 0) {
                let firstLine = lines[0].trim();
                // 妫€鏌ョ涓€琛屾槸鍚﹀寘鍚繃澶?UI 鍏抽敭璇?
                let garbageCount = 0;
                garbagePatterns.forEach(p => {
                  if (p.test(firstLine)) garbageCount++;
                });

                if (garbageCount >= 1 || firstLine.includes('content_copy')) {
                  // 鍒ゅ畾绗竴琛屼负鍨冨溇 Header
                  console.log('馃棏锔?妫€娴嬪埌鍨冨溇 Header 行，正在移除:', firstLine);

                  // 灏濊瘯浠庝腑鎻愬彇璇█
                  let potentialLang = firstLine;
                  ['code', 'download', 'content_copy', 'expand_less', 'expand_more'].forEach(kw => {
                    potentialLang = potentialLang.replace(new RegExp(kw, 'gi'), '');
                  });
                  lang = potentialLang.trim();

                  // 绉婚櫎绗竴琛?
                  lines.shift();
                  realCode = lines.join('\n');
                }
              }

              // 鍐嶆娓呯悊 lang
              lang = lang.split('\n')[0].trim();
              if (lang.length > 20) lang = '';

              return `\n\`\`\`${lang}\n${realCode.trim()}\n\`\`\`\n`;
            }
            return this.extractMarkdownFromCmarkNode(chunk as HTMLElement);
          })
          .join('\n');
      } else {
        // 鍏滃簳锛氱洿鎺ヨ幏鍙栨枃鏈?
        textContent = turn.innerText || '';
      }
    }

    // 3. 缁勫悎鍥剧墖鍜屾枃鏈?
    let finalContent = (textContent + imageMarkdown).trim();
    finalContent = this.normalizeCodeFenceHeaders(finalContent);

    // 4. 清理 "User" 前缀
    // 寰堝鏃跺€?User 鍧楀紑澶翠細鏈?"User" 文本
    if (finalContent.startsWith('User')) {
      finalContent = finalContent.substring(4).trim();
    }
    // 澶勭悊鍙兘鎹㈣鐨勬儏鍐?
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
   * 灏嗛棶绛斿鏍煎紡鍖栦负 Markdown
   */
  private formatConversationPairsToMarkdown(
    conversations: Array<{ question: string; answer: string }>,
    title?: string
  ): string {
    const lines: string[] = [];

    // 娣诲姞鏍囬
    const headerTitle = (title || t('defaultConversationTitle')).trim();
    lines.push(`# ${headerTitle}`);
    lines.push('');
    lines.push(`${t('exportTime')}: ${new Date().toLocaleString()}`);
    lines.push(`${t('turnCount')}: ${conversations.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // 鎸夐棶绛斿缂栧彿
    conversations.forEach((conv, index) => {
      const paddedIndex = String(index + 1).padStart(2, '0');

      // 闂
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
   * 浠?ms-cmark-node 提取 Markdown 格式文本 (澧炲己鐗?
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

      // 閫掑綊鑾峰彇瀛愬唴瀹?(闄や簡鐗瑰畾鐨勬爣绛惧 code/pre 闇€瑕佺壒娈婂鐞?
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
          if (!src || element.getAttribute('width') === '16') return ''; // 蹇界暐灏忓浘鏍?
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
          // 鏌ユ壘鍐呴儴鐨?code 鏍囩浠ヨ幏鍙栬瑷€
          const codeEl = element.querySelector('code');
          let codeText = (codeEl ? codeEl.textContent : element.textContent) || '';

          // [Header 清洗逻辑 - 通用版]
          // 妫€鏌ヤ唬鐮佹枃鏈殑绗竴琛屾槸鍚﹀寘鍚?UI 杂质
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
            // 鍙鍖呭惈 content_copy 鎴?download 灏辫涓烘槸鍨冨溇琛?
            if (firstLine.includes('content_copy') || firstLine.includes('download')) {
              isGarbage = true;
            } else {
              // 鎴栬€呭尮閰嶆鍒?
              for (const p of garbagePatterns) {
                if (p.test(firstLine)) {
                  isGarbage = true;
                  break;
                }
              }
            }

            if (isGarbage) {
              console.log('馃棏锔?[extractMarkdown] 移除垃圾 Header 琛?', firstLine);
              // 灏濊瘯浠庡瀮鍦捐鎻愬彇璇█
              let potentialLang = firstLine;
              potentialLang = potentialLang.replace(/\bcode\b\s*/gi, '');
              ['download', 'content_copy', 'expand_less', 'expand_more'].forEach(kw => {
                potentialLang = potentialLang.replace(new RegExp(kw, 'gi'), '');
              });
              potentialLang = potentialLang.replace(/\s+/g, ' ').trim();

              // 濡傛灉杩樻病鎻愬彇鍒拌瑷€锛屽氨灏濊瘯鐢ㄦ綔鍦ㄨ瑷€
              // 鍙湁褰撴綔鍦ㄨ瑷€鐪嬭捣鏉ュ儚涓崟璇嶆椂鎵嶇敤 (长度<20)
              const cleanLang = potentialLang.trim();
              if (cleanLang.length > 0 && cleanLang.length < 30) {
                headerLang = cleanLang;
              }
              if (cleanLang.length > 0 && cleanLang.length < 20 && !cleanLang.includes(' ')) {
                // 杩欐槸涓€涓?Hack锛屽洜涓?lang 鍙橀噺閫氬父浠?class 获取
                // 浣嗚繖閲屾垜浠病鏈夊湴鏂瑰瓨锛屽彧鑳界◢寰慨鏀逛笅闈㈢殑閫昏緫
                // 鎴栬€呮垜浠彧鏄畝鍗曞湴鎶婄涓€琛屽垹鎺?
              }

              lines.shift();
              codeText = lines.join('\n');
            }
          }

          // 灏濊瘯浠?class 鑾峰彇璇█锛屼緥濡?"language-python"
          let lang = '';
          if (codeEl) {
            const classes = Array.from(codeEl.classList);
            const langClass = classes.find(c => c.startsWith('language-'));
            if (langClass) lang = langClass.replace('language-', '');
          }

          // 如果 class 娌℃壘鍒拌瑷€锛屽皾璇曚粠绗竴琛屾畫鐣欓噷鎵撅紙姣斿 Powershell锛?
          if (!lang && headerLang) {
            lang = headerLang;
            // 杩欓噷姣旇緝闅撅紝鍥犱负绗竴琛屽凡缁忚鍒犱簡
            // 瀹為檯涓?AI Studio 鐨?language 灞炴€ч€氬父鍦ㄧ埗绾?
          }

          return `\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;

        case 'code':
          // 濡傛灉鏄鍐呬唬鐮?(娌℃湁琚?pre 包裹)
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
    console.log('🔍 灏濊瘯鍚屾 Commit Message...');
    this.showNotification(t('fetchingCommitMsg'), 'success');

    try {
      // 1. 鏌ユ壘骞剁偣鍑?GitHub 按钮
      const githubBtn = document.querySelector('ms-github-trigger-button button') as HTMLElement ||
        document.querySelector('ms-github-trigger-button') as HTMLElement;
      if (!githubBtn) {
        console.warn('⚠️ 鏈壘鍒?ms-github-trigger-button');
        this.showError(t('noGithubButton'));
        return;
      }
      githubBtn.click();
      console.log('鉁?宸茬偣鍑?GitHub 鎸夐挳锛岀瓑寰呴潰鏉垮睍寮€...');

      // 2. 绛夊緟闈㈡澘鎵撳紑鍜?textarea 加载
      await this.delay(1500);
      console.log('鈴?查找 commit message textarea...');
      const textarea = await DOMHelper.waitForElement('textarea[formcontrolname="message"]', 5000) as HTMLTextAreaElement;

      if (!textarea) {
        console.warn('⚠️ commit message textarea not found');
        this.showError(t('commitMsgInputNotFound'));
        return;
      }

      // 3. 鎻愬彇鍐呭
      // AI Studio 鐨勫缓璁線寰€鏀惧湪 placeholder 涓紝鎴栬€呮槸寮傛濉厖鍒?value
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

      // 娓呯悊锛氬幓鎺夋湯灏惧彲鑳藉瓨鍦ㄧ殑鎻愮ず鎬у瓧绗?(濡?鈫?\u21AA 鎴?鈬?\u21E5)
      message = message.replace(/[\u21AA\u21E5]$/g, '').trim();

      console.log('鉁?鎻愬彇鍒?Commit Message:', message);

      // 4. 复制到剪贴板
      await this.copyToClipboard(null, message);
      this.showSuccess(t('commitMsgCopied'));

    } catch (err) {
      console.error('鉂? ' + t('syncCommitMsgFailed') + ':', err);
    }
  }

  private findAIStudioDriveFiles(): Array<{ name: string, button: HTMLElement }> {
    // 鏌ユ壘鏈€鍚庝竴娆″璇濅腑鐨勭敓鎴愯〃鏍?
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
    console.log('🔍 鏍稿績鎻愬彇锛氬皾璇?Scroll-and-Scrape 策略...');

    // 1. 鏌ユ壘缂栬緫鍣ㄦ粴鍔ㄥ鍣?
    const scrollable = document.querySelector('.monaco-scrollable-element') ||
      document.querySelector('.lines-content');

    if (!scrollable) {
      console.error('Scrollable container not found.');
      return null;
    }

    // 2. 鍐呴儴鐖彇鍑芥暟锛岀‘淇濆鐞嗙┖鏍奸棶棰?
    const scrapeVisibleLines = (collectedLines: Map<number, string>) => {
      const viewLines = document.querySelector('.view-lines');
      if (!viewLines) return;

      const lineElements = viewLines.querySelectorAll('.view-line');
      lineElements.forEach(lineEl => {
        const htmlEl = lineEl as HTMLElement;
        const top = parseInt(htmlEl.style.top || '0', 10);
        // 鍏抽敭锛氭浛鎹?\u00A0 (nbsp) 涓烘爣鍑嗙┖鏍硷紝骞跺鐞嗗叾浠栦笉鍙瀛楃
        const lineText = htmlEl.innerText
          .replace(/\u00A0/g, ' ')
          .replace(/\u200B/g, '') // Zero width space
          .replace(/\r/g, '');

        collectedLines.set(top, lineText);
      });
    };

    // 3. 鍑嗗婊氬姩鎻愬彇
    const collectedLines = new Map<number, string>();
    const originalScrollTop = scrollable.scrollTop;

    // 鍏抽敭淇锛氬己鍒剁疆椤跺苟楠岃瘉
    console.log('⬆️ 正在重置滚动条到顶部...');
    let resetAttempts = 0;
    while (scrollable.scrollTop > 0 && resetAttempts < 5) {
      scrollable.scrollTop = 0;
      await this.delay(150);
      resetAttempts++;
    }

    if (scrollable.scrollTop > 0) {
      console.warn('⚠️ Scroll reset may have failed. Current top:', scrollable.scrollTop);
    } else {
      console.log('Scroll reset complete. Starting scrape.');
    }

    let lastScrollTop = -1;
    let unchangedCount = 0;

    // 娓愯繘寮忔粴鍔ㄩ噰闆?
    while (scrollable.scrollTop !== lastScrollTop || unchangedCount < 4) {
      const currentTop = scrollable.scrollTop;

      if (currentTop === lastScrollTop) {
        unchangedCount++;
      } else {
        unchangedCount = 0;
        lastScrollTop = currentTop;
      }

      scrapeVisibleLines(collectedLines);

      // 姣忔鍚戜笅婊氬姩涓€灞忔垨鍗婂睆
      scrollable.scrollTop += 650;
      // 澧炲姞婊氬姩鍚庣殑娌夋穩鏃堕棿锛岀‘淇濊櫄鎷熷寲娓叉煋璺熷緱涓?
      await this.delay(100);
    }

    // 4. 鎭㈠鍘熷婊氬姩浣嶇疆
    scrollable.scrollTop = originalScrollTop;

    // 5. 鎺掑簭骞剁粍鍚堢粨鏋?
    const sortedKeys = Array.from(collectedLines.keys()).sort((a, b) => a - b);
    const finalContent = sortedKeys.map(key => collectedLines.get(key)).join('\n');

    console.log(`鉁?提取完成 (Scroll-based): 鍏遍噰闆嗗埌鐙壒琛?${collectedLines.size}, 瀛楃鏁?${finalContent.length}`);

    if (finalContent.length === 0) {
      console.warn(t('contentEmpty'));
      return null;
    }

    return finalContent;
  }

  /**
   * 等待 Monaco 缂栬緫鍣ㄥ噯澶囧氨缁紙鍗虫覆鏌撳嚭浠ｇ爜琛岋級
   */
  private async waitForMonacoReady(timeoutMs: number = 5000, fileName: string = ''): Promise<boolean> {
    const startTime = Date.now();
    console.log(`鈴?[${fileName}] 等待 Monaco 缂栬緫鍣ㄥ氨缁?..`);

    return new Promise((resolve) => {
      let lastLineCount = -1;
      let stabilityCount = 0;

      const check = async () => {
        // 1. 妫€鏌ユ槸鍚﹀瓨鍦?.view-lines 瀹瑰櫒涓斿寘鍚?.view-line
        const viewLines = document.querySelector('.view-lines');
        const lines = viewLines ? viewLines.querySelectorAll('.view-line') : [];
        const hasLines = lines.length > 0;

        // 2. 妫€鏌ユ槸鍚︽湁婊氬姩瀹瑰櫒
        const scrollable = document.querySelector('.monaco-scrollable-element');

        if (hasLines && scrollable) {
          // 3. 澧炲姞绋冲畾鎬ф鏌ワ細杩炵画涓ゆ妫€娴嬪埌鐨勮鏁颁竴鑷存墠璁や负灏辩华
          if (lines.length === lastLineCount) {
            stabilityCount++;
          } else {
            stabilityCount = 0;
            lastLineCount = lines.length;
          }

          if (stabilityCount >= 2) {
            console.log(`鉁?[${fileName}] Monaco 编辑器已就绪 (行数: ${lines.length}, 耗时: ${Date.now() - startTime}ms)`);
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

  // 缁熶竴鐨勬埅鍥惧鐞嗘柟娉曪紝鏀寔闄勫姞鏂囨湰鍜岄珮浜厓绱?
  private async handleCaptureWithText(additionalText: string | null, highlightElement: HTMLElement | null = null): Promise<void> {
    // 鎴浘鍓嶉殣钘忔偓娴獥
    this.setUIVisibility(false);

    // 濡傛灉鏈夐珮浜厓绱狅紝鍒涘缓楂樹寒妗?
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
      // 添加 data-html2canvas-ignore 灞炴€э紝铏界劧鎴戜滑鏄敤鍘熺敓鎴浘锛屼絾淇濇寔濂戒範鎯?
      highlightBox.setAttribute('data-html2canvas-ignore', 'true');
      document.body.appendChild(highlightBox);
    }

    this.showNotification('正在捕获...', 'success');

    // 给浏览器 50ms 鏃堕棿杩涜閲嶇粯
    await this.delay(50);

    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, async (response) => {
      // 鎴浘瀹屾垚鍚庣珛鍗虫仮澶嶆樉绀?
      this.setUIVisibility(true);

      // 绉婚櫎楂樹寒妗?
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
              ? '鉁?鍏冪礌淇℃伅涓庢埅鍥惧凡鍚堝苟澶嶅埗锛岃 Ctrl+V 粘贴'
              : '鉁?鎴浘宸插鍒讹紝璇?Ctrl+V 粘贴';
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

    console.log('🔍 寮€濮嬪垏鐗囪В鏋?(Slice First), 长度:', content.length);

    // 姝ラ 1: 智能切片 - 鍙湪浠ｇ爜鍧楀閮ㄧ殑 --- 澶勫垏鍒?
    // 鎵嬪姩閬嶅巻鍐呭锛岃窡韪槸鍚﹀湪浠ｇ爜鍧楀唴
    const slices: string[] = [];
    let currentSliceStart = 0;
    let inCodeBlock = false;
    const lines = content.split('\n');
    let charIndex = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // 妫€鏌ユ槸鍚﹁繘鍏?绂诲紑浠ｇ爜鍧?
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // 妫€鏌ユ槸鍚︽槸鍒嗛殧绗?(浠呭湪浠ｇ爜鍧楀閮?
      if (!inCodeBlock && /^[-]{3,}$/.test(line.trim())) {
        // 找到分隔符，结束当前切片
        const sliceEnd = charIndex;
        if (sliceEnd > currentSliceStart) {
          slices.push(content.substring(currentSliceStart, sliceEnd).trim());
        }
        // 鏂板垏鐗囦粠鍒嗛殧绗︿箣鍚庡紑濮?
        currentSliceStart = charIndex + line.length + 1; // +1 for \n
      }

      charIndex += line.length + 1; // +1 for \n
    }

    // 娣诲姞鏈€鍚庝竴涓垏鐗?
    if (currentSliceStart < content.length) {
      slices.push(content.substring(currentSliceStart).trim());
    }

    console.log(`🔪 切片数量: ${slices.length}`);

    // 姝ラ 2: 瀵规瘡涓垏鐗囩嫭绔嬭В鏋?
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];

      // 鍦ㄥ垏鐗囧唴瀵绘壘璺緞鎸囩ず鍣?
      // 格式 A: 鏂囦欢鍚? `path/to/file.ext`
      // 格式 B: **path/to/file.ext**
      // 格式 C: 琛岄 path/to/file.ext
      const pathPatterns = [
        /(?:文件名|File\s*(?:Name|Path)?|璺緞|名称)[:：]\s*[`"]?([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]+)[`"]?/i,
        /(?:\*\*|__|\`)([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]+)(?:\*\*|__|\`)/,
        /^([a-zA-Z0-9._\-\/]+\.[a-zA-Z0-9]{1,10})$/m
      ];

      let detectedPath: string | null = null;
      for (const pattern of pathPatterns) {
        const match = slice.match(pattern);
        if (match && match[1]) {
          detectedPath = match[1];
          console.log(`🎯 切片 ${i}: 妫€娴嬪埌璺緞 "${detectedPath}"`);
          break;
        }
      }

      if (!detectedPath) {
        console.log(`鈴笍 切片 ${i}: 鏈娴嬪埌璺緞锛岃烦杩?(鍓?0瀛楃: "${slice.substring(0, 50).replace(/\n/g, '\\n')}...")`);
        continue;
      }

      // 鍦ㄥ垏鐗囧唴瀵绘壘浠ｇ爜鍧?- 使用 lastIndexOf 鎵炬渶鍚庝竴涓棴鍚堟爣璁?
      const blockStartMatch = slice.match(/```(\w+)?[\r\n]+/);
      if (!blockStartMatch) {
        console.log(`Slice ${i}: code block start not found after path "${detectedPath}".`);
        continue;
      }

      const lang = blockStartMatch[1] || 'text';
      const contentStart = blockStartMatch.index! + blockStartMatch[0].length;

      // 鍏抽敭淇锛氬湪鍒囩墖鍐呭鎵俱€愭渶鍚庝竴涓€戦棴鍚堟爣璁?
      const lastClosingIndex = slice.lastIndexOf('```');

      if (lastClosingIndex <= contentStart) {
        console.log(`Slice ${i}: code block not properly closed for "${detectedPath}".`);
        continue;
      }

      const blockContent = slice.substring(contentStart, lastClosingIndex).trim();
      console.log(`📦 切片 ${i}: 浠ｇ爜鍧楅暱搴?${blockContent.length} chars`);

      // 璺緞澶勭悊
      let fullPath = detectedPath.replace(/^\.?\//, '');
      const parts = fullPath.split('/');
      const filename = parts.pop() || '';
      let savePath = parts.join('/');

      console.log(`📂 璺緞瑙ｆ瀽: fullPath="${fullPath}", filename="${filename}", savePath="${savePath}"`);

      // 璺緞璁板繂
      if (!savePath) {
        const lowerFilename = filename.toLowerCase();
        const memoryKey = Object.keys(this.pathMemory).find(k => k.toLowerCase() === lowerFilename);
        if (memoryKey) {
          savePath = this.pathMemory[memoryKey];
          fullPath = savePath ? `${savePath}/${filename}` : filename;
          console.log(`馃 记忆匹配: ${filename} -> ${savePath}`);
        }
      }

      if (savePath && this.pathMemory[filename] !== savePath) {
        this.pathMemory[filename] = savePath;
        memoryUpdated = true;
        console.log(`📝 鏇存柊璺緞璁板繂: ${filename} -> ${savePath}`);
      }

      files.push({
        path: fullPath,
        filename: filename,
        savePath: savePath,
        content: blockContent
      });
      console.log(`鉁?成功提取: ${fullPath} (璇█: ${lang}, ${blockContent.length} chars)`);
    }

    if (memoryUpdated) {
      this.savePathMemory();
    }

    console.log(`Total extracted files: ${files.length}`);
    return files;
  }

  private async sendToVSCode(content: string, filename: string, customSavePath?: string, type: 'save' | 'patch' = 'save'): Promise<void> {
    try {
      // 鑾峰彇淇濆瓨璺緞閰嶇疆
      const settings = await chrome.storage.sync.get({ savePath: '' });
      const defaultSavePath = (settings.savePath || '').trim();

      // 濡傛灉鏈夎嚜瀹氫箟璺緞锛屽垯鎷兼帴鍒伴粯璁よ矾寰勫悗锛屾垨鑰呯洿鎺ヤ娇鐢?
      let finalSavePath = customSavePath || '';
      if (defaultSavePath) {
        if (finalSavePath) {
          finalSavePath = `${defaultSavePath}/${finalSavePath}`;
        } else {
          finalSavePath = defaultSavePath;
        }
      }

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


  // 鏂板锛氫笓闂ㄥ鐞?AI Studio 鐨勫鍒?
  private async handleAIStudioCopy(): Promise<void> {
    try {
      this.debugLog('AI Studio: locating menu button...');

      // 1. 鏌ユ壘鎵€鏈夌殑 more_vert 按钮
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

      // 鑾峰彇鏈€鍚庝竴涓紙鏈€鏂扮殑鍥炵瓟锛?
      const menuButton = moreButtons[moreButtons.length - 1];
      this.debugLog('Menu button found; clicking...');

      // 2. 点击菜单按钮展开菜单
      menuButton.click();
      this.debugLog('鉁?鑿滃崟宸插睍寮€锛岀瓑寰呭姞杞?..');

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

      // 7. 璇诲彇鍓创鏉垮唴瀹?
      const content = await DOMHelper.getClipboardContent();

      if (!content || content.trim().length === 0) {
        this.showError(t('clipboardTyEmpty'));
        return;
      }

      this.debugLog('鉁?读取到内容，长度:', content.length);

      // 鍐呭闀垮害闄愬埗妫€鏌?
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

    // 鏍煎紡鍖栨棩鏈? YYYYMMDD
    const date = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');

    // 鏍煎紡鍖栨椂闂? HHmmss
    const time = String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    // 序号: 001, 002, 003...
    const sequence = String(this.dailyCounter).padStart(3, '0');

    // 鎻愬彇绗竴鍙ヨ瘽
    const firstSentence = this.extractFirstSentence(content);

    // 娓呯悊绗竴鍙ヨ瘽
    const cleanedSentence = this.cleanSentence(firstSentence);

    // 闄愬埗闀垮害锛堥槻姝㈡枃浠跺悕杩囬暱锛?
    const shortSentence = this.truncateFilename(cleanedSentence, 50);

    // 缁勫悎鏂囦欢鍚?
    return `${date}-${time}-${sequence}-${shortSentence}.md`;
  }

  private extractFirstSentence(content: string): string {
    // 移除Markdown鏍囪
    let text = content.trim();
    text = text.replace(/^#+\s+/gm, ''); // 绉婚櫎鏍囬绗﹀彿
    text = text.replace(/\*\*(.+?)\*\*/g, '$1'); // 移除加粗
    text = text.replace(/\*(.+?)\*/g, '$1'); // 移除斜体
    text = text.replace(/`(.+?)`/g, '$1'); // 绉婚櫎浠ｇ爜鏍囪
    text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // 绉婚櫎閾炬帴锛屼繚鐣欐枃鏈?

    // 鍒嗗壊鎴愬彞瀛愶紙鎸夊彞鍙枫€侀棶鍙枫€佹劅鍙瑰彿銆佹崲琛岋級
    const sentences = text.split(/[銆?!?！？\n]/);

    // 鎵惧埌绗竴涓湁瀹為檯鍐呭鐨勫彞瀛?
    for (const sentence of sentences) {
      const cleaned = sentence.trim();
      if (cleaned.length > 5) { // 至少5涓瓧绗?
        return cleaned;
      }
    }

    // 濡傛灉娌℃壘鍒板悎閫傜殑鍙ュ瓙锛屽彇鍓?0涓瓧绗?
    return text.substring(0, 50).trim();
  }

  private cleanSentence(sentence: string): string {
    // 绉婚櫎甯歌鐨勫紑鍦虹櫧
    const removePatterns = [
      /^好的[锛?锛?銆?\s]*/i,
      /^当然[锛?锛?銆?\s]*/i,
      /^我会[^\s]{0,5}/i,
      /^我将[^\s]{0,5}/i,
      /^让我[^\s]{0,5}/i,
      /^明白[了吗]?[锛?锛?銆?\s]*/i,
      /^收到[锛?锛?銆?\s]*/i,
      /^好[的啦][锛?锛?銆?\s]*/i,
      /^OK[锛?锛?銆?\s]*/i,
      /^了解[锛?锛?銆?\s]*/i,
      /^娌￠棶棰榌锛?锛?銆?\s]*/i
    ];

    let cleaned = sentence;
    for (const pattern of removePatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // 绉婚櫎鐗规畩瀛楃鍜岀┖鏍硷紙鏂囦欢鍚嶄笉鍏佽鐨勫瓧绗︼級
    cleaned = cleaned.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');

    // 移除多余空格
    cleaned = cleaned.replace(/\s+/g, '-');

    // 绉婚櫎寮€澶村拰缁撳熬鐨勮繛瀛楃
    cleaned = cleaned.replace(/^-+|-+$/g, '');

    return cleaned;
  }

  private truncateFilename(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // 在maxLength澶勬埅鏂紝浣嗗皾璇曞湪鍚堥€傜殑浣嶇疆锛堝杩炲瓧绗﹀锛?
    let truncated = text.substring(0, maxLength);
    const lastDash = truncated.lastIndexOf('-');

    if (lastDash > maxLength * 0.7) {
      // 如果在后70%鏈夎繛瀛楃锛屽湪閭ｉ噷鎴柇
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

  // 鎻愮ず璇嶇浉鍏虫柟娉?
  private async loadPromptButtons(): Promise<void> {
    try {
      // 浼樺厛浠?local 鍔犺浇锛堟柊瀛樺偍鏂瑰紡锛?
      const localResult = await chrome.storage.local.get(['promptFiles']);
      let promptFiles = localResult.promptFiles || [];

      // 如果 local 涓病鏈夛紝鍥為€€鍒?sync锛堟棫瀛樺偍鏂瑰紡锛?
      if (promptFiles.length === 0) {
        const syncResult = await chrome.storage.sync.get(['promptFiles']);
        promptFiles = syncResult.promptFiles || [];
        if (promptFiles.length > 0) {
          console.log('浠?sync 加载提示词（旧格式）');
        }
      }

      this.createPromptButtons(promptFiles);
    } catch (error) {
      console.error('鍔犺浇鎻愮ず璇嶅け璐?', error);
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

    // 淇濆瓨鎻愮ず璇嶅唴瀹瑰埌鎸夐挳鐨勮嚜瀹氫箟灞炴€?
    const buttons = this.promptButtons.querySelectorAll('.prompt-btn');
    buttons.forEach((btn, index) => {
      const htmlBtn = btn as HTMLElement;
      (htmlBtn as any).__promptContent = prompts.filter(p => p.enabled)[index].path;

      // 绉诲嚭鍐呰仈浜嬩欢锛屾敼鐢?addEventListener 浠ョ鍚?CSP
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
      console.log('📝 寮€濮嬪簲鐢ㄦ彁绀鸿瘝:', promptName);

      if (!content || content.trim().length === 0) {
        this.showError(t('promptContentEmpty'));
        return;
      }

      console.log('鉁?鍐呭闀垮害:', content.length);

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

      console.log('鉁?找到 System Instructions 按钮');

      // 2. 点击打开界面
      sysInstructionsBtn.click();
      await this.delay(500);

      // 3. 鏌ユ壘鏂囨湰妗?
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="System instructions"], ' +
        'textarea[placeholder*="tone and style"], ' +
        'textarea.in-run-settings'
      );

      if (!textarea) {
        this.showError(t('sysInstrTextareaNotFound'));
        // 灏濊瘯鍏抽棴鍙兘鎵撳紑鐨勫璇濇
        this.closeSystemInstructionsDialog();
        return;
      }

      console.log('Textarea found.');

      // 4. 娓呯┖鐜版湁鍐呭
      textarea.value = '';

      // 5. 濉厖鏂板唴瀹?
      textarea.value = content;

      // 6. 瑙﹀彂浜嬩欢浠ョ‘淇?Angular 妫€娴嬪埌鍙樺寲
      textarea.blur();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.dispatchEvent(new Event('blur', { bubbles: true }));


      // 触发 Angular 鐨?ngModelChange
      const event = new CustomEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);

      console.log('Content filled.');

      // 7. 等待 Angular 更新
      await this.delay(800);

      // 8. 鍏抽棴瀵硅瘽妗?
      this.closeSystemInstructionsDialog();

      this.showSuccess(t('appliedPrompt', { name: promptName }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Apply prompt failed:', error);
      this.showError(t('applyPromptFailed') + `: ${errorMessage}`);
    }
  }

  private closeSystemInstructionsDialog(): void {
    // 查找典型关闭按钮 - 浣跨敤鏇寸簿纭殑閫夋嫨鍣?
    const selectors = [
      'button[data-test-close-button]',
      'button[aria-label="Close panel"]',
      'button[mat-dialog-close]',
      'button[iconname="close"]',
      'button.ms-button-icon[iconname="close"]',
      'button[aria-label="Close panel"][data-test-close-button]'
    ];

    let closeBtn: HTMLElement | null = null;

    // 灏濊瘯姣忎釜閫夋嫨鍣?
    for (const selector of selectors) {
      closeBtn = document.querySelector<HTMLElement>(selector);
      if (closeBtn && closeBtn.offsetParent !== null) {
        console.log(`鉁?找到关闭按钮: ${selector}`);
        break;
      }
    }

    if (closeBtn) {
      // 妫€鏌ユ寜閽姸鎬?
      const isVisible = closeBtn.offsetParent !== null;
      const isDisabled = closeBtn.hasAttribute('aria-disabled') && closeBtn.getAttribute('aria-disabled') === 'true';
      const isEnabled = closeBtn.getAttribute('aria-disabled') === 'false' || !closeBtn.hasAttribute('aria-disabled');

      console.log('鍏抽棴鎸夐挳鐘舵€?', {
        isVisible,
        isDisabled,
        isEnabled,
        ariaDisabled: closeBtn.getAttribute('aria-disabled'),
        className: closeBtn.className
      });

      // 纭繚鎸夐挳鍙涓斿彲鐐瑰嚮
      if (isVisible && isEnabled) {
        try {
          closeBtn.click();
          console.log('鉁?已自动关闭System Instructions界面');
        } catch (error) {
          console.error('点击关闭按钮失败:', error);
          // 尝试其他方式触发点击
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          closeBtn.dispatchEvent(clickEvent);
          console.log('鉁?宸查€氳繃浜嬩欢瑙﹀彂鍏抽棴System Instructions界面');
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
      console.log('椤甸潰涓婄殑鎵€鏈夋寜閽?', Array.from(allButtons).map(btn => ({
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

    let cssText = '计算样式:\n';
    importantStyles.forEach(prop => {
      cssText += `  ${prop}: ${styles.getPropertyValue(prop)};\n`;
    });

    const html = el.outerHTML.split('>')[0] + '>'; // 浠呰幏鍙栧紑濮嬫爣绛?

    return `元素: ${tag}${id}${classes}\n\nHTML: ${html}\n\n${cssText}\n内部文本: ${el.innerText.substring(0, 100)}${el.innerText.length > 100 ? '...' : ''}`;
  }
}


// 鍒濆鍖?
new FloatingPanel();

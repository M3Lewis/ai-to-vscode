import { DOMHelper } from './utils/dom';
import { MessageToVSCode, MessageResponse, ConnectionStatus } from './types';

class FloatingPanel {
  private panel: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private enabled: boolean = false;
  private dailyCounter: number = 1;
  private promptButtons: HTMLElement | null = null;
  private isDebugMode: boolean = false;
  private pathMemory: Record<string, string> = {}; // 新增：路径记忆

  constructor() {
    this.initialize();
    this.checkDebugMode();
    this.setupStorageListener();
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
        console.log('当前连接状态:', response.connected ? '已连接' : '未连接');
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
    console.log(`📂 [${rootPath}] 路径记忆已加载:`, Object.keys(this.pathMemory).length, '个文件');
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
        console.log('🔄 检测到活跃项目变更，重新加载路径记忆');
        this.loadPathMemory();
      }
    });
  }


  private async checkAndInitialize(): Promise<void> {
    const result = await chrome.storage.sync.get({
      enabledUrls: [
        'chat.openai.com',
        'claude.ai',
        'gemini.google.com',
        'perplexity.ai'
      ],
      showOnAllSites: false
    });

    const currentHostname = window.location.hostname;
    const showOnAllSites = result.showOnAllSites;
    const enabledUrls: string[] = result.enabledUrls;

    if (showOnAllSites || this.isUrlEnabled(currentHostname, enabledUrls)) {
      this.enabled = true;
      this.createPanel();
      this.setupMessageListener();
      console.log('✅ 悬浮窗已启用');
    } else {
      console.log('当前网站未启用悬浮窗:', currentHostname);
    }

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabledUrls || changes.showOnAllSites || changes.siteConfigs) {
        window.location.reload();
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

    this.panel.innerHTML = `
    <div class="panel-container">
      <div class="ai-vscode-header">
        <span class="ai-vscode-title">发送到VS Code</span>
        <button id="toggle-prompts" class="ai-vscode-toggle" title="折叠/展开提示词">▾</button>
        <button id="close-panel" class="ai-vscode-close">✕</button>
      </div>
      <div id="filename-preview" class="filename-preview">文件名预览...</div>

      <div id="prompt-section">
        <div class="prompt-section-header">
          <span>常用提示词</span>
        </div>
        <div id="prompt-buttons" class="prompt-buttons"></div>
      </div>

      <div class="ai-vscode-footer">
        <div class="button-group">
          <button id="send-to-vscode" class="primary">复制并保存</button>
          <button id="create-files-from-content" class="secondary" title="识别代码块中的路径并直接创建文件">识别并创建</button>
          <button id="patch-files-from-content" class="secondary" title="智能识别路径并局部更新文件内容">局部更新</button>
        </div>
        <div id="connection-status" class="connection-status">
          <span class="status-dot"></span>
          <span class="status-text">未连接</span>
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

    const closeButton = document.getElementById('close-panel');
    closeButton?.addEventListener('click', () => this.togglePanel());

    // 折叠按钮逻辑
    const toggleBtn = document.getElementById('toggle-prompts') as HTMLButtonElement | null;
    const promptSection = document.getElementById('prompt-section');

    if (toggleBtn && promptSection) {
      toggleBtn.addEventListener('click', () => {
        const collapsed = promptSection.classList.toggle('collapsed');
        toggleBtn.textContent = collapsed ? '▸' : '▾';

        // 如需记住用户选择，可以写入 local
        chrome.storage.local.set({ promptsCollapsed: collapsed });
      });

      // 初始化时读取折叠状态
      chrome.storage.local.get('promptsCollapsed', (res) => {
        if (res.promptsCollapsed) {
          promptSection.classList.add('collapsed');
          toggleBtn.textContent = '▸';
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

  private async handleSendClick(): Promise<void> {
    const overallStart = performance.now();
    console.group('🚀 [复制并保存] 完整流程');
    console.log('⏱️ 开始时间:', new Date().toLocaleTimeString());
    console.log('💾 初始内存:', this.getMemoryUsage());

    try {
      // AI Studio 特殊处理
      if (window.location.hostname.includes('aistudio.google.com')) {
        await this.handleAIStudioCopy();
        console.groupEnd();
        return;
      }

      // 步骤1：查找按钮
      console.log('\n📍 步骤1: 查找复制按钮');
      const copyButton = DOMHelper.findLatestCopyButton();

      if (!copyButton) {
        console.error('❌ 未找到COPY按钮');
        this.showError('未找到COPY按钮');
        console.groupEnd();
        return;
      }

      // 步骤2：点击按钮
      console.log('\n📍 步骤2: 点击复制按钮');
      console.time('点击复制');
      copyButton.click();
      console.timeEnd('点击复制');

      // 步骤3：等待复制完成
      console.log('\n📍 步骤3: 等待复制完成 (300ms)');
      await this.delay(300);

      // 步骤4：读取剪贴板
      console.log('\n📍 步骤4: 读取剪贴板');
      const content = await DOMHelper.getClipboardContent();

      if (!content || content.trim().length === 0) {
        console.error('❌ 剪贴板内容为空');
        this.showError('剪贴板内容为空');
        console.groupEnd();
        return;
      }

      // 步骤5：生成文件名
      console.log('\n📍 步骤5: 生成文件名');
      console.time('生成文件名');
      const filename = this.generateSmartFilename(content);
      console.timeEnd('生成文件名');
      console.log('📝 文件名:', filename);

      // 步骤6：发送到VS Code
      console.log('\n📍 步骤6: 发送到VS Code');
      this.showFilenamePreview(filename);
      this.sendToVSCode(content, filename);

      // 步骤7：更新计数器
      console.log('\n📍 步骤7: 更新计数器');
      await this.updateDailyCounter();

      const overallEnd = performance.now();
      console.log('\n✅ 流程完成');
      console.log('⏱️ 总耗时:', (overallEnd - overallStart).toFixed(2), 'ms');
      console.log('💾 结束内存:', this.getMemoryUsage());
      console.groupEnd();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('❌ 流程失败:', error);
      console.log('💾 错误时内存:', this.getMemoryUsage());
      this.showError(`操作失败：${errorMessage}`);
      console.groupEnd();
    }
  }

  private async handleCreateFilesClick(): Promise<void> {
    console.group('🚀 [识别并创建文件] 流程开始');
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
        this.showError('未获取到内容，请确保页面上有可复制的回答');
        console.groupEnd();
        return;
      }

      // 2. 解析代码块
      const files = this.parseFilesFromContent(content);
      if (files.length === 0) {
        this.showError('未在代码块中识别到有效的文件路径');
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
        this.showSuccess(`✅ 成功识别并创建 ${successCount} 个文件`);
        await this.updateDailyCounter();
      } else {
        this.showError('创建文件失败，请检查连接');
      }

    } catch (error) {
      console.error('识别并创建文件失败:', error);
      this.showError('识别并创建文件失败');
    } finally {
      console.groupEnd();
    }
  }

  private async handlePartialUpdateClick(): Promise<void> {
    console.group('🚀 [局部更新文件] 流程开始');
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
        this.showError('未获取到内容');
        console.groupEnd();
        return;
      }

      // 2. 解析代码块
      const files = this.parseFilesFromContent(content);
      if (files.length === 0) {
        this.showError('未识别到有效的文件路径');
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
        this.showSuccess(`✅ 成功发送 ${successCount} 个局部更新请求`);
        await this.updateDailyCounter();
      } else {
        this.showError('更新请求发送失败');
      }

    } catch (error) {
      console.error('局部更新失败:', error);
      this.showError('局部更新失败');
    } finally {
      console.groupEnd();
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
        console.log(`⏭️ 切片 ${i}: 未检测到路径，跳过 (前50字符: "${slice.substring(0, 50).replace(/\n/g, '\\n')}...")`);
        continue;
      }

      // 在切片内寻找代码块 - 使用 lastIndexOf 找最后一个闭合标记
      const blockStartMatch = slice.match(/```(\w+)?[\r\n]+/);
      if (!blockStartMatch) {
        console.log(`⚠️ 切片 ${i}: 路径 "${detectedPath}" 后未找到代码块开始`);
        continue;
      }

      const lang = blockStartMatch[1] || 'text';
      const contentStart = blockStartMatch.index! + blockStartMatch[0].length;

      // 关键修复：在切片内寻找【最后一个】闭合标记
      const lastClosingIndex = slice.lastIndexOf('```');

      if (lastClosingIndex <= contentStart) {
        console.log(`⚠️ 切片 ${i}: 路径 "${detectedPath}" 的代码块未正确闭合`);
        continue;
      }

      const blockContent = slice.substring(contentStart, lastClosingIndex).trim();
      console.log(`📦 切片 ${i}: 代码块长度 ${blockContent.length} chars`);

      // 路径处理
      let fullPath = detectedPath.replace(/^\.?\//, '');
      const parts = fullPath.split('/');
      const filename = parts.pop() || '';
      let savePath = parts.join('/');

      console.log(`📂 路径解析: fullPath="${fullPath}", filename="${filename}", savePath="${savePath}"`);

      // 路径记忆
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

    console.log(`📦 总共提取 ${files.length} 个文件`);
    return files;
  }

  private async sendToVSCode(content: string, filename: string, customSavePath?: string, type: 'save' | 'patch' = 'save'): Promise<void> {
    try {
      // 获取保存路径配置
      const settings = await chrome.storage.sync.get({ savePath: '' });
      const defaultSavePath = (settings.savePath || '').trim();

      // 如果有自定义路径，则拼接到默认路径后，或者直接使用
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
            reject(new Error(response?.error || '未知错误'));
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
    return '不可用';
  }


  // 新增：专门处理 AI Studio 的复制
  private async handleAIStudioCopy(): Promise<void> {
    try {
      this.debugLog('🔍 AI Studio 特殊处理：查找菜单按钮');

      // 1. 查找所有的 more_vert 按钮
      const moreButtons = Array.from(document.querySelectorAll<HTMLElement>(
        'button[aria-label*="options"], ' +
        'button[iconname="more_vert"], ' +
        'button[aria-label*="Open options"], ' +
        'ms-chat-turn-options button'
      ));

      if (moreButtons.length === 0) {
        this.showError('未找到菜单按钮');
        return;
      }

      // 获取最后一个（最新的回答）
      const menuButton = moreButtons[moreButtons.length - 1];
      this.debugLog('✅ 找到菜单按钮，准备点击');

      // 2. 点击菜单按钮展开菜单
      menuButton.click();
      this.debugLog('✅ 菜单已展开，等待加载...');

      // 3. 等待菜单展开
      await this.delay(500);

      // 4. 查找复制按钮
      const copyButton = DOMHelper.findLatestCopyButton();

      if (!copyButton) {
        console.error('❌ 菜单展开后仍未找到复制按钮');
        this.showError('未找到复制按钮');
        // 关闭菜单
        menuButton.click();
        return;
      }

      this.debugLog('✅ 找到复制按钮，准备点击');

      // 5. 点击复制按钮
      copyButton.click();

      // 6. 等待复制完成
      await this.delay(300);

      // 7. 读取剪贴板内容
      const content = await DOMHelper.getClipboardContent();

      if (!content || content.trim().length === 0) {
        this.showError('剪贴板内容为空');
        return;
      }

      this.debugLog('✅ 读取到内容，长度:', content.length);

      // 内容长度限制检查
      if (content.length > 50000) { // 50KB限制
        this.showError('对话内容过长，无法直接复制，请分批操作！');
        return;
      }

      // 8. 生成文件名并保存
      const filename = this.generateSmartFilename(content);
      this.debugLog('📝 生成文件名:', filename);

      this.showFilenamePreview(filename);
      this.sendToVSCode(content, filename);
      await this.updateDailyCounter();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('AI Studio 复制失败:', error);
      this.showError(`操作失败：${errorMessage}`);
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

    // 组合文件名
    return `${date}-${time}-${sequence}-${shortSentence}.md`;
  }

  private extractFirstSentence(content: string): string {
    // 移除Markdown标记
    let text = content.trim();
    text = text.replace(/^#+\s+/gm, ''); // 移除标题符号
    text = text.replace(/\*\*(.+?)\*\*/g, '$1'); // 移除加粗
    text = text.replace(/\*(.+?)\*/g, '$1'); // 移除斜体
    text = text.replace(/`(.+?)`/g, '$1'); // 移除代码标记
    text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // 移除链接，保留文本

    // 分割成句子（按句号、问号、感叹号、换行）
    const sentences = text.split(/[。.!?！？\n]/);

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
    // 移除常见的开场白
    const removePatterns = [
      /^好的[！!，,。.\s]*/i,
      /^当然[！!，,。.\s]*/i,
      /^我会[^\s]{0,5}/i,
      /^我将[^\s]{0,5}/i,
      /^让我[^\s]{0,5}/i,
      /^明白[了吗]?[！!，,。.\s]*/i,
      /^收到[！!，,。.\s]*/i,
      /^好[的啦][！!，,。.\s]*/i,
      /^OK[！!，,。.\s]*/i,
      /^了解[！!，,。.\s]*/i,
      /^没问题[！!，,。.\s]*/i
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

    // 在maxLength处截断，但尝试在合适的位置（如连字符处）
    let truncated = text.substring(0, maxLength);
    const lastDash = truncated.lastIndexOf('-');

    if (lastDash > maxLength * 0.7) {
      // 如果在后70%有连字符，在那里截断
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
      if (statusText) statusText.textContent = '已连接';
      if (statusDot) statusDot.classList.add('active');
    } else {
      this.statusElement.classList.remove('connected');
      if (statusText) statusText.textContent = '未连接';
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
          onmouseover="this.style.background='#5f4dd1'"
          onmouseout="this.style.background='#6c5ce7'"
        >
          📝 ${this.escapeHtml(prompt.name)}
        </button>
      `)
      .join('');

    // 保存提示词内容到按钮的自定义属性
    const buttons = this.promptButtons.querySelectorAll('.prompt-btn');
    buttons.forEach((btn, index) => {
      (btn as any).__promptContent = prompts.filter(p => p.enabled)[index].path;

      btn.addEventListener('click', (e) => {
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
        this.showError('提示词内容为空');
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
        this.showError('未找到 System Instructions 按钮');
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
        this.showError('未找到文本框');
        // 尝试关闭可能打开的对话框
        this.closeSystemInstructionsDialog();
        return;
      }

      console.log('✅ 找到文本框');

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

      console.log('✅ 内容已填充');

      // 7. 等待 Angular 更新
      await this.delay(800);

      // 8. 关闭对话框
      this.closeSystemInstructionsDialog();

      this.showSuccess(`✅ 已应用: ${promptName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('应用提示词失败:', error);
      this.showError(`应用失败：${errorMessage}`);
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
          console.log('✅ 已自动关闭System Instructions界面');
        } catch (error) {
          console.error('点击关闭按钮失败:', error);
          // 尝试其他方式触发点击
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          closeBtn.dispatchEvent(clickEvent);
          console.log('✅ 已通过事件触发关闭System Instructions界面');
        }
      } else {
        console.warn('❌ 关闭按钮不可用或已禁用', {
          isVisible,
          isDisabled,
          isEnabled
        });
      }
    } else {
      console.warn('❌ 未找到可用的关闭按钮');
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

// 初始化
new FloatingPanel();

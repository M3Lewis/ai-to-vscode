import { DOMHelper } from './utils/dom';
import { MessageToVSCode, MessageResponse, ConnectionStatus } from './types';

class FloatingPanel {
  private panel: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private enabled: boolean = false;
  private dailyCounter: number = 1;

  constructor() {
    this.initialize();

  }

  private async initialize(): Promise<void> {
    await this.checkAndInitialize();
    await this.loadDailyCounter();

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
      <div class="panel-header">
        <span>发送到VS Code</span>
        <button class="close-btn" id="close-panel">×</button>
      </div>
      <div class="filename-preview" id="filename-preview" style="
        font-size: 11px;
        color: #888;
        padding: 6px 8px;
        background: #2d2d2d;
        border-radius: 4px;
        margin-bottom: 8px;
        word-break: break-all;
        display: none;
      ">
        文件名预览...
      </div>
      <button id="send-to-vscode">复制并保存</button>
      <div class="status" id="connection-status">
        <span class="status-dot"></span>
        <span class="status-text">未连接</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(this.panel);
  DOMHelper.makeDraggable(this.panel);
  
  const sendButton = document.getElementById('send-to-vscode');
  sendButton?.addEventListener('click', () => this.handleSendClick());

  const closeButton = document.getElementById('close-panel');
  closeButton?.addEventListener('click', () => this.togglePanel());
  
  this.statusElement = document.getElementById('connection-status');
}



  private togglePanel(): void {
    if (this.panel) {
      this.panel.style.display = 
        this.panel.style.display === 'none' ? 'block' : 'none';
    }
  }

  private async handleSendClick(): Promise<void> {
  try {
    console.log('🚀 开始发送流程...');
    
    // 特殊处理：AI Studio 需要先打开菜单
    if (window.location.hostname.includes('aistudio.google.com')) {
      await this.handleAIStudioCopy();
      return;
    }
    
    const copyButton = DOMHelper.findLatestCopyButton();
    
    if (!copyButton) {
      console.error('❌ 未找到COPY按钮');
      this.showError('未找到COPY按钮，请在设置中配置选择器');
      return;
    }

    console.log('✅ 找到按钮，准备点击');
    copyButton.click();
    
    await this.delay(300);
    
    const content = await DOMHelper.getClipboardContent();
    
    if (!content || content.trim().length === 0) {
      this.showError('剪贴板内容为空');
      return;
    }

    console.log('✅ 读取到内容，长度:', content.length);
    
    const filename = this.generateSmartFilename(content);
    console.log('📝 生成文件名:', filename);
    
    this.showFilenamePreview(filename);
    this.sendToVSCode(content, filename);
    await this.updateDailyCounter();
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('发送失败:', error);
    this.showError(`操作失败：${errorMessage}`);
  }
}

// 新增：专门处理 AI Studio 的复制
private async handleAIStudioCopy(): Promise<void> {
  try {
    console.log('🔍 AI Studio 特殊处理：查找菜单按钮');
    
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
    console.log('✅ 找到菜单按钮，准备点击');
    
    // 2. 点击菜单按钮展开菜单
    menuButton.click();
    console.log('✅ 菜单已展开，等待加载...');
    
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
    
    console.log('✅ 找到复制按钮，准备点击');
    
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

    console.log('✅ 读取到内容，长度:', content.length);
    
    // 8. 生成文件名并保存
    const filename = this.generateSmartFilename(content);
    console.log('📝 生成文件名:', filename);
    
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

  private sendToVSCode(content: string, filename: string): void {
  const message: MessageToVSCode = {
    action: 'sendToVSCode',
    content,
    filename
  };
  
  console.log('📤 发送到VS Code:', filename);
  
  // 设置超时
  const timeout = setTimeout(() => {
    this.showError('发送超时，请检查VS Code是否已启动WebSocket服务');
  }, 5000);
  
  chrome.runtime.sendMessage(message, (response: MessageResponse) => {
    clearTimeout(timeout);
    
    if (chrome.runtime.lastError) {
      console.error('扩展通信失败:', chrome.runtime.lastError);
      this.showError('扩展通信失败，请重新加载页面');
      return;
    }
    
    if (response && response.success) {
      this.showSuccess(`✅ 已保存: ${filename}`);
    } else {
      const errorMsg = response?.error || '未知错误';
      this.showError(`发送失败：${errorMsg}`);
    }
  });
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
}

// 初始化
new FloatingPanel();

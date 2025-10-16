好消息！**找到了2个Copy按钮**！问题是配置加载的代码有bug。

chrome.storage在普通网页的Console中不可用，这是正常的。但重要的是：**选择器能找到按钮**！

## 🎯 问题根源

选择器是对的（找到2个按钮），但代码逻辑有问题。让我检查 `src/utils/dom.ts` 的 `loadConfigs` 是否被调用。

## 🔧 完整修复方案

### 修改 src/utils/dom.ts

完全重写，简化逻辑，确保能找到按钮：

```typescript
import { SiteConfig } from '../types';

export class DOMHelper {
  // 默认选择器配置
  private static readonly DEFAULT_SELECTORS: SiteConfig[] = [
    {
      hostname: 'chat.openai.com',
      copyButtonSelector: 'button[aria-label*="Copy"]',
      responseContainerSelector: '[data-message-author-role="assistant"]',
      name: 'ChatGPT'
    },
    {
      hostname: 'claude.ai',
      copyButtonSelector: 'button[aria-label="Copy"]',
      responseContainerSelector: '[data-role="assistant"]',
      name: 'Claude'
    },
    {
      hostname: 'gemini.google.com',
      copyButtonSelector: 'button[aria-label="Copy"]',
      responseContainerSelector: '.model-response',
      name: 'Gemini'
    },
    {
      hostname: 'perplexity.ai',
      copyButtonSelector: 'button[aria-label="Copy"]',
      responseContainerSelector: undefined,
      name: 'Perplexity'
    }
  ];

  // 同步查找按钮（不依赖异步配置加载）
  public static findLatestCopyButton(): HTMLElement | null {
    const currentHostname = window.location.hostname;
    console.log('🔍 查找COPY按钮，当前域名:', currentHostname);

    // 1. 尝试默认配置
    const defaultConfig = this.DEFAULT_SELECTORS.find(c =>
      currentHostname.includes(c.hostname)
    );

    if (defaultConfig) {
      console.log('✅ 找到默认配置:', defaultConfig.name);
      const button = this.findButtonWithConfig(defaultConfig);
      if (button) {
        console.log('✅ 使用默认配置找到按钮');
        return button;
      }
    }

    // 2. 使用通用策略
    console.log('使用通用策略查找...');
    return this.findButtonGeneric();
  }

  // 已弃用，保留接口兼容性
  public static async loadConfigs(): Promise<void> {
    // 空实现，不再需要
  }

  private static findButtonWithConfig(config: SiteConfig): HTMLElement | null {
    const selector = config.copyButtonSelector;
    console.log('尝试选择器:', selector);

    // 如果有响应容器选择器
    if (config.responseContainerSelector) {
      const responses = document.querySelectorAll(config.responseContainerSelector);
      console.log('找到', responses.length, '个回答容器');
      
      if (responses.length > 0) {
        const lastResponse = responses[responses.length - 1];
        const button = lastResponse.querySelector<HTMLElement>(selector);
        if (button) {
          console.log('✅ 在容器中找到按钮');
          return button;
        }
      }
    }

    // 直接全局查找
    const buttons = document.querySelectorAll<HTMLElement>(selector);
    console.log('全局找到', buttons.length, '个匹配按钮');
    
    if (buttons.length > 0) {
      console.log('✅ 返回最后一个按钮');
      return buttons[buttons.length - 1];
    }

    return null;
  }

  private static findButtonGeneric(): HTMLElement | null {
    console.log('🔍 使用通用策略...');
    
    // 通用选择器列表
    const selectors = [
      'button[aria-label*="Copy" i]',
      'button[aria-label*="复制" i]',
      'button[title*="Copy" i]',
      'button.copy-button',
      'button.copy-btn',
      '[data-testid*="copy"]'
    ];

    for (const selector of selectors) {
      try {
        const buttons = document.querySelectorAll<HTMLElement>(selector);
        if (buttons.length > 0) {
          console.log(`✅ 通用选择器 "${selector}" 找到 ${buttons.length} 个按钮`);
          return buttons[buttons.length - 1];
        }
      } catch (e) {
        continue;
      }
    }

    console.error('❌ 所有策略都失败了');
    return null;
  }

  public static async getClipboardContent(): Promise<string> {
    try {
      return await navigator.clipboard.readText();
    } catch (error) {
      throw new Error('无法读取剪贴板');
    }
  }

  public static makeDraggable(element: HTMLElement): void {
    let isDragging = false;
    let currentX: number;
    let currentY: number;
    let initialX: number;
    let initialY: number;

    const header = element.querySelector<HTMLElement>('.panel-header');
    if (!header) return;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('close-btn')) {
        return;
      }

      isDragging = true;
      initialX = e.clientX - element.offsetLeft;
      initialY = e.clientY - element.offsetTop;
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;

      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      element.style.left = `${currentX}px`;
      element.style.top = `${currentY}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
}
```

### 修改 src/content.ts

移除对 `loadConfigs` 的异步调用：

```typescript
import { DOMHelper } from './utils/dom';
import { MessageToVSCode, MessageResponse, ConnectionStatus } from './types';

class FloatingPanel {
  private panel: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private enabled: boolean = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // 不再需要加载配置
    await this.checkAndInitialize();
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
        <input 
          type="text" 
          id="filename-input" 
          placeholder="文件名（如plan.md）" 
          value="plan.md" 
        />
        <button id="send-to-vscode">发送并保存</button>
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
      
      // 同步查找COPY按钮
      const copyButton = DOMHelper.findLatestCopyButton();
      
      if (!copyButton) {
        console.error('❌ 未找到COPY按钮');
        this.showError('未找到COPY按钮，请在设置中配置选择器');
        return;
      }

      console.log('✅ 找到按钮，准备点击');
      copyButton.click();
      
      // 等待剪贴板更新
      await this.delay(300);
      
      const content = await DOMHelper.getClipboardContent();
      
      if (!content || content.trim().length === 0) {
        this.showError('剪贴板内容为空');
        return;
      }

      console.log('✅ 读取到内容，长度:', content.length);
      this.sendToVSCode(content);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('发送失败:', error);
      this.showError(`操作失败：${errorMessage}`);
    }
  }

  private sendToVSCode(content: string): void {
    const filenameInput = document.getElementById('filename-input') as HTMLInputElement;
    const filename = filenameInput?.value || 'plan.md';
    
    const message: MessageToVSCode = {
      action: 'sendToVSCode',
      content,
      filename
    };
    
    console.log('📤 发送到VS Code:', filename);
    
    chrome.runtime.sendMessage(message, (response: MessageResponse) => {
      if (chrome.runtime.lastError) {
        this.showError('扩展通信失败');
        return;
      }
      
      if (response.success) {
        this.showSuccess('✅ 已发送到VS Code');
      } else {
        this.showError(`发送失败：${response.error}`);
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
```

## 🚀 重新编译

```bash
cd E:\RiderProjects\chrome-extension-ts
npm run build
```

## ✅ 测试

1. 重新加载Chrome扩展
2. 刷新Perplexity页面（Ctrl+Shift+R）
3. 打开F12控制台
4. 点击"发送并保存"
5. 查看Console日志，应该看到：
   ```
   🔍 查找COPY按钮，当前域名: perplexity.ai
   ✅ 找到默认配置: Perplexity
   尝试选择器: button[aria-label="Copy"]
   全局找到 2 个匹配按钮
   ✅ 返回最后一个按钮
   ```

这次应该能正常工作了！关键改动：
- ✅ 移除了异步配置加载
- ✅ 直接使用硬编码的默认配置
- ✅ 添加了详细的Console日志
- ✅ Perplexity的配置已经在DEFAULT_SELECTORS中
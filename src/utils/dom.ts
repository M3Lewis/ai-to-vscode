import { SiteConfig } from '../types';

export class DOMHelper {
  private static readonly DEFAULT_SELECTORS: SiteConfig[] = [
    {
      hostname: 'chat.openai.com',
      copyButtonSelector: 'button[aria-label*="Copy"]',
      responseContainerSelector: '[data-message-author-role="assistant"]',
      name: 'ChatGPT'
    },
    {
      hostname: 'claude.ai',
      copyButtonSelector: 'button[data-testid="action-bar-copy"]',
      responseContainerSelector: undefined,
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
    },
    {
      hostname: 'aistudio.google.com',
      copyButtonSelector: 'button[mat-menu-item][jslog^="282205"]',
      responseContainerSelector: undefined,
      name: 'AI Studio'
    }
  ];

  public static findLatestCopyButton(): HTMLElement | null {
    const currentHostname = window.location.hostname;
    console.log('🔍 查找COPY按钮，当前域名:', currentHostname);

    // 针对Perplexity使用专用查找策略
    if (currentHostname.includes('perplexity.ai')) {
      return this.findPerplexityCopyButton();
    }

    // 其它站点仍然可以用默认策略
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

    console.log('使用通用策略查找...');
    return this.findButtonGeneric();
  }

  public static async loadConfigs(): Promise<void> {
    // 空实现，保留接口兼容性
  }

  // 推荐专用方法 - Perplexity专用查找
  private static findPerplexityCopyButton(): HTMLElement | null {
    console.log('🔍 使用 Perplexity 专用查找逻辑');
  
    // 这里按你的路径简化版本
    const replyContainers = document.querySelectorAll(
      'div.py-md.md\\:pb-headerHeight.mx-auto.max-w-threadContentWidth > div'
    );
  
    if (replyContainers.length === 0) {
      console.log('❌ 未找到回复容器');
      return null;
    }
  
    console.log(`✅ 找到 ${replyContainers.length} 个回复容器`);
  
    // 依然取最后一个回复容器作为最新回复
    const lastReply = replyContainers[replyContainers.length - 1];
  
    // 查找复制按钮，优先尝试常用的data-testid及aria-label选择器
    const copyBtns = lastReply.querySelectorAll<HTMLElement>(
      'button[aria-label*="Copy"], button[data-testid*="copy"]'
    );
  
    if (copyBtns.length > 0) {
      console.log(`✅ 在最新回复中找到 ${copyBtns.length} 个复制按钮`);
      return copyBtns[copyBtns.length - 1]; 
    }
  
    // 进一步递归查找包含“copy”关键词的按钮
    console.log('⚠️ 未找到标准复制按钮，尝试递归搜索...');
    const allButtons = Array.from(lastReply.querySelectorAll<HTMLElement>('button'));
  
    for (const button of allButtons) {
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
      const dataTestId = button.getAttribute('data-testid')?.toLowerCase() || '';
      const text = button.textContent?.toLowerCase() || '';
  
      if (ariaLabel.includes('copy') || dataTestId.includes('copy') || text.includes('copy')) {
        console.log('✅ 通过递归搜索找到复制按钮');
        return button;
      }
    }
  
    console.log('❌ 未找到 Perplexity 复制按钮');
    return null;
  }
  

  private static findButtonWithConfig(config: SiteConfig): HTMLElement | null {
    const selector = config.copyButtonSelector;
    console.log('尝试选择器:', selector);

    // 特殊处理：AI Studio 的菜单按钮
    if (window.location.hostname.includes('aistudio.google.com')) {
      return this.findAIStudioCopyButton();
    }

    // 特殊处理：Claude 的按钮（可能有多个，取最后一个）
    if (window.location.hostname.includes('claude.ai')) {
      return this.findClaudeCopyButton();
    }

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

    const buttons = document.querySelectorAll<HTMLElement>(selector);
    console.log('全局找到', buttons.length, '个匹配按钮');
    
    if (buttons.length > 0) {
      console.log('✅ 返回最后一个按钮');
      return buttons[buttons.length - 1];
    }

    return null;
  }

  // 新增：专门处理 Claude
private static findClaudeCopyButton(): HTMLElement | null {
  console.log('🔍 使用 Claude 专用查找逻辑');
  
  // 方法1：通过 data-testid 查找（最准确）
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('button[data-testid="action-bar-copy"]'));
  
  if (buttons.length > 0) {
    console.log(`✅ 找到 ${buttons.length} 个 Claude 复制按钮`);
    return buttons[buttons.length - 1];
  }
  
  // ⚠️ 备用方案：限制在对话区域内查找
  const conversationArea = document.querySelector('main, [role="main"], .conversation-container');
  if (!conversationArea) {
    console.log('❌ 未找到对话区域');
    return null;
  }
  
  // 只在对话区域内查找按钮
  const allButtons = Array.from(conversationArea.querySelectorAll<HTMLElement>('button'));
  for (let i = allButtons.length - 1; i >= 0; i--) {
    const btn = allButtons[i];
    const svg = btn.querySelector('svg');
    if (svg) {
      const path = svg.querySelector('path');
      if (path) {
        const d = path.getAttribute('d') || '';
        if (d.includes('M10 1.5C11.1097') || d.includes('clipboard')) {
          console.log('✅ 通过 SVG 路径找到 Claude 复制按钮');
          return btn;
        }
      }
    }
  }
  
  console.log('❌ 未找到 Claude 复制按钮');
  return null;
}


  private static findAIStudioCopyButton(): HTMLElement | null {
  console.log('🔍 使用 AI Studio 专用查找逻辑');
  
  // 方法1：通过 jslog 属性精确查找
  const buttonByJslog = document.querySelector<HTMLElement>('button[mat-menu-item][jslog^="282205"]');
  if (buttonByJslog) {
    console.log('✅ 通过 jslog="282205" 找到按钮');
    return buttonByJslog;
  }
  
  // 方法2：通过 class "copy-markdown-button" 查找
  const iconElement = document.querySelector<HTMLElement>('.copy-markdown-button');
  if (iconElement) {
    const parentButton = iconElement.closest('button[mat-menu-item]');
    if (parentButton) {
      console.log('✅ 通过 .copy-markdown-button class 找到按钮');
      return parentButton as HTMLElement;
    }
  }
  
  // 方法3：查找包含 "Copy as markdown" 文本的按钮
  const menuItems = Array.from(document.querySelectorAll<HTMLElement>('button[mat-menu-item]'));
  
  for (const item of menuItems) {
    const text = item.textContent?.trim() || '';
    
    if (text === 'Copy as markdown' || text.toLowerCase().includes('copy as markdown')) {
      console.log('✅ 通过文本 "Copy as markdown" 找到按钮');
      return item;
    }
  }
  
  // 方法4：查找包含 "markdown" 的按钮
  for (const item of menuItems) {
    const text = item.textContent?.toLowerCase() || '';
    
    if (text.includes('markdown') && text.includes('copy')) {
      console.log('✅ 找到包含 markdown 和 copy 的按钮:', text);
      return item;
    }
  }
  
  // 方法5：查找所有可见的菜单按钮中第一个包含"copy"的
  for (const item of menuItems) {
    const text = item.textContent?.toLowerCase() || '';
    
    if (text.includes('copy')) {
      console.log('✅ 找到包含 copy 的按钮:', text);
      return item;
    }
  }
  
  // 如果菜单未展开，尝试找到菜单触发按钮
  console.log('⚠️ 菜单可能未展开，尝试查找菜单按钮');
  const menuButtons = Array.from(document.querySelectorAll<HTMLElement>('button[aria-label*="options"], button[iconname="more_vert"]'));
  
  if (menuButtons.length > 0) {
    console.log('✅ 找到', menuButtons.length, '个菜单触发按钮');
    return menuButtons[menuButtons.length - 1];
  }
  
  console.log('❌ 未找到按钮');
  return null;
}


  private static findButtonGeneric(): HTMLElement | null {
  console.log('🔍 使用通用策略...');
  
  const selectors = [
    'button[data-testid*="copy"]',
    'button[aria-label*="Copy" i]',
    'button[aria-label*="复制" i]',
    'button[title*="Copy" i]',
    'button.copy-button',
    'button.copy-btn',
    '[data-testid*="copy"]'
  ];

  // 添加性能保护：限制查找范围
  const searchRoot = document.querySelector('main, [role="main"], #root') || document;

  for (const selector of selectors) {
    try {
      const buttons = searchRoot.querySelectorAll<HTMLElement>(selector);
      if (buttons.length > 0) {
        console.log(`✅ 通用选择器 "${selector}" 找到 ${buttons.length} 个按钮`);
        
        // 🔥 性能保护：如果按钮数量异常多，只检查最后10个
        if (buttons.length > 100) {
          console.warn(`⚠️ 按钮数量过多 (${buttons.length})，只检查最后10个`);
          const recentButtons = Array.from(buttons).slice(-10);
          return recentButtons[recentButtons.length - 1];
        }
        
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

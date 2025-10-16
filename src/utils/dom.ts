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
      // 返回最后一个（最新的回答）
      return buttons[buttons.length - 1];
    }
    
    // 方法2：通过 SVG 路径查找（复制图标的特征）
    const allButtons = Array.from(document.querySelectorAll<HTMLElement>('button'));
    for (let i = allButtons.length - 1; i >= 0; i--) {
      const btn = allButtons[i];
      const svg = btn.querySelector('svg');
      if (svg) {
        const path = svg.querySelector('path');
        if (path) {
          const d = path.getAttribute('d') || '';
          // Claude 复制按钮的 SVG path 包含特定的路径
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
      'button[data-testid*="copy"]', // 新增：优先查找 data-testid
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

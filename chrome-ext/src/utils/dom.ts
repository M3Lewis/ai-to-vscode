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
    const perfStart = performance.now();
    console.group('🔍 [性能监控] 查找COPY按钮');

    const currentHostname = window.location.hostname;
    console.log('📍 当前域名:', currentHostname);
    console.log('⏱️ 开始时间:', new Date().toLocaleTimeString());

    let result: HTMLElement | null = null;

    try {
      if (currentHostname.includes('perplexity.ai')) {
        console.log('🎯 使用 Perplexity 专用查找');
        result = this.findPerplexityCopyButton();
      } else {
        const defaultConfig = this.DEFAULT_SELECTORS.find(c =>
          currentHostname.includes(c.hostname)
        );

        if (defaultConfig) {
          console.log('✅ 找到默认配置:', defaultConfig.name);
          result = this.findButtonWithConfig(defaultConfig);
        } else {
          console.log('⚠️ 使用通用策略查找');
          result = this.findButtonGeneric();
        }
      }
    } catch (error) {
      console.error('❌ 查找按钮时发生错误:', error);
    }

    const perfEnd = performance.now();
    const timeTaken = (perfEnd - perfStart).toFixed(2);

    console.log('⏱️ 查找耗时:', timeTaken, 'ms');
    console.log('📊 结果:', result ? '✅ 找到按钮' : '❌ 未找到按钮');
    console.log('💾 当前内存使用:', this.getMemoryUsage());
    console.groupEnd();

    return result;
  }

  public static async loadConfigs(): Promise<void> {
    // 空实现，保留接口兼容性
  }

  private static findPerplexityCopyButton(): HTMLElement | null {
    const startTime = performance.now();
    console.group('🔍 [Perplexity] 专用查找');

    try {
      // 步骤1：查找回复容器
      console.time('查找回复容器');
      const replyContainers = document.querySelectorAll(
        'div.py-md.md\\:pb-headerHeight.mx-auto.max-w-threadContentWidth > div'
      );
      console.timeEnd('查找回复容器');

      console.log('📦 回复容器数量:', replyContainers.length);

      if (replyContainers.length === 0) {
        console.warn('❌ 未找到回复容器');
        console.groupEnd();
        return null;
      }

      // 步骤2：获取最后一个容器
      const lastReply = replyContainers[replyContainers.length - 1];
      console.log('📍 使用最后一个容器 (索引:', replyContainers.length - 1, ')');

      // 步骤3：查找复制按钮
      console.time('查找复制按钮');
      const copyBtns = lastReply.querySelectorAll<HTMLElement>(
        'button[aria-label*="Copy"], button[data-testid*="copy"]'
      );
      console.timeEnd('查找复制按钮');

      console.log('🔘 复制按钮数量:', copyBtns.length);

      if (copyBtns.length > 0) {
        const selectedBtn = copyBtns[copyBtns.length - 1];
        console.log('✅ 选中按钮:', {
          ariaLabel: selectedBtn.getAttribute('aria-label'),
          dataTestId: selectedBtn.getAttribute('data-testid'),
          text: selectedBtn.textContent?.trim().substring(0, 20)
        });
        console.log('⏱️ Perplexity查找耗时:', (performance.now() - startTime).toFixed(2), 'ms');
        console.groupEnd();
        return selectedBtn;
      }

      // 步骤4：递归搜索
      console.warn('⚠️ 未找到标准复制按钮，尝试递归搜索');
      console.time('递归搜索按钮');
      const allButtons = Array.from(lastReply.querySelectorAll<HTMLElement>('button'));
      console.log('🔍 容器内按钮总数:', allButtons.length);

      for (let i = 0; i < allButtons.length; i++) {
        const button = allButtons[i];
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        const dataTestId = button.getAttribute('data-testid')?.toLowerCase() || '';
        const text = button.textContent?.toLowerCase() || '';

        if (ariaLabel.includes('copy') || dataTestId.includes('copy') || text.includes('copy')) {
          console.log('✅ 递归找到按钮 (索引:', i, ')');
          console.timeEnd('递归搜索按钮');
          console.groupEnd();
          return button;
        }
      }
      console.timeEnd('递归搜索按钮');

    } catch (error) {
      console.error('❌ Perplexity查找出错:', error);
    }

    console.warn('❌ Perplexity查找失败');
    console.groupEnd();
    return null;
  }

  private static findButtonWithConfig(config: SiteConfig): HTMLElement | null {
    const startTime = performance.now();
    console.group('🔍 [配置查找]', config.name);

    const selector = config.copyButtonSelector;
    console.log('🎯 选择器:', selector);

    try {
      // 特殊处理
      if (window.location.hostname.includes('aistudio.google.com')) {
        const result = this.findAIStudioCopyButton();
        console.log('⏱️ AI Studio查找耗时:', (performance.now() - startTime).toFixed(2), 'ms');
        console.groupEnd();
        return result;
      }

      if (window.location.hostname.includes('claude.ai')) {
        const result = this.findClaudeCopyButton();
        console.log('⏱️ Claude查找耗时:', (performance.now() - startTime).toFixed(2), 'ms');
        console.groupEnd();
        return result;
      }

      // 容器查找
      if (config.responseContainerSelector) {
        console.log('📦 使用容器选择器:', config.responseContainerSelector);
        console.time('查找容器');
        const responses = document.querySelectorAll(config.responseContainerSelector);
        console.timeEnd('查找容器');
        console.log('📦 容器数量:', responses.length);

        if (responses.length > 0) {
          const lastResponse = responses[responses.length - 1];
          console.time('容器内查找按钮');
          const button = lastResponse.querySelector<HTMLElement>(selector);
          console.timeEnd('容器内查找按钮');

          if (button) {
            console.log('✅ 在容器中找到按钮');
            console.groupEnd();
            return button;
          }
        }
      }

      // 全局查找
      console.warn('⚠️ 回退到全局查找');
      console.time('全局查找按钮');
      const buttons = document.querySelectorAll<HTMLElement>(selector);
      console.timeEnd('全局查找按钮');
      console.log('🔘 全局找到按钮数:', buttons.length);

      if (buttons.length > 0) {
        console.log('✅ 返回最后一个按钮');
        console.groupEnd();
        return buttons[buttons.length - 1];
      }

    } catch (error) {
      console.error('❌ 配置查找出错:', error);
    }

    console.warn('❌ 未找到按钮');
    console.log('⏱️ 总耗时:', (performance.now() - startTime).toFixed(2), 'ms');
    console.groupEnd();
    return null;
  }

  private static findClaudeCopyButton(): HTMLElement | null {
    console.group('🔍 [Claude] 专用查找');

    try {
      console.time('查找Claude按钮');
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('button[data-testid="action-bar-copy"]'));
      console.timeEnd('查找Claude按钮');
      console.log('🔘 找到按钮数:', buttons.length);

      if (buttons.length > 0) {
        console.groupEnd();
        return buttons[buttons.length - 1];
      }

      console.warn('⚠️ 使用SVG备用查找');
      console.time('SVG路径查找');
      const allButtons = Array.from(document.querySelectorAll<HTMLElement>('button'));
      console.log('🔍 页面按钮总数:', allButtons.length);

      if (allButtons.length > 1000) {
        console.error('❌ 按钮数量异常 (>1000)，可能导致性能问题！');
      }

      for (let i = allButtons.length - 1; i >= 0; i--) {
        const btn = allButtons[i];
        const svg = btn.querySelector('svg');
        if (svg) {
          const path = svg.querySelector('path');
          if (path) {
            const d = path.getAttribute('d') || '';
            if (d.includes('M10 1.5C11.1097') || d.includes('clipboard')) {
              console.log('✅ 通过SVG找到 (索引:', i, ')');
              console.timeEnd('SVG路径查找');
              console.groupEnd();
              return btn;
            }
          }
        }
      }
      console.timeEnd('SVG路径查找');

    } catch (error) {
      console.error('❌ Claude查找出错:', error);
    }

    console.groupEnd();
    return null;
  }

  private static findAIStudioCopyButton(): HTMLElement | null {
    console.group('🔍 [AI Studio] 专用查找');

    try {
      const strategies = [
        { name: 'jslog属性', fn: () => document.querySelector<HTMLElement>('button[mat-menu-item][jslog^="282205"]') },
        {
          name: 'copy-markdown-button类', fn: () => {
            const icon = document.querySelector<HTMLElement>('.copy-markdown-button');
            return icon?.closest('button[mat-menu-item]') as HTMLElement;
          }
        },
        {
          name: 'Copy as markdown文本', fn: () => {
            const items = Array.from(document.querySelectorAll<HTMLElement>('button[mat-menu-item]'));
            return items.find(item => item.textContent?.toLowerCase().includes('copy as markdown')) || null;
          }
        }
      ];

      for (const strategy of strategies) {
        console.time(strategy.name);
        const result = strategy.fn();
        console.timeEnd(strategy.name);

        if (result) {
          console.log('✅ 策略成功:', strategy.name);
          console.groupEnd();
          return result;
        }
      }

    } catch (error) {
      console.error('❌ AI Studio查找出错:', error);
    }

    console.groupEnd();
    return null;
  }

  private static findButtonGeneric(): HTMLElement | null {
    console.group('🔍 [通用策略] 查找');

    const selectors = [
      'button[data-testid*="copy"]',
      'button[aria-label*="Copy" i]',
      'button[aria-label*="复制" i]',
      'button[title*="Copy" i]',
      'button.copy-button',
      'button.copy-btn',
      '[data-testid*="copy"]'
    ];

    for (const selector of selectors) {
      try {
        console.time(`选择器: ${selector}`);
        const buttons = document.querySelectorAll<HTMLElement>(selector);
        console.timeEnd(`选择器: ${selector}`);
        console.log(`  📊 找到 ${buttons.length} 个按钮`);

        if (buttons.length > 100) {
          console.warn(`  ⚠️ 按钮数量过多 (${buttons.length})，可能影响性能！`);
        }

        if (buttons.length > 0) {
          console.log('  ✅ 返回最后一个按钮');
          console.groupEnd();
          return buttons[buttons.length - 1];
        }
      } catch (e) {
        console.error(`  ❌ 选择器错误:`, e);
        continue;
      }
    }

    console.error('❌ 所有通用策略都失败了');
    console.groupEnd();
    return null;
  }

  public static async getClipboardContent(): Promise<string> {
    const startTime = performance.now();
    console.group('📋 [剪贴板] 读取内容');

    try {
      const content = await navigator.clipboard.readText();
      const timeTaken = (performance.now() - startTime).toFixed(2);

      console.log('✅ 读取成功');
      console.log('📏 内容长度:', content.length, '字符');
      console.log('⏱️ 读取耗时:', timeTaken, 'ms');

      if (content.length > 50000) {
        console.warn('⚠️ 内容过大 (>50KB)，可能影响性能！');
      }

      console.groupEnd();
      return content;
    } catch (error) {
      console.error('❌ 读取失败:', error);
      console.groupEnd();
      throw new Error('无法读取剪贴板');
    }
  }

  private static getMemoryUsage(): string {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const used = (memory.usedJSHeapSize / 1048576).toFixed(2);
      const total = (memory.totalJSHeapSize / 1048576).toFixed(2);
      return `${used} MB / ${total} MB`;
    }
    return '不可用';
  }

  public static makeDraggable(element: HTMLElement): void {
    let isDragging = false;
    let initialX: number;
    let initialY: number;

    // 修正：使用 content.ts 中定义的类名 .ai-vscode-header
    const header = element.querySelector<HTMLElement>('.ai-vscode-header');
    if (!header) return;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', (e: MouseEvent) => {
      // 如果点击的是按钮，不触发拖拽
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }

      isDragging = true;
      initialX = e.clientX - element.offsetLeft;
      initialY = e.clientY - element.offsetTop;

      // 增加拖拽时的样式
      element.style.transition = 'none';
      element.classList.add('dragging');
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;

      e.preventDefault();

      let newX = e.clientX - initialX;
      let newY = e.clientY - initialY;

      // 边界检查：防止拖出屏幕
      const padding = 10;
      const maxX = window.innerWidth - element.offsetWidth - padding;
      const maxY = window.innerHeight - element.offsetHeight - padding;

      newX = Math.max(padding, Math.min(newX, maxX));
      newY = Math.max(padding, Math.min(newY, maxY));

      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        element.classList.remove('dragging');
        // 恢复过渡效果（如果有的话）
        element.style.transition = '';
      }
    });
  }
}

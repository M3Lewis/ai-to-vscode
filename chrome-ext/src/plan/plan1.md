可以在你现有的悬浮窗 DOM 结构上很自然地加一个「折叠提示词」按钮：在 `createPanel` 里包一层提示词容器，加一个小按钮切换 `.collapsed` 类，再配一点 CSS 即可。[1][2]

下面按你当前的 `content.ts` 结构给出直接可用的改法。

***

## 1. 修改 createPanel：增加折叠按钮和容器

在 `createPanel()` 里，你现在是：

```ts
this.panel = document.createElement('div');
this.panel.id = 'ai-vscode-panel';
this.panel.innerHTML = `
  发送到VS Code

  文件名预览...

  复制并保存

  未连接
`;
document.body.appendChild(this.panel);

DOMHelper.makeDraggable(this.panel);

const sendButton = document.getElementById('send-to-vscode');
sendButton?.addEventListener('click', () => this.handleSendClick());

const closeButton = document.getElementById('close-panel');
closeButton?.addEventListener('click', () => this.togglePanel());

this.statusElement = document.getElementById('connection-status');
this.promptButtons = document.getElementById('prompt-buttons');

// 加载提示词按钮
this.loadPromptButtons();
```

改成带折叠区的版本（保留你原有 id，不动其它逻辑）：

```ts
private createPanel(): void {
  this.panel = document.createElement('div');
  this.panel.id = 'ai-vscode-panel';

  this.panel.innerHTML = `
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
      <button id="send-to-vscode" class="primary">复制并保存</button>
      <div id="connection-status" class="connection-status">
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
```

***

## 2. 增加 CSS：控制折叠效果

在你给 content script 注入的样式文件里（比如 `content.css` 或注入的 `<style>`）加上：

```css
#ai-vscode-panel {
  /* 你原来的样式保持不变 */
}

.ai-vscode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.ai-vscode-title {
  font-weight: 600;
  font-size: 13px;
}

.ai-vscode-toggle {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}

.ai-vscode-close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}

#prompt-section {
  margin-top: 6px;
  max-height: 260px;        /* 展开时的最大高度，可按需要调 */
  overflow: auto;
  transition: max-height 0.2s ease;
}

/* 折叠状态：高度为 0，内容隐藏 */
#prompt-section.collapsed {
  max-height: 0;
  overflow: hidden;
}

/* 提示词按钮容器本身保持不变，按你原来的样式来 */
.prompt-buttons {
  margin-top: 4px;
}

/* 如果你之前的 .prompt-btn 有样式，也保持不变 */
.prompt-btn {
  /* 原样式 */
}
```

这就能实现点击标题右边的小箭头，整块“常用提示词”区域上下折叠，同时不会影响“复制并保存”和连接状态显示。[2][1]

***

## 3. 不改你现有逻辑的前提

- `this.promptButtons` 仍然是 `#prompt-buttons`，`loadPromptButtons` 无需改。
- 悬浮窗拖拽、关闭、发送到 VS Code 等逻辑不受影响。
- 折叠状态存到 `chrome.storage.local`，下次刷新页面也能记住用户是展开还是折叠。

如果你愿意把现有 `createPanel` 的完整模板贴出来，也可以按你的实际 HTML 结构再帮你微调一版，做到“只加折叠，不动其它 DOM”。

[1](https://www.w3schools.com/howto/howto_js_collapsible.asp)
[2](https://www.digitalocean.com/community/tutorials/css-collapsible)
[3](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/128436437/0fbe2e06-f93a-4b37-8003-41797a2d9101/content.ts)
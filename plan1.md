## 6. 修改 manifest.json

由于浏览器扩展安全限制，不能直接用 `fetch` 读取本地文件，需要使用不同的方法。我们改用让用户手动选择文件的方式：

### 更好的方案：使用文件选择器

修改 `popup.html` 中的提示词添加部分：

```html
<div class="selector-form">
  <input 
    type="text" 
    id="prompt-name" 
    placeholder="提示词名称（如：代码助手）"
  >
  <div style="display: flex; gap: 8px; margin-bottom: 6px;">
    <input 
      type="text" 
      id="prompt-path" 
      placeholder="点击'选择文件'按钮选择 Markdown 文件"
      readonly
      style="flex: 1;"
    >
    <button 
      id="select-file-btn"
      style="
        padding: 8px 12px;
        background: #3e3e3e;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
      "
    >
      📁 选择文件
    </button>
  </div>
  <input 
    type="file" 
    id="prompt-file-input" 
    accept=".md,.markdown,.txt"
    style="display: none;"
  >
  <button id="add-prompt-btn">添加提示词</button>
</div>
```

## 7. 修改 popup.ts - 使用文件读取

```typescript
private selectFileButton: HTMLButtonElement | null = null;
private promptFileInput: HTMLInputElement | null = null;
private currentFileContent: string = '';

// 在 initElements 中添加
this.selectFileButton = document.getElementById('select-file-btn') as HTMLButtonElement;
this.promptFileInput = document.getElementById('prompt-file-input') as HTMLInputElement;

// 在 setupEventListeners 中添加
this.selectFileButton?.addEventListener('click', () => this.promptFileInput?.click());
this.promptFileInput?.addEventListener('change', (e) => this.handleFileSelect(e));

// 添加文件选择处理
private async handleFileSelect(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (!file) return;

  try {
    this.currentFileContent = await file.text();
    
    if (this.promptPathInput) {
      this.promptPathInput.value = file.name;
    }
    
    this.showStatus(`✅ 已加载文件: ${file.name} (${this.currentFileContent.length} 字符)`, 'success');
  } catch (error) {
    console.error('读取文件失败:', error);
    this.showStatus('❌ 读取文件失败', 'error');
  }
}

// 修改 addPrompt 方法
private addPrompt(): void {
  const name = this.promptNameInput?.value.trim();
  
  if (!name) {
    this.showStatus('请输入提示词名称', 'error');
    return;
  }

  if (!this.currentFileContent || this.currentFileContent.trim().length === 0) {
    this.showStatus('请先选择并加载文件', 'error');
    return;
  }

  if (!this.currentSettings.promptFiles) {
    this.currentSettings.promptFiles = [];
  }

  const newPrompt: PromptFile = {
    id: Date.now().toString(),
    name,
    path: this.currentFileContent, // 直接存储内容而不是路径
    enabled: true
  };

  this.currentSettings.promptFiles.push(newPrompt);
  this.renderPromptList();

  if (this.promptNameInput) this.promptNameInput.value = '';
  if (this.promptPathInput) this.promptPathInput.value = '';
  this.currentFileContent = '';

  this.saveDraft();
  this.showStatus('✅ 已添加提示词，请点击保存设置', 'success');
}

// 修改 renderPromptList
private renderPromptList(): void {
  if (!this.promptList) return;

  const prompts = this.currentSettings.promptFiles || [];

  if (prompts.length === 0) {
    this.promptList.innerHTML = '<div class="empty-state">暂无提示词配置</div>';
    return;
  }

  this.promptList.innerHTML = prompts
    .map((prompt, index) => `
      <div class="url-item">
        <div style="flex: 1;">
          <div style="font-weight: 500; color: #fff;">${this.escapeHtml(prompt.name)}</div>
          <div style="font-size: 11px; color: #888; margin-top: 2px;">
            内容长度: ${prompt.path.length} 字符
          </div>
        </div>
        <button data-index="${index}">删除</button>
      </div>
    `)
    .join('');

  this.promptList.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
      this.removePrompt(index);
    });
  });
}
```

## 8. 简化 src/content.ts - 直接使用内容

修改 `createPromptButtons` 和 `applyPrompt`：

```typescript
// 修改创建按钮，直接传递内容
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

// 简化 applyPrompt - 直接使用传入的内容
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
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
    
    // 触发 Angular 的 ngModelChange
    const event = new CustomEvent('input', { bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    
    console.log('✅ 内容已填充');
    
    // 7. 等待 Angular 更新
    await this.delay(300);
    
    // 8. 关闭对话框
    this.closeSystemInstructionsDialog();
    
    this.showSuccess(`✅ 已应用: ${promptName}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('应用提示词失败:', error);
    this.showError(`应用失败：${errorMessage}`);
  }
}

// 新增：关闭 System Instructions 对话框
private closeSystemInstructionsDialog(): void {
  const closeBtn = document.querySelector<HTMLElement>(
    'button[data-test-close-button], ' +
    'button[aria-label="Close panel"], ' +
    'button[mat-dialog-close], ' +
    'button[iconname="close"]'
  );
  
  if (closeBtn) {
    closeBtn.click();
    console.log('✅ 已关闭界面');
  }
}
```

## 9. 删除 background.ts 中的文件读取代码

由于我们改为在 popup 中直接读取并保存内容，background.ts 不需要再处理文件读取：

```typescript
// 删除之前添加的 readPromptFile 相关代码
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendToVSCode') {
    console.log('📨 收到发送请求:', message.filename);
    sendMessageToVSCode(message, sendResponse);
    return true;
  }
  
  if (message.action === 'getConnectionStatus') {
    console.log('📡 查询连接状态:', isConnected);
    sendResponse({ connected: isConnected });
    return true;
  }
  
  if (message.action === 'ping') {
    sendResponse({ connected: isConnected });
    return true;
  }
});
```

## 10. 更新 types.ts 中的注释

```typescript
export interface PromptFile {
  id: string;
  name: string;      // 显示名称
  path: string;      // 存储文件内容（而不是路径）
  enabled: boolean;  // 是否启用
}
```

## 🎯 完整使用流程

### 配置提示词

1. 打开扩展配置面板
2. 输入提示词名称（如："代码助手"）
3. 点击"📁 选择文件"
4. 选择一个 Markdown 文件
5. 点击"添加提示词"
6. 点击"💾 保存设置"

### 使用提示词

1. 访问 Google AI Studio
2. 悬浮窗会显示配置的提示词按钮
3. 点击任意提示词按钮
4. 自动流程：
   - 打开 System Instructions 界面
   - 填充提示词内容
   - 关闭界面
5. ✅ 完成！

## 🚀 编译测试

```bash
cd E:\RiderProjects\chrome-extension-ts
npm run build
```

## 📝 测试步骤

1. 准备几个 Markdown 文件（如 `coding.md`, `writing.md`）
2. 重新加载Chrome扩展
3. 打开配置面板，添加提示词
4. 访问 AI Studio
5. 查看悬浮窗是否显示提示词按钮
6. 点击按钮测试功能

## 💡 优化建议

### 可选：添加编辑功能

可以在 popup 中添加编辑按钮，点击后重新选择文件更新内容。

### 可选：添加快捷键

可以为常用提示词设置快捷键（如 Ctrl+1, Ctrl+2）。

现在功能已经完整实现了！🎉
interface SiteConfig {
  hostname: string;
  copyButtonSelector: string;
  responseContainerSelector?: string;
  name?: string;
}

interface PromptFile {
  id: string;
  name: string;      // 显示名称
  path: string;      // 存储文件内容（而不是路径）
  enabled: boolean;  // 是否启用
}

interface Settings {
  port: number;
  enabledUrls: string[];
  showOnAllSites: boolean;
  siteConfigs: SiteConfig[];
  promptFiles?: PromptFile[];  // 提示词文件列表
}

// 修改原来的 ButtonCandidate 接口，去掉 element 属性
interface ButtonCandidate {
  selector: string;
  label: string;
  ariaLabel: string;
  text: string;
  score: number;
}

// 新增：草稿接口
interface DraftSettings {
  port?: number;
  enabledUrls?: string[];
  showOnAllSites?: boolean;
  siteConfigs?: SiteConfig[];
  promptFiles?: PromptFile[];
  timestamp?: number;
}

const DEFAULT_URLS = [
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'chatgpt.com',
  'poe.com',
  'perplexity.ai'
];


class PopupManager {
  private autoSaveTimer: number | null = null; // 新增：自动保存定时器
  private hasDraft: boolean = false; // 新增：是否有草稿

  private portInput: HTMLInputElement | null = null;
  private showOnAllSitesCheckbox: HTMLInputElement | null = null;
  private urlList: HTMLElement | null = null;
  private newUrlInput: HTMLInputElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private resetButton: HTMLButtonElement | null = null;
  private addUrlButton: HTMLButtonElement | null = null;
  private exportButton: HTMLButtonElement | null = null;
  private importButton: HTMLButtonElement | null = null;
  private importFileInput: HTMLInputElement | null = null;
  private smartFindButton: HTMLButtonElement | null = null;
  private statusDiv: HTMLElement | null = null;
  
  private configList: HTMLElement | null = null;
  private configHostnameInput: HTMLInputElement | null = null;
  private configSelectorInput: HTMLInputElement | null = null;
  private configContainerInput: HTMLInputElement | null = null;
  private addConfigButton: HTMLButtonElement | null = null;
  
  // 提示词相关元素
  private promptPathInput: HTMLInputElement | null = null;
  private selectFileButton: HTMLButtonElement | null = null;
  private promptFileInput: HTMLInputElement | null = null;
  private addPromptButton: HTMLButtonElement | null = null;
  private promptList: HTMLElement | null = null;
  private fileNameDisplay: HTMLElement | null = null;
  private currentFileContent: string = '';
  
  private currentSettings: Settings = {
    port: 8765,
    enabledUrls: [...DEFAULT_URLS],
    showOnAllSites: false,
    siteConfigs: [],
    promptFiles: []
  };

  private selectedCandidate: ButtonCandidate | null = null;

  constructor() {
    this.initElements();
    this.loadSettings();
    this.setupEventListeners();
    this.setupAutoSave();
  }

  private initElements(): void {
    this.portInput = document.getElementById('port-input') as HTMLInputElement;
    this.showOnAllSitesCheckbox = document.getElementById('show-on-all-sites') as HTMLInputElement;
    this.urlList = document.getElementById('url-list');
    this.newUrlInput = document.getElementById('new-url-input') as HTMLInputElement;
    this.saveButton = document.getElementById('save-settings') as HTMLButtonElement;
    this.resetButton = document.getElementById('reset-defaults') as HTMLButtonElement;
    this.addUrlButton = document.getElementById('add-url-btn') as HTMLButtonElement;
    this.exportButton = document.getElementById('export-config') as HTMLButtonElement;
    this.importButton = document.getElementById('import-config') as HTMLButtonElement;
    this.importFileInput = document.getElementById('import-file-input') as HTMLInputElement;
    this.smartFindButton = document.getElementById('smart-find-btn') as HTMLButtonElement;
    this.statusDiv = document.getElementById('status');
    
    this.configList = document.getElementById('config-list');
    this.configHostnameInput = document.getElementById('config-hostname') as HTMLInputElement;
    this.configSelectorInput = document.getElementById('config-selector') as HTMLInputElement;
    this.configContainerInput = document.getElementById('config-container') as HTMLInputElement;
    this.addConfigButton = document.getElementById('add-config-btn') as HTMLButtonElement;
    
    // 初始化提示词相关元素
    this.promptPathInput = document.getElementById('prompt-path') as HTMLInputElement;
    this.selectFileButton = document.getElementById('select-file-btn') as HTMLButtonElement;
    this.promptFileInput = document.getElementById('prompt-file-input') as HTMLInputElement;
    this.addPromptButton = document.getElementById('add-prompt-btn') as HTMLButtonElement;
    this.promptList = document.getElementById('prompt-list');

    // 在 initElements 中添加
    this.selectFileButton = document.getElementById('select-file-btn') as HTMLButtonElement;
    this.promptFileInput = document.getElementById('prompt-file-input') as HTMLInputElement;
    this.fileNameDisplay = document.getElementById('file-name-display');
  }

  private async loadSettings(): Promise<void> {
  // 先加载正式配置
  const settings = await chrome.storage.sync.get({
    port: 8765,
    enabledUrls: [...DEFAULT_URLS],
    showOnAllSites: false,
    siteConfigs: [],
    promptFiles: []
  }) as Settings;

  // 尝试加载草稿
  const draft = await chrome.storage.local.get('draftSettings');
  
  if (draft.draftSettings) {
    const draftData: DraftSettings = draft.draftSettings;
    
    // 检查草稿是否在5分钟内（避免加载过期草稿）
    const fiveMinutes = 5 * 60 * 1000;
    if (draftData.timestamp && Date.now() - draftData.timestamp < fiveMinutes) {
      // 使用草稿覆盖设置
      this.currentSettings = {
        port: draftData.port ?? settings.port,
        enabledUrls: draftData.enabledUrls ?? settings.enabledUrls,
        showOnAllSites: draftData.showOnAllSites ?? settings.showOnAllSites,
        siteConfigs: draftData.siteConfigs ?? settings.siteConfigs,
        promptFiles: draftData.promptFiles ?? settings.promptFiles
      };
      
      this.hasDraft = true;
      this.showDraftIndicator();
    } else {
      // 草稿过期，使用正式配置
      this.currentSettings = settings;
      await chrome.storage.local.remove('draftSettings');
    }
  } else {
    this.currentSettings = settings;
  }

  // 更新UI
  if (this.portInput) this.portInput.value = this.currentSettings.port.toString();
  if (this.showOnAllSitesCheckbox) this.showOnAllSitesCheckbox.checked = this.currentSettings.showOnAllSites;
  
  this.renderUrlList();
  this.renderConfigList();
  this.renderPromptList();
}

  // 新增：显示草稿指示器
private showDraftIndicator(): void {
  if (this.saveButton) {
    this.saveButton.textContent = '💾 保存设置 (有未保存的更改)';
    this.saveButton.style.background = '#e67e22';
  }
}

// 新增：隐藏草稿指示器
private hideDraftIndicator(): void {
  if (this.saveButton) {
    this.saveButton.textContent = '💾 保存设置';
    this.saveButton.style.background = '#007acc';
  }
  this.hasDraft = false;
}

// 新增：设置自动保存
private setupAutoSave(): void {
  // 监听所有可能修改配置的输入
  this.portInput?.addEventListener('input', () => this.scheduleAutoSave());
  this.showOnAllSitesCheckbox?.addEventListener('change', () => this.scheduleAutoSave());
}

// 新增：延迟自动保存（防止频繁保存）
private scheduleAutoSave(): void {
  if (this.autoSaveTimer) {
    clearTimeout(this.autoSaveTimer);
  }

  this.autoSaveTimer = window.setTimeout(() => {
    this.saveDraft();
  }, 500); // 500ms后保存草稿
}

// 新增：保存草稿
private async saveDraft(): Promise<void> {
  const draft: DraftSettings = {
    port: parseInt(this.portInput?.value || '8765'),
    enabledUrls: this.currentSettings.enabledUrls,
    showOnAllSites: this.showOnAllSitesCheckbox?.checked || false,
    siteConfigs: this.currentSettings.siteConfigs,
    promptFiles: this.currentSettings.promptFiles,
    timestamp: Date.now()
  };

  await chrome.storage.local.set({ draftSettings: draft });
  
  if (!this.hasDraft) {
    this.hasDraft = true;
    this.showDraftIndicator();
  }
}

  private renderUrlList(): void {
    if (!this.urlList) return;

    if (this.currentSettings.enabledUrls.length === 0) {
      this.urlList.innerHTML = '<div class="empty-state">暂无网站</div>';
      return;
    }

    this.urlList.innerHTML = this.currentSettings.enabledUrls
      .map((url, index) => `
        <div class="url-item">
          <span>${this.escapeHtml(url)}</span>
          <button data-index="${index}">删除</button>
        </div>
      `)
      .join('');

    this.urlList.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
        this.removeUrl(index);
      });
    });
  }

  private renderConfigList(): void {
    if (!this.configList) return;

    if (this.currentSettings.siteConfigs.length === 0) {
      this.configList.innerHTML = '<div class="empty-state">暂无自定义配置</div>';
      return;
    }

    this.configList.innerHTML = this.currentSettings.siteConfigs
      .map((config, index) => `
        <div class="url-item">
          <div style="flex: 1;">
            <div style="font-weight: 500; color: #fff;">${this.escapeHtml(config.hostname)}</div>
            <div style="font-size: 11px; color: #888; margin-top: 2px;">
              ${this.escapeHtml(config.copyButtonSelector)}
            </div>
            ${config.responseContainerSelector ? `
              <div style="font-size: 10px; color: #666; margin-top: 2px;">
                容器: ${this.escapeHtml(config.responseContainerSelector)}
              </div>
            ` : ''}
          </div>
          <button data-index="${index}">删除</button>
        </div>
      `)
      .join('');

    this.configList.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
        this.removeConfig(index);
      });
    });
  }

  private setupEventListeners(): void {
  // 基本功能
  this.saveButton?.addEventListener('click', () => this.saveSettings());
  this.resetButton?.addEventListener('click', () => this.resetToDefaults());
  this.addUrlButton?.addEventListener('click', () => this.addUrl());
  this.addConfigButton?.addEventListener('click', () => this.addConfig());
  this.exportButton?.addEventListener('click', () => this.exportConfig());
  this.importButton?.addEventListener('click', () => this.importFileInput?.click());
  this.smartFindButton?.addEventListener('click', () => this.smartFindCopyButtons());
  this.importFileInput?.addEventListener('change', (e) => this.handleImportFile(e));

  // URL 输入回车快捷键
  this.newUrlInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') this.addUrl();
  });

  // 配置输入 Ctrl+Enter 快捷键
  this.configSelectorInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) this.addConfig();
  });

  // ✅ 提示词相关（只保留一次）
  this.selectFileButton?.addEventListener('click', () => this.promptFileInput?.click());
  this.promptFileInput?.addEventListener('change', (e) => this.handleFileSelect(e));
  this.addPromptButton?.addEventListener('click', () => this.addPrompt());

}

private async smartFindCopyButtons(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    if (!activeTab || !activeTab.id) {
      this.showStatus('无法获取当前标签页', 'error');
      return;
    }

    // 自动填充域名
    if (activeTab.url) {
      try {
        const url = new URL(activeTab.url);
        if (this.configHostnameInput) {
          this.configHostnameInput.value = url.hostname;
        }
      } catch (e) {
        console.error('解析URL失败:', e);
      }
    }

    this.showScanningModal();

    // 注入脚本查找按钮
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        // === 这段代码会在目标页面中执行 ===
        // 在这里重新定义，避免与外部冲突
        type CandidateResult = {
          selector: string;
          label: string;
          ariaLabel: string;
          text: string;
          score: number;
        };

        const candidates: CandidateResult[] = [];
        const buttons = document.querySelectorAll('button');

        buttons.forEach((button) => {
          const text = button.textContent?.toLowerCase().trim() || '';
          const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
          const title = button.getAttribute('title')?.toLowerCase() || '';
          const className = button.className.toLowerCase();
          
          let score = 0;
          
          // 评分规则
          if (text.includes('copy') || text.includes('复制')) score += 10;
          if (ariaLabel.includes('copy') || ariaLabel.includes('复制')) score += 10;
          if (title.includes('copy') || title.includes('复制')) score += 5;
          if (className.includes('copy')) score += 5;
          
          const svg = button.querySelector('svg');
          if (svg) score += 2;
          
          // 只保留相关度足够高的按钮
          if (score >= 5) {
            let selector = '';
            const ariaLabelAttr = button.getAttribute('aria-label');
            
            // 生成选择器
            if (ariaLabelAttr) {
              // 转义引号
              const escapedLabel = ariaLabelAttr.replace(/"/g, '\\"');
              selector = `button[aria-label="${escapedLabel}"]`;
            } else if (button.id) {
              selector = `button#${button.id}`;
            } else if (button.className && button.className.trim()) {
              const classes = button.className.trim().split(/\s+/).slice(0, 2);
              if (classes.length > 0) {
                selector = `button.${classes.join('.')}`;
              } else {
                selector = 'button';
              }
            } else {
              selector = 'button';
            }

            candidates.push({
              selector: selector,
              label: text || ariaLabel || '(无标签)',
              ariaLabel: ariaLabelAttr || '',
              text: text,
              score: score
            });
          }
        });

        // 按分数排序
        candidates.sort((a, b) => b.score - a.score);
        
        // 返回前10个
        return candidates.slice(0, 10);
      }
    });

    const candidates: ButtonCandidate[] = results[0]?.result || [];

    if (candidates.length === 0) {
      this.showEmptyResultModal();
    } else {
      this.showCandidatesModal(candidates);
    }

  } catch (error) {
    console.error('智能查找失败:', error);
    
    let errorMsg = '智能查找失败';
    if (error instanceof Error) {
      errorMsg += ': ' + error.message;
    }
    
    this.showStatus(errorMsg, 'error');
    this.closeModal();
  }
}


  private showScanningModal(): void {
    const modal = document.getElementById('smart-find-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>🔍 正在扫描页面...</h3>
          <button class="modal-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="scanning-indicator">
            <div class="spinner"></div>
            <p style="color: #888;">正在查找COPY按钮...</p>
          </div>
        </div>
      </div>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-close')?.addEventListener('click', () => {
      this.closeModal();
    });
  }

  private showEmptyResultModal(): void {
    const modal = document.getElementById('smart-find-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>🔍 查找结果</h3>
          <button class="modal-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="empty-result">
            <div class="empty-result-icon">😕</div>
            <p>未找到COPY按钮</p>
            <p style="font-size: 12px; color: #666; margin-top: 8px;">
              请确保当前页面有AI对话回答，并且有复制按钮
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" id="modal-cancel">关闭</button>
        </div>
      </div>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
  }

  private showCandidatesModal(candidates: ButtonCandidate[]): void {
    const modal = document.getElementById('smart-find-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>🔍 找到 ${candidates.length} 个候选按钮</h3>
          <button class="modal-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 12px; font-size: 13px; color: #888;">
            点击选择一个COPY按钮：
          </p>
          ${candidates.map((c, i) => `
            <div class="button-candidate" data-index="${i}">
              <div class="button-info">
                <div class="button-label">${this.escapeHtml(c.label)}</div>
                <div class="button-selector">${this.escapeHtml(c.selector)}</div>
                <div class="button-details">
                  ${c.ariaLabel ? `aria-label: ${this.escapeHtml(c.ariaLabel)}` : ''}
                  ${c.score ? ` • 相关度: ${c.score}分` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" id="modal-cancel">取消</button>
          <button class="btn-confirm" id="modal-confirm" disabled>确定</button>
        </div>
      </div>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('modal-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
    document.getElementById('modal-confirm')?.addEventListener('click', () => this.confirmSelection());
    
    const candidateElements = modal.querySelectorAll('.button-candidate');
    candidateElements.forEach((el) => {
      el.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0');
        this.selectCandidate(index, candidates);
      });
    });
  }

  private selectCandidate(index: number, candidates: ButtonCandidate[]): void {
    this.selectedCandidate = candidates[index];
    
    const modal = document.getElementById('smart-find-modal');
    if (!modal) return;
    
    modal.querySelectorAll('.button-candidate').forEach(el => {
      el.classList.remove('selected');
    });
    
    const selected = modal.querySelector(`[data-index="${index}"]`);
    selected?.classList.add('selected');
    
    const confirmBtn = document.getElementById('modal-confirm') as HTMLButtonElement;
    if (confirmBtn) confirmBtn.disabled = false;
  }

  private confirmSelection(): void {
    if (!this.selectedCandidate) return;
    
    if (this.configSelectorInput) {
      this.configSelectorInput.value = this.selectedCandidate.selector;
    }
    
    this.showStatus(`✅ 已选择: ${this.selectedCandidate.selector}`, 'success');
    this.closeModal();
    this.selectedCandidate = null;
  }

  private closeModal(): void {
    const modal = document.getElementById('smart-find-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.innerHTML = '';
    }
    this.selectedCandidate = null;
  }

  private addUrl(): void {
    const url = this.newUrlInput?.value.trim();
    if (!url) {
      this.showStatus('请输入网站域名', 'error');
      return;
    }

    if (!/^[\w\-.*]+(\.\w{2,})?$/.test(url) && url !== 'localhost') {
      this.showStatus('请输入有效的域名格式', 'error');
      return;
    }

    if (this.currentSettings.enabledUrls.includes(url)) {
      this.showStatus('该网站已存在', 'error');
      return;
    }

    this.currentSettings.enabledUrls.push(url);
    this.renderUrlList();
    
    if (this.newUrlInput) {
      this.newUrlInput.value = '';
    }
    
    this.showStatus('✅ 已添加，请点击保存设置', 'success');
  }

  private removeUrl(index: number): void {
    this.currentSettings.enabledUrls.splice(index, 1);
    this.renderUrlList();
    this.showStatus('✅ 已删除，请点击保存设置', 'success');
  }

  private addConfig(): void {
    const hostname = this.configHostnameInput?.value.trim();
    const selector = this.configSelectorInput?.value.trim();
    const container = this.configContainerInput?.value.trim();

    if (!hostname || !selector) {
      this.showStatus('请输入域名和COPY按钮选择器', 'error');
      return;
    }

    const exists = this.currentSettings.siteConfigs.some(
      config => config.hostname === hostname
    );

    if (exists) {
      this.showStatus('该网站配置已存在，请先删除', 'error');
      return;
    }

    const newConfig: SiteConfig = {
      hostname,
      copyButtonSelector: selector,
      responseContainerSelector: container || undefined
    };

    this.currentSettings.siteConfigs.push(newConfig);
    this.renderConfigList();

    if (this.configHostnameInput) this.configHostnameInput.value = '';
    if (this.configSelectorInput) this.configSelectorInput.value = '';
    if (this.configContainerInput) this.configContainerInput.value = '';

    this.showStatus('✅ 已添加配置，请点击保存设置', 'success');
  }

  private removeConfig(index: number): void {
    this.currentSettings.siteConfigs.splice(index, 1);
    this.renderConfigList();
    this.showStatus('✅ 已删除，请点击保存设置', 'success');
  }

 private async saveSettings(): Promise<void> {
  const saveBtn = document.getElementById('save-settings') as HTMLButtonElement;
  
  if (!saveBtn) return;

  try {
    // 保存设置逻辑
    await chrome.storage.sync.set(this.currentSettings);
    
    // ✅ 保存成功，恢复按钮默认状态
    saveBtn.textContent = '💾 保存设置';
    saveBtn.className = 'primary';  // 恢复蓝色样式
    saveBtn.disabled = false;
    
    this.showStatus('✅ 设置已保存', 'success');
    
    // 清除草稿
    await chrome.storage.local.remove('draftSettings');
    
  } catch (error) {
    console.error('保存设置失败:', error);
    this.showStatus('❌ 保存失败', 'error');
    
    // 出错也恢复按钮状态
    saveBtn.textContent = '💾 保存设置';
    saveBtn.className = 'primary';
  }
}


  private async resetToDefaults(): Promise<void> {
    if (!confirm('确定要恢复默认设置吗？所有自定义配置将被清除。')) {
      return;
    }

    this.currentSettings = {
      port: 8765,
      enabledUrls: [...DEFAULT_URLS],
      showOnAllSites: false,
      siteConfigs: [],
      promptFiles: []
    };

    if (this.portInput) this.portInput.value = '8765';
    if (this.showOnAllSitesCheckbox) this.showOnAllSitesCheckbox.checked = false;
    
    this.renderUrlList();
    this.renderConfigList();
    this.renderPromptList();
    this.showStatus('✅ 已恢复默认设置，请点击保存', 'success');
  }

  private async exportConfig(): Promise<void> {
    try {
      const data = await chrome.storage.sync.get(null);
      
      const exportData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        extension: 'AI to VSCode Bridge',
        data: data
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-vscode-bridge-config-${Date.now()}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      
      this.showStatus('✅ 配置已导出', 'success');
    } catch (error) {
      console.error('导出失败:', error);
      this.showStatus('❌ 导出失败: ' + (error as Error).message, 'error');
    }
  }

  private async handleImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.data || !importData.version) {
        this.showStatus('❌ 无效的配置文件格式', 'error');
        return;
      }

      if (!confirm('确定要导入配置吗？当前配置将被覆盖。')) {
        return;
      }

      await chrome.storage.sync.set(importData.data);
      await this.loadSettings();
      
      this.showStatus('✅ 配置已导入，请刷新网页使配置生效', 'success');
    } catch (error) {
      console.error('导入失败:', error);
      this.showStatus('❌ 导入失败: ' + (error as Error).message, 'error');
    } finally {
      input.value = '';
    }
  }

  private showStatus(message: string, type: 'success' | 'error'): void {
    if (!this.statusDiv) return;
    
    this.statusDiv.textContent = message;
    this.statusDiv.className = type;
    this.statusDiv.style.display = 'block';
    
    setTimeout(() => {
      if (this.statusDiv) {
        this.statusDiv.style.display = 'none';
      }
    }, 4000);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 提示词管理相关方法
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

private currentFileName: string = '';

private async handleFileSelect(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (!file) return;

  try {
    this.currentFileContent = await file.text();
    
    // 提取文件名（去掉扩展名）
    this.currentFileName = file.name.replace(/\.(md|markdown|txt)$/i, '');
    
    // 更新显示
    if (this.fileNameDisplay) {
      this.fileNameDisplay.textContent = file.name;
      this.fileNameDisplay.style.color = '#fff';
    }
    
    this.showStatus(
      `✅ 已加载: ${file.name} (${this.currentFileContent.length} 字符)`, 
      'success'
    );
  } catch (error) {
    console.error('读取文件失败:', error);
    this.showStatus('❌ 读取文件失败', 'error');
  }
}


private addPrompt(): void {
  // 验证：检查是否选择了文件
  if (!this.currentFileContent || this.currentFileContent.trim().length === 0) {
    this.showStatus('❌ 请先选择文件', 'error');
    const fileWrapper = document.getElementById('file-selector-wrapper');
    if (fileWrapper) {
      fileWrapper.style.borderColor = '#ff4444';
      setTimeout(() => {
        if (fileWrapper) fileWrapper.style.borderColor = '#3e3e3e';
      }, 2000);
    }
    return;
  }

  if (!this.currentSettings.promptFiles) {
    this.currentSettings.promptFiles = [];
  }

  // 检查是否已存在同名提示词
  const exists = this.currentSettings.promptFiles.some(
    p => p.name === this.currentFileName
  );
  
  if (exists) {
    this.showStatus(`❌ 提示词 "${this.currentFileName}" 已存在`, 'error');
    return;
  }

  const newPrompt = {
    id: Date.now().toString(),
    name: this.currentFileName, // 使用文件名
    path: this.currentFileContent,
    enabled: true
  };

  this.currentSettings.promptFiles.push(newPrompt);
  this.renderPromptList();

  // 清空
  if (this.fileNameDisplay) {
    this.fileNameDisplay.textContent = '未选择文件';
    this.fileNameDisplay.style.color = '#888';
  }
  this.currentFileContent = '';
  this.currentFileName = '';

  // 重置文件输入框
  if (this.promptFileInput) {
    this.promptFileInput.value = '';
  }

  this.saveDraft();
  
  this.showStatus(`✅ 已添加提示词：${newPrompt.name}`, 'success');
}



  private removePrompt(index: number): void {
    if (!this.currentSettings.promptFiles) return;
    
    this.currentSettings.promptFiles.splice(index, 1);
    this.renderPromptList();
    this.saveDraft();
    this.showStatus('✅ 已删除，请点击保存设置', 'success');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

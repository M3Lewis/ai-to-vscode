import { setLanguage, getLanguage, t, applyI18n, Language } from './i18n';

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
  savePath?: string;
  language?: Language;
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
  language?: Language;
  timestamp?: number;
}

const DEFAULT_URLS = [
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'chatgpt.com',
  'poe.com',
  'perplexity.ai',
  'deepseek.com',
  'aistudio.google.com'
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
  private langToggle: HTMLButtonElement | null = null;


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

  private savePathInput: HTMLInputElement | null = null;

  // 路径记忆相关元素
  private memoryList: HTMLElement | null = null;
  private memFilenameInput: HTMLInputElement | null = null;
  private memPathInput: HTMLInputElement | null = null;
  private addMemButton: HTMLButtonElement | null = null;
  private clearMemButton: HTMLButtonElement | null = null;
  private pathMemory: Record<string, string> = {};
  private activeProjectRoot: string = 'default';

  private currentSettings: Settings = {
    port: 8765,
    enabledUrls: [...DEFAULT_URLS],
    showOnAllSites: false,
    siteConfigs: [],
    promptFiles: [],
  };

  private selectedCandidate: ButtonCandidate | null = null;

  constructor() {
    this.initElements();
    this.loadSettings();
    this.setupEventListeners();
    this.setupAutoSave();
    this.loadPathMemoryData(); // 加载路径记忆数据
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
    this.langToggle = document.getElementById('lang-toggle') as HTMLButtonElement;

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

    this.savePathInput = document.getElementById('save-path') as HTMLInputElement;

    // 初始化路径记忆相关元素
    this.memoryList = document.getElementById('memory-list');
    this.memFilenameInput = document.getElementById('mem-filename') as HTMLInputElement;
    this.memPathInput = document.getElementById('mem-path') as HTMLInputElement;
    this.addMemButton = document.getElementById('add-mem-btn') as HTMLButtonElement;
    this.clearMemButton = document.getElementById('clear-mem-btn') as HTMLButtonElement;
  }

  private async loadSettings(): Promise<void> {
    // 先加载正式配置，使用单一 key "settings"
    const result = await chrome.storage.sync.get('settings');
    let settings: Settings;
    if (result.settings) {
      settings = result.settings as Settings;
    } else {
      // 回退到旧格式（兼容性）
      const oldSettings = await chrome.storage.sync.get({
        port: 8765,
        enabledUrls: [...DEFAULT_URLS],
        showOnAllSites: false,
        siteConfigs: [],
        promptFiles: []
      }) as Settings;
      settings = oldSettings;
    }

    // 从 local 加载提示词文件（分离存储）
    const promptResult = await chrome.storage.local.get('promptFiles');
    const promptFiles: PromptFile[] = promptResult.promptFiles || [];
    settings.promptFiles = promptFiles;

    // 初始化语言
    const lang = settings.language || 'zh';
    setLanguage(lang);
    applyI18n();
    if (this.langToggle) {
      this.langToggle.textContent = lang === 'zh' ? 'English' : '中文';
    }

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
          promptFiles: draftData.promptFiles ?? settings.promptFiles,
          language: draftData.language ?? settings.language
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

    if (this.savePathInput) {
      this.savePathInput.value = this.currentSettings.savePath || '';
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
      language: this.currentSettings.language,
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
      this.urlList.innerHTML = `<div class="empty-state">${t('emptyUrlList')}</div>`;
      return;
    }

    this.urlList.innerHTML = this.currentSettings.enabledUrls
      .map((url, index) => `
        <div class="url-item">
          <span>${this.escapeHtml(url)}</span>
          <button data-index="${index}">${t('delete')}</button>
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
      this.configList.innerHTML = `<div class="empty-state">${t('emptyConfigList')}</div>`;
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
                ${t('containerLabel')} ${this.escapeHtml(config.responseContainerSelector)}
              </div>
            ` : ''}
          </div>
          <button data-index="${index}">${t('delete')}</button>
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
    this.savePathInput?.addEventListener('input', () => this.saveDraft());

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

    // 路径记忆相关
    this.addMemButton?.addEventListener('click', () => this.addMemory());
    this.clearMemButton?.addEventListener('click', () => this.clearAllMemory());

    // 语言切换
    this.langToggle?.addEventListener('click', () => {
      const current = getLanguage();
      const next = current === 'zh' ? 'en' : 'zh';
      setLanguage(next);
      this.currentSettings.language = next;
      // Update both for compatibility and to trigger content script listener
      chrome.storage.sync.set({
        language: next,
        settings: this.currentSettings
      });

      applyI18n();
      if (this.langToggle) {
        this.langToggle.textContent = next === 'zh' ? 'English' : '中文';
      }

      // Re-render all dynamic lists
      this.renderUrlList();
      this.renderConfigList();
      this.renderPromptList();
      this.renderMemoryList();
    });
  }

  private async smartFindCopyButtons(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab || !activeTab.id) {
        this.showStatus(t('cantGetTab'), 'error');
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

      let errorMsg = t('smartFindFailed');
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
          <h3>${t('smartFindScanning')}</h3>
          <button class="modal-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="scanning-indicator">
            <div class="spinner"></div>
            <p style="color: #888;">${t('smartFindSearching')}</p>
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
          <h3>${t('smartFindResult')}</h3>
          <button class="modal-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="empty-result">
            <div class="empty-result-icon">😕</div>
            <p>${t('smartFindEmpty')}</p>
            <p style="font-size: 12px; color: #666; margin-top: 8px;">
              ${t('smartFindEmptyHint')}
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" id="modal-cancel">${t('close')}</button>
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
          <h3>${t('foundCandidates', { count: candidates.length })}</h3>
          <button class="modal-close" id="modal-close">×</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 12px; font-size: 13px; color: #888;">
            ${t('selectCandidate')}
          </p>
          ${candidates.map((c, i) => `
            <div class="button-candidate" data-index="${i}">
              <div class="button-info">
                <div class="button-label">${this.escapeHtml(c.label)}</div>
                <div class="button-selector">${this.escapeHtml(c.selector)}</div>
                <div class="button-details">
                  ${c.ariaLabel ? `aria-label: ${this.escapeHtml(c.ariaLabel)}` : ''}
                  ${c.score ? ` • ${t('score', { score: c.score })}` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" id="modal-cancel">${t('cancel')}</button>
          <button class="btn-confirm" id="modal-confirm" disabled>${t('confirm')}</button>
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

    this.showStatus(t('selected', { selector: this.selectedCandidate.selector }), 'success');
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
      this.showStatus(t('enterDomain'), 'error');
      return;
    }

    if (!/^[\w\-.*]+(\.\w{2,})?$/.test(url) && url !== 'localhost') {
      this.showStatus(t('invalidDomain'), 'error');
      return;
    }

    if (this.currentSettings.enabledUrls.includes(url)) {
      this.showStatus(t('domainExists'), 'error');
      return;
    }

    this.currentSettings.enabledUrls.push(url);
    this.renderUrlList();

    if (this.newUrlInput) {
      this.newUrlInput.value = '';
    }

    this.showStatus(t('addedClickSave'), 'success');
  }

  private removeUrl(index: number): void {
    this.currentSettings.enabledUrls.splice(index, 1);
    this.renderUrlList();
    this.showStatus(t('deletedClickSave'), 'success');
  }

  private addConfig(): void {
    const hostname = this.configHostnameInput?.value.trim();
    const selector = this.configSelectorInput?.value.trim();
    const container = this.configContainerInput?.value.trim();

    if (!hostname || !selector) {
      this.showStatus(t('enterDomainAndSelector'), 'error');
      return;
    }

    const exists = this.currentSettings.siteConfigs.some(
      config => config.hostname === hostname
    );

    if (exists) {
      this.showStatus(t('configExists'), 'error');
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

    this.showStatus(t('configAdded'), 'success');
  }

  private removeConfig(index: number): void {
    this.currentSettings.siteConfigs.splice(index, 1);
    this.renderConfigList();
    this.showStatus(t('deletedClickSave'), 'success');
  }

  private async saveSettings(): Promise<void> {
    const saveBtn = document.getElementById('save-settings') as HTMLButtonElement;

    if (!saveBtn) return;

    try {
      // 保存设置逻辑
      this.currentSettings.savePath = this.savePathInput?.value.trim() || '';

      // 分离存储：提示词文件保存到 local
      const promptFiles = this.currentSettings.promptFiles || [];
      await chrome.storage.local.set({ promptFiles });

      // 创建不包含 promptFiles 的配置对象用于 sync 存储
      const settingsForSync: Settings = {
        ...this.currentSettings,
        promptFiles: undefined
      };
      // 删除 promptFiles 字段，避免占用空间
      delete settingsForSync.promptFiles;

      // 调试：计算配置大小
      const settingsJson = JSON.stringify(settingsForSync);
      const sizeInBytes = new Blob([settingsJson]).size;
      console.log(`保存配置到 sync，大小: ${sizeInBytes} 字节 (${(sizeInBytes / 1024).toFixed(2)} KB)`);
      if (sizeInBytes > 8192) {
        console.warn('配置大小超过 8KB，可能超出 chrome.storage.sync 单项限制');
      }
      // 详细分析各部分大小
      const analysis: Record<string, number> = {};
      if (promptFiles.length > 0) {
        let totalPromptSize = 0;
        promptFiles.forEach((p, i) => {
          const promptSize = new Blob([p.path]).size;
          totalPromptSize += promptSize;
          analysis[`promptFiles[${i}].path`] = promptSize;
        });
        analysis['promptFiles.total'] = totalPromptSize;
      }
      analysis['enabledUrls'] = new Blob([JSON.stringify(this.currentSettings.enabledUrls)]).size;
      analysis['siteConfigs'] = new Blob([JSON.stringify(this.currentSettings.siteConfigs)]).size;
      analysis['other'] = sizeInBytes - (analysis['promptFiles.total'] || 0) - analysis['enabledUrls'] - analysis['siteConfigs'];
      console.log('配置大小分析:', analysis);

      // 使用单一 key "settings" 存储整个配置对象（不含 promptFiles），避免超出存储限制
      await new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set(
          { settings: settingsForSync },
          () => {
            const err = chrome.runtime.lastError;
            if (err) {
              console.error('chrome.storage.sync.set error:', err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      // ✅ 保存成功，恢复按钮默认状态
      // ✅ 保存成功，恢复按钮默认状态
      saveBtn.textContent = '💾 ' + t('saveSettingsBtn').replace('💾 ', ''); // Hack to reuse key or just hardcode? key is 'saveSettingsBtn'
      // Wait, 'saveSettingsBtn' is "💾 保存设置".
      saveBtn.textContent = t('saveSettingsBtn');
      saveBtn.className = 'primary';  // 恢复蓝色样式
      saveBtn.disabled = false;

      this.showStatus(t('savedSuccess'), 'success');

      // 清除草稿
      await chrome.storage.local.remove('draftSettings');

    } catch (error) {
      console.error('保存设置失败:', error);
      // 提取可读的错误消息
      let errorMessage = '未知错误';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // 处理 chrome.runtime.lastError 对象
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message;
        } else {
          errorMessage = JSON.stringify(error);
        }
      } else {
        errorMessage = String(error);
      }
      this.showStatus(`${t('saveFailed')}: ${errorMessage}`, 'error');

      // 出错也恢复按钮状态
      // 出错也恢复按钮状态
      saveBtn.textContent = t('saveSettingsBtn');
      saveBtn.className = 'primary';
    }
  }


  private async resetToDefaults(): Promise<void> {
    if (!confirm(t('confirmReset'))) {
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
    this.showStatus(t('resetSuccess'), 'success');
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

      this.showStatus(t('configExported'), 'success');
    } catch (error) {
      console.error('导出失败:', error);
      this.showStatus(t('exportFailed') + (error as Error).message, 'error');
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
        this.showStatus(t('invalidConfig'), 'error');
        return;
      }

      if (!confirm(t('confirmImport'))) {
        return;
      }

      await chrome.storage.sync.set(importData.data);
      await this.loadSettings();

      this.showStatus(t('configImported'), 'success');
    } catch (error) {
      console.error('导入失败:', error);
      this.showStatus(t('importFailed') + (error as Error).message, 'error');
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
      this.promptList.innerHTML = `<div class="empty-state">${t('emptyPromptList')}</div>`;
      return;
    }

    this.promptList.innerHTML = prompts
      .map((prompt, index) => `
      <div class="url-item">
        <div style="flex: 1;">
          <div style="font-weight: 500; color: #fff;">📝 ${this.escapeHtml(prompt.name)}</div>
          <div style="font-size: 11px; color: #888; margin-top: 2px;">
            ${t('contentLength', { length: prompt.path.length })}
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button 
            class="action-btn rename-btn" 
            data-index="${index}"
            style="
              padding: 4px 10px;
              background: #4a4a4a;
              color: white;
              border: none;
              border-radius: 3px;
              cursor: pointer;
              font-size: 12px;
            "
          >
            ${t('rename')}
          </button>
          <button 
            class="danger" 
            data-index="${index}"
          >
            ${t('delete')}
          </button>
        </div>
      </div>
    `)
      .join('');

    // 绑定删除按钮事件
    this.promptList.querySelectorAll('.danger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
        this.removePrompt(index);
      });
    });

    // 绑定重命名按钮事件
    this.promptList.querySelectorAll('.rename-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
        this.renamePrompt(index);
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
        t('fileLoaded', { name: file.name, length: this.currentFileContent.length }),
        'success'
      );
    } catch (error) {
      console.error('读取文件失败:', error);
      this.showStatus(t('readFileFailed'), 'error');
    }
  }


  private addPrompt(): void {
    // 验证：检查是否选择了文件
    if (!this.currentFileContent || this.currentFileContent.trim().length === 0) {
      this.showStatus(t('pleaseSelectFile'), 'error');
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
      this.showStatus(t('promptExists', { name: this.currentFileName }), 'error');
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
      this.fileNameDisplay.textContent = t('noFileSelected');
      this.fileNameDisplay.style.color = '#888';
    }
    this.currentFileContent = '';
    this.currentFileName = '';

    // 重置文件输入框
    if (this.promptFileInput) {
      this.promptFileInput.value = '';
    }

    this.saveDraft();

    this.showStatus(t('promptAdded', { name: newPrompt.name }), 'success');
  }
  private renamePrompt(index: number): void {
    if (!this.currentSettings.promptFiles) return;

    const prompt = this.currentSettings.promptFiles[index];
    if (!prompt) return;

    // 找到对应的 DOM 元素
    const items = this.promptList?.querySelectorAll('.url-item');
    if (!items || !items[index]) return;

    const item = items[index];
    const nameElement = item.querySelector('div > div:first-child') as HTMLElement;
    if (!nameElement) return;

    // 保存原始名称
    const originalName = prompt.name;
    const originalHTML = nameElement.innerHTML;

    // 创建输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalName;
    input.style.cssText = `
    width: 100%;
    padding: 4px 8px;
    background: #2d2d2d;
    border: 1px solid #007bff;
    border-radius: 3px;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
  `;

    // 替换为输入框
    nameElement.innerHTML = '';
    nameElement.appendChild(input);
    input.focus();
    input.select();

    // 保存函数
    const save = () => {
      const newName = input.value.trim();

      if (!newName) {
        nameElement.innerHTML = originalHTML;
        this.showStatus(t('nameEmpty'), 'error');
        return;
      }

      // 检查重名
      const exists = this.currentSettings.promptFiles!.some(
        (p, i) => i !== index && p.name === newName
      );

      if (exists) {
        nameElement.innerHTML = originalHTML;
        this.showStatus(t('promptExists', { name: newName }), 'error');
        return;
      }

      // 更新名称
      prompt.name = newName;
      nameElement.innerHTML = `📝 ${this.escapeHtml(newName)}`;

      this.saveDraft();
      this.showStatus(t('renamed', { name: newName }), 'success');
    };

    // 取消函数
    const cancel = () => {
      nameElement.innerHTML = originalHTML;
    };

    // 回车保存
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });

    // 失焦保存
    input.addEventListener('blur', save);
  }




  private removePrompt(index: number): void {
    if (!this.currentSettings.promptFiles) return;

    this.currentSettings.promptFiles.splice(index, 1);
    this.renderPromptList();
    this.saveDraft();
    this.showStatus(t('deletedClickSave'), 'success');
  }

  private async loadPathMemoryData(): Promise<void> {
    const activeProject = await chrome.storage.local.get(['activeProject']);
    this.activeProjectRoot = activeProject.activeProject?.rootPath || 'default';

    // 更新 UI 显示当前项目
    const projectDisplay = document.getElementById('active-project-display');
    const projectText = document.getElementById('project-path-text');
    if (projectDisplay && projectText && activeProject.activeProject) {
      projectDisplay.style.display = 'block';
      projectText.textContent = activeProject.activeProject.projectName || activeProject.activeProject.rootPath;
      projectText.title = activeProject.activeProject.rootPath;
    }

    const storageKey = `pathMemory_${this.activeProjectRoot}`;
    const result = await chrome.storage.local.get([storageKey]);
    this.pathMemory = result[storageKey] || {};
    this.renderMemoryList();
  }

  private renderMemoryList(): void {
    if (!this.memoryList) return;

    const entries = Object.entries(this.pathMemory);
    if (entries.length === 0) {
      this.memoryList.innerHTML = `<div class="empty-state">${t('emptyMemoryList')}</div>`;
      return;
    }

    this.memoryList.innerHTML = entries
      .map(([filename, path]) => `
      <div class="memory-item">
        <div class="memory-info">
          <span class="memory-filename">${this.escapeHtml(filename)}</span>
        </div>
        <div class="memory-path">${this.escapeHtml(path)}</div>
        <div class="memory-actions">
          <button class="btn-edit" data-filename="${this.escapeHtml(filename)}" data-path="${this.escapeHtml(path)}">${t('edit')}</button>
          <button class="btn-delete" data-filename="${this.escapeHtml(filename)}">${t('delete')}</button>
        </div>
      </div>
    `)
      .join('');

    // 绑定删除按钮
    this.memoryList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filename = (e.target as HTMLElement).getAttribute('data-filename');
        if (filename) this.removeMemory(filename);
      });
    });

    // 绑定编辑按钮
    this.memoryList.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filename = (e.target as HTMLElement).getAttribute('data-filename');
        const path = (e.target as HTMLElement).getAttribute('data-path');
        if (filename && path) {
          if (this.memFilenameInput) this.memFilenameInput.value = filename;
          if (this.memPathInput) this.memPathInput.value = path;
          this.memPathInput?.focus();
        }
      });
    });
  }

  private async addMemory(): Promise<void> {
    const filename = this.memFilenameInput?.value.trim();
    const path = this.memPathInput?.value.trim();

    if (!filename || !path) {
      this.showStatus(t('enterFilenamePath'), 'error');
      return;
    }

    this.pathMemory[filename] = path;
    const storageKey = `pathMemory_${this.activeProjectRoot}`;
    await chrome.storage.local.set({ [storageKey]: this.pathMemory });

    if (this.memFilenameInput) this.memFilenameInput.value = '';
    if (this.memPathInput) this.memPathInput.value = '';

    this.renderMemoryList();
    this.showStatus(t('memoryAdded'), 'success');
  }

  private async removeMemory(filename: string): Promise<void> {
    if (confirm(t('confirmDeleteMemory', { filename }))) {
      delete this.pathMemory[filename];
      const storageKey = `pathMemory_${this.activeProjectRoot}`;
      await chrome.storage.local.set({ [storageKey]: this.pathMemory });
      this.renderMemoryList();
      this.showStatus(t('memoryDeleted'), 'success');
    }
  }

  private async clearAllMemory(): Promise<void> {
    if (confirm(t('confirmClearMemory'))) {
      this.pathMemory = {};
      const storageKey = `pathMemory_${this.activeProjectRoot}`;
      await chrome.storage.local.set({ [storageKey]: {} });
      this.renderMemoryList();
      this.showStatus(t('memoryCleared'), 'success');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

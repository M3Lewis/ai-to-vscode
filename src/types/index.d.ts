// 消息类型定义
interface MessageToVSCode {
  action: 'sendToVSCode';
  content: string;
  filename: string;
  savePath?: string;  // 新增：保存路径
  type?: 'save' | 'patch'; // 新增：操作类型
}

interface MessageResponse {
  success: boolean;
  error?: string;
  path?: string;  // 可选：返回完整保存路径
}


export interface WSMessage {
  type: 'saveFile' | 'success' | 'error';
  content?: string;
  filename?: string;
  message?: string;
  timestamp?: number;
}

export interface ConnectionStatus {
  type: 'connectionStatus';
  status: 'connected' | 'disconnected';
}

// 网站配置
export interface SiteConfig {
  hostname: string;
  copyButtonSelector: string;
  responseContainerSelector?: string;
  name?: string;
}

// 提示词文件配置
export interface PromptFile {
  id: string;
  name: string;      // 显示名称
  path: string;      // 存储文件内容（而不是路径）
  enabled: boolean;  // 是否启用
}

export interface Settings {
  port: number;
  enabledUrls: string[];
  showOnAllSites: boolean;
  siteConfigs: SiteConfig[];
  promptFiles?: PromptFile[];  // 提示词文件列表
}

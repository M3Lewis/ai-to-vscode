// 消息类型定义
export interface MessageToVSCode {
  action: 'sendToVSCode';
  content: string;
  filename: string;
}

export interface MessageResponse {
  success: boolean;
  error?: string;
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
  path: string;      //
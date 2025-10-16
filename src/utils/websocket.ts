import { WSMessage } from '../types';

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private readonly url: string;
  private readonly reconnectDelay: number;
  private statusCallback?: (connected: boolean) => void;

  constructor(url: string = 'ws://localhost:8765', reconnectDelay: number = 3000) {
    this.url = url;
    this.reconnectDelay = reconnectDelay;
  }

  public connect(): void {
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('已连接到VS Code');
        this.statusCallback?.(true);
      };
      
      this.ws.onclose = () => {
        console.log('与VS Code断开连接');
        this.statusCallback?.(false);
        this.scheduleReconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
      };
      
      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      console.error('连接失败:', error);
      this.scheduleReconnect();
    }
  }

  public send(message: WSMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public onStatusChange(callback: (connected: boolean) => void): void {
    this.statusCallback = callback;
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
  }

  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);
      if (message.type === 'success') {
        console.log('文件已保存:', message.filename);
      }
    } catch (error) {
      console.error('处理消息失败:', error);
    }
  }
}

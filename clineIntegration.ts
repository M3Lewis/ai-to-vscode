import * as vscode from 'vscode';

export class ClineIntegration {
  private clineExtension: vscode.Extension<any> | undefined;
  
  async initialize() {
    this.clineExtension = vscode.extensions.getExtension('saoudrizwan.claude-dev');
    if (this.clineExtension && !this.clineExtension.isActive) {
      await this.clineExtension.activate();
    }
    return !!this.clineExtension;
  }
  
  async sendTask(taskContent: string, autoExecute: boolean = false) {
    if (!this.clineExtension) {
      throw new Error('Cline插件未安装或未激活');
    }
    
    // 打开Cline面板
    await vscode.commands.executeCommand('cline.openInNewTab');
    
    // 等待面板打开
    await this.delay(500);
    
    // 创建新任务
    await vscode.commands.executeCommand('cline.plusButtonClicked');
    
    await this.delay(200);
    
    // 将内容复制到剪贴板
    await vscode.env.clipboard.writeText(taskContent);
    
    // 粘贴到输入框
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    
    if (autoExecute) {
      // 模拟Enter键（需要进一步研究）
      vscode.window.showInformationMessage('任务已添加，请按Enter执行');
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

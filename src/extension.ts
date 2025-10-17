import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';

let wss: WebSocketServer | null = null;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log('AI VSCode Bridge 已激活');
  
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'ai-vscode-bridge.toggleServer';
  context.subscriptions.push(statusBarItem);
  
  startWebSocketServer(context);
  
  const executeClineCmd = vscode.commands.registerCommand(
    'ai-vscode-bridge.executeCline',
    executeClineTask
  );
  
  const toggleServerCmd = vscode.commands.registerCommand(
    'ai-vscode-bridge.toggleServer',
    () => {
      if (wss) {
        stopWebSocketServer();
      } else {
        startWebSocketServer(context);
      }
    }
  );
  
  context.subscriptions.push(executeClineCmd, toggleServerCmd);
}

function startWebSocketServer(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('aiVSCodeBridge');
  const port = config.get<number>('port', 8765);
  
  try {
    wss = new WebSocketServer({ port });
    
    wss.on('connection', (ws: WebSocket) => {
      console.log('Chrome扩展已连接');
      
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'saveFile') {
            // ✅ 修复：直接传递 ws 和 message
            await handleSaveFile(ws, message);
          }
        } catch (error) {
          console.error('处理消息失败:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : '未知错误'
          }));
        }
      });
      
      ws.on('close', () => {
        console.log('Chrome扩展已断开');
      });
    });
    
    wss.on('listening', () => {
      updateStatusBar(true, port);
      vscode.window.showInformationMessage(`✅ WebSocket服务器已启动，端口：${port}`);
      console.log(`WebSocket服务器监听端口：${port}`);
    });
    
    wss.on('error', (error) => {
      vscode.window.showErrorMessage(`❌ WebSocket服务器错误：${error.message}`);
      updateStatusBar(false);
    });
    
  } catch (error) {
    vscode.window.showErrorMessage(`❌ 启动服务器失败：${error}`);
    updateStatusBar(false);
  }
}

function stopWebSocketServer() {
  if (wss) {
    wss.close();
    wss = null;
    updateStatusBar(false);
    vscode.window.showInformationMessage('⏹️ WebSocket服务器已停止');
    console.log('WebSocket服务器已停止');
  }
}

// ✅ 修复：函数签名保持不变，处理 ws 和 message
async function handleSaveFile(ws: WebSocket, message: any): Promise<void> {
  const { content, filename, savePath } = message;
  
  // 写入日志
  const logPath = path.join(require('os').homedir(), 'Desktop', 'vscode-debug.log');
  const logMsg = `
=== ${new Date().toISOString()} ===
收到消息: ${JSON.stringify(message, null, 2)}
filename: ${filename}
savePath: ${savePath}
savePath 类型: ${typeof savePath}
savePath 是否为空: ${!savePath}
==================
`;
  
  try {
    fs.appendFileSync(logPath, logMsg);
  } catch (e) {
    console.error('写日志失败', e);
  }
  
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    fs.appendFileSync(logPath, '❌ 未打开工作区\n\n');
    ws.send(JSON.stringify({ 
      type: 'error',
      message: '未打开工作区' 
    }));
    vscode.window.showErrorMessage('请先打开一个工作区');
    return;
  }

  try {
    let targetDir = workspaceFolder.uri.fsPath;
    fs.appendFileSync(logPath, `根目录: ${targetDir}\n`);

    // 处理 savePath
    if (savePath && savePath.trim()) {
      const normalizedPath = savePath.trim().replace(/^[\/\\]+|[\/\\]+$/g, '');
      targetDir = path.join(workspaceFolder.uri.fsPath, normalizedPath);
      
      fs.appendFileSync(logPath, `最终目录: ${targetDir}\n`);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.appendFileSync(logPath, '✅ 已创建目录\n');
      }
    } else {
      fs.appendFileSync(logPath, '⚠️ savePath 为空！使用根目录\n');
    }

    const filePath = path.join(targetDir, filename);
    fs.appendFileSync(logPath, `完整路径: ${filePath}\n\n`);

    // 写入文件
    await fs.promises.writeFile(filePath, content, 'utf8');

    // 发送成功响应
    ws.send(JSON.stringify({ 
      type: 'success',
      filename: filename,
      path: filePath 
    }));

    // 打开文件
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(`✅ 已保存：${filename}`);

  } catch (error: any) {
    fs.appendFileSync(logPath, `❌ 错误: ${error.message}\n\n`);
    ws.send(JSON.stringify({ 
      type: 'error',
      message: error.message 
    }));
    vscode.window.showErrorMessage(`❌ 保存失败：${error.message}`);
  }
}

async function executeClineTask() {
  try {
    const clineExtension = vscode.extensions.getExtension('saoudrizwan.claude-dev');
    if (!clineExtension) {
      const install = await vscode.window.showErrorMessage(
        'Cline插件未安装',
        '安装Cline'
      );
      if (install) {
        vscode.env.openExternal(
          vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev')
        );
      }
      return;
    }
    
    await clineExtension.activate();
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('请先打开一个工作区');
      return;
    }
    
    const planPath = vscode.Uri.joinPath(workspaceFolder.uri, 'plan.md');
    
    try {
      await vscode.workspace.fs.stat(planPath);
    } catch {
      vscode.window.showErrorMessage('plan.md文件不存在');
      return;
    }
    
    const planContent = await vscode.workspace.fs.readFile(planPath);
    const planText = Buffer.from(planContent).toString('utf-8');
    
    await vscode.env.clipboard.writeText(planText);
    await vscode.commands.executeCommand('cline.plusButtonClicked');
    
    vscode.window.showInformationMessage(
      '📋 plan.md内容已复制到剪贴板，请在Cline中粘贴'
    );
    
  } catch (error) {
    vscode.window.showErrorMessage(`❌ 执行失败：${error}`);
    console.error('执行Cline任务失败:', error);
  }
}

function updateStatusBar(running: boolean, port?: number) {
  if (running && port) {
    statusBarItem.text = `$(radio-tower) AI Bridge:${port}`;
    statusBarItem.tooltip = '点击停止WebSocket服务器';
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.prominentBackground'
    );
  } else {
    statusBarItem.text = `$(debug-disconnect) AI Bridge`;
    statusBarItem.tooltip = '点击启动WebSocket服务器';
    statusBarItem.backgroundColor = undefined;
  }
  statusBarItem.show();
}

export function deactivate() {
  stopWebSocketServer();
  statusBarItem?.dispose();
}

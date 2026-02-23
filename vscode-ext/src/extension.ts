import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';

let wss: WebSocketServer | null = null;
let statusBarItem: vscode.StatusBarItem;

function isWindowsAbsolutePath(input: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith('\\\\');
}

function isAbsolutePath(input: string): boolean {
  if (!input) return false;
  return process.platform === 'win32'
    ? isWindowsAbsolutePath(input)
    : input.startsWith('/') || isWindowsAbsolutePath(input);
}

export function activate(context: vscode.ExtensionContext) {
  console.log('AI VSCode Bridge 已激活');

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'ai-vscode-bridge.toggleServer';
  context.subscriptions.push(statusBarItem);

  startWebSocketServer(context);



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

  context.subscriptions.push(toggleServerCmd);
}

function startWebSocketServer(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('aiVSCodeBridge');
  const port = config.get<number>('port', 8765);

  try {
    wss = new WebSocketServer({ port });

    wss.on('connection', (ws: WebSocket) => {
      console.log('Chrome扩展已连接');

      // 发送当前项目信息
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const rootPath = workspaceFolders[0].uri.fsPath;
        ws.send(JSON.stringify({
          type: 'projectInfo',
          rootPath: rootPath,
          projectName: path.basename(rootPath)
        }));
      }

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'saveFile') {
            await handleSaveFile(ws, message);
          } else if (message.type === 'patchFile') {
            await handlePatchFile(ws, message);
          } else if (message.type === 'clonePage') {
            await handleClonePage(ws, message);
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
  console.log('🔧 handleSaveFile: filename=', filename, 'savePath=', savePath);

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
      const trimmedSavePath = savePath.trim();
      const normalizedPath = trimmedSavePath.replace(/^[\/\\]+|[\/\\]+$/g, '');
      targetDir = isAbsolutePath(trimmedSavePath)
        ? path.normalize(trimmedSavePath)
        : path.join(workspaceFolder.uri.fsPath, normalizedPath);

      fs.appendFileSync(logPath, `最终目录: ${targetDir}\n`);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.appendFileSync(logPath, '✅ 已创建目录\n');
      }
    } else {
      fs.appendFileSync(logPath, '⚠️ savePath 为空！使用根目录\n');
    }

    const filePath = isAbsolutePath(filename)
      ? path.normalize(filename)
      : path.join(targetDir, filename);
    fs.appendFileSync(logPath, `完整路径: ${filePath}\n\n`);

    // 确保父目录存在 (处理嵌套文件路径 e.g. "folder/file.ts")
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      await fs.promises.mkdir(parentDir, { recursive: true });
      fs.appendFileSync(logPath, `✅ 已自动创建父目录: ${parentDir}\n`);
    }

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

async function handlePatchFile(ws: WebSocket, message: any): Promise<void> {
  const { content, filename, savePath } = message;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    ws.send(JSON.stringify({ type: 'error', message: '未打开工作区' }));
    return;
  }

  try {
    const trimmedSavePath = (savePath || '').trim();
    const normalizedPath = trimmedSavePath.replace(/^[\/\\]+|[\/\\]+$/g, '');
    const targetDir = isAbsolutePath(trimmedSavePath)
      ? path.normalize(trimmedSavePath)
      : path.join(workspaceFolder.uri.fsPath, normalizedPath);
    const filePath = isAbsolutePath(filename)
      ? path.normalize(filename)
      : path.join(targetDir, filename);

    // 确保父目录存在
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      await fs.promises.mkdir(parentDir, { recursive: true });
      console.log(`✅ 已自动创建父目录: ${parentDir}`);
    }

    if (!fs.existsSync(filePath)) {
      console.log(`文件不存在，回退到全量保存: ${filePath}`);
      return handleSaveFile(ws, message);
    }

    const document = await vscode.workspace.openTextDocument(filePath);
    const text = document.getText();
    const newContent = content.trim();

    // 1. 尝试全量匹配
    if (text.includes(newContent)) {
      ws.send(JSON.stringify({ type: 'success', filename, path: filePath, note: '内容已存在，无需更新' }));
      return;
    }

    const newLines = newContent.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    if (newLines.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: '更新内容为空' }));
      return;
    }

    // 2. 提取首尾锚点 (各取 3 行非空行以增强唯一性)
    const headLines = newLines.slice(0, 3);
    const tailLines = newLines.slice(-3);
    const headSignature = headLines.join('\n');
    const tailSignature = tailLines.join('\n');

    // 3. 寻找起始位置
    let matchStartIndex = text.indexOf(headSignature);
    if (matchStartIndex === -1) {
      // 降级：仅尝试匹配第一行
      matchStartIndex = text.indexOf(headLines[0]);
    }

    if (matchStartIndex !== -1) {
      // 4. 寻找结束位置
      let matchEndIndex = -1;

      // 策略 A: 尝试匹配尾部锚点
      const tailIndex = text.indexOf(tailSignature, matchStartIndex + headLines[0].length);
      if (tailIndex !== -1) {
        matchEndIndex = tailIndex + tailSignature.length;
      } else if (tailLines.length > 0) {
        // 降级：尝试匹配最后一行
        const lastLineIndex = text.indexOf(tailLines[tailLines.length - 1], matchStartIndex + headLines[0].length);
        if (lastLineIndex !== -1) {
          matchEndIndex = lastLineIndex + tailLines[tailLines.length - 1].length;
        }
      }

      // 策略 B: 如果锚点匹配失败，使用逻辑块识别
      if (matchEndIndex === -1) {
        if (headSignature.includes('{')) {
          // 大括号匹配
          let openBraces = 0;
          for (let i = matchStartIndex; i < text.length; i++) {
            if (text[i] === '{') openBraces++;
            if (text[i] === '}') {
              openBraces--;
              if (openBraces === 0) {
                matchEndIndex = i + 1;
                break;
              }
            }
          }
        } else {
          // Python 等缩进语言：寻找下一个同级或更低缩进的非空行，或者双换行
          // 这里简单处理：如果新内容很长，可能是一个完整的函数/类，我们寻找下一个 def/class 或双换行
          const nextBlock = text.substring(matchStartIndex + headLines[0].length).search(/\n\s*(def|class|if __name__)/);
          if (nextBlock !== -1) {
            matchEndIndex = matchStartIndex + headLines[0].length + nextBlock;
          } else {
            const nextEmpty = text.indexOf('\n\n\n', matchStartIndex + headLines[0].length);
            matchEndIndex = nextEmpty !== -1 ? nextEmpty : text.length;
          }
        }
      }

      // 5. 安全检查：如果替换范围过大（例如超过新内容的 5 倍且超过 500 行），可能匹配错误
      const replaceLength = matchEndIndex - matchStartIndex;
      if (replaceLength > newContent.length * 5 && replaceLength > 5000) {
        console.warn(`⚠️ 替换范围异常大 (${replaceLength} chars)，可能匹配错误。`);
        // 这种情况下我们保守一点，只替换到下一个双换行
        const safeEnd = text.indexOf('\n\n', matchStartIndex + headLines[0].length);
        if (safeEnd !== -1 && safeEnd < matchEndIndex) {
          matchEndIndex = safeEnd;
        }
      }

      // 6. 执行替换
      console.log(`✨ 执行局部更新: ${filename}, 范围: [${matchStartIndex} -> ${matchEndIndex}], 长度: ${matchEndIndex - matchStartIndex}`);

      const edit = new vscode.WorkspaceEdit();
      const range = new vscode.Range(
        document.positionAt(matchStartIndex),
        document.positionAt(matchEndIndex)
      );

      edit.replace(document.uri, range, newContent);
      await vscode.workspace.applyEdit(edit);
      await document.save();

      ws.send(JSON.stringify({ type: 'success', filename, path: filePath, note: '局部更新成功' }));
      vscode.window.showInformationMessage(`✅ 已局部更新：${filename}`);
    } else {
      // 7. 未找到匹配，追加到末尾
      console.log(`📝 未找到匹配位置，追加到末尾: ${filename}`);
      const edit = new vscode.WorkspaceEdit();
      const lastLine = document.lineAt(document.lineCount - 1);
      edit.insert(document.uri, lastLine.range.end, '\n\n' + newContent);
      await vscode.workspace.applyEdit(edit);
      await document.save();

      ws.send(JSON.stringify({ type: 'success', filename, path: filePath, note: '未匹配到起始位置，已追加到末尾' }));
      vscode.window.showInformationMessage(`✅ 已追加内容到：${filename}`);
    }

    await vscode.window.showTextDocument(document);

  } catch (error: any) {
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
    vscode.window.showErrorMessage(`❌ 局部更新失败：${error.message}`);
  }
}

async function handleClonePage(ws: WebSocket, message: any): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    ws.send(JSON.stringify({ type: 'error', message: '未打开工作区' }));
    return;
  }

  try {
    if (!message.package) {
      throw new Error('收到的复刻数据包为空 (message.package is undefined)');
    }

    const tempDir = path.join(workspaceFolder.uri.fsPath, 'v2c_temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `clone_package_${timestamp}.json`;
    const filePath = path.join(tempDir, filename);

    const jsonContent = JSON.stringify(message.package, null, 2);
    if (!jsonContent) {
      throw new Error('无法序列化复刻数据包');
    }

    await fs.promises.writeFile(filePath, jsonContent, 'utf8');

    ws.send(JSON.stringify({ type: 'success', filename, path: filePath, note: '复刻数据包已保存' }));
    vscode.window.showInformationMessage(`✅ 复刻数据包已保存：${filename}`);

    // 打开文件
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);

  } catch (error: any) {
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
    vscode.window.showErrorMessage(`❌ 保存复刻数据失败：${error.message}`);
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

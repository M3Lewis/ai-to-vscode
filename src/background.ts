let ws: WebSocket | null = null;
let isConnected = false;
let reconnectTimer: number | null = null;
let messageQueue: Array<{ message: any; sendResponse: Function; ts: number }> = [];

const MESSAGE_QUEUE_LIMIT = 50;
const MESSAGE_TIMEOUT_MS = 15000;

function debugStatus(prefix: string) {
  console.log(
    `[${prefix}] 队列长度:`, messageQueue.length,
    ', isConnected:', isConnected,
    ', ws:', ws ? ws.readyState : 'null',
    ', reconnectTimer:', reconnectTimer
  );
}

async function connectWebSocket() {
  // 清理已存在的ws事件，彻底断开（防止多实例）
  if (ws) {
    ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
    try { ws.close(); } catch (e) { }
    ws = null;
  }

  const storageData = await chrome.storage.sync.get('settings');
  const settings = storageData.settings || {};
  const port = settings.port || 8765;
  const wsUrl = `ws://localhost:${port}`;
  console.log('尝试连接到 WebSocket:', wsUrl);

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('已连接到 VS Code');
      isConnected = true;
      broadcastConnectionStatus(true);
      processMessageQueue();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      debugStatus('ws.onopen');
    };

    ws.onclose = () => {
      console.log('WebSocket 连接已关闭');
      isConnected = false;
      if (ws) try { ws.close(); } catch { }
      ws = null;
      broadcastConnectionStatus(false);
      scheduleReconnect();
      // 每次断开清理全部pending响应
      failAllQueueAndClear('连接已断开');
      debugStatus('ws.onclose');
    };

    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      isConnected = false;
    };

    ws.onmessage = (event) => {
      console.log('收到来自 VS Code 的消息:', event.data);
      try {
        const message = JSON.parse(event.data.toString());
        if (message.type === 'projectInfo') {
          console.log('活跃项目已更新:', message.rootPath);
          chrome.storage.local.set({
            activeProject: {
              rootPath: message.rootPath,
              projectName: message.projectName,
              timestamp: Date.now()
            }
          });
        }
      } catch (e) {
        console.error('解析消息失败:', e);
      }
    };

  } catch (error) {
    console.error('WebSocket 连接失败:', error);
    isConnected = false;
    scheduleReconnect();
  }
}

function processMessageQueue() {
  debugStatus('处理队列');
  while (messageQueue.length > 0 && isConnected && ws && ws.readyState === WebSocket.OPEN) {
    const { message, sendResponse } = messageQueue.shift()!;
    try {
      ws.send(JSON.stringify({
        type: 'saveFile',
        content: message.content,
        filename: message.filename,
        timestamp: Date.now()
      }));
      sendResponse({ success: true });
    } catch (e) {
      const msg = (typeof e === 'object' && e && 'message' in e) ? (e as any).message : String(e);
      sendResponse({ success: false, error: msg });
    }
  }
}

function queueMessage(message: any, sendResponse: Function) {
  // 排队前检测长度并清理过时callback
  messageQueue = messageQueue.filter(
    item => Date.now() - item.ts < MESSAGE_TIMEOUT_MS
  );
  console.log('WebSocket 未连接，消息加入队列', '当前队列长度:', messageQueue.length);
  if (messageQueue.length >= MESSAGE_QUEUE_LIMIT) {
    // 超出队列上限时（异常），逐个fail
    const removed = messageQueue.shift();
    removed?.sendResponse && removed.sendResponse({ success: false, error: '消息队列已满，已丢弃一条旧请求' });
  }
  messageQueue.push({ message, sendResponse, ts: Date.now() });
}

function failAllQueueAndClear(reason = '未知错误') {
  if (messageQueue.length > 0) {
    messageQueue.forEach(item => {
      try {
        item.sendResponse && item.sendResponse({ success: false, error: reason });
      } catch { }
    });
    messageQueue = [];
    console.warn(`[debug] 队列全部清空，因：${reason}`);
  }
}

function broadcastConnectionStatus(connected: boolean) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'connectionStatus',
          status: connected ? 'connected' : 'disconnected'
        }).catch(() => { });
      }
    });
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    console.log('尝试重新连接...');
    connectWebSocket();
  }, 3000);
}

function sendMessageToVSCode(message: any, sendResponse: Function) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    queueMessage(message, sendResponse);
    debugStatus('sendMessageToVSCode: queue');
    return;
  }

  try {
    ws.send(JSON.stringify({
      type: message.type === 'patch' ? 'patchFile' : 'saveFile',
      content: message.content,
      filename: message.filename,
      savePath: message.savePath || '',  // 传递路径
      timestamp: Date.now()
    }));
    debugStatus('sendMessageToVSCode: sent');
    sendResponse({ success: true });
  } catch (error) {
    const msg = (typeof error === 'object' && error && 'message' in error) ? (error as any).message : String(error);
    sendResponse({ success: false, error: msg });
  }
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendToVSCode') {
    debugStatus('收到发送请求');
    sendMessageToVSCode(message, sendResponse);
    return true; // 一定返回true以便异步call
  }

  if (message.action === 'getConnectionStatus') {
    sendResponse({ connected: isConnected });
    return true;
  }
  if (message.action === 'ping') {
    sendResponse({ connected: isConnected });
    return true;
  }
});

connectWebSocket();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    const oldSettings = changes.settings.oldValue || {};
    const newSettings = changes.settings.newValue || {};

    if (oldSettings.port !== newSettings.port) {
      console.log('端口配置已更改，重新连接...');
      // 彻底清理旧队列和ws，从头开始
      failAllQueueAndClear('端口变更清理');
      if (ws) { try { ws.close(); } catch { } }
      setTimeout(() => connectWebSocket(), 500);
    }
  }
});

// 定时清理已积压超时请求的callback，防止永远pending
setInterval(() => {
  if (messageQueue.length > 0) {
    const now = Date.now();
    let cleared = 0;
    messageQueue = messageQueue.filter(item => {
      if (now - item.ts > MESSAGE_TIMEOUT_MS) {
        item.sendResponse && item.sendResponse({ success: false, error: '处理超时，后台自动清理' });
        cleared++;
        return false;
      }
      return true;
    });
    if (cleared > 0) console.warn(`[debug] 定时自动清理超时队列 callback: 清理了${cleared}条`);
  }
}, 10000);


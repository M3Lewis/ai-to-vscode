let ws: WebSocket | null = null;
let isConnected = false;
let reconnectTimer: number | null = null; // 改为 number
let messageQueue: any[] = [];

async function connectWebSocket() {
  const settings = await chrome.storage.sync.get({ port: 8765 });
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
    };

    ws.onclose = () => {
      console.log('WebSocket 连接已关闭');
      isConnected = false;
      ws = null;
      broadcastConnectionStatus(false);
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      isConnected = false;
    };

    ws.onmessage = (event) => {
      console.log('收到来自 VS Code 的消息:', event.data);
    };

  } catch (error) {
    console.error('WebSocket 连接失败:', error);
    isConnected = false;
    scheduleReconnect();
  }
}

function processMessageQueue() {
  console.log(`处理队列中的 ${messageQueue.length} 条消息`);
  
  while (messageQueue.length > 0 && isConnected && ws) {
    const { message, sendResponse } = messageQueue.shift();
    sendMessageToVSCode(message, sendResponse);
  }
}

function queueMessage(message: any, sendResponse: Function) {
  console.log('WebSocket 未连接，消息加入队列');
  messageQueue.push({ message, sendResponse });
  
  if (messageQueue.length > 10) {
    const removed = messageQueue.shift();
    removed.sendResponse({ success: false, error: '消息队列已满，请稍后重试' });
  }
}

function broadcastConnectionStatus(connected: boolean) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'connectionStatus',
          status: connected ? 'connected' : 'disconnected'
        }).catch(() => {});
      }
    });
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  
  reconnectTimer = setTimeout(() => {
    console.log('尝试重新连接...');
    connectWebSocket();
  }, 3000) as unknown as number; // 类型断言
}

function sendMessageToVSCode(message: any, sendResponse: Function) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    console.log('WebSocket 未连接，消息加入队列');
    queueMessage(message, sendResponse);
    
    if (!reconnectTimer) {
      connectWebSocket();
    }
    return;
  }

  try {
    const wsMessage = {
      type: 'saveFile',
      content: message.content,
      filename: message.filename,
      timestamp: Date.now()
    };

    ws.send(JSON.stringify(wsMessage));
    console.log('✅ 消息已发送到 VS Code:', message.filename);

    sendResponse({ success: true });
  } catch (error) {
    console.error('❌ 发送消息失败:', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

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

connectWebSocket();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.port) {
    console.log('端口配置已更改，重新连接...');
    if (ws) {
      ws.close();
    }
    setTimeout(() => connectWebSocket(), 500);
  }
});

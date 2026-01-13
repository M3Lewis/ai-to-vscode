# AI to VSCode Bridge

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/yourusername/ai-vscode-bridge)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.80+-007ACC.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

一个强大的 VS Code 扩展，可以将 AI 对话内容从浏览器无缝传输到 VS Code，实现 AI 辅助开发的完整工作流。

## ✨ 功能特性

- 🚀 **实时接收**：通过 WebSocket 实时接收来自 Chrome 扩展的 AI 对话内容
- 💾 **自动保存**：自动将内容保存为指定文件名
- 📝 **局部更新**：智能识别代码变更，支持增量更新
- 🌐 **页面克隆**：保存网页 HTML/CSS 内容到工作区
- 📊 **状态监控**：实时显示 WebSocket 连接状态
- ⚙️ **可配置**：支持自定义 WebSocket 端口
- 🎯 **智能定位**：自动打开并定位到保存的文件

## 📦 安装

### 方式一：从 VSIX 文件安装

1. 下载最新的 `.vsix` 文件
2. 打开 VS Code
3. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS)
4. 输入 `Extensions: Install from VSIX...`
5. 选择下载的 `.vsix` 文件

### 方式二：从源码安装

```bash
git clone https://github.com/yourusername/ai-vscode-bridge.git
cd ai-vscode-bridge
npm install
npm run compile
vsce package
code --install-extension ai-vscode-bridge-1.0.0.vsix
```

## 🔧 前置要求

- **VS Code**: 版本 1.80.0 或更高
- **Node.js**: 版本 18.0 或更高
- **Chrome 扩展**: 需要配套的 Chrome 扩展 (ai-to-vscode-bridge)

## 🚀 快速开始

### 1. 启动 WebSocket 服务器

扩展激活后会自动启动 WebSocket 服务器，你可以在状态栏看到：

```
🗼 AI Bridge:8765
```

绿色表示服务器正在运行，点击可以停止/启动服务器。

### 2. 配置 Chrome 扩展

确保 Chrome 扩展已正确配置并连接到相同的端口（默认 8765）。

### 3. 接收 AI 对话内容

1. 在 Chrome 中访问 AI 对话网站（ChatGPT、Claude 等）
2. 获得 AI 回答后，在 Chrome 扩展悬浮窗中输入文件名
3. 点击"发送到 VS Code"
4. 内容会自动保存到当前工作区

## ⚙️ 配置选项

在 VS Code 设置中搜索 `aiVSCodeBridge`：

```json
{
  "aiVSCodeBridge.port": 8765
}
```

### 可用设置

| 设置项 | 类型 | 默认值 | 描述 |
|-------|------|--------|------|
| `aiVSCodeBridge.port` | number | 8765 | WebSocket 服务器监听端口 |

## 🎯 使用场景

### 场景一：AI 生成代码

1. 在 ChatGPT 中询问代码实现
2. 获得回答后通过 Chrome 扩展发送到 VS Code
3. 自动保存为指定文件

### 场景二：代码审查建议

1. 在 Claude 中上传代码并获取审查建议
2. 将建议保存为 `review.md`
3. 在 VS Code 中查看并逐项处理

### 场景三：技术文档生成

1. 使用 AI 生成 API 文档或 README
2. 快速保存到项目中
3. 继续编辑和完善

## 📋 命令列表

| 命令 | 描述 |
|------|------|
| `AI VSCode Bridge: 切换WebSocket服务器` | 启动/停止 WebSocket 服务器 |

## 🔌 API 接口

### WebSocket 消息格式

**保存文件请求：**
```json
{
  "type": "saveFile",
  "content": "文件内容",
  "filename": "example.md",
  "savePath": "optional/path",
  "timestamp": 1697385600000
}
```

**局部更新请求：**
```json
{
  "type": "patchFile",
  "content": "更新内容",
  "filename": "example.ts",
  "savePath": "src"
}
```

**成功响应：**
```json
{
  "type": "success",
  "filename": "example.md",
  "path": "/full/path/to/file"
}
```

**错误响应：**
```json
{
  "type": "error",
  "message": "错误描述"
}
```

## 🛠️ 开发指南

### 项目结构

```
ai-vscode-bridge/
├── src/
│   ├── extension.ts          # 主扩展入口
│   └── test/                 # 测试文件
├── out/                      # 编译输出
├── package.json
├── tsconfig.json
└── README.md
```

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/yourusername/ai-vscode-bridge.git
cd ai-vscode-bridge

# 安装依赖
npm install

# 编译
npm run compile

# 监听模式（开发时）
npm run watch
```

### 调试

1. 在 VS Code 中打开项目
2. 按 `F5` 启动调试
3. 新窗口会打开，扩展已加载
4. 在调试控制台查看日志

## 🐛 故障排除

### WebSocket 连接失败

**问题**: Chrome 扩展显示"未连接"

**解决方案**:
1. 检查 VS Code 扩展是否已启动（查看状态栏）
2. 确认端口号配置一致（默认 8765）
3. 检查防火墙是否阻止了 localhost 连接
4. 重启 VS Code 扩展

### 文件保存失败

**问题**: 提示"请先打开一个工作区"

**解决方案**:
1. 在 VS Code 中打开一个文件夹作为工作区
2. 使用 `File > Open Folder...`

### 端口被占用

**问题**: WebSocket 服务器启动失败

**解决方案**:
```powershell
# Windows
netstat -ano | findstr :8765
taskkill /PID <进程ID> /F
```

或修改配置使用其他端口：
```json
{
  "aiVSCodeBridge.port": 8766
}
```

## 🤝 配套项目

- **Chrome 扩展**: [ai-to-vscode-chrome-extension](https://github.com/yourusername/chrome-extension-ts)

## 📝 更新日志

### [1.0.0] - 2025-10-15

#### 新增
- ✨ WebSocket 服务器支持
- 💾 自动文件保存功能
- 📝 局部更新功能
- 🌐 页面克隆功能
- 📊 实时连接状态显示
- ⚙️ 可配置端口设置

## 🙏 致谢

- [VS Code Extension API](https://code.visualstudio.com/api)
- [ws](https://github.com/websockets/ws) - WebSocket 库

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

**如果这个项目对你有帮助，请给它一个 ⭐️！**

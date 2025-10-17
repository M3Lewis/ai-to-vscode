# AI to VSCode Bridge

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/yourusername/ai-vscode-bridge)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.80+-007ACC.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

一个强大的VS Code扩展，可以将AI对话内容从浏览器无缝传输到VS Code，并与Cline插件集成，实现AI辅助开发的完整工作流。

## ✨ 功能特性

- 🚀 **实时接收**：通过WebSocket实时接收来自Chrome扩展的AI对话内容
- 💾 **自动保存**：自动将内容保存为指定文件名（如plan.md）
- 🔗 **Cline集成**：一键调用Cline插件执行AI生成的计划
- 📊 **状态监控**：实时显示WebSocket连接状态
- ⚙️ **可配置**：支持自定义WebSocket端口
- 🎯 **智能定位**：自动打开并定位到保存的文件

## 📦 安装

### 方式一：从VSIX文件安装

1. 下载最新的`.vsix`文件
2. 打开VS Code
3. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS)
4. 输入 `Extensions: Install from VSIX...`
5. 选择下载的`.vsix`文件

### 方式二：从源码安装

```
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
- **Chrome扩展**: 需要配套的Chrome扩展（ai-to-vscode-bridge）
- **Cline插件**（可选）: 用于执行AI生成的任务

安装Cline插件：
```
ext install saoudrizwan.claude-dev
```

## 🚀 快速开始

### 1. 启动WebSocket服务器

扩展激活后会自动启动WebSocket服务器，你可以在状态栏看到：

```
🗼 AI Bridge:8765
```

绿色表示服务器正在运行，点击可以停止/启动服务器。

### 2. 配置Chrome扩展

确保Chrome扩展已正确配置并连接到相同的端口（默认8765）。

### 3. 接收AI对话内容

1. 在Chrome中访问AI对话网站（ChatGPT、Claude等）
2. 获得AI回答后，在Chrome扩展悬浮窗中输入文件名
3. 点击"发送到VS Code"
4. 内容会自动保存到当前工作区

### 4. 执行Cline任务

1. 打开保存的`plan.md`文件
2. 点击编辑器右上角的 ▶️ 按钮
3. 或使用命令面板：`AI VSCode Bridge: 执行Cline任务`
4. 内容会自动添加到Cline聊天窗口

## ⚙️ 配置选项

在VS Code设置中搜索 `aiVSCodeBridge`：

```
{
  "aiVSCodeBridge.port": 8765
}
```

### 可用设置

| 设置项 | 类型 | 默认值 | 描述 |
|-------|------|--------|------|
| `aiVSCodeBridge.port` | number | 8765 | WebSocket服务器监听端口 |

## 🎯 使用场景

### 场景一：AI生成开发计划

1. 在ChatGPT中询问："帮我制定一个RESTful API的开发计划"
2. 获得回答后通过Chrome扩展发送到VS Code
3. 自动保存为`plan.md`
4. 点击执行按钮，Cline自动开始实施计划

### 场景二：代码审查建议

1. 在Claude中上传代码并获取审查建议
2. 将建议保存为`review.md`
3. 在VS Code中查看并逐项处理

### 场景三：技术文档生成

1. 使用AI生成API文档或README
2. 快速保存到项目中
3. 继续编辑和完善

## 📋 命令列表

| 命令 | 快捷键 | 描述 |
|------|--------|------|
| `AI VSCode Bridge: 执行Cline任务` | - | 将当前plan.md内容发送给Cline |
| `AI VSCode Bridge: 切换WebSocket服务器` | - | 启动/停止WebSocket服务器 |

## 🔌 API 接口

### WebSocket消息格式

**接收消息（来自Chrome扩展）：**
```
{
  "type": "saveFile",
  "content": "文件内容",
  "filename": "plan.md",
  "timestamp": 1697385600000
}
```

**发送响应：**
```
{
  "type": "success",
  "filename": "plan.md"
}
```

或错误响应：
```
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
│   ├── clineIntegration.ts   # Cline集成逻辑
│   └── test/                 # 测试文件
├── out/                      # 编译输出
├── package.json
├── tsconfig.json
└── README.md
```

### 开发环境设置

```
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

1. 在VS Code中打开项目
2. 按 `F5` 启动调试
3. 新窗口会打开，扩展已加载
4. 在调试控制台查看日志

### 运行测试

```
npm test
```

## 🐛 故障排除

### WebSocket连接失败

**问题**: Chrome扩展显示"未连接"

**解决方案**:
1. 检查VS Code扩展是否已启动（查看状态栏）
2. 确认端口号配置一致（默认8765）
3. 检查防火墙是否阻止了localhost连接
4. 重启VS Code扩展

### 文件保存失败

**问题**: 提示"请先打开一个工作区"

**解决方案**:
1. 在VS Code中打开一个文件夹作为工作区
2. 使用 `File > Open Folder...`

### Cline命令无响应

**问题**: 点击执行按钮后Cline没有反应

**解决方案**:
1. 确认Cline插件已安装：`ext install saoudrizwan.claude-dev`
2. 手动激活Cline面板
3. 检查`plan.md`文件是否存在
4. 查看输出面板的错误信息

### 端口被占用

**问题**: WebSocket服务器启动失败

**解决方案**:
```
# Windows
netstat -ano | findstr :8765
taskkill /PID <进程ID> /F

# Linux/Mac
lsof -i :8765
kill -9 <进程ID>
```

或修改配置使用其他端口：
```
{
  "aiVSCodeBridge.port": 8766
}
```

## 🤝 配套项目

- **Chrome扩展**: [ai-to-vscode-chrome-extension](https://github.com/yourusername/chrome-extension-ts)
- **Cline插件**: [Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)

## 📝 更新日志

### [1.0.0] - 2025-10-15

#### 新增
- ✨ WebSocket服务器支持
- 💾 自动文件保存功能
- 🔗 Cline插件集成
- 📊 实时连接状态显示
- ⚙️ 可配置端口设置

## 🙏 致谢

- [Cline](https://cline.bot) - 强大的AI编程助手
- [VS Code Extension API](https://code.visualstudio.com/api)
- [ws](https://github.com/websockets/ws) - WebSocket库

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 👨‍💻 作者

Your Name - [@yourhandle](https://twitter.com/yourhandle)

项目链接: [https://github.com/yourusername/ai-vscode-bridge](https://github.com/yourusername/ai-vscode-bridge)

---

**如果这个项目对你有帮助，请给它一个 ⭐️！**

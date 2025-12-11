# 技术上下文

## 开发环境
- **操作系统**: Windows 10 (Build 17763)
- **Shell**: Git Bash
- **Node.js**: 需要检查版本
- **包管理器**: npm

## 技术架构

### Chrome扩展架构
- **Manifest V3**: 使用最新的Chrome扩展标准
- **Service Worker**: 后台脚本使用Service Worker而非Background Page
- **Content Scripts**: 在网页中注入脚本处理用户交互
- **WebSocket通信**: 与VS Code扩展建立实时连接

### TypeScript配置
- **目标版本**: ES2020
- **模块系统**: ESNext
- **严格模式**: 启用
- **类型检查**: 包含Chrome API类型定义

### 构建系统
- **Webpack 5**: 模块打包
- **TypeScript Loader**: 编译TypeScript
- **Copy Plugin**: 复制静态资源
- **开发/生产环境**: 分离配置

## 依赖关系

### 生产依赖
- `ws`: WebSocket客户端库

### 开发依赖
- `typescript`: TypeScript编译器
- `webpack`: 模块打包器
- `ts-loader`: Webpack TypeScript加载器
- `@types/chrome`: Chrome API类型定义
- `@types/node`: Node.js类型定义
- `@types/ws`: WebSocket类型定义

## 关键API使用

### Chrome Extension APIs
- `chrome.runtime`: 扩展运行时管理
- `chrome.tabs`: 标签页操作
- `chrome.storage`: 数据存储
- `chrome.scripting`: 脚本注入

### WebSocket通信
- 连接管理: 自动重连机制
- 消息队列: 离线消息缓存
- 状态广播: 连接状态通知

### DOM操作优化 (新增)
- **高性能查找**: 局部DOM查找策略，避免全局遍历
- **站点专用适配**: Perplexity.ai专用查找方法
- **多站点兼容**: 支持ChatGPT、Claude、Gemini、AI Studio等
- **性能监控**: 查找耗时统计和内存使用监控

## 安全考虑
- **权限最小化**: 仅请求必要的Chrome权限
- **内容安全策略**: 遵循CSP规范
- **数据验证**: 输入内容验证和清理
- **错误处理**: 完善的错误处理机制

## 性能优化策略 (新增)

### DOM查找优化
- **局部查找**: 只在特定容器内查找按钮，避免全局遍历
- **选择器优化**: 使用高效的CSS选择器
- **递归搜索**: 当标准选择器失效时，使用递归搜索作为备选
- **性能监控**: 实时监控查找耗时和内存使用

### 内容处理优化
- **长度限制**: 50KB内容长度限制，防止性能问题
- **分批处理**: 超长内容提供分批操作建议
- **内存管理**: 及时清理DOM引用，防止内存泄漏

### 调试优化
- **环境检测**: 根据环境控制日志输出
- **生产优化**: 生产环境减少不必要的日志
- **关键信息**: 保留重要的调试和错误信息

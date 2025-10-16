# 项目简介

## 项目名称
AI to VSCode Bridge - Chrome扩展

## 项目描述
一个Chrome浏览器扩展，用于将AI对话内容一键发送到VS Code并自动保存为Markdown文件。通过WebSocket连接实现与VS Code的实时通信。

## 技术栈
- **类型**: Chrome扩展 (Manifest V3)
- **主要语言**: TypeScript
- **目标框架**: ES2020
- **构建工具**: Webpack 5
- **UI框架**: 原生HTML/CSS/JavaScript
- **通信协议**: WebSocket
- **存储**: Chrome Storage API

## 核心功能
1. **智能内容提取**: 自动识别并复制AI对话内容
2. **WebSocket通信**: 与VS Code建立实时连接
3. **智能文件命名**: 基于内容自动生成有意义的文件名
4. **多网站支持**: 支持ChatGPT、Claude、Gemini等AI平台
5. **连接状态监控**: 实时显示与VS Code的连接状态
6. **配置管理**: 支持自定义端口和网站配置

## 项目结构
- `src/background.ts` - 后台服务，处理WebSocket连接
- `src/content.ts` - 内容脚本，处理页面交互
- `src/popup.ts` - 弹窗界面
- `src/types/` - TypeScript类型定义
- `src/utils/` - 工具函数
- `public/` - 静态资源文件

## 目标平台
- Chrome浏览器 (Manifest V3)
- VS Code (通过WebSocket扩展)
- 支持的AI网站: ChatGPT, Claude, Gemini, Perplexity等

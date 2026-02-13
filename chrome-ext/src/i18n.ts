export type Language = 'zh' | 'en';

export interface Translations {
    [key: string]: {
        zh: string;
        en: string;
    };
}

// 翻译字典
const translations: Translations = {
    // --- Popup Static (HTML) ---
    'settingsTitle': { zh: '⚙️ AI to VSCode Bridge', en: '⚙️ AI to VSCode Bridge' },
    'portLabel': { zh: 'WebSocket端口：', en: 'WebSocket Port:' },
    'portHint': { zh: '修改后需要重启VS Code扩展，默认：8765', en: 'Restart VS Code extension after changing. Default: 8765' },
    'displayOptionLabel': { zh: '显示选项：', en: 'Display Options:' },
    'showOnAllSitesLabel': { zh: '在所有网站显示悬浮窗', en: 'Show floating panel on all sites' },
    'showOnAllSitesHint': { zh: '启用后悬浮窗将在所有网站显示，否则只在下方列表中的网站显示', en: 'If enabled, the panel shows on all sites. Otherwise, only on sites listed below.' },
    'enabledSitesLabel': { zh: '启用的网站：', en: 'Enabled Sites:' },
    'addUrlPlaceholder': { zh: '输入网站域名（如：perplexity.ai）', en: 'Enter domain (e.g., perplexity.ai)' },
    'addUrlBtn': { zh: '添加', en: 'Add' },
    'emptyUrlList': { zh: '暂无网站', en: 'No sites configured' },
    'urlListHint': { zh: '支持通配符，如：*.openai.com 匹配所有OpenAI子域名', en: 'Supports wildcards, e.g., *.openai.com matches all OpenAI subdomains' },
    'advancedConfigLabel': { zh: '网站选择器配置（高级）：', en: 'Site Selector Config (Advanced):' },
    'advancedConfigHint': { zh: '为特定网站自定义COPY按钮的CSS选择器，用于适配不同AI对话界面', en: 'Customize CSS selectors for COPY buttons to adapt to different AI chat interfaces' },
    'configHostnamePlaceholder': { zh: '网站域名（如：perplexity.ai）', en: 'Domain (e.g., perplexity.ai)' },
    'configSelectorPlaceholder': { zh: 'COPY按钮选择器（如：button[aria-label="Copy"]）', en: 'Copy button selector (e.g., button[aria-label="Copy"])' },
    'configContainerPlaceholder': { zh: '回答容器选择器（可选，用于定位最新回答）', en: 'Response container selector (optional, for latest response)' },
    'smartFindBtn': { zh: '🔍 智能查找当前页面的COPY按钮', en: '🔍 Smart Find Copy Button' },
    'addConfigBtn': { zh: '添加配置', en: 'Add Config' },
    'emptyConfigList': { zh: '暂无自定义配置', en: 'No custom configs' },
    'howToFindSelector': { zh: '💡 如何找到CSS选择器？', en: '💡 How to find CSS selectors?' },
    'smartFindMethod': { zh: '方式1: 使用智能查找（推荐）', en: 'Method 1: Smart Find (Recommended)' },
    'smartFindSteps': { zh: '1. 在AI网站打开对话并获得回答\n2. 点击扩展图标打开设置\n3. 点击"🔍 智能查找"按钮\n4. 从列表中选择合适的按钮\n5. 自动填充到配置中', en: '1. Open chat on AI site and get a response\n2. Click extension icon to open settings\n3. Click "🔍 Smart Find"\n4. Select a button from the list\n5. Auto-fills the config' },
    'manualFindMethod': { zh: '方式2: 手动查找', en: 'Method 2: Manual Find' },
    'manualFindSteps': { zh: '1. 在AI网站按 F12 打开开发者工具\n2. 右键点击COPY按钮 → 选择"检查"\n3. 在Elements标签，右键高亮的元素\n4. 选择 Copy → Copy selector\n5. 粘贴到"COPY按钮选择器"输入框\n6. 点击"添加配置"并保存设置', en: '1. Press F12 on AI site\n2. Right-click Copy button → "Inspect"\n3. Right-click highlighted element in Elements tab\n4. Copy → Copy selector\n5. Paste into "Copy button selector" input\n6. Click "Add Config" and Save' },
    'commonSelectors': { zh: '常见选择器示例：', en: 'Common selector examples:' },
    'promptManageLabel': { zh: 'AI Studio 提示词管理（System Instructions）：', en: 'AI Studio Prompt Management (System Instructions):' },
    'promptManageHint': { zh: '选择本地 Markdown 文件作为提示词模板，文件名将作为提示词名称', en: 'Select local Markdown file as prompt template. Filename becomes prompt name.' },
    'noFileSelected': { zh: '未选择文件', en: 'No file selected' },
    'selectFileBtn': { zh: '📁 选择文件', en: '📁 Select File' },
    'addPromptBtn': { zh: '添加提示词', en: 'Add Prompt' },
    'emptyPromptList': { zh: '暂无提示词配置', en: 'No prompts configured' },
    'howToUsePrompts': { zh: '💡 如何使用提示词功能？', en: '💡 How to use prompts?' },
    'promptSteps': { zh: '1. 点击"📁 选择文件"，选择 Markdown 文件\n2. 文件名将自动作为提示词名称\n3. 点击"添加提示词"\n4. 保存设置后，悬浮窗会显示对应按钮\n5. 在 AI Studio 点击按钮快速切换提示词', en: '1. Click "📁 Select File", choose Markdown file\n2. Filename becomes prompt name\n3. Click "Add Prompt"\n4. After saving, buttons appear in floating panel\n5. Click button in AI Studio to switch prompts' },
    'promptTips': { zh: '提示：\n• 支持 .md、.markdown、.txt 格式\n• 文件名会去掉扩展名作为显示名称\n• 仅在 AI Studio 网站显示此功能', en: 'Tips:\n• Supports .md, .markdown, .txt\n• Filename (w/o extension) is display name\n• Only shows on AI Studio' },
    'savePathLabel': { zh: '📂 文件保存路径：', en: '📂 File Save Path:' },
    'savePathHint': { zh: '设置文件保存到 VS Code 项目中的相对路径（留空则保存到根目录）', en: 'Relative path in VS Code project (leave empty for root)' },
    'savePathPlaceholder': { zh: '例如：docs/ai-responses 或 output', en: 'e.g., docs/ai-responses or output' },
    'savePathTip': { zh: '💡 提示：路径会自动创建（如不存在），无需以 / 开头或结尾', en: '💡 Tip: Path auto-created. No leading/trailing / needed.' },
    'memoryManageLabel': { zh: '📂 路径记忆管理：', en: '📂 Path Memory Management:' },
    'currentProject': { zh: '当前项目:', en: 'Current Project:' },
    'notConnected': { zh: '未连接', en: 'Not Connected' },
    'memoryHint': { zh: '管理插件记住的文件路径。路径记忆已按 VS Code 项目隔离。', en: 'Manage remembered file paths. Isolated by VS Code project.' },
    'addMemoryTitle': { zh: '➕ 手动添加/修改记忆', en: '➕ Add/Edit Memory' },
    'memFilenamePlaceholder': { zh: '文件名 (如: SKILL.md)', en: 'Filename (e.g., SKILL.md)' },
    'memPathPlaceholder': { zh: '所在目录 (如: docs/project)', en: 'Directory (e.g., docs/project)' },
    'addMemBtn': { zh: '添加记忆', en: 'Add Memory' },
    'rememberedPathsLabel': { zh: '已记住的路径：', en: 'Remembered Paths:' },
    'clearMemBtn': { zh: '清空全部', en: 'Clear All' },
    'emptyMemoryList': { zh: '暂无路径记忆', en: 'No paths remembered' },
    'saveSettingsBtn': { zh: '💾 保存设置', en: '💾 Save Settings' },
    'resetDefaultsBtn': { zh: '🔄 恢复默认', en: '🔄 Reset Defaults' },
    'exportConfigBtn': { zh: '📤 导出配置', en: '📤 Export Config' },
    'importConfigBtn': { zh: '📥 导入配置', en: '📥 Import Config' },
    'delete': { zh: '删除', en: 'Delete' },
    'containerLabel': { zh: '容器:', en: 'Container:' },

    // --- Popup Dynamic (TS) ---
    'enterDomain': { zh: '请输入网站域名', en: 'Please enter a domain' },
    'invalidDomain': { zh: '请输入有效的域名格式', en: 'Invalid domain format' },
    'domainExists': { zh: '该网站已存在', en: 'Domain already exists' },
    'addedClickSave': { zh: '✅ 已添加，请点击保存设置', en: '✅ Added. Please save settings.' },
    'deletedClickSave': { zh: '✅ 已删除，请点击保存设置', en: '✅ Deleted. Please save settings.' },
    'enterDomainAndSelector': { zh: '请输入域名和COPY按钮选择器', en: 'Please enter domain and copy button selector' },
    'configExists': { zh: '该网站配置已存在，请先删除', en: 'Config exists. Please delete first.' },
    'configAdded': { zh: '✅ 已添加配置，请点击保存设置', en: '✅ Config added. Please save settings.' },
    'saveSettingsWithUnsaved': { zh: '💾 保存设置 (有未保存的更改)', en: '💾 Save Settings (Unsaved changes)' },
    'savedSuccess': { zh: '✅ 设置已保存', en: '✅ Settings saved' },
    'saveFailed': { zh: '❌ 保存失败', en: '❌ Save failed' },
    'smartFindScanning': { zh: '🔍 正在扫描页面...', en: '🔍 Scanning page...' },
    'smartFindSearching': { zh: '正在查找COPY按钮...', en: 'Searching for COPY buttons...' },
    'smartFindResult': { zh: '🔍 查找结果', en: '🔍 Find Results' },
    'smartFindEmpty': { zh: '未找到COPY按钮', en: 'No COPY button found' },
    'smartFindEmptyHint': { zh: '请确保当前页面有AI对话回答，并且有复制按钮', en: 'Ensure page has AI response and copy button' },
    'close': { zh: '关闭', en: 'Close' },
    'cancel': { zh: '取消', en: 'Cancel' },
    'confirm': { zh: '确定', en: 'Confirm' },
    'foundCandidates': { zh: '🔍 找到 ${count} 个候选按钮', en: '🔍 Found ${count} candidates' }, // Dynamic replace
    'selectCandidate': { zh: '点击选择一个COPY按钮：', en: 'Click to select a COPY button:' },
    'score': { zh: '相关度: ${score}分', en: 'Score: ${score}' },
    'selected': { zh: '✅ 已选择: ${selector}', en: '✅ Selected: ${selector}' },
    'cantGetTab': { zh: '无法获取当前标签页', en: 'Cannot get active tab' },
    'smartFindFailed': { zh: '智能查找失败', en: 'Smart find failed' },

    // --- Content Floating Panel (TS) ---
    'panelTitle': { zh: '⚡ VS Code Bridge', en: '⚡ VS Code Bridge' },
    'waitingConnection': { zh: '未连接', en: 'Disconnected' },
    'connected': { zh: '已连接', en: 'Connected' },
    'togglePanel': { zh: '折叠/展开面板', en: 'Toggle Panel' },
    'closePanel': { zh: '关闭面板', en: 'Close Panel' },
    'filenamePreview': { zh: '文件名预览...', en: 'Filename preview...' },
    'sectionCodeOps': { zh: '代码操作', en: 'Code Ops' },
    'btnCopySave': { zh: '复制并保存', en: 'Copy & Save' },
    'btnCopySaveTitle': { zh: '复制剪贴板内容并保存到 VS Code', en: 'Copy clipboard content & save to VS Code' },
    'btnCreateFiles': { zh: '识别并创建', en: 'Smart Create' },
    'btnCreateFilesTitle': { zh: '识别代码块中的路径并直接创建文件', en: 'Detect paths in code blocks & create files' },
    'btnPatch': { zh: '局部更新', en: 'Patch Update' },
    'btnPatchTitle': { zh: '智能识别路径并局部更新文件内容', en: 'Smart detect paths & patch file content' },
    'sectionElementTools': { zh: '元素工具', en: 'Element Tools' },
    'btnScreenshot': { zh: '📷 截图元素', en: '📷 Element Shot' },
    'btnScreenshotTitle': { zh: '选择元素并截图（带红框）', en: 'Select element & capture (w/ red border)' },
    'btnCopyElem': { zh: '📋 复制元素', en: '📋 Copy Elem' },
    'btnCopyElemTitle': { zh: '选择元素并复制其代码', en: 'Select element & copy code' },
    'btnCopyElemDeep': { zh: '📄 复制(含子)', en: '📄 Copy Deep' },
    'btnCopyElemDeepTitle': { zh: '选择元素并复制其完整 HTML（包含子元素）', en: 'Select element & copy full HTML (w/ children)' },
    'btnFullShot': { zh: '🖥️ 全屏截图', en: '🖥️ Full Shot' },
    'btnFullShotTitle': { zh: '截取当前页面并发送到 VS Code', en: 'Capture page & send to VS Code' },
    'btnClonePage': { zh: '🔄 复刻页面', en: '🔄 Clone Page' },
    'btnClonePageTitle': { zh: '复刻当前页面：注入锚点 -> 截图 -> 提取数据 -> 发送', en: 'Clone Page: Inject anchors -> Screenshot -> Extract -> Send' },
    'sectionAIStudio': { zh: 'AI Studio', en: 'AI Studio' },
    'btnSyncDrive': { zh: '📥 同步文件', en: '📥 Sync Files' },
    'btnSyncDriveTitle': { zh: '同步 AI Studio Drive 中的所有文件到本地', en: 'Sync all AI Studio Drive files to local' },
    'btnExportChat': { zh: '📝 导出对话', en: '📝 Export Chat' },
    'btnExportChatTitle': { zh: '导出 AI Studio 所有历史对话为 Markdown 文件', en: 'Export full AI Studio chat history as Markdown' },
    'sectionPrompts': { zh: '提示词', en: 'Prompts' },
    'togglePrompts': { zh: '折叠/展开提示词', en: 'Toggle Prompts' },

    // Content Notifications/Errors
    'handlerNoContent': { zh: 'Handler 目标内容为空', en: 'Handler target content is empty' },
    'noCopyButton': { zh: '❌ 未找到COPY按钮', en: '❌ COPY button not found' },
    'contentEmpty': { zh: '❌ 内容为空', en: '❌ Content is empty' },
    'opFailed': { zh: '❌ 操作失败', en: '❌ Operation failed' },
    'noValidPaths': { zh: '未在代码块中识别到有效的文件路径', en: 'No valid file paths found in code blocks' },
    'createdFiles': { zh: '已创建 ${count} 个文件', en: 'Created ${count} files' },
    'failedCreate': { zh: '创建文件失败', en: 'Failed to create files' },
    'sentUpdate': { zh: '已发送 ${count} 个局部更新', en: 'Sent ${count} partial updates' },
    'failedUpdate': { zh: '发送更新失败', en: 'Failed to send updates' },
    'selectElemCapture': { zh: '请选择要截图的元素 (按 Esc 取消)', en: 'Select element to capture (Esc to cancel)' },
    'pickedElem': { zh: '已选择元素', en: 'Element selected' },
    'copiedElem': { zh: '元素信息已复制', en: 'Element info copied' },
    'copiedElemDeep': { zh: '已复制元素 HTML (含子元素)', en: 'Copied element HTML (deep)' },
    'copyFailed': { zh: '复制失败', en: 'Copy failed' },
    'preparingClone': { zh: '正在准备复刻...', en: 'Preparing to clone...' },
    'screenshotCopied': { zh: '带有标注的截图已复制到剪贴板', en: 'Annotated screenshot copied to clipboard' },
    'cloneFailed': { zh: '复刻处理失败', en: 'Clone failed' },
    'aiStudioOnly': { zh: '此功能仅在 AI Studio 可用', en: 'Feature only available on AI Studio' },
    'scanningFiles': { zh: '正在扫描文件...', en: 'Scanning files...' },
    'noFilesFound': { zh: '未找到可同步的文件', en: 'No files found to sync' },
    'syncing': { zh: '正在同步 (${current}/${total}): ${name}', en: 'Syncing (${current}/${total}): ${name}' },
    'screenshotFailed': { zh: '截屏失败', en: 'Screenshot failed' },
    'foundFiles': { zh: '找到 ${count} 个文件，开始同步...', en: 'Found ${count} files. Starting sync...' },
    'fileContentEmpty': { zh: '文件 ${name} 内容为空，跳过', en: 'File ${name} empty, skipping' },
    'syncedFiles': { zh: '已同步 ${count} 个文件到 VS Code', en: 'Synced ${count} files to VS Code' },
    'syncFailed': { zh: '同步失败', en: 'Sync failed' },
    'extractingHistory': { zh: '正在提取对话历史...', en: 'Extracting chat history...' },
    'noPromptButtons': { zh: '未找到对话按钮', en: 'No chat buttons found' },
    'foundPrompts': { zh: '找到 ${count} 轮对话，开始提取...', en: 'Found ${count} turns. Extracting...' },
    'extracting': { zh: '提取中 (${current}/${total})...', en: 'Extracting (${current}/${total})...' },
    'turnExtractFailed': { zh: '第${index}轮提取失败', en: 'Failed to extract turn ${index}' },
    'extractQuestionFailed': { zh: '无法提取问题', en: 'Failed to extract question' },
    'extractAnswerFailed': { zh: '无法提取回答', en: 'Failed to extract answer' },
    'noConversationContent': { zh: '未找到对话内容', en: 'No conversation content found' },
    'exportedHistory': { zh: '已导出 ${count} 轮对话到 ${filename}', en: 'Exported ${count} turns to ${filename}' },
    'fetchingCommitMsg': { zh: '正在获取 Commit Message...', en: 'Fetching Commit Message...' },
    'noGithubButton': { zh: '未找到 GitHub 同步按钮', en: 'GitHub sync button not found' },
    'commitMsgInputNotFound': { zh: '未找到 Commit Message 输入框', en: 'Commit message input not found' },
    'extractCommitMsgFailed': { zh: '无法提取 Commit Message', en: 'Failed to extract commit message' },
    'commitMsgCopied': { zh: 'Commit Message 已复制到剪贴板', en: 'Commit Message copied to clipboard' },
    'syncCommitMsgFailed': { zh: '同步 Commit Message 失败', en: 'Failed to sync Commit Message' },
    'fileEmptySkip': { zh: '文件 ${name} 内容为空，跳过', en: 'File ${name} is empty, skipping' },
    'syncComplete': { zh: '同步完成！成功: ${success}, 失败: ${fail}', en: 'Sync complete! Success: ${success}, Fail: ${fail}' },
    'exporting': { zh: '正在导出...', en: 'Exporting...' },
    'defaultConversationTitle': { zh: 'AI Studio 对话导出', en: 'AI Studio Chat Export' },
    'exportTime': { zh: '导出时间', en: 'Export Time' },
    'turnCount': { zh: '轮数统计', en: 'Turn Count' },
    'exportComplete': { zh: '导出完成', en: 'Export complete' },
    'menuButtonNotFound': { zh: '未找到菜单按钮', en: 'Menu button not found' },
    'copyButtonNotFound': { zh: '未找到复制按钮', en: 'Copy button not found' },
    'clipboardTyEmpty': { zh: '剪贴板为空', en: 'Clipboard is empty' },
    'contentTooLong': { zh: '内容过长，请分批复制', en: 'Content too long, please copy in batches' },
    'promptContentEmpty': { zh: '提示词内容为空', en: 'Prompt content is empty' },
    'sysInstrBtnNotFound': { zh: '未找到 System Instructions 按钮', en: 'System Instructions button not found' },
    'sysInstrTextareaNotFound': { zh: '未找到 System Instructions 输入框', en: 'System Instructions textarea not found' },
    'appliedPrompt': { zh: '已应用: ${name}', en: 'Applied: ${name}' },
    'applyPromptFailed': { zh: '应用失败', en: 'Apply failed' },
    'capturing': { zh: '正在捕获...', en: 'Capturing...' },
    'elementCaptureCopied': { zh: '✅ 元素信息与截图已合并复制，请 Ctrl+V 粘贴', en: '✅ Element info and screenshot merged to clipboard. Press Ctrl+V to paste.' },
    'screenshotCopiedShort': { zh: '✅ 截图已复制，请 Ctrl+V 粘贴', en: '✅ Screenshot copied. Press Ctrl+V to paste.' },
    'computedStyles': { zh: '计算样式', en: 'Computed Styles' },
    'innerClipboardText': { zh: '内部文本', en: 'Inner Text' },
    'elementInfo': { zh: '元素', en: 'Element' },
    'htmlInfo': { zh: 'HTML', en: 'HTML' },
    'waitMonacoReady': { zh: '等待 Monaco 编辑器就绪...', en: 'Waiting for Monaco editor ready...' },
    'monacoReady': { zh: 'Monaco 编辑器已就绪', en: 'Monaco editor ready' },
    'extractingContent': { zh: '正在提取内容...', en: 'Extracting content...' },
    'extractedTurns': { zh: '找到 ${count} 轮对话，开始提取...', en: 'Found ${count} turns. Extracting...' },
    'syncingFiles': { zh: '正在同步 (${current}/${total}): ${name}', en: 'Syncing (${current}/${total}): ${name}' },
    'syncedCount': { zh: '已同步 ${count} 个文件到 VS Code', en: 'Synced ${count} files to VS Code' },


    // --- Popup Confirms & Status (Added) ---
    'confirmReset': { zh: '确定要恢复默认设置吗？所有自定义配置将被清除。', en: 'Reset to defaults? All custom configs will be lost.' },
    'resetSuccess': { zh: '✅ 已恢复默认设置，请点击保存', en: '✅ Reset to defaults. Please save.' },
    'configExported': { zh: '✅ 配置已导出', en: '✅ Config exported' },
    'exportFailed': { zh: '❌ 导出失败: ', en: '❌ Export failed: ' },
    'invalidConfig': { zh: '❌ 无效的配置文件格式', en: '❌ Invalid config format' },
    'confirmImport': { zh: '确定要导入配置吗？当前配置将被覆盖。', en: 'Import config? Current settings will be overwritten.' },
    'configImported': { zh: '✅ 配置已导入，请刷新网页使配置生效', en: '✅ Imported. Refresh page to apply.' },
    'importFailed': { zh: '❌ 导入失败: ', en: '❌ Import failed: ' },
    'contentLength': { zh: '内容长度: ${length} 字符', en: 'Length: ${length} chars' },
    'rename': { zh: '✏️ 重命名', en: '✏️ Rename' },
    'nameEmpty': { zh: '❌ 名称不能为空', en: '❌ Name cannot be empty' },
    'promptExists': { zh: '❌ 提示词 "${name}" 已存在', en: '❌ Prompt "${name}" already exists' },
    'renamed': { zh: '✅ 已重命名为：${name}', en: '✅ Renamed to: ${name}' },
    'fileLoaded': { zh: '✅ 已加载: ${name} (${length} 字符)', en: '✅ Loaded: ${name} (${length} chars)' },
    'readFileFailed': { zh: '❌ 读取文件失败', en: '❌ Read file failed' },
    'pleaseSelectFile': { zh: '❌ 请先选择文件', en: '❌ Please select a file first' },
    'promptAdded': { zh: '✅ 已添加提示词：${name}', en: '✅ Prompt added: ${name}' },
    'enterFilenamePath': { zh: '请输入文件名和路径', en: 'Please enter filename and path' },
    'memoryAdded': { zh: '✅ 记忆已添加', en: '✅ Memory added' },
    'confirmDeleteMemory': { zh: '确定要删除 ${filename} 的路径记忆吗？', en: 'Delete memory for ${filename}?' },
    'memoryDeleted': { zh: '✅ 记忆已删除', en: '✅ Memory deleted' },
    'confirmClearMemory': { zh: '确定要清空当前项目的路径记忆吗？此操作不可撤销。', en: 'Clear all memory for this project? Irreversible.' },
    'memoryCleared': { zh: '✅ 记忆已清空', en: '✅ Memory cleared' },
    'langName': { zh: 'English', en: '中文' },
    'edit': { zh: '编辑', en: 'Edit' }
};

let currentLanguage: Language = 'zh';

export function setLanguage(lang: Language) {
    currentLanguage = lang;
}

export function getLanguage(): Language {
    return currentLanguage;
}

export function t(key: string, replacements?: Record<string, string | number>): string {
    const item = translations[key];
    if (!item) {
        console.warn(`[i18n] Missing translation for key: ${key}`);
        return key;
    }
    let text = item[currentLanguage];
    if (replacements) {
        for (const [k, v] of Object.entries(replacements)) {
            text = text.replace(`\${${k}}`, String(v));
        }
    }
    return text;
}

export function applyI18n(container: HTMLElement = document.body) {
    // 1. Static text content: data-i18n="key"
    const elements = container.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    });

    // 2. Placeholders: data-i18n-placeholder="key"
    const inputs = container.querySelectorAll('[data-i18n-placeholder]');
    inputs.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key && el instanceof HTMLInputElement) {
            el.placeholder = t(key);
        }
    });



    // 3. Titles: data-i18n-title="key"
    const titles = container.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) {
            el.setAttribute('title', t(key));
        }
    });
}

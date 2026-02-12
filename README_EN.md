[**中文**](./README.md) | **English**

# AI to VSCode Bridge

**AI to VSCode Bridge** is a Chrome extension designed to bridge the gap between AI web conversations (such as ChatGPT, Claude, DeepWiki, etc.) and the VS Code editor. It allows you to send code blocks and conversation content from web pages to VS Code with one click, and even create files directly or auto-complete code based on context.

## 🌟 Core Features

### 🛠️ Floating Panel Features

Action buttons on the bottom-right control panel:

- **Copy & Save** `[Primary]`
  - **Function**: One-click extraction of the current AI response text and send it to VS Code.
  - **Features**: Automatically detects code block language and intelligently generates file names. Supports DeepWiki, ChatGPT, Claude and other mainstream sites.

- **Identify & Create**
  - **Function**: Intelligently parses multiple code blocks (e.g., `main.py`, `utils.py`) in AI Studio Build responses to **batch create corresponding files** in VS Code.
  - **Scenario**: Use when AI provides a complete multi-file project structure.

- **Partial Update**
  - **Function**: Applies AI-modified code snippets to existing source files in VS Code, **updating only the changed parts**.
  - **Scenario**: When fixing bugs or refactoring functions, avoids overwriting the entire file.

- **Capture & Clone**
  - **Element Screenshot / Fullscreen Screenshot**: Capture the current DOM element or entire page and save as an image.
  - **Clone Page**: Captures the current page's DOM structure and styles, rebuilds as HTML/CSS in VS Code for rapid prototype cloning.

- **Export Chat**
  - **Function**: Designed specifically for Google AI Studio, one-click export of the current conversation history as a high-quality Markdown document.
  - **Features**:
    - Automatically preserves code blocks, tables, images and formatting.
    - Smart cleaning: Automatically removes irrelevant reference links (e.g., `[1]`), UI button text and redirect links.
    - File names automatically include timestamp and conversation title.

- **Sync Build Files**: Synchronize current build artifacts to the project directory (for development debugging).

### ⚙️ Advanced Settings

Features on the extension settings page:

- **Smart Find**: Automatically detects Copy buttons and answer containers on the current web page, enabling one-click adaptation to unknown AI sites.
- **AI Studio Prompt Management**: Quickly load local Markdown prompt libraries in Google AI Studio, with file selection and quick switching support.
- **Path Memory Management**: Automatically records VS Code project file path context for quick location of save paths next time. Supports per-project isolated memory.

## 🏗️ Architecture Overview

This extension uses a **Chrome Extension + Local Server** architecture to communicate with VS Code.

```plaintext
+-----------------------------------------------------+          +----------------------------------+
|                   CHROME BROWSER                    |          |            LOCAL SYSTEM          |
|                                                     |          |                                  |
|  +-------------------+      +--------------------+  |  HTTP    |  +-------------+    +---------+  |
|  |     AI Website    |      |  Extension Content |  |  POST    |  | Local Server|    | VS Code |  |
|  | (ChatGPT/Claude)  |----->|       Script       |--|--------->|  | (Port 8765) |--> | Editor  |  |
|  +-------------------+      |  (Floating Panel)  |  |          |  +-------------+    +---------+  |
|                             +--------------------+  |          |         |                |       |  |
|                                        ^            |          |         v                v       |  |
|                                        |            |          |  +-----------------------------+ |  |
|                                   +-----------+     |          |  |                             | |  |
|                                   | Site      |     |          |  |       Local File System     | |  |
|                                   | Handler   |     |          |  |                             | |  |
|                                   +-----------+     |          |  +-----------------------------+ |  |
+-----------------------------------------------------+          +----------------------------------+
```

**Workflow:**
1. **Identify**: `SiteHandler` identifies the page structure based on the current domain (e.g., deepwiki.com) and locates the latest response content.
2. **Extract**: User clicks a floating panel button, and the Content Script extracts text or code from the target element.
3. **Transport**: The extension sends data to a local server running on the VS Code side via HTTP request (usually provided by a VS Code extension or a standalone server script).
4. **Execute**: VS Code receives the data and performs the corresponding editing and saving operations.

## 🚀 Installation & Usage

### Prerequisites
1. **Chrome Browser**
2. **VS Code**
3. **Local Server**: A local service listening on a specific port (default 3000 or other configured port) is required to receive requests from the extension.

### Install the Extension
1. Clone this project:
   ```bash
   git clone <repository-url>
   ```
2. Install dependencies and build:
   ```bash
   cd chrome-ext
   npm install
   npm run build
   ```
   - Select the `chrome-ext/dist` directory

## 🖌️ Interface & Interaction

### Floating Panel

The operation panel at the bottom-right of the page (see Image 1):

```plaintext
+-------------------------------------------------------+
|  ⚡ VS Code Bridge               [●] Disconnected [▾] [✕] |
+-------------------------------------------------------+
|  Filename preview...                                  |
+-------------------------------------------------------+
|  Code Actions                                         |
|  +-------------------------------------------------+  |
|  |  Copy & Save (Primary)                          |  |
|  +-------------------------------------------------+  |
|  +--------------+    +--------------+                 |
|  | Identify &   |    |   Partial    |                 |
|  | Create       |    |   Update     |                 |
|  +--------------+    +--------------+                 |
|                                                       |
|  Element Tools                                        |
|  [📷 Screenshot]  [📋 Copy Element]  [📄 Copy(+Sub)] |
|  [🖥️ Fullscreen]  [🔄 Clone Page]                    |
|                                                       |
|  AI Studio                                            |
|  [📥 Sync Files]  [📝 Export Chat]                    |
|                                                       |
|  Prompts                                       [▾]    |
|  [ Prompt 1 ]  [ Prompt 2 ] ...                      |
+-------------------------------------------------------+
```

### Settings Panel (Settings Popup)

Click the browser extension icon to open the settings page (see Image 2):

```plaintext
+-------------------------------------------------------+
|  ⚙️ AI to VSCode Bridge                               |
+-------------------------------------------------------+
|  WebSocket Port: [ 8765                 ]              |
|                                                       |
|  [x] Show floating panel on all websites              |
|                                                       |
|  Enabled Websites:                                    |
|  [ chat.openai.com             [Delete] ]             |
|  [ claude.ai                   [Delete] ]             |
|  [ ...                         [Delete] ]             |
|                                                       |
|  Site Selector Config (Advanced):                     |
|  [ 🪄 Smart Find Copy Button on Current Page ]       |
|                                                       |
|  AI Studio Prompt Management (System Instructions):   |
|  [ No file selected     ] [📁Select] [Add Prompt]    |
|                                                       |
|  📂 File Save Path:                                   |
|  [ docs/ai-responses                  ]               |
|                                                       |
|  📂 Path Memory Management:                           |
|  Current Project: VscodeProjects                      |
|  + Manually Add/Edit Memory                           |
|  | Filename (e.g.: SKILL.md)                          |
|  | Directory (e.g.: docs/project)                     |
|  | [ Add Memory ]                                     |
|  +----------------------------------------------------+
|  Remembered Paths:                     [ Clear All ]  |
|  [ src/utils.ts (src/core)       [✎] [×] ]           |
|                                                       |
|  [ 💾 Save ]  [ ↺ Reset ]  [📥Export] [📤Import]     |
+-------------------------------------------------------+
```

### Usage Workflow

```plaintext
1. AI generates content    2. Click floating panel     3. VS Code receives & processes
+------------------+    +-------------------+    +----------------------+
| AI Chat Interface|    | Floating Panel    |    | VS Code Editor       |
|                  |    |                   |    |                      |
| > Here is the    |    | +---------------+ |    | [File Created]       |
|   code:          |    | | [Copy & Save] | |    |                      |
|                  |    | +-------+-------+ |    |  def hello():        |
|  def hello():    |--->|         |         |--->|      print("Hi")     |
|      print("Hi") |    |         |         |    |                      |
|                  |    |         v         |    |                      |
|                  |    |   Extracts Text   |    |                      |
+------------------+    +-------------------+    +----------------------+
```

## 📖 Development Guide (OpenSpec)

This project uses the **OpenSpec** specification for change management and development workflows.

### Common Workflows

- **Start a new feature**:
  ```bash
  /opsx-new "add-feature-name"
  ```
- **Quick generate artifacts (Proposal -> Tasks)**:
  ```bash
  /opsx-ff "change-name"
  ```
- **Start implementation**:
  ```bash
  /opsx-apply "change-name"
  ```
- **Complete and archive**:
  ```bash
  /opsx-archive "change-name"
  ```

### Directory Structure

- `chrome-ext/`: Chrome extension source code (React/TypeScript)
- `vscode-ext/`: VS Code extension source code (TypeScript)

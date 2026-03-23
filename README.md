# my-ai-gen-demo

分享一些我遇到的小需求功能，使用ai实现代码

---

## 🚀 [VTable Excel Million-Level Data Filter](./excel-display.html)

**一个基于 Web Worker 和 VTable 构建的高性能百万级 Excel 数据实时筛选查看器。**

### 📖 简介

本项目是一个纯前端的 Excel 文件处理工具，专门针对**百万量级数据**进行了优化。它允许用户直接拖拽 Excel 文件，在浏览器本地进行极速的关键词筛选（支持复杂的逻辑表达式），并提供类似于 Excel 的流畅交互体验。

#### 核心亮点

- **百万级渲染**：利用 [VisActor VTable](https://visactor.io/vtable) 虚拟滚动技术，轻松应对百万行数据，不卡顿。
- **多线程筛选**：所有的字符串匹配与逻辑运算均在 **Web Worker** 中运行，主线程 UI 保持流畅响应。
- **高级逻辑筛选**：支持 `&` (与)、`|` (或) 以及 `()` (括号) 的组合逻辑搜索。
- **零服务器开销**：数据解析与处理完全在客户端完成，保护隐私且无需后端支持。
- **极致交互**：支持单元格多选、Ctrl+C 复制、右键直接复制到剪贴板。

### ✨ 主要功能

- **拖拽上传**：支持 `.xlsx`, `.xls`, `.csv` 格式。
- **高级搜索**：
- **包含模式**：如输入 `北京 & (科技 | 互联网)` 筛选特定行业。
- **排除模式**：过滤掉不需要的内容。
- **智能状态栏**：实时显示当前筛选出的记录条数与总数。
- **便捷复制**：
- 选中单元格后按 `Ctrl + C`。
- 右键点击选区直接一键复制，格式完美兼容 Excel。
- **自动列宽**：根据内容自动调整表头宽度。

### 🛠️ 技术栈

| 工具               | 用途                                         |
| ------------------ | -------------------------------------------- |
| **VTable**         | 高性能虚拟表格组件，负责渲染与交互           |
| **SheetJS (XLSX)** | Excel 文件解析                               |
| **Web Worker**     | 异步处理大数据集的搜索与预处理               |
| **Vanilla JS**     | 纯原生 JavaScript 驱动，无框架依赖，轻量快速 |

### 🚀 快速开始

1. **克隆或下载**本仓库。
2. 直接在浏览器中打开 `index.html`（建议使用现代 Chrome, Edge 或 Firefox）。
3. 将你的 Excel 文件拖入虚线框内。
4. 在顶部输入框开始你的检索。

### 💡 搜索语法示例

筛选器支持简单的逻辑运算符：

- `A & B`：同时包含 A 和 B。
- `A | B`：包含 A 或 B。
- `A & (B | C)`：包含 A，且同时包含 B 或 C 其中之一。
- **大小写不敏感**：自动将所有搜索转换为小写匹配。

---

# 🚀 [超大 JSON 可视化工具 (Vanilla JS + 虚拟列表)](./large-json-preview.html)

一个专为解析和可视化**超大 JSON 文件（几十MB甚至上百MB）**而设计的纯前端工具。

在日常开发或数据分析中，打开几十 MB 的 JSON 文件往往会导致编辑器（如 VS Code）卡顿，或者让常规的浏览器 JSON 插件直接崩溃。本项目利用**虚拟列表（Virtual Scroll）**和**按需加载**技术，彻底解决了 DOM 渲染瓶颈，无论 JSON 层级多深、数组多大，都能保持 60fps 的丝滑滚动体验。

## ✨ 核心特性

- ⚡️ **极致性能**：采用虚拟列表技术，无论 JSON 包含十万还是百万个节点，DOM 树中始终只渲染屏幕可见的约 40 个 DOM 节点，**绝对不卡顿**。
- 📦 **零依赖 & 单文件**：纯原生 JavaScript (Vanilla JS) 编写。没有 React/Vue，没有 npm，没有 Webpack。只有一个 `.html` 文件，开箱即用。
- 🧠 **按需展开**：不会一次性递归处理整个庞大的树结构。只有当你点击“展开”时，才会在内存中生成下一级的子节点。
- 🎨 **VS Code 风格高亮**：内置类似 VS Code Dark+ 主题的语法高亮，久看不累。
- 🔒 **纯本地处理**：数据完全在本地浏览器中通过 `FileReader` 和原生 `JSON.parse` 处理，不会上传到任何服务器，绝对安全隐私。

## 🛠️ 如何使用

1. 新建一个文本文件，将代码粘贴进去，并重命名为 `index.html`。
2. 双击 `index.html`，使用你喜欢的现代浏览器（Chrome / Edge / Firefox / Safari）打开它。
3. 点击页面左上角的 **“选择文件” (Choose File)** 按钮。
4. 选择你需要预览的 `.json` 文件。
5. 等待短暂的解析后，即可丝滑浏览庞大的数据！

## 🔬 技术内幕：为什么它不卡？

传统的 JSON 树形组件（比如 element-ui / antd 的 Tree 组件）在面对大对象或包含数万个元素的数组时会卡死，原因在于它们生成了海量的 DOM 元素，超出了浏览器的渲染极限。

本项目通过以下策略突破极限：

1. **扁平化结构**：将树形层级结构打平为一维数组（`visibleList`），通过计算缩进（`padding-left`）来模拟树的视觉效果。
2. **虚拟滚动 (Virtual Scroller)**：监听容器的 `scroll` 事件，动态计算当前可视区域，仅仅替换这几十个 DOM 元素的内容，并使用 `translateY` 和占位 `div` 撑开滚动条。
3. **原生拼接**：抛弃了任何响应式拦截（如 Vue 的 Proxy），使用最原始的字符串模板和 `innerHTML` 渲染，榨干 V8 引擎的每一滴性能。

## 📊 性能表现

| JSON 文件大小 | 解析时间 (估算) | 滚动帧率 | 内存占用 |
| :------------ | :-------------- | :------- | :------- |
| 5 MB          | < 0.1 秒        | 60 FPS   | 极低     |
| 50 MB         | 0.5 ~ 1 秒      | 60 FPS   | 低       |
| 100 MB        | 1 ~ 3 秒        | 60 FPS   | 中等     |

> **⚠️ 注意**：受限于浏览器 V8 引擎对于单字符串长度的硬性限制（通常在 500MB 左右），本工具的极限取决于浏览器的 `JSON.parse()` 能承受的最大内存。通常建议用于 **150MB 以下** 的 JSON 文件。

## 📝 待办与扩展 (TODO)

如果你有定制化需求，可以自行修改 HTML 文件，建议的扩展方向：

- [ ] 增加搜索节点功能（按 Key 或 Value 搜索）。
- [ ] 增加一键“折叠所有”或“展开当前层级”的按钮。
- [ ] 支持展示和解析 JSONL (JSON Lines) 格式日志文件。

---

# [🚀 Parquet 文件本地预览与搜索工具 (Parquet Viewer)](./parquet-preview.html)

一个轻量级、开箱即用的纯前端 `.parquet` 文件查看器。无需搭建复杂的后端服务，也无需将敏感数据上传到云端，直接在你的浏览器中极速解析、预览和检索 Parquet 文件。

## ✨ 核心特性

- 🔒 **数据绝对安全 (纯前端解析)**：基于 WebAssembly/原生 JS 实现，数据解析完全在你的本地浏览器中完成，**0 字节上传**，保障数据隐私。
- ⚡ **极速加载与预览**：默认提取并展示前 1000 行数据，即使是巨大的 Parquet 文件也能秒级响应，告别漫长的加载等待。
- 🔎 **强大的多关键词检索**：支持对加载的数据进行全文实时检索。支持使用 `|` 分隔多个关键词（例如输入 `success|完成` 即可匹配包含任意一个词的行）。
- 📏 **整洁的表格排版**：智能限制列宽（最大 200px），超长文本自动使用省略号截断，并支持横向滚动，确保表格无论多少列都能保持整洁美观。
- 📄 **沉浸式详情弹窗**：点击表格中的任意一行，即可打开宽敞的详情弹窗。以“键值对”表单的形式完整展示该行的所有数据，长文本和嵌套 JSON 自动格式化换行，阅读体验极佳。

## 🛠️ 如何使用 (零配置)

本项目没有任何复杂的构建步骤或依赖安装过程，真正做到**开箱即用**：

1.  **下载/保存文件**：将本项目中的 HTML 代码保存为一个本地文件，例如 `index.html`。
2.  **浏览器打开**：双击该 `index.html` 文件，使用任何现代浏览器（Chrome、Edge、Firefox、Safari 等）打开它。
3.  **选择文件**：点击页面左上角的上传按钮，选择你本地的 `.parquet` 文件。
4.  **开始探索**：
    - 在下方的输入框中输入关键词进行搜索。
    - 浏览表格，将鼠标悬停在截断的单元格上查看简略提示。
    - **点击任意感兴趣的行**，在弹窗中查看完整且格式化的详细数据！

## 💻 技术栈与依赖

本项目采用原生 HTML / CSS / Vanilla JavaScript 构建，并依赖以下优秀的开源 ESM 模块（通过 CDN 动态引入）：

- **[hyparquet](https://github.com/hyparam/hyparquet)**: 核心解析库，用于在浏览器中高效读取 Parquet 文件对象。
- **hyparquet-compressors**: 用于支持 Parquet 文件中常见的压缩格式（如 Snappy, Gzip 等）的解压。

## ⚙️ 高级自定义 (面向开发者)

如果你懂一点点前端知识，可以通过修改 `index.html` 中的几行代码来定制你的专属工具：

- **调整默认读取行数**：
  找到代码中的 `const PREVIEW_ROWS = 1000;`，将 `1000` 修改为你期望的数字。
- **调整表格列宽截断限制**：
  找到 CSS 中的 `max-width: 200px;`（在 `th, td` 选择器下），修改像素值即可调整列宽。
- **调整弹窗宽度**：
  找到 CSS 中的 `.modal-content { width: 80vw; }`，修改 `80vw` 为你觉得合适的视口比例或固定像素。

---

# Qwen3.5 WebGPU Local Chat

![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-007bff?style=for-the-badge&logo=WebGL)
![Transformers.js](https://img.shields.io/badge/Transformers.js-v4.0.0--next.8-ff9d00?style=for-the-badge&logo=huggingface)
![HTML5](https://img.shields.io/badge/HTML5-Single_File-E34F26?style=for-the-badge&logo=html5)
![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=for-the-badge&logo=javascript)

一个**开箱即用、单文件驱动**的纯前端大语言模型聊天应用。基于 [Transformers.js](https://huggingface.co/docs/transformers.js) 和 WebGPU 技术，让你无需任何后端服务器，即可在浏览器中直接本地运行 Qwen3.5 视觉语言大模型（VLM）！

> **核心优势**: 数据零泄漏（完全在本地推理）、支持多模态（图文对话）、丝滑的流式输出、持久化本地对话记录。

## 核心特性

- **纯浏览器推理**: 借助 WebGPU 释放 GPU 算力，在网页端直接运行量化版 ONNX 大模型。
- **多模态对话**: 原生支持图片上传，你可以发送图片并让 Qwen 分析图片内容（Image Captioning / VQA）。
- **本地历史记忆**: 使用 `IndexedDB` 将聊天记录和图片安全地保存在本地浏览器中，刷新不丢失。
- **极简部署 (Zero Backend)**: 整个项目**只有一个 HTML 文件**，无需 Node.js、Python 或任何数据库。
- **可视化加载进度**: 优雅的弹窗进度条，实时展示分片模型权重的下载与加载状态。
- **流式输出体验**: 类似 ChatGPT 的打字机效果，快速响应，拒绝漫长等待。

## 支持的模型

预置了三个由 HuggingFace 社区提供的 Qwen3.5 ONNX 量化模型（支持文本与视觉）：

1. `huggingworld/Qwen3.5-0.8B-ONNX` (默认，速度最快，适合显存较低的设备)
2. `huggingworld/Qwen3.5-2B-ONNX` (性能与速度的良好平衡)
3. `huggingworld/Qwen3.5-4B-ONNX` (更强的理解与推理能力，需较大显存)

## 快速开始

由于浏览器对本地文件（`file://` 协议）的安全限制（CORS / Web Worker），您需要通过一个简单的本地 HTTP 服务器来运行此单文件应用。

### 方法一：使用 Python (推荐)

1. 确保已安装 Python 环境。
2. 将代码保存为 `index.html`。
3. 在该文件所在目录打开终端，运行：
   ```bash
   python -m http.server 8000
   ```
4. 浏览器访问 `http://localhost:8000`。

### 方法二：使用 VS Code Live Server

1. 在 VS Code 中打开 `index.html`。
2. 安装并点击右下角的 **Go Live**（Live Server 插件）。
3. 浏览器会自动弹开并运行。

### 方法三：使用 Node.js

```bash
npx serve .
```

## 系统要求与兼容性

为获得最佳体验，请确保您的设备和浏览器满足以下要求：

- **浏览器**: 最新版的 Google Chrome、Microsoft Edge 或其他基于 Chromium 的浏览器。
- **WebGPU 支持**: 必须开启 WebGPU。大多数新版浏览器已默认开启。
  - _如果在旧版本中无法运行，请在浏览器地址栏输入 `chrome://flags/`，搜索 `WebGPU` 并设置为 `Enabled`。_
- **硬件**: 建议配备独立显卡或性能较好的核心显卡（如 Apple M系列芯片）。首次加载模型需要下载一定的权重文件（几百MB至几GB不等），建议在 Wi-Fi 环境下使用。

## 技术栈说明

- **前端 UI**: 原生 HTML / CSS (CSS Variables, Flexbox)。
- **交互逻辑**: 原生 JavaScript (ES6 Modules, Async/Await)。
- **本地存储**: IndexedDB API (用于存储长文本与本地图片 Blob，防止转 Base64 导致的内存溢出)。
- **AI 引擎**:[@huggingface/transformers (v4.0.0-next.8)](https://unpkg.com/browse/@huggingface/transformers@4.0.0-next.8/)，通过 CDN importmap 直接引入。

## 注意事项

1. **首次加载较慢**: 首次切换或加载模型时，浏览器会从 HuggingFace 的 CDN 下载数十上百 MB 的权重文件。下载完成后，浏览器会利用 Cache API 进行本地缓存，后续加载将实现“秒开”。
2. **内存限制**: WebGPU 会占用一定的系统显存/内存，如果加载 4B 模型时浏览器崩溃，请尝试切换回 0.8B 模型。

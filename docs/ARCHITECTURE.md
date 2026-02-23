# Scientify 插件架构详解

## 🔌 插件注册机制

### 1. OpenClaw 插件系统概览

```
OpenClaw Plugin System
├── Plugin Discovery (插件发现)
├── Plugin Loading (插件加载)
├── Plugin API (插件 API)
└── Hot Reload (热重载)
```

### 2. 插件注册流程

#### 步骤 1: 配置文件注册

**文件**: `~/.openclaw/openclaw.json`

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/Users/springleaf/study/collaborator/scientify"
      ]
    },
    "entries": {
      "scientify": {
        "enabled": true
      }
    },
    "installs": {
      "scientify": {
        "source": "path",
        "sourcePath": "/Users/springleaf/study/collaborator/scientify",
        "installPath": "/Users/springleaf/study/collaborator/scientify",
        "version": "1.7.2",
        "installedAt": "2026-02-22T15:19:19.253Z"
      }
    }
  }
}
```

**关键字段：**
- `plugins.load.paths` - 告诉 OpenClaw 从哪里加载插件
- `plugins.entries.scientify.enabled` - 插件是否启用
- `plugins.installs.scientify` - 插件安装信息（路径、版本等）

#### 步骤 2: 插件元数据定义

**文件**: `openclaw.plugin.json`

```json
{
  "id": "scientify",
  "name": "Scientify",
  "description": "AI-powered research workflow automation for OpenClaw",
  "configSchema": {
    "type": "object",
    "properties": {
      "autoUpdate": {
        "type": "boolean",
        "default": true
      }
    }
  },
  "skills": [
    "skills/idea-generation",
    "skills/research-pipeline",
    ...
  ]
}
```

**作用：**
- 定义插件 ID 和名称
- 声明配置选项（schema）
- 列出插件提供的 Skills

#### 步骤 3: 插件入口点

**文件**: `dist/index.js` (编译自 `src/index.ts`)

```javascript
export default function register(api) {
    // 1. 注册工具 (Tools)
    api.registerTool(createArxivSearchTool());
    api.registerTool(createArxivDownloadTool());
    api.registerTool(createGithubSearchTool());
    api.registerTool(createPaperBrowserTool());
    api.registerTool(createOpenAlexSearchTool());
    api.registerTool(createUnpaywallDownloadTool());

    // 2. 注册服务 (Services)
    api.registerService(createAutoUpdaterService({...}));

    // 3. 注册命令 (Commands)
    api.registerCommand({
        name: "research-status",
        description: "Show research workspace status",
        handler: handleResearchStatus,
    });

    // 4. 注册钩子 (Hooks)
    api.on("before_tool_call", createSkillInjectionHook(...));
    api.on("before_prompt_build", createResearchModeHook());

    api.logger.info("Scientify plugin loaded");
}
```

**OpenClaw Plugin API 提供的方法：**

| 方法 | 用途 | 示例 |
|------|------|------|
| `api.registerTool()` | 注册 LLM 工具 | ArxivSearch, PaperBrowser |
| `api.registerCommand()` | 注册用户命令 | /research-status, /papers |
| `api.registerService()` | 注册后台服务 | AutoUpdater |
| `api.on()` | 注册事件钩子 | before_tool_call, before_prompt_build |
| `api.logger` | 日志记录 | info, warn, debug |
| `api.pluginConfig` | 读取插件配置 | autoUpdate 开关 |
| `api.source` | 插件源码路径 | 定位 skills/ 目录 |

#### 步骤 4: OpenClaw 加载插件

**加载时机：**
1. **Gateway 启动时** - 扫描 `plugins.load.paths`
2. **检测到变化时** - 文件系统监听 (热重载)

**加载流程：**
```javascript
// 伪代码 - OpenClaw 内部实现
async function loadPlugin(pluginPath) {
  // 1. 读取 openclaw.plugin.json
  const metadata = readJSON(`${pluginPath}/openclaw.plugin.json`);

  // 2. 动态导入插件入口
  const module = await import(`${pluginPath}/dist/index.js`);

  // 3. 调用 register() 函数
  const api = createPluginAPI(metadata);
  module.default(api);

  // 4. 收集注册的 tools/commands/services/hooks
  return {
    id: metadata.id,
    tools: api.tools,
    commands: api.commands,
    services: api.services,
    hooks: api.hooks,
  };
}
```

---

## 🔥 热重载机制

### 1. 文件监听 (File Watching)

#### TypeScript Watch Mode

**命令**: `tsc --watch`

**配置**: `tsconfig.json`
```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "watch": true
  }
}
```

**工作流程：**
```
1. tsc 启动，编译 src/ → dist/
2. tsc 监听 src/ 目录文件变化
3. 检测到修改 (如 arxiv-search.ts 被编辑)
4. 自动增量编译修改的文件
5. 输出到 dist/ 目录
```

**日志输出：**
```
[10:23:45 AM] File change detected. Starting incremental compilation...
[10:23:46 AM] Found 0 errors. Watching for file changes.
```

#### package.json 配置

```json
{
  "scripts": {
    "dev": "tsc --watch",              // 基础热重载
    "dev:reload": "nodemon --watch src --watch skills --ext ts,md,json --exec \"npm run build && pkill -USR1 -f 'openclaw.mjs gateway' || true\" --delay 500ms"  // 高级热重载
  }
}
```

**`dev` vs `dev:reload`：**
- `dev` - 只编译，不重启 Gateway
- `dev:reload` - 编译 + 发送信号给 Gateway 重载

### 2. OpenClaw Gateway 热重载

#### 方式 A: 文件系统监听（默认）

**OpenClaw 内部实现（伪代码）：**
```javascript
// Gateway 启动时
const watcher = chokidar.watch(
  pluginPaths.map(p => `${p}/dist/**/*.js`),
  { ignoreInitial: true }
);

watcher.on('change', async (filePath) => {
  const pluginId = detectPluginFromPath(filePath);

  // 1. 清除 Node.js 模块缓存
  delete require.cache[require.resolve(filePath)];

  // 2. 卸载旧插件
  await unloadPlugin(pluginId);

  // 3. 重新加载插件
  await loadPlugin(pluginId);

  logger.info(`Plugin ${pluginId} hot reloaded`);
});
```

**关键技术：**
- **chokidar** - 文件监听库
- **Module cache clearing** - 清除 Node.js 缓存
- **Dynamic import** - 动态重新导入模块

#### 方式 B: 信号触发（高级）

**发送信号重载：**
```bash
pkill -USR1 -f openclaw-gateway
```

**Gateway 信号处理：**
```javascript
process.on('SIGUSR1', async () => {
  logger.info('Received reload signal, reloading plugins...');
  await reloadAllPlugins();
});
```

### 3. 热重载完整流程

```
开发者修改代码 (src/tools/arxiv-search.ts)
        ↓
TypeScript Watch 检测变化
        ↓
增量编译 → dist/tools/arxiv-search.js
        ↓
Gateway 的 chokidar 检测 dist/ 变化
        ↓
清除 Node.js require 缓存
        ↓
卸载旧版本插件
  - 移除已注册的 tools
  - 移除已注册的 commands
  - 移除已注册的 hooks
        ↓
重新 import dist/index.js
        ↓
调用 register(api) 重新注册
        ↓
新版本插件加载完成 ✅
        ↓
正在进行的 Agent 会话使用新工具
```

### 4. 热重载的限制

**可以热重载：**
- ✅ 工具 (Tools) 实现修改
- ✅ 命令 (Commands) 逻辑修改
- ✅ 钩子 (Hooks) 行为修改
- ✅ 新增/删除工具

**不能热重载（需要重启 Gateway）：**
- ❌ `openclaw.plugin.json` 元数据修改
- ❌ Skills 文件路径修改
- ❌ 插件 ID 修改
- ❌ 某些深度缓存的配置

**解决方案：**
```bash
# 完全重启
make restart

# 或手动
make stop
make start
```

---

## 🔍 调试热重载

### 查看热重载日志

**Gateway 日志：**
```bash
# 方式 1: Gateway 前台运行（推荐调试）
openclaw gateway --verbose

# 输出示例：
# [plugins] Watching /Users/.../scientify/dist for changes
# [plugins] File change detected: dist/tools/arxiv-search.js
# [plugins] Reloading plugin: scientify
# [plugins] Scientify plugin loaded (research mode: always active)
```

**TypeScript 编译日志：**
```bash
cd scientify
pnpm dev

# 输出示例：
# [10:23:45 AM] File change detected. Starting incremental compilation...
# [10:23:46 AM] Found 0 errors. Watching for file changes.
```

### 验证热重载成功

```bash
# 1. 修改代码（添加 console.log）
echo 'console.log("Hot reload test");' >> src/tools/arxiv-search.ts

# 2. 等待 tsc 编译（约 1-2 秒）

# 3. 测试工具
openclaw agent --local --message "Search arXiv for 'test'" --session-id debug

# 4. 查看是否输出 "Hot reload test"
```

---

## 📋 插件注册和热重载总结

### 插件注册（一次性）

```bash
# 链接插件到 OpenClaw
openclaw plugins install --link /path/to/scientify

# 写入配置到 ~/.openclaw/openclaw.json
# 插件会在 Gateway 启动时自动加载
```

### 热重载（开发时）

```bash
# 启动 TypeScript Watch
cd scientify && pnpm dev

# 修改代码 → 自动编译 → Gateway 自动重载 ✅
```

### 架构图

```
┌─────────────────────────────────────────────────┐
│          OpenClaw Gateway Process               │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  Plugin Manager                           │ │
│  │  ┌─────────────────────────────────────┐ │ │
│  │  │  scientify Plugin                   │ │ │
│  │  │  - Tools: ArxivSearch, ...          │ │ │
│  │  │  - Commands: /research-status       │ │ │
│  │  │  - Services: AutoUpdater            │ │ │
│  │  │  - Hooks: before_tool_call          │ │ │
│  │  └─────────────────────────────────────┘ │ │
│  │                   ↑                       │ │
│  │                   │ Hot Reload            │ │
│  │                   │                       │ │
│  │  ┌─────────────────────────────────────┐ │ │
│  │  │  File Watcher (chokidar)            │ │ │
│  │  │  Watching: dist/**/*.js             │ │ │
│  │  └─────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
                      ↑
                      │ File Change Event
                      │
┌─────────────────────────────────────────────────┐
│  TypeScript Compiler (tsc --watch)              │
│  Watching: src/**/*.ts                          │
│  Output: dist/**/*.js                           │
└─────────────────────────────────────────────────┘
                      ↑
                      │ Code Edit
                      │
┌─────────────────────────────────────────────────┐
│  Developer                                      │
│  Editing: src/tools/arxiv-search.ts             │
└─────────────────────────────────────────────────┘
```

---

## 🛠️ 实际示例

### 添加一个新工具并热重载

```bash
# 1. 创建新工具
cat > src/tools/semantic-scholar.ts << 'EOF'
export function createSemanticScholarTool() {
  return {
    name: "semantic_scholar_search",
    description: "Search Semantic Scholar for papers",
    parameters: {...},
    execute: async (toolCallId, args) => {
      console.log("Semantic Scholar tool called!");
      return { results: [...] };
    }
  };
}
EOF

# 2. 在 index.ts 中注册
# (手动编辑 src/index.ts，或稍后演示)

# 3. 观察 tsc 自动编译
# 终端输出: [10:25:00 AM] File change detected...

# 4. Gateway 自动重载
# Gateway 日志: [plugins] Reloading plugin: scientify

# 5. 测试新工具
openclaw agent --local --message "Search Semantic Scholar" --session-id test
# 应该看到: "Semantic Scholar tool called!"
```

这就是 OpenClaw 插件注册和热重载的完整实现机制！🎉

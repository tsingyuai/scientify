# Scientify 插件调试完整指南

## 🎯 调试架构

### 解耦设计

```
┌────────────────────────────────────────┐
│  System Level (独立运行)               │
│  ┌──────────────────────────────────┐  │
│  │  OpenClaw Gateway                │  │
│  │  - 端口: 18789                   │  │
│  │  - 日志: /tmp/openclaw/*.log     │  │
│  │  - 管理: systemd/launchd/手动    │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
              ↑ WebSocket/HTTP
              │
┌────────────────────────────────────────┐
│  Plugin Development (独立开发)          │
│  ┌──────────────────────────────────┐  │
│  │  scientify/                      │  │
│  │  - make dev (热重载)             │  │
│  │  - src/ → dist/ (自动编译)       │  │
│  │  - Gateway 自动检测变化          │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**关键原则：**
- ✅ Gateway 作为系统服务，独立运行
- ✅ 插件开发只关注代码和热重载
- ✅ 两者通过 OpenClaw Plugin API 通信

---

## 🚀 启动方式对比

### 方式 1: 解耦启动（推荐生产/团队）⭐

```bash
# 一次性：启动系统级 Gateway
openclaw gateway &
# 或安装为系统服务
openclaw gateway install

# 每次开发
cd scientify
make dev
```

**优势：**
- ✅ Gateway 始终运行（像 nginx/postgres）
- ✅ 多个插件可以同时开发
- ✅ 团队成员共享 Gateway
- ✅ 资源占用低

**适用场景：**
- 日常开发
- 团队协作
- 生产环境

### 方式 2: 一体化启动（快速测试）

```bash
cd scientify
make quickstart
```

**流程：**
1. 检测 Gateway 是否运行
2. 如果没有，自动启动后台 Gateway
3. 启动插件热重载

**适用场景：**
- 新手入门
- 快速演示
- 临时测试

### 方式 3: 调试模式（深度调试）

```bash
cd scientify
make debug
```

**启动：**
- Gateway 前台运行（详细日志）
- 插件热重载

**适用场景：**
- 调试 Plugin API 问题
- 调试工具注册
- 查看实时日志

---

## 🐛 调试流程

### 场景 1: 调试工具执行逻辑

**目标：** 修改 ArxivSearch 工具，查看日志输出

```bash
# 终端 1: 启动 Gateway（前台，实时日志）
make gateway

# 终端 2: 启动热重载
make dev

# 终端 3: 修改代码
vi src/tools/arxiv-search.ts

# 在 execute 函数开头添加：
console.log("🔍 ArxivSearch called with args:", args);
console.log("🔍 Session ID:", toolCallId);

# 保存后观察终端 2（自动编译）
# [10:45:00 AM] File change detected...
# [10:45:01 AM] Found 0 errors.

# 终端 4: 测试工具
make test-tool TOOL=arxiv_search

# 观察终端 1（Gateway 日志）
# 应该看到：
# 🔍 ArxivSearch called with args: {...}
# 🔍 Session ID: tool_abc123
```

**调试技巧：**
```typescript
// 1. 简单日志
console.log("Debug:", variable);

// 2. 带时间戳
console.log(`[${new Date().toISOString()}]`, "Debug:", variable);

// 3. 美化对象
console.log("Args:", JSON.stringify(args, null, 2));

// 4. 错误堆栈
console.error("Error:", error.stack);
```

---

### 场景 2: 调试插件注册

**目标：** 检查插件是否正确注册工具

```bash
# 1. 启动 Gateway（前台）
make gateway

# 观察启动日志：
# [plugins] Loading plugin: scientify
# [plugins] Scientify plugin loaded (research mode: always active)

# 2. 检查注册的工具
openclaw plugins list | grep scientify

# 应该看到：
# │ Scientify    │ scientif │ loaded   │ ~/study/collaborator/scientify/dist/index.js

# 3. 修改注册逻辑（添加日志）
vi dist/index.js  # 或源文件 src/index.ts

# 在 register() 函数中添加：
api.logger.info("Registering ArxivSearch tool...");
api.registerTool(createArxivSearchTool());
api.logger.info("ArxivSearch registered successfully");

# 4. 重载插件
make reload

# 观察 Gateway 日志：
# [plugins] Reloading plugin: scientify
# [plugins] Registering ArxivSearch tool...
# [plugins] ArxivSearch registered successfully
```

---

### 场景 3: 调试热重载失败

**症状：** 修改代码后没有生效

```bash
# 诊断清单

# 1. 检查 tsc --watch 是否运行
ps aux | grep "tsc --watch"
# 如果没有运行，启动 make dev

# 2. 检查是否有编译错误
# 观察热重载终端输出
# [10:50:00 AM] Found 3 errors. Watching for file changes.
# 修复错误后自动重新编译

# 3. 检查 dist/ 是否更新
ls -la dist/tools/arxiv-search.js
# 查看修改时间是否是最新的

# 4. 检查 Gateway 是否检测到变化
# 查看 Gateway 日志
make logs
# 应该看到：
# [plugins] File changed: dist/tools/arxiv-search.js
# [plugins] Reloading plugin: scientify

# 5. 强制重载
make reload

# 6. 完全重启（最后手段）
make gateway-stop
make clean
make build
make gateway-bg
make dev
```

---

### 场景 4: 调试工具参数验证

**目标：** 检查工具参数是否正确传递

```typescript
// src/tools/arxiv-search.ts

export function createArxivSearchTool() {
  return {
    name: "arxiv_search",
    parameters: ArxivSearchToolSchema,
    execute: async (toolCallId: string, rawArgs: unknown) => {
      // 1. 日志原始参数
      console.log("📥 Raw args received:", rawArgs);

      // 2. 类型转换
      const params = rawArgs as Record<string, unknown>;
      console.log("📋 Parsed params:", params);

      // 3. 验证必需字段
      if (!params.query) {
        console.error("❌ Missing required field: query");
        return Result.err("invalid_input", "query is required");
      }

      // 4. 日志处理后的参数
      const query = String(params.query);
      const maxResults = Number(params.max_results ?? 10);
      console.log(`🔍 Searching arXiv: "${query}", max=${maxResults}`);

      // ... 执行搜索
    }
  };
}
```

**测试：**
```bash
# 测试正常参数
openclaw agent --local \
  --message "Search arXiv for 'quantum computing'" \
  --session-id debug

# 测试缺失参数（应该看到错误日志）
openclaw agent --local \
  --message "Search arXiv without query" \
  --session-id debug
```

---

### 场景 5: 调试异步操作和错误处理

```typescript
export function createArxivSearchTool() {
  return {
    execute: async (toolCallId: string, rawArgs: unknown) => {
      const startTime = Date.now();
      console.log(`⏱️  [${toolCallId}] ArxivSearch started`);

      try {
        // 搜索 arXiv
        const response = await fetch(apiUrl);
        console.log(`📡 [${toolCallId}] API response:`, response.status);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.text();
        console.log(`📦 [${toolCallId}] Data length:`, data.length);

        // 解析 XML
        const papers = parseArxivXML(data);
        console.log(`📚 [${toolCallId}] Found ${papers.length} papers`);

        const duration = Date.now() - startTime;
        console.log(`✅ [${toolCallId}] Completed in ${duration}ms`);

        return Result.ok({ papers });

      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [${toolCallId}] Failed after ${duration}ms:`, error);

        return Result.err(
          "api_error",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  };
}
```

---

## 📋 调试检查清单

### 插件加载问题

- [ ] 插件是否已链接：`make status`
- [ ] Gateway 是否运行：`make gateway-check`
- [ ] 插件路径是否正确：`cat ~/.openclaw/openclaw.json | jq '.plugins.load.paths'`
- [ ] dist/ 目录是否存在：`ls -la dist/`
- [ ] index.js 是否存在：`ls -la dist/index.js`

### 热重载问题

- [ ] tsc --watch 是否运行：`ps aux | grep "tsc --watch"`
- [ ] 是否有编译错误：查看 `make dev` 输出
- [ ] dist/ 是否更新：`ls -la dist/tools/*.js`
- [ ] Gateway 是否检测变化：查看 Gateway 日志

### 工具执行问题

- [ ] 工具是否注册：查看 Gateway 启动日志
- [ ] 参数 schema 是否正确：检查 TypeBox 定义
- [ ] execute 函数是否有错误：添加 try-catch
- [ ] 返回值格式是否正确：使用 `Result.ok()` / `Result.err()`

---

## 🛠️ 调试工具使用

### 1. 查看实时日志

```bash
make logs
```

**输出示例：**
```
[10:55:00] [plugins] Scientify plugin loaded
[10:55:15] [tools] ArxivSearch called with args: {...}
[10:55:16] [tools] API response: 200
[10:55:17] [tools] Found 10 papers
```

### 2. 测试单个工具

```bash
make test-tool TOOL=arxiv_search
```

### 3. 重载插件

```bash
make reload
```

### 4. 检查 Gateway 状态

```bash
make gateway-status
```

### 5. 查看插件状态

```bash
make status
```

---

## 📊 常见问题排查

### 问题 1: "Plugin not loaded"

**诊断：**
```bash
# 1. 检查链接
make status

# 2. 检查配置
cat ~/.openclaw/openclaw.json | jq '.plugins.load.paths'

# 3. 重新链接
make link

# 4. 重启 Gateway
make gateway-stop
make gateway-bg
```

### 问题 2: "Tool not found"

**诊断：**
```bash
# 1. 检查工具是否注册
# 查看 dist/index.js 或 Gateway 日志

# 2. 检查工具名称
# TypeScript: name: "arxiv_search"
# 调用: "Use arxiv_search tool"

# 3. 重新构建
make build
make reload
```

### 问题 3: "Hot reload not working"

**诊断：**
```bash
# 1. 重启 tsc --watch
# Ctrl+C 停止 make dev
make dev

# 2. 清理重建
make clean
make build
make dev

# 3. 检查文件权限
ls -la dist/
```

---

## 🎓 最佳调试实践

### 1. 结构化日志

```typescript
const logger = {
  debug: (msg: string, data?: any) =>
    console.log(`[DEBUG ${new Date().toISOString()}]`, msg, data),
  info: (msg: string, data?: any) =>
    console.log(`[INFO ${new Date().toISOString()}]`, msg, data),
  error: (msg: string, data?: any) =>
    console.error(`[ERROR ${new Date().toISOString()}]`, msg, data),
};

logger.info("ArxivSearch started", { query, maxResults });
```

### 2. 使用 API logger

```typescript
export default function register(api) {
  api.logger.info("Registering tools...");
  api.registerTool(createArxivSearchTool());
  api.logger.info("Tools registered successfully");
}
```

### 3. 错误边界

```typescript
execute: async (toolCallId, rawArgs) => {
  try {
    // 业务逻辑
    return Result.ok(data);
  } catch (error) {
    api.logger.error("Tool execution failed:", error);
    return Result.err("execution_error", error.message);
  }
}
```

### 4. 分阶段调试

```typescript
// 阶段 1: 验证参数
console.log("Phase 1: Validating args");

// 阶段 2: 调用 API
console.log("Phase 2: Calling API");

// 阶段 3: 解析响应
console.log("Phase 3: Parsing response");

// 阶段 4: 返回结果
console.log("Phase 4: Returning result");
```

---

## 🎉 调试工作流总结

```
┌─────────────────────────────────────────┐
│  1. 启动 Gateway（独立）                 │
│     openclaw gateway &                  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  2. 启动热重载                          │
│     make dev                            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  3. 修改代码（添加日志）                │
│     vi src/tools/arxiv-search.ts        │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  4. 自动编译 → Gateway 自动重载 ✅       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  5. 测试工具                            │
│     make test-tool TOOL=arxiv_search    │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  6. 查看日志输出                        │
│     观察 Gateway 日志或 make logs        │
└─────────────────────────────────────────┘
```

整个过程 **2-5 秒**，无需重启！🚀

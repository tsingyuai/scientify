# CKM (Continuous Knowledge Metabolism) — Product Architecture

> 将论文中的 CKM 理论变成 Scientify 插件中可分发的功能

## 设计原则

1. **一个课题 = 一个 OpenClaw Agent**：通过 `openclaw agents add` 创建，拥有独立 workspace、SOUL.md、AGENTS.md
2. **任务隔离 = Session 类型 + 目录分区**：metabolism 用 cron session，survey/experiment 用 spawn session，人机交互用 main session
3. **AGENTS.md 轻量化，任务逻辑在 Skill 中**：AGENTS.md 只放项目通用信息；具体任务流程（metabolism 四步循环、survey 流程等）放在 workspace 下的 skill 文件中
4. **Agent 自主，只推结果**：metabolism 不向人类提问，只在假设涌现时通过 `sessions_send` 推送到 main session
5. **文件系统即知识状态**：K(t) = `metabolism/knowledge/` 目录下的 md 文件，可审计可回溯

---

## 1. 用户流程

### 1.1 项目初始化

分三步完成，各司其职：

**Step 1: CLI 创建骨架**

```bash
openclaw research init mech-interp
```

CLI 只做最小化的文件系统操作（通过 `api.registerCli()` 注册，运行在 Gateway 进程中）：

1. 创建 agent workspace 目录：`~/.openclaw/workspace-research-{id}/`
2. 写入 bootstrap 文件：BOOTSTRAP.md（引导脚本）、SOUL.md（待填充骨架）、AGENTS.md（固定模板）
3. 创建空目录结构：`metabolism/`、`skills/`、`papers/` 等
4. 将 metabolism skill 从插件 bundled 复制到 workspace（`skills/metabolism/SKILL.md`）
5. 修改 `~/.openclaw/openclaw.json`：添加 agent 到 `agents.list`，注册 cron job
6. 输出提示：重启 Gateway → 在网页 Gateway 配置飞书 channel binding → 在飞书群组与 agent 对话完成配置

**Step 2: 网页 Gateway 配置飞书 binding**

用户在 Gateway 网页 UI 中将飞书群组绑定到该项目 agent。这是标准的 OpenClaw 操作，不需要插件额外实现。

**Step 3: 对话式配置（飞书群组）**

用户在绑定好的飞书群组中与项目 agent 首次对话。Agent 读取 BOOTSTRAP.md（仅全新 workspace 时注入），按引导脚本完成研究方向配置：

```
Agent: 你好！我是你的研究 agent。请告诉我你的研究方向。
用户: 我研究 mechanistic interpretability，关注 sparse autoencoders 和 polysemantic neurons
Agent: 了解。我将设定以下核心域关键词：
       - mechanistic interpretability
       - sparse autoencoder
       - polysemantic neurons
       arXiv 分类建议：cs.LG, cs.AI
       监测带建议：q-bio.NC, cs.CL, stat.ML
       是否需要调整？
用户: 加上 cs.NE
Agent: 已更新。配置已写入 metabolism/config.json，SOUL.md 已更新。
       明天 6:00 AM 开始首次知识代谢。你也可以说"现在开始"立即执行 Day 0。
用户: 现在开始
Agent: 正在执行 Day 0 — 构建初始知识状态 K(T0)...
```

### 1.2 CLI 命令体系

```bash
openclaw research init <id>       # 创建项目 agent + workspace 骨架
openclaw research list             # 列出所有研究项目及状态
openclaw research status <id>      # 查看项目代谢状态
openclaw research delete <id>      # 清理项目 agent + workspace
```

### 1.3 日常交互（飞书群组 Chat Command）

用户在对应项目的飞书群组中使用 chat command：

```
/metabolism-status          → 查看知识状态摘要、最近 diff、假设列表
/metabolism-hypotheses      → 查看所有涌现的假设
/metabolism-pause           → 暂停心跳
/metabolism-resume          → 恢复心跳
```

### 1.4 系统自动推送

系统通过 `sessions_send` 推送到项目 agent 的 main session（即飞书群组）：

```
[Scientify Metabolism] 新假设涌现
课题: mech-interp
假设: 将 sparse coding 原理应用于 polysemantic neuron 识别...
触发: Day 3 BRIDGE 信号 + Day 1 GAP 积累
详情: /metabolism-hypotheses
```

---

## 2. 隔离模型

### 2.1 课题隔离：Agent = Project

每个研究课题对应一个 OpenClaw agent，通过 `openclaw research init` 创建：

| 维度 | 隔离方式 |
|---|---|
| 文件系统 | Agent workspace = `~/.openclaw/workspace-research-{id}/` |
| 身份 | SOUL.md = 课题方向 + 行为边界 |
| 上下文 | AGENTS.md = workspace 布局 + 通用规则 |
| 配置 | USER.md = 人类偏好（可选） |
| 人机交互 | 飞书群组 = binding 绑定到该 agent |

### 2.2 任务隔离：Session Type + 目录分区

同一个 agent 下，不同任务类型通过 session 类型和目录分区隔离：

| 任务 | Session 类型 | 触发方式 | 工作目录 |
|---|---|---|---|
| 每日新陈代谢 | isolated cron session | cron job 定时触发 | `metabolism/` |
| 文献调研 | spawn session | main agent 调度 | `survey/` |
| 深度实验 | spawn session | main agent 调度 | `experiments/` |
| 人机交互 | main session | 用户直接对话 | 全局 |

### 2.3 为什么不用多 agent？

曾考虑为同一课题的不同任务（metabolism、survey、experiment）分别创建 agent。放弃原因：

1. **文件系统共享问题**：多 agent 各自有独立 workspace，无法共享课题目录下的论文和知识
2. **协调复杂度**：agent 间通信需要额外机制
3. **资源浪费**：每个 agent 都需要独立 bootstrap 文件

正确模型：**一个 agent 管一个课题的全部工作，通过 session 类型分流不同任务**。

### 2.3 人机交互隔离：一个项目 = 一个飞书群组

用户远离主机，通过飞书与 agent 交互。每个项目 agent 绑定一个专属飞书群组（通过网页 Gateway UI 配置 binding）：

```json5
// openclaw.json bindings（用户在网页 Gateway 中配置）
{
  bindings: [
    { agentId: "research-mech-interp", match: { channel: "feishu", peer: { kind: "group", id: "og_xxx" } } },
    { agentId: "research-quantum-ec",  match: { channel: "feishu", peer: { kind: "group", id: "og_yyy" } } }
  ]
}
```

**为什么一个群组一个 agent，而不是在一个群组内切换？**

OpenClaw 的 binding 机制按 peer ID 确定性路由到 agent。同一个群组只能绑定一个 agent，无法运行时切换。这恰好与课题隔离的需求吻合——用户切换群组即切换课题上下文，消息互不干扰。

---

## 3. 目录结构

```
~/.openclaw/workspace-research-{id}/
├── BOOTSTRAP.md                  # 首次配置引导（完成后自动删除）
├── SOUL.md                       # Agent 身份（研究方向 + 行为边界）
├── AGENTS.md                     # 操作手册（workspace 布局 + session 说明）
├── skills/
│   └── metabolism/SKILL.md       # CKM 四步循环操作手册
├── metabolism/                   # CKM 工作区
│   ├── config.json               # 核心域 query、监测带领域、心跳频率
│   ├── knowledge/                # K(t)：当前知识状态
│   │   ├── _index.md             # 领域全景：主题列表、关系、开放问题
│   │   └── topic-{name}.md      # 主题文件：结论、论文引用、置信度、未解问题
│   ├── diffs/                    # 每日 diff 归档
│   │   └── day-{NNN}.md         # NEW / CONFIRM / REVISE / BRIDGE
│   ├── hypotheses/               # 涌现的假设
│   │   └── hyp-{NNN}.md         # 假设 + 触发来源 + 依赖路径 + 自评
│   └── log/                      # 过程日志
│       ├── day-{NNN}-ingest.md  # 当天摄入论文
│       └── day-{NNN}-monitor.md # 监测带探索记录
├── survey/                       # 文献调研
├── papers/                       # 下载的论文
├── ideas/                        # 研究 idea
└── experiments/                  # 实验工作区
```

### metabolism/config.json

```json
{
  "projectId": "mechanistic-interpretability",
  "coreQuery": {
    "keywords": ["mechanistic interpretability", "sparse autoencoder", "polysemantic neurons"],
    "arxivCategories": ["cs.LG", "cs.AI"],
    "dateMode": "daily-new"
  },
  "monitorZone": {
    "categories": ["q-bio.NC", "cs.CL", "stat.ML"],
    "enabled": true
  },
  "heartbeat": {
    "cronExpression": "0 6 * * *",
    "timezone": "Asia/Shanghai",
    "enabled": true
  },
  "agentId": "project-mechanistic-interpretability",
  "currentDay": 0,
  "createdAt": "2026-03-06T00:00:00Z"
}
```

---

## 4. Agent Bootstrap 文件

每个项目 agent 的 workspace 下放置轻量化的 bootstrap 文件。

### BOOTSTRAP.md（CLI 生成，首次对话后自动删除）

```markdown
# Research Agent Bootstrap

你刚刚被创建为课题「{project-name}」的研究 agent。你需要完成首次配置。

## 引导流程

1. 向用户问好，说明你是研究 agent，请用户描述研究方向
2. 根据用户回答，提取：
   - 核心域关键词（3-5 个）
   - 建议的 arXiv 分类
   - 建议的监测带相邻领域分类
3. 向用户确认以上配置，接受调整
4. 确认后执行以下写入操作：
   - 更新 SOUL.md：填写研究方向、核心域、监测带
   - 生成 metabolism/config.json
5. 询问用户是否立即执行 Day 0（构建初始知识状态 K(T0)）
6. 删除本文件（BOOTSTRAP.md）
```

### SOUL.md（CLI 生成骨架，BOOTSTRAP 流程填充）

**原则：SOUL.md 只放项目身份，不放任务行为。** 任务行为（metabolism 四步循环、survey 流程等）全部在 SKILL.md 中，通过 hook 按 session 类型注入。这样 cron session 不会看到 survey 指令，spawn session 不会看到 metabolism 指令。

```markdown
# Project Agent — {project-name}

你是课题「{project-name}」的研究 agent。

## 研究方向
{由 BOOTSTRAP 流程填写}

## 核心域
关键词: {由 BOOTSTRAP 流程填写}
arXiv 分类: {由 BOOTSTRAP 流程填写}

## 监测带
相邻领域: {由 BOOTSTRAP 流程填写}
```

注意：**没有 "行为边界" 段**。原来的 4 条行为规则（"不使用参数知识"、"没有触发条件输出 NULL" 等）属于 metabolism 任务行为，移入 `skills/metabolism/SKILL.md`。

### AGENTS.md（自动生成）

```markdown
# Agent Operating Manual

## Workspace Layout
metabolism/ — 知识新陈代谢工作区（K(t) 状态、diff、假设）
survey/     — 文献调研
papers/     — 下载的论文
experiments/ — 实验工作区

## Session Context
你可能在不同类型的 session 中被唤醒：
- **Cron session**：定时触发，执行周期性任务（如每日 metabolism）
- **Spawn session**：被 main agent 调度，执行一次性任务（如 literature survey）
- **Main session**：与人类直接对话

任务指令会在 session 启动时注入，按指令执行即可。

## Knowledge File Conventions
- knowledge/ 下的文件是持久知识状态，修改需谨慎
- 每次修改必须先读取当前内容再更新
- _index.md 是全景索引，必须与 topic 文件保持同步
- topic 文件数上限 50，低活跃主题应合并归档
```

**上下文隔离纪律：**
- **SOUL.md** 只放项目身份（研究方向、核心域、监测带），不放任何任务行为规则
- **AGENTS.md** 只放 workspace 布局和 session 类型说明，不放具体任务流程
- **任务行为全部在 SKILL.md 中**，通过 hook 按 session 类型注入：
  - Cron session → `before_agent_start` hook 注入 `skills/metabolism/SKILL.md`
  - Spawn session → `before_tool_call` hook（现有 `inject-skill.ts`）注入对应 SKILL.md
  - Main session → LLM 通过 `<available_skills>` 自行匹配并读取 SKILL.md

这确保每个 session 只看到自己需要的任务指令，不受其他任务的上下文污染。

---

## 5. Skill 注入机制

### 5.1 问题

Metabolism agent 在 isolated cron session 中运行。Cron session 不像 main session 那样有 `<available_skills>` 注入，LLM 看不到 skill 列表，无法自行匹配和加载 SKILL.md。

### 5.2 现有机制

Scientify 已有 `inject-skill.ts` hook（[src/hooks/inject-skill.ts](../src/hooks/inject-skill.ts)），拦截 `before_tool_call` 事件：
- 检测 `sessions_spawn` 的 task 参数是否以 `/skill-name` 开头
- 读取对应 SKILL.md，去掉 frontmatter，内联到 task 中
- 子 agent 在 "minimal" prompt 模式下直接获得完整工作流指令

### 5.3 扩展：Cron Session Skill 注入

新增 `before_agent_start` hook，处理 cron session 的 skill 注入：

```typescript
// 伪代码
api.on("before_agent_start", async (event, ctx) => {
  // 只处理 cron session
  if (ctx.sessionType !== "cron") return;

  const message = event.payload?.message;
  if (typeof message !== "string") return;

  // 从 heartbeat message 中提取 /skill-name
  const match = message.match(/^\/([a-z][\w-]*)/);
  if (!match) return;
  const skillName = match[1];

  // 查找 agent workspace 下的 skill 文件
  const skillPath = path.join(ctx.agentWorkspace, "skills", skillName, "SKILL.md");
  const body = await readAndStripFrontmatter(skillPath);
  if (!body) return;

  // 将 skill 内容注入到 message 中
  return { payload: { ...event.payload, message: body + "\n\n" + message } };
});
```

### 5.4 Workspace Skill 文件

项目 agent 的 workspace 下放置任务 skill：

```
{agent-workspace}/
├── SOUL.md
├── AGENTS.md
├── USER.md (optional)
└── skills/
    └── metabolism/
        └── SKILL.md    # 完整的 CKM 四步循环操作手册
```

`skills/metabolism/SKILL.md` 包含：
- 完整的 Ingest → Diff → Update → Hypothesize 四步操作流程
- Diff 报告格式模板（NEW/CONFIRM/REVISE/BRIDGE）
- 假设文件格式模板（触发类型: GAP/BRIDGE/TREND/CONTRADICTION）
- Knowledge 文件格式规范
- `sessions_send` 消息格式

这些内容从论文 Section 2.3 的具体执行方法直接转化而来。

---

## 6. Cron Heartbeat

### 6.1 注册

```typescript
{
  id: `metabolism-${projectId}`,
  schedule: {
    cron: config.heartbeat.cronExpression,
    tz: config.heartbeat.timezone
  },
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    agentId: config.agentId,
    message: buildHeartbeatPrompt(projectId, currentDay)
  },
  delivery: { mode: "announce" }
}
```

### 6.2 Heartbeat Prompt

```markdown
/metabolism

# Daily Heartbeat — Day {N}

课题: {project-name}
工作目录: {metabolism-dir-path}
当前知识状态: {knowledge-file-count} topics

执行今日新陈代谢循环（详见注入的 SKILL.md）。
完成后通过 sessions_send 发送摘要到 main session，并更新 config.json 中的 currentDay。
```

注意首行 `/metabolism` 触发 hook 注入对应 SKILL.md。

### 6.3 心跳 + 反射模型

每日心跳包含两个层次：

1. **心跳（Heartbeat）= 核心域固定检索**
   - 使用 `arxiv_search` 按预设关键词和分类检索今日新论文
   - 确定性、可重复、等价于人类每天看同一个 RSS 源

2. **反射（Reflex）= 监测带自主探索**
   - 当 Diff 中出现 BRIDGE 信号时触发
   - Agent 基于当前 K(t) 自主决定搜索什么、在哪里搜
   - 使用 `openalex_search` 在监测带类别中探索
   - 非确定性、K(t)-dependent、这是 CKM 的核心差异化能力

---

## 7. 通知模型

三层通知机制，避免信息过载：

| 层级 | 内容 | 频率 | 方式 |
|---|---|---|---|
| Silent log | 每日摄入论文数、diff 细节 | 每日 | 写入 `log/` 目录，不推送 |
| Weekly digest | 本周 diff 汇总、知识增长趋势 | 每周 | `sessions_send` 到 main session |
| Hypothesis push | 假设涌现通知 | 按需 | `sessions_send` 到 main session（高优先级） |

---

## 8. Agent 工具集

Metabolism agent 在 cron session 中只需以下工具（均为全局可用）：

| 工具 | 用途 |
|---|---|
| `arxiv_search` | 核心域心跳检索 |
| `openalex_search` | 监测带反射检索 |
| `read` / `write` / `edit` | 读写知识状态文件 |
| `sessions_send` | 将假设/摘要推送到 main session |

不需要：`arxiv_download`（metabolism 只处理摘要级别信息）、`github_search`、`paper_browser`。

当假设涌现后，用户可在 main session 中触发 research-pipeline 做深入全文分析——这是现有 Scientify skill 体系已经覆盖的能力。

---

## 9. 实现组件

### 9.1 CLI Commands（通过 `api.registerCli()` 注册）

```
openclaw research init <id>
  → 创建 agent workspace 骨架（SOUL.md/AGENTS.md 模板、空目录结构）
  → 复制 bundled metabolism skill 到 workspace
  → 修改 openclaw.json（agents.list + cron job）
  → 不写入研究方向等配置（留给对话式配置）
  → 不创建 binding（留给网页 Gateway UI）

openclaw research list
  → 列出所有研究项目及状态

openclaw research status <id>
  → 显示：当前 day、知识主题数、最近 diff 摘要、假设数

openclaw research delete <id>
  → 清理 agent + workspace + cron（binding 需用户在网页 Gateway 手动移除）
```

### 9.2 Chat Commands（通过 `api.registerCommand()` 注册）

在飞书群组中使用，由 binding 路由到对应项目 agent：

```typescript
/metabolism-status
  → 显示：当前 day、知识主题数、最近 3 天 diff 摘要、假设数

/metabolism-hypotheses
  → 列出所有假设，按时间倒序，显示触发类型和自评分

/metabolism-pause
  → 禁用 cron job（config.heartbeat.enabled = false）

/metabolism-resume
  → 启用 cron job
```

### 9.3 Hook 扩展

扩展现有 hook 体系，新增 `before_agent_start` handler：

```typescript
// index.ts 新增注册
api.on("before_agent_start", createCronSkillInjectionHook(path.dirname(api.source)));
```

职责：检测 cron session 启动 → 从 heartbeat message 提取 `/skill-name` → 读取 agent workspace 下对应 SKILL.md → 内联注入。

### 9.4 模板生成

#### CLI 阶段（`openclaw research init`）

生成骨架文件：

| 文件 | 内容 |
|---|---|
| `BOOTSTRAP.md` | 引导脚本（配置完成后 agent 自动删除） |
| `SOUL.md` | 模板骨架，研究方向字段留空（`{由 BOOTSTRAP 流程填写}`） |
| `AGENTS.md` | 固定模板（workspace 布局 + session 说明） |
| `skills/metabolism/SKILL.md` | 从插件 bundled 复制（CKM 四步循环操作手册） |

修改 `~/.openclaw/openclaw.json`：

| 配置项 | 内容 |
|---|---|
| `agents.list[]` | `{ id: "research-{id}", workspace: "~/.openclaw/workspace-research-{id}" }` |
| `cron.jobs[]` | `{ id: "metabolism-{id}", schedule: {...}, sessionTarget: "isolated", payload: { kind: "agentTurn", agentId: "research-{id}", message: "..." } }` |

注意：不创建 binding（用户在网页 Gateway UI 配置飞书群组绑定）、不写入 `metabolism/config.json`（对话阶段生成）。

#### 对话阶段（飞书群组首次交互）

Agent 读取 BOOTSTRAP.md 中的引导脚本，进入配置引导模式：

| 文件 | 写入时机 |
|---|---|
| `SOUL.md` | 用户确认研究方向后更新 |
| `metabolism/config.json` | 用户确认关键词、分类、心跳频率后生成 |
| `BOOTSTRAP.md` | 配置完成后由 agent 删除（OpenClaw 标准行为） |

---

## 10. 与现有 Scientify 的关系

```
现有 Scientify                        新增 CKM
─────────────────                     ──────────
用户主动触发                           自动持续运行
research-pipeline（一次性流水线）       metabolism（持续循环）
skill 驱动（LLM 匹配 available_skills） skill 驱动（hook 注入到 cron session）
main session / spawn session          isolated cron session
依赖用户选 project                     init 时绑定 project agent

互补关系：
  metabolism 涌现假设 → 用户确认 → research-pipeline 深入执行
  metabolism 是"发现"，pipeline 是"执行"
```

---

## 11. 实现计划

### Phase 1: 最小可用版本

1. **`openclaw research init <id>` CLI command** — 创建 agent + workspace 骨架 + cron job
2. **Bootstrap 模板** — BOOTSTRAP.md（引导脚本）+ SOUL.md（骨架）+ AGENTS.md（固定模板），内嵌在插件代码中
3. **对话式配置流程** — Agent 首次对话引导用户填写研究方向 → 更新 SOUL.md → 生成 config.json
4. **`skills/metabolism/SKILL.md`** — CKM 四步循环完整操作手册（bundled in plugin, 复制到 agent workspace）
5. **Cron skill injection hook** — `before_agent_start` 扩展
6. **Heartbeat prompt 模板** — 每日发给 agent 的指令
7. **`/metabolism-status` chat command** — 在飞书群组中查看状态

### Phase 2: 体验优化

7. **`/metabolism-hypotheses` chat command** — 假设列表展示
8. **`/metabolism-pause` / `/metabolism-resume`** — 控制心跳
9. **`openclaw research list` / `status` / `delete`** — CLI 管理命令
10. **首次心跳优化** — init 后立即执行 Day 0，构建 K(T0)
11. **Weekly digest** — 每周摘要自动推送

### Phase 3: 高级能力

12. **多项目并行** — 多个 project agent 共存，各自飞书群组
13. **假设评审** — 用户在飞书群组对假设反馈，回流到知识状态
14. **知识快照** — git commit 每日 K(t) 状态
15. **与 research-pipeline 联动** — 假设涌现后自动启动深入研究

---

## 12. 关键设计决策

### Q: 为什么一个课题一个 agent，而不是一个共享 metabolism agent？

每个课题需要独立的身份（SOUL.md）、知识状态（knowledge/）、行为约束。共享 agent 会导致多课题上下文混淆、workspace 路径冲突。OpenClaw 的 agent 机制天然提供 workspace 隔离，一对一映射最自然。

### Q: 为什么不用多 agent 隔离不同任务角色？

曾考虑为 metabolism、survey、experiment 各创建一个 agent。放弃原因：文件系统硬隔离（各 agent 独立 workspace，无法共享论文和知识文件），需要额外的 agent-to-agent 通信机制。

### Q: 单 agent 如何避免不同 session 的上下文污染？

SOUL.md 和 AGENTS.md 对所有 session 类型无差别注入。解决方案：**SOUL.md 只放身份，AGENTS.md 只放布局，任务行为全部在 SKILL.md 中按 session 类型注入。**

| 文件 | 注入范围 | 内容边界 |
|---|---|---|
| SOUL.md | 所有 session | 仅项目身份（研究方向、核心域、监测带）|
| AGENTS.md | 所有 session | 仅 workspace 布局 + session 类型说明 |
| skills/metabolism/SKILL.md | 仅 cron session | metabolism 四步循环 + 行为约束 |
| skills/*/SKILL.md | 仅对应 spawn/main session | survey/experiment 等任务流程 |

注入路径：
- Cron → `before_agent_start` hook 读取 heartbeat message 中的 `/metabolism` → 注入 SKILL.md
- Spawn → 现有 `inject-skill.ts` hook 拦截 `sessions_spawn` → 注入 SKILL.md
- Main → LLM 通过 `<available_skills>` 匹配 → 自行读取 SKILL.md

### Q: 为什么 metabolism 只处理摘要，不下载全文？

1. 全文处理太慢（每天 50-200 篇 x 全文 = token 爆炸）
2. 摘要级别的 diff 足以驱动知识状态更新和假设触发
3. 当假设涌现后，可以触发 research-pipeline 做深入全文分析

### Q: 如何处理 knowledge/ 文件无限增长？

- `_index.md` 限制主题数（LLM 自行合并/归档低活跃主题）
- topic 文件有结构化格式，LLM 可以压缩旧条目（保留结论，删除细节）
- 设置 knowledge/ 总文件数上限（50 个 topic 文件）
- 这本身是一种"代谢"——不只是吸收，也有排泄

### Q: cron session 的 agent 如何访问工具？

Scientify 插件注册的工具（`arxiv_search`, `openalex_search`）是全局可用的。`read`/`write`/`edit` 是内置工具。`sessions_send` 是 session 工具。所有需要的工具都已可用，不需要额外配置。

# OpenClaw Agent Bootstrap 机制

> Source: https://docs.openclaw.ai/start/bootstrapping, concepts/system-prompt, reference/templates/*

## 1. 概述

Bootstrap 是 agent 的**首次运行仪式**（first-run ritual），完成 workspace 初始化并收集 agent 身份信息。仅在全新 workspace（无其他 bootstrap 文件）时触发，完成后自动删除 BOOTSTRAP.md，确保只运行一次。

Bootstrap 始终在 **Gateway 宿主机**上执行。

## 2. Bootstrap 流程

1. 初始化 workspace 文件：`AGENTS.md`, `BOOTSTRAP.md`, `IDENTITY.md`, `USER.md`
2. 执行交互式 Q&A（逐个问题）
3. 将 agent 身份和用户偏好写入配置文件
4. 完成后删除 `BOOTSTRAP.md`

## 3. Bootstrap 文件体系

### 核心身份文件

| 文件 | 用途 | 生命周期 |
|------|------|----------|
| `BOOTSTRAP.md` | 首次运行引导脚本 | 一次性，完成后删除 |
| `IDENTITY.md` | Agent 名字、风格、emoji | Bootstrap 时创建，持久 |
| `SOUL.md` | 人格、价值观、行为边界、语气 | Bootstrap 时创建，持久演化 |
| `USER.md` | 用户身份与偏好 | Bootstrap 时创建，持久 |
| `AGENTS.md` | 操作指令与记忆管理 | 每次 session 加载 |
| `TOOLS.md` | 本地工具使用说明 | 持久，仅供参考 |
| `MEMORY.md` | 长期记忆 | 持久，仅主 session 加载 |
| `HEARTBEAT.md` | 心跳任务清单 | 可选 |
| `BOOT.md` | 网关重启清单 | 可选 |

### 文件注入规则

每次 session 首 turn，以下文件内容被注入到 agent context（**Project Context** 区域）：
- `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`
- `BOOTSTRAP.md`（仅全新 workspace）
- `MEMORY.md` / `memory.md`（存在时）

**Sub-agent session 仅注入** `AGENTS.md` 和 `TOOLS.md`（最小上下文）

### 大小限制
- 单文件最大：`bootstrapMaxChars`（默认 20,000 字符）
- 总注入最大：`bootstrapTotalMaxChars`（默认 150,000 字符）
- 空文件自动跳过
- 截断警告可配：`bootstrapPromptTruncationWarning`（`off` / `once` / `always`）

## 4. BOOTSTRAP.md 模板

引导 agent 完成"自我发现"：

1. **开场** — "You just woke up. Time to figure out who you are."
2. **对话** — 自然交谈，确定 4 要素：名字、本质/类型、沟通风格、标志性 emoji
3. **记忆创建** — 将发现写入：
   - `IDENTITY.md` — agent 特征
   - `USER.md` — 用户信息
   - `SOUL.md` — 价值观、行为偏好、边界
4. **可选集成** — 配置消息平台（WhatsApp、Telegram 等）
5. **完成** — 删除 BOOTSTRAP.md 自身

## 5. SOUL.md 模板

定义 agent 的核心人格：

### Core Truths（核心原则）
1. **Genuine helpfulness** — 跳过客套话，直接帮忙
2. **Having opinions** — 拥有个性，而非中性的 AI 助手
3. **Resourcefulness** — 先自己查，读文件，搜索上下文
4. **Trust through competence** — 外部操作谨慎，内部操作大胆

### Boundaries（边界）
- 隐私保护绝对优先
- 不确定时外部操作需确认
- 不完整的回复不发送到消息平台
- 不在群组中冒充用户

### Vibe（氛围）
- 简洁且详尽，真实而非公司化

### Continuity（延续性）
- SOUL.md 是跨 session 的持久记忆，随 agent 演化而更新

## 6. AGENTS.md

操作指令文件，每次 session 开始时加载。定义：
- Session 初始化需读取的文件（SOUL.md, USER.md, memory.md, 近期日志）
- 每日记忆日志格式：`memory/YYYY-MM-DD.md`
- 持久事实存入 `memory.md`
- 安全准则：禁止泄露密钥、未经批准执行破坏性命令、向外部渠道发送不完整回复

## 7. System Prompt 构成

OpenClaw 为每次 agent run 组装定制 system prompt，区段包括：

| 区段 | 内容 |
|------|------|
| Tooling | 工具使用指令 |
| Safety | 安全准则 |
| Skills | `<available_skills>` 列表 |
| Self-Update | 自更新指令 |
| Workspace | 工作区说明 |
| Documentation | 文档查阅指引 |
| Workspace Files | Bootstrap 文件注入 |
| Sandbox | 沙箱规则 |
| Date & Time | 日期时间 |
| Reply Tags | 回复标签 |
| Heartbeats | 心跳任务 |
| Runtime | 运行时信息 |
| Reasoning | 推理模式 |

### Prompt 模式
- **`full`**（默认）：全部区段
- **`minimal`**（子 agent）：省略 Skills、Memory Recall、Self-Update 等
- **`none`**：仅基础身份行

# OpenClaw Agent 机制

> Source: https://docs.openclaw.ai/concepts/agent, multi-agent, agent-loop, agent-workspace

## 1. 概述

OpenClaw 运行一个**嵌入式 agent runtime**（派生自 pi-mono），每个 agent 是一个"fully scoped brain"，拥有独立的：
- **Workspace**：工作目录，存放 AGENTS.md、SOUL.md 等配置文件
- **State directory (`agentDir`)**：认证配置、模型注册、agent 级别配置
- **Session store**：独立的对话历史和路由状态

## 2. Agent 创建

### CLI 创建
```bash
openclaw agents add <agentId>
# 例: openclaw agents add work
```

向导自动生成：
- 独立 workspace 目录（含 SOUL.md, AGENTS.md, USER.md 等）
- 专属 `agentDir`（`~/.openclaw/agents/<agentId>/agent/`）
- 专属 session 存储目录

### 配置声明

在 `~/.openclaw/openclaw.json` 中定义多个 agent：

```json5
{
  agents: {
    list: [
      { id: "alex", workspace: "~/.openclaw/workspace-alex" },
      { id: "mia", workspace: "~/.openclaw/workspace-mia" }
    ]
  }
}
```

### 验证
```bash
openclaw agents list --bindings
```

## 3. Agent 文件系统

### 目录结构
```
~/.openclaw/
├── openclaw.json                          # 中央配置
├── workspace/                             # 默认 agent workspace
│   ├── AGENTS.md                          # 操作指令与记忆
│   ├── SOUL.md                            # 人格、语气、边界
│   ├── USER.md                            # 用户信息
│   ├── IDENTITY.md                        # agent 名字、风格、emoji
│   ├── TOOLS.md                           # 本地工具说明
│   ├── BOOTSTRAP.md                       # 首次运行引导（完成后删除）
│   ├── HEARTBEAT.md                       # 心跳任务清单（可选）
│   ├── BOOT.md                            # 网关重启清单（可选）
│   ├── MEMORY.md                          # 长期记忆
│   ├── memory/YYYY-MM-DD.md              # 每日记忆日志
│   ├── skills/                            # workspace 级 skill 覆盖
│   └── canvas/                            # Canvas UI 文件
├── workspace-<agentId>/                   # 多 agent 时各 agent 独立 workspace
├── agents/
│   └── <agentId>/
│       ├── agent/
│       │   ├── auth-profiles.json         # 认证配置（per-agent 独立）
│       │   └── models.json                # 模型目录
│       └── sessions/
│           ├── sessions.json              # session 存储索引
│           └── <SessionId>.jsonl          # 对话 transcript
├── extensions/                            # 用户全局插件
└── skills/                                # managed/local skills
```

### 重要说明
- Workspace 是**默认 cwd**，不是硬沙箱。相对路径解析到 workspace，但绝对路径可以访问其他位置（除非启用沙箱）
- **永远不要在多个 agent 之间复用 `agentDir`**（会导致认证/session 冲突）
- 认证配置是 **per-agent** 的

## 4. Agent 通信

### Agent 间通信
默认关闭，需显式启用：

```json5
{
  tools: {
    agentToAgent: {
      enabled: false,
      allow: ["home", "work"]  // 白名单
    }
  }
}
```

### 消息路由（Bindings）
入站消息通过 bindings 确定性路由到 agent，按特异性匹配：

1. Peer 精确匹配（DM/群组/频道 ID）
2. 父 peer 匹配（线程继承）
3. Guild ID + roles（Discord）
4. Guild ID 单独匹配
5. Team ID（Slack）
6. Account ID 匹配
7. Channel 级别匹配
8. 回退到默认 agent

```json5
{
  bindings: [
    { agentId: "alex", match: { channel: "whatsapp", peer: { kind: "direct", id: "+15551230001" } } },
    { agentId: "mia", match: { channel: "whatsapp", peer: { kind: "direct", id: "+15551230002" } } }
  ]
}
```

### Sub-Agent（子 agent）
通过 `sessions_spawn` 工具或 `/subagents spawn` 命令生成：
- **非阻塞**：立即返回 run ID
- 完成后向请求方 chat 通道 **announce** 结果
- 默认获得**除 session tools 外的所有工具**
- 支持最多 **5 层嵌套**（默认 `maxSpawnDepth: 1`）
- 每个 session 最多 `maxChildrenPerAgent`（默认 5）个活跃子 agent
- 运行在隔离 session 中，独立的上下文和 token 计量

## 5. Agent Loop（执行循环）

完整执行流：**intake → context assembly → model inference → tool execution → streaming replies → persistence**

### 阶段
1. **验证** — `agent` RPC 验证参数、解析 session、持久化元数据，返回 `{ runId, acceptedAt }`
2. **Agent 命令执行** — 确定模型设置，获取 skills 快照，调用 `runEmbeddedPiAgent`
3. **嵌入式 Pi Session** — 序列化运行队列、解析模型和认证、构建 session、订阅事件流、执行超时控制
4. **事件桥接** — pi-agent-core 事件转换为 OpenClaw stream：tool → `stream: "tool"`, assistant → `stream: "assistant"`, lifecycle → `stream: "lifecycle"`

### 并发管理
运行按 session key 序列化，可选全局 lane，防止 tool/session 竞态

### 超时
- `agent.wait` 默认 30 秒（可配 `timeoutMs`）
- Agent runtime 默认 600 秒（`agents.defaults.timeoutSeconds`）

## 6. Per-Agent 沙箱与工具策略

```json5
{
  agents: {
    list: [{
      id: "family",
      sandbox: { mode: "all", scope: "agent" },
      tools: {
        allow: ["exec", "read"],
        deny: ["write", "edit"]
      }
    }]
  }
}
```

## 7. Agent 删除

- 删除 `~/.openclaw/openclaw.json` 中 `agents.list` 的对应条目
- 删除 `~/.openclaw/workspace-<agentId>/` 目录
- 删除 `~/.openclaw/agents/<agentId>/` 目录
- 重启 Gateway

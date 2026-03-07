# OpenClaw Session 机制

> Source: https://docs.openclaw.ai/concepts/session

## 1. 概述

Session 是 agent 与用户之间的对话上下文单元。所有 session 状态由 **Gateway** 拥有和管理。

## 2. Session 创建与 Key 映射

### DM（私聊）
由 `session.dmScope` 控制聚合方式：

| dmScope | Key 格式 | 说明 |
|---------|----------|------|
| `main`（默认） | `agent:<agentId>:<mainKey>` | 所有 DM 共享同一 session |
| `per-peer` | `agent:<agentId>:dm:<peerId>` | 按发送者隔离 |
| `per-channel-peer` | `agent:<agentId>:<channel>:dm:<peerId>` | 按渠道+发送者隔离 |
| `per-account-channel-peer` | `agent:<agentId>:<channel>:<accountId>:dm:<peerId>` | 按账号+渠道+发送者隔离 |

### 群组/频道
- 群组：`agent:<agentId>:<channel>:group:<id>`
- 频道：`agent:<agentId>:<channel>:channel:<id>`
- Telegram 论坛话题：追加 `:topic:<threadId>`

### 其他来源
- Cron 任务：`cron:<job.id>`（每次运行创建新 sessionId）
- Webhook：`hook:<uuid>`
- Node 运行：`node-<nodeId>`

### 身份链接
`session.identityLinks` 将不同平台的 ID 映射到同一身份：
```json5
{
  session: {
    identityLinks: {
      alice: ["telegram:123456789", "discord:987654321012345678"]
    }
  }
}
```

## 3. Session 存储（文件系统）

```
~/.openclaw/agents/<agentId>/sessions/
├── sessions.json              # session 索引 (sessionKey -> { sessionId, updatedAt, ... })
├── <SessionId>.jsonl          # 对话 transcript（JSONL 格式）
└── <SessionId>-topic-<threadId>.jsonl  # Telegram 话题 transcript
```

- `sessions.json` 是 `sessionKey -> metadata` 的映射
- 删除条目安全，下次消息时自动重建
- 群组条目可包含 `displayName`, `channel`, `subject`, `room`, `space`
- Session 条目包含 `origin` 元数据（label + 路由信息）

## 4. Session 生命周期

### 复用与过期
Session 持续复用直到过期。过期检查发生在**下一条入站消息**时。

### 每日重置
- 默认每天 **4:00 AM**（Gateway 本地时间）重置
- session 最后更新时间早于最近 reset 时间则视为过期

### 空闲超时
- `idleMinutes`：滑动空闲窗口
- 每日重置 + 空闲超时同时配置时，**先到先触发**

### 分类型/分渠道覆盖
```json5
{
  session: {
    reset: { mode: "daily", atHour: 4, idleMinutes: 120 },
    resetByType: {
      direct: { mode: "idle", idleMinutes: 240 },
      group: { mode: "idle", idleMinutes: 120 },
      thread: { mode: "daily", atHour: 4 }
    },
    resetByChannel: {
      discord: { mode: "idle", idleMinutes: 10080 }
    }
  }
}
```

### 手动重置
- `/new` 或 `/reset` 命令开始新 session
- `/new <model>` 可指定模型别名
- 删除 `sessions.json` 中的 key 或 JSONL 文件也可手动重置

## 5. 多用户 DM 安全

**问题**：默认 `dmScope: "main"` 时，所有用户共享同一对话上下文，可能泄露隐私信息。

**解决**：设置 `dmScope: "per-channel-peer"`

**必须启用的场景**：
- 多个发送者有 pairing 授权
- DM 白名单有多个条目
- `dmPolicy: "open"`
- 多个电话号码/账号可以给 agent 发消息

## 6. Session 维护

### 配置
```json5
{
  session: {
    maintenance: {
      mode: "warn",              // warn | enforce
      pruneAfter: "30d",         // 超龄清理
      maxEntries: 500,           // 最大条目数
      rotateBytes: "10mb",       // sessions.json 轮转阈值
      maxDiskBytes: undefined,   // 磁盘预算（可选）
      highWaterBytes: "80%"      // 高水位（maxDiskBytes 的百分比）
    }
  }
}
```

### 清理流程（enforce 模式）
1. 清理超过 `pruneAfter` 的条目
2. 按最旧优先裁剪到 `maxEntries`
3. 归档已清理条目的 transcript 文件
4. 清除旧的 `*.deleted.*` 和 `*.reset.*` 归档
5. `sessions.json` 超过 `rotateBytes` 时轮转
6. 按 `highWaterBytes` 强制执行磁盘预算

### CLI 维护
```bash
openclaw sessions cleanup --dry-run --json
```

## 7. Session 上下文管理

### 工具结果修剪
LLM 调用前自动修剪**旧的工具结果**（不重写 JSONL 历史）

### 自动压缩（Compaction）
接近压缩阈值时，可执行静默 memory flush turn，提醒模型将重要信息写入磁盘

### 手动命令
- `/compact` — 总结旧上下文，释放窗口空间
- `/context list` / `/context detail` — 查看 system prompt 和 workspace 文件
- `/stop` — 中止当前运行和排队的 followup
- `/status` — 查看 agent 可达性、上下文使用量、凭据刷新时间

## 8. 发送策略（Send Policy）

按 session 类型阻止消息投递：

```json5
{
  session: {
    sendPolicy: {
      rules: [
        { action: "deny", match: { channel: "discord", chatType: "group" } },
        { action: "deny", match: { keyPrefix: "cron:" } }
      ],
      default: "allow"
    }
  }
}
```

运行时覆盖（仅 owner）：
- `/send on` — 允许此 session
- `/send off` — 禁止此 session
- `/send inherit` — 清除覆盖，使用配置规则

## 9. Origin 元数据

每个 session 记录来源信息：
- `label`：人类可读标签
- `provider`：标准化渠道 ID
- `from` / `to`：原始路由 ID
- `accountId`：提供商账号 ID
- `threadId`：线程/话题 ID

## 10. 检查命令

```bash
openclaw status                                    # 查看存储路径和近期 session
openclaw sessions --json                           # 导出所有条目
openclaw sessions --json --active 60               # 仅活跃 session
openclaw gateway call sessions.list --params '{}'  # 从运行中的 gateway 获取
```

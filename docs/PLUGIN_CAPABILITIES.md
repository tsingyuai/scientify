# OpenClaw Plugin Capabilities

> Source: https://docs.openclaw.ai/tools/plugin.md

## Overview

Plugins are in-process code modules that extend OpenClaw via `register(api)`. They support **8 major capability categories**.

---

## 1. Agent Tools

```typescript
api.registerTool({
  name: "arxiv_search",     // snake_case required
  description: "...",
  parameters: { /* JSON Schema */ },
  handler: async (params, context) => { return { result: "..." } }
})
```

- Tool JSON schemas sent with **every** LLM request (API `tools` parameter)
- Model decides when to call tools autonomously
- Gemini requires schema cleaning for unsupported keywords (`patternProperties`, etc.)

## 2. Slash Commands

```typescript
api.registerCommand({
  name: "research-status",   // auto-registered as /research-status
  description: "...",
  acceptsArgs: true,
  handler: async (context) => { return { text: "..." } }
})
```

- **Bypass LLM** entirely, execute handler directly
- Suitable for status queries, toggles, quick actions
- Name sanitized to `a-z0-9_`, max 32 chars
- Context provides: `senderId`, `channel`, `isAuthorizedSender`, `args`, `commandBody`, `config`

## 3. Background Services

```typescript
api.registerService({
  id: "auto-updater",
  start: async () => { /* timer, watcher, etc. */ },
  stop: async () => { /* cleanup */ }
})
```

- Long-running tasks tied to Gateway lifecycle
- Start/stop with Gateway process
- Suitable for periodic checks, data sync, file watchers

## 4. Event Hooks

```typescript
api.on("before_prompt_build", handler, { priority: 100 })
api.on("before_tool_call", handler)
```

### Available Hook Events

| Event | Timing | Purpose |
|---|---|---|
| `before_model_resolve` | Before model selection | Override model/provider |
| `before_prompt_build` | Before prompt construction | Inject `prependContext` or override `systemPrompt` |
| `before_agent_start` | Before agent starts | Same as above + model override |
| `llm_input` / `llm_output` | Around LLM calls | Monitor/modify I/O |
| `before_tool_call` / `after_tool_call` | Around tool execution | Intercept/modify tool behavior |
| `tool_result_persist` | Before persisting tool result | Modify stored results |
| `message_received` / `message_sending` / `message_sent` | Message lifecycle | Filter/forward messages |
| `session_start` / `session_end` | Session lifecycle | Init/cleanup |
| `subagent_spawning` / `subagent_spawned` / `subagent_ended` | Sub-agent lifecycle | Monitor child agents |
| `before_compaction` / `after_compaction` | Context compaction | Custom compaction logic |
| `gateway_start` / `gateway_stop` | Gateway lifecycle | Global init/cleanup |

### `before_prompt_build` Return Type

```typescript
type PluginHookBeforePromptBuildResult = {
    systemPrompt?: string;    // REPLACES entire system prompt (destructive)
    prependContext?: string;   // Prepends to user prompt (visible to user)
};
```

- No `appendSystemPrompt` option exists
- Multiple hooks' `prependContext` accumulate with `\n\n` separator
- Multiple hooks' `systemPrompt` — last one wins

## 5. Skills

Declared in `openclaw.plugin.json`:

```json
{
  "skills": ["skills/research-pipeline", "skills/literature-survey"]
}
```

Each skill is a directory with `SKILL.md` (YAML frontmatter + instructions):

```yaml
---
name: literature-survey
description: "Search & download academic papers from arXiv, OpenAlex, GitHub"
user-invocable: true
---
# Instructions...
```

- Auto-injected into `<available_skills>` XML in system prompt
- `user-invocable: true` → also registered as slash command
- `command-dispatch: tool` → bypass LLM, dispatch directly to a tool
- Supports gating: `requires.bins`, `requires.env`, `requires.config`, `os`
- Hot reload via filesystem watcher (default enabled)
- Limits: max 150 skills, 30,000 chars total in prompt

## 6. Messaging Channels

```typescript
api.registerChannel({
  id: "my-chat",
  meta: { label: "My Chat" },
  capabilities: { ... },
  outbound: {
    deliveryMode: "push",
    sendText: async (msg) => { ... }
  }
})
```

- Full chat surface implementations (like Telegram, Discord plugins)
- Requires: config adapters, capabilities, outbound delivery
- Optional: threading, streaming, message actions, security policies

## 7. Model Provider Auth

```typescript
api.registerProvider({
  id: "my-provider",
  methods: [{
    id: "api-key",
    label: "API Key",
    handler: async () => { return { profile, configPatch } }
  }]
})
```

- Custom auth flows: OAuth, API Key, device code
- Exposed as `openclaw models auth login --provider <id>`

## 8. Gateway RPC & HTTP Handlers

- Register custom RPC methods (e.g., `"myplugin.status"`)
- Callable via Gateway WebSocket

---

## Plugin Lifecycle

```
Discovery → Load → Register → Run

Scan paths (priority order):
1. plugins.load.paths (config paths)
2. <workspace>/.openclaw/extensions/
3. ~/.openclaw/extensions/
4. bundled extensions
```

### Requirements
- `openclaw.plugin.json` manifest required
- Optional `configSchema` for config validation
- `plugins.slots` for exclusive categories (e.g., only one memory plugin)
- Gateway restart required after changes

### Distribution
- **NPM**: `openclaw plugins install @scope/pkg`
- **Local**: `openclaw plugins install ./path`
- **Dev link**: `openclaw plugins install -l ./path`
- **Archive**: `.tgz` / `.zip`
- **ClawHub**: `clawhub install <slug>`

### CLI Management
```bash
openclaw plugins list
openclaw plugins info <id>
openclaw plugins install <spec>
openclaw plugins install -l ./path   # dev link
openclaw plugins update <id>
openclaw plugins enable/disable <id>
openclaw plugins doctor
```

---

## Security Notes

- Plugins run **in-process** with Gateway — treat as trusted code
- Dependencies installed with `npm install --ignore-scripts`
- Plugin directory escapes blocked after symlink resolution
- Use `plugins.allow` allowlists for production
- Non-bundled plugins without provenance emit warnings

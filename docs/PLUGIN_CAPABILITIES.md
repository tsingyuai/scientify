# OpenClaw Plugin Capabilities

> Source: https://docs.openclaw.ai/tools/plugin, plugins/manifest, tools/subagents

## Overview

Plugins are in-process code modules that extend OpenClaw via `register(api)`. They support **8 major capability categories**.

Plugin exports: a function `(api) => {}` or an object with `id`, `name`, `configSchema`, and `register(api)` method.

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
  requireAuth: true,
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
api.registerHook(hookName, handler, metadata)
```

### Available Hook Events

| Event | Timing | Purpose |
|---|---|---|
| `before_model_resolve` | Before session load | Override model/provider deterministically |
| `before_prompt_build` | After session load | Inject `prependContext`, `systemPrompt`, `prependSystemContext`, `appendSystemContext` |
| `before_agent_start` | Before agent starts | Legacy compatibility hook |
| `llm_input` / `llm_output` | Around LLM calls | Monitor/modify I/O |
| `before_tool_call` / `after_tool_call` | Around tool execution | Intercept/modify tool behavior |
| `tool_result_persist` | Before persisting tool result | Modify stored results |
| `message_received` / `message_sending` / `message_sent` | Message lifecycle | Filter/forward messages |
| `session_start` / `session_end` | Session lifecycle | Init/cleanup |
| `subagent_spawning` / `subagent_spawned` / `subagent_ended` | Sub-agent lifecycle | Monitor child agents |
| `before_compaction` / `after_compaction` | Context compaction | Custom compaction logic |
| `gateway_start` / `gateway_stop` | Gateway lifecycle | Global init/cleanup |
| `agent_end` | After agent run | Inspect final message list |

### `before_prompt_build` Return Type

```typescript
type PluginHookBeforePromptBuildResult = {
    systemPrompt?: string;         // REPLACES entire system prompt (destructive)
    prependContext?: string;       // Prepends to user prompt (visible to user)
    prependSystemContext?: string; // Prepends to system prompt
    appendSystemContext?: string;  // Appends to system prompt
};
```

- Multiple hooks' `prependContext` accumulate with `\n\n` separator
- Multiple hooks' `systemPrompt` — last one wins
- Operators can disable prompt mutation: `plugins.entries.<id>.hooks.allowPromptInjection: false`

## 5. Skills

Declared in `openclaw.plugin.json`:

```json
{
  "skills": ["skills/research-pipeline", "skills/research-collect"]
}
```

Each skill is a directory with `SKILL.md` (YAML frontmatter + instructions):

```yaml
---
name: research-collect
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
- Skills load from 3 locations (priority order): workspace > managed/local (`~/.openclaw/skills`) > bundled

## 6. Messaging Channels

```typescript
const plugin = {
  id: "acmechat",
  meta: { id, label, selectionLabel, docsPath, blurb, aliases },
  capabilities: { chatTypes: ["direct"] },
  config: {
    listAccountIds: (cfg) => [...],
    resolveAccount: (cfg, accountId) => account
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ text }) => ({ ok: true })
  }
}
api.registerChannel({ plugin })
```

- Full chat surface implementations (like Telegram, Discord plugins)
- Requires: config adapters, capabilities, outbound delivery
- Optional: threading, streaming, message actions, security policies
- Channel onboarding hooks: `configure`, `configureInteractive`, `configureWhenConfigured`

## 7. Model Provider Auth

```typescript
api.registerProvider({
  id: "acme",
  label: "AcmeAI",
  auth: [{
    id: "oauth",
    label: "OAuth",
    kind: "oauth",
    run: async (ctx) => ({
      profiles: [{ profileId, credential: {...} }],
      defaultModel: "acme/opus-1"
    })
  }]
})
```

- Custom auth flows: OAuth, API Key, device code
- Exposed as `openclaw models auth login --provider <id>`

## 8. Gateway RPC & HTTP Handlers

```typescript
// RPC method
api.registerGatewayMethod("myplugin.status", handler)

// HTTP route
api.registerHttpRoute({
  path: "/acme/webhook",
  auth: "plugin",        // "plugin" or "gateway"
  match: "exact",
  handler: async (_req, res) => { res.statusCode = 200; res.end("ok"); return true; }
})
```

- RPC methods callable via Gateway WebSocket
- HTTP routes require explicit `auth` declaration

---

## Runtime Helpers

Plugins access core utilities via `api.runtime`:

- **TTS:** `api.runtime.tts.textToSpeechTelephony({ text, cfg })` — returns PCM audio buffer + sample rate
- **STT:** `api.runtime.stt.transcribeAudioFile({ filePath, cfg, mime? })` — returns `{ text }`

## 9. CLI Registration

```typescript
api.registerCli(
  ({ program }) => {
    program
      .command("research")
      .description("Manage research projects")
      .command("init <id>")
      .option("--direction <desc>", "Research direction")
      .action(async (id, opts) => {
        // Full filesystem access — runs in Gateway Node.js process
        // Can: create directories, write files, modify openclaw.json, shell out to openclaw CLI
      });
  },
  { commands: ["research"] }  // declare top-level command names for CLI routing
);
```

- Registers **top-level** CLI commands: `openclaw <command>` (not subcommands of existing commands)
- `program` is a **Commander.js** instance — supports subcommands, options, arguments
- Runs in **Gateway Node.js process** with full host filesystem access
- `{ commands: ["research"] }` declares command names so the CLI router knows to load this plugin
- Type signature: `registerCli: (registrar: (ctx: { program: Command }) => void, opts?: { commands?: string[] }) => void`

### Use Cases
- `openclaw research init <id>` — Create a project scaffold in unified workspace (`~/.openclaw/workspace/projects/<id>`)
- `openclaw research list` — List unified workspace projects
- `openclaw research status <id>` — Inspect project-level `knowledge_state` and related cron jobs
- `openclaw research delete <id>` — Remove project files (cron jobs are managed separately)

### Capabilities Within CLI Handler
| Operation | How |
|---|---|
| Write project files | `fs.writeFileSync()` — `project.json`, `task.json` |
| Read run status | Read `knowledge_state/state.json` + cron JSON |
| Create directories | `fs.mkdirSync()` — `workspace/projects/<id>/...` |
| Remove project | `fs.rmSync()` on project directory only |

---

## Plugin Manifest (`openclaw.plugin.json`)

### Required Fields
- **`id`** (string): Canonical plugin identifier
- **`configSchema`** (object): JSON Schema for config validation (empty schema acceptable)

### Optional Fields
- **`kind`**: Plugin category (e.g., `"memory"`)
- **`channels`**: Channel identifiers registered by plugin
- **`providers`**: Provider identifiers registered by plugin
- **`skills`**: Skill directories relative to plugin root
- **`name`**: Human-readable display name
- **`description`**: Brief summary
- **`version`**: Plugin version
- **`uiHints`**: UI rendering config (field labels, placeholders, sensitive flags)

```json
{
  "id": "scientify",
  "configSchema": { "type": "object", "additionalProperties": false },
  "skills": ["skills/research-pipeline", "skills/research-collect"],
  "uiHints": {
    "apiKey": { "label": "API Key", "sensitive": true }
  }
}
```

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
- Schemas evaluated during config read/write, not at runtime
- `plugins.slots` for exclusive categories (e.g., only one memory plugin)
- Gateway restart required after changes

### Configuration

```json5
{
  plugins: {
    enabled: true,
    allow: ["voice-call"],         // allowlist
    deny: ["untrusted"],           // denylist
    load: { paths: ["~/Projects/voice-call"] },
    entries: {
      "voice-call": { enabled: true, config: { provider: "twilio" } }
    },
    slots: { memory: "memory-core" }  // exclusive slot
  }
}
```

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
openclaw plugins install -l ./path         # dev link
openclaw plugins install <spec> --pin      # pin exact version
openclaw plugins update <id|--all>
openclaw plugins enable/disable <id>
openclaw plugins doctor
```

---

## SDK Import Paths

```typescript
"openclaw/plugin-sdk/core"           // generic APIs
"openclaw/plugin-sdk/compat"         // broader shared helpers
"openclaw/plugin-sdk/discord"        // Discord-specific
"openclaw/plugin-sdk/msteams"        // Microsoft Teams-specific
```

---

## Security Notes

- Plugins run **in-process** with Gateway — treat as trusted code
- Dependencies installed with `npm install --ignore-scripts`
- Plugin directory escapes blocked after symlink resolution
- Blocks world-writable paths and suspicious ownership for non-bundled plugins
- Use `plugins.allow` allowlists for production
- Non-bundled plugins without provenance emit warnings
- Config validation does **not** execute plugin code

<h1 align="center">Scientify</h1>
<p align="center">
  <em>Continuous Knowledge Metabolism for AI Research</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/scientify"><img src="https://img.shields.io/npm/v/scientify?style=for-the-badge&logo=npm&logoColor=white" alt="npm version"></a>
  <a href="https://github.com/tsingyuai/scientify"><img src="https://img.shields.io/github/stars/tsingyuai/scientify?style=for-the-badge&logo=github" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://github.com/openclaw/openclaw"><img src="https://img.shields.io/badge/OpenClaw-plugin-00FF9F?style=for-the-badge" alt="OpenClaw plugin"></a>
</p>

<p align="center">
  <a href="https://scientify.tech">Website</a> · <a href="./README.md">中文</a> · <a href="https://github.com/tsingyuai/scientify/issues">Issues</a>
</p>

---

## What It Does

> [!IMPORTANT]
> Scientify is not another "ask once, answer once" AI tool. It acts like a real research partner — **continuously thinking, accumulating, and delivering**.

### 1. Metabolism: Continuous Thinking, Not One-Shot Answers

Existing AI research tools work in **batch mode** — give it a question, run a pipeline, get a report, done. Ask the same direction next time, it starts from scratch. Running 10 times is no different from running once.

But human researchers don't work this way. You read, run experiments, and think every day. Yesterday's failure changes today's reading; last week's conversation changes this week's experiment design.

Scientify adopts a **metabolism mode** — continuously ingesting, digesting, accumulating, and re-ingesting:

- **Continuous ingestion**: Automatically tracks frontier papers daily, no manual trigger needed
- **Digestion & accumulation**: Links new knowledge with existing accumulation, writes to persistent knowledge base
- **Hypothesis evolution**: Discards ineffective hypotheses, evolves effective paths — every failure feeds the next round
- **Proactive delivery**: Automatically verifies noteworthy findings and pushes results to you

The longer you use it, the deeper its research goes.

<p align="center">
  <img src="docs/assets/showcase/3.png" width="50%" alt="Scientify proactively pushes research progress via Feishu">
  <br>
  <sub>Scientify proactively pushes latest findings to researchers via Feishu, with insights drawn from its knowledge base</sub>
</p>

### 2. End-to-End Autonomous Research: Achieving SOTA-Level Results

Give it a research topic, and it completes the entire study — producing new algorithms that outperform existing literature.

Driven by multi-agent iteration: the orchestrator holds hypotheses and all accumulated knowledge, only dispatching — never writing code itself; each round spawns independent sub-agents for implementation, review, and experimentation; every failure is distilled into experience for the next round, refining hypotheses until a superior method is discovered.

### Showcase: Autonomously Discovered the KV2 Algorithm with Field-Leading Performance

> **Objective**: For long-context LLM inference, design a strategy that simultaneously reduces time-to-first-token latency and per-request communication volume.
>
> Scientify autonomously completed literature survey, hypothesis generation, code implementation, and experimental validation, proposing the **KV2 algorithm**. Compared to existing research, both TTFT p95 and bytes/request were reduced to varying degrees, achieving SOTA-level performance.

<p align="center">
  <img src="docs/assets/showcase/1.png" width="80%" alt="KV2 algorithm experimental results">
  <br>
  <sub>KV2 algorithm experimental results on first-token latency and communication volume</sub>
</p>

<p align="center">
  <img src="docs/assets/showcase/2.png" width="80%" alt="KV2 comparison with existing methods">
  <br>
  <sub>KV2 SOTA comparison with existing methods</sub>
</p>

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Researcher                                                  │
│  Conversation · Feed materials · Judge hypotheses            │
└──────────────┬──────────────────────────────┬───────────────┘
               ↓                              ↓
┌──────────────────────────┐   ┌──────────────────────────────┐
│  Agent Layer              │   │  Knowledge Base (persistent)  │
│                          │   │                              │
│  Heartbeat  Daily wakeup │←→│  _index.md                   │
│  Reflection Cross-domain │   │  topic-*.md                  │
│  Pipeline   Hypothesis   │   │  hypotheses/                 │
│             verification │   │  experiments/                │
└──────────┬───────────────┘   │  conversations/              │
           ↓                   │                              │
┌──────────────────────────┐   │  Markdown files · Git-managed│
│  Tool Layer               │   │  Fully auditable · You can   │
│                          │──→│  edit them too               │
│  arxiv_search            │   └──────────────────────────────┘
│  openalex_search         │
│  platform / local exec   │
│  / skill steps           │
└──────────────────────────┘
```

Four components, each with a clear role:

### Researcher

You are part of the system. Inject judgment through conversation, feed materials, confirm or reject hypotheses. Your participation makes the metabolism direction more accurate and research hypotheses more precise.

### Agent Layer

Three loops drive the metabolism:

| Agent | What it does | Trigger |
|-------|-------------|---------|
| **Heartbeat** | Tracks frontier papers daily; when it finds relevant work, autonomously verifies and pushes results to you | Scheduled auto-wakeup |
| **Reflection** | Cross-domain exploration — connects knowledge across different topics, discovers unexpected links | Heartbeat / Researcher |
| **Pipeline** | End-to-end research execution — literature survey → deep analysis → implementation → review → experiment | Researcher / Reflection |

Pipeline internally uses multi-agent iteration: the orchestrator holds hypotheses and spawns sub-agents for implementation (`implement`), review (`review`), and experimentation (`experiment`). Each failure is distilled into experience; hypotheses are refined with each round.

### Tool Layer

Scientify organizes research capabilities as a unified semantic layer spanning the runtime registration surface and the workflow execution surface:

| Capability semantic | Primary carrier | Typical target | Execution path | Typical outputs |
|---------------------|-----------------|----------------|----------------|-----------------|
| `arxiv_search`-like capability | Runtime-registered tool | arXiv metadata and candidate paper sets | Registered in the plugin entrypoint and invoked through standard tool calls | search results, candidate paper lists, survey inputs |
| `openalex_search`-like capability | Runtime-registered tool | cross-disciplinary metadata, DOI, citation, and OA signals | Registered in the plugin entrypoint and invoked through standard tool calls | search results, complementary literature sources, survey inputs |
| `github_search`-like capability | Workflow execution step | open-source implementations, baseline repos, reproduction leads | carried out through OpenClaw platform capabilities, local environment commands, or steps defined inside skills | `survey_res.md`, implementation references, repo links |
| `paper_browser`-like capability | Workflow execution step | `.md`, `.tex`, long papers, and drafts | carried out through OpenClaw platform capabilities, local environment commands, or steps defined inside skills | chunked reading results, local excerpts, structured notes |
| `code_executor`-like capability | Workflow execution step | workspace training, evaluation, scripts, and experiment runs | carried out through OpenClaw platform capabilities, local environment commands, or steps defined inside skills | run logs, validation outputs, experiment artifacts |
| `arxiv_download`-like capability | Workflow execution step | arXiv source or PDF acquisition | carried out through OpenClaw platform capabilities, local environment commands, or steps defined inside skills | paper files under `papers/` |
| `openreview_lookup`-like capability | Workflow execution step | reviews, decisions, and forum context | carried out through OpenClaw platform capabilities, local environment commands, or steps defined inside skills | review evidence, comparison notes, review summaries |
| `unpaywall_download`-like capability | Workflow execution step | OA PDF acquisition by DOI | carried out through OpenClaw platform capabilities, local environment commands, or steps defined inside skills | downloaded PDFs and provenance records |

At the implementation boundary:
- the `tool registry` exposes stable, named, directly invokable runtime interfaces
- `skills` define stage ordering, input/output contracts, and artifact materialization
- file reads, command execution, downloads, and external-site interactions are carried out through OpenClaw platform capabilities, local environment commands, or steps defined inside skills

For the current capability map, see [docs/current-capability-map.md](./docs/current-capability-map.md). For historical tool notes, see [docs/historical-tools.md](./docs/historical-tools.md).

> Scientify runs on [OpenClaw](https://github.com/openclaw/openclaw), natively leveraging the platform's MCP servers (Slack / Feishu push), browser automation (paywalled paper downloads), multi-session concurrency (parallel multi-direction research), and more.

### Knowledge Base

All accumulation is persisted as Markdown files, Git-managed, every change is traceable. You and the agents read and write the same files:

```
knowledge_state/
├── _index.md              # Global research index
├── topic-*.md             # Knowledge organized by topic
├── hypotheses/            # Hypothesis evolution records
├── experiments/           # Experiment results & analysis
├── paper_notes/           # Per-paper deep reading records
└── logs/                  # Metabolism run logs
```

---

## Prerequisites

- **Node.js** >= 18
- **Python 3** + **uv** (for ML code execution)
- **git**

---

## Install OpenClaw

```bash
# Install OpenClaw globally
pnpm add -g openclaw    # or: npm install -g openclaw

# Run onboarding wizard (configures model provider, API key, workspace)
openclaw onboard

# Start the gateway (runs the WebUI server)
openclaw gateway
```

After `openclaw gateway`, the WebUI is available at **http://127.0.0.1:18789/** (default port).

> **Proxy users:** If you have `http_proxy` set, access the WebUI with `--noproxy 127.0.0.1` or configure your browser accordingly.

---

## Install Scientify

```bash
openclaw plugins install "$(npm pack scientify)"
```

The plugin installs to `~/.openclaw/extensions/` and is automatically enabled.

### From source (development)

```bash
git clone https://github.com/tsingyuai/scientify.git
cd scientify && pnpm install && pnpm build

# Link as dev plugin
openclaw plugins install -l ./
```

### Verify installation

```bash
openclaw plugins list
# Should show: Scientify (loaded)
```

After installation, **restart the gateway** to load the plugin:

```bash
# Stop the running gateway (Ctrl+C), then:
openclaw gateway
```

---

## Usage via WebUI

### 1. Open the WebUI

Navigate to **http://127.0.0.1:18789/** in your browser.

### 2. Start a research task

Type a research prompt in the chat. Scientify skills are auto-matched by the LLM:

```
Research "transformer efficiency" and generate some innovative ideas
```

Or invoke a specific skill directly with a slash command:

```
/research-pipeline
/research-collect
/idea-generation
/algorithm-selection
/dataset-validate
```

## New Skills for Midstream ML Work

- `/algorithm-selection`
  - use this after `/research-survey` and before `/research-plan`
  - purpose: make 2-3 candidate routes explicit and record `Chosen Route / Rejected Routes / Fallback Route`
- `/dataset-validate`
  - use this when `plan_res.md` already exists and you want to validate data quality before implementation or model review
  - purpose: review data reality, splits, labels, leakage risk, and mock-data usage separately from model quality
- `/baseline-runner`
  - use this when `plan_res.md` already exists and the project needs real baseline comparisons
  - purpose: standardize baselines, protocol, metrics, and result recording, then write `baseline_res.md`

### 3. Monitor sub-agent progress

When the orchestrator spawns sub-agents, you'll see:
- **Spawn notification** — "Phase 1: Literature Survey started"
- **Completion announcement** — automatic message when the sub-agent finishes
- **Progress updates** — the orchestrator verifies outputs and advances to the next phase

Check status anytime:

```
/research-status
```

### 4. Manage projects

```
/projects              # List all projects
/project-switch <id>   # Switch to a different project
/papers                # List downloaded papers
/ideas                 # List generated ideas
```

---

## Skills & Tools

<details>
<summary><b>Pipeline Skills (LLM-powered)</b></summary>

| Skill | Slash Command | Description |
|-------|---------------|-------------|
| **research-pipeline** | `/research-pipeline` | Orchestrator. Spawns sub-agents for each phase, verifies outputs between steps. |
| **research-collect** | `/research-collect` | Search arXiv → filter → download .tex sources → cluster → generate survey report. |
| **research-survey** | `/research-survey` | Deep analysis of papers: extract formulas, map to code, produce method comparison table. |
| **algorithm-selection** | `/algorithm-selection` | Choose between 2-3 plausible ML routes, record rejected routes, and keep a fallback. |
| **research-plan** | `/research-plan` | Create 4-part implementation plan (Dataset/Model/Training/Testing) from survey results. |
| **dataset-validate** | `/dataset-validate` | Audit data reality, splits, labels, and leakage risk before model review. |
| **baseline-runner** | `/baseline-runner` | Run or audit strong baselines under the same protocol before headline comparisons. |
| **research-implement** | `/research-implement` | Implement ML code from plan, run 2-epoch validation with `uv` venv isolation. |
| **research-review** | `/research-review` | Review implementation. Iterates fix → rerun → review up to 3 times. |
| **research-experiment** | `/research-experiment` | Full training + ablation experiments. Requires review PASS. |
| **idea-generation** | `/idea-generation` | Generate 5 innovative research ideas from a topic, select and enhance the best one. |
| **write-paper** | `/write-paper` | Draft a result-driven paper or technical report from experiment artifacts. |
| **artifact-review** | `/artifact-review` | Review a draft, README, or figure set before external sharing. |
| **figure-standardize** | `/figure-standardize` | Normalize figure filenames, captions, labels, and reuse metadata. |
| **release-layout** | `/release-layout` | Repackage existing artifacts into a clearer README or release entry surface. |

</details>

<details>
<summary><b>Standalone Skills</b></summary>

| Skill | Description |
|-------|-------------|
| **paper-download** | Acquire paper files into the project workspace for downstream reading and analysis. |
| **metabolism** | Run day-0 bootstrapping or day-N daily knowledge metabolism for a research topic. |
| **write-review-paper** | Draft a review/survey paper from project research outputs. |

</details>

<details>
<summary><b>Runtime-registered Tools</b></summary>

| Tool | Description |
|------|-------------|
| `arxiv_search` | Search arXiv papers. Returns metadata (title, authors, abstract, ID). Supports sorting by relevance/date and date filtering. |
| `openalex_search` | Search cross-disciplinary academic papers via OpenAlex API. Returns DOI, authors, citation count, OA status. |

</details>

<details>
<summary><b>Commands (direct, no LLM)</b></summary>

| Command | Description |
|---------|-------------|
| `/research-status` | Show workspace status and active project |
| `/papers` | List downloaded papers with metadata |
| `/ideas` | List generated ideas |
| `/projects` | List all projects |
| `/project-delete <id>` | Delete a project |
| `/metabolism-status` | Show knowledge metabolism status for the active project |

</details>

---

## Known Limitations

- **Sub-agent timeout**: Each sub-agent has a 30-minute timeout. Complex literature surveys may need longer.
- **GPU/Sandbox**: Code execution runs on host by default. OpenClaw sandbox does not support GPU passthrough yet.
- **Model dependency**: Research quality depends heavily on the LLM model used. Claude Opus 4.5+ or GPT-5+ recommended.

---

## Development

```bash
git clone https://github.com/tsingyuai/scientify.git
cd scientify
pnpm install
pnpm build          # Build TypeScript
pnpm dev            # Watch mode

# Link to OpenClaw for testing
openclaw plugins install -l ./
```

See [CLAUDE.md](./CLAUDE.md) for version update SOP and contribution guide.

---

## Beta Sign-Up

Scientify is currently in closed beta, open to individuals and teams with real research needs.

After signing up, we will provide:

1. Detailed onboarding guidance to get you started quickly
2. An assessment of your research domain and the feasibility of end-to-end AI-driven research
3. Personalized recommendations based on your research workflow
4. Rapid development of new features tailored to your needs

<p align="center">
  <a href="https://tsingyuai.feishu.cn/share/base/form/shrcne78pTl0NJ9gQqVPDvWm7Wb">
    <img src="docs/assets/showcase/entry.png" width="200" alt="Scan to sign up for beta">
  </a>
  <br>
  <sub><a href="https://tsingyuai.feishu.cn/share/base/form/shrcne78pTl0NJ9gQqVPDvWm7Wb">Sign Up for Beta</a></sub>
</p>

---

## License

MIT

## Author

tsingyuai

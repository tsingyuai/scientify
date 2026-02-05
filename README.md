# Scientify

**AI-powered research workflow automation for OpenClaw.**

[中文文档](./README.zh.md)

---

## Features

### Skills (LLM-powered)

| Skill | Description |
|-------|-------------|
| **idea-generation** | Generate innovative research ideas from a topic. Searches arXiv/GitHub, downloads papers, analyzes literature, outputs 5 ideas with citations. |
| **research-pipeline** | End-to-end ML research workflow: idea → literature → survey → plan → implement → review → iterate. |
| **literature-survey** | Comprehensive literature survey with incremental workflow: search → filter → download → cluster → report. |

### Commands (Direct, no LLM)

| Command | Description |
|---------|-------------|
| `/research-status` | Show workspace status |
| `/papers` | List downloaded papers |
| `/ideas` | List generated ideas |
| `/projects` | List all projects |
| `/project-switch <id>` | Switch project |
| `/project-delete <id>` | Delete project |

### Tools

| Tool | Description |
|------|-------------|
| **arxiv_search** | Search arXiv.org API for papers. Returns metadata only (title, authors, abstract, arxiv_id). No side effects. |
| **arxiv_download** | Download arXiv papers by ID. Tries .tex source first, falls back to PDF. Requires absolute `output_dir` path. |
| **github_search** | Search GitHub repositories by keyword, filter by language, sort by stars/updated |

---

## Quick Start

```bash
# Install the plugin
openclaw plugins install scientify

# Start using
openclaw "Research transformer efficiency and generate ideas"
```

---

## Installation

```bash
openclaw plugins install scientify
```

> **Note:** Do NOT use `npm install scientify`. OpenClaw plugins must be installed via `openclaw plugins install` to be properly discovered.

The plugin will be installed to `~/.openclaw/extensions/scientify/` and automatically enabled.

---

## Usage Scenarios

### 1. One-shot Idea Generation

```
You: Research "long document summarization" and generate some innovative ideas

Agent: [Auto-executes]
  1. Search arXiv papers
  2. Search GitHub repositories
  3. Download and analyze .tex sources
  4. Generate 5 innovative ideas
  5. Select and enhance the best idea
  6. Map to code implementations
```

### 2. Daily Literature Tracking

```
You: Set up a daily task at 9am to check arXiv for new papers on
    "transformer efficiency", summarize relevant ones and send to Feishu

Agent: Setting up:
  1. Create scheduled Hook (cron: "0 9 * * *")
  2. Daily arxiv search for papers from last 24h
  3. Compare against your idea (selected_idea.md)
  4. Filter relevant papers, generate summary
  5. Push via Feishu webhook

[Example push]
📚 Today's Relevant Papers (3)
• "FlashAttention-3: Fast Attention with ..." - Highly relevant to your idea
• "Efficient Long-Context Transformers" - Medium relevance
• "..."
```

### 3. Research Progress Reporter

```
You: Generate weekly research progress report every Friday and send to Slack

Agent: [Auto-executes every Friday]
  1. Read $WORKSPACE changes
  2. Stats: X new papers, Y new ideas, Z code commits
  3. Generate weekly report markdown
  4. Push to Slack #research channel
```

### 4. Competitive Paper Monitor

```
You: Monitor new papers from "Yann LeCun" and "Meta AI"

Agent: Setting up monitoring:
  - Daily check arxiv author "Yann LeCun"
  - Check arxiv affiliation "Meta AI"
  - Push notification when new papers appear
```

### 5. Paper Reading Assistant

```
You: Read papers/2401.12345/ and compare its method with my idea

Agent: [Reading paper .tex files]

  📄 Paper: "Efficient Attention for Long Documents"

  ## Comparison with Your Idea

  | Aspect | Paper Method | Your Method |
  |--------|-------------|-------------|
  | Attention | Sparse Attention | Hierarchical Attention |
  | Complexity | O(n√n) | O(n log n) |
  | Advantage | Simple implementation | Preserves more info |

  ## Suggestions
  Consider combining both approaches...
```

### 6. Related Work Writer

```
You: Write Related Work section based on papers in my project

Agent: [Reading papers/ and literature/notes/]

  Generating related_work.tex:

  \section{Related Work}

  \subsection{Long Document Summarization}
  Recent works have explored various approaches...
  \cite{paper1} proposed...
  \cite{paper2} extended this by...

  \subsection{Efficient Transformers}
  ...
```

### 7. Idea Mashup

```
You: Combine "reinforcement learning" and "text summarization" to spark new ideas

Agent: [Searching papers from both fields]

  🔥 Mashup Results:

  1. **RL-guided Summarization**
     Use RL to optimize readability and information coverage
     References: [2301.xxx], [2302.xxx]

  2. **Interactive Summarization Agent**
     User feedback as reward signal for iterative optimization

  3. ...
```

### 8. Experiment Design Helper

```
You: My idea is xxx, help me design experiments

Agent: [Reading selected_idea.md and related papers]

  ## Experiment Design

  ### Datasets
  1. CNN/DailyMail - Standard news summarization (287k samples)
  2. arXiv - Long scientific papers (215k samples)
  3. ...

  ### Baselines
  1. BART-large (ref: paper_001.md)
  2. LED (ref: paper_003.md)

  ### Metrics
  - ROUGE-1/2/L
  - BERTScore
  - Human evaluation: fluency, information coverage

  ### Ablation Studies
  1. Remove xxx module
  2. ...
```

---

## Workspace Structure

```
~/.openclaw/workspace/projects/
├── .active                      # Current project ID
├── nlp-summarization/           # Project A
│   ├── project.json             # Metadata
│   ├── task.json                # Task definition
│   ├── survey/
│   │   ├── search_terms.json    # Search terms used
│   │   └── report.md            # Final survey report
│   ├── papers/
│   │   ├── _downloads/          # Raw downloaded files
│   │   ├── _meta/               # Paper metadata JSON files
│   │   │   └── {arxiv_id}.json
│   │   └── {direction}/         # Clustered papers by research direction
│   ├── repos/                   # Cloned repos
│   └── ideas/                   # Generated ideas
│       ├── idea_1.md
│       ├── idea_2.md
│       └── selected_idea.md     # Best idea
└── another-project/
```

---

## Configuration

After installation, the plugin is automatically enabled. You can customize settings in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "scientify": {
        "enabled": true,
        "workspaceRoot": "~/my-research",
        "defaultMaxPapers": 15
      }
    }
  }
}
```

### Plugin Management

```bash
# List installed plugins
openclaw plugins list

# Disable plugin
openclaw plugins disable scientify

# Enable plugin
openclaw plugins enable scientify

# Update to latest version
openclaw plugins update scientify
```

---

## Known Limitations

### Sandbox & GPU

The `research-pipeline` skill's code execution step depends on your OpenClaw agent configuration:

- If `sandbox.mode: "off"` (default for CLI), commands run directly on host
- Current sandbox does NOT support GPU (`--gpus`) or custom shared memory (`--shm-size`)

For GPU-accelerated ML training, consider:
1. Running outside sandbox (configure agent with `sandbox.mode: "off"`)
2. Using a dedicated cloud GPU instance
3. Waiting for OpenClaw GPU support

---

## Development

See [CLAUDE.md](./CLAUDE.md) for version update SOP and contribution guide.

---

## License

MIT

## Author

tsingyuai

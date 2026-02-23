---
name: install-scientify
description: "Use this when the user wants to install or set up the Scientify research plugin. Adds research-pipeline, literature-survey, idea-generation, arxiv tools, and workspace management."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔬",
        "install":
          [
            {
              "id": "scientify",
              "kind": "node",
              "package": "scientify",
              "label": "Install Scientify plugin (npm)",
            },
          ],
      },
  }
---

# Install Scientify

**Don't ask permission. Just do it.**

**Scientify** is an AI-powered research workflow automation plugin for OpenClaw.

## What You Get

### Skills (LLM-powered)

| Skill | Description |
|-------|-------------|
| **research-pipeline** | End-to-end orchestrator. Spawns sub-agents for 6 phases: survey → analysis → plan → code → review → experiment. |
| **literature-survey** | Search arXiv + OpenAlex → filter → download .tex sources → cluster → generate survey report. |
| **research-survey** | Deep analysis of papers: extract formulas, map to code, produce method comparison table. |
| **research-plan** | Create 4-part implementation plan (Dataset/Model/Training/Testing) from survey results. |
| **research-implement** | Implement ML code from plan, run 2-epoch validation with `uv` venv isolation. |
| **research-review** | Review implementation. Iterates fix → rerun → review up to 3 times. |
| **research-experiment** | Full training + ablation experiments. Requires review PASS. |
| **idea-generation** | Generate 5 innovative research ideas, score on novelty/feasibility/impact, enhance the best one. |
| **write-review-paper** | Draft a review/survey paper from project research outputs. |

### Commands (Direct, no LLM)

| Command | Description |
|---------|-------------|
| `/research-status` | Show workspace status and active project |
| `/papers` | List downloaded papers with metadata |
| `/ideas` | List generated ideas |
| `/projects` | List all projects |
| `/project-switch <id>` | Switch active project |
| `/project-delete <id>` | Delete a project |

### Tools

| Tool | Description |
|------|-------------|
| `arxiv_search` | Search arXiv papers. Returns metadata (title, authors, abstract, ID). Supports sorting by relevance/date. |
| `arxiv_download` | Batch download papers by arXiv ID. Prefers .tex source (PDF fallback). |
| `openalex_search` | Search cross-disciplinary papers via OpenAlex API. Returns DOI, authors, citation count, OA status. |
| `unpaywall_download` | Download open access PDFs by DOI via Unpaywall. Non-OA papers silently skipped. |
| `github_search` | Search GitHub repositories. Returns name, description, stars, URL. Supports language filtering. |
| `paper_browser` | Paginated browsing of large paper files (.tex/.md) to avoid context overflow. |

## Installation

```bash
openclaw plugins install scientify
```

Or let OpenClaw install it automatically when you use this skill.

> **Note:** Do NOT use `npm install scientify`. OpenClaw plugins must be installed via `openclaw plugins install` to be properly discovered.

## Usage Examples

### End-to-End Research

```
Research scaling laws for classical ML classifiers on Fashion-MNIST
```

### Generate Research Ideas

```
Explore recent advances in protein folding and generate innovative research ideas
```

### Literature Survey Only

```
Survey the latest papers on vision-language models for medical imaging
```

### Check Workspace

```
/research-status
```

## Links

- npm: https://www.npmjs.com/package/scientify
- GitHub: https://github.com/tsingyuai/scientify
- Author: tsingyuai

---
name: literature-review
description: "Generate reading notes and summaries from EXISTING papers (PDF/.tex files user already has). Use for: summarize papers, create reading notes, write literature review section. Does NOT search for new papers or generate research ideas."
metadata:
  {
    "openclaw":
      {
        "emoji": "📖",
      },
  }
---

# Literature Review

Generate structured notes and synthesis documents from academic papers. Use this skill when the user wants to:
- Summarize papers they've collected
- Create reading notes for a research topic
- Write a literature review section
- Compare methods across multiple papers

## Workspace Convention (Project-based)

**IMPORTANT**: OpenClaw uses project-based workspaces. Each research topic has its own project directory.

### Check Active Project First

Before starting, check the active project:
```bash
cat ~/.openclaw/workspace/projects/.active 2>/dev/null
```

If a project is active, use `$WORKSPACE = ~/.openclaw/workspace/projects/{project_id}/`.

If no active project, use the flat structure: `~/.openclaw/workspace/`.

### Project-based Structure (Recommended)

```
~/.openclaw/workspace/projects/{project-id}/
├── project.json              # Project metadata
├── papers/                   # Downloaded PDFs/tex files
│   ├── 2401.12345/
│   │   └── main.tex
│   └── ...
└── literature/               # Generated outputs
    ├── notes/                # Per-paper notes
    │   ├── 2401.12345.md
    │   └── ...
    ├── synthesis.md          # Cross-paper synthesis
    ├── bibliography.bib      # BibTeX entries
    └── review_draft.md       # Optional: formatted review
```

### Flat Structure (Fallback)

```
~/.openclaw/workspace/
├── papers/
└── literature/
    ├── notes/
    ├── synthesis.md
    └── ...
```

**File existence = step completion.** Skip steps whose output already exists.

**In the steps below**, `$WORKSPACE` refers to the active project directory or `~/.openclaw/workspace/` if no project is active.

## Step 1: Gather Papers

Check what papers are available:

1. **Check active project first**: `cat ~/.openclaw/workspace/projects/.active`
2. **Look in project papers directory**: `ls -la $WORKSPACE/papers/`
3. Check if user provided URLs or arXiv IDs

If no papers found, ask user to provide:
- ArXiv IDs (e.g., "2401.12345")
- PDF URLs
- Local file paths

## Step 2: Read and Annotate Each Paper

For each paper, create `$WORKSPACE/literature/notes/<paper_id>.md`:

First, ensure the output directory exists:
```bash
mkdir -p $WORKSPACE/literature/notes
```

```markdown
# [Paper Title]

**ArXiv/DOI**: [id]
**Authors**: [list]
**Year**: [year]
**Venue**: [conference/journal if known]

## TL;DR
[1-2 sentence summary of the main contribution]

## Problem Statement
[What problem does this paper address?]

## Method
[Key approach, algorithm, or framework]

### Core Idea
[The central insight or innovation]

### Technical Details
[Important formulas, architectures, or algorithms]

```latex
[Key equations if applicable]
```

## Experiments
- **Datasets**: [list]
- **Baselines**: [list]
- **Main Results**: [key numbers]

## Strengths
- [strength 1]
- [strength 2]

## Weaknesses / Limitations
- [limitation 1]
- [limitation 2]

## Relevance to My Research
[How does this paper relate to the user's work? Leave blank if unknown]

## Key Quotes
> "[Important quote from the paper]" (Section X)

## References to Follow
- [Paper A]: [why interesting]
- [Paper B]: [why interesting]
```

### Reading Strategy by Format

| Format | Method |
|--------|--------|
| `.tex` | Use `read` directly. Search for `\section`, `\begin{equation}` |
| `.pdf` | Use `read` (OpenClaw supports PDF). Focus on abstract, intro, method, experiments |
| URL | Use `web_fetch` to get content, then summarize |

### Quality Checklist

Before finishing a note, verify:
- [ ] TL;DR captures the main contribution
- [ ] Method section explains the approach clearly
- [ ] At least 2 strengths and 2 limitations identified
- [ ] Key equations/algorithms included if applicable

## Step 3: Generate BibTeX

Create `$WORKSPACE/literature/bibliography.bib`:

```bibtex
@article{author2024title,
  title={Full Paper Title},
  author={Last, First and Last2, First2},
  journal={arXiv preprint arXiv:2401.12345},
  year={2024}
}
```

For arXiv papers, use this format. For published papers, include venue, volume, pages.

## Step 4: Synthesize Across Papers

Create `$WORKSPACE/literature/synthesis.md`:

```markdown
# Literature Synthesis: [Topic]

## Overview
[Brief introduction to the research area]

## Taxonomy of Approaches

### Category A: [Name]
Papers: [list]
Key characteristics: [describe]

### Category B: [Name]
Papers: [list]
Key characteristics: [describe]

## Comparison Table

| Paper | Method | Dataset | Key Metric | Result |
|-------|--------|---------|------------|--------|
| [A]   | ...    | ...     | ...        | ...    |
| [B]   | ...    | ...     | ...        | ...    |

## Evolution of Ideas
[How has the field progressed? What are the trends?]

## Open Problems
1. [Gap 1]
2. [Gap 2]

## Recommendations
[Which papers to read first? Which approaches are most promising?]
```

## Step 5 (Optional): Draft Literature Review

If user requests a formal review, create `$WORKSPACE/literature/review_draft.md`:

```markdown
# Literature Review: [Topic]

## 1. Introduction
[Context and motivation for the review]

## 2. Background
[Essential concepts the reader needs]

## 3. Survey of Methods

### 3.1 [Category A]
[Describe approaches in this category, cite papers]

### 3.2 [Category B]
[Describe approaches in this category, cite papers]

## 4. Empirical Comparison
[Summarize experimental findings across papers]

## 5. Discussion
[Trends, gaps, and future directions]

## 6. Conclusion
[Key takeaways]

## References
[BibTeX citations]
```

## Batch Processing

If reviewing more than 10 papers:
1. First pass: Generate TL;DR only for all papers
2. User selects which papers need full notes
3. Second pass: Full notes for selected papers
4. Final pass: Synthesis

Do NOT process all papers with full detail in a single session—context will overflow.

## Commands

User can say:
- "Review these papers" → Full workflow
- "Just summarize [paper]" → Single paper note
- "Compare [paper A] and [paper B]" → Focused comparison
- "Write a literature review on [topic]" → Full review draft

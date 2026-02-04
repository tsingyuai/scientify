---
name: arxiv
description: "Search arXiv.org for academic papers using the built-in arxiv tool. Use for literature search, finding related work, and downloading paper sources."
metadata:
  {
    "openclaw":
      {
        "emoji": "📚",
      },
  }
---

# ArXiv Search

Use the built-in `arxiv` tool to search for academic papers on arXiv.org.

## Basic Search

```
arxiv query:"graph neural network" max_results:10
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query (required) |
| `max_results` | number | Max papers to return (default: 10, max: 50) |
| `sort_by` | string | Sort by: "relevance", "lastUpdatedDate", "submittedDate" |
| `date_from` | string | Filter papers after this date (YYYY-MM-DD) |
| `download` | boolean | Download .tex source files (default: false) |
| `output_dir` | string | Directory for downloads (default: ~/.openclaw/workspace/papers/) |

## Examples

Search for recent transformer papers:
```
arxiv query:"transformer attention mechanism" sort_by:"submittedDate" max_results:5
```

Search with date filter:
```
arxiv query:"diffusion models" date_from:"2024-01-01"
```

Search and download .tex sources:
```
arxiv query:"transformer attention" max_results:5 download:true
```

## Output

Returns JSON with:
- `query`: The search query
- `total`: Number of results
- `papers`: Array of paper objects with:
  - `title`: Paper title
  - `authors`: List of authors
  - `abstract`: Paper abstract
  - `arxiv_id`: ArXiv ID (e.g., "2401.12345")
  - `pdf_url`: Direct PDF link
  - `published`: Publication date
  - `categories`: ArXiv categories (e.g., "cs.LG", "cs.AI")

When `download: true`:
- `downloads`: Array of download results with:
  - `arxiv_id`: Paper ID
  - `format`: "tex" or "pdf" (fallback)
  - `files`: List of downloaded files
  - `error`: Error message if download failed
- `output_dir`: Directory where files were saved

---

## Downloading Paper Source (.tex)

**IMPORTANT**: Prefer downloading .tex source over PDF for better AI readability.

### Download .tex Source (Recommended - Use Tool)

The easiest way is to use the `arxiv` tool with `download: true`:

```
arxiv query:"your search" max_results:5 download:true output_dir:"~/.openclaw/workspace/papers"
```

This automatically:
1. Downloads .tex source from `https://arxiv.org/src/{arxiv_id}`
2. Extracts tar.gz archives
3. Falls back to PDF if .tex unavailable

### Manual Download (Bash)

If you need to download specific papers manually:

```bash
mkdir -p ~/.openclaw/workspace/papers/{arxiv_id}
cd ~/.openclaw/workspace/papers/{arxiv_id}
curl -L "https://arxiv.org/src/{arxiv_id}" -o source.tar.gz
tar -xzf source.tar.gz
```

### Why .tex over PDF?

| Format | AI Readability | Formulas | Structure |
|--------|---------------|----------|-----------|
| **.tex** | Excellent | Full LaTeX | Preserved |
| .pdf | Poor (needs OCR) | Lost/garbled | Lost |

### Fallback to PDF

If .tex source is unavailable (404 error), fall back to PDF:
```bash
curl -L "https://arxiv.org/pdf/{arxiv_id}.pdf" -o ~/.openclaw/workspace/papers/{arxiv_id}.pdf
```

---

## Workspace Integration

**Project-based workspace**: When using with `idea-generation` or `research-pipeline` skills, papers are stored per-project:

```
~/.openclaw/workspace/projects/
├── .active                   # Current project ID
├── {project-id}/             # e.g., nlp-summarization, cv-segmentation
│   ├── project.json          # Project metadata
│   ├── papers/               # Downloaded papers for THIS project
│   │   ├── 2401.12345/       # Extracted .tex source
│   │   │   ├── main.tex
│   │   │   └── ...
│   │   └── 2402.67890.pdf    # PDF fallback
│   └── ...
```

**When called from idea-generation**: Use `output_dir: "$WORKSPACE/papers"` where `$WORKSPACE` is the active project directory.

**Standalone usage**: Default `output_dir` is `~/.openclaw/workspace/papers/` (flat structure).

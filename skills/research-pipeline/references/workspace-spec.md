# Workspace Directory Specification

All research pipeline artifacts live in a `workspace/` directory. The location is either specified by the user or defaults to the current working directory plus `workspace/`.

## Directory Layout

```
workspace/
  task.json                 # Input: research task definition
  search_results.md         # Step 2: arxiv + github search results
  prepare_res.md            # Step 3: selected repos and rationale
  survey_res.md             # Step 5: synthesized literature survey
  plan_res.md               # Step 6: four-part implementation plan
  ml_res.md                 # Step 7: implementation report
  experiment_res.md         # Step 10: full training results

  repos/                    # Step 3: cloned reference repositories
    repo-name-1/
    repo-name-2/

  papers/                   # Step 4: downloaded paper sources
    2401.12345.tex
    2401.67890.tex

  notes/                    # Step 5: per-paper survey notes
    paper_001.md
    paper_002.md

  iterations/               # Steps 8-9: review history
    judge_v1.md
    judge_v2.md

  project/                  # Step 7: implementation code
    model/
    data/
    training/
    testing/
    utils/
    run.py
    requirements.txt
```

## Conventions

### File Existence = Step Completion

The research pipeline uses file existence as the checkpoint mechanism. Before executing any step, check whether its output file already exists. If it does, skip the step.

This enables:
- **Crash recovery**: resume from the last completed step.
- **Incremental progress**: re-running the pipeline skips completed work.
- **Transparency**: a human can inspect progress by listing the directory.

### Naming Rules

- Markdown files (`.md`) for human-readable outputs.
- JSON files (`.json`) for structured data (task definition).
- Paper notes use sequential numbering: `paper_001.md`, `paper_002.md`.
- Review iterations use version numbering: `judge_v1.md`, `judge_v2.md`.

### Immutability

Once a step's output is written, do NOT modify it unless the user explicitly asks. If a step needs to be re-done, delete the output file first, then re-execute.

Exception: `workspace/project/` is mutable during the implement-review-iterate loop (Steps 7-9).

### task.json Schema

```json
{
  "idea": "A 1-3 sentence description of the research idea",
  "references": ["2401.12345", "paper title string"],
  "domain": "recommendation systems",
  "date_limit": "2024-01-01"
}
```

- `idea` (required): The core research idea to implement.
- `references` (optional): ArXiv IDs or paper titles as starting points.
- `domain` (optional): Research domain for focused searching.
- `date_limit` (optional): Only consider papers published after this date.

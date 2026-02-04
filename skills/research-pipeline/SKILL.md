---
name: research-pipeline
description: "End-to-end research automation: from idea to code implementation with literature review, planning, and iterative refinement. Use arxiv, github_search, and exec tools."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔬",
        "requires": { "bins": ["git", "python3"] },
      },
  }
---

# Research Pipeline

Automate an end-to-end ML research workflow: idea -> literature search -> survey -> plan -> implement -> review -> iterate.

All intermediate results live in a project-based workspace directory. **File existence = step completion.** If a step's output file already exists, skip that step and move on. This enables crash recovery and incremental progress.

---

## Workspace Convention (Project-based)

**IMPORTANT**: This skill uses the same project-based workspace as `idea-generation`. Check or set the active project first.

### Check Active Project
```bash
cat ~/.openclaw/workspace/projects/.active 2>/dev/null
```

If a project is active, set `$WORKSPACE = ~/.openclaw/workspace/projects/{project_id}/`.

If no active project exists, create one based on the research idea (see Step 1).

### Directory Structure
```
$WORKSPACE/
├── project.json          # Project metadata
├── task.json             # Research task/idea definition
├── search_results.md     # Search results (Step 2)
├── prepare_res.md        # Selected repos (Step 3)
├── papers/               # Downloaded papers (Step 4)
├── repos/                # Cloned repositories (Step 3)
├── notes/                # Paper notes (Step 5)
├── survey_res.md         # Literature survey (Step 5)
├── plan_res.md           # Implementation plan (Step 6)
├── project/              # Code implementation (Step 7)
├── ml_res.md             # Implementation report (Step 7)
├── iterations/           # Review iterations (Step 8-9)
│   ├── judge_v1.md
│   └── ...
└── experiment_res.md     # Final results (Step 10)
```

---

## Step 1: Parse Task

Read `$WORKSPACE/task.json`. If it does not exist, ask the user for:

- **idea**: A description of the research idea (1-3 sentences).
- **references** (optional): ArXiv IDs or paper titles as starting points.
- **domain** (optional): e.g. "recommendation systems", "NLP", "computer vision".

Write the result to `$WORKSPACE/task.json`:

```json
{
  "idea": "...",
  "references": ["2401.12345", "..."],
  "domain": "...",
  "date_limit": "2024-01-01"
}
```

**Output:** `$WORKSPACE/task.json`

## Step 2: Search

Use the `arxiv` tool to search for 5-10 related papers based on the idea and any reference paper titles. Use the `github_search` tool to find related repositories.

Combine results into a markdown report:

```
## ArXiv Papers
- [title](pdf_url) — arxiv_id — summary of relevance

## GitHub Repositories
- [repo_name](url) — stars — language — summary of relevance
```

**Output:** `$WORKSPACE/search_results.md`

## Step 3: Prepare References

Read `$WORKSPACE/search_results.md`. Select 3-5 of the most relevant repositories.

For each selected repo, clone it into `$WORKSPACE/repos/`:

```bash
git clone --depth 1 <url> $WORKSPACE/repos/<repo_name>
```

Write a summary of selected repos and their relevance to the idea.

**Output:** `$WORKSPACE/prepare_res.md`

## Step 4: Download Papers

For each important paper from Step 2, use the `arxiv` tool with `download: true` and `output_dir: "$WORKSPACE/papers/"` to get .tex source files.

If download fails for any paper, note the failure and continue. The survey step can work with abstracts alone.

**Output:** `$WORKSPACE/papers/*.tex` (or `.md` summaries if .tex unavailable)

## Step 5: Literature Survey

This is the most intellectually demanding step. Read `references/prompts/survey.md` for detailed guidance.

For each paper:

1. Read the .tex source (or abstract) thoroughly.
2. Extract: core method, mathematical formulas, key contributions.
3. Read the corresponding reference codebase in `$WORKSPACE/repos/`.
4. Map math formulas to code implementations.
5. Write structured notes to `$WORKSPACE/notes/paper_NNN.md`.

Each note file should contain:

```markdown
# [Paper Title]

## Core Method
...

## Math Formulas
...

## Code Implementation
File: repos/<repo>/path/to/file.py
```python
# relevant code excerpt
```

## Key Insights
...
```

After all papers are surveyed, write a synthesis combining all notes.

**Output:** `$WORKSPACE/notes/paper_*.md` + `$WORKSPACE/survey_res.md`

## Step 6: Implementation Plan

Read `references/prompts/plan.md` for detailed guidance.

Based on `survey_res.md`, `prepare_res.md`, and `task.json`, create a four-part plan:

1. **Dataset Plan**: data source, loading pipeline, preprocessing, dataloader design.
2. **Model Plan**: architecture, math formulas to implement, reference code to adapt.
3. **Training Plan**: loss functions, optimizer, hyperparameters, monitoring.
4. **Testing Plan**: metrics, evaluation protocol, baselines.

**Output:** `$WORKSPACE/plan_res.md`

## Step 7: Implement

Read `references/prompts/implement.md` for detailed guidance.

Create a self-contained project in `$WORKSPACE/project/`:

```
$WORKSPACE/project/
  model/          # model architecture
  data/           # data loading and preprocessing
  training/       # training loop and configs
  testing/        # evaluation scripts
  utils/          # shared utilities
  run.py          # main entry point
  requirements.txt
```

**Critical rules:**

- Do NOT import directly from `$WORKSPACE/repos/`. Adapt and rewrite code.
- Implement EVERY component from `plan_res.md`.
- Use real datasets, not toy data.
- First run: 2 epochs only (quick validation).

Execute:

```bash
cd $WORKSPACE/project && pip install -r requirements.txt && python run.py --epochs 2
```

**Note:** GPU support requires external configuration. For GPU-accelerated training, consider using a dedicated ML environment or cloud instance.

**Output:** `$WORKSPACE/project/` (code) + `$WORKSPACE/ml_res.md` (implementation report)

## Step 8: Review

Read `references/prompts/review.md` for detailed guidance.

Review the implementation against:

- Each atomic idea from `survey_res.md`: is the math correctly translated to code?
- The plan from `plan_res.md`: are all components present?
- Code quality: no toy implementations, proper error handling, correct data pipeline.

Write a structured review:

```markdown
# Review v1

## Verdict: PASS / NEEDS_REVISION

## Checklist
- [ ] Dataset loading matches plan
- [ ] Model architecture matches formulas
- [ ] Loss function correct
- [ ] Training loop proper
- [ ] Evaluation metrics correct

## Issues (if NEEDS_REVISION)
1. Issue description → suggested fix
2. ...
```

**Output:** `$WORKSPACE/iterations/judge_v1.md`

## Step 9: Iterate

If the review verdict is `NEEDS_REVISION`:

1. Read `$WORKSPACE/iterations/judge_vN.md` for the latest suggestions.
2. Fix each issue in `$WORKSPACE/project/`.
3. Re-run the 2-epoch validation.
4. Write a new review to `$WORKSPACE/iterations/judge_v(N+1).md`.
5. Repeat until `PASS` or 3 iterations reached.

If 3 iterations are exhausted without PASS, summarize remaining issues and ask the user for guidance.

**Output:** `$WORKSPACE/iterations/judge_v*.md` (review history)

## Step 10: Full Training

Once review passes:

1. Update epoch count in `run.py` to the full training value.
2. Execute full training run.
3. Collect and analyze results.

**Output:** `$WORKSPACE/experiment_res.md`

## Batch Processing Rule

When you need to apply the same LLM operation to more than 10 files (e.g., summarizing all papers), do NOT process them one by one in conversation. Instead, write a script to handle them in batch.

## Recovery

If the session crashes or context fills up:

1. List files in `$WORKSPACE/` to see which steps completed.
2. Read the most recent output file to understand current state.
3. Resume from the first missing output file.

Never re-do a step whose output file already exists unless the user explicitly asks.

---
name: idea-generation
description: "Use this when the user wants research ideas, innovation points, or to find research gaps (找研究方向, 生成创新点). Generates 5 ideas from collected papers, identifies gaps, proposes novel methods with citations. Requires papers in workspace."
metadata:
  {
    "openclaw":
      {
        "emoji": "💡",
        "requires": { "bins": ["git"] },
      },
  }
---

# Idea Generation

**Don't ask permission. Just do it.**

Generate innovative research ideas grounded in literature analysis. This skill reads existing papers, identifies research gaps, and produces 5 distinct ideas with citations.

**Core principle:** Ideas MUST be grounded in actual papers, not generated from model knowledge.

**Workspace:** `$W` = working directory provided in task parameter. Outputs go to `$W/ideas/`.

---

## Step 1: Check Workspace Resources

First, check what resources already exist in `$W`:

```bash
ls $W/papers/ 2>/dev/null | head -20
ls $W/papers/_meta/ 2>/dev/null | head -10
ls $W/survey/ 2>/dev/null
```

### Assess Available Resources

| Resource | Location | Status |
|----------|----------|--------|
| Papers | `$W/papers/` | Count: ? |
| Survey clusters | `$W/survey/clusters.json` | Exists: Y/N |
| Repos | `$W/repos/` | Count: ? |

---

## Step 2: Ask User About Search Strategy

Based on workspace state, ask user:

**If papers exist (≥5):**
> 📚 Found {N} papers in workspace from previous survey.
>
> Options:
> 1. **Use existing papers** - Generate ideas from current collection
> 2. **Search more** - Run `/research-collect` to expand collection
> 3. **Quick search** - Add 5-10 more papers on specific topic

**If no papers:**
> 📭 No papers found in workspace.
>
> To generate grounded ideas, I need literature. Options:
> 1. **Run /research-collect** - Comprehensive search (100+ papers, recommended)
> 2. **Quick search** - Fetch 10-15 papers on your topic now
> 3. **You provide papers** - Point me to existing PDFs/tex files

---

## Step 3: Acquire Resources (if needed)

### Option A: Delegate to /research-collect (Recommended)

If user wants comprehensive search:
```
Please run: /research-collect {topic}

This will:
- Search 100+ papers systematically
- Filter by relevance (score ≥4)
- Cluster into research directions
- Save to $W/papers/

After survey completes, run /idea-generation again.
```

### Option B: Quick Search (5-10 papers)

For fast iteration, do minimal search:

1. **ArXiv search:**
```
Tool: arxiv_search
Arguments:
  query: "{user_topic}"
  max_results: 10
```

2. **Clone 3-5 reference repos:**
```bash
mkdir -p $W/repos
git clone --depth 1 {repo_url} $W/repos/{name}
```

3. **Download paper sources:**
```bash
mkdir -p $W/papers/{arxiv_id}
curl -L "https://arxiv.org/src/{arxiv_id}" | tar -xz -C $W/papers/{arxiv_id}
```

---

## Step 4: Analyze Literature

**Prerequisites:** At least 5 papers in `$W/papers/`

### 4.1 Read Papers

For each paper, extract:
- Core contribution (1 sentence)
- Key method/formula
- Limitations mentioned
- Future work suggestions

**Long papers (>50KB):** See `references/reading-long-papers.md`

### 4.2 Identify Research Gaps

Look for:
- Common limitations across papers
- Unexplored technique combinations
- Scalability issues
- Assumptions that could be relaxed

Document gaps in `$W/ideas/gaps.md`:
```markdown
# Research Gaps Identified

## Gap 1: [Description]
- Mentioned in: [paper1], [paper2]
- Why important: ...

## Gap 2: [Description]
...
```

---

## Step 5: Generate 5 Ideas

Create `$W/ideas/idea_1.md` through `idea_5.md` using template in `references/idea-template.md`.

**Requirements:**
- Each idea cites ≥2 papers by arXiv ID
- Use different strategies:

| Idea | Strategy |
|------|----------|
| 1 | Combination - merge 2+ techniques |
| 2 | Simplification - reduce complexity |
| 3 | Generalization - extend to new domain |
| 4 | Constraint relaxation - remove assumption |
| 5 | Architecture innovation - new design |

**❌ REJECTED if:** No arXiv IDs cited, or ideas not grounded in literature

---

## Step 6: Select and Enhance Best Idea

### 6.1 Score All Ideas

| Idea | Novelty | Feasibility | Impact | Total |
|------|---------|-------------|--------|-------|
| 1 | /5 | /5 | /5 | /15 |
| ... | | | | |

### 6.2 Enhance Selected Idea

Create `$W/ideas/selected_idea.md` with:
- Detailed math (loss functions, gradients)
- Architecture choices
- Hyperparameters
- Implementation roadmap

### 6.3 (Optional but recommended) OpenReview Evidence Check

For the top 1-2 shortlisted ideas, validate novelty/positioning risk with `openreview_lookup`:

- Query using core title keywords or representative baseline paper title
- Extract evidence:
  - decision (if available)
  - average rating/confidence
  - reviewer weakness patterns
- Add a short "submission risk note" section per idea:
  - likely reviewer concern
  - mitigation experiment to add
  - positioning adjustment

Do not claim accept/reject predictions as facts. Report evidence-backed risk signals only.

---

## Step 7: Code Survey

Map idea concepts to reference implementations.

See `references/code-mapping.md` for template.

**Output:** `$W/ideas/implementation_report.md`

---

## Step 8: Summary

Create `$W/ideas/summary.md`:
- All 5 ideas with scores
- Selected idea details
- Next steps: `/research-pipeline` to implement

---

## Commands

| User Says | Action |
|-----------|--------|
| "Generate ideas for X" | Check workspace → ask strategy → generate |
| "I have papers, generate ideas" | Skip to Step 4 |
| "Enhance idea N" | Jump to Step 6 |
| "Map to code" | Jump to Step 7 |

---

## Integration

- **Before:** `/research-collect` to collect papers
- **After:** `/research-pipeline` to implement selected idea
- **Alternative:** `/write-review-paper` to write survey instead

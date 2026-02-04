---
name: idea-generation
description: "Generate innovative research ideas from a topic. SEARCHES arXiv/GitHub automatically, downloads papers, analyzes literature, and outputs 5 novel research ideas with arXiv citations. Use for: 找研究方向, 生成创新点, find research gaps, propose new methods. NOT for summarizing existing papers (use literature-review instead)."
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

End-to-end workflow for generating innovative research ideas from a research topic. This skill implements a full research idea generation pipeline:

1. Search papers and code repositories
2. Select and download references
3. Analyze literature and codebases
4. Generate multiple ideas
5. Select and enhance the best idea
6. Map to code implementations

---

## ⚠️ CRITICAL: EXECUTION MODE

**AUTONOMOUS EXECUTION**: Execute ALL steps without asking for user confirmation at each step.
- Do NOT ask "要我继续吗?" or "Should I proceed?"
- You MAY spawn subagents for parallel tasks (e.g., downloading multiple papers)
- Only ask user when there's a genuine ambiguity (e.g., which focus area to choose)
- Checkpoints are for YOUR internal verification, not for asking user

**Run the entire workflow from Step 1 to Step 8 automatically.**

---

## ⚠️ CRITICAL: MANDATORY TOOL USAGE

**DO NOT generate ideas from your own knowledge.** All ideas MUST be grounded in actual literature research.

### Blocking Requirements

1. **MUST call `arxiv` tool** to search papers - NO EXCEPTIONS
2. **MUST call `github_search` tool** to find repositories - NO EXCEPTIONS
3. **MUST write `search_results.md`** BEFORE proceeding to idea generation
4. **MUST reference specific papers** (with arXiv IDs) in generated ideas
5. **MUST clone actual repos** before code survey

### Anti-Pattern: DO NOT DO THIS

❌ User asks about "time series forecasting" → Agent immediately lists methods from memory
❌ Agent generates ideas without calling any search tools
❌ Agent skips to idea generation without `search_results.md` existing

### Correct Pattern: DO THIS

✅ User asks about "time series forecasting" → Agent calls `arxiv` tool with query
✅ Agent calls `github_search` tool to find implementations
✅ Agent writes search results to file
✅ Agent reads downloaded papers before generating ideas
✅ Ideas reference specific papers by arXiv ID

---

## Workspace Convention (Project-based)

**IMPORTANT**: Each research topic uses its own project directory. Agent auto-selects or creates projects.

```
~/.openclaw/workspace/
└── projects/
    ├── .active                   # Current project ID (plain text file)
    ├── nlp-summarization/        # Project A
    │   ├── project.json          # Project metadata
    │   ├── task.json             # Research task definition
    │   ├── search_results.md     # Search results
    │   ├── prepare_res.md        # Selected repos summary
    │   ├── papers/               # Downloaded papers
    │   ├── repos/                # Cloned repositories
    │   └── ideas/                # Generated ideas
    ├── image-segmentation/       # Project B
    │   └── ...
    └── ...
```

**All paths are project-relative**: `~/.openclaw/workspace/projects/{project_id}/`

**File existence = step completion.** Skip steps whose output already exists.

---

## Step 0: Auto Project Management (REQUIRED)

**Agent autonomously manages projects. DO NOT ask user for confirmation.**

### 0.1 Extract Topic from User Query

Analyze the user's message to identify the research topic. Examples:
- "帮我调研文本摘要方法" → topic: `text-summarization`
- "推荐系统的深度学习方法" → topic: `rec-deep-learning`
- "transformer attention optimization" → topic: `transformer-attention`

Convert to kebab-case ID: lowercase, spaces/special chars → hyphens.

### 0.2 Check Existing Projects

```bash
ls ~/.openclaw/workspace/projects/ 2>/dev/null | grep -v "^\.active$"
```

Read each `project.json` to check if topic matches:
```bash
cat ~/.openclaw/workspace/projects/*/project.json 2>/dev/null
```

### 0.3 Select or Create Project

**If matching project exists**: Use it, update `.active`
```bash
echo "{project_id}" > ~/.openclaw/workspace/projects/.active
```

**If no match**: Create new project
```bash
PROJECT_ID="{topic-as-kebab-case}"
mkdir -p ~/.openclaw/workspace/projects/$PROJECT_ID/{papers,repos,ideas}
echo "$PROJECT_ID" > ~/.openclaw/workspace/projects/.active

# Create project.json
cat > ~/.openclaw/workspace/projects/$PROJECT_ID/project.json << 'EOF'
{
  "id": "{project_id}",
  "name": "{Human readable name}",
  "created": "{ISO date}",
  "topics": ["{keyword1}", "{keyword2}"]
}
EOF
```

### 0.4 Set Working Paths

After project selection, ALL subsequent paths use:
```
WORKSPACE=~/.openclaw/workspace/projects/{project_id}
$WORKSPACE/task.json
$WORKSPACE/search_results.md
$WORKSPACE/papers/
$WORKSPACE/repos/
$WORKSPACE/ideas/
$WORKSPACE/prepare_res.md
```

**Log project selection** (inform user briefly):
> 📁 Using project: `{project_id}` ({new/existing})

---

## Step 1: Parse Task

Check `$WORKSPACE/task.json`. If missing, extract from user query:

- **domain**: Research domain (e.g., "graph neural networks", "recommendation")
- **focus** (optional): Specific problem or technique
- **date_limit** (optional): Only consider papers before this date

```bash
cat $WORKSPACE/task.json 2>/dev/null || echo "No task.json"
```

Create task.json:
```json
{
  "domain": "graph neural networks",
  "focus": "scalable transformers for node classification",
  "date_limit": "2024-01-01",
  "created": "2024-XX-XX"
}
```

**Output:** `$WORKSPACE/task.json`

---

## Step 2: Search Papers and Code (MANDATORY)

**⚠️ BLOCKING: You MUST complete this step before ANY idea generation.**

### 2.1 ArXiv Search (REQUIRED)

**You MUST call the `arxiv` tool.** Example:

```
Tool: arxiv
Arguments:
  query: "text summarization transformer model"
  max_results: 10
  sort_by: "relevance"
```

If `arxiv` tool is not available, use `WebSearch` with `site:arxiv.org`:
```
Tool: WebSearch
Arguments:
  query: "site:arxiv.org text summarization transformer model"
```

### 2.2 GitHub Search (REQUIRED)

**You MUST call the `github_search` tool or search GitHub.** Example:

```
Tool: github_search
Arguments:
  query: "text summarization pytorch huggingface"
  sort: "stars"
  max_results: 20
```

If `github_search` tool is not available, use `WebSearch`:
```
Tool: WebSearch
Arguments:
  query: "site:github.com text summarization pytorch stars:>100"
```

### 2.3 CHECKPOINT: Verify Search Completed

Before proceeding, confirm:
- [ ] Called arxiv/WebSearch for papers
- [ ] Called github_search/WebSearch for repositories
- [ ] Have at least 5 paper results
- [ ] Have at least 5 repository results

**If search returns 0 results, try different queries. DO NOT proceed without results.**

### 2.4 Compile Results

Write to `$WORKSPACE/search_results.md`:

```markdown
# Search Results

## Task
- Domain: {domain}
- Focus: {focus}
- Date: {date}

## ArXiv Papers Found

| # | Title | ArXiv ID | Year | Relevance |
|---|-------|----------|------|-----------|
| 1 | [Title](pdf_url) | 2401.xxxxx | 2024 | [Why relevant] |
| 2 | ... | ... | ... | ... |

## GitHub Repositories Found

| # | Repository | Stars | Language | Relevance |
|---|------------|-------|----------|-----------|
| 1 | [owner/repo](url) | 1.2k | Python | [Why relevant] |
| 2 | ... | ... | ... | ... |
```

**Output:** `$WORKSPACE/search_results.md`

---

## Step 3: Prepare - Select Repositories

Read search results and select **at least 5** most valuable repositories.

Selection criteria:
- Direct implementation of relevant papers
- High code quality (stars, documentation)
- Active maintenance
- Covers key techniques in the domain

### 3.1 Clone Selected Repos

```bash
mkdir -p $WORKSPACE/repos
cd $WORKSPACE/repos

# For each selected repo:
git clone --depth 1 https://github.com/owner/repo1.git
git clone --depth 1 https://github.com/owner/repo2.git
# ... at least 5 repos
```

### 3.2 Document Selection

Write to `$WORKSPACE/prepare_res.md`:

```markdown
# Selected Reference Codebases

## Selection Rationale
[Why these repos were chosen]

## Repositories

### 1. repo1
- **URL**: https://github.com/owner/repo1
- **Paper**: [Associated paper if any]
- **Key Components**:
  - `model/` - Model architecture
  - `train.py` - Training loop
- **Usage**: [How this will help implement our idea]

### 2. repo2
...

## Reference Papers
Based on these repos, the key papers to read are:
1. [Paper Title 1] - ArXiv: 2401.xxxxx
2. [Paper Title 2] - ArXiv: 2401.xxxxx
...
```

**Output:** `$WORKSPACE/prepare_res.md` + `$WORKSPACE/repos/`

---

## Step 4: Download Papers

For each paper referenced in prepare_res.md, download the source.

**IMPORTANT: Download .tex source, NOT PDF.** .tex files are much easier for AI to read and extract information from.

### 4.1 Download .tex Source (RECOMMENDED - Use arxiv tool)

Use the `arxiv` tool with `download: true` to automatically download and extract .tex sources:

```
Tool: arxiv
Arguments:
  query: "abstractive summarization long document"
  max_results: 10
  download: true
  output_dir: "$WORKSPACE/papers"
```

The tool will:
1. Search for papers matching your query
2. Download .tex source from `https://arxiv.org/src/{arxiv_id}`
3. Extract tar.gz archives automatically
4. Fall back to PDF if .tex is unavailable
5. Return a `downloads` array showing what was downloaded

**Output format:**
```json
{
  "papers": [...],
  "downloads": [
    {"arxiv_id": "2404.04429", "format": "tex", "files": ["main.tex", "methods.tex"]},
    {"arxiv_id": "2308.03664", "format": "pdf", "files": ["2308.03664.pdf"], "error": "tex unavailable"}
  ],
  "output_dir": "$WORKSPACE/papers"
}
```

### 4.2 Manual Download (Fallback)

If the arxiv tool is unavailable, use bash:
```bash
mkdir -p $WORKSPACE/papers/{arxiv_id}
cd $WORKSPACE/papers/{arxiv_id}
curl -L "https://arxiv.org/src/{arxiv_id}" -o source.tar.gz
tar -xzf source.tar.gz 2>/dev/null || mv source.tar.gz main.tex
```

### 4.3 Document Downloads

Write to `$WORKSPACE/papers/download_log.md`:

```markdown
# Downloaded Papers

| ArXiv ID | Title | Format | Status |
|----------|-------|--------|--------|
| 2404.04429 | Physics-Informed ML for Battery... | .tex | ✓ |
| 2308.03664 | Two-stage Early Prediction... | .tex | ✓ |
| 2401.99999 | Some Other Paper | .pdf | ✓ (tex unavailable) |
```

**Output:** `$WORKSPACE/papers/`

---

## Step 5: Generate Ideas (5 Ideas)

**⚠️ BLOCKING: DO NOT start this step unless Steps 2-4 are complete.**

### Pre-requisite Checkpoint

Before generating ANY ideas, verify these files exist:
- [ ] `$WORKSPACE/search_results.md` - search results from Step 2
- [ ] `$WORKSPACE/prepare_res.md` - selected repos from Step 3
- [ ] At least 3 papers downloaded in `$WORKSPACE/papers/`

**If any file is missing, GO BACK and complete the previous steps.**

This is the core intellectual step. Generate **exactly 5 distinct innovative ideas**.

**IMPORTANT: Ideas must be grounded in the literature you just read. Each idea MUST:**
- Reference at least 2 specific papers by arXiv ID
- Identify specific limitations from those papers
- Propose improvements based on gaps found in the literature

### 5.1 Analyze Literature First (REQUIRED)

For each paper in `papers/`:
1. Read thoroughly (especially: abstract, method, experiments, limitations)
2. Extract: core contribution, math formulas, limitations, future work
3. Note connections to other papers

**⚠️ Handling Long Papers (>50KB or >15k tokens):**

If a .tex file is too long to read in one pass:

1. **First pass - Structure scan:**
   ```bash
   # List all .tex files and their sizes
   ls -la $WORKSPACE/papers/{arxiv_id}/
   # Check line count
   wc -l $WORKSPACE/papers/{arxiv_id}/*.tex
   ```

2. **Chunked reading strategy:**
   - Read `abstract` section first (usually in main.tex, first 200 lines)
   - Read `\section{Introduction}` or `\section{Method}` separately
   - Read `\section{Experiments}` or `\section{Results}` separately
   - Read `\section{Conclusion}` and `\section{Related Work}` last

   Use the Read tool with `offset` and `limit` parameters:
   ```
   Tool: Read
   Arguments:
     file_path: "$WORKSPACE/papers/2404.04429/main.tex"
     offset: 1
     limit: 500    # First 500 lines (abstract + intro)
   ```

   Then continue:
   ```
   Tool: Read
   Arguments:
     file_path: "$WORKSPACE/papers/2404.04429/main.tex"
     offset: 500
     limit: 500    # Lines 500-1000 (method section)
   ```

3. **Priority sections for idea generation:**
   | Priority | Section | Why |
   |----------|---------|-----|
   | 1 | Abstract | Core contribution |
   | 2 | Method/Approach | Technical details, formulas |
   | 3 | Experiments | What works, what doesn't |
   | 4 | Conclusion/Future Work | Limitations, open problems |
   | 5 | Related Work | Connections to other papers |

4. **Skip if context-limited:**
   - Appendix (proofs, supplementary)
   - Acknowledgments
   - Detailed hyperparameter tables

For each repo in `repos/`:
1. Understand structure: `gen_code_tree_structure` equivalent
2. Identify key implementations
3. Note reusable components

### 5.2 Identify Research Gaps

Look for:
- Common limitations across papers
- Unexplored combinations of techniques
- Scalability issues
- Assumptions that could be relaxed

### 5.3 Generate Idea 1

Create `$WORKSPACE/ideas/idea_1.md` using the template in `references/idea-template.md`.

**MUST include (with actual citations from your research):**
- One-line summary
- Challenges addressed
- **Existing methods & limitations (cite specific papers by arXiv ID)**
  - Example: "Method A [arXiv:2301.12345] achieves X but fails at Y"
  - Example: "Method B [arXiv:2302.67890] proposes Z but has limitation W"
- Motivation (why this gap matters)
- Proposed method (with math formulas)
- **How this improves on cited papers**
- Expected advantages
- Evaluation plan (datasets, baselines from the papers you read)
- Novelty/Feasibility/Impact scores

**❌ REJECTED if:** No arXiv IDs cited, or ideas not connected to searched literature

### 5.4 Generate Ideas 2-5

For each subsequent idea, explicitly try a **different strategy**:

| Idea | Strategy |
|------|----------|
| 1 | Combination - merge techniques from 2+ papers |
| 2 | Simplification - simplify complex method |
| 3 | Generalization - extend to new domain/task |
| 4 | Constraint relaxation - remove limiting assumption |
| 5 | Architecture innovation - novel model design |

Create `idea_2.md`, `idea_3.md`, `idea_4.md`, `idea_5.md`.

**Output:** `$WORKSPACE/ideas/idea_1.md` through `idea_5.md`

---

## Step 6: Select and Enhance Best Idea

### 6.1 Evaluate All Ideas

Create evaluation matrix:

```markdown
# Idea Evaluation

| Idea | Title | Novelty | Feasibility | Impact | Total |
|------|-------|---------|-------------|--------|-------|
| 1 | ... | 4 | 3 | 4 | 11 |
| 2 | ... | 5 | 4 | 5 | 14 |
| 3 | ... | 3 | 5 | 3 | 11 |
| 4 | ... | 4 | 4 | 4 | 12 |
| 5 | ... | 3 | 3 | 4 | 10 |

**Selected: Idea 2**

## Selection Rationale
[Why this idea is most promising - technical innovation, feasibility, impact]
```

### 6.2 Enhance Selected Idea

Take the winning idea and create `$WORKSPACE/ideas/selected_idea.md`:

**Enhancements to add:**
1. More detailed math formulations (complete loss functions, gradients)
2. Specific architecture choices (layer sizes, activations)
3. Hyperparameter recommendations
4. Implementation roadmap
5. Potential failure modes and mitigations
6. Detailed experiment design

**Output:** `$WORKSPACE/ideas/selected_idea.md`

---

## Step 7: Code Survey - Map Idea to Implementations

This step bridges theory and code. For each **atomic concept** in the selected idea, find corresponding implementations in the reference repos.

### 7.1 Extract Atomic Concepts

From selected_idea.md, list all concepts needing implementation:

```markdown
## Atomic Concepts to Implement

1. Multi-head Self-Attention
2. Graph Message Passing
3. Energy-based Diffusion
4. Adaptive Diffusivity Function
5. ...
```

### 7.2 Survey Codebases

For each concept:

1. Search repos for relevant code:
   ```bash
   grep -r "class.*Attention" $WORKSPACE/repos/
   grep -r "def forward" $WORKSPACE/repos/
   ```

2. Read and understand the implementation

3. Document the mapping

### 7.3 Create Implementation Report

Write to `$WORKSPACE/ideas/implementation_report.md`:

```markdown
# Implementation Report

## Selected Idea Summary
[One paragraph summary]

## Concept-to-Code Mapping

### Concept 1: Multi-head Self-Attention

**Math Formula:**
$$
\text{Attention}(Q,K,V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V
$$

**Reference Implementation:**
- File: `repos/transformer/attention.py`
- Class: `MultiHeadAttention`
- Key code:
```python
class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, n_heads):
        self.d_k = d_model // n_heads
        self.W_q = nn.Linear(d_model, d_model)
        # ...

    def forward(self, x):
        Q = self.W_q(x)
        # ...
```

**Adaptation needed:**
- [What to modify for our idea]

---

### Concept 2: Graph Message Passing
...

---

## Implementation Roadmap

1. [ ] Start with Concept X (foundational)
2. [ ] Build Concept Y on top
3. [ ] Integrate with Concept Z
4. [ ] Add training loop from repo W

## Recommended Starting Point
[Which repo to fork/use as base]
```

**Output:** `$WORKSPACE/ideas/implementation_report.md`

---

## Step 8: Final Summary

Create `$WORKSPACE/ideas/summary.md`:

```markdown
# Research Idea Generation Report

## Task
- Domain: {domain}
- Focus: {focus}
- Date: {date}

## Resources Gathered
- Papers analyzed: X
- Repositories cloned: Y
- Key techniques identified: Z

## Ideas Generated
1. **[Idea 1 title]** - Score: 11
2. **[Idea 2 title]** - Score: 14 ⭐ SELECTED
3. **[Idea 3 title]** - Score: 11
4. **[Idea 4 title]** - Score: 12
5. **[Idea 5 title]** - Score: 10

## Selected Idea
**{Title}**

{One paragraph description}

### Key Innovation
{What makes this novel}

### Implementation Ready
- Math formulas: ✓ Complete
- Code references: ✓ Mapped
- Evaluation plan: ✓ Defined

## Next Steps
1. Run `/research-pipeline` with `selected_idea.md` as input
2. Or manually implement following `implementation_report.md`

## Files Generated
- `task.json` - Task definition
- `search_results.md` - Search results
- `prepare_res.md` - Selected repos
- `ideas/idea_*.md` - 5 generated ideas
- `ideas/selected_idea.md` - Enhanced best idea
- `ideas/implementation_report.md` - Code mapping
```

**Output:** `$WORKSPACE/ideas/summary.md`

---

## Quality Checklist

Before completing, verify:

- [ ] At least 5 repos cloned in `repos/`
- [ ] At least 3 papers downloaded in `papers/`
- [ ] All 5 ideas are substantially different
- [ ] Selected idea has complete math formulations
- [ ] Implementation report covers ALL atomic concepts
- [ ] Each concept has actual code reference (not placeholder)
- [ ] Evaluation plan has specific datasets and metrics

---

## Integration with Other Skills

**After idea-generation:**
```
/research-pipeline  → Implement the selected idea
```

**To gather more resources:**
```
/arxiv "specific topic"     → Search more papers
/literature-review          → Deep dive into papers
```

---

## Commands

| User Says | Action |
|-----------|--------|
| "Generate research ideas for NLP" | Full workflow (Steps 1-8) |
| "Search papers on X" | Steps 1-2 only |
| "I have papers, generate ideas" | Skip to Step 5 |
| "Enhance this idea: ..." | Skip to Step 6-7 |
| "Map this idea to code" | Step 7 only |

---

## Batch Processing Rule

If more than 10 papers/repos to analyze:
1. First pass: Quick scan all (abstract/README only)
2. Select top 5-7 for deep analysis
3. Generate ideas from deep analysis

Do NOT process all resources with full detail - context will overflow.

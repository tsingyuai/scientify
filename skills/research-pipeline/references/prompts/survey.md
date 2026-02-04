# Literature Survey Guide

You are performing a literature survey to bridge theory and implementation. Your goal is to extract actionable knowledge from papers and codebases that will directly inform the implementation.

## Process

### Phase 1: Decompose the Idea

Before reading any papers, break the research idea (from `task.json`) into **atomic academic definitions**. Each atomic definition must be:

- A single, self-contained concept (e.g., "multi-head attention", "contrastive loss", "graph convolution").
- Have clear mathematical foundations.
- Be implementable as a code module.
- Be traceable to specific papers.

Write down your list of atomic definitions before proceeding. This ensures systematic coverage.

### Phase 2: Paper Reading (per paper)

For each paper in `workspace/papers/`:

1. **Skim first**: Read title, abstract, introduction, and conclusion to understand the paper's scope.
2. **Targeted reading**: For each atomic definition relevant to this paper, find:
   - The formal definition (usually in a "Method" or "Approach" section).
   - Mathematical formulas (equations, loss functions, update rules).
   - Key theoretical claims or properties.
3. **Search strategically**: Use keyword search within the .tex file. Look for `\begin{equation}`, `\mathcal`, `\text{loss}`, etc.

### Phase 3: Code Reading (per repo)

For each reference codebase in `workspace/repos/`:

1. **Understand structure**: List the directory tree first.
2. **Find implementations**: Map each mathematical formula to its code implementation:
   - Model architecture classes → model definition formulas
   - Loss function implementations → loss formulas
   - Data processing pipelines → input/output specifications
3. **Document the mapping**: For each formula, note the exact file, class, and function that implements it.

### Phase 4: Write Notes

For each paper, create `workspace/notes/paper_NNN.md` with this structure:

```markdown
# [Paper Title]
ArXiv: [id] | Authors: [first author et al.]

## Core Method
[1-2 paragraph summary of the paper's main contribution]

## Atomic Definitions Covered
[List which atomic definitions from Phase 1 this paper addresses]

## Math Formulas

### [Definition Name 1]
$$formula$$
- Variables: [explain each variable]
- Context: [when/where this is applied]

### [Definition Name 2]
...

## Code Implementation

### [Definition Name 1]
- **Repo**: repos/[name]
- **File**: path/to/file.py, class ClassName, method method_name
- **Key logic**:
```python
# Excerpt of the most relevant 10-30 lines
```
- **Notes**: [any adaptations, simplifications, or deviations from the paper]

## Key Insights
- [Insight 1: anything surprising or important for implementation]
- [Insight 2: ...]
```

### Phase 5: Synthesize

After all papers are surveyed, write `workspace/survey_res.md`:

```markdown
# Literature Survey: [Research Idea]

## Atomic Definitions
[Complete list with brief descriptions]

## Theory-to-Code Mapping
[For each atomic definition: the formula, which papers define it, which repos implement it, and the recommended implementation approach]

## Implementation Recommendations
[Which reference implementations to adapt, potential pitfalls, suggested architecture]

## Open Questions
[Anything unclear that may need user input]
```

## Quality Criteria

- Every atomic definition must appear in at least one paper note.
- Every formula must have a corresponding code reference (or be flagged as "no reference found").
- Do not skip papers. If a paper is not relevant, note why and move on.
- Err on the side of extracting more detail rather than less. The implementation step depends on this survey.

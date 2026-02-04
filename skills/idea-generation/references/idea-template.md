# Idea Template

Use this template for each idea in `~/.openclaw/workspace/ideas/`.

---

# Idea N: [Short Descriptive Title]

## One-Line Summary

[A single sentence that captures the core innovation. Should be understandable without context.]

---

## Challenges Addressed

What problems in the current research landscape does this idea solve?

- **[Challenge 1]**: [Brief description of the technical limitation]
- **[Challenge 2]**: [Brief description of unsolved problem]
- **[Challenge 3]**: [Brief description of key bottleneck]

---

## Existing Methods & Their Limitations

| Method | Paper/Source | Strength | Weakness This Idea Addresses |
|--------|--------------|----------|------------------------------|
| [Method A] | [Citation] | [What it does well] | [Limitation] |
| [Method B] | [Citation] | [What it does well] | [Limitation] |
| [Method C] | [Citation] | [What it does well] | [Limitation] |

---

## Motivation

### Why is this problem important?

[Explain the significance of solving this problem. Who benefits? What applications are enabled?]

### What gap does this fill?

[Describe the specific research gap this idea addresses. Reference the limitations above.]

### Potential impact

[Quantify if possible: "Could improve X metric by Y%" or "Enables new application Z"]

---

## Proposed Method

### Core Insight

[2-3 sentences describing the key innovation. What is the "aha" moment?]

### Technical Approach

**Overview:**

[1 paragraph high-level description]

**Step-by-step methodology:**

1. **[Step 1 Name]**: [Description]
   - Input: [what this step takes]
   - Output: [what this step produces]
   - Key operation: [main computation]

2. **[Step 2 Name]**: [Description]
   - Input: ...
   - Output: ...
   - Key operation: ...

3. **[Step 3 Name]**: [Description]
   - ...

### Mathematical Formulation

**Problem Setup:**

Let $X \in \mathbb{R}^{n \times d}$ denote [description]...

**Core Equations:**

```latex
% Main loss function
\mathcal{L} = \mathcal{L}_{task} + \lambda \mathcal{L}_{reg}

% Where task loss is:
\mathcal{L}_{task} = ...

% And regularization term is:
\mathcal{L}_{reg} = ...
```

**Key derivations (if applicable):**

[Show important mathematical steps that justify the approach]

### Architecture / Algorithm

```
Algorithm: [Name]
Input: [inputs]
Output: [outputs]

1. Initialize [parameters]
2. For each [iteration]:
   a. Compute [something]
   b. Update [something]
3. Return [result]
```

Or for neural architectures:

```
[Input] → [Layer 1] → [Layer 2] → ... → [Output]
         (dim: ...)   (dim: ...)         (dim: ...)
```

---

## Expected Advantages

Why should this approach work better than existing methods?

- **[Advantage 1]**: [Explanation with reasoning]
- **[Advantage 2]**: [Explanation with reasoning]
- **[Advantage 3]**: [Explanation with reasoning]

**Theoretical justification (if applicable):**

[Brief argument for why this should work]

---

## Potential Challenges

What could go wrong? How to mitigate?

| Challenge | Risk Level | Mitigation Strategy |
|-----------|------------|---------------------|
| [Challenge 1] | High/Med/Low | [How to address] |
| [Challenge 2] | High/Med/Low | [How to address] |
| [Challenge 3] | High/Med/Low | [How to address] |

---

## Evaluation Plan

### Datasets

| Dataset | Task | Size | Why Chosen |
|---------|------|------|------------|
| [Dataset 1] | [Task] | [Size] | [Reason] |
| [Dataset 2] | [Task] | [Size] | [Reason] |

### Baselines

| Method | Paper | Why Compare |
|--------|-------|-------------|
| [Baseline 1] | [Citation] | [Reason] |
| [Baseline 2] | [Citation] | [Reason] |

### Metrics

| Metric | Description | Expected Improvement |
|--------|-------------|---------------------|
| [Metric 1] | [What it measures] | [X% over baseline] |
| [Metric 2] | [What it measures] | [Y% over baseline] |

### Ablation Studies

What components to ablate to understand contribution?

1. [Component 1]: Remove/replace to test [hypothesis]
2. [Component 2]: Remove/replace to test [hypothesis]

---

## Scores

| Criterion | Score (1-5) | Justification |
|-----------|-------------|---------------|
| **Novelty** | [X] | [Why this score] |
| **Feasibility** | [X] | [Why this score] |
| **Impact** | [X] | [Why this score] |
| **Total** | [Sum] | |

---

## Implementation Notes

### Recommended Libraries

- [Library 1]: For [purpose]
- [Library 2]: For [purpose]

### Reference Code

- [Repo 1](URL): [What to reference]
- [Repo 2](URL): [What to reference]

### Estimated Effort

- Model implementation: [X days]
- Data pipeline: [X days]
- Training & evaluation: [X days]
- Total: [X days]

---

## Related Ideas

- **Idea [M]**: [How it relates - could be combined? alternative approach?]
- **Future extension**: [What could come next after this idea]

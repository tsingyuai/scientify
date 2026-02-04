# Implementation Planning Guide

You are creating a detailed, actionable implementation plan. This plan must be specific enough that the implementation step can follow it without ambiguity.

## Prerequisites

Before planning, you must have:

- `workspace/task.json` — the research idea
- `workspace/survey_res.md` — the literature survey with theory-to-code mappings
- `workspace/prepare_res.md` — selected reference repositories

Read ALL of these files thoroughly before writing the plan. Also browse the reference codebases in `workspace/repos/` to understand their structure and reusable components.

## Plan Structure

The plan has four mandatory sections. Write all four to `workspace/plan_res.md`.

### 1. Dataset Plan

```markdown
## Dataset Plan

### Data Source
- Dataset name and where to obtain it
- Size and format
- Any preprocessing requirements

### Data Loading Pipeline
1. **Read**: How to load raw data (file format, library to use)
2. **Preprocess**: Transformations, tokenization, normalization, feature extraction
3. **DataLoader**: Batch construction, sampling strategy, collate function

### Data Splits
- Train/validation/test split ratios
- Any special handling (e.g., cold-start users, temporal splits)
```

Refer to the reference codebases for data loading patterns. Cite specific files: "See `repos/xyz/data/loader.py` for the graph construction approach."

### 2. Model Plan

```markdown
## Model Plan

### Architecture Overview
[High-level description of the model architecture]

### Components (one per atomic definition)

#### [Atomic Definition 1]
- **Math**: $formula$
- **Implementation**: Class name, input/output shapes, key methods
- **Reference**: repos/xyz/model/attention.py, class MultiHeadAttention
- **Adaptation notes**: [What to change from the reference]

#### [Atomic Definition 2]
...

### Forward Pass
[Step-by-step description of the forward pass, connecting all components]

### Parameter Count Estimate
[Rough estimate to sanity-check the architecture]
```

Every atomic definition from `survey_res.md` must appear as a component. If a definition doesn't map to a model component, explain why.

### 3. Training Plan

```markdown
## Training Plan

### Loss Function
- Formula: $L = ...$
- Components: [list each loss term and its purpose]
- Reference: repos/xyz/training/loss.py

### Optimizer
- Algorithm: [Adam, AdamW, SGD, etc.]
- Learning rate: [value] with [schedule: cosine, step, warmup, etc.]
- Weight decay: [value]

### Hyperparameters
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Batch size | ... | ... |
| Hidden dim | ... | ... |
| Num layers | ... | ... |
| Dropout | ... | ... |

### Training Loop
1. Forward pass
2. Compute loss
3. Backward pass
4. Gradient clipping (if applicable)
5. Optimizer step
6. Logging (every N steps)
7. Validation (every M epochs)

### Quick Validation
- Epochs: 2 (for initial validation)
- Expected behavior: loss should decrease, no NaN/Inf

### Full Training
- Epochs: [value from reference papers]
- Early stopping: [criteria]
- Checkpoint: save best model by validation metric
```

### 4. Testing Plan

```markdown
## Testing Plan

### Metrics
- Primary: [e.g., NDCG@10, BLEU, F1]
- Secondary: [e.g., Recall@20, Hit Rate]
- Reference: repos/xyz/evaluation/metrics.py

### Evaluation Protocol
1. Load best checkpoint
2. Run inference on test set
3. Compute metrics
4. Compare against baselines (from papers)

### Baselines
| Method | Metric | Value | Source |
|--------|--------|-------|--------|
| ... | ... | ... | [paper] |

### Expected Results
[Reasonable range for the proposed method based on paper claims]
```

## Quality Criteria

- Every section must reference specific files from `workspace/repos/` where applicable.
- Hyperparameter values should come from reference papers or standard practice, not guesses.
- The plan must be implementable end-to-end without additional research.
- If any information is missing (e.g., dataset not publicly available), flag it explicitly.
- Do not over-engineer: plan what's needed for a solid implementation, not a production system.

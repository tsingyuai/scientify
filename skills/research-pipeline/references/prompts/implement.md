# Implementation Guide

You are implementing an ML research project based on the plan in `workspace/plan_res.md`. The goal is a self-contained, runnable codebase in `workspace/project/`.

## Core Principles

### 1. Self-Contained Project

ALL code must reside within `workspace/project/`. No direct imports from `workspace/repos/`. Reference code should be studied, understood, and rewritten to fit the project's architecture.

When adapting reference code:

- Understand the core logic and algorithm, not just copy the syntax.
- Rewrite to fit consistent naming conventions and coding style.
- Document the origin: add a comment like `# Adapted from repos/xyz/model/attention.py`.
- Include all necessary utility functions — do not rely on external helpers.

### 2. Follow the Plan Exactly

Implement every component listed in `workspace/plan_res.md`:

- Every atomic definition from the Model Plan becomes a class or module.
- The dataset pipeline matches the Dataset Plan.
- The loss function matches the Training Plan formula.
- The evaluation matches the Testing Plan metrics.

Do not skip components. Do not substitute simpler alternatives. If a component seems wrong, flag it rather than silently changing it.

### 3. Real Data, Not Toy Data

Use the actual datasets specified in the plan. If the dataset requires downloading, write the download logic. Never substitute with random data or tiny synthetic datasets for the implementation (the quick validation uses real data with 2 epochs, not fake data).

## Project Structure

```
workspace/project/
  model/
    __init__.py
    [component files matching Model Plan]
  data/
    __init__.py
    dataset.py       # Dataset class
    loader.py         # DataLoader configuration
    preprocess.py     # Preprocessing logic
  training/
    __init__.py
    trainer.py        # Training loop
    loss.py           # Loss functions
  testing/
    __init__.py
    evaluator.py      # Evaluation logic
    metrics.py        # Metric implementations
  utils/
    __init__.py
    [shared utilities]
  run.py              # Main entry point
  requirements.txt    # All dependencies with versions
  README.md           # Brief description of the project
```

## Implementation Sequence

Follow this order to catch issues early:

1. **requirements.txt**: List all dependencies. Pin major versions.
2. **Data pipeline**: Implement dataset loading first. Verify with a small print test.
3. **Model architecture**: Implement each component. Verify shapes with dummy input.
4. **Loss function**: Implement and verify with dummy predictions.
5. **Training loop**: Wire everything together. Include logging.
6. **Evaluation**: Implement metrics and test evaluation pipeline.
7. **run.py**: Main entry point with argument parsing.

After each step, run a quick sanity check before moving on.

## Quick Validation Run

The first run uses 2 epochs only:

```bash
cd workspace/project
pip install -r requirements.txt
python run.py --epochs 2
```

Expected outcomes:
- No import errors or missing dependencies.
- Loss decreases (even slightly) over 2 epochs.
- No NaN or Inf in loss or gradients.
- Evaluation metrics produce reasonable (not necessarily good) numbers.
- Memory usage stays within limits.

If the run fails, debug and fix before reporting. Common issues:
- Shape mismatches: print tensor shapes at each step.
- OOM: reduce batch size or model size for validation.
- Data loading errors: verify file paths and formats.

## Debugging Tips

- Add `print(f"tensor.shape = {tensor.shape}")` at critical points during initial debugging.
- Use `torch.autograd.set_detect_anomaly(True)` to catch gradient issues.
- If training is unstable, check learning rate and gradient norms.
- Remove debugging prints before the final version.

## Implementation Report

After the quick validation succeeds, write `workspace/ml_res.md`:

```markdown
# Implementation Report

## Components Implemented
- [List each module with brief description]

## Quick Validation Results
- Epochs: 2
- Final training loss: [value]
- Validation metrics: [values]
- Runtime: [time]
- GPU memory: [peak usage]

## Deviations from Plan
- [Any changes made and why]

## Known Issues
- [Any issues encountered]
```

## Rules

1. Never import from `workspace/repos/` — adapt and rewrite instead.
2. Never use toy/synthetic data — use real datasets from the plan.
3. Never skip plan components — implement everything or flag the issue.
4. Always validate with 2 epochs before declaring success.
5. Always write `requirements.txt` with pinned versions.
6. If you cannot resolve an issue after 3 attempts, document the problem and ask the user.

# Code Review Guide

You are reviewing the implementation in `workspace/project/` to verify it correctly implements the research idea. This is a quality gate before full training.

## Review Process

### Phase 1: Verify Against Survey

Read `workspace/survey_res.md` and extract the list of atomic definitions. For each atomic definition:

1. Find the corresponding code in `workspace/project/`.
2. Compare the code implementation against the mathematical formula.
3. Check: does the code faithfully implement the math? Watch for:
   - Missing terms in equations.
   - Incorrect tensor operations (e.g., sum vs mean, wrong axis).
   - Hardcoded values where parameters should be used.
   - Simplifications that change the method's behavior.

### Phase 2: Verify Against Plan

Read `workspace/plan_res.md`. Check each section:

**Dataset Plan:**
- Is the correct dataset used (not a substitute)?
- Does the preprocessing match the plan?
- Is the DataLoader configured correctly (batch size, sampling)?

**Model Plan:**
- Are all components present?
- Does the forward pass match the described architecture?
- Are parameter counts reasonable?

**Training Plan:**
- Is the loss function correct (all terms present, correct weighting)?
- Is the optimizer configured as planned?
- Are hyperparameters matching?

**Testing Plan:**
- Are the correct metrics implemented?
- Is the evaluation protocol correct?

### Phase 3: Code Quality

Check for implementation quality issues:

- **Not a toy**: The implementation should be substantive, not a simplified stub.
- **Correctness**: No obvious bugs (wrong indices, missing gradients, data leakage).
- **Completeness**: All imports resolved, all functions implemented (no `pass` or `TODO`).
- **Runnability**: The code should run end-to-end without errors.

### Phase 4: Cross-Reference with Codebases

If needed, compare against reference codebases in `workspace/repos/`:

- Are key algorithmic patterns correctly adapted?
- Were critical implementation details preserved during adaptation?

## Review Output

Write the review to `workspace/iterations/judge_vN.md` (increment N for each review iteration):

```markdown
# Review vN

## Verdict: PASS / NEEDS_REVISION

## Atomic Definition Checklist

| Definition | Implemented | Correct | Notes |
|-----------|-------------|---------|-------|
| [def 1] | Yes/No | Yes/No | [details] |
| [def 2] | Yes/No | Yes/No | [details] |
| ... | ... | ... | ... |

## Plan Compliance

| Section | Status | Notes |
|---------|--------|-------|
| Dataset | OK / Issue | ... |
| Model | OK / Issue | ... |
| Training | OK / Issue | ... |
| Testing | OK / Issue | ... |

## Issues (if NEEDS_REVISION)

### Issue 1: [Title]
- **Location**: `project/model/attention.py`, line ~42
- **Problem**: [Description of what's wrong]
- **Expected**: [What the correct implementation should do]
- **Suggestion**: [Specific fix]

### Issue 2: [Title]
...

## Summary
[Brief overall assessment: what's good, what needs work]
```

## Verdict Criteria

**PASS** if:
- All atomic definitions are implemented and correct.
- All plan sections are satisfied.
- Code runs end-to-end with decreasing loss.
- No critical bugs.

**NEEDS_REVISION** if:
- Any atomic definition is missing or incorrectly implemented.
- Any plan section has significant gaps.
- Code has bugs that prevent correct execution.
- Implementation is a toy/stub rather than a genuine attempt.

## Iteration Rules

- Each review is independent: re-evaluate everything, not just previously flagged issues.
- Be specific in suggestions: cite file names, line numbers, and concrete fixes.
- After 3 iterations of NEEDS_REVISION, escalate to the user with a summary of remaining issues.
- Never approve code that doesn't run or produces NaN/Inf.

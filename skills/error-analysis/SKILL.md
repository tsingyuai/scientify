---
name: error-analysis
description: "Use this when experiment results exist but the project still lacks a structured analysis of failure cases, bad buckets, and likely causes."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔎",
      },
  }
---

# Error Analysis

**Don't ask permission. Just do it.**

Use this skill after experiments when the team needs to understand where the model fails, not just how often.

Outputs go to the workspace root.

## Use This When

- `experiment_res.md` exists
- predictions, logs, or representative outputs are available
- the project needs targeted follow-up experiments instead of only aggregate scores

## Do Not Use This When

- there are no experiment results yet
- there are no outputs or examples to inspect

## Required Inputs

- `experiment_res.md`
- prediction logs, generated outputs, or sample artifacts when available
- `paper/claim_inventory.md` when available

If `experiment_res.md` is missing, stop and say: `Run /research-experiment first to generate experiment results.`

## Required Output

- `error_analysis.md`

## Workflow

### Step 1: Read the Current Result Story

Read:

- `experiment_res.md`
- prediction or output artifacts when present
- `paper/claim_inventory.md` when present

Extract:

- headline wins
- weak spots
- suspicious gaps between aggregate metrics and actual behavior

### Step 2: Build Failure Buckets

Group failures by the most informative structure available, for example:

- class or label
- length or difficulty
- source or domain
- prompt type
- retrieval quality
- latency or resource regime

### Step 3: Find Actionable Causes

For each major bucket, identify:

- what the failure looks like
- what likely causes it
- what follow-up experiment could test that cause

### Step 4: Write `error_analysis.md`

Use `references/error-analysis-template.md`.

The report must include:

- failure buckets
- representative examples
- likely causes
- recommended next experiments

## Rules

1. Do not repeat aggregate metrics as if they were analysis.
2. Every failure bucket must point to concrete evidence.
3. Prefer actionable causes over broad speculation.

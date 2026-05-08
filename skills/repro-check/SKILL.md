---
name: repro-check
description: "Use this when a project needs a reproducibility check across code, environment, commands, seeds, and artifact paths before sharing results."
metadata:
  {
    "openclaw":
      {
        "emoji": "♻️",
        "requires": { "bins": ["python3", "uv"] },
      },
  }
---

# Repro Check

**Don't ask permission. Just do it.**

Use this skill before sharing results or making strong claims about repeatability.

Outputs go to the workspace root.

## Use This When

- `ml_res.md` or `experiment_res.md` exists
- the team needs confidence that a clean rerun is possible

## Do Not Use This When

- implementation has not been executed yet
- there is no runnable code or command surface to inspect

## Required Inputs

- `plan_res.md`
- `ml_res.md` and/or `experiment_res.md`
- `project/`
- run commands, configs, and environment notes when available

If both `ml_res.md` and `experiment_res.md` are missing, stop and say: `Run /research-implement or /research-experiment first to generate executable results.`

## Required Output

- `repro_check.md`

## Workflow

### Step 1: Read the Execution Contract

Read:

- `plan_res.md`
- `ml_res.md`
- `experiment_res.md`
- runnable scripts and config files under `project/`

Extract:

- entry command
- config source
- seed handling
- environment assumptions
- data paths
- output paths

### Step 2: Audit Reproducibility Surface

Check:

- whether a clean rerun command is obvious
- whether the environment is declared enough to recreate
- whether seeds are named
- whether data paths are explicit
- whether outputs map cleanly to the claimed results

### Step 3: Decide Reproduction Status

Return one of:

- `PASS`
- `PARTIAL`
- `BLOCKED`

### Step 4: Write `repro_check.md`

Use `references/repro-check-template.md`.

The report must include:

- rerun command
- missing prerequisites
- exact blockers
- reproducibility verdict
- next step

## Rules

1. Missing seed or missing command is never a full pass.
2. Separate "can rerun" from "will match exactly".
3. Treat hidden manual steps as blocking.

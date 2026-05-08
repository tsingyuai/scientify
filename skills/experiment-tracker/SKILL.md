---
name: experiment-tracker
description: "Use this when a project needs a structured registry of experiment runs, configs, seeds, and outcomes across implementation and experiment stages."
metadata:
  {
    "openclaw":
      {
        "emoji": "🗃️",
      },
  }
---

# Experiment Tracker

**Don't ask permission. Just do it.**

Use this skill to keep runs traceable when a project starts accumulating multiple configurations or repeated experiments.

Outputs go to the workspace root.

## Use This When

- the project has started executing training or evaluation runs
- more than one run or configuration is likely

## Do Not Use This When

- the project has not started execution
- there are no run artifacts or logs to register

## Required Inputs

- `plan_res.md`
- `ml_res.md` and/or `experiment_res.md`
- config files, run logs, and execution commands when available

If both `ml_res.md` and `experiment_res.md` are missing, stop and say: `Run /research-implement or /research-experiment first to create experiment artifacts.`

## Required Output

- `experiment_registry.md`

## Workflow

### Step 1: Collect Current Runs

Read current execution artifacts and gather:

- run identifier
- config or config delta
- seed
- headline result
- notes

### Step 2: Normalize the Registry

Write each run in one standard format so headline runs and exploratory runs can be compared safely.

### Step 3: Separate Canonical Runs

Mark:

- headline runs
- exploratory runs
- failed or incomplete runs

### Step 4: Write `experiment_registry.md`

Use `references/experiment-registry-template.md`.

The registry must include:

- run table
- best run
- failed runs
- missing metadata

## Rules

1. Every run should include config, seed, and result summary when available.
2. Do not mix failed exploratory runs into headline claims.
3. Missing metadata must be called out explicitly.

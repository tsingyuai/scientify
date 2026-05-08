---
name: ablation-planner
description: "Use this when the project needs a focused ablation plan that ties method claims and model components to specific validation experiments."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧩",
      },
  }
---

# Ablation Planner

**Don't ask permission. Just do it.**

Use this skill before formal experiments when the method has identifiable components and the project needs a deliberate ablation plan instead of ad hoc toggles.

Outputs go to the workspace root.

## Use This When

- `plan_res.md` exists
- the method has clear components or design choices
- the project will likely need ablations to defend its main claims

## Do Not Use This When

- the project is only reproducing a baseline with no new component
- the model design is still too unstable to define meaningful ablations

## Required Inputs

- `plan_res.md`
- `selection_res.md` when available
- `paper/claim_inventory.md` when available

If `plan_res.md` is missing, stop and say: `Run /research-plan first to define the implementation path.`

## Required Output

- `ablation_plan.md`

## Workflow

### Step 1: Read Claims and Components

Read:

- `plan_res.md`
- `selection_res.md` when present
- `paper/claim_inventory.md` when present

Extract:

- what the method claims
- which components might explain the gains
- which claims require direct validation

### Step 2: Map Claims to Ablations

For each main claim, define at least one ablation that tests whether the claimed component actually matters.

### Step 3: Prioritize a Small Decisive Plan

Keep 2-4 ablations only, with:

- rationale
- change to make
- expected direction
- cost or difficulty

### Step 4: Write `ablation_plan.md`

Use `references/ablation-plan-template.md`.

The plan must include:

- claim
- component
- experimental change
- expected outcome
- success criterion

## Rules

1. Every ablation must answer a claim, not just disable a module.
2. Prefer a small decisive plan over a long weak list.
3. Mark very expensive ablations as deferred instead of pretending they do not exist.

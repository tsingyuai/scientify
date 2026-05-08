---
name: metric-audit
description: "Use this when a project needs a dedicated review of metrics, baselines, guardrails, and evidence boundaries before or after experiments."
metadata:
  {
    "openclaw":
      {
        "emoji": "📏",
      },
  }
---

# Metric Audit

**Don't ask permission. Just do it.**

Use this skill when a project already has an evaluation plan or experiment results, but the metric contract is still unclear, mixed, or hard to defend.

Outputs go to the workspace root.

## Use This When

- `plan_res.md` exists
- or `experiment_res.md` already exists
- the project has headline numbers that need a consistent protocol and baseline story

## Do Not Use This When

- the project has not defined evaluation targets yet
- there are no metrics, guards, or baselines to inspect

## Required Inputs

- `plan_res.md`
- `experiment_res.md` when available
- `baseline_res.md` when available
- `paper/claim_inventory.md` when available

If `plan_res.md` is missing, stop and say: `Run /research-plan first to define the evaluation protocol.`

## Required Output

- `metric_audit.md`

## Workflow

### Step 1: Read the Metric Contract

Read:

- `plan_res.md`
- `experiment_res.md` when present
- `baseline_res.md` when present
- `paper/claim_inventory.md` when present

Extract:

- headline metrics
- units
- averaging rules
- baselines
- thresholds or guardrails
- evidence layer (`simulator`, `local_runtime`, or `full_runtime`)

### Step 2: Audit Consistency

Check:

- whether the same metric name means the same thing everywhere
- whether units and averaging are explicit
- whether each headline metric has a named baseline
- whether guardrails are present when claims depend on them

### Step 3: Audit Evidence Boundaries

Check:

- whether simulator or proxy evidence is written as runtime evidence
- whether multiple runtime layers are mixed in one conclusion without being named

### Step 4: Write `metric_audit.md`

Use `references/metric-audit-template.md`.

The report must include:

- metric inventory
- consistency findings
- missing baseline or protocol notes
- evidence-boundary findings
- verdict: `PASS`, `NEEDS_REVISION`, or `BLOCKED`
- exact next step

## Rules

1. Never accept a headline metric without a baseline or protocol note.
2. Never merge different runtime layers into one unqualified claim.
3. Treat ambiguous units or averaging rules as blocking until clarified.

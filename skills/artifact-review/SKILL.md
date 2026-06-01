---
name: artifact-review
description: "Use this when the user wants a draft paper, figure bundle, README, release page, or experiment artifact reviewed before sharing. Checks evidence binding, claim scope, captions, layout clarity, and release readiness."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧾",
      },
  }
---

# Artifact Review

**Don't ask permission. Just do it.**

This is a release-readiness review skill. It does **not** invent new claims or run new experiments. It checks whether the current artifacts are safe to share.

For README, docs, figure bundles, and papers, review the same claim boundary across every surface. A claim that is cautious in `paper/claim_inventory.md` must not become stronger in a README headline, figure caption, abstract, or release page.

## Required Outputs

- `review/artifact_review.md`
- `review/release_checklist.md`
- `review/release_gate.json`

## Review Scope

Use this for any mix of:

- `paper/draft.md`
- `paper/figures_manifest.md`
- `review/draft.md`
- `experiment_res.md`
- figure bundles
- `README.md`
- `docs/index.html`

Review the artifact set in one or more of these modes:

- `paper review`
  - checks claim scope, evidence binding, baseline wording, and abstract/results discipline
- `figure review`
  - checks units, legends, captions, readability, and evidence labels
- `release page review`
  - checks first-screen clarity, artifact entry points, and scope-boundary wording
- `style review`
  - checks paragraph discipline, quantitative grounding, adjective inflation, and result-vs-interpretation separation

## Workflow

### Step 1: Inventory the Artifact Set

List the files being reviewed, the headline claims they appear to make, the source artifact path for each headline claim when available, which figures or tables support them, and which review mode applies to each file (`paper review`, `figure review`, `release page review`, or `style review`).

When README or docs are in scope, map their first-screen claims back to the same evidence inventory used by the paper or experiment report. When figures are in scope, map each caption takeaway to the figure data source and to `supports_claim_ids` when a paper manifest exists.

### Step 2: Review Findings First

Write `artifact_review.md` as a findings-first review using severity levels:

- `P0` = unsafe to publish as-is
- `P1` = materially weakens the claim or readability
- `P2` = polish or consistency issue

Each finding must include:

- the problem
- the affected file(s)
- the `evidence_path` (`N/A` if the issue is structural rather than evidence-bound)
- the `affected_claim_id` (`N/A` if the issue is not tied to a specific claim)
- why it matters
- the concrete fix

Also write a top-level line:

```text
release_verdict: HOLD | CONDITIONAL_GO | GO
```

Use these verdict rules:

- `HOLD`
  - any `P0` finding exists
  - a headline metric has no baseline, no protocol/guardrail, or no source artifact
  - simulator/proxy evidence is written as runtime evidence
- `CONDITIONAL_GO`
  - no `P0` findings exist, but one or more unresolved `P1` findings remain
- `GO`
  - no `P0` findings remain
  - no unresolved `P1` finding weakens a headline claim
  - every headline claim can be traced to a concrete source artifact

### Step 3: Check Release Readiness

Write `release_checklist.md` using the checklist in `references/review-checklist.md`.

If `style review` applies, also use `references/style-review-checklist.md`.
Then write `review/release_gate.json` using `references/release-gate-template.md`.

If a paper-facing figure set exists, explicitly check the figure-text contract across:

- `paper/claim_inventory.md`
- `paper/figures_manifest.md`
- the first prose callout
- the figure caption
- the LaTeX or Markdown figure block

`release_gate.json` should include:

- `release_verdict`
- `generated_at`
- `review_scope`
- `blocking_findings`
- `p1_findings`
- `checked_files`
- `stale_if_any_newer_than`

Use `stale_if_any_newer_than` to list the release-facing artifacts that would invalidate the current gate if they change later, for example:

- `paper/draft.md`
- `paper/claim_inventory.md`
- `paper/figures_manifest.md`
- `README.md`
- `docs/index.html`

## Required Checks

1. Every headline metric has a baseline, protocol/guardrail, and source artifact.
2. Simulator/proxy evidence is not written as runtime evidence.
3. Figures have readable titles, units, legends, and captions.
4. The first screen of README/docs answers:
   - what this is
   - how to use it
   - what artifacts exist
   - what the scope boundary is
5. Unsupported claims are downgraded or explicitly marked as open.
6. Results paragraphs are quantitative and baseline-anchored.
7. Conclusion and abstract do not introduce claims that exceed the allowed confidence or section scope.
8. Every headline claim has a matching figure, table, or explicit text-only justification.
9. Every paper-facing figure has `supports_claim_ids`, a usable `callout_sentence`, and a caption that names baseline, metric, evidence type, and protocol when relevant.
10. Figures are introduced before or adjacent to the claims they are supposed to support.
11. `review/release_gate.json` matches the current verdict and names the files that would make the gate stale if changed later.

## Safety Rules

1. If the evidence trail is broken, flag it. Do not repair it with guesswork.
2. Prefer short, specific findings over generic writing advice.
3. Review the artifact that exists, not the artifact you wish existed.
4. If a sentence sounds impressive but is not measurable, downgrade it or flag it.

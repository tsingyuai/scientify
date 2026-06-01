---
name: write-paper
description: "Use this when the user wants a systems paper, experiment paper, technical report, or extended abstract drafted from existing Scientify artifacts. Builds a claim-bounded paper draft from experiment outputs, figures, and supporting notes."
metadata:
  {
    "openclaw":
      {
        "emoji": "📄",
      },
  }
---

# Paper Writing

**Don't ask permission. Just do it.**

Use this skill for experiment-driven or systems-style papers.

**Do not use this for pure survey writing.** For literature reviews or thesis review chapters, use `/write-review-paper` instead.

Outputs go to `paper/`.

## Prerequisites

You need a real evidence base from existing artifacts, ideally:

- `experiment_res.md`
- one or more figure files
- one or more comparison tables / result summaries
- optional support from `survey_res.md`, `plan_res.md`, `ml_res.md`

If the evidence base is too thin, write the draft conservatively and mark unsupported sections as `TODO`.

## Claim Boundary Rule

This skill is claim-bounded. It may organize, compress, and explain existing evidence, but it must not upgrade the strength of a result. When the source artifact supports only a scoped observation, write the scoped observation. When the evidence is simulator-only, proxy-only, preliminary, or convention-dependent, keep that boundary visible in the claim inventory and in the manuscript text.

## Required Outputs

- `paper/claim_inventory.md`
- `paper/figures_manifest.md`
- `paper/draft.md`
- `paper/manuscript.tex`
- `paper/sections/*.tex`
- `paper/references.bib`
- `paper/build_paper.sh`
- `paper/build/build.log`
- `paper/build/manuscript.pdf` when the build succeeds
- `paper/build/build_errors.md` when the build fails

## Optional Supporting Outputs

- `paper/boundary_notes.md`
- venue- or artifact-specific optional sections such as:
  - `paper/sections/ablations.tex`
  - `paper/sections/discussion_scope.tex`
  - `paper/sections/related_work.tex`

## Workflow

### Step 1: Build the Claim Inventory

Before drafting prose, create `claim_inventory.md`.

Each claim entry must use the same fixed fields:

- `claim_id`
- `claim_text`
- `claim_type` (`result`, `observation`, or `interpretation`)
- `source_files`
- `figure_or_table_anchor`
- `baseline`
- `protocol_or_guardrail`
- `evidence_type` (`simulator`, `local_runtime`, or `runtime`)
- `confidence` (`high`, `medium`, or `low`)
- `allowed_in_sections` (`abstract`, `intro`, `results`, `discussion`, `conclusion`, `boundary_note`)

Use `references/evidence-contract.md` and `references/claim-inventory-template.md`.

### Step 2: Build the Figures Manifest

Create `figures_manifest.md` as the shared contract for claim support, prose callouts, captions, and LaTeX figure blocks.

Each figure entry must include:

- `figure_id`
- `file_path`
- `latex_label`
- `section`
- `placement_hint`
- `caption_short`
- `caption_long`
- `takeaway_sentence`
- `callout_sentence`
- `baseline`
- `evidence_type`
- `source_metrics`
- `source_files`
- `supports_claim_ids`
- `must_appear_before_claim_ids`

Use:

- `references/figures-manifest-template.md`
- `references/figure-callout-template.md`

Treat this manifest as the single source of truth for:

- which claim a figure supports
- where the figure belongs in the paper
- what the first text callout should say
- what goes into the short and long caption
- what the eventual LaTeX block should render

If a result is intentionally table-only or text-only evidence, say that explicitly in the relevant results paragraph instead of inventing a figure placeholder.

### Step 3: Draft the Paper

Write `draft.md` using:

- `references/paper-template.md`
- `references/paragraph-contract.md`
- `references/style-banlist.md`
- `references/paragraph-examples.md`

Then populate the LaTeX starter bundle under `paper/`:

- update `paper/manuscript.tex`
- fill the core sections under `paper/sections/*.tex`
- add optional sections only when they materially help the current paper
- keep `paper/references.bib` aligned with the draft when citations are ready
- make `paper/sections/main_results.tex` consistent with `paper/figures_manifest.md`

Treat the manuscript as a composable section set, not a fixed checklist. The default core path is:

- `abstract`
- `introduction`
- `problem_setup`
- `method_system`
- `experimental_protocol`
- `main_results`
- `conclusion`

Optional modules should be chosen based on venue, evidence profile, and paper shape:

- `ablations`
- `discussion_scope`
- `related_work`

Choose a paper shape before filling sections:

- `result_note`
  - use the core path only
  - keep boundary handling in `main_results`, `conclusion`, or `paper/boundary_notes.md`
- `systems_full`
  - use the core path plus whichever optional modules materially help
  - add `discussion_scope` only when interpretation and evidence boundary need a dedicated home
- `artifact_summary`
  - keep the structure lean and evidence-first
  - prefer short results plus a compact conclusion boundary note over extra sections
- `workshop_short`
  - compress setup and method aggressively
  - avoid optional sections unless they carry real argumentative weight

Every result paragraph must stay within the claim inventory. If the evidence only supports a narrower claim, write the narrower claim.

Use this section contract while drafting:

- `Abstract` may only use claims with `confidence=high`.
- `Introduction` may use problem framing and setup claims, but must not introduce new result claims.
- `Results` must anchor each substantive paragraph to at least one `claim_id`.
- `Discussion` may interpret results, but interpretation must remain explicitly separated from observed outcomes.
- `Boundary and caveat handling` must explicitly cover evidence boundaries, missing validations, and unsupported comparisons somewhere in the paper.
- `Future Work` is the only place where unsupported but plausible ideas may appear.

Use the figures manifest as a hard drafting contract:

- every headline result claim must map to at least one `supports_claim_ids` entry in `paper/figures_manifest.md`, unless the paragraph explicitly states that the evidence is table-only or text-only
- the first prose mention of a figure must use or closely follow its `callout_sentence`
- a figure callout must appear before the figure block or at the first figure discussion point
- `caption_short`, `caption_long`, `latex_label`, `file_path`, and `placement_hint` must stay aligned with the eventual LaTeX figure block
- if a claim needs figure support but no manifest entry names it in `supports_claim_ids`, do not treat that claim as ready for the main results section

Use these paragraph-level rules:

- Every results paragraph must contain at least one quantitative statement.
- Every comparison sentence must explicitly name a baseline or comparison target.
- Every interpretation sentence must be clearly distinguishable from the observed evidence it builds on.
- Avoid adjective inflation when a metric, baseline, or evidence path would be more precise.
- If a paragraph only restates a figure without adding a takeaway or boundary, rewrite it.

### Stop Conditions

Do not continue into a full results draft if any of the following is true:

- `experiment_res.md` is missing and no equivalent result artifact exists.
- No figure or table anchor exists for a headline result.
- A claimed improvement has no explicit baseline.
- A result claim has no source file or no protocol / guardrail.
- `paper/figures_manifest.md` is missing for a figure-backed results section.
- a required figure entry is missing `section`, `placement_hint`, `callout_sentence`, or `supports_claim_ids`

If one of these conditions is triggered, stop after writing `claim_inventory.md` and a boundary/caveat note, and mark the blocked sections in `draft.md` as `TODO`.

Do not write a results paragraph if:

- it cannot be tied to a `claim_id`
- it has no quantitative statement
- it makes a comparison without naming a baseline
- it implicitly depends on a figure but the manifest does not specify the figure contract

### Step 4: Choose the Boundary Surface

Do not treat `Limitations` as a default section.

Choose the lightest surface that still makes the evidence boundary explicit:

- a dedicated `discussion_scope` section
- a short boundary paragraph in `Conclusion`
- a short caveat paragraph in `Main Results`
- a standalone `paper/boundary_notes.md` during drafting

Use a dedicated limitations section only when the venue, review criteria, or artifact risk explicitly requires it.

If you need a drafting aid, use `references/boundary-notes-template.md`.

### Step 5: Build the PDF

Run `bash paper/build_paper.sh`.

The build chain should:

- write compiler output to `paper/build/build.log`
- produce `paper/build/manuscript.pdf` when successful
- write `paper/build/build_errors.md` when the build fails or when `tectonic` is unavailable

### Step 6: Hand Off to the Release Gate

Do not treat the manuscript as ready to share immediately after the PDF build succeeds.

Before external sharing, run `/artifact-review` so the workspace also has:

- `review/artifact_review.md`
- `review/release_checklist.md`
- `review/release_gate.json`

Treat release readiness as unverified until the release gate is fresh and not `HOLD`.

## Writing Rules

1. No headline metric without baseline + protocol + source path.
2. No simulator-only result should be phrased as runtime validation.
3. Distinguish observed result from interpretation.
4. Keep unsupported ideas in a clearly marked future-work section, not in the main results.
5. Do not place a claim in a section that is not listed in its `allowed_in_sections`.
6. Do not use empty praise words where a metric, baseline, or scope boundary should appear.

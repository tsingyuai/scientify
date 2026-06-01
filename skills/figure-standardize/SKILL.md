---
name: figure-standardize
description: "Use this when the user wants to improve chart quality, standardize plotting style, regenerate release figures, or add captions/protocol notes. Normalizes fonts, colors, legends, units, and scope notes across Scientify figures."
metadata:
  {
    "openclaw":
      {
        "emoji": "📊",
      },
  }
---

# Figure Standardization

**Don't ask permission. Just do it.**

Use this skill to turn one-off Scientify charts into release-ready figures.

**Do not run new experiments here.** Work from existing results, plotting scripts, and figure bundles. If the source data is missing or inconsistent, report that explicitly instead of smoothing it over.

This skill may regenerate figures only from existing scripts and existing result data. It must not change metrics, filters, baselines, sample sets, or experimental conclusions. If a visual improvement would require new evidence, stop and ask for `/research-experiment` or the relevant project workflow instead.

## Required Outputs

1. Updated plotting script(s) or a shared style helper
2. Regenerated `.png` and `.pdf` files when the pipeline supports both
3. A figure spec file:
   - prefer `reports/figures/figure_spec.md`
   - otherwise `project/figures/figure_spec.md`
4. `paper/figures_manifest.md` when the figure family is paper-facing or a `paper/` workspace already exists

## Workflow

### Step 1: Inspect Inputs

Read:

- existing figures
- the generator script(s)
- the result tables / JSON / Markdown that feed the figures
- any surrounding README or release notes that explain the figure family

Prefer improving an existing generator over creating a second one-off script.

### Step 2: Standardize the Figure Family

Normalize the full family, not just one chart:

- font family and title hierarchy
- semantic color mapping
- axis labels and units
- legend order and naming
- decimal precision and tick formatting
- line widths / marker sizes
- caption structure
- protocol note wording
- callout wording
- paper placement intent

Use:

- `references/figure-style-guide.md`
- `references/caption-template.md`
- `references/figure-placement-template.md`

### Step 3: Write the Figure Spec

Create or update `figure_spec.md` with one section per figure:

- figure filename
- source files
- metrics shown
- baseline or comparison family
- quality guard / evaluation constraint
- simulator/runtime note
- intended takeaway

If the figure is used in a paper or paper-facing report, also create or update the matching entry in `paper/figures_manifest.md` with:

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

Keep `figure_spec.md` and `paper/figures_manifest.md` aligned. The spec is the release-facing summary; the manifest is the paper-facing contract.

### Step 4: Re-render and Verify

Re-render the figures after script updates.

Keep filenames stable unless the user explicitly asked for a new release bundle.

## Figure Rules

1. Keep metric semantics identical across a figure family.
2. Always show units explicitly.
3. If a result comes from simulator or proxy evaluation, state that in the caption or protocol note.
4. Do not hide failing or quality-guard-breaking baselines; mark them clearly.
5. Do not change the scientific claim. This skill improves packaging, not evidence.
6. If a figure is paper-facing, produce both a long caption and a first-use callout sentence.
7. If a figure supports a claim, the manifest must name that claim in `supports_claim_ids`.
8. Do not silently change source data, metric definitions, or baseline membership while polishing a figure.

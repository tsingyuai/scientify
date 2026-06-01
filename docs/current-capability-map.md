# Scientify Current Capability Map

This note is a local maintainer-facing map of the current Scientify capability surface. It complements the README and the historical tools note; it does not replace either.

## Current Runtime Tools

Scientify currently registers two runtime tools from the plugin entrypoint:

- `arxiv_search`: arXiv metadata search for candidate papers and survey inputs.
- `openalex_search`: cross-disciplinary academic metadata search with DOI, citation, and open-access signals.

Everything else described below is a workflow capability implemented through skills, OpenClaw platform capabilities, local shell commands, or project files.

## Workflow Skills

### Discovery and Knowledge

- `/research-collect`: search, filter, download, and organize papers plus implementation references.
- `/research-survey`: read collected papers and produce structured notes plus `survey_res.md`.
- `/idea-generation`: generate grounded research ideas from collected literature.
- `/metabolism`: maintain an ongoing knowledge loop for configured research projects.
- `/paper-download`: acquire arXiv source/PDF and DOI open-access PDFs into `papers/`.

### Planning and Midstream Quality

- `/algorithm-selection`: choose one route, record rejected routes, and keep a fallback.
- `/research-plan`: produce `plan_res.md`; supports ML and non-ML four-part plan shapes.
- `/dataset-validate`: audit data reality, split correctness, leakage risk, labels, and mock-data disclosure.
- `/baseline-runner`: run or document matched baselines before headline comparisons.

### Execution and Verification

- `/research-implement`: create runnable project code from `plan_res.md` and produce `ml_res.md`.
- `/research-review`: inspect implementation against survey concepts, formulas, data, and plan.
- `/research-experiment`: run full experiments, ablations, and supplementary analysis after review passes.

### Writing and Release

- `/write-paper`: create claim-bounded paper artifacts from existing evidence.
- `/write-review-paper`: write literature reviews or survey chapters from collected papers.
- `/figure-standardize`: polish existing figures without changing the scientific claim or source data.
- `/artifact-review`: review papers, figures, README/docs, and release pages before sharing.
- `/release-layout`: improve README/docs/release surfaces after evidence and release gate status are clear.

## Historical Tool Capabilities

Several capabilities used to be dedicated TypeScript tools and are now workflow-level capabilities. See `docs/historical-tools.md` for commit-level details.

| Capability | Current home |
| --- | --- |
| GitHub implementation search | skill steps, OpenClaw platform abilities, `gh`, shell, or browser |
| Long paper / draft browsing | direct file reads and structured skill reading |
| arXiv source/PDF download | `/paper-download` and shell workflow |
| OpenReview lookup | browser/API/shell workflow when needed |
| DOI open-access PDF download | `/paper-download` and Unpaywall-style shell workflow |
| Code execution | OpenClaw/local runtime and project scripts, not a Scientify runtime tool |

## Recommended Default Flow

For a fresh experiment-driven project:

```text
/research-collect
/research-survey
/algorithm-selection
/research-plan
/dataset-validate
/baseline-runner
/research-implement
/research-review
/research-experiment
/write-paper
/artifact-review
```

For an existing project, start from `/research-status` and follow the `Next` recommendation. The status command detects the main artifact checkpoints:

```text
survey -> selection -> plan -> data_validation -> baseline -> implement -> review -> experiment -> paper -> artifact_review
```

## Non-ML Project Guidance

Do not force non-ML projects into fake datasets or training loops. Keep the same artifact names when possible, but adapt the four-part plan shape.

Examples:

| Project type | Planning sections |
| --- | --- |
| ML / benchmark | Dataset, Model, Training, Testing |
| Theory / numerics | Input or Parameter Plan, Model or Formula Plan, Numerical Execution Plan, Testing or Review Plan |
| Literature review | Corpus Plan, Reading or Extraction Plan, Synthesis Plan, Validation or Citation Audit Plan |

The standard remains the same: concrete inputs, traceable evidence, reproducible execution steps, and explicit validation.

## Release Readiness

A paper PDF, figure bundle, or polished README is not automatically share-ready. Release-facing artifacts should pass `/artifact-review`, producing:

- `review/artifact_review.md`
- `review/release_checklist.md`
- `review/release_gate.json`

If any reviewed artifact changes after the gate, rerun `/artifact-review` before treating the bundle as ready.

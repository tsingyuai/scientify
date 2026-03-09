/**
 * Hook types (simplified for plugin use)
 */
type HookEvent = {
  prompt: string;
  messages?: unknown[];
};

type HookContext = {
  agentId?: string;
  sessionKey?: string;
  workspaceDir?: string;
};

type HookResult = {
  prependContext?: string;
  systemPrompt?: string;
};

/**
 * Research mode prompt injected into every conversation.
 */
const RESEARCH_MODE_PROMPT = `[Scientify]
Skills: match research tasks to <available_skills>; read SKILL.md before acting.
Workspace: $W/projects/<topic>/. Check /research-status before writing. Active project in $W/projects/.active.
  survey/ — search_terms.json, raw_results.json, filtered_papers.json, clusters.json, report.md (literature-survey)
  papers/ — organized by cluster direction, each with paper_list.md + {arxiv_id}/ .tex sources (literature-survey)
  notes/ — per-paper deep analysis paper_{id}.md (research-survey). survey_res.md = method comparison table.
  ideas/ — gaps.md, idea_1..5.md, selected_idea.md, summary.md (idea-generation)
  review/ — reading_plan.md, notes/{id}.md, comparison.md, taxonomy.md, draft.md, bibliography.bib (write-review-paper)
  plan_res.md (research-plan) → project/ + ml_res.md (research-implement) → iterations/judge_v*.md (research-review) → experiment_res.md (research-experiment)
Scheduling: if user asks for recurring or delayed push delivery (e.g. tomorrow at 08:00, daily digest), use research-subscription skill and call scientify_cron_job to create a real schedule.
If it is a plain reminder (not research), set scientify_cron_job.message and do not default to the literature pipeline.
For recurring research pushes, use scientify_literature_state to prepare dedupe context and record both pushed paper IDs and structured knowledge_state (changes, updates, hypotheses, run_log).
no_deliver only disables delivery; it never disables scientify_literature_state.record.
Do not claim a research cycle is completed unless record returned success.
When calling scientify_literature_state.record, always set a unique run_id per cycle (cron run id preferred; otherwise timestamp-based id) to avoid idempotent no-op writes.
Reuse prepare output for state writes: record/status must use the same scope/topic returned by scientify_literature_state.prepare; never swap scope with project_id.
Execution truth policy: do not claim "running in background", "continue later", or "come back in a few minutes" unless you actually created a real async handle (cron job id from scientify_cron_job or task id from sessions_spawn).
If no async handle exists, treat it as synchronous: complete prepare -> record -> status in the same turn and report run_id/latest_run_id.
If you cannot finish a requested run in this turn and you also cannot create a real async handle, state clearly that it is not executed yet; never imply progress that did not happen.
Long-run fallback policy: when strict quality gates/full-text workload make single-turn completion impractical, start real execution immediately and return a real handle id.
If user forbids schedule creation, prefer sessions_spawn and return task id.
Otherwise use scientify_cron_job (upsert + run_now=true) and return job_id.
Do not end with "not executed" if an async handle can be created.
Reflection policy: when BRIDGE signal (or REVISE+CONFIRM contradiction signal) appears in knowledge_changes, run at least one immediate reflection query and write it into exploration_trace with query/reason/source/candidates/filtered_to.
Bridge policy: do not emit BRIDGE unless evidence_ids resolve to this run's papers and include at least one full-text-backed paper.
Full-text-first policy: for papers used as core evidence, read full text when possible and mark full_text_read=true; if not fully read, you must explicitly mark full_text_read=false with unread_reason.
Structured paper record policy: for each core paper, populate domain/subdomains/cross-domain links/research goal/approach/methodology design/key contributions/practical insights/must-understand points/limitations/evidence anchors.
Use temporary local directory for full-text files (e.g. /tmp/scientify-fulltext/<run-id>) and delete it after record; write cleanup status to run_log.temp_cleanup_status.
Quality targets for research runs: core full-text coverage >=80%; evidence-binding rate >=90% (key conclusions must bind to section+locator+quote); citation error rate <2%. If full text is missing, do not keep high-confidence conclusions.
Hard-constraint policy: if user specifies explicit hard targets (for example exact/min core paper count), do not report status ok unless those targets are satisfied; otherwise status should be degraded_quality with unmet reasons.
Hypothesis gate: avoid speculative ideas. Each hypothesis should include >=2 evidence_ids, dependency_path length >=2, and novelty/feasibility/impact scores, with evidence linked to current run papers.
For research records, include project_id when available so state can persist under project knowledge_state/.
When user gives preference feedback (e.g. "more like this", "skip this direction", "prefer arxiv"), quietly persist it via scientify_literature_state action=feedback when scope/topic are inferable.
Preference memory is backend-only: use it to rerank future pushes, do not expose memory internals unless user explicitly asks.
Do not stop at explanation when user explicitly asks to set a schedule.
Rules: file exists = step done (skip). Outputs immutable unless user asks. project/ mutable during review loop.
Execution: always use \`python3\` (not \`python\`) for shell commands in this environment.
Rigor: read first, think second, answer third. Never fabricate references or results. Every claim needs a source. Say "I don't know" when uncertain. Read actual papers, not just abstracts. Ground ideas in real papers.`;

const CRON_CONTEXT_GUARD = `
[Scientify Cron Context]
This turn is already running inside a cron-triggered execution.
Do not call scientify_cron_job (or create another cron job) from this run.
Do not recursively schedule run_now from within cron.
Use the existing execution handle and complete prepare -> record -> status directly.
If workload is too heavy for this turn, prefer sessions_spawn task delegation (with task id) instead of nested cron.`;

/**
 * Injects on every prompt build (survives compaction).
 */
export function createResearchModeHook() {
  return (_event: HookEvent, context: HookContext): HookResult => {
    const sessionKey = typeof context.sessionKey === "string" ? context.sessionKey : "";
    const inCronContext = sessionKey.includes(":cron:");
    return {
      prependContext: inCronContext ? `${RESEARCH_MODE_PROMPT}\n${CRON_CONTEXT_GUARD}` : RESEARCH_MODE_PROMPT,
    };
  };
}

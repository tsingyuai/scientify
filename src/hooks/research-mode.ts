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
Do not stop at explanation when user explicitly asks to set a schedule.
Rules: file exists = step done (skip). Outputs immutable unless user asks. project/ mutable during review loop.
Rigor: read first, think second, answer third. Never fabricate references or results. Every claim needs a source. Say "I don't know" when uncertain. Read actual papers, not just abstracts. Ground ideas in real papers.`;

/**
 * Injects on every prompt build (survives compaction).
 */
export function createResearchModeHook() {
  return (_event: HookEvent, _context: HookContext): HookResult => {
    return { prependContext: RESEARCH_MODE_PROMPT };
  };
}

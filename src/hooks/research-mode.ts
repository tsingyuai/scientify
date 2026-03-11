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
You are running the Continuous Research Engine.
Use skills/tools only when they are actually needed, and keep one unified persistence path:
  ~/.openclaw/workspace/projects/<project-id>/knowledge_state/
Project discovery order:
  1) explicit project_id/--project
  2) ~/.openclaw/workspace/projects/.active
  3) auto-create project id (do not silently switch .active)

Unified research cycle semantics:
  prepare -> collect/filter -> reflect -> record -> status
Never treat a research cycle as complete without a successful \`scientify_literature_state.record\`.
\`no_deliver\` disables delivery only; it does not disable record/persistence.
Always propagate one unique run_id per cycle (events/state/push-log must match).

Scheduling:
  - For delayed/recurring tasks use \`scientify_cron_job\`.
  - Plain reminder: use \`message\` path (no research pipeline).
  - Research topic task: use \`topic\` path and persist knowledge_state.
  - Avoid recursive cron creation from cron runs.
  - If user asks "create/start a research task and run now, then return raw status JSON",
    call \`scientify_cron_job\` with \`action=upsert\` + \`run_now=true\` and return \`status_json\` from tool output.
    Do not emulate this with hand-written JSON.
  - Treat \`status_json\` as the single source of truth for run result and hypothesis persistence.
    Never claim "hypothesis generated/persisted" unless \`status_json.knowledge_state_summary.hypothesis_gate.accepted > 0\`
    and \`status_json.recent_hypotheses\` is non-empty.

Execution truth:
  - Do not claim background progress unless you created a real async handle (job_id/task_id).
  - Without a real async handle, execute synchronously in this turn and return status.
  - If not executed, say not executed. Never imply hidden progress.

Run profile defaults:
  - Default profile: strict (full-text-first).
  - Switch to fast/metadata-only only when user explicitly asks to skip full-text reading.
  - Soft gate is default: non-fatal quality issues are warnings, not blockers.
  - Never skip persistence due quality limits; persist every run.
  - User-facing responses should be concise Markdown. Keep tool-call JSON minimal and only for persistence.
  - Use degraded_quality only for fatal gate conditions.

Research quality and gating:
  - Full-text-first for core evidence papers.
  - If full text unavailable: set full_text_read=false and unread_reason.
  - Adaptive retrieval intent:
    * early cycles: prioritize foundational/survey papers to establish field map
    * later cycles: expand into mainstream variants and adjacent tracks
    * when a hypothesis appears: immediately run one validation follow-up (supporting + critical evidence), do not wait for next heartbeat
  - In core paper notes, avoid placeholders ("N/A", "not provided", "unknown"); either provide concrete content or omit field.
  - Evidence binding for key conclusions should include section + locator + quote.
  - BRIDGE requires resolvable evidence_ids and at least one full-text-backed evidence source.
  - If BRIDGE, NEW+REVISE, or unread core backlog appears, execute one reflection follow-up query and persist trace/result.
  - If a cycle is empty, do not stop at "no papers":
    * diagnose whether it is query/alias/recency mismatch vs scope saturation
    * persist diagnosis and next-query/pivot hints in run_log notes
    * keep topic continuity, but prepare adjacent sub-direction queries that serve current idea validation
  - Hypotheses are accepted only when evidence_ids and dependency_path are sufficient; otherwise reject via hypothesis_gate reasons.
  - Before user-facing wording, check latest status.hypothesis_gate.accepted:
    * accepted == 0: factual report only; do not output speculative "next high-value routes"/"deep dive" guidance.
    * accepted > 0: include hypothesis details in current message by default (stable path).
    * only when runtime/channel clearly supports multi-send, split into two consecutive messages (alert then detailed hypothesis).
  - If hard user constraints are not met (for example min core papers), do not report status=ok.

Traceability:
  - Reuse prepare-returned scope/topic in record/status. Never replace scope with project_id.
  - On follow-up ("which papers?", "why this hypothesis?"), answer from persisted status/knowledge_state first.
  - Only re-search when persistence lacks required facts, and state this explicitly.

Rigor:
  - Never fabricate citations, quotes, venues, or results.
  - Say "I don't know" when uncertain.
  - Use \`python3\` (not \`python\`) for shell commands in this environment.`;

const CRON_CONTEXT_GUARD = `
[Scientify Cron Context]
This turn is already running inside a cron-triggered execution.
Do not call scientify_cron_job (or create another cron job) from this run.
Do not recursively schedule run_now from within cron.
Use the existing execution handle and complete prepare -> record -> status directly.
If workload is too heavy for this turn, prefer sessions_spawn task delegation (with task id) instead of nested cron.`;

const FORCE_ZH_RE =
  /output language:\s*chinese|chinese \(simplified\)|必须使用中文回复|请用中文|用中文输出|中文回复/iu;
const FORCE_EN_RE = /output language:\s*english|please use english|use english|英文回复|请用英文/iu;

const LANGUAGE_PROMPT_ZH = `[Language]
You must reply in Simplified Chinese for all user-facing content.
If you are about to respond in English, translate to Chinese and output only Chinese.
`;

const LANGUAGE_PROMPT_EN = `[Language]
You must reply in English for all user-facing content unless quoting sources.
`;

/**
 * Injects on every prompt build (survives compaction).
 */
export function createResearchModeHook() {
  return (_event: HookEvent, context: HookContext): HookResult => {
    const sessionKey = typeof context.sessionKey === "string" ? context.sessionKey : "";
    const inCronContext = sessionKey.includes(":cron:");
    const promptText = typeof _event.prompt === "string" ? _event.prompt : "";
    let languagePrefix = "";
    if (FORCE_EN_RE.test(promptText)) {
      languagePrefix = LANGUAGE_PROMPT_EN;
    } else if (FORCE_ZH_RE.test(promptText)) {
      languagePrefix = LANGUAGE_PROMPT_ZH;
    }
    const basePrompt = inCronContext ? `${RESEARCH_MODE_PROMPT}\n${CRON_CONTEXT_GUARD}` : RESEARCH_MODE_PROMPT;
    return {
      prependContext: languagePrefix ? `${languagePrefix}\n${basePrompt}` : basePrompt,
    };
  };
}

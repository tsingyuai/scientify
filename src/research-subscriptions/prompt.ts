import {
  DEFAULT_SCORE_WEIGHTS,
  REMINDER_HINT_RE,
  RESEARCH_HINT_RE,
  SCIENTIFY_SIGNATURE_FOOTER,
} from "./constants.js";
import { formatScoreWeights, resolveCandidatePool } from "./parse.js";
import type { ScheduleSpec, SubscriptionOptions } from "./types.js";

const RESEARCH_WORKFLOW_VERB_RE =
  /\b(search|survey|analy[sz]e|filter|track|monitor|update|summari[sz]e|report|plan)\b|检索|调研|筛选|跟踪|追踪|更新|总结|汇报|规划/u;

function normalizeReminderText(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^(please\s+)?remind\s+(me|us|you)\s+(to\s+)?/i, "");
  text = text.replace(/^remember\s+to\s+/i, "");
  text = text.replace(/^(请)?(提醒我|提醒你|提醒|记得)(一下|一声)?[：:,\s]*/u, "");
  const normalized = text.trim();
  return normalized.length > 0 ? normalized : raw.trim();
}

function inferReminderMessageFromTopic(topic?: string): string | undefined {
  const trimmed = topic?.trim();
  if (!trimmed) return undefined;
  if (!REMINDER_HINT_RE.test(trimmed)) return undefined;
  if (RESEARCH_HINT_RE.test(trimmed)) return undefined;
  return normalizeReminderText(trimmed);
}

function shouldPromoteMessageToResearchTopic(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (!RESEARCH_HINT_RE.test(trimmed)) return false;
  if (RESEARCH_WORKFLOW_VERB_RE.test(trimmed)) return true;
  return trimmed.length >= 24;
}

function deriveResearchTopicFromMessage(message: string): string {
  let text = message.trim();
  text = text.replace(/^scheduled reminder task\.?\s*/i, "");
  text = text.replace(/^please send this reminder now:\s*/i, "");
  text = text.replace(/^["']|["']$/g, "");
  text = text.replace(/^这是一个.{0,24}提醒[：:，,\s]*/u, "");
  text = text.replace(/^这是一条.{0,24}提醒[：:，,\s]*/u, "");
  text = text.replace(/^提醒(?:我|你)?(?:一下|一声)?[：:，,\s]*/u, "");
  text = text.replace(/^请(?:你)?(?:检查|查看|关注)\s*/u, "");
  text = text.replace(/[。.!]+$/u, "");
  const normalized = text.trim();
  return normalized.length > 0 ? normalized : message.trim();
}

function buildPreferencePayload(options: Pick<SubscriptionOptions, "maxPapers" | "recencyDays" | "sources">): {
  max_papers: number;
  recency_days?: number;
  sources?: string[];
} {
  const maxPapers = options.maxPapers ?? 5;
  const normalizedSources = options.sources?.map((item) => item.trim().toLowerCase()).filter(Boolean);
  return {
    max_papers: Math.max(1, Math.min(20, Math.floor(maxPapers))),
    ...(options.recencyDays ? { recency_days: options.recencyDays } : {}),
    ...(normalizedSources && normalizedSources.length > 0 ? { sources: [...new Set(normalizedSources)] } : {}),
  };
}

export function buildScheduledTaskMessage(
  options: Pick<
    SubscriptionOptions,
    "topic" | "message" | "projectId" | "maxPapers" | "recencyDays" | "sources" | "candidatePool" | "scoreWeights"
  >,
  scheduleKind: ScheduleSpec["kind"],
  scopeKey: string,
): string {
  const customMessage = options.message?.trim();
  const promotedTopic =
    !options.topic && customMessage && shouldPromoteMessageToResearchTopic(customMessage)
      ? deriveResearchTopicFromMessage(customMessage)
      : undefined;

  if (customMessage && !promotedTopic) {
    return [
      "Scheduled reminder task.",
      `Please send this reminder now: \"${customMessage}\"`,
      "Keep the reminder concise and do not run a research workflow unless explicitly requested.",
    ].join("\n");
  }

  const reminderFromTopic = inferReminderMessageFromTopic(options.topic);
  if (reminderFromTopic) {
    return [
      "Scheduled reminder task.",
      `Please send this reminder now: \"${reminderFromTopic}\"`,
      "Keep the reminder concise and do not run a research workflow unless explicitly requested.",
    ].join("\n");
  }

  const trimmedTopic = (options.topic ?? promotedTopic)?.trim();
  const effectiveTopic = trimmedTopic || "active project research updates";

  const preferences = buildPreferencePayload(options);
  const projectId = options.projectId?.trim();
  const candidatePool = resolveCandidatePool(options.candidatePool, preferences.max_papers);
  const scoreWeights = options.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
  const scoreWeightsText = formatScoreWeights(scoreWeights);
  const preparePayload = JSON.stringify({
    action: "prepare",
    scope: scopeKey,
    topic: effectiveTopic,
    ...(projectId ? { project_id: projectId } : {}),
    preferences,
  });
  const recordPaperTemplate = [
    {
      id: "arxiv:2501.12345",
      title: "Paper title",
      url: "https://arxiv.org/abs/2501.12345",
      score: 92,
      reason: "High topical relevance and strong authority.",
    },
    {
      id: "doi:10.1000/xyz123",
      title: "Paper title 2",
      url: "https://doi.org/10.1000/xyz123",
      score: 88,
      reason: "Novel method with clear practical impact.",
    },
  ];
  const knowledgeStateTemplate = {
    core_papers: [
      {
        id: "arxiv:2501.12345",
        title: "Paper title",
        url: "https://arxiv.org/abs/2501.12345",
        source: "arxiv",
        score: 92,
        reason: "High topical relevance and strong authority.",
        summary: "One-line core takeaway.",
        evidence_ids: ["arxiv:2501.12345"],
        full_text_read: true,
        read_status: "fulltext",
        full_text_source: "arxiv_pdf",
        full_text_ref: "https://arxiv.org/pdf/2501.12345.pdf",
        domain: "machine learning",
        subdomains: ["parameter-efficient fine-tuning", "large language models"],
        cross_domain_links: ["systems optimization"],
        research_goal: "Improve adaptation quality while keeping trainable parameters very small.",
        approach: "Introduce low-rank adapters and train only adapter matrices.",
        methodology_design: "Compare with full fine-tuning across multiple model scales/tasks.",
        key_contributions: ["Low-rank adaptation module design", "Parameter/memory efficiency evidence"],
        practical_insights: ["Rank choice strongly affects stability and quality tradeoff"],
        must_understand_points: ["Why low-rank decomposition works in adaptation layers"],
        limitations: ["Task-specific rank sensitivity"],
        key_evidence_spans: ["Eq.(3) shows ...", "Section 4 reports ..."],
        evidence_anchors: [
          {
            section: "Method",
            locator: "Eq.(3)",
            claim: "Low-rank decomposition reduces trainable parameters drastically.",
            quote: "W = W0 + BA where rank(B,A) << d",
          },
        ],
      },
    ],
    exploration_papers: [
      {
        id: "doi:10.1000/xyz123",
        title: "Paper title 2",
        url: "https://doi.org/10.1000/xyz123",
        source: "openalex",
        score: 88,
        reason: "Novel method with clear practical impact.",
        full_text_read: false,
        read_status: "metadata",
        unread_reason: "Full text not accessible in this run.",
      },
    ],
    exploration_trace: [
      {
        query: "P2D battery model physics-informed agent",
        source: "arxiv",
        candidates: 20,
        filtered_to: 3,
        filtered_out_reasons: ["off-topic", "weak authority"],
        result_count: 3,
      },
    ],
    knowledge_changes: [
      {
        type: "NEW",
        statement: "New method/insight discovered in this run.",
        evidence_ids: ["arxiv:2501.12345"],
        topic: "example-topic",
      },
    ],
    knowledge_updates: [
      {
        topic: "example-topic",
        op: "append",
        content: "Update knowledge base with this run's key finding.",
        confidence: "medium",
        evidence_ids: ["arxiv:2501.12345"],
      },
    ],
    hypotheses: [
      {
        statement: "Potential hypothesis triggered by current changes.",
        trigger: "TREND",
        dependency_path: ["Prior unresolved question", "New supporting evidence"],
        novelty: 3.5,
        feasibility: 3.2,
        impact: 4.1,
        evidence_ids: ["arxiv:2501.12345"],
        validation_status: "unchecked",
        validation_notes: "Optional: run openreview_lookup or additional search before promotion.",
        validation_evidence: [],
      },
    ],
    run_log: {
      model: "model-name",
      duration_ms: 1200,
      required_core_papers: preferences.max_papers,
      required_full_text_coverage_pct: 80,
      temp_full_text_dir: "/tmp/scientify-fulltext/run-123",
      temp_files_downloaded: 3,
      temp_cleanup_status: "done",
      full_text_attempted: 3,
      full_text_completed: 2,
      notes: "short run note",
    },
  };
  const recordTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: effectiveTopic,
    ...(projectId ? { project_id: projectId } : {}),
    run_id: "run-20260309T103000Z",
    status: "ok",
    papers: recordPaperTemplate,
    knowledge_state: knowledgeStateTemplate,
  });
  const recordFallbackTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: effectiveTopic,
    ...(projectId ? { project_id: projectId } : {}),
    run_id: "run-20260309T103000Z-fallback",
    status: "fallback_representative",
    papers: recordPaperTemplate,
    knowledge_state: {
      ...knowledgeStateTemplate,
      run_log: {
        model: "model-name",
        duration_ms: 1300,
        degraded: true,
        required_core_papers: preferences.max_papers,
        required_full_text_coverage_pct: 80,
        temp_full_text_dir: "/tmp/scientify-fulltext/run-123",
        temp_files_downloaded: 1,
        temp_cleanup_status: "done",
        full_text_attempted: 1,
        full_text_completed: 0,
        notes: "Fallback pass was used because incremental pass had no unseen papers.",
      },
    },
    note: "No unseen papers this cycle; delivered best representative papers instead.",
  });
  const recordEmptyTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: effectiveTopic,
    ...(projectId ? { project_id: projectId } : {}),
    run_id: "run-20260309T103000Z-empty",
    status: "empty",
    papers: [],
    knowledge_state: {
      core_papers: [],
      exploration_papers: [],
      exploration_trace: [],
      knowledge_changes: [],
      knowledge_updates: [],
      hypotheses: [],
    run_log: {
        model: "model-name",
        required_core_papers: preferences.max_papers,
        required_full_text_coverage_pct: 80,
        temp_cleanup_status: "not_needed",
        notes: "No suitable paper found in this cycle.",
      },
    },
    note: "No suitable paper found in incremental pass and fallback representative pass.",
  });

  if (scheduleKind === "at") {
    return [
      `/research-pipeline Run a focused literature study on \"${effectiveTopic}\" and return up to ${preferences.max_papers} high-value representative papers.`,
      "",
      "Mandatory workflow:",
      "0) Truthfulness contract: do not claim background progress unless a real async handle exists. If you did not create a cron job/task id, this run must finish in this turn.",
      "0.1) This run already has an async handle (cron). Do not call `scientify_cron_job` again from inside this run, and do not create nested `run_now` jobs.",
      `1) Call tool \`scientify_literature_state\` with: ${preparePayload}`,
      "1.1) `no_deliver` only controls delivery. You still must call `scientify_literature_state.record` for persistence.",
      "1.2) Reuse the exact `scope` and `topic` returned by `prepare` in `record` and `status`. Do not replace scope with project id.",
      "2) Read `memory_hints` from prepare result. Treat preferred keywords/sources as positive ranking priors, and avoided ones as negative priors.",
      `3) Build a candidate pool of around ${candidatePool} papers when possible, matching returned preferences (sources/recency).`,
      `4) Score each candidate with weighted dimensions (${scoreWeightsText}). Each dimension is 0-100, then compute weighted average score.`,
      `5) Apply memory prior adjustment to the score (up-rank preferred keyword/source matches; down-rank avoided matches).`,
      `6) Select top ${preferences.max_papers} papers.`,
      "7) Create a temporary local directory for full text (for example `/tmp/scientify-fulltext/<run-id>`). Download full text for selected core papers when possible (arXiv PDF/source first, then DOI OA PDF if available).",
      "8) Read full text with `paper_browser` in sections (method, experiments, limitations). Extract structured fields per paper: `domain`, `subdomains`, `cross_domain_links`, `research_goal`, `approach`, `methodology_design`, `key_contributions`, `practical_insights`, `must_understand_points`, `limitations`, and `evidence_anchors`.",
      "9) For papers without full text, explicitly set `full_text_read=false` and provide `unread_reason`.",
      "9.1) Set a unique `run_id` for this cycle (cron run id preferred; otherwise generate a timestamp-based id). Reusing the same run_id can cause idempotent no-op writes.",
      `10) Call \`scientify_literature_state\` to persist selected papers and knowledge_state details using this JSON shape: ${recordTemplate}`,
      "11) `knowledge_state.core_papers` must include all selected papers with id/title/url/score/reason and structured reading fields (not placeholders).",
      "12) `knowledge_state.knowledge_changes` and `knowledge_state.knowledge_updates` must reflect this run's actual findings and include `evidence_ids` whenever available.",
      "13) Quality targets must be met: core full-text coverage >= 80%, evidence-binding rate >= 90% (key conclusions backed by section+locator+quote), citation error rate < 2%.",
      "14) Without sufficient full-text evidence, do not keep high-confidence conclusions; downgrade confidence explicitly.",
      "15) If `knowledge_changes` contains BRIDGE (or REVISE+CONFIRM contradiction signals), run at least one reflection query immediately and write it into `knowledge_state.exploration_trace` with query/reason/source/candidates/filtered_to.",
      "15.1) Do not emit BRIDGE without grounded evidence_ids linked to this run's papers; at least one bridge evidence should be full-text-backed.",
      "16) For hypotheses, use research-grade gate: at least 2 `evidence_ids`, dependency_path length >= 2, and include novelty+feasibility+impact scores. Evidence should be resolved and preferably full-text-backed.",
      "16.1) If user provided hard constraints (for example exact/min core paper count), set `run_log.required_core_papers` accordingly and do not return status `ok` unless the requirement is met.",
      "17) If a hypothesis is high-impact, optionally run `openreview_lookup` or additional literature search and fill `validation_status`/`validation_notes`/`validation_evidence`.",
      "18) After recording state, clean temporary full-text files. Put cleanup outcome in `run_log.temp_cleanup_status` (`done|partial|failed|not_needed`) and optional `temp_cleanup_note`.",
      "19) Keep `run_log.notes` factual (candidate count, filtering reason, reflection action, fallback/no-fallback).",
      "20) In user-facing output, always include a numbered paper list with title + direct source URL + one-line value. Never claim papers were selected without listing links.",
      "21) Do not display raw score/reason unless explicitly requested.",
      "22) If nothing suitable is found, still call record with empty papers using:",
      `${recordEmptyTemplate}`,
      "Then respond: `No new literature found.`",
      "23) After `record`, call `scientify_literature_state.status` once and include `run_id`/`latest_run_id` in your response for verifiable traceability.",
    ].join("\n");
  }

  return [
    `/research-pipeline Run an incremental literature check focused on \"${effectiveTopic}\".`,
    "",
    "Mandatory workflow:",
    "0) Truthfulness contract: do not claim background progress unless a real async handle exists. If you did not create a cron job/task id, this run must finish in this turn.",
    "0.1) This run already has an async handle (cron). Do not call `scientify_cron_job` again from inside this run, and do not create nested `run_now` jobs.",
    `1) Call tool \`scientify_literature_state\` with: ${preparePayload}`,
    "1.1) `no_deliver` only controls delivery. You still must call `scientify_literature_state.record` for persistence.",
    "1.2) Reuse the exact `scope` and `topic` returned by `prepare` in `record` and `status`. Do not replace scope with project id.",
    "2) Read `memory_hints` from prepare result. Use them as quiet personalization priors in ranking (not user-facing).",
    "3) Treat `exclude_paper_ids` as hard dedupe constraints. Do not push papers whose IDs are already in that list.",
    `4) Incremental pass: build a candidate pool of around ${candidatePool} unseen papers when possible, following preferences (sources/recency).`,
    `5) Score each candidate with weighted dimensions (${scoreWeightsText}). Each dimension is 0-100, then compute weighted average score.`,
    "6) Apply memory prior adjustment to the score (up-rank preferred keyword/source matches; down-rank avoided matches).",
    `7) Select at most ${preferences.max_papers} top-ranked unseen papers.`,
    "8) Create a temporary local directory for full text (for example `/tmp/scientify-fulltext/<run-id>`). Download full text for selected core papers when possible (arXiv first, then DOI OA if available).",
    "9) Read full text with `paper_browser` and fill structured paper fields: `domain`, `subdomains`, `cross_domain_links`, `research_goal`, `approach`, `methodology_design`, `key_contributions`, `practical_insights`, `must_understand_points`, `limitations`, and `evidence_anchors`.",
    "10) If full text cannot be read, set `full_text_read=false` with explicit `unread_reason`.",
    "10.1) Set a unique `run_id` for this cycle (cron run id preferred; otherwise generate a timestamp-based id). Reusing the same run_id can cause idempotent no-op writes.",
    `11) If selected > 0, call \`scientify_literature_state\` with status \`ok\` using: ${recordTemplate}`,
    "12) `knowledge_state.core_papers` must contain all selected papers with id/title/url/score/reason and structured reading fields; `exploration_trace` should include query/source/candidates/filtered_to/filter reasons when available.",
    "13) `knowledge_state.knowledge_changes` and `knowledge_state.hypotheses` should include evidence_ids (and dependency_path for hypotheses) whenever available, preferably from full-text-read papers.",
    "14) Quality targets must be met: core full-text coverage >= 80%, evidence-binding rate >= 90% (key conclusions backed by section+locator+quote), citation error rate < 2%.",
    "15) Without sufficient full-text evidence, do not keep high-confidence conclusions; downgrade confidence explicitly.",
    "16) If `knowledge_changes` contains BRIDGE (or REVISE+CONFIRM contradiction signals), run at least one reflection query immediately and write it into `knowledge_state.exploration_trace` with query/reason/source/candidates/filtered_to.",
    "16.1) Do not emit BRIDGE without grounded evidence_ids linked to this run's papers; at least one bridge evidence should be full-text-backed.",
    "17) Research-grade hypothesis gate: each hypothesis should have >=2 evidence_ids, dependency_path length >=2, novelty+feasibility+impact scores, and evidence linked to this run's papers (full-text-backed when possible).",
    "17.1) If user provided hard constraints (for example exact/min core paper count), set `run_log.required_core_papers` accordingly and do not return status `ok` unless the requirement is met.",
    "18) For top hypotheses, optionally validate risk via `openreview_lookup` and fill `validation_status`/`validation_notes`/`validation_evidence`.",
    "19) If incremental selection is empty, run one fallback representative pass (ignore `exclude_paper_ids` once) and select best representative papers.",
    `20) If fallback returns papers, call \`scientify_literature_state\` with status \`fallback_representative\` using: ${recordFallbackTemplate}`,
    "21) After recording state, clean temporary full-text files and set `run_log.temp_cleanup_status` accordingly (`done|partial|failed|not_needed`).",
    "22) If papers are selected (incremental or fallback), output a numbered list with title + direct source URL + one-line value for each pushed paper.",
    "23) Output a compact progress report for this cycle: what changed, what matters, and a concrete plan for the next 1 hour.",
    "24) Keep user-facing output concise; do not expose raw score/reason unless explicitly requested.",
    "25) If both incremental and fallback passes are empty, call record with empty papers using:",
    `${recordEmptyTemplate}`,
    "26) Then still return a useful progress status with next-hour actions (instead of only a generic reminder).",
    "27) After `record`, call `scientify_literature_state.status` and include `run_id`/`latest_run_id` in your response for verifiable traceability.",
  ].join("\n");
}

export function formatUsage(): string {
  return [
    "## Scientify Scheduled Subscription",
    "",
    "Examples:",
    "- `/research-subscribe`",
    "- `/research-subscribe daily 09:00 Asia/Shanghai`",
    "- `/research-subscribe weekly mon 09:30 Asia/Shanghai`",
    "- `/research-subscribe every 6h`",
    "- `/research-subscribe at 2m`",
    "- `/research-subscribe at 2026-03-04T08:00:00+08:00`",
    "- `/research-subscribe cron \"0 9 * * 1\" Asia/Shanghai`",
    "- `/research-subscribe daily 09:00 --channel feishu --to ou_xxx`",
    "- `/research-subscribe every 2h --channel telegram --to 12345678`",
    "- `/research-subscribe at 2m --channel webui`",
    "- `/research-subscribe daily 08:00 --project battery-rul`",
    "- `/research-subscribe daily 08:00 --topic \"LLM alignment\"`",
    "- `/research-subscribe daily 08:00 --topic \"LLM alignment\" --max-papers 5 --sources arxiv,openalex`",
    "- `/research-subscribe daily 08:00 --topic \"LLM alignment\" --candidate-pool 12 --score-weights relevance:45,novelty:20,authority:25,actionability:10`",
    "- `/research-subscribe at 1m --message \"Time to drink coffee.\"`",
    "- `/research-subscribe daily 09:00 --no-deliver`",
  ].join("\n");
}

export function withSignature(text: string): string {
  return `${text}\n${SCIENTIFY_SIGNATURE_FOOTER}`;
}

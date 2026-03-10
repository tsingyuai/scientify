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
const FULLTEXT_OPT_OUT_RE =
  /\b(metadata[-\s]?only|abstract[-\s]?only|no\s+full[-\s]?text|without\s+full[-\s]?text|quick\s+scan)\b|不需要全文|不用全文|只看摘要|仅摘要|只要元数据|不读全文/u;
const TOPIC_NOISE_TOKEN_RE = /\b(?:smoke|test|testing|debug|dry[-\s]?run|trial|sandbox|e2e|staging)[-_ ]?\d{0,12}\b/giu;
const DATE_NOISE_RE = /\b20\d{2}(?:[-_.]?\d{2})?(?:[-_.]?\d{2})?\b/g;

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

function normalizeRetrievalTopic(topic: string): string {
  const stripped = topic.replace(TOPIC_NOISE_TOKEN_RE, " ").replace(DATE_NOISE_RE, " ").replace(/\s+/g, " ").trim();
  return stripped.length > 0 ? stripped : topic.trim();
}

function buildVariantKeywords(topic: string): string[] {
  const keywords = new Set<string>();
  const normalized = normalizeRetrievalTopic(topic);
  const tokens =
    normalized
      .toLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,47}/gu)
      ?.map((item) => item.trim())
      .filter((item) => item.length >= 3) ?? [];
  if (normalized.length > 0) keywords.add(normalized);
  if (tokens.length >= 2) {
    keywords.add(tokens.slice(0, 4).join(" "));
    keywords.add(tokens.slice(0, 3).join("-"));
  }
  for (const token of tokens.slice(0, 8)) {
    keywords.add(token);
  }
  return [...keywords].slice(0, 10);
}

function resolveRunProfile(
  options: Pick<SubscriptionOptions, "metadataOnly" | "topic" | "message">,
  effectiveTopic: string,
): "fast" | "strict" {
  if (options.metadataOnly === true) return "fast";
  const text = `${options.topic ?? ""} ${options.message ?? ""} ${effectiveTopic}`.trim();
  if (text.length > 0 && FULLTEXT_OPT_OUT_RE.test(text)) return "fast";
  return "strict";
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
    | "topic"
    | "message"
    | "projectId"
    | "maxPapers"
    | "recencyDays"
    | "sources"
    | "candidatePool"
    | "scoreWeights"
    | "metadataOnly"
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
  const retrievalTopic = normalizeRetrievalTopic(effectiveTopic);
  const variantKeywords = buildVariantKeywords(retrievalTopic);

  const preferences = buildPreferencePayload(options);
  const runProfile = resolveRunProfile(options, effectiveTopic);
  const projectId = options.projectId?.trim();
  const candidatePoolBase = resolveCandidatePool(options.candidatePool, preferences.max_papers);
  const candidatePool =
    runProfile === "strict"
      ? Math.max(candidatePoolBase, Math.min(40, Math.max(24, preferences.max_papers * 4)))
      : candidatePoolBase;
  const scoreWeights = options.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
  const scoreWeightsText = formatScoreWeights(scoreWeights);
  const preparePayload = JSON.stringify({
    action: "prepare",
    scope: scopeKey,
    topic: effectiveTopic,
    ...(projectId ? { project_id: projectId } : {}),
    preferences,
  });
  const strictRunLogTemplate =
    runProfile === "strict"
      ? {
          required_core_papers: Math.max(1, Math.min(preferences.max_papers, 3)),
          required_full_text_coverage_pct: 80,
        }
      : {};
  const recordTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: effectiveTopic,
    ...(projectId ? { project_id: projectId } : {}),
    run_profile: runProfile,
    run_id: "run-<unique-id>",
    status: "ok",
    papers: [{ id: "arxiv:2501.12345", title: "Paper title", url: "https://arxiv.org/abs/2501.12345" }],
    knowledge_state: {
      core_papers: [
        {
          id: "arxiv:2501.12345",
          title: "Paper title",
          url: "https://arxiv.org/abs/2501.12345",
          full_text_read: true,
          domain: "machine learning",
          subdomains: ["parameter-efficient fine-tuning"],
          research_goal: "one-sentence goal",
          approach: "one-sentence approach",
          methodology_design: "one-sentence method setup",
          key_contributions: ["contribution 1", "contribution 2"],
          practical_insights: ["insight 1"],
          must_understand_points: ["must-understand 1"],
          limitations: ["limitation 1"],
          evidence_anchors: [
            {
              section: "Method",
              locator: "Eq.(3)",
              claim: "key claim",
              quote: "short quote from paper",
            },
          ],
        },
      ],
      knowledge_changes: [{ type: "NEW", statement: "one concrete change", evidence_ids: ["arxiv:2501.12345"] }],
      hypotheses: [
        {
          statement: "one grounded hypothesis",
          trigger: "TREND",
          dependency_path: ["step 1 grounded in prior result", "step 2 links new evidence"],
          strengths: ["strong empirical signal", "clear implementation path"],
          weaknesses: ["limited external validity", "potential data bias"],
          plan_steps: [
            "Build a reproducible baseline pipeline first (for ML tasks, include a simple baseline such as random forest if applicable).",
            "Implement the proposed method and run controlled comparison.",
            "Run ablation and failure-case analysis, then decide accept/revise/reject.",
          ],
          strict_evaluation: {
            overall_score: 78,
            decision: "accept",
            reason: "Evidence and execution plan are sufficient for immediate validation.",
          },
          novelty: 4,
          feasibility: 4,
          impact: 4,
          evidence_ids: ["arxiv:2501.12345", "arxiv:2501.54321"],
        },
      ],
      run_log: { run_profile: runProfile, notes: "short run note", ...strictRunLogTemplate },
    },
  });
  const recordDegradedTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: effectiveTopic,
    ...(projectId ? { project_id: projectId } : {}),
    run_profile: runProfile,
    run_id: "run-<unique-id>-degraded",
    status: "degraded_quality",
    papers: [{ id: "arxiv:2501.12345", title: "Paper title", url: "https://arxiv.org/abs/2501.12345" }],
    knowledge_state: {
      run_log: { run_profile: runProfile, degraded: true, notes: "quality not fully met in this run", ...strictRunLogTemplate },
    },
    note: "selected papers persisted with degraded quality",
  });
  const recordEmptyTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: effectiveTopic,
    ...(projectId ? { project_id: projectId } : {}),
    run_profile: runProfile,
    run_id: "run-20260309T103000Z-empty",
    status: "empty",
    papers: [],
    knowledge_state: {
      run_log: { run_profile: runProfile, notes: "No suitable paper found in this cycle.", ...strictRunLogTemplate },
    },
    note: "No suitable paper found in incremental pass and fallback representative pass.",
  });
  const variantHintLine =
    variantKeywords.length > 0 ? `- Expansion keywords: ${variantKeywords.join(", ")}` : "- Expansion keywords: (none)";

  if (scheduleKind === "at") {
    return [
      `/research-pipeline Run a focused literature study on \"${effectiveTopic}\" and return up to ${preferences.max_papers} high-value representative papers.`,
      "",
      "Workflow (simple, Markdown-first):",
      "1) Complete 5 steps in this turn: retrieve -> filter -> read -> save metadata -> update knowledge/hypothesis.",
      "2) First call prepare:",
      `${preparePayload}`,
      `3) Build candidate pool around ${candidatePool}; select up to ${preferences.max_papers} credible papers.`,
      `   - Retrieval topic (normalized): ${retrievalTopic}`,
      `   ${variantHintLine}`,
      "   - Filter policy: semantic relevance, not exact string match; include important variants and aliases.",
      "   - If user asks special constraints (foundational-first / avoid benchmark-only / prefer survey or authoritative papers), apply them in filtering and ranking.",
      "   - If core candidates < 3, relax filters and rerun with broader query terms before declaring empty.",
      `4) Reading policy: ${runProfile === "strict" ? "full-text required by default (strict)." : "metadata-only allowed (explicit opt-out detected)."}`,
      "   - Never drop a relevant paper only because full text failed; keep it with full_text_read=false and unread_reason.",
      "5) User-facing answer MUST be concise Markdown:",
      "   - Selected papers (numbered, title + URL + one-line value)",
      "   - Read status (fulltext vs metadata)",
      "   - For each selected paper: domain/subdomains + goal + approach + methodology + contributions + insights + limitations",
      "   - Knowledge updates (NEW/CONFIRM/REVISE/BRIDGE)",
      "   - Hypothesis decision (generated or not + reason)",
      "   - If trigger signals are present (e.g. NEW>=2, or NEW+REVISE>=2, or BRIDGE present), propose 1 grounded hypothesis with >=2 evidence_ids and dependency_path>=2",
      "   - Hypothesis must include: strengths>=2, weaknesses>=2, plan_steps>=3, strict_evaluation (overall_score + decision + reason).",
      "   - Plan must be executable; when task is predictive/modeling, include at least one lightweight baseline idea (e.g., random forest).",
      "6) Persist once via `scientify_literature_state.record` using MINIMAL JSON only:",
      `${recordTemplate}`,
      "7) Soft-gate default: non-fatal quality gaps should keep status=`ok` and be reported as warnings in quality_gate.",
      "8) Execute one immediate reflection follow-up when trigger signals exist (BRIDGE, NEW+REVISE, unread core), and write trace/results back into knowledge_state.",
      "9) Use `degraded_quality` only for fatal gate issues (do not skip record):",
      `${recordDegradedTemplate}`,
      "10) Use `empty` only when no paper is selected after both primary and broadened fallback retrieval:",
      `${recordEmptyTemplate}`,
      "11) After record, call status and include `run_id`/`latest_run_id`.",
      "12) Response policy based on hypothesis gate:",
      "   - Read `status.knowledge_state_summary.hypothesis_gate.accepted` before final answer.",
      "   - If accepted == 0: output factual cycle report only (papers/read-status/changes/gates). Do NOT output speculative roadmap/high-value-routes/deep-dive suggestions.",
      "   - If accepted > 0: include hypothesis details in the current message by default (stable delivery path).",
      "   - If runtime/channel clearly supports multi-send, you may split into two consecutive messages:",
      "     Message 1: short alert (topic + accepted hypothesis count + cycle status).",
      "     Message 2: hypothesis details (statement, evidence_ids, dependency_path, strict evaluation, executable next steps).",
      "Never write placeholders like 'not provided'/'N/A' in core_papers fields. If unavailable, omit the field or set unread_reason.",
      "Do not output large JSON to users; JSON is for tool call only.",
    ].join("\n");
  }

  return [
    `/research-pipeline Run an incremental literature check focused on \"${effectiveTopic}\".`,
    "",
    "Workflow (simple, Markdown-first):",
    "1) Complete 5 steps in this turn: retrieve -> filter -> read -> save metadata -> update knowledge/hypothesis.",
    "2) First call prepare:",
    `${preparePayload}`,
    `3) Build candidate pool around ${candidatePool}; select up to ${preferences.max_papers} credible unseen papers.`,
    `4) Rank with weights (${scoreWeightsText}), while respecting memory hints and dedupe.`,
    `   - Retrieval topic (normalized): ${retrievalTopic}`,
    `   ${variantHintLine}`,
    "   - Filter policy: semantic relevance, not exact string match; include major method variants.",
    "   - If user asks special constraints (foundational-first / avoid benchmark-only / prefer survey or authoritative papers), apply them in filtering and ranking.",
    "   - If selected core papers < 3, broaden query and rerun once before returning empty.",
    `5) Reading policy: ${runProfile === "strict" ? "full-text required by default (strict)." : "metadata-only allowed (explicit opt-out detected)."}`,
    "   - Never drop a relevant paper only because full text failed; keep it with full_text_read=false and unread_reason.",
    "6) User-facing answer MUST be concise Markdown:",
    "   - Selected papers (numbered, title + URL + one-line value)",
    "   - Read status (fulltext vs metadata)",
    "   - For each selected paper: domain/subdomains + goal + approach + methodology + contributions + insights + limitations",
    "   - Knowledge updates (NEW/CONFIRM/REVISE/BRIDGE)",
    "   - Hypothesis decision (generated or not + reason)",
    "   - If trigger signals are present (e.g. NEW>=2, or NEW+REVISE>=2, or BRIDGE present), propose 1 grounded hypothesis with >=2 evidence_ids and dependency_path>=2",
    "   - Hypothesis must include: strengths>=2, weaknesses>=2, plan_steps>=3, strict_evaluation (overall_score + decision + reason).",
    "   - Plan must be executable; when task is predictive/modeling, include at least one lightweight baseline idea (e.g., random forest).",
    "7) Persist once via `scientify_literature_state.record` using MINIMAL JSON only:",
    `${recordTemplate}`,
    "8) Soft-gate default: non-fatal quality gaps should keep status=`ok` and be reported as warnings in quality_gate.",
    "9) Execute one immediate reflection follow-up when trigger signals exist (BRIDGE, NEW+REVISE, unread core), and write trace/results back into knowledge_state.",
    "10) Use `degraded_quality` only for fatal gate issues (do not skip record):",
    `${recordDegradedTemplate}`,
    "11) If both incremental and broadened fallback passes are empty, persist empty:",
    `${recordEmptyTemplate}`,
    "12) After record, call status and include `run_id`/`latest_run_id` for traceability.",
    "13) Response policy based on hypothesis gate:",
    "   - Read `status.knowledge_state_summary.hypothesis_gate.accepted` before final answer.",
    "   - If accepted == 0: output factual cycle report only (papers/read-status/changes/gates). Do NOT output speculative roadmap/high-value-routes/deep-dive suggestions.",
    "   - If accepted > 0: include hypothesis details in the current message by default (stable delivery path).",
    "   - If runtime/channel clearly supports multi-send, you may split into two consecutive messages:",
    "     Message 1: short alert (topic + accepted hypothesis count + cycle status).",
    "     Message 2: hypothesis details (statement, evidence_ids, dependency_path, strict evaluation, executable next steps).",
    "Never write placeholders like 'not provided'/'N/A' in core_papers fields. If unavailable, omit the field or set unread_reason.",
    "Do not output large JSON to users; JSON is for tool call only.",
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
    "- `/research-subscribe daily 08:00 --topic \"LLM alignment\" --metadata-only`",
    "- `/research-subscribe at 1m --message \"Time to drink coffee.\"`",
    "- `/research-subscribe daily 09:00 --no-deliver`",
  ].join("\n");
}

export function withSignature(text: string): string {
  return `${text}\n${SCIENTIFY_SIGNATURE_FOOTER}`;
}

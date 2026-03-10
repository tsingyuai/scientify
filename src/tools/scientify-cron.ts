import { Type } from "@sinclair/typebox";
import type { PluginCommandContext, PluginCommandResult, PluginLogger, PluginRuntime } from "openclaw";
import {
  buildStateScopeKey,
  normalizeDeliveryChannelOverride,
  resolveDeliveryTarget,
} from "../research-subscriptions/delivery.js";
import { parseSubscribeOptions } from "../research-subscriptions/parse.js";
import {
  createResearchSubscribeHandler,
  createResearchSubscriptionsHandler,
  createResearchUnsubscribeHandler,
} from "../research-subscriptions.js";
import { getIncrementalStateStatus, recordIncrementalPush } from "../literature/subscription-state.js";
import { Result } from "./result.js";

export const ScientifyCronToolSchema = Type.Object({
  action: Type.Optional(
    Type.String({
      description: 'Action: "upsert" | "list" | "remove". When omitted, tool infers action from parameters.',
    }),
  ),
  scope: Type.Optional(
    Type.String({
      description: "Scope key for grouping jobs (e.g. user ID or thread ID). Default: global.",
    }),
  ),
  schedule: Type.Optional(
    Type.String({
      description:
        'Schedule expression for upsert. Examples: "daily 08:00 Asia/Shanghai", "weekly mon 09:00", "every 6h", "at 2m", "at 2026-03-04T08:00:00+08:00", "cron 0 9 * * * Asia/Shanghai".',
    }),
  ),
  topic: Type.Optional(
    Type.String({
      description: "Optional research topic override used to build the scheduled task prompt.",
    }),
  ),
  project: Type.Optional(
    Type.String({
      description: "Optional project id for knowledge_state persistence.",
    }),
  ),
  message: Type.Optional(
    Type.String({
      description:
        "Optional plain reminder content for non-research jobs. When set, the scheduled task sends this reminder instead of running the default literature workflow.",
    }),
  ),
  max_papers: Type.Optional(
    Type.Number({
      description: "Optional max papers per run for research subscriptions (1-20).",
    }),
  ),
  recency_days: Type.Optional(
    Type.Number({
      description: "Optional recency preference in days for research subscriptions.",
    }),
  ),
  candidate_pool: Type.Optional(
    Type.Number({
      description: "Optional candidate pool size before Top-K selection (3-50).",
    }),
  ),
  score_weights: Type.Optional(
    Type.Object({
      relevance: Type.Optional(Type.Number({ description: "Weight for topical relevance (0-100)." })),
      novelty: Type.Optional(Type.Number({ description: "Weight for novelty/freshness (0-100)." })),
      authority: Type.Optional(Type.Number({ description: "Weight for source authority (0-100)." })),
      actionability: Type.Optional(Type.Number({ description: "Weight for practical actionability (0-100)." })),
    }),
  ),
  sources: Type.Optional(
    Type.Array(
      Type.String({
        description: "Optional preferred search sources, e.g. ['arxiv','openalex'].",
      }),
    ),
  ),
  channel: Type.Optional(
    Type.String({
      description:
        'Optional delivery channel override (e.g. "feishu", "telegram", "last", "webui", "tui"). "webui"/"tui" are aliases of "last". If set to a concrete channel (not "last"), provide `to` as well.',
    }),
  ),
  to: Type.Optional(
    Type.String({
      description:
        'Delivery target override (channel-specific user/chat id). Required when `channel` is a concrete value like "feishu" or "telegram".',
    }),
  ),
  no_deliver: Type.Optional(
    Type.Boolean({
      description: "If true, run in background without push delivery.",
    }),
  ),
  metadata_only: Type.Optional(
    Type.Boolean({
      description:
        "If true, allow metadata-only reading (skip full-text-first strict default). Use only when user explicitly requests it.",
    }),
  ),
  run_now: Type.Optional(
    Type.Boolean({
      description:
        "If true (upsert only), trigger one immediate run after job creation/update; for research tasks, also return a status_json snapshot.",
    }),
  ),
  job_id: Type.Optional(
    Type.String({
      description: "Specific job id to remove (only used when action=remove).",
    }),
  ),
});

type CronToolDeps = {
  runtime: PluginRuntime;
  logger: PluginLogger;
};

const RESEARCH_MESSAGE_HINT_RE =
  /\b(research|literature|paper|papers|survey|arxiv|openalex|citation|digest|summary|track|tracking|monitor|update|incremental|report|plan)\b|文献|论文|调研|研究|综述|检索|引用|增量|更新|跟踪|追踪|推送|简报|规划/u;

const RESEARCH_WORKFLOW_VERB_RE =
  /\b(search|survey|analy[sz]e|filter|track|monitor|update|summari[sz]e|report|plan)\b|检索|调研|筛选|跟踪|追踪|更新|总结|汇报|规划/u;

function readStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

function sanitizeProjectId(raw: string): string {
  const trimmed = raw.trim();
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "project";
}

function normalizeScheduleInput(raw: string | undefined, runNow: boolean): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();

  if (["now", "immediate", "immediately", "right now", "asap", "立即", "马上", "立刻"].includes(lower)) {
    // run_now already triggers immediate execution; keep a valid persistent schedule.
    return runNow ? "daily 09:00 Asia/Shanghai" : "at 2m";
  }

  if (/^\d+[smhdw]$/i.test(trimmed)) {
    return `at ${trimmed}`;
  }

  if (/^every\s*hour$/i.test(trimmed) || /^每小时$/u.test(trimmed)) {
    return "every 1h";
  }

  // Guard against `at <past-time>` generated by model/tool callers.
  if (lower.startsWith("at ")) {
    const when = trimmed.slice(3).trim();
    if (when) {
      const atMs = Date.parse(when);
      if (!Number.isNaN(atMs) && atMs <= Date.now()) {
        return runNow ? "daily 09:00 Asia/Shanghai" : "at 2m";
      }
    }
  }

  return trimmed;
}

function inferAction(params: Record<string, unknown>): "upsert" | "list" | "remove" | undefined {
  const raw = readStringParam(params, "action")?.toLowerCase();
  if (raw) {
    if (["upsert", "create", "add", "set", "update", "start", "schedule", "new", "insert"].includes(raw)) {
      return "upsert";
    }
    if (["list", "show", "ls", "status"].includes(raw)) {
      return "list";
    }
    if (["remove", "delete", "cancel", "rm", "unsubscribe"].includes(raw)) {
      return "remove";
    }
  }

  const hasJobId = Boolean(readStringParam(params, "job_id"));
  const hasUpsertSignals =
    Boolean(readStringParam(params, "schedule")) ||
    Boolean(readStringParam(params, "topic")) ||
    Boolean(readStringParam(params, "message")) ||
    Boolean(readStringParam(params, "project")) ||
    readBooleanParam(params, "run_now") ||
    readBooleanParam(params, "no_deliver") ||
    readBooleanParam(params, "metadata_only") ||
    readNumberParam(params, "max_papers") !== undefined ||
    readNumberParam(params, "recency_days") !== undefined ||
    readNumberParam(params, "candidate_pool") !== undefined ||
    Boolean(readStringParam(params, "channel")) ||
    Boolean(readStringParam(params, "to"));

  if (hasUpsertSignals) return "upsert";
  if (hasJobId) return "remove";
  return "list";
}

function readBooleanParam(params: Record<string, unknown>, key: string): boolean {
  return params[key] === true;
}

function readNumberParam(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function readScoreWeightsParam(params: Record<string, unknown>): string | undefined {
  const raw = params.score_weights;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;

  const entries: Array<[string, number]> = [];
  const pushIfValid = (key: string) => {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    entries.push([key, value]);
  };

  pushIfValid("relevance");
  pushIfValid("novelty");
  pushIfValid("authority");
  pushIfValid("actionability");

  if (entries.length === 0) return undefined;
  return entries.map(([key, value]) => `${key}:${value}`).join(",");
}

function quoteArg(value: string): string {
  if (/^[a-zA-Z0-9_./:+-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizeScope(raw: string | undefined): string {
  const base = (raw ?? "global")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "global";
}

function parseJobIdFromResultText(text: string): string | undefined {
  const fenced = text.match(/Job ID:\s*`([^`]+)`/i);
  if (fenced?.[1]) return fenced[1].trim();
  const plain = text.match(/Job ID:\s*([a-z0-9-]{8,})/i);
  if (plain?.[1]) return plain[1].trim();
  return undefined;
}

function buildToolContext(scope: string, args: string, commandBody: string): PluginCommandContext {
  return {
    senderId: `tool_${scope}`,
    channel: "tool",
    isAuthorizedSender: true,
    args,
    commandBody,
    config: {},
  };
}

function getResultText(result: PluginCommandResult): string {
  return result.text ?? result.error ?? "";
}

function getResultError(result: PluginCommandResult): string | undefined {
  const maybe = result.error?.trim();
  return maybe && maybe.length > 0 ? maybe : undefined;
}

function shouldPromoteMessageToTopic(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (!RESEARCH_MESSAGE_HINT_RE.test(text)) return false;
  if (RESEARCH_WORKFLOW_VERB_RE.test(text)) return true;
  return text.length >= 24;
}

function deriveTopicFromResearchMessage(message: string): string {
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

function resolveTopicAndMessage(params: Record<string, unknown>): {
  topic?: string;
  message?: string;
} {
  let topic = readStringParam(params, "topic");
  let message = readStringParam(params, "message");
  if (!topic && message && shouldPromoteMessageToTopic(message)) {
    topic = deriveTopicFromResearchMessage(message);
    message = undefined;
  }
  return { topic, message };
}

function parseIncrementalScopeFromResultText(text: string): string | undefined {
  const fenced = text.match(/Incremental Scope:\s*`([^`]+)`/i);
  if (fenced?.[1]) return fenced[1].trim();
  const plain = text.match(/Incremental Scope:\s*([^\n]+)/i);
  if (plain?.[1]) return plain[1].trim();
  return undefined;
}

type IncrementalStatus = Awaited<ReturnType<typeof getIncrementalStateStatus>>;

function latestRunId(status: IncrementalStatus | undefined): string | undefined {
  return status?.recentChangeStats[0]?.runId;
}

function lastRunAtMs(status: IncrementalStatus | undefined): number {
  return status?.knowledgeStateSummary?.lastRunAtMs ?? 0;
}

function lastPushedAtMs(status: IncrementalStatus | undefined): number {
  return status?.lastPushedAtMs ?? 0;
}

function hasFreshRun(before: IncrementalStatus | undefined, after: IncrementalStatus): boolean {
  const beforeRunId = latestRunId(before);
  const afterRunId = latestRunId(after);
  if (!before) {
    return after.totalRuns > 0 || Boolean(afterRunId) || lastRunAtMs(after) > 0 || lastPushedAtMs(after) > 0;
  }
  if (after.totalRuns > before.totalRuns) return true;
  if (afterRunId && beforeRunId && afterRunId !== beforeRunId) return true;
  if (!beforeRunId && afterRunId) return true;
  if (lastRunAtMs(after) > lastRunAtMs(before)) return true;
  if (lastPushedAtMs(after) > lastPushedAtMs(before)) return true;
  return false;
}

function buildFallbackRunId(jobId: string): string {
  const ts = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "t").replace("Z", "z");
  return `cron-${jobId}-${ts}-autofallback`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCronRunMarker(raw: string | undefined): { ok?: boolean; ran?: boolean; reason?: string } | undefined {
  const text = (raw ?? "").trim();
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      ok: typeof parsed.ok === "boolean" ? parsed.ok : undefined,
      ran: typeof parsed.ran === "boolean" ? parsed.ran : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return undefined;
  }
}

function serializeRunStatusSnapshot(
  status: Awaited<ReturnType<typeof getIncrementalStateStatus>>,
): Record<string, unknown> {
  const projectRecentPapers = status.knowledgeStateSummary?.recentPapers ?? [];
  const globalById = new Map(status.recentPapers.map((paper) => [paper.id, paper] as const));
  return {
    scope: status.scope,
    topic: status.topic,
    topic_key: status.topicKey,
    known_paper_count: status.knownPaperCount,
    total_runs: status.totalRuns,
    last_status: status.lastStatus ?? null,
    last_pushed_at_ms: status.lastPushedAtMs ?? null,
    latest_run_id: status.recentChangeStats[0]?.runId ?? null,
    knowledge_state_summary: status.knowledgeStateSummary
      ? {
          project_id: status.knowledgeStateSummary.projectId,
          stream_key: status.knowledgeStateSummary.streamKey,
          run_profile: status.knowledgeStateSummary.runProfile,
          total_runs: status.knowledgeStateSummary.totalRuns,
          total_hypotheses: status.knowledgeStateSummary.totalHypotheses,
          knowledge_topics_count: status.knowledgeStateSummary.knowledgeTopicsCount,
          paper_notes_count: status.knowledgeStateSummary.paperNotesCount,
          trigger_state: {
            consecutive_new_revise_days: status.knowledgeStateSummary.triggerState.consecutiveNewReviseDays,
            bridge_count_7d: status.knowledgeStateSummary.triggerState.bridgeCount7d,
            unread_core_backlog: status.knowledgeStateSummary.triggerState.unreadCoreBacklog,
            last_updated_at_ms: status.knowledgeStateSummary.triggerState.lastUpdatedAtMs,
          },
          quality_gate: {
            passed: status.knowledgeStateSummary.qualityGate.passed,
            full_text_coverage_pct: status.knowledgeStateSummary.qualityGate.fullTextCoveragePct,
            evidence_binding_rate_pct: status.knowledgeStateSummary.qualityGate.evidenceBindingRatePct,
            citation_error_rate_pct: status.knowledgeStateSummary.qualityGate.citationErrorRatePct,
            reasons: status.knowledgeStateSummary.qualityGate.reasons,
          },
          hypothesis_gate: {
            accepted: status.knowledgeStateSummary.hypothesisGate.accepted,
            rejected: status.knowledgeStateSummary.hypothesisGate.rejected,
            rejection_reasons: status.knowledgeStateSummary.hypothesisGate.rejectionReasons,
          },
          last_reflection_tasks: status.knowledgeStateSummary.lastReflectionTasks,
        }
      : null,
    recent_change_stats: status.recentChangeStats.map((item) => ({
      day: item.day,
      run_id: item.runId,
      new_count: item.newCount,
      confirm_count: item.confirmCount,
      revise_count: item.reviseCount,
      bridge_count: item.bridgeCount,
    })),
    recent_papers: (projectRecentPapers.length > 0 ? projectRecentPapers : status.recentPapers).map((paper) => {
      const paperId = typeof paper.id === "string" ? paper.id : "";
      const fromGlobal = paperId ? globalById.get(paperId) : undefined;
      return {
        id: paperId || null,
        title: paper.title ?? null,
        url: paper.url ?? null,
        last_score:
          "lastScore" in paper && typeof paper.lastScore === "number"
            ? paper.lastScore
            : "score" in paper && typeof paper.score === "number"
              ? paper.score
              : fromGlobal?.lastScore ?? null,
        last_reason:
          "lastReason" in paper && typeof paper.lastReason === "string"
            ? paper.lastReason
            : "reason" in paper && typeof paper.reason === "string"
              ? paper.reason
              : fromGlobal?.lastReason ?? null,
        first_pushed_at_ms:
          "firstPushedAtMs" in paper && typeof paper.firstPushedAtMs === "number"
            ? paper.firstPushedAtMs
            : fromGlobal?.firstPushedAtMs ?? null,
        last_pushed_at_ms:
          "lastPushedAtMs" in paper && typeof paper.lastPushedAtMs === "number"
            ? paper.lastPushedAtMs
            : fromGlobal?.lastPushedAtMs ?? null,
        push_count:
          "pushCount" in paper && typeof paper.pushCount === "number"
            ? paper.pushCount
            : fromGlobal?.pushCount ?? null,
      };
    }),
    global_recent_papers: status.recentPapers.map((paper) => ({
      id: paper.id,
      title: paper.title ?? null,
      url: paper.url ?? null,
      last_score: paper.lastScore ?? null,
      last_reason: paper.lastReason ?? null,
      first_pushed_at_ms: paper.firstPushedAtMs,
      last_pushed_at_ms: paper.lastPushedAtMs,
      push_count: paper.pushCount,
    })),
    knowledge_state_missing_reason: status.knowledgeStateMissingReason ?? null,
  };
}

function buildSubscribeArgs(params: Record<string, unknown>): string {
  const parts: string[] = [];
  const schedule =
    normalizeScheduleInput(readStringParam(params, "schedule"), readBooleanParam(params, "run_now")) ??
    "daily 09:00 Asia/Shanghai";
  parts.push(schedule);

  const resolved = resolveTopicAndMessage(params);
  const topic = resolved.topic;
  const message = resolved.message;

  if (topic) {
    parts.push("--topic", quoteArg(topic));
  }

  const project = readStringParam(params, "project");
  if (project) {
    parts.push("--project", quoteArg(sanitizeProjectId(project)));
  }

  if (message) {
    parts.push("--message", quoteArg(message));
  }

  const maxPapers = readNumberParam(params, "max_papers");
  if (maxPapers !== undefined) {
    parts.push("--max-papers", String(Math.floor(maxPapers)));
  }

  const recencyDays = readNumberParam(params, "recency_days");
  if (recencyDays !== undefined) {
    parts.push("--recency-days", String(Math.floor(recencyDays)));
  }

  const candidatePool = readNumberParam(params, "candidate_pool");
  if (candidatePool !== undefined) {
    parts.push("--candidate-pool", String(Math.floor(candidatePool)));
  }

  const scoreWeights = readScoreWeightsParam(params);
  if (scoreWeights) {
    parts.push("--score-weights", quoteArg(scoreWeights));
  }

  const rawSources = params.sources;
  if (Array.isArray(rawSources)) {
    const sources = rawSources
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
    if (sources.length > 0) {
      parts.push("--sources", quoteArg([...new Set(sources)].join(",")));
    }
  }

  const channel = readStringParam(params, "channel");
  if (channel) {
    parts.push("--channel", quoteArg(normalizeDeliveryChannelOverride(channel)));
  }

  const to = readStringParam(params, "to");
  if (to) {
    parts.push("--to", quoteArg(to));
  }

  if (readBooleanParam(params, "no_deliver")) {
    parts.push("--no-deliver");
  }

  if (readBooleanParam(params, "metadata_only")) {
    parts.push("--metadata-only");
  }

  return parts.join(" ");
}

export function createScientifyCronTool(deps: CronToolDeps) {
  const subscribe = createResearchSubscribeHandler(deps);
  const list = createResearchSubscriptionsHandler(deps);
  const unsubscribe = createResearchUnsubscribeHandler(deps);

  return {
    label: "Scientify Cron",
    name: "scientify_cron_job",
    description:
      "Manage Scientify scheduled jobs (research digests or plain reminders). Supports create/update (upsert), list, and remove.",
    parameters: ScientifyCronToolSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = rawArgs as Record<string, unknown>;
      const action = inferAction(params);
      if (!action) {
        return Result.err(
          "invalid_params",
          'Unable to infer action. Use one of: action="upsert" | "list" | "remove".',
        );
      }
      const scope = normalizeScope(readStringParam(params, "scope"));

      try {
        if (action === "upsert") {
          // In tool context, delivery target may be unavailable unless caller explicitly sets channel/to.
          // Default to no-deliver when delivery is unspecified to avoid hard failure on creation.
          const hasDeliveryHints = Boolean(readStringParam(params, "channel")) || Boolean(readStringParam(params, "to"));
          const upsertParams =
            readBooleanParam(params, "no_deliver") || hasDeliveryHints ? params : { ...params, no_deliver: true };
          const args = buildSubscribeArgs(upsertParams);
          const ctx = buildToolContext(scope, args, `/research-subscribe ${args}`);
          let expectedStateScopeKey: string | undefined;
          try {
            const parsed = parseSubscribeOptions(args);
            if (!("error" in parsed)) {
              const delivery = resolveDeliveryTarget(ctx, parsed);
              if (!("error" in delivery)) {
                expectedStateScopeKey = buildStateScopeKey(ctx, delivery);
              }
            }
          } catch {
            // keep best-effort behavior; fallback to parsed text scope or caller scope
          }
          const res = await subscribe(ctx);
          const err = getResultError(res);
          if (err) {
            return Result.err("operation_failed", err);
          }
          const text = getResultText(res);
          const jobId = parseJobIdFromResultText(text);
          const resolved = resolveTopicAndMessage(upsertParams);
          const incrementalScope = parseIncrementalScopeFromResultText(text);
          const project = readStringParam(upsertParams, "project");
          const runNow = readBooleanParam(upsertParams, "run_now");
          if (runNow && jobId) {
            const statusScope = expectedStateScopeKey ?? incrementalScope ?? scope;
            const beforeStatus =
              resolved.topic
                ? await getIncrementalStateStatus({
                    scope: statusScope,
                    topic: resolved.topic,
                    ...(project ? { projectId: project } : {}),
                  }).catch(() => undefined)
                : undefined;

            const runArgsPrimary = [
              "openclaw",
              "cron",
              "run",
              jobId,
              "--expect-final",
              "--timeout",
              "900000",
            ];
            let runRes = await deps.runtime.system.runCommandWithTimeout(runArgsPrimary, {
              timeoutMs: 920_000,
            });
            if (
              runRes.code !== 0 &&
              /unknown option '--expect-final'|unknown option \"--expect-final\"|unknown option\s+--expect-final/i.test(
                runRes.stderr || "",
              )
            ) {
              // Backward compatibility for older OpenClaw versions.
              runRes = await deps.runtime.system.runCommandWithTimeout(
                ["openclaw", "cron", "run", jobId],
                { timeoutMs: 600_000 },
              );
            }
            let runAlreadyInProgress = false;
            if (runRes.code !== 0) {
              const marker = parseCronRunMarker(runRes.stdout) ?? parseCronRunMarker(runRes.stderr);
              if (marker?.ok === true && marker?.ran === false && marker?.reason === "already-running") {
                runAlreadyInProgress = true;
              } else {
                return Result.err(
                  "operation_failed",
                  runRes.stderr || runRes.stdout || `cron run failed for job ${jobId}`,
                );
              }
            }
            let statusSnapshot: Record<string, unknown> | undefined;
            if (resolved.topic) {
              try {
                let status: IncrementalStatus | undefined;
                const deadline = Date.now() + (runAlreadyInProgress ? 300_000 : 120_000);
                while (Date.now() <= deadline) {
                  const fetched = await getIncrementalStateStatus({
                    scope: statusScope,
                    topic: resolved.topic,
                    ...(project ? { projectId: project } : {}),
                  }).catch(() => undefined);
                  if (fetched && hasFreshRun(beforeStatus, fetched)) {
                    status = fetched;
                    break;
                  }
                  await sleep(1_000);
                }
                if (!status) {
                  const fallbackError =
                    "run_now completed but no new persisted research run was detected. Auto-persisted fallback error run.";
                  try {
                    const persisted = await recordIncrementalPush({
                      scope: statusScope,
                      topic: resolved.topic,
                      ...(project ? { projectId: project } : {}),
                      status: "degraded_quality",
                      runId: buildFallbackRunId(jobId),
                      note: fallbackError,
                      papers: [],
                      knowledgeState: {
                        corePapers: [],
                        explorationPapers: [],
                        explorationTrace: [],
                        knowledgeChanges: [],
                        knowledgeUpdates: [],
                        hypotheses: [],
                        runLog: {
                          runProfile: readBooleanParam(upsertParams, "metadata_only") ? "fast" : "strict",
                          error:
                            "run_now completed but the agent turn did not persist via scientify_literature_state.record",
                          notes:
                            "Fallback persisted by scientify_cron_job guard to avoid stale status response.",
                          tempCleanupStatus: "not_needed",
                        },
                      },
                    });

                    status = await getIncrementalStateStatus({
                      scope: statusScope,
                      topic: resolved.topic,
                      ...(project ? { projectId: project } : {}),
                    }).catch(() => undefined);

                    if (!status || !hasFreshRun(beforeStatus, status)) {
                      return Result.err(
                        "operation_failed",
                        `${fallbackError} fallback_run_id=${persisted.runId}, but fresh status still unavailable.`,
                      );
                    }
                  } catch (persistError) {
                    return Result.err(
                      "operation_failed",
                      `run_now completed but no new persisted research run was detected. Refusing stale status response. fallback_persist_error=${persistError instanceof Error ? persistError.message : String(persistError)}`,
                    );
                  }
                }
                statusSnapshot = serializeRunStatusSnapshot(status);
              } catch (statusError) {
                statusSnapshot = {
                  error:
                    statusError instanceof Error ? statusError.message : String(statusError),
                };
              }
            }
            return Result.ok({
              action,
              scope,
              job_id: jobId,
              run_now: true,
              run_result: runRes.stdout.trim(),
              ...(statusSnapshot ? { status_json: statusSnapshot } : {}),
              result: text,
            });
          }
          return Result.ok({ action, scope, ...(jobId ? { job_id: jobId } : {}), result: text });
        }

        if (action === "list") {
          const ctx = buildToolContext(scope, "", "/research-subscriptions");
          const res = await list(ctx);
          const err = getResultError(res);
          if (err) {
            return Result.err("operation_failed", err);
          }
          const text = getResultText(res);
          return Result.ok({ action, scope, result: text });
        }

        if (action === "remove") {
          const jobId = readStringParam(params, "job_id") ?? "";
          const ctx = buildToolContext(scope, jobId, jobId ? `/research-unsubscribe ${jobId}` : "/research-unsubscribe");
          const res = await unsubscribe(ctx);
          const err = getResultError(res);
          if (err) {
            return Result.err("operation_failed", err);
          }
          const text = getResultText(res);
          return Result.ok({ action, scope, result: text });
        }

        return Result.err(
          "invalid_params",
          'Invalid action. Use one of: "upsert", "list", "remove".',
        );
      } catch (error) {
        deps.logger.warn(
          `[scientify-cron-tool] ${action || "unknown"} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return Result.err(
          "runtime_error",
          `scientify_cron_job failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

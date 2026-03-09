import { Type } from "@sinclair/typebox";
import type { PluginCommandContext, PluginCommandResult, PluginLogger, PluginRuntime } from "openclaw";
import { normalizeDeliveryChannelOverride } from "../research-subscriptions/delivery.js";
import {
  createResearchSubscribeHandler,
  createResearchSubscriptionsHandler,
  createResearchUnsubscribeHandler,
} from "../research-subscriptions.js";
import { Result } from "./result.js";

export const ScientifyCronToolSchema = Type.Object({
  action: Type.String({
    description: 'Action: "upsert" | "list" | "remove".',
  }),
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
  run_now: Type.Optional(
    Type.Boolean({
      description:
        "If true (upsert only), trigger one immediate run after job creation/update and return the run result handle.",
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

function buildSubscribeArgs(params: Record<string, unknown>): string {
  const parts: string[] = [];
  const schedule = readStringParam(params, "schedule") ?? "daily 09:00 Asia/Shanghai";
  parts.push(schedule);

  let topic = readStringParam(params, "topic");
  let message = readStringParam(params, "message");

  if (!topic && message && shouldPromoteMessageToTopic(message)) {
    topic = deriveTopicFromResearchMessage(message);
    message = undefined;
  }

  if (topic) {
    parts.push("--topic", quoteArg(topic));
  }

  const project = readStringParam(params, "project");
  if (project) {
    parts.push("--project", quoteArg(project));
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
      const action = (readStringParam(params, "action") ?? "").toLowerCase();
      const scope = normalizeScope(readStringParam(params, "scope"));

      try {
        if (action === "upsert") {
          const args = buildSubscribeArgs(params);
          const ctx = buildToolContext(scope, args, `/research-subscribe ${args}`);
          const res = await subscribe(ctx);
          const err = getResultError(res);
          if (err) {
            return Result.err("operation_failed", err);
          }
          const text = getResultText(res);
          const jobId = parseJobIdFromResultText(text);
          const runNow = readBooleanParam(params, "run_now");
          if (runNow && jobId) {
            let runRes = await deps.runtime.system.runCommandWithTimeout(
              ["openclaw", "cron", "run", jobId, "--json"],
              { timeoutMs: 120_000 },
            );
            if (
              runRes.code !== 0 &&
              /unknown option '--json'|unknown option \"--json\"|unknown option\s+--json/i.test(runRes.stderr || "")
            ) {
              runRes = await deps.runtime.system.runCommandWithTimeout(
                ["openclaw", "cron", "run", jobId],
                { timeoutMs: 120_000 },
              );
            }
            if (runRes.code !== 0) {
              return Result.err(
                "operation_failed",
                runRes.stderr || `cron run failed for job ${jobId}`,
              );
            }
            return Result.ok({
              action,
              scope,
              job_id: jobId,
              run_now: true,
              run_result: runRes.stdout.trim(),
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

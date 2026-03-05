import { Type } from "@sinclair/typebox";
import {
  getIncrementalStateStatus,
  prepareIncrementalState,
  recordIncrementalPush,
  recordUserFeedback,
  type FeedbackSignal,
  type LightweightPreferences,
} from "../literature/subscription-state.js";
import { Result } from "./result.js";

const PreferencesSchema = Type.Optional(
  Type.Object({
    max_papers: Type.Optional(
      Type.Number({
        description: "Maximum number of papers to push each run (1-20).",
      }),
    ),
    recency_days: Type.Optional(
      Type.Number({
        description: "Optional recency preference in days for candidate retrieval.",
      }),
    ),
    sources: Type.Optional(
      Type.Array(
        Type.String({
          description: "Preferred search sources, for example: arxiv, openalex.",
        }),
      ),
    ),
  }),
);

const PaperSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "Stable paper id, such as arxiv:2501.12345 or doi:10.xxxx/..." })),
  title: Type.Optional(Type.String({ description: "Paper title." })),
  url: Type.Optional(Type.String({ description: "Source URL for traceability." })),
  score: Type.Optional(
    Type.Number({
      description: "Optional internal ranking score for backend logging (for example 0-100).",
    }),
  ),
  reason: Type.Optional(
    Type.String({
      description: "Optional internal ranking rationale for backend logging.",
    }),
  ),
});

export const ScientifyLiteratureStateToolSchema = Type.Object({
  action: Type.String({
    description: 'Action: "prepare" | "record" | "feedback" | "status".',
  }),
  scope: Type.String({
    description: "Scope key used to isolate user/channel state.",
  }),
  topic: Type.String({
    description: "Research topic text.",
  }),
  preferences: PreferencesSchema,
  papers: Type.Optional(
    Type.Array(PaperSchema, {
      description: "Papers to mark as pushed when action=record.",
    }),
  ),
  status: Type.Optional(
    Type.String({
      description: "Run status for action=record, for example: ok, empty, error.",
    }),
  ),
  run_id: Type.Optional(
    Type.String({
      description: "Optional cron run/session id for traceability.",
    }),
  ),
  note: Type.Optional(
    Type.String({
      description: "Optional note for this record.",
    }),
  ),
  signal: Type.Optional(
    Type.String({
      description: 'Feedback signal for action=feedback: "read" | "skip" | "star".',
    }),
  ),
  paper: Type.Optional(
    Type.Object({
      id: Type.Optional(Type.String({ description: "Optional paper id for feedback context." })),
      title: Type.Optional(Type.String({ description: "Optional paper title for feedback context." })),
      url: Type.Optional(Type.String({ description: "Optional paper URL for feedback context." })),
    }),
  ),
  source: Type.Optional(
    Type.String({
      description: "Optional source hint for feedback (e.g. arxiv/openalex/domain).",
    }),
  ),
  tags: Type.Optional(
    Type.Array(
      Type.String({
        description: "Optional feedback tags, e.g. [\"physics simulation\", \"agent\"].",
      }),
    ),
  ),
});

function readStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPreferences(params: Record<string, unknown>): Partial<LightweightPreferences> | undefined {
  const raw = params.preferences;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;

  const maxRaw = record.max_papers;
  const recencyRaw = record.recency_days;
  const sourcesRaw = record.sources;

  const maxPapers = typeof maxRaw === "number" && Number.isFinite(maxRaw) ? maxRaw : undefined;
  const recencyDays = typeof recencyRaw === "number" && Number.isFinite(recencyRaw) ? recencyRaw : undefined;
  const sources =
    Array.isArray(sourcesRaw) && sourcesRaw.length > 0
      ? sourcesRaw
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : undefined;

  if (maxPapers === undefined && recencyDays === undefined && (!sources || sources.length === 0)) {
    return undefined;
  }

  return {
    ...(maxPapers !== undefined ? { maxPapers } : {}),
    ...(recencyDays !== undefined ? { recencyDays } : {}),
    ...(sources && sources.length > 0 ? { sources } : {}),
  };
}

function readPapers(params: Record<string, unknown>): Array<{
  id?: string;
  title?: string;
  url?: string;
  score?: number;
  reason?: string;
}> {
  const raw = params.papers;
  if (!Array.isArray(raw)) return [];
  const papers: Array<{ id?: string; title?: string; url?: string; score?: number; reason?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : undefined;
    const title = typeof record.title === "string" ? record.title.trim() : undefined;
    const url = typeof record.url === "string" ? record.url.trim() : undefined;
    const score =
      typeof record.score === "number" && Number.isFinite(record.score)
        ? record.score
        : undefined;
    const reason = typeof record.reason === "string" ? record.reason.trim() : undefined;
    papers.push({
      ...(id ? { id } : {}),
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(reason ? { reason } : {}),
    });
  }
  return papers;
}

function readFeedbackSignal(params: Record<string, unknown>): FeedbackSignal | undefined {
  const raw = readStringParam(params, "signal")?.toLowerCase();
  if (raw === "read" || raw === "skip" || raw === "star") return raw;
  return undefined;
}

function readFeedbackPaper(params: Record<string, unknown>): { id?: string; title?: string; url?: string } | undefined {
  const raw = params.paper;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : undefined;
  const title = typeof record.title === "string" ? record.title.trim() : undefined;
  const url = typeof record.url === "string" ? record.url.trim() : undefined;
  if (!id && !title && !url) return undefined;
  return {
    ...(id ? { id } : {}),
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
  };
}

function readStringList(params: Record<string, unknown>, key: string): string[] | undefined {
  const raw = params[key];
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return values.length > 0 ? values : undefined;
}

export function createScientifyLiteratureStateTool() {
  return {
    label: "Scientify Literature State",
    name: "scientify_literature_state",
    description:
      "Manage incremental literature state for subscriptions: prepare dedupe context, record pushed papers, persist lightweight feedback memory, and query status.",
    parameters: ScientifyLiteratureStateToolSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = (rawArgs ?? {}) as Record<string, unknown>;
      const action = (readStringParam(params, "action") ?? "").toLowerCase();
      const scope = readStringParam(params, "scope");
      const topic = readStringParam(params, "topic");
      const preferences = readPreferences(params);

      if (!scope || !topic) {
        return Result.err("invalid_params", "Both `scope` and `topic` are required.");
      }

      try {
        if (action === "prepare") {
          const prepared = await prepareIncrementalState({ scope, topic, preferences });
          return Result.ok({
            action,
            scope: prepared.scope,
            topic: prepared.topic,
            topic_key: prepared.topicKey,
            preferences: {
              max_papers: prepared.preferences.maxPapers,
              recency_days: prepared.preferences.recencyDays,
              sources: prepared.preferences.sources,
            },
            memory_hints: {
              preferred_keywords: prepared.memoryHints.preferredKeywords,
              avoided_keywords: prepared.memoryHints.avoidedKeywords,
              preferred_sources: prepared.memoryHints.preferredSources,
              avoided_sources: prepared.memoryHints.avoidedSources,
              feedback_counts: prepared.memoryHints.feedbackCounts,
              last_feedback_at_ms: prepared.memoryHints.lastFeedbackAtMs ?? null,
            },
            exclude_paper_ids: prepared.excludePaperIds,
            known_paper_count: prepared.knownPaperCount,
            last_pushed_at_ms: prepared.lastPushedAtMs ?? null,
          });
        }

        if (action === "record") {
          const papers = readPapers(params);
          const status = readStringParam(params, "status");
          const runId = readStringParam(params, "run_id");
          const note = readStringParam(params, "note");
          const recorded = await recordIncrementalPush({
            scope,
            topic,
            preferences,
            status,
            runId,
            note,
            papers,
          });
          return Result.ok({
            action,
            scope: recorded.scope,
            topic: recorded.topic,
            topic_key: recorded.topicKey,
            preferences: {
              max_papers: recorded.preferences.maxPapers,
              recency_days: recorded.preferences.recencyDays,
              sources: recorded.preferences.sources,
            },
            memory_hints: {
              preferred_keywords: recorded.memoryHints.preferredKeywords,
              avoided_keywords: recorded.memoryHints.avoidedKeywords,
              preferred_sources: recorded.memoryHints.preferredSources,
              avoided_sources: recorded.memoryHints.avoidedSources,
              feedback_counts: recorded.memoryHints.feedbackCounts,
              last_feedback_at_ms: recorded.memoryHints.lastFeedbackAtMs ?? null,
            },
            recorded_papers: recorded.recordedPapers,
            total_known_papers: recorded.totalKnownPapers,
            pushed_at_ms: recorded.pushedAtMs,
          });
        }

        if (action === "feedback") {
          const signal = readFeedbackSignal(params);
          if (!signal) {
            return Result.err("invalid_params", 'Action "feedback" requires `signal` as one of: read, skip, star.');
          }

          const runId = readStringParam(params, "run_id");
          const note = readStringParam(params, "note");
          const source = readStringParam(params, "source");
          const tags = readStringList(params, "tags");
          const paper = readFeedbackPaper(params);

          const feedback = await recordUserFeedback({
            scope,
            topic,
            preferences,
            feedback: {
              signal,
              ...(paper ? { paper } : {}),
              ...(source ? { source } : {}),
              ...(tags ? { tags } : {}),
              ...(note ? { note } : {}),
              ...(runId ? { runId } : {}),
            },
          });

          return Result.ok({
            action,
            scope: feedback.scope,
            topic: feedback.topic,
            topic_key: feedback.topicKey,
            signal: feedback.signal,
            preferences: {
              max_papers: feedback.preferences.maxPapers,
              recency_days: feedback.preferences.recencyDays,
              sources: feedback.preferences.sources,
            },
            memory_hints: {
              preferred_keywords: feedback.memoryHints.preferredKeywords,
              avoided_keywords: feedback.memoryHints.avoidedKeywords,
              preferred_sources: feedback.memoryHints.preferredSources,
              avoided_sources: feedback.memoryHints.avoidedSources,
              feedback_counts: feedback.memoryHints.feedbackCounts,
              last_feedback_at_ms: feedback.memoryHints.lastFeedbackAtMs ?? null,
            },
            updated_at_ms: feedback.updatedAtMs,
          });
        }

        if (action === "status") {
          const status = await getIncrementalStateStatus({ scope, topic });
          return Result.ok({
            action,
            scope: status.scope,
            topic: status.topic,
            topic_key: status.topicKey,
            preferences: {
              max_papers: status.preferences.maxPapers,
              recency_days: status.preferences.recencyDays,
              sources: status.preferences.sources,
            },
            memory_hints: {
              preferred_keywords: status.memoryHints.preferredKeywords,
              avoided_keywords: status.memoryHints.avoidedKeywords,
              preferred_sources: status.memoryHints.preferredSources,
              avoided_sources: status.memoryHints.avoidedSources,
              feedback_counts: status.memoryHints.feedbackCounts,
              last_feedback_at_ms: status.memoryHints.lastFeedbackAtMs ?? null,
            },
            exclude_paper_ids: status.excludePaperIds,
            known_paper_count: status.knownPaperCount,
            total_runs: status.totalRuns,
            last_status: status.lastStatus ?? null,
            last_pushed_at_ms: status.lastPushedAtMs ?? null,
          });
        }

        return Result.err("invalid_params", 'Invalid action. Use one of: "prepare", "record", "feedback", "status".');
      } catch (error) {
        return Result.err(
          "runtime_error",
          `scientify_literature_state failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

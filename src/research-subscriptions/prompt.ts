import {
  DEFAULT_CRON_PROMPT,
  DEFAULT_SCORE_WEIGHTS,
  REMINDER_HINT_RE,
  RESEARCH_HINT_RE,
  SCIENTIFY_SIGNATURE_FOOTER,
} from "./constants.js";
import { formatScoreWeights, resolveCandidatePool } from "./parse.js";
import type { ScheduleSpec, SubscriptionOptions } from "./types.js";

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

function buildPreferencePayload(options: Pick<SubscriptionOptions, "maxPapers" | "recencyDays" | "sources">): {
  max_papers: number;
  recency_days?: number;
  sources?: string[];
} {
  const maxPapers = options.maxPapers ?? 3;
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
    "topic" | "message" | "maxPapers" | "recencyDays" | "sources" | "candidatePool" | "scoreWeights"
  >,
  scheduleKind: ScheduleSpec["kind"],
  scopeKey: string,
): string {
  const customMessage = options.message?.trim();
  if (customMessage) {
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

  const trimmedTopic = options.topic?.trim();
  if (!trimmedTopic) {
    return DEFAULT_CRON_PROMPT;
  }

  const preferences = buildPreferencePayload(options);
  const candidatePool = resolveCandidatePool(options.candidatePool, preferences.max_papers);
  const scoreWeights = options.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
  const scoreWeightsText = formatScoreWeights(scoreWeights);
  const preparePayload = JSON.stringify({
    action: "prepare",
    scope: scopeKey,
    topic: trimmedTopic,
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
  const recordTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: trimmedTopic,
    status: "ok",
    papers: recordPaperTemplate,
  });
  const recordFallbackTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: trimmedTopic,
    status: "fallback_representative",
    papers: recordPaperTemplate,
    note: "No unseen papers this cycle; delivered best representative papers instead.",
  });
  const recordEmptyTemplate = JSON.stringify({
    action: "record",
    scope: scopeKey,
    topic: trimmedTopic,
    status: "empty",
    papers: [],
    note: "No suitable paper found in incremental pass and fallback representative pass.",
  });

  if (scheduleKind === "at") {
    return [
      `/research-pipeline Run a focused literature study on \"${trimmedTopic}\" and return up to ${preferences.max_papers} high-value representative papers.`,
      "",
      "Mandatory workflow:",
      `1) Call tool \`scientify_literature_state\` with: ${preparePayload}`,
      "2) Read `memory_hints` from prepare result. Treat preferred keywords/sources as positive ranking priors, and avoided ones as negative priors.",
      `3) Build a candidate pool of around ${candidatePool} papers when possible, matching returned preferences (sources/recency).`,
      `4) Score each candidate with weighted dimensions (${scoreWeightsText}). Each dimension is 0-100, then compute weighted average score.`,
      `5) Apply memory prior adjustment to the score (up-rank preferred keyword/source matches; down-rank avoided matches).`,
      `6) Select top ${preferences.max_papers} papers, then call \`scientify_literature_state\` to persist selected papers (include score/reason) using this JSON shape: ${recordTemplate}`,
      "7) In user-facing output, do not display score/reason unless explicitly requested. Show only conclusions and source links.",
      "8) If nothing suitable is found, still call record with empty papers using:",
      `${recordEmptyTemplate}`,
      "Then respond: `No new literature found.`",
    ].join("\n");
  }

  return [
    `/research-pipeline Run an incremental literature check focused on \"${trimmedTopic}\".`,
    "",
    "Mandatory workflow:",
    `1) Call tool \`scientify_literature_state\` with: ${preparePayload}`,
    "2) Read `memory_hints` from prepare result. Use them as quiet personalization priors in ranking (not user-facing).",
    "3) Treat `exclude_paper_ids` as hard dedupe constraints. Do not push papers whose IDs are already in that list.",
    `4) Incremental pass: build a candidate pool of around ${candidatePool} unseen papers when possible, following preferences (sources/recency).`,
    `5) Score each candidate with weighted dimensions (${scoreWeightsText}). Each dimension is 0-100, then compute weighted average score.`,
    "6) Apply memory prior adjustment to the score (up-rank preferred keyword/source matches; down-rank avoided matches).",
    `7) Select at most ${preferences.max_papers} top-ranked unseen papers. If selected > 0, call \`scientify_literature_state\` with status \`ok\` using: ${recordTemplate}`,
    "8) If incremental selection is empty, run one fallback representative pass (ignore `exclude_paper_ids` once) and select best representative papers.",
    `9) If fallback returns papers, call \`scientify_literature_state\` with status \`fallback_representative\` using: ${recordFallbackTemplate}`,
    "10) In user-facing output, do not expose score/reason unless explicitly requested.",
    "11) If both incremental and fallback passes are empty, call record with empty papers using:",
    `${recordEmptyTemplate}`,
    "Then reply exactly: `No new literature found.`",
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

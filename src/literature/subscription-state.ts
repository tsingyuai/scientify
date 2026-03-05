import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export type LightweightPreferences = {
  maxPapers: number;
  recencyDays?: number;
  sources: string[];
};

export type FeedbackSignal = "read" | "skip" | "star";

export type TopicMemoryHints = {
  preferredKeywords: string[];
  avoidedKeywords: string[];
  preferredSources: string[];
  avoidedSources: string[];
  feedbackCounts: {
    read: number;
    skip: number;
    star: number;
  };
  lastFeedbackAtMs?: number;
};

export type PaperRecordInput = {
  id?: string;
  title?: string;
  url?: string;
  score?: number;
  reason?: string;
};

export type FeedbackInput = {
  signal: FeedbackSignal;
  paper?: PaperRecordInput;
  source?: string;
  tags?: string[];
  note?: string;
  runId?: string;
};

export type PrepareResult = {
  scope: string;
  topic: string;
  topicKey: string;
  preferences: LightweightPreferences;
  memoryHints: TopicMemoryHints;
  excludePaperIds: string[];
  knownPaperCount: number;
  lastPushedAtMs?: number;
};

export type RecordResult = {
  scope: string;
  topic: string;
  topicKey: string;
  preferences: LightweightPreferences;
  memoryHints: TopicMemoryHints;
  recordedPapers: number;
  totalKnownPapers: number;
  pushedAtMs: number;
};

export type FeedbackResult = {
  scope: string;
  topic: string;
  topicKey: string;
  signal: FeedbackSignal;
  preferences: LightweightPreferences;
  memoryHints: TopicMemoryHints;
  updatedAtMs: number;
};

type TopicPaperState = {
  id: string;
  title?: string;
  url?: string;
  lastScore?: number;
  lastReason?: string;
  firstPushedAtMs: number;
  lastPushedAtMs: number;
  pushCount: number;
};

type TopicMemoryState = {
  feedbackCounts: {
    read: number;
    skip: number;
    star: number;
  };
  keywordScores: Record<string, number>;
  sourceScores: Record<string, number>;
  recentNotes: Array<{
    ts: number;
    signal: FeedbackSignal;
    text: string;
  }>;
  lastFeedbackAtMs?: number;
};

type TopicState = {
  scope: string;
  topic: string;
  topicKey: string;
  preferences: LightweightPreferences;
  memory: TopicMemoryState;
  pushedPapers: Record<string, TopicPaperState>;
  totalRuns: number;
  lastRunAtMs?: number;
  lastStatus?: string;
};

type RootState = {
  version: 1;
  updatedAtMs: number;
  topics: Record<string, TopicState>;
};

const STATE_VERSION = 1 as const;
const DEFAULT_MAX_PAPERS = 3;
const DEFAULT_SOURCES = ["openalex", "arxiv"];
const MAX_MEMORY_NOTES = 30;
const MAX_MEMORY_KEYS = 60;
const TOP_HINT_LIMIT = 8;

const FEEDBACK_SIGNAL_DELTA: Record<FeedbackSignal, number> = {
  read: 1,
  skip: -1,
  star: 2,
};

function getStateDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
  return path.join(home, ".openclaw", "workspace", "scientify");
}

function getStatePath(): string {
  return path.join(getStateDir(), "literature-state.json");
}

function getPushLogPath(): string {
  return path.join(getStateDir(), "literature-push-log.jsonl");
}

function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function normalizeTopic(raw: string): string {
  return normalizeText(raw).toLowerCase();
}

function normalizeScope(raw: string): string {
  const trimmed = normalizeText(raw).toLowerCase();
  return trimmed.length > 0 ? trimmed : "global";
}

function topicKey(scope: string, topic: string): string {
  const hash = createHash("sha1")
    .update(`${normalizeScope(scope)}\n${normalizeTopic(topic)}`)
    .digest("hex");
  return hash.slice(0, 20);
}

function dedupeSources(raw: string[] | undefined): string[] {
  if (!raw || raw.length === 0) return [...DEFAULT_SOURCES];
  const seen = new Set<string>();
  for (const item of raw) {
    const value = normalizeText(item).toLowerCase();
    if (value.length === 0) continue;
    seen.add(value);
  }
  if (seen.size === 0) return [...DEFAULT_SOURCES];
  return [...seen];
}

function mergePreferences(
  base: LightweightPreferences | undefined,
  incoming: Partial<LightweightPreferences> | undefined,
): LightweightPreferences {
  const maxPapersRaw = incoming?.maxPapers ?? base?.maxPapers ?? DEFAULT_MAX_PAPERS;
  const maxPapers = Number.isFinite(maxPapersRaw)
    ? Math.min(20, Math.max(1, Math.floor(maxPapersRaw)))
    : DEFAULT_MAX_PAPERS;

  const recencyRaw = incoming?.recencyDays ?? base?.recencyDays;
  const recencyDays =
    recencyRaw !== undefined && Number.isFinite(recencyRaw) && recencyRaw > 0
      ? Math.min(3650, Math.floor(recencyRaw))
      : undefined;

  const sources = dedupeSources(incoming?.sources ?? base?.sources);

  return {
    maxPapers,
    ...(recencyDays ? { recencyDays } : {}),
    sources,
  };
}

function defaultState(): RootState {
  return {
    version: STATE_VERSION,
    updatedAtMs: Date.now(),
    topics: {},
  };
}

function defaultTopicMemoryState(): TopicMemoryState {
  return {
    feedbackCounts: {
      read: 0,
      skip: 0,
      star: 0,
    },
    keywordScores: {},
    sourceScores: {},
    recentNotes: [],
  };
}

async function ensureStateDir(): Promise<void> {
  await mkdir(getStateDir(), { recursive: true });
}

async function loadState(): Promise<RootState> {
  const file = getStatePath();
  if (!existsSync(file)) return defaultState();
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RootState>;
    if (parsed.version !== STATE_VERSION || !parsed.topics || typeof parsed.topics !== "object") {
      return defaultState();
    }
    return {
      version: STATE_VERSION,
      updatedAtMs: typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : Date.now(),
      topics: parsed.topics as Record<string, TopicState>,
    };
  } catch {
    return defaultState();
  }
}

async function saveState(state: RootState): Promise<void> {
  await ensureStateDir();
  state.updatedAtMs = Date.now();
  const file = getStatePath();
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await rename(tmp, file);
}

function normalizePaperId(raw?: string): string | undefined {
  if (!raw) return undefined;
  const normalized = normalizeText(raw).toLowerCase();
  if (!normalized) return undefined;
  return normalized;
}

function extractArxivId(text: string): string | undefined {
  const m = text.match(/\b(\d{4}\.\d{4,5}(?:v\d+)?)\b/i);
  if (m?.[1]) return `arxiv:${m[1].toLowerCase()}`;
  return undefined;
}

function extractDoi(text: string): string | undefined {
  const m = text.match(/\b(10\.\d{4,9}\/[-._;()/:a-z0-9]+)\b/i);
  if (m?.[1]) return `doi:${m[1].toLowerCase()}`;
  return undefined;
}

function derivePaperId(paper: PaperRecordInput): string {
  const explicit = normalizePaperId(paper.id);
  if (explicit) return explicit;

  const text = [paper.url, paper.title].filter((part): part is string => Boolean(part)).join(" ");
  const arxiv = extractArxivId(text);
  if (arxiv) return arxiv;
  const doi = extractDoi(text);
  if (doi) return doi;

  const fallback = normalizeText(`${paper.title ?? ""} ${paper.url ?? ""}`);
  const digest = createHash("sha1").update(fallback || JSON.stringify(paper)).digest("hex");
  return `hash:${digest.slice(0, 20)}`;
}

function sanitizeKeyword(raw: string): string | undefined {
  const normalized = normalizeText(raw).toLowerCase();
  if (normalized.length < 2 || normalized.length > 48) return undefined;
  return normalized;
}

function tokenizeKeywords(raw: string): string[] {
  const tokens = raw.match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,47}/gu) ?? [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const keyword = sanitizeKeyword(token);
    if (!keyword) continue;
    seen.add(keyword);
  }
  return [...seen];
}

function normalizeSource(raw?: string): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;

  const direct = value.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const host = direct.length > 0 ? direct : value;

  if (host.includes("arxiv")) return "arxiv";
  if (host.includes("openalex")) return "openalex";
  if (host.includes("doi.org")) return "doi";
  if (host.includes("semanticscholar")) return "semanticscholar";
  if (host.includes("nature")) return "nature";
  if (host.includes("ieeexplore")) return "ieee";
  if (host.includes("acm.org")) return "acm";
  if (host.includes("sciencedirect")) return "sciencedirect";

  return host;
}

function sourceFromPaper(paper?: PaperRecordInput): string | undefined {
  const url = paper?.url?.trim();
  if (!url) return undefined;
  try {
    const host = new URL(url).host;
    return normalizeSource(host);
  } catch {
    return normalizeSource(url);
  }
}

function updateScoreMap(map: Record<string, number>, key: string, delta: number): void {
  const current = map[key] ?? 0;
  const next = Math.max(-20, Math.min(20, current + delta));
  if (Math.abs(next) < 0.01) {
    delete map[key];
    return;
  }
  map[key] = Number(next.toFixed(2));
}

function limitScoreMap(map: Record<string, number>): Record<string, number> {
  const items = Object.entries(map)
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, MAX_MEMORY_KEYS);
  const trimmed: Record<string, number> = {};
  for (const [key, value] of items) {
    trimmed[key] = value;
  }
  return trimmed;
}

function ensureTopicMemoryState(topicState: TopicState): TopicMemoryState {
  const memory = topicState.memory;
  if (!memory || typeof memory !== "object") {
    topicState.memory = defaultTopicMemoryState();
    return topicState.memory;
  }

  if (!memory.feedbackCounts || typeof memory.feedbackCounts !== "object") {
    memory.feedbackCounts = { read: 0, skip: 0, star: 0 };
  }
  for (const key of ["read", "skip", "star"] as const) {
    const raw = memory.feedbackCounts[key];
    memory.feedbackCounts[key] = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  }

  if (!memory.keywordScores || typeof memory.keywordScores !== "object") {
    memory.keywordScores = {};
  } else {
    memory.keywordScores = limitScoreMap(memory.keywordScores);
  }

  if (!memory.sourceScores || typeof memory.sourceScores !== "object") {
    memory.sourceScores = {};
  } else {
    memory.sourceScores = limitScoreMap(memory.sourceScores);
  }

  if (!Array.isArray(memory.recentNotes)) {
    memory.recentNotes = [];
  } else {
    memory.recentNotes = memory.recentNotes
      .filter(
        (item) =>
          item &&
          typeof item === "object" &&
          Number.isFinite((item as { ts?: unknown }).ts) &&
          typeof (item as { signal?: unknown }).signal === "string" &&
          typeof (item as { text?: unknown }).text === "string",
      )
      .slice(-MAX_MEMORY_NOTES)
      .map((item) => ({
        ts: Math.floor((item as { ts: number }).ts),
        signal: (item as { signal: FeedbackSignal }).signal,
        text: normalizeText((item as { text: string }).text),
      }));
  }

  if (!Number.isFinite(memory.lastFeedbackAtMs)) {
    delete memory.lastFeedbackAtMs;
  }

  return memory;
}

function topKeysByScore(map: Record<string, number>, polarity: "positive" | "negative", limit: number): string[] {
  const threshold = 0.1;
  const entries = Object.entries(map).filter(([, score]) =>
    polarity === "positive" ? score > threshold : score < -threshold,
  );
  entries.sort((a, b) => (polarity === "positive" ? b[1] - a[1] : a[1] - b[1]));
  return entries.slice(0, limit).map(([key]) => key);
}

function buildMemoryHints(memory: TopicMemoryState): TopicMemoryHints {
  return {
    preferredKeywords: topKeysByScore(memory.keywordScores, "positive", TOP_HINT_LIMIT),
    avoidedKeywords: topKeysByScore(memory.keywordScores, "negative", TOP_HINT_LIMIT),
    preferredSources: topKeysByScore(memory.sourceScores, "positive", 4),
    avoidedSources: topKeysByScore(memory.sourceScores, "negative", 4),
    feedbackCounts: {
      read: memory.feedbackCounts.read,
      skip: memory.feedbackCounts.skip,
      star: memory.feedbackCounts.star,
    },
    ...(memory.lastFeedbackAtMs ? { lastFeedbackAtMs: memory.lastFeedbackAtMs } : {}),
  };
}

function getOrCreateTopicState(
  root: RootState,
  scope: string,
  topic: string,
  incomingPrefs?: Partial<LightweightPreferences>,
): TopicState {
  const normalizedScope = normalizeScope(scope);
  const normalizedTopicDisplay = normalizeText(topic);
  const key = topicKey(normalizedScope, normalizedTopicDisplay);
  const existing = root.topics[key];
  if (existing) {
    existing.scope = normalizedScope;
    existing.topic = normalizedTopicDisplay;
    ensureTopicMemoryState(existing);
    if (!existing.pushedPapers || typeof existing.pushedPapers !== "object") {
      existing.pushedPapers = {};
    }
    if (!Number.isFinite(existing.totalRuns)) {
      existing.totalRuns = 0;
    }
    existing.preferences = mergePreferences(existing.preferences, incomingPrefs);
    return existing;
  }

  const created: TopicState = {
    scope: normalizedScope,
    topic: normalizedTopicDisplay,
    topicKey: key,
    preferences: mergePreferences(undefined, incomingPrefs),
    memory: defaultTopicMemoryState(),
    pushedPapers: {},
    totalRuns: 0,
  };
  root.topics[key] = created;
  return created;
}

function sortPaperIdsByRecency(papers: Record<string, TopicPaperState>): string[] {
  return Object.values(papers)
    .sort((a, b) => b.lastPushedAtMs - a.lastPushedAtMs)
    .map((item) => item.id);
}

async function appendPushLog(entry: Record<string, unknown>): Promise<void> {
  await ensureStateDir();
  await appendFile(getPushLogPath(), `${JSON.stringify(entry)}\n`, "utf-8");
}

export async function prepareIncrementalState(args: {
  scope: string;
  topic: string;
  preferences?: Partial<LightweightPreferences>;
}): Promise<PrepareResult> {
  const root = await loadState();
  const topicState = getOrCreateTopicState(root, args.scope, args.topic, args.preferences);
  const memory = ensureTopicMemoryState(topicState);
  await saveState(root);

  const excludePaperIds = sortPaperIdsByRecency(topicState.pushedPapers);
  const lastPushedAtMs = excludePaperIds.length
    ? topicState.pushedPapers[excludePaperIds[0]]?.lastPushedAtMs
    : undefined;

  return {
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    preferences: topicState.preferences,
    memoryHints: buildMemoryHints(memory),
    excludePaperIds,
    knownPaperCount: excludePaperIds.length,
    ...(lastPushedAtMs ? { lastPushedAtMs } : {}),
  };
}

export async function recordIncrementalPush(args: {
  scope: string;
  topic: string;
  status?: string;
  papers: PaperRecordInput[];
  preferences?: Partial<LightweightPreferences>;
  runId?: string;
  note?: string;
}): Promise<RecordResult> {
  const root = await loadState();
  const topicState = getOrCreateTopicState(root, args.scope, args.topic, args.preferences);
  const memory = ensureTopicMemoryState(topicState);
  const now = Date.now();

  let recordedPapers = 0;
  for (const rawPaper of args.papers) {
    const id = derivePaperId(rawPaper);
    const existing = topicState.pushedPapers[id];
    if (existing) {
      existing.lastPushedAtMs = now;
      existing.pushCount += 1;
      if (rawPaper.title) existing.title = rawPaper.title.trim();
      if (rawPaper.url) existing.url = rawPaper.url.trim();
      if (typeof rawPaper.score === "number" && Number.isFinite(rawPaper.score)) {
        existing.lastScore = rawPaper.score;
      }
      if (rawPaper.reason) {
        existing.lastReason = rawPaper.reason.trim();
      }
    } else {
      topicState.pushedPapers[id] = {
        id,
        title: rawPaper.title?.trim(),
        url: rawPaper.url?.trim(),
        ...(typeof rawPaper.score === "number" && Number.isFinite(rawPaper.score)
          ? { lastScore: rawPaper.score }
          : {}),
        ...(rawPaper.reason ? { lastReason: rawPaper.reason.trim() } : {}),
        firstPushedAtMs: now,
        lastPushedAtMs: now,
        pushCount: 1,
      };
    }
    recordedPapers += 1;
  }

  topicState.totalRuns += 1;
  topicState.lastRunAtMs = now;
  topicState.lastStatus = args.status?.trim() || (recordedPapers > 0 ? "ok" : "empty");

  await saveState(root);

  await appendPushLog({
    ts: now,
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    status: topicState.lastStatus,
    runId: args.runId,
    preferences: topicState.preferences,
    recordedPapers,
    papers: args.papers.map((paper) => ({
      id: derivePaperId(paper),
      title: paper.title?.trim(),
      url: paper.url?.trim(),
      ...(typeof paper.score === "number" && Number.isFinite(paper.score) ? { score: paper.score } : {}),
      ...(paper.reason ? { reason: paper.reason.trim() } : {}),
    })),
    note: args.note,
  });

  return {
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    preferences: topicState.preferences,
    memoryHints: buildMemoryHints(memory),
    recordedPapers,
    totalKnownPapers: Object.keys(topicState.pushedPapers).length,
    pushedAtMs: now,
  };
}

export async function recordUserFeedback(args: {
  scope: string;
  topic: string;
  feedback: FeedbackInput;
  preferences?: Partial<LightweightPreferences>;
}): Promise<FeedbackResult> {
  const root = await loadState();
  const topicState = getOrCreateTopicState(root, args.scope, args.topic, args.preferences);
  const memory = ensureTopicMemoryState(topicState);
  const now = Date.now();
  const signal = args.feedback.signal;
  const delta = FEEDBACK_SIGNAL_DELTA[signal];

  memory.feedbackCounts[signal] += 1;
  memory.lastFeedbackAtMs = now;

  const keywords = new Set<string>();
  for (const tag of args.feedback.tags ?? []) {
    const normalized = sanitizeKeyword(tag);
    if (normalized) keywords.add(normalized);
  }
  if (args.feedback.note) {
    for (const token of tokenizeKeywords(args.feedback.note)) {
      keywords.add(token);
    }
  }
  if (args.feedback.paper?.title) {
    for (const token of tokenizeKeywords(args.feedback.paper.title)) {
      keywords.add(token);
    }
  }

  for (const keyword of keywords) {
    updateScoreMap(memory.keywordScores, keyword, delta);
  }
  memory.keywordScores = limitScoreMap(memory.keywordScores);

  const source = normalizeSource(args.feedback.source) ?? sourceFromPaper(args.feedback.paper);
  if (source) {
    updateScoreMap(memory.sourceScores, source, delta);
    memory.sourceScores = limitScoreMap(memory.sourceScores);
  }

  const noteText = normalizeText(args.feedback.note ?? "");
  if (noteText.length > 0) {
    memory.recentNotes.push({
      ts: now,
      signal,
      text: noteText,
    });
    if (memory.recentNotes.length > MAX_MEMORY_NOTES) {
      memory.recentNotes = memory.recentNotes.slice(-MAX_MEMORY_NOTES);
    }
  }

  await saveState(root);

  await appendPushLog({
    ts: now,
    event: "feedback",
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    signal,
    source: source ?? null,
    tags: [...keywords],
    note: noteText || undefined,
    runId: args.feedback.runId,
    memoryHints: buildMemoryHints(memory),
  });

  return {
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    signal,
    preferences: topicState.preferences,
    memoryHints: buildMemoryHints(memory),
    updatedAtMs: now,
  };
}

export async function getIncrementalStateStatus(args: {
  scope: string;
  topic: string;
}): Promise<PrepareResult & { totalRuns: number; lastStatus?: string }> {
  const root = await loadState();
  const topicState = getOrCreateTopicState(root, args.scope, args.topic);
  const memory = ensureTopicMemoryState(topicState);
  await saveState(root);

  const excludePaperIds = sortPaperIdsByRecency(topicState.pushedPapers);
  const lastPushedAtMs = excludePaperIds.length
    ? topicState.pushedPapers[excludePaperIds[0]]?.lastPushedAtMs
    : undefined;

  return {
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    preferences: topicState.preferences,
    memoryHints: buildMemoryHints(memory),
    excludePaperIds,
    knownPaperCount: excludePaperIds.length,
    ...(lastPushedAtMs ? { lastPushedAtMs } : {}),
    totalRuns: topicState.totalRuns,
    ...(topicState.lastStatus ? { lastStatus: topicState.lastStatus } : {}),
  };
}

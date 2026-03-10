import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { commitKnowledgeRun, readKnowledgeSummary } from "../knowledge-state/store.js";
import type {
  ExplorationTraceInput,
  KnowledgePaperInput,
  KnowledgeStateInput,
  KnowledgeStateSummary,
} from "../knowledge-state/types.js";

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
  runId: string;
  recordedPapers: number;
  totalKnownPapers: number;
  pushedAtMs: number;
  projectId?: string;
  streamKey?: string;
  knowledgeStateSummary?: KnowledgeStateSummary;
};

export type RecentPaperSummary = {
  id: string;
  title?: string;
  url?: string;
  lastScore?: number;
  lastReason?: string;
  firstPushedAtMs: number;
  lastPushedAtMs: number;
  pushCount: number;
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
  lastProjectId?: string;
};

type RootState = {
  version: 1;
  updatedAtMs: number;
  topics: Record<string, TopicState>;
};

const STATE_VERSION = 1 as const;
const DEFAULT_MAX_PAPERS = 5;
const DEFAULT_SOURCES = ["openalex", "arxiv"];
const MAX_MEMORY_NOTES = 30;
const MAX_MEMORY_KEYS = 60;
const TOP_HINT_LIMIT = 8;
const DEFAULT_FULLTEXT_FETCH_TIMEOUT_MS = 20_000;
const RETRY_FULLTEXT_FETCH_TIMEOUT_MS = 35_000;
const MIN_FULLTEXT_TEXT_CHARS = 2_000;
const MAX_STRICT_FULLTEXT_ATTEMPTS = 5;
const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const STRICT_EMPTY_FALLBACK_MAX_RESULTS = 12;
const STRICT_EMPTY_FALLBACK_MAX_QUERIES = 4;
const DEFAULT_STRICT_CANDIDATE_POOL = 24;
const DEFAULT_STRICT_MIN_CORE_FLOOR = 3;
const TIER_A_RATIO = 0.5;
const TIER_B_RATIO = 0.35;
const TIER_C_RATIO = 0.15;
const REFLECTION_MAX_ADDED_PAPERS = 2;

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

function sanitizeScopePart(raw: string): string {
  const normalized = normalizeText(raw).toLowerCase();
  const cleaned = normalized
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "unknown";
}

function normalizeScope(raw: string): string {
  const trimmed = normalizeText(raw).toLowerCase();
  if (trimmed.length === 0) return "global";

  const split = trimmed.split(":");
  if (split.length === 1) {
    return sanitizeScopePart(split[0]);
  }

  const channel = sanitizeScopePart(split[0]);
  const target = sanitizeScopePart(split.slice(1).join(":"));
  return `${channel}:${target}`;
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

function normalizeArxivToken(token: string): string | undefined {
  const cleaned = normalizeText(token).replace(/^arxiv:/i, "");
  if (!cleaned) return undefined;
  const modern = cleaned.match(/^(\d{4}\.\d{4,5}(?:v\d+)?)$/i);
  if (modern?.[1]) return modern[1].toLowerCase();
  const legacy = cleaned.match(/^([a-z\-]+(?:\.[a-z\-]+)?\/\d{7}(?:v\d+)?)$/i);
  if (legacy?.[1]) return legacy[1].toLowerCase();
  return undefined;
}

function stripArxivVersion(id: string): string {
  return id.replace(/v\d+$/i, "");
}

function parseArxivIdCandidatesFromPaper(paper: { id?: string; url?: string; title?: string }): string[] {
  const candidates: string[] = [];
  const pushToken = (value?: string) => {
    if (!value) return;
    const normalized = normalizeArxivToken(value);
    if (normalized) candidates.push(normalized);
  };

  pushToken(paper.id);

  const combined = [paper.url, paper.title].filter((item): item is string => Boolean(item)).join(" ");
  for (const m of combined.matchAll(/\b(\d{4}\.\d{4,5}(?:v\d+)?)\b/gi)) {
    pushToken(m[1]);
  }
  for (const m of combined.matchAll(/\b([a-z\-]+(?:\.[a-z\-]+)?\/\d{7}(?:v\d+)?)\b/gi)) {
    pushToken(m[1]);
  }

  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    if (!seen.has(item)) {
      seen.add(item);
      expanded.push(item);
    }
    const base = stripArxivVersion(item);
    if (!seen.has(base)) {
      seen.add(base);
      expanded.push(base);
    }
  }
  return expanded;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<math[\s\S]*?<\/math>/gi, " ")
    .replace(/<\/?(?:p|div|section|article|h\d|li|ul|ol|br|tr|td|th|table|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

type FullTextFetchResult =
  | {
      ok: true;
      sourceUrl: string;
      sourceTag: "arxiv_html" | "ar5iv_html";
      plainText: string;
    }
  | {
      ok: false;
      reason: string;
    };

async function fetchArxivFullTextByHtmlCandidates(
  arxivIds: string[],
  timeoutMs: number,
): Promise<FullTextFetchResult> {
  const candidates: Array<{ url: string; tag: "arxiv_html" | "ar5iv_html" }> = [];
  const seen = new Set<string>();
  for (const id of arxivIds) {
    const normalized = normalizeArxivToken(id);
    if (!normalized) continue;
    for (const host of ["https://arxiv.org/html", "https://ar5iv.org/html"] as const) {
      const url = `${host}/${normalized}`;
      if (seen.has(url)) continue;
      seen.add(url);
      candidates.push({ url, tag: host.includes("ar5iv") ? "ar5iv_html" : "arxiv_html" });
    }
  }

  const errors: string[] = [];
  for (const candidate of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(candidate.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "scientify-fulltext-bootstrap/1.0",
        },
      });
      if (!res.ok) {
        errors.push(`${candidate.tag}:http_${res.status}`);
        continue;
      }
      const rawHtml = await res.text();
      const plain = htmlToPlainText(rawHtml);
      if (plain.length < MIN_FULLTEXT_TEXT_CHARS) {
        errors.push(`${candidate.tag}:content_too_short(${plain.length})`);
        continue;
      }
      return {
        ok: true,
        sourceUrl: candidate.url,
        sourceTag: candidate.tag,
        plainText: plain,
      };
    } catch (error) {
      errors.push(
        `${candidate.tag}:${error instanceof Error ? error.name || error.message : "fetch_failed"}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    reason: errors.length > 0 ? errors.join(";") : "html_fulltext_unavailable",
  };
}

async function backfillStrictCoreFullText(args: {
  corePapers: KnowledgePaperInput[];
  maxAttempts: number;
}): Promise<{
  corePapers: KnowledgePaperInput[];
  attempted: number;
  completed: number;
  failures: string[];
}> {
  const updated: KnowledgePaperInput[] = [];
  let attempted = 0;
  let completed = 0;
  const failures: string[] = [];

  for (const paper of args.corePapers) {
    if (paper.fullTextRead === true || paper.readStatus === "fulltext") {
      updated.push(paper);
      continue;
    }

    const arxivIds = parseArxivIdCandidatesFromPaper({
      id: paper.id,
      url: paper.url,
      title: paper.title,
    });

    if (arxivIds.length === 0) {
      updated.push({
        ...paper,
        fullTextRead: false,
        readStatus: paper.readStatus ?? "metadata",
        unreadReason:
          paper.unreadReason ??
          "Automatic full-text bootstrap currently supports arXiv papers with parseable IDs only.",
      });
      continue;
    }

    if (attempted >= args.maxAttempts) {
      updated.push({
        ...paper,
        fullTextRead: false,
        readStatus: paper.readStatus ?? "metadata",
        unreadReason: paper.unreadReason ?? "Full-text bootstrap attempt budget reached in this run.",
      });
      continue;
    }

    attempted += 1;
    let fetched = await fetchArxivFullTextByHtmlCandidates(arxivIds, DEFAULT_FULLTEXT_FETCH_TIMEOUT_MS);
    if (!fetched.ok) {
      fetched = await fetchArxivFullTextByHtmlCandidates(arxivIds, RETRY_FULLTEXT_FETCH_TIMEOUT_MS);
    }
    if (!fetched.ok) {
      failures.push(`${arxivIds[0]}:${fetched.reason}`);
      updated.push({
        ...paper,
        fullTextRead: false,
        readStatus: paper.readStatus ?? "metadata",
        unreadReason: paper.unreadReason ?? `Automatic full-text fetch failed: ${fetched.reason}`,
      });
      continue;
    }

    completed += 1;
    const excerpt = fetched.plainText.slice(0, 360).replace(/\s+/g, " ").trim();
    updated.push({
      ...paper,
      fullTextRead: true,
      readStatus: "fulltext",
      fullTextSource: fetched.sourceTag,
      fullTextRef: fetched.sourceUrl,
      unreadReason: undefined,
      ...(paper.keyEvidenceSpans && paper.keyEvidenceSpans.length > 0
        ? {}
        : excerpt.length > 0
          ? { keyEvidenceSpans: [excerpt] }
          : {}),
    });
  }

  return {
    corePapers: updated,
    attempted,
    completed,
    failures,
  };
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

function inferTopicAliases(tokens: string[]): string[] {
  const normalized = tokens
    .map((token) => token.toLowerCase())
    .filter((token) => /^[a-z][a-z0-9_-]*$/.test(token))
    .slice(0, 6);
  if (normalized.length < 3) return [];

  const aliases = new Set<string>();
  const [a, b, c] = normalized;
  if (a.length >= 2 && b.length >= 1 && c.length >= 1) {
    aliases.add(`${a.slice(0, 2)}${b[0]}${c[0]}`);
  }
  aliases.add(`${a[0]}${b[0]}${c[0]}`);

  const hasLow = normalized.includes("low");
  const hasRank = normalized.includes("rank");
  const hasAdapt = normalized.some((token) => token.startsWith("adapt"));
  if (hasLow && hasRank && hasAdapt) aliases.add("lora");

  return [...aliases].filter((alias) => alias.length >= 3 && alias.length <= 8);
}

function buildScoringTokens(topic: string): string[] {
  const stopwords = new Set([
    "from",
    "with",
    "without",
    "first",
    "basics",
    "basic",
    "foundational",
    "foundation",
    "seminal",
    "classic",
    "avoid",
    "benchmark",
    "only",
    "prefer",
    "authoritative",
    "latest",
    "recent",
    "paper",
    "papers",
    "study",
    "works",
  ]);
  const rawTokens = tokenizeKeywords(topic);
  const aliases = inferTopicAliases(rawTokens);
  const base = rawTokens.filter((token) => token.length >= 4 && !stopwords.has(token));
  if (base.length > 0) return [...new Set([...base, ...aliases])].slice(0, 10);
  return [...new Set([...rawTokens, ...aliases])].slice(0, 10);
}

function buildRetrievalSeedTokens(topic: string): string[] {
  const directiveWords = new Set([
    "from",
    "with",
    "without",
    "first",
    "basics",
    "basic",
    "foundational",
    "foundation",
    "seminal",
    "classic",
    "avoid",
    "benchmark",
    "only",
    "prefer",
    "authoritative",
    "latest",
    "recent",
    "paper",
    "papers",
    "study",
    "works",
    "strict",
    "fast",
  ]);
  const rawTokens = tokenizeKeywords(topic);
  const aliases = inferTopicAliases(rawTokens);
  const tokens = rawTokens
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 3 && !directiveWords.has(token));
  return [...new Set([...tokens, ...aliases])].slice(0, 10);
}

type ArxivFallbackCandidate = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  published?: string;
};

type RequirementProfile = {
  foundationalFirst: boolean;
  avoidBenchmarkOnly: boolean;
  preferSurvey: boolean;
  preferAuthority: boolean;
  preferRecent: boolean;
};

const FOUNDATIONAL_HINT_RE =
  /\b(foundational|foundation|seminal|classic|groundwork|original paper|from basics|start from basics|first principles)\b|\u57fa\u7840|\u5950\u57fa|\u7ecf\u5178|\u539f\u59cb/u;
const AVOID_BENCHMARK_HINT_RE =
  /\b(avoid benchmark|benchmark-only|no benchmark|less benchmark|not benchmark only)\b|\u5c11\u63a8.*benchmark|\u4e0d\u8981.*benchmark/u;
const SURVEY_HINT_RE = /\b(survey|review|taxonomy|overview|tutorial)\b|\u7efc\u8ff0|\u8bc4\u8ff0/u;
const AUTHORITY_HINT_RE =
  /\b(authoritative|high impact|top-tier|highly cited|landmark|canonical)\b|\u6743\u5a01|\u9ad8\u5f15\u7528/u;
const RECENT_HINT_RE = /\b(latest|recent|state[- ]of[- ]the[- ]art|newest)\b|\u6700\u65b0|\u8fd1\u671f/u;
const BENCHMARK_WORD_RE = /\b(benchmark|leaderboard|dataset|evaluation)\b/i;
const METHOD_WORD_RE =
  /\b(method|approach|adaptation|training|fine[- ]?tuning|optimization|algorithm|framework|model)\b/i;
const SURVEY_WORD_RE = /\b(survey|review|taxonomy|overview|tutorial)\b/i;

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function stripXmlTag(raw: string, tag: string): string {
  const match = raw.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match?.[1]) return "";
  return normalizeText(decodeXmlEntities(match[1].replace(/<[^>]+>/g, " ").trim()));
}

function parseArxivAtomCandidates(xml: string): ArxivFallbackCandidate[] {
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/gi) ?? [];
  const parsed: ArxivFallbackCandidate[] = [];
  for (const entryRaw of entries) {
    const title = stripXmlTag(entryRaw, "title");
    const summary = stripXmlTag(entryRaw, "summary");
    const idUrl = stripXmlTag(entryRaw, "id");
    const published = stripXmlTag(entryRaw, "published");
    const arxivCandidates = parseArxivIdCandidatesFromPaper({ id: idUrl, url: idUrl, title });
    const arxivId = arxivCandidates[0];
    if (!title || !arxivId) continue;
    parsed.push({
      id: `arxiv:${stripArxivVersion(arxivId)}`,
      title,
      summary,
      url: `https://arxiv.org/abs/${stripArxivVersion(arxivId)}`,
      ...(published ? { published } : {}),
    });
  }
  return parsed;
}

type RecallTier = "tierA" | "tierB" | "tierC";

function dedupeQueries(queries: string[], limit: number): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const query of queries) {
    const key = normalizeText(query).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(query);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

function buildStrictFallbackQueries(topic: string): string[] {
  const seedTokens = buildRetrievalSeedTokens(topic);
  const normalizedTopic = seedTokens.length > 0 ? seedTokens.join(" ") : normalizeText(topic);
  const tokens = seedTokens.length > 0 ? seedTokens : tokenizeKeywords(normalizedTopic).filter((token) => token.length >= 3).slice(0, 10);
  const queries: string[] = [normalizedTopic];
  if (tokens.length >= 2) queries.push(tokens.slice(0, 4).join(" "));
  if (tokens.length >= 3) queries.push(tokens.slice(0, 3).join(" "));
  return dedupeQueries(queries, STRICT_EMPTY_FALLBACK_MAX_QUERIES);
}

function buildTieredFallbackQueries(topic: string): Record<RecallTier, string[]> {
  const seedTokens = buildRetrievalSeedTokens(topic);
  const normalizedTopic = seedTokens.length > 0 ? seedTokens.join(" ") : normalizeText(topic);
  const tokens = seedTokens.length > 0 ? seedTokens : tokenizeKeywords(normalizedTopic).filter((token) => token.length >= 3).slice(0, 10);

  const tierA = buildStrictFallbackQueries(topic);
  const tierB = dedupeQueries(
    [
      ...tokens.slice(0, 6).map((token) => `${token} adaptation`),
      ...tokens.slice(0, 6).map((token) => `${token} method`),
      ...tokens.slice(0, 4).map((token) => `${token} framework`),
      tokens.slice(0, 4).join(" "),
    ],
    STRICT_EMPTY_FALLBACK_MAX_QUERIES,
  );
  const tierC = dedupeQueries(
    [
      ...tokens.slice(0, 5).map((token) => `${token} transfer learning`),
      ...tokens.slice(0, 5).map((token) => `${token} benchmark`),
      ...tokens.slice(0, 5).map((token) => `${token} retrieval`),
      `${normalizedTopic} cross domain`,
    ],
    STRICT_EMPTY_FALLBACK_MAX_QUERIES,
  );

  return {
    tierA: tierA.length > 0 ? tierA : [normalizedTopic],
    tierB,
    tierC,
  };
}

function inferRequirementProfile(raw: string): RequirementProfile {
  const text = normalizeText(raw);
  return {
    foundationalFirst: FOUNDATIONAL_HINT_RE.test(text),
    avoidBenchmarkOnly: AVOID_BENCHMARK_HINT_RE.test(text),
    preferSurvey: SURVEY_HINT_RE.test(text),
    preferAuthority: AUTHORITY_HINT_RE.test(text),
    preferRecent: RECENT_HINT_RE.test(text),
  };
}

function inferCandidateYear(paper: ArxivFallbackCandidate): number | undefined {
  if (paper.published) {
    const ts = Date.parse(paper.published);
    if (Number.isFinite(ts)) return new Date(ts).getUTCFullYear();
  }
  const modern = paper.id.match(/:(\d{2})(\d{2})\./);
  if (modern?.[1]) {
    const yy = Number.parseInt(modern[1], 10);
    if (Number.isFinite(yy)) return 2000 + yy;
  }
  return undefined;
}

function isBenchmarkOnlyPaper(paper: ArxivFallbackCandidate): boolean {
  const text = `${paper.title} ${paper.summary ?? ""}`;
  return BENCHMARK_WORD_RE.test(text) && !METHOD_WORD_RE.test(text);
}

function isSurveyPaper(paper: ArxivFallbackCandidate): boolean {
  const text = `${paper.title} ${paper.summary ?? ""}`;
  return SURVEY_WORD_RE.test(text);
}

function isFoundationalPaper(args: {
  paper: ArxivFallbackCandidate;
  year?: number;
  topicTokens: string[];
}): boolean {
  const year = args.year;
  const nowYear = new Date().getUTCFullYear();
  const oldEnough = typeof year === "number" ? year <= nowYear - 2 : false;
  const title = normalizeText(args.paper.title).toLowerCase();
  const tokenHit = args.topicTokens.some((token) => token.length >= 4 && title.includes(token));
  return oldEnough || tokenHit;
}

function countTokenOverlap(tokens: string[], text: string): number {
  const hay = ` ${normalizeText(text)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")} `;
  let score = 0;
  for (const token of tokens) {
    if (token.length < 2) continue;
    const normalizedToken = token
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .trim();
    if (!normalizedToken) continue;
    if (hay.includes(` ${normalizedToken} `)) score += 1;
  }
  return score;
}

function scoreFallbackCandidate(
  topicTokens: string[],
  paper: ArxivFallbackCandidate,
  tier: RecallTier,
  requirements: RequirementProfile,
): number {
  const titleOverlap = countTokenOverlap(topicTokens, paper.title);
  const abstractOverlap = countTokenOverlap(topicTokens, paper.summary ?? "");
  const publishedAt = paper.published ? Date.parse(paper.published) : NaN;
  const recencyBoost = Number.isFinite(publishedAt)
    ? Math.max(0, Math.min(8, (Date.now() - publishedAt) / (1000 * 60 * 60 * 24 * -180)))
    : 0;
  const tierBoost = tier === "tierA" ? 8 : tier === "tierB" ? 4 : 1;
  const year = inferCandidateYear(paper);
  const isBenchmarkOnly = isBenchmarkOnlyPaper(paper);
  const isSurvey = isSurveyPaper(paper);
  const isFoundational = isFoundationalPaper({ paper, year, topicTokens });
  const nowYear = new Date().getUTCFullYear();
  const recencyPenalty = typeof year === "number" && year >= nowYear ? 4 : 0;
  let rawScore = 60 + tierBoost + titleOverlap * 8 + abstractOverlap * 3 + recencyBoost - recencyPenalty;
  if (requirements.foundationalFirst) {
    rawScore += isFoundational ? 10 : -4;
  }
  if (requirements.preferSurvey) {
    rawScore += isSurvey ? 8 : 0;
  }
  if (requirements.preferAuthority) {
    rawScore += isSurvey ? 3 : 0;
    if (isFoundational) rawScore += 2;
  }
  if (requirements.preferRecent && typeof year === "number" && year >= nowYear - 1) {
    rawScore += 4;
  }
  if (requirements.avoidBenchmarkOnly && isBenchmarkOnly) {
    rawScore -= 15;
  }
  return Math.max(50, Math.min(99, Math.round(rawScore)));
}

async function fetchArxivFallbackByQuery(query: string): Promise<ArxivFallbackCandidate[]> {
  const params = new URLSearchParams({
    search_query: query,
    start: "0",
    max_results: String(STRICT_EMPTY_FALLBACK_MAX_RESULTS),
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${ARXIV_API_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "scientify-empty-fallback/1.0",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseArxivAtomCandidates(xml);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function strictCoreFallbackSeed(args: {
  topic: string;
  maxPapers: number;
  candidatePool?: number;
  minCoreFloor?: number;
  knownPaperIds: Set<string>;
  requirements: RequirementProfile;
}): Promise<{
  papers: PaperRecordInput[];
  corePapers: KnowledgePaperInput[];
  explorationTrace: ExplorationTraceInput[];
  notes: string;
  recallTierStats: {
    tierA: { candidates: number; selected: number };
    tierB: { candidates: number; selected: number };
    tierC: { candidates: number; selected: number };
  };
}> {
  const tieredQueries = buildTieredFallbackQueries(args.topic);
  const byId = new Map<
    string,
    {
      row: ArxivFallbackCandidate;
      tier: RecallTier;
    }
  >();
  const traces: ExplorationTraceInput[] = [];
  const tierStats = {
    tierA: { candidates: 0, selected: 0 },
    tierB: { candidates: 0, selected: 0 },
    tierC: { candidates: 0, selected: 0 },
  };

  for (const tier of ["tierA", "tierB", "tierC"] as const) {
    for (const query of tieredQueries[tier]) {
      const rows = await fetchArxivFallbackByQuery(query);
      tierStats[tier].candidates += rows.length;
      traces.push({
        query,
        reason: `strict_core_backfill_seed_${tier}`,
        source: "arxiv",
        candidates: rows.length,
        filteredTo: rows.length,
        resultCount: rows.length,
      });
      for (const row of rows) {
        if (!byId.has(row.id)) byId.set(row.id, { row, tier });
      }
    }
  }

  const topicTokens = tokenizeKeywords(args.topic);
  const scoringTokens = buildScoringTokens(args.topic);
  const ranked = [...byId.values()]
    .map(({ row, tier }) => {
      const year = inferCandidateYear(row);
      const isSurvey = isSurveyPaper(row);
      const isBenchmarkOnly = isBenchmarkOnlyPaper(row);
      const isFoundational = isFoundationalPaper({ paper: row, year, topicTokens });
      const relevance = countTokenOverlap(scoringTokens, `${row.title} ${row.summary ?? ""}`);
      return {
        row,
        tier,
        year,
        isSurvey,
        isBenchmarkOnly,
        isFoundational,
        relevance,
        score: scoreFallbackCandidate(scoringTokens.length > 0 ? scoringTokens : topicTokens, row, tier, args.requirements),
      };
    })
    .sort((a, b) => b.score - a.score);

  const unseen = ranked.filter((item) => !args.knownPaperIds.has(item.row.id));
  const poolBeforeRelevance = unseen.length > 0 ? unseen : ranked;
  const minRelevance = scoringTokens.length >= 2 ? 2 : 1;
  const candidatePool = Math.max(
    1,
    Math.min(40, Math.floor(args.candidatePool ?? Math.max(DEFAULT_STRICT_CANDIDATE_POOL, args.maxPapers * 4))),
  );
  const minCoreFloor = Math.max(1, Math.min(args.maxPapers, args.minCoreFloor ?? DEFAULT_STRICT_MIN_CORE_FLOOR));
  const effectivePoolByRelevance = poolBeforeRelevance.filter((item) => item.relevance >= minRelevance);
  const focusTokens = scoringTokens.filter((token) => token.length >= 5);
  const weakRelevanceWithFocusPool = poolBeforeRelevance.filter((item) => {
    if (item.relevance < 1) return false;
    if (focusTokens.length === 0) return true;
    const focusHit = countTokenOverlap(focusTokens, `${item.row.title} ${item.row.summary ?? ""}`);
    return focusHit >= 1;
  });
  const weakRelevancePool = weakRelevanceWithFocusPool.length > 0
    ? weakRelevanceWithFocusPool
    : poolBeforeRelevance.filter((item) => item.relevance >= 1);
  const effectivePool =
    effectivePoolByRelevance.length >= minCoreFloor
      ? effectivePoolByRelevance
      : weakRelevancePool.length > 0
        ? weakRelevancePool
        : poolBeforeRelevance;
  const targetCount = Math.max(minCoreFloor, Math.min(args.maxPapers, candidatePool));
  const tierTargets = {
    tierA: Math.max(1, Math.round(targetCount * TIER_A_RATIO)),
    tierB: Math.max(1, Math.round(targetCount * TIER_B_RATIO)),
    tierC: Math.max(0, targetCount - Math.round(targetCount * TIER_A_RATIO) - Math.round(targetCount * TIER_B_RATIO)),
  };
  if (tierTargets.tierA + tierTargets.tierB + tierTargets.tierC < targetCount) {
    tierTargets.tierA += targetCount - (tierTargets.tierA + tierTargets.tierB + tierTargets.tierC);
  }

  const selected: typeof effectivePool = [];
  const selectedIds = new Set<string>();
  for (const tier of ["tierA", "tierB", "tierC"] as const) {
    const picked = effectivePool
      .filter((item) => item.tier === tier && !selectedIds.has(item.row.id))
      .slice(0, tierTargets[tier]);
    for (const item of picked) {
      selected.push(item);
      selectedIds.add(item.row.id);
      tierStats[tier].selected += 1;
    }
  }

  if (selected.length < targetCount) {
    const fill = effectivePool.filter((item) => !selectedIds.has(item.row.id)).slice(0, targetCount - selected.length);
    for (const item of fill) {
      selected.push(item);
      selectedIds.add(item.row.id);
      tierStats[item.tier].selected += 1;
    }
  }

  const ensureAtLeast = (predicate: (item: (typeof ranked)[number]) => boolean, need: number) => {
    while (selected.filter(predicate).length < need) {
      const candidate = effectivePool.find((item) => !selectedIds.has(item.row.id) && predicate(item));
      if (!candidate) break;
      const replaceIndex = selected.findIndex((item) => !predicate(item));
      if (replaceIndex < 0) break;
      selectedIds.delete(selected[replaceIndex].row.id);
      selected[replaceIndex] = candidate;
      selectedIds.add(candidate.row.id);
    }
  };

  if (args.requirements.foundationalFirst) {
    ensureAtLeast((item) => item.isFoundational, Math.min(2, targetCount));
  }
  if (args.requirements.preferSurvey) {
    ensureAtLeast((item) => item.isSurvey, 1);
  }
  if (args.requirements.avoidBenchmarkOnly) {
    for (let i = 0; i < selected.length; i += 1) {
      if (!selected[i].isBenchmarkOnly) continue;
      const replacement = effectivePool.find(
        (item) => !selectedIds.has(item.row.id) && !item.isBenchmarkOnly,
      );
      if (!replacement) break;
      selectedIds.delete(selected[i].row.id);
      selected[i] = replacement;
      selectedIds.add(replacement.row.id);
    }
  }

  tierStats.tierA.selected = selected.filter((item) => item.tier === "tierA").length;
  tierStats.tierB.selected = selected.filter((item) => item.tier === "tierB").length;
  tierStats.tierC.selected = selected.filter((item) => item.tier === "tierC").length;

  const papers: PaperRecordInput[] = selected.map(({ row, score }) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    score,
    reason: "auto_seeded_fallback_after_sparse_core_strict_run",
  }));

  const corePapers: KnowledgePaperInput[] = selected.map(({ row, score }) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    source: "arxiv",
    ...(row.published ? { publishedAt: row.published } : {}),
    score,
    reason: "auto_seeded_fallback_after_sparse_core_strict_run",
    ...(row.summary ? { summary: row.summary } : {}),
    fullTextRead: false,
    readStatus: "metadata",
    unreadReason: "Auto-seeded fallback candidate; full-text bootstrap pending.",
  }));

  return {
    papers,
    corePapers,
    explorationTrace: traces,
    notes: `strict_core_backfill_seed selected=${selected.length} pool=${candidatePool} floor=${minCoreFloor} relevance_floor=${minRelevance} req_foundational=${args.requirements.foundationalFirst} req_avoid_benchmark=${args.requirements.avoidBenchmarkOnly} req_survey=${args.requirements.preferSurvey}`,
    recallTierStats: tierStats,
  };
}

function isPaperFullTextRead(paper: KnowledgePaperInput): boolean {
  return paper.fullTextRead === true || paper.readStatus === "fulltext";
}

function hasStrictEvidenceAnchor(paper: KnowledgePaperInput): boolean {
  const anchors = paper.evidenceAnchors ?? [];
  return anchors.some(
    (anchor) =>
      Boolean(anchor?.section?.trim()) &&
      Boolean(anchor?.locator?.trim()) &&
      Boolean(anchor?.quote?.trim()),
  );
}

function firstNonEmptyText(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = normalizeText(value);
    if (normalized.length > 0) return normalized;
  }
  return undefined;
}

function toEvidencePaperId(paper: KnowledgePaperInput): string {
  return derivePaperId({ id: paper.id, title: paper.title, url: paper.url });
}

function dedupeEvidenceIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const normalized = normalizeText(id);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function applyLightweightEvidenceBinding(args: {
  knowledgeState?: KnowledgeStateInput;
  runProfile?: "fast" | "strict";
}): {
  knowledgeState?: KnowledgeStateInput;
  anchorsAdded: number;
  evidenceIdsFilled: number;
} {
  if (!args.knowledgeState) {
    return { knowledgeState: args.knowledgeState, anchorsAdded: 0, evidenceIdsFilled: 0 };
  }

  const corePapers = args.knowledgeState.corePapers ?? [];
  if (corePapers.length === 0) {
    return { knowledgeState: args.knowledgeState, anchorsAdded: 0, evidenceIdsFilled: 0 };
  }

  let anchorsAdded = 0;
  const nextCore = corePapers.map((paper) => {
    if (!isPaperFullTextRead(paper)) return paper;
    if (hasStrictEvidenceAnchor(paper)) return paper;
    const quote = firstNonEmptyText([
      paper.keyEvidenceSpans?.[0],
      paper.summary,
      paper.reason,
      paper.title,
    ]);
    if (!quote) return paper;
    const nextQuote = quote.slice(0, 260);
    anchorsAdded += 1;
    return {
      ...paper,
      evidenceAnchors: [
        ...(paper.evidenceAnchors ?? []),
        {
          section: "AutoExtract",
          locator: paper.fullTextRef?.trim() || "excerpt:1",
          claim: firstNonEmptyText([paper.researchGoal, paper.reason, paper.title, "auto-bound claim"]) ?? "auto-bound claim",
          quote: nextQuote,
        },
      ],
    };
  });

  const fallbackEvidenceIds = dedupeEvidenceIds(
    nextCore.filter((paper) => isPaperFullTextRead(paper)).map((paper) => toEvidencePaperId(paper)).slice(0, 2),
  );
  let evidenceIdsFilled = 0;

  const patchEvidenceIds = (raw?: string[], allowAuto = true): string[] | undefined => {
    const existing = dedupeEvidenceIds(raw ?? []);
    if (existing.length > 0) return existing;
    if (!allowAuto || fallbackEvidenceIds.length === 0) return undefined;
    evidenceIdsFilled += 1;
    return [...fallbackEvidenceIds];
  };

  const nextKnowledgeChanges = (args.knowledgeState.knowledgeChanges ?? []).map((change) => ({
    ...change,
    ...(change.type === "BRIDGE"
      ? { evidenceIds: patchEvidenceIds(change.evidenceIds, false) }
      : { evidenceIds: patchEvidenceIds(change.evidenceIds, true) }),
  }));
  const nextKnowledgeUpdates = (args.knowledgeState.knowledgeUpdates ?? []).map((update) => ({
    ...update,
    evidenceIds: patchEvidenceIds(update.evidenceIds, true),
  }));
  const nextHypotheses = (args.knowledgeState.hypotheses ?? []).map((hypothesis) => ({
    ...hypothesis,
    evidenceIds: patchEvidenceIds(hypothesis.evidenceIds, true),
  }));

  if (anchorsAdded === 0 && evidenceIdsFilled === 0) {
    return { knowledgeState: args.knowledgeState, anchorsAdded: 0, evidenceIdsFilled: 0 };
  }

  const existingRunLog = args.knowledgeState.runLog;
  const runLog =
    existingRunLog || args.runProfile
      ? {
          ...(existingRunLog ?? {}),
          ...(existingRunLog?.runProfile ? {} : args.runProfile ? { runProfile: args.runProfile } : {}),
          notes: [existingRunLog?.notes, `auto_evidence_binding anchors_added=${anchorsAdded} ids_filled=${evidenceIdsFilled}`]
            .filter((item): item is string => Boolean(item && item.trim().length > 0))
            .join(" || "),
        }
      : undefined;

  return {
    knowledgeState: {
      ...args.knowledgeState,
      corePapers: nextCore,
      ...(nextKnowledgeChanges.length > 0 ? { knowledgeChanges: nextKnowledgeChanges } : {}),
      ...(nextKnowledgeUpdates.length > 0 ? { knowledgeUpdates: nextKnowledgeUpdates } : {}),
      ...(nextHypotheses.length > 0 ? { hypotheses: nextHypotheses } : {}),
      ...(runLog ? { runLog } : {}),
    },
    anchorsAdded,
    evidenceIdsFilled,
  };
}

function buildReflectionFollowupQuery(topic: string, hint: string): string {
  const tokens = tokenizeKeywords(`${topic} ${hint}`).slice(0, 8);
  if (tokens.length === 0) return normalizeText(topic);
  return tokens.join(" ");
}

function resolveSingleStepReflectionSeed(args: {
  topic: string;
  knowledgeState?: KnowledgeStateInput;
}): { trigger: "BRIDGE" | "CONFLICT" | "UNREAD_CORE"; reason: string; query: string } | undefined {
  const changes = args.knowledgeState?.knowledgeChanges ?? [];
  const bridgeChanges = changes.filter((item) => item.type === "BRIDGE");
  const newChanges = changes.filter((item) => item.type === "NEW");
  const reviseChanges = changes.filter((item) => item.type === "REVISE");
  const unreadCore = (args.knowledgeState?.corePapers ?? []).filter((paper) => !isPaperFullTextRead(paper));

  if (bridgeChanges.length > 0) {
    const seed = bridgeChanges[0]?.statement ?? args.topic;
    return {
      trigger: "BRIDGE",
      reason: "bridge_followup",
      query: buildReflectionFollowupQuery(args.topic, seed),
    };
  }

  if (newChanges.length >= 2 && reviseChanges.length >= 1) {
    const seed = `${newChanges[0]?.statement ?? ""} ${reviseChanges[0]?.statement ?? ""}`.trim();
    return {
      trigger: "CONFLICT",
      reason: "new_revise_followup",
      query: buildReflectionFollowupQuery(args.topic, seed || args.topic),
    };
  }

  if (unreadCore.length > 0) {
    const seed = unreadCore[0]?.id ?? unreadCore[0]?.title ?? args.topic;
    return {
      trigger: "UNREAD_CORE",
      reason: "unread_core_followup",
      query: buildReflectionFollowupQuery(args.topic, seed),
    };
  }

  return undefined;
}

async function executeSingleStepReflection(args: {
  topic: string;
  knownPaperIds: Set<string>;
  effectivePapers: PaperRecordInput[];
  knowledgeState?: KnowledgeStateInput;
}): Promise<{
  executed: boolean;
  resultCount: number;
  trace?: ExplorationTraceInput;
  papers: KnowledgePaperInput[];
  changes: KnowledgeStateInput["knowledgeChanges"];
}> {
  const seed = resolveSingleStepReflectionSeed({
    topic: args.topic,
    knowledgeState: args.knowledgeState,
  });
  if (!seed) {
    return {
      executed: false,
      resultCount: 0,
      papers: [],
      changes: [],
    };
  }

  const rows = await fetchArxivFallbackByQuery(seed.query);
  const localKnownIds = new Set<string>(args.knownPaperIds);
  for (const paper of args.effectivePapers) {
    localKnownIds.add(derivePaperId(paper));
  }
  for (const paper of args.knowledgeState?.corePapers ?? []) {
    localKnownIds.add(derivePaperId({ id: paper.id, title: paper.title, url: paper.url }));
  }
  for (const paper of args.knowledgeState?.explorationPapers ?? []) {
    localKnownIds.add(derivePaperId({ id: paper.id, title: paper.title, url: paper.url }));
  }

  const selected = rows.filter((row) => !localKnownIds.has(row.id)).slice(0, REFLECTION_MAX_ADDED_PAPERS);
  const papers: KnowledgePaperInput[] = selected.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    source: "arxiv",
    ...(row.published ? { publishedAt: row.published } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    fullTextRead: false,
    readStatus: "metadata",
    unreadReason: "single_step_reflection_added_without_fulltext",
  }));
  const changes: KnowledgeStateInput["knowledgeChanges"] =
    selected.length > 0
      ? [
          {
            type: "NEW",
            statement: `Reflection follow-up added ${selected.length} adjacent paper(s) for ${args.topic}.`,
            evidenceIds: selected.map((row) => row.id).slice(0, 3),
            topic: args.topic,
          },
        ]
      : [];

  return {
    executed: true,
    resultCount: selected.length,
    trace: {
      query: seed.query,
      reason: seed.reason,
      source: "arxiv",
      candidates: rows.length,
      filteredTo: selected.length,
      ...(selected.length === 0 ? { filteredOutReasons: ["no_unseen_reflection_candidates"] } : {}),
      resultCount: selected.length,
    },
    papers,
    changes,
  };
}

function dedupePaperRecords(records: PaperRecordInput[]): PaperRecordInput[] {
  const byId = new Map<string, PaperRecordInput>();
  for (const record of records) {
    const id = derivePaperId(record);
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { ...record, ...(record.id ? {} : { id }) });
      continue;
    }
    byId.set(id, {
      id: existing.id ?? record.id ?? id,
      title: existing.title ?? record.title,
      url: existing.url ?? record.url,
      score:
        typeof existing.score === "number" && Number.isFinite(existing.score)
          ? typeof record.score === "number" && Number.isFinite(record.score)
            ? Math.max(existing.score, record.score)
            : existing.score
          : record.score,
      reason: existing.reason ?? record.reason,
    });
  }
  return [...byId.values()];
}

function dedupeKnowledgePapers(records: KnowledgePaperInput[]): KnowledgePaperInput[] {
  const byId = new Map<string, KnowledgePaperInput>();
  for (const record of records) {
    const id = derivePaperId({ id: record.id, title: record.title, url: record.url });
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, {
        ...record,
        ...(record.id ? {} : { id }),
      });
      continue;
    }
    byId.set(id, {
      ...existing,
      ...record,
      id: existing.id ?? record.id ?? id,
      title: existing.title ?? record.title,
      url: existing.url ?? record.url,
      summary: existing.summary ?? record.summary,
      unreadReason: existing.unreadReason ?? record.unreadReason,
    });
  }
  return [...byId.values()];
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
  const expectedNormalizedTopic = normalizeTopic(normalizedTopicDisplay);

  let existing = root.topics[key];
  if (!existing) {
    for (const [legacyKey, candidate] of Object.entries(root.topics)) {
      if (!candidate || typeof candidate !== "object") continue;
      if (normalizeScope(candidate.scope) !== normalizedScope) continue;
      if (normalizeTopic(candidate.topic) !== expectedNormalizedTopic) continue;
      existing = candidate;
      if (legacyKey !== key) {
        delete root.topics[legacyKey];
        root.topics[key] = candidate;
      }
      break;
    }
  }

  if (existing) {
    existing.scope = normalizedScope;
    existing.topic = normalizedTopicDisplay;
    existing.topicKey = key;
    ensureTopicMemoryState(existing);
    if (!existing.pushedPapers || typeof existing.pushedPapers !== "object") {
      existing.pushedPapers = {};
    }
    if (!Number.isFinite(existing.totalRuns)) {
      existing.totalRuns = 0;
    }
    existing.preferences = mergePreferences(existing.preferences, incomingPrefs);

    // Merge duplicate legacy buckets produced by old scope normalization rules.
    for (const [otherKey, other] of Object.entries(root.topics)) {
      if (otherKey === key) continue;
      if (!other || typeof other !== "object") continue;
      if (normalizeScope(other.scope) !== normalizedScope) continue;
      if (normalizeTopic(other.topic) !== expectedNormalizedTopic) continue;

      ensureTopicMemoryState(other);
      existing.preferences = mergePreferences(existing.preferences, other.preferences);

      const existingMemory = ensureTopicMemoryState(existing);
      const otherMemory = ensureTopicMemoryState(other);

      existingMemory.feedbackCounts.read += otherMemory.feedbackCounts.read;
      existingMemory.feedbackCounts.skip += otherMemory.feedbackCounts.skip;
      existingMemory.feedbackCounts.star += otherMemory.feedbackCounts.star;

      for (const [k, v] of Object.entries(otherMemory.keywordScores)) {
        if (!Number.isFinite(v)) continue;
        updateScoreMap(existingMemory.keywordScores, k, v);
      }
      for (const [k, v] of Object.entries(otherMemory.sourceScores)) {
        if (!Number.isFinite(v)) continue;
        updateScoreMap(existingMemory.sourceScores, k, v);
      }
      existingMemory.keywordScores = limitScoreMap(existingMemory.keywordScores);
      existingMemory.sourceScores = limitScoreMap(existingMemory.sourceScores);

      const mergedNotes = [...existingMemory.recentNotes, ...otherMemory.recentNotes]
        .filter((item) => Number.isFinite(item.ts) && item.text.length > 0)
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_MEMORY_NOTES);
      existingMemory.recentNotes = mergedNotes;

      const existingFb = existingMemory.lastFeedbackAtMs ?? 0;
      const otherFb = otherMemory.lastFeedbackAtMs ?? 0;
      if (otherFb > existingFb) {
        existingMemory.lastFeedbackAtMs = otherFb;
      }

      for (const [paperId, paper] of Object.entries(other.pushedPapers ?? {})) {
        const current = existing.pushedPapers[paperId];
        if (!current) {
          existing.pushedPapers[paperId] = { ...paper };
          continue;
        }

        current.firstPushedAtMs = Math.min(current.firstPushedAtMs, paper.firstPushedAtMs);
        const paperPushCount = Number.isFinite(paper.pushCount) ? Math.max(0, Math.floor(paper.pushCount)) : 0;
        current.pushCount += paperPushCount;

        if (paper.lastPushedAtMs > current.lastPushedAtMs) {
          current.lastPushedAtMs = paper.lastPushedAtMs;
          if (paper.title) current.title = paper.title;
          if (paper.url) current.url = paper.url;
          if (typeof paper.lastScore === "number" && Number.isFinite(paper.lastScore)) {
            current.lastScore = paper.lastScore;
          }
          if (paper.lastReason) current.lastReason = paper.lastReason;
        } else {
          if (!current.title && paper.title) current.title = paper.title;
          if (!current.url && paper.url) current.url = paper.url;
          if (current.lastScore === undefined && typeof paper.lastScore === "number" && Number.isFinite(paper.lastScore)) {
            current.lastScore = paper.lastScore;
          }
          if (!current.lastReason && paper.lastReason) current.lastReason = paper.lastReason;
        }
      }

      const existingRuns = Number.isFinite(existing.totalRuns) ? Math.max(0, Math.floor(existing.totalRuns)) : 0;
      const otherRuns = Number.isFinite(other.totalRuns) ? Math.max(0, Math.floor(other.totalRuns)) : 0;
      existing.totalRuns = existingRuns + otherRuns;

      const existingLastRun = existing.lastRunAtMs ?? 0;
      const otherLastRun = other.lastRunAtMs ?? 0;
      if (otherLastRun > existingLastRun) {
        existing.lastRunAtMs = other.lastRunAtMs;
        existing.lastStatus = other.lastStatus;
        if (other.lastProjectId) {
          existing.lastProjectId = other.lastProjectId;
        }
      } else if (!existing.lastStatus && other.lastStatus) {
        existing.lastStatus = other.lastStatus;
      }

      delete root.topics[otherKey];
    }

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

function recentPapersByRecency(
  papers: Record<string, TopicPaperState>,
  limit: number,
): RecentPaperSummary[] {
  const normalizedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  return Object.values(papers)
    .sort((a, b) => b.lastPushedAtMs - a.lastPushedAtMs)
    .slice(0, normalizedLimit)
    .map((item) => ({
      id: item.id,
      ...(item.title ? { title: item.title } : {}),
      ...(item.url ? { url: item.url } : {}),
      ...(typeof item.lastScore === "number" && Number.isFinite(item.lastScore)
        ? { lastScore: item.lastScore }
        : {}),
      ...(item.lastReason ? { lastReason: item.lastReason } : {}),
      firstPushedAtMs: item.firstPushedAtMs,
      lastPushedAtMs: item.lastPushedAtMs,
      pushCount: item.pushCount,
    }));
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
  projectId?: string;
  knowledgeState?: KnowledgeStateInput;
}): Promise<RecordResult> {
  const root = await loadState();
  const topicState = getOrCreateTopicState(root, args.scope, args.topic, args.preferences);
  const memory = ensureTopicMemoryState(topicState);
  const now = Date.now();

  const normalizedPapersFromKnowledgeState: PaperRecordInput[] = (args.knowledgeState?.corePapers ?? [])
    .filter((paper) => paper && typeof paper === "object")
    .map((paper) => ({
      ...(paper.id ? { id: paper.id } : {}),
      ...(paper.title ? { title: paper.title } : {}),
      ...(paper.url ? { url: paper.url } : {}),
      ...(typeof paper.score === "number" && Number.isFinite(paper.score) ? { score: paper.score } : {}),
      ...(paper.reason ? { reason: paper.reason } : {}),
    }));
  let effectivePapers =
    args.papers.length > 0
      ? args.papers
      : normalizedPapersFromKnowledgeState.length > 0
        ? normalizedPapersFromKnowledgeState
        : [];

  const incomingRunLog = args.knowledgeState?.runLog
    ? { ...args.knowledgeState.runLog }
    : undefined;
  const incomingRunProfile =
    incomingRunLog?.runProfile === "fast" || incomingRunLog?.runProfile === "strict"
      ? incomingRunLog.runProfile
      : undefined;
  let effectiveRunLog = incomingRunLog ? { ...incomingRunLog } : undefined;
  if (incomingRunProfile === "strict" && effectiveRunLog) {
    const requiredCoreRaw =
      typeof effectiveRunLog.requiredCorePapers === "number" && Number.isFinite(effectiveRunLog.requiredCorePapers)
        ? Math.floor(effectiveRunLog.requiredCorePapers)
        : 0;
    if (requiredCoreRaw > 0) {
      effectiveRunLog.requiredCorePapers = Math.max(1, requiredCoreRaw);
    } else {
      effectiveRunLog.requiredCorePapers = Math.max(
        1,
        Math.min(topicState.preferences.maxPapers, DEFAULT_STRICT_MIN_CORE_FLOOR),
      );
    }

    if (
      typeof effectiveRunLog.requiredFullTextCoveragePct !== "number" ||
      !Number.isFinite(effectiveRunLog.requiredFullTextCoveragePct) ||
      effectiveRunLog.requiredFullTextCoveragePct < 80
    ) {
      effectiveRunLog.requiredFullTextCoveragePct = 80;
    }
  }
  let effectiveKnowledgeState =
    args.knowledgeState || effectiveRunLog
      ? {
          ...(args.knowledgeState ?? {}),
          ...(effectiveRunLog ? { runLog: effectiveRunLog } : {}),
        }
      : undefined;
  const requirementProfile = inferRequirementProfile(
    [
      topicState.topic,
      args.note,
      effectiveRunLog?.notes,
      effectiveKnowledgeState?.runLog?.notes,
    ]
      .filter((item): item is string => Boolean(item && item.trim().length > 0))
      .join(" "),
  );

  if (incomingRunProfile === "strict") {
    const strictMinCoreFloor = Math.max(1, Math.min(topicState.preferences.maxPapers, DEFAULT_STRICT_MIN_CORE_FLOOR));
    const requiredCoreFloor = Math.max(
      1,
      Math.min(topicState.preferences.maxPapers, effectiveRunLog?.requiredCorePapers ?? strictMinCoreFloor),
    );
    const strictCandidatePool = Math.max(
      DEFAULT_STRICT_CANDIDATE_POOL,
      topicState.preferences.maxPapers * 4,
    );
    const existingCorePapers = effectiveKnowledgeState?.corePapers ?? [];
    const strictSignalCount = Math.max(existingCorePapers.length, effectivePapers.length);
    if (strictSignalCount < requiredCoreFloor) {
      const knownIds = new Set<string>(Object.keys(topicState.pushedPapers));
      for (const paper of effectivePapers) knownIds.add(derivePaperId(paper));
      for (const paper of existingCorePapers) {
        knownIds.add(derivePaperId({ id: paper.id, title: paper.title, url: paper.url }));
      }
      const fallback = await strictCoreFallbackSeed({
        topic: topicState.topic,
        maxPapers: topicState.preferences.maxPapers,
        candidatePool: strictCandidatePool,
        minCoreFloor: requiredCoreFloor,
        knownPaperIds: knownIds,
        requirements: requirementProfile,
      });

      if (fallback.papers.length > 0) {
        const existingIds = new Set<string>(effectivePapers.map((paper) => derivePaperId(paper)));
        let fallbackPapers = fallback.papers.filter((paper) => !existingIds.has(derivePaperId(paper)));
        const needed = Math.max(0, requiredCoreFloor - strictSignalCount);
        if (needed > 0) {
          if (fallbackPapers.length === 0) fallbackPapers = fallback.papers;
          fallbackPapers = fallbackPapers.slice(0, needed);
        }

        const fallbackIds = new Set<string>(fallbackPapers.map((paper) => derivePaperId(paper)));
        const fallbackCore = fallback.corePapers.filter((paper) =>
          fallbackIds.has(derivePaperId({ id: paper.id, title: paper.title, url: paper.url })),
        );

        effectivePapers = dedupePaperRecords([...effectivePapers, ...fallbackPapers]);
        const mergedRunLog = {
          ...(effectiveRunLog ?? { runProfile: "strict" as const }),
          recallTierStats: fallback.recallTierStats,
          notes: [
            effectiveRunLog?.notes,
            fallback.notes,
            `strict_core_topup required=${requiredCoreFloor} before=${strictSignalCount} added=${fallbackPapers.length}`,
          ]
            .filter((item): item is string => Boolean(item && item.trim().length > 0))
            .join(" || "),
        };
        effectiveRunLog = mergedRunLog;
        effectiveKnowledgeState = {
          ...(effectiveKnowledgeState ?? {}),
          corePapers: dedupeKnowledgePapers([...(effectiveKnowledgeState?.corePapers ?? []), ...fallbackCore]),
          explorationTrace: [
            ...(effectiveKnowledgeState?.explorationTrace ?? []),
            ...fallback.explorationTrace,
          ],
          runLog: mergedRunLog,
        };
      }
    }
  }

  if (incomingRunProfile === "strict") {
    const strictCoreFromState = effectiveKnowledgeState?.corePapers ?? [];
    const strictCoreSeed: KnowledgePaperInput[] =
      strictCoreFromState.length > 0
        ? strictCoreFromState
        : effectivePapers.map((paper) => ({
            ...(paper.id ? { id: paper.id } : {}),
            ...(paper.title ? { title: paper.title } : {}),
            ...(paper.url ? { url: paper.url } : {}),
            ...(typeof paper.score === "number" && Number.isFinite(paper.score) ? { score: paper.score } : {}),
            ...(paper.reason ? { reason: paper.reason } : {}),
            fullTextRead: false,
            readStatus: "metadata",
            unreadReason: "Full text not fetched yet; pending strict full-text bootstrap.",
          }));

    if (strictCoreSeed.length > 0) {
      const strictAttemptLimit = Math.max(
        1,
        Math.min(
          MAX_STRICT_FULLTEXT_ATTEMPTS,
          effectiveRunLog?.requiredCorePapers ?? strictCoreSeed.length,
        ),
      );
      const backfilled = await backfillStrictCoreFullText({
        corePapers: strictCoreSeed,
        maxAttempts: strictAttemptLimit,
      });
      const strictRunLog = {
        ...(effectiveRunLog ?? { runProfile: "strict" as const }),
        fullTextAttempted: backfilled.attempted,
        fullTextCompleted: backfilled.completed,
        notes: [
          effectiveRunLog?.notes,
          `strict_fulltext_bootstrap attempted=${backfilled.attempted} completed=${backfilled.completed}`,
          ...(backfilled.failures.length > 0
            ? [`strict_fulltext_failures=${backfilled.failures.slice(0, 8).join(" | ")}`]
            : []),
        ]
          .filter((item): item is string => Boolean(item && item.trim().length > 0))
          .join(" || "),
      };
      effectiveRunLog = strictRunLog;
      effectiveKnowledgeState = {
        ...(effectiveKnowledgeState ?? {}),
        corePapers: backfilled.corePapers,
        runLog: strictRunLog,
      };
    }
  }

  const reflection = await executeSingleStepReflection({
    topic: topicState.topic,
    knownPaperIds: new Set<string>(Object.keys(topicState.pushedPapers)),
    effectivePapers,
    knowledgeState: effectiveKnowledgeState,
  });
  const reflectionRunLogBase =
    effectiveRunLog ??
    (incomingRunProfile ? { runProfile: incomingRunProfile } : undefined);
  if (reflection.executed) {
    const reflectionPaperRecords: PaperRecordInput[] = reflection.papers.map((paper) => ({
      ...(paper.id ? { id: paper.id } : {}),
      ...(paper.title ? { title: paper.title } : {}),
      ...(paper.url ? { url: paper.url } : {}),
      ...(typeof paper.score === "number" && Number.isFinite(paper.score) ? { score: paper.score } : {}),
      reason: "single_step_reflection_followup",
    }));
    effectivePapers = dedupePaperRecords([...effectivePapers, ...reflectionPaperRecords]);
    const mergedRunLog = {
      ...(reflectionRunLogBase ?? {}),
      reflectionStepExecuted: true,
      reflectionStepResultCount: reflection.resultCount,
      notes: [
        reflectionRunLogBase?.notes,
        `single_step_reflection result_count=${reflection.resultCount}`,
      ]
        .filter((item): item is string => Boolean(item && item.trim().length > 0))
        .join(" || "),
    };
    effectiveRunLog = mergedRunLog;
    effectiveKnowledgeState = {
      ...(effectiveKnowledgeState ?? {}),
      explorationTrace: [
        ...(effectiveKnowledgeState?.explorationTrace ?? []),
        ...(reflection.trace ? [reflection.trace] : []),
      ],
      explorationPapers: dedupeKnowledgePapers([
        ...(effectiveKnowledgeState?.explorationPapers ?? []),
        ...reflection.papers,
      ]),
      knowledgeChanges: [
        ...(effectiveKnowledgeState?.knowledgeChanges ?? []),
        ...(reflection.changes ?? []),
      ],
      runLog: mergedRunLog,
    };
  } else if (reflectionRunLogBase) {
    const mergedRunLog = {
      ...reflectionRunLogBase,
      reflectionStepExecuted: false,
      reflectionStepResultCount: 0,
    };
    effectiveRunLog = mergedRunLog;
    effectiveKnowledgeState = {
      ...(effectiveKnowledgeState ?? {}),
      runLog: mergedRunLog,
    };
  }

  const autoEvidence = applyLightweightEvidenceBinding({
    knowledgeState: effectiveKnowledgeState,
    runProfile: incomingRunProfile,
  });
  effectiveKnowledgeState = autoEvidence.knowledgeState;
  if (autoEvidence.anchorsAdded > 0 || autoEvidence.evidenceIdsFilled > 0) {
    effectiveRunLog = effectiveKnowledgeState?.runLog
      ? { ...effectiveKnowledgeState.runLog }
      : effectiveRunLog;
  }

  const statusRaw = normalizeText(args.status ?? "").toLowerCase();
  const researchArtifactsCount =
    effectivePapers.length +
    (effectiveKnowledgeState?.explorationPapers?.length ?? 0) +
    (effectiveKnowledgeState?.knowledgeChanges?.length ?? 0) +
    (effectiveKnowledgeState?.knowledgeUpdates?.length ?? 0) +
    (effectiveKnowledgeState?.hypotheses?.length ?? 0) +
    (effectiveKnowledgeState?.explorationTrace?.length ?? 0);
  let normalizedStatus = statusRaw.length > 0 ? statusRaw : undefined;
  const coercedFromEmptyWithArtifacts = normalizedStatus === "empty" && researchArtifactsCount > 0;
  if (coercedFromEmptyWithArtifacts) {
    normalizedStatus = "degraded_quality";
  }
  const hasRunError = Boolean(
    effectiveKnowledgeState?.runLog?.error && normalizeText(effectiveKnowledgeState.runLog.error).length > 0,
  );
  const requiresArtifacts =
    normalizedStatus === "ok" || normalizedStatus === "fallback_representative" || normalizedStatus === "degraded_quality";
  if (requiresArtifacts && researchArtifactsCount === 0 && !hasRunError) {
    throw new Error(
      "record payload has no research artifacts. Use status=empty for no-result runs, or include run_log.error for failed runs.",
    );
  }

  let recordedPapers = 0;
  for (const rawPaper of effectivePapers) {
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
  topicState.lastStatus = normalizedStatus ?? (recordedPapers > 0 ? "ok" : "empty");
  const effectiveNote = coercedFromEmptyWithArtifacts
    ? [args.note?.trim(), "status coerced: empty -> degraded_quality because research artifacts were present"]
        .filter((item): item is string => Boolean(item && item.length > 0))
        .join(" | ")
    : args.note;
  const knowledgeCommitted = await commitKnowledgeRun({
    projectId: args.projectId ?? topicState.lastProjectId,
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    status: topicState.lastStatus,
    runId: args.runId,
    note: effectiveNote,
    papers: effectivePapers,
    knowledgeState: effectiveKnowledgeState,
  });
  topicState.lastStatus = knowledgeCommitted.summary.lastStatus ?? topicState.lastStatus;
  topicState.lastProjectId = knowledgeCommitted.projectId;

  await saveState(root);

  await appendPushLog({
    ts: now,
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    status: topicState.lastStatus,
    runId: knowledgeCommitted.runId,
    run_id: knowledgeCommitted.runId,
    run_profile: effectiveKnowledgeState?.runLog?.runProfile ?? null,
    projectId: knowledgeCommitted.projectId,
    streamKey: knowledgeCommitted.streamKey,
    preferences: topicState.preferences,
    recordedPapers,
    papers: effectivePapers.map((paper) => ({
      id: derivePaperId(paper),
      title: paper.title?.trim(),
      url: paper.url?.trim(),
      ...(typeof paper.score === "number" && Number.isFinite(paper.score) ? { score: paper.score } : {}),
      ...(paper.reason ? { reason: paper.reason.trim() } : {}),
    })),
    note: effectiveNote,
    knowledgeStateSummary: knowledgeCommitted.summary,
  });

  return {
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    preferences: topicState.preferences,
    memoryHints: buildMemoryHints(memory),
    runId: knowledgeCommitted.runId,
    recordedPapers,
    totalKnownPapers: Object.keys(topicState.pushedPapers).length,
    pushedAtMs: now,
    projectId: knowledgeCommitted.projectId,
    streamKey: knowledgeCommitted.streamKey,
    knowledgeStateSummary: knowledgeCommitted.summary,
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
  projectId?: string;
}): Promise<
  PrepareResult & {
    totalRuns: number;
    lastStatus?: string;
    recentPapers: RecentPaperSummary[];
    knowledgeStateSummary?: KnowledgeStateSummary;
    knowledgeStateMissingReason?: "project_unbound" | "project_or_stream_not_found";
    recentHypotheses: KnowledgeStateSummary["recentHypotheses"];
    recentChangeStats: KnowledgeStateSummary["recentChangeStats"];
    lastExplorationTrace: KnowledgeStateSummary["lastExplorationTrace"];
  }
> {
  const root = await loadState();
  const topicState = getOrCreateTopicState(root, args.scope, args.topic);
  const memory = ensureTopicMemoryState(topicState);
  const knowledgeSummaryResult = await readKnowledgeSummary({
    scope: topicState.scope,
    topic: topicState.topic,
    topicKey: topicState.topicKey,
    projectId: args.projectId ?? topicState.lastProjectId,
  });
  if (knowledgeSummaryResult?.projectId) {
    topicState.lastProjectId = knowledgeSummaryResult.projectId;
  }
  await saveState(root);

  const excludePaperIds = sortPaperIdsByRecency(topicState.pushedPapers);
  const lastPushedAtMs = excludePaperIds.length
    ? topicState.pushedPapers[excludePaperIds[0]]?.lastPushedAtMs
    : undefined;
  const knowledgeStateMissingReason =
    knowledgeSummaryResult === undefined
      ? args.projectId || topicState.lastProjectId
        ? "project_or_stream_not_found"
        : "project_unbound"
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
    recentPapers: recentPapersByRecency(topicState.pushedPapers, 10),
    ...(knowledgeSummaryResult ? { knowledgeStateSummary: knowledgeSummaryResult.summary } : {}),
    ...(knowledgeStateMissingReason ? { knowledgeStateMissingReason } : {}),
    recentHypotheses: knowledgeSummaryResult?.summary.recentHypotheses ?? [],
    recentChangeStats: knowledgeSummaryResult?.summary.recentChangeStats ?? [],
    lastExplorationTrace: knowledgeSummaryResult?.summary.lastExplorationTrace ?? [],
  };
}

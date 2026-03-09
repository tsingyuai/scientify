import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  dayKeyFromTimestamp,
  renderDailyChangesMarkdown,
  renderExplorationLogMarkdown,
  renderHypothesisMarkdown,
  renderIngestLogMarkdown,
  renderKnowledgeIndexMarkdown,
  renderPaperNoteHeaderMarkdown,
  renderPaperNoteRunMarkdown,
  renderReflectionLogMarkdown,
  renderTopicUpdateMarkdown,
  slugifyTopic,
} from "./render.js";
import { resolveProjectContext } from "./project.js";
import type {
  CommitKnowledgeRunInput,
  ExplorationTraceInput,
  HypothesisGateSummary,
  KnowledgeChangeInput,
  KnowledgeHypothesisInput,
  KnowledgePaperInput,
  KnowledgeStateRoot,
  KnowledgeStateSummary,
  KnowledgeStreamState,
  KnowledgeUpdateInput,
  RecentChangeStat,
  RecentHypothesisSummary,
  ReflectionTaskInput,
} from "./types.js";

const STATE_VERSION = 1 as const;
const MAX_RECENT_RUN_IDS = 200;
const MAX_RECENT_HYPOTHESES = 50;
const MAX_RECENT_CHANGE_STATS = 30;
const MAX_LAST_TRACE = 20;
const MAX_LAST_REFLECTION_TASKS = 20;
const MAX_RECENT_PAPERS = 50;
const MAX_PAPER_NOTES = 800;
const MAX_HYPOTHESIS_REJECTION_REASONS = 24;
const MIN_CORE_FULLTEXT_COVERAGE = 0.8;
const MIN_EVIDENCE_BINDING_RATE = 0.9;
const MAX_CITATION_ERROR_RATE = 0.02;
const MIN_HYPOTHESIS_EVIDENCE = 2;
const MIN_HYPOTHESIS_DEPENDENCY_STEPS = 2;
const MIN_HYPOTHESIS_STATEMENT_CHARS = 48;

function defaultQualityGateState(): {
  passed: boolean;
  fullTextCoveragePct: number;
  evidenceBindingRatePct: number;
  citationErrorRatePct: number;
  reasons: string[];
} {
  return {
    passed: false,
    fullTextCoveragePct: 0,
    evidenceBindingRatePct: 0,
    citationErrorRatePct: 0,
    reasons: ["quality gate not evaluated"],
  };
}

function defaultHypothesisGateState(): HypothesisGateSummary {
  return {
    accepted: 0,
    rejected: 0,
    rejectionReasons: [],
  };
}

function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function sanitizeId(raw: string): string {
  return normalizeText(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeScope(raw: string): string {
  const trimmed = normalizeText(raw).toLowerCase();
  if (!trimmed) return "global";
  const parts = trimmed.split(":");
  if (parts.length === 1) return sanitizeId(parts[0]) || "global";
  return `${sanitizeId(parts[0])}:${sanitizeId(parts.slice(1).join(":"))}`;
}

function buildRunFingerprint(args: {
  scope: string;
  topic: string;
  status: string;
  day: string;
  paperIds: string[];
  note?: string;
}): string {
  const digest = createHash("sha1")
    .update(args.scope)
    .update("\n")
    .update(args.topic)
    .update("\n")
    .update(args.status)
    .update("\n")
    .update(args.day)
    .update("\n")
    .update(args.paperIds.sort().join("|"))
    .update("\n")
    .update(args.note ?? "")
    .digest("hex");
  return `fp-${digest.slice(0, 20)}`;
}

function getKnowledgeStateRoot(projectPath: string): string {
  return path.join(projectPath, "knowledge_state");
}

function getStatePath(projectPath: string): string {
  return path.join(getKnowledgeStateRoot(projectPath), "state.json");
}

function getEventsPath(projectPath: string): string {
  return path.join(getKnowledgeStateRoot(projectPath), "events.jsonl");
}

function getLockPath(projectPath: string): string {
  return path.join(getKnowledgeStateRoot(projectPath), ".lock");
}

function buildDefaultState(): KnowledgeStateRoot {
  return {
    version: STATE_VERSION,
    updatedAtMs: Date.now(),
    streams: {},
  };
}

async function ensureLayout(projectPath: string): Promise<void> {
  const root = getKnowledgeStateRoot(projectPath);
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, "knowledge"), { recursive: true });
  await mkdir(path.join(root, "paper_notes"), { recursive: true });
  await mkdir(path.join(root, "daily_changes"), { recursive: true });
  await mkdir(path.join(root, "hypotheses"), { recursive: true });
  await mkdir(path.join(root, "logs"), { recursive: true });
}

async function loadState(projectPath: string): Promise<KnowledgeStateRoot> {
  const file = getStatePath(projectPath);
  if (!existsSync(file)) return buildDefaultState();

  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<KnowledgeStateRoot>;
    if (parsed.version !== STATE_VERSION || !parsed.streams || typeof parsed.streams !== "object") {
      return buildDefaultState();
    }
    const streams: Record<string, KnowledgeStreamState> = {};
    for (const [key, rawStream] of Object.entries(parsed.streams as Record<string, Partial<KnowledgeStreamState>>)) {
      if (!rawStream || typeof rawStream !== "object") continue;
      const topicKey = rawStream.topicKey && normalizeText(rawStream.topicKey) ? normalizeText(rawStream.topicKey) : key;
      streams[key] = {
        scope: normalizeScope(rawStream.scope ?? "global"),
        topic: normalizeText(rawStream.topic ?? "topic"),
        topicKey,
        projectId: sanitizeId(rawStream.projectId ?? "auto-topic-global-000000") || "auto-topic-global-000000",
        totalRuns: typeof rawStream.totalRuns === "number" ? Math.max(0, Math.floor(rawStream.totalRuns)) : 0,
        totalHypotheses:
          typeof rawStream.totalHypotheses === "number" ? Math.max(0, Math.floor(rawStream.totalHypotheses)) : 0,
        knowledgeTopics: Array.isArray(rawStream.knowledgeTopics)
          ? rawStream.knowledgeTopics.filter((item): item is string => typeof item === "string").map((item) => normalizeText(item))
          : [],
        paperNotes: Array.isArray(rawStream.paperNotes)
          ? rawStream.paperNotes.filter((item): item is string => typeof item === "string").map((item) => normalizeText(item))
          : [],
        recentFullTextReadCount:
          typeof rawStream.recentFullTextReadCount === "number"
            ? Math.max(0, Math.floor(rawStream.recentFullTextReadCount))
            : 0,
        recentNotFullTextReadCount:
          typeof rawStream.recentNotFullTextReadCount === "number"
            ? Math.max(0, Math.floor(rawStream.recentNotFullTextReadCount))
            : 0,
        lastQualityGate:
          rawStream.lastQualityGate &&
          typeof rawStream.lastQualityGate === "object" &&
          !Array.isArray(rawStream.lastQualityGate)
            ? {
                passed: rawStream.lastQualityGate.passed === true,
                fullTextCoveragePct:
                  typeof rawStream.lastQualityGate.fullTextCoveragePct === "number" &&
                  Number.isFinite(rawStream.lastQualityGate.fullTextCoveragePct)
                    ? Number(rawStream.lastQualityGate.fullTextCoveragePct.toFixed(2))
                    : 0,
                evidenceBindingRatePct:
                  typeof rawStream.lastQualityGate.evidenceBindingRatePct === "number" &&
                  Number.isFinite(rawStream.lastQualityGate.evidenceBindingRatePct)
                    ? Number(rawStream.lastQualityGate.evidenceBindingRatePct.toFixed(2))
                    : 0,
                citationErrorRatePct:
                  typeof rawStream.lastQualityGate.citationErrorRatePct === "number" &&
                  Number.isFinite(rawStream.lastQualityGate.citationErrorRatePct)
                    ? Number(rawStream.lastQualityGate.citationErrorRatePct.toFixed(2))
                    : 0,
                reasons: Array.isArray(rawStream.lastQualityGate.reasons)
                  ? rawStream.lastQualityGate.reasons
                      .filter((item): item is string => typeof item === "string")
                      .map((item) => normalizeText(item))
                      .filter((item) => item.length > 0)
                  : [],
              }
            : defaultQualityGateState(),
        lastUnreadCorePaperIds: Array.isArray(rawStream.lastUnreadCorePaperIds)
          ? rawStream.lastUnreadCorePaperIds
              .filter((item): item is string => typeof item === "string")
              .map((item) => normalizeText(item))
              .filter((item) => item.length > 0)
          : [],
        recentPapers: Array.isArray(rawStream.recentPapers)
          ? rawStream.recentPapers
              .filter((item): item is KnowledgePaperInput => !!item && typeof item === "object")
              .map(normalizePaper)
          : [],
        ...(typeof rawStream.lastRunAtMs === "number" ? { lastRunAtMs: rawStream.lastRunAtMs } : {}),
        ...(rawStream.lastStatus ? { lastStatus: normalizeText(rawStream.lastStatus) } : {}),
        recentRunIds: Array.isArray(rawStream.recentRunIds)
          ? rawStream.recentRunIds.filter((item): item is string => typeof item === "string").map((item) => normalizeText(item))
          : [],
        recentHypothesisIds: Array.isArray(rawStream.recentHypothesisIds)
          ? rawStream.recentHypothesisIds
              .filter((item): item is string => typeof item === "string")
              .map((item) => normalizeText(item))
          : [],
        recentHypotheses: Array.isArray(rawStream.recentHypotheses)
          ? rawStream.recentHypotheses.filter(
              (item): item is KnowledgeStreamState["recentHypotheses"][number] => !!item && typeof item === "object",
            )
          : [],
        recentChangeStats: Array.isArray(rawStream.recentChangeStats)
          ? rawStream.recentChangeStats.filter(
              (item): item is KnowledgeStreamState["recentChangeStats"][number] => !!item && typeof item === "object",
            )
          : [],
        lastExplorationTrace: Array.isArray(rawStream.lastExplorationTrace)
          ? rawStream.lastExplorationTrace
              .filter((item): item is ExplorationTraceInput => !!item && typeof item === "object")
              .map(normalizeTrace)
              .filter((item): item is ExplorationTraceInput => Boolean(item))
          : [],
        lastReflectionTasks: Array.isArray(rawStream.lastReflectionTasks)
          ? rawStream.lastReflectionTasks
              .filter((item): item is ReflectionTaskInput => !!item && typeof item === "object")
              .map((item) => ({
                id: sanitizeId(item.id ?? "task"),
                trigger: ["BRIDGE", "TREND", "CONTRADICTION", "UNREAD_CORE"].includes(item.trigger)
                  ? item.trigger
                  : "TREND",
                reason: normalizeText(item.reason ?? ""),
                query: normalizeText(item.query ?? ""),
                priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium",
                status: (item.status === "executed" ? "executed" : "planned") as "planned" | "executed",
              }))
              .filter((item) => item.reason.length > 0 && item.query.length > 0)
          : [],
        lastHypothesisGate:
          rawStream.lastHypothesisGate &&
          typeof rawStream.lastHypothesisGate === "object" &&
          !Array.isArray(rawStream.lastHypothesisGate)
            ? {
                accepted:
                  typeof rawStream.lastHypothesisGate.accepted === "number"
                    ? Math.max(0, Math.floor(rawStream.lastHypothesisGate.accepted))
                    : 0,
                rejected:
                  typeof rawStream.lastHypothesisGate.rejected === "number"
                    ? Math.max(0, Math.floor(rawStream.lastHypothesisGate.rejected))
                    : 0,
                rejectionReasons: Array.isArray(rawStream.lastHypothesisGate.rejectionReasons)
                  ? rawStream.lastHypothesisGate.rejectionReasons
                      .filter((item): item is string => typeof item === "string")
                      .map((item) => normalizeText(item))
                      .filter((item) => item.length > 0)
                  : [],
              }
            : defaultHypothesisGateState(),
      };
    }

    return {
      version: STATE_VERSION,
      updatedAtMs: typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : Date.now(),
      streams,
    };
  } catch {
    return buildDefaultState();
  }
}

async function saveStateAtomic(projectPath: string, state: KnowledgeStateRoot): Promise<void> {
  const file = getStatePath(projectPath);
  const tmp = `${file}.tmp`;
  state.updatedAtMs = Date.now();
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await rename(tmp, file);
}

async function appendEvent(projectPath: string, event: Record<string, unknown>): Promise<void> {
  await appendFile(getEventsPath(projectPath), `${JSON.stringify(event)}\n`, "utf-8");
}

async function appendMarkdown(filePath: string, block: string): Promise<void> {
  await appendFile(filePath, `${block}\n`, "utf-8");
}

function normalizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
  return values.length > 0 ? values : undefined;
}

function normalizeEvidenceAnchors(
  raw: KnowledgePaperInput["evidenceAnchors"],
): KnowledgePaperInput["evidenceAnchors"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const anchors = raw
    .filter((item): item is NonNullable<KnowledgePaperInput["evidenceAnchors"]>[number] => !!item && typeof item === "object")
    .map((item) => {
      const claim = normalizeText(item.claim ?? "");
      if (!claim) return undefined;
      return {
        ...(item.section ? { section: normalizeText(item.section) } : {}),
        ...(item.locator ? { locator: normalizeText(item.locator) } : {}),
        claim,
        ...(item.quote ? { quote: normalizeText(item.quote) } : {}),
      };
    })
    .filter((item): item is NonNullable<KnowledgePaperInput["evidenceAnchors"]>[number] => Boolean(item));
  return anchors.length > 0 ? anchors : undefined;
}

function toPaperNoteSlug(paper: KnowledgePaperInput): string {
  const primary = paper.id ?? paper.url ?? paper.title ?? "";
  const raw = normalizeText(primary);
  const base = sanitizeId(raw.replace(/[:/.]+/g, "-")).slice(0, 72);
  const digest = createHash("sha1")
    .update([paper.id ?? "", paper.url ?? "", paper.title ?? ""].join("\n"))
    .digest("hex")
    .slice(0, 8);
  return `${base || "paper"}-${digest}`;
}

function normalizePaper(input: KnowledgePaperInput): KnowledgePaperInput {
  const evidenceIds = Array.isArray(input.evidenceIds)
    ? input.evidenceIds.map((id) => normalizeText(id)).filter((id) => id.length > 0)
    : undefined;
  const keyEvidenceSpans = normalizeStringArray(input.keyEvidenceSpans);
  const subdomains = normalizeStringArray(input.subdomains);
  const crossDomainLinks = normalizeStringArray(input.crossDomainLinks);
  const keyContributions = normalizeStringArray(input.keyContributions);
  const practicalInsights = normalizeStringArray(input.practicalInsights);
  const mustUnderstandPoints = normalizeStringArray(input.mustUnderstandPoints);
  const limitations = normalizeStringArray(input.limitations);
  const evidenceAnchors = normalizeEvidenceAnchors(input.evidenceAnchors);
  const readStatusRaw = input.readStatus?.trim().toLowerCase();
  const readStatus =
    readStatusRaw && ["fulltext", "partial", "metadata", "unread"].includes(readStatusRaw)
      ? (readStatusRaw as "fulltext" | "partial" | "metadata" | "unread")
      : undefined;
  const fullTextRead =
    typeof input.fullTextRead === "boolean"
      ? input.fullTextRead
      : readStatus === "fulltext"
        ? true
        : readStatus
          ? false
          : undefined;
  const unreadReason = input.unreadReason ? normalizeText(input.unreadReason) : undefined;
  return {
    ...(input.id ? { id: normalizeText(input.id) } : {}),
    ...(input.title ? { title: normalizeText(input.title) } : {}),
    ...(input.url ? { url: normalizeText(input.url) } : {}),
    ...(input.source ? { source: normalizeText(input.source) } : {}),
    ...(input.publishedAt ? { publishedAt: normalizeText(input.publishedAt) } : {}),
    ...(typeof input.score === "number" && Number.isFinite(input.score)
      ? { score: Number(input.score.toFixed(2)) }
      : {}),
    ...(input.reason ? { reason: normalizeText(input.reason) } : {}),
    ...(input.summary ? { summary: normalizeText(input.summary) } : {}),
    ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
    ...(typeof fullTextRead === "boolean" ? { fullTextRead } : {}),
    ...(readStatus ? { readStatus } : {}),
    ...(input.fullTextSource ? { fullTextSource: normalizeText(input.fullTextSource) } : {}),
    ...(input.fullTextRef ? { fullTextRef: normalizeText(input.fullTextRef) } : {}),
    ...(unreadReason ? { unreadReason } : {}),
    ...(keyEvidenceSpans && keyEvidenceSpans.length > 0 ? { keyEvidenceSpans } : {}),
    ...(input.domain ? { domain: normalizeText(input.domain) } : {}),
    ...(subdomains ? { subdomains } : {}),
    ...(crossDomainLinks ? { crossDomainLinks } : {}),
    ...(input.researchGoal ? { researchGoal: normalizeText(input.researchGoal) } : {}),
    ...(input.approach ? { approach: normalizeText(input.approach) } : {}),
    ...(input.methodologyDesign ? { methodologyDesign: normalizeText(input.methodologyDesign) } : {}),
    ...(keyContributions ? { keyContributions } : {}),
    ...(practicalInsights ? { practicalInsights } : {}),
    ...(mustUnderstandPoints ? { mustUnderstandPoints } : {}),
    ...(limitations ? { limitations } : {}),
    ...(evidenceAnchors ? { evidenceAnchors } : {}),
  };
}

function normalizeTrace(input: ExplorationTraceInput): ExplorationTraceInput | undefined {
  const query = normalizeText(input.query ?? "");
  if (!query) return undefined;
  const filteredOutReasons = Array.isArray(input.filteredOutReasons)
    ? input.filteredOutReasons.map((item) => normalizeText(item)).filter((item) => item.length > 0)
    : undefined;
  return {
    query,
    ...(input.reason ? { reason: normalizeText(input.reason) } : {}),
    ...(input.source ? { source: normalizeText(input.source) } : {}),
    ...(typeof input.candidates === "number" && Number.isFinite(input.candidates)
      ? { candidates: Math.max(0, Math.floor(input.candidates)) }
      : {}),
    ...(typeof input.filteredTo === "number" && Number.isFinite(input.filteredTo)
      ? { filteredTo: Math.max(0, Math.floor(input.filteredTo)) }
      : {}),
    ...(filteredOutReasons && filteredOutReasons.length > 0 ? { filteredOutReasons } : {}),
    ...(typeof input.resultCount === "number" && Number.isFinite(input.resultCount)
      ? { resultCount: Math.max(0, Math.floor(input.resultCount)) }
      : {}),
  };
}

function paperIdentity(input: KnowledgePaperInput): string {
  const id = input.id ? normalizeText(input.id).toLowerCase() : "";
  if (id) return `id:${id}`;
  const url = input.url ? normalizeText(input.url).toLowerCase() : "";
  if (url) return `url:${url}`;
  const title = input.title ? normalizeText(input.title).toLowerCase() : "";
  if (title) return `title:${title}`;
  return "";
}

function mergePapers(primary: KnowledgePaperInput[], secondary: KnowledgePaperInput[]): KnowledgePaperInput[] {
  const byId = new Map<string, KnowledgePaperInput>();

  const upsert = (paper: KnowledgePaperInput) => {
    const normalized = normalizePaper(paper);
    const key = paperIdentity(normalized);
    if (!key) return;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, normalized);
      return;
    }
    byId.set(key, {
      ...existing,
      ...normalized,
      evidenceIds:
        normalized.evidenceIds && normalized.evidenceIds.length > 0
          ? [...new Set([...(existing.evidenceIds ?? []), ...normalized.evidenceIds])]
          : existing.evidenceIds,
      keyEvidenceSpans:
        normalized.keyEvidenceSpans && normalized.keyEvidenceSpans.length > 0
          ? [...new Set([...(existing.keyEvidenceSpans ?? []), ...normalized.keyEvidenceSpans])]
          : existing.keyEvidenceSpans,
    });
  };

  for (const item of primary) upsert(item);
  for (const item of secondary) upsert(item);

  return [...byId.values()];
}

function withReadMark(paper: KnowledgePaperInput, unreadFallback: string): KnowledgePaperInput {
  const normalized = normalizePaper(paper);
  const { unreadReason: existingUnreadReason, ...rest } = normalized;
  const readStatus = normalized.readStatus ?? (normalized.fullTextRead ? "fulltext" : "metadata");
  const fullTextRead = typeof normalized.fullTextRead === "boolean" ? normalized.fullTextRead : readStatus === "fulltext";
  const unreadReason =
    fullTextRead || readStatus === "fulltext"
      ? undefined
      : existingUnreadReason?.trim()
        ? existingUnreadReason.trim()
        : unreadFallback;

  return {
    ...rest,
    readStatus,
    fullTextRead,
    ...(unreadReason ? { unreadReason } : {}),
  };
}

function countFullTextStats(papers: KnowledgePaperInput[]): { fullTextReadCount: number; notFullTextReadCount: number } {
  let fullTextReadCount = 0;
  let notFullTextReadCount = 0;
  for (const paper of papers) {
    if (paper.fullTextRead === true || paper.readStatus === "fulltext") fullTextReadCount += 1;
    else notFullTextReadCount += 1;
  }
  return { fullTextReadCount, notFullTextReadCount };
}

function hasStructuredProfile(paper: KnowledgePaperInput): boolean {
  return Boolean(
    (paper.domain && paper.domain.trim()) ||
      (paper.subdomains && paper.subdomains.length > 0) ||
      (paper.crossDomainLinks && paper.crossDomainLinks.length > 0) ||
      (paper.researchGoal && paper.researchGoal.trim()) ||
      (paper.approach && paper.approach.trim()) ||
      (paper.methodologyDesign && paper.methodologyDesign.trim()) ||
      (paper.keyContributions && paper.keyContributions.length > 0) ||
      (paper.practicalInsights && paper.practicalInsights.length > 0) ||
      (paper.mustUnderstandPoints && paper.mustUnderstandPoints.length > 0) ||
      (paper.limitations && paper.limitations.length > 0) ||
      (paper.evidenceAnchors && paper.evidenceAnchors.length > 0),
  );
}

function isFullTextRead(paper: KnowledgePaperInput): boolean {
  return paper.fullTextRead === true || paper.readStatus === "fulltext";
}

function normalizedCitationToken(raw: string): string {
  return normalizeText(raw).toLowerCase();
}

function isStrictEvidenceAnchor(
  anchor: NonNullable<KnowledgePaperInput["evidenceAnchors"]>[number],
): boolean {
  return Boolean(anchor.section?.trim() && anchor.locator?.trim() && anchor.quote?.trim());
}

function hasStrictEvidenceAnchor(paper: KnowledgePaperInput): boolean {
  const anchors = paper.evidenceAnchors ?? [];
  return anchors.some((anchor) => isStrictEvidenceAnchor(anchor));
}

function buildPaperLookup(papers: KnowledgePaperInput[]): Map<string, KnowledgePaperInput> {
  const lookup = new Map<string, KnowledgePaperInput>();
  for (const paper of papers) {
    const candidates = [paper.id, paper.url, paper.title]
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizedCitationToken(item));
    for (const key of candidates) {
      if (!key) continue;
      if (!lookup.has(key)) lookup.set(key, paper);
    }
  }
  return lookup;
}

function dedupeText(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = normalizedCitationToken(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function applyQualityGates(args: {
  corePapers: KnowledgePaperInput[];
  allRunPapers: KnowledgePaperInput[];
  explorationTrace: ExplorationTraceInput[];
  reflectionTasks: ReflectionTaskInput[];
  knowledgeChanges: KnowledgeChangeInput[];
  knowledgeUpdates: KnowledgeUpdateInput[];
  hypotheses: KnowledgeHypothesisInput[];
  hypothesisGate: HypothesisGateSummary;
  requiredCorePapers?: number;
  requiredFullTextCoveragePct?: number;
}): {
  qualityGate: {
    passed: boolean;
    fullTextCoveragePct: number;
    evidenceBindingRatePct: number;
    citationErrorRatePct: number;
    reasons: string[];
  };
  unreadCorePaperIds: string[];
  downgradedHighConfidenceCount: number;
} {
  const corePapers = args.corePapers;
  const coreCount = corePapers.length;
  const fullTextCoreCount = corePapers.filter((paper) => isFullTextRead(paper)).length;
  const fullTextCoverage = coreCount > 0 ? fullTextCoreCount / coreCount : 0;
  const fullTextCoveragePct = Number((fullTextCoverage * 100).toFixed(2));

  const unreadCorePaperIds = dedupeText(
    corePapers
      .filter((paper) => !isFullTextRead(paper))
      .map((paper) => paper.id?.trim() || paper.url?.trim() || paper.title?.trim() || "unknown-paper"),
  ).slice(0, 50);

  const paperLookup = buildPaperLookup(args.allRunPapers);
  const strictAnchorByKey = new Map<string, boolean>();
  for (const [key, paper] of paperLookup.entries()) {
    strictAnchorByKey.set(key, hasStrictEvidenceAnchor(paper));
  }

  const conclusionEvidenceLists: string[][] = [];
  for (const change of args.knowledgeChanges) {
    conclusionEvidenceLists.push(change.evidenceIds ?? []);
  }
  for (const update of args.knowledgeUpdates) {
    conclusionEvidenceLists.push(update.evidenceIds ?? []);
  }

  let boundConclusions = 0;
  for (const evidenceIds of conclusionEvidenceLists) {
    const normalizedIds = evidenceIds.map((id) => normalizedCitationToken(id)).filter((id) => id.length > 0);
    if (normalizedIds.length === 0) continue;
    let allResolvable = true;
    let hasStrictAnchor = false;
    for (const id of normalizedIds) {
      const resolved = paperLookup.get(id);
      if (!resolved) {
        allResolvable = false;
        continue;
      }
      if (strictAnchorByKey.get(id)) hasStrictAnchor = true;
      else if (hasStrictEvidenceAnchor(resolved)) hasStrictAnchor = true;
    }
    if (allResolvable && hasStrictAnchor) boundConclusions += 1;
  }

  const conclusionCount = conclusionEvidenceLists.length;
  const evidenceBindingRate = conclusionCount > 0 ? boundConclusions / conclusionCount : 1;
  const evidenceBindingRatePct = Number((evidenceBindingRate * 100).toFixed(2));

  const citationIds: string[] = [];
  for (const change of args.knowledgeChanges) citationIds.push(...(change.evidenceIds ?? []));
  for (const update of args.knowledgeUpdates) citationIds.push(...(update.evidenceIds ?? []));
  for (const hypothesis of args.hypotheses) citationIds.push(...(hypothesis.evidenceIds ?? []));

  const normalizedCitationIds = citationIds.map((id) => normalizedCitationToken(id)).filter((id) => id.length > 0);
  let citationErrors = 0;
  for (const id of normalizedCitationIds) {
    if (!paperLookup.has(id)) citationErrors += 1;
  }
  const citationErrorRate =
    normalizedCitationIds.length > 0 ? citationErrors / normalizedCitationIds.length : 0;
  const citationErrorRatePct = Number((citationErrorRate * 100).toFixed(2));

  let downgradedHighConfidenceCount = 0;
  for (const update of args.knowledgeUpdates) {
    if (update.confidence !== "high") continue;
    const refs = (update.evidenceIds ?? []).map((id) => normalizedCitationToken(id)).filter((id) => id.length > 0);
    let canKeepHigh = refs.length > 0;
    if (canKeepHigh) {
      for (const ref of refs) {
        const paper = paperLookup.get(ref);
        if (!paper || !isFullTextRead(paper)) {
          canKeepHigh = false;
          break;
        }
      }
    }
    if (!canKeepHigh) {
      update.confidence = "medium";
      downgradedHighConfidenceCount += 1;
    }
  }

  const reasons: string[] = [];
  if (
    typeof args.requiredCorePapers === "number" &&
    Number.isFinite(args.requiredCorePapers) &&
    args.requiredCorePapers > 0 &&
    coreCount < args.requiredCorePapers
  ) {
    reasons.push(`core_paper_count_below_required(${coreCount} < ${Math.floor(args.requiredCorePapers)})`);
  }
  if (fullTextCoverage < MIN_CORE_FULLTEXT_COVERAGE) {
    reasons.push(
      `core_fulltext_coverage_below_threshold(${fullTextCoveragePct}% < ${Number((MIN_CORE_FULLTEXT_COVERAGE * 100).toFixed(0))}%)`,
    );
  }
  if (
    typeof args.requiredFullTextCoveragePct === "number" &&
    Number.isFinite(args.requiredFullTextCoveragePct) &&
    args.requiredFullTextCoveragePct > 0 &&
    fullTextCoveragePct < args.requiredFullTextCoveragePct
  ) {
    reasons.push(
      `core_fulltext_coverage_below_required(${fullTextCoveragePct}% < ${Number(args.requiredFullTextCoveragePct.toFixed(2))}%)`,
    );
  }
  if (evidenceBindingRate < MIN_EVIDENCE_BINDING_RATE) {
    reasons.push(
      `evidence_binding_rate_below_threshold(${evidenceBindingRatePct}% < ${Number((MIN_EVIDENCE_BINDING_RATE * 100).toFixed(0))}%)`,
    );
  }
  if (citationErrorRate >= MAX_CITATION_ERROR_RATE) {
    reasons.push(
      `citation_error_rate_above_threshold(${citationErrorRatePct}% >= ${Number((MAX_CITATION_ERROR_RATE * 100).toFixed(0))}%)`,
    );
  }
  const bridgeChangeCount = args.knowledgeChanges.filter((item) => item.type === "BRIDGE").length;
  const executedReflectionCount = args.reflectionTasks.filter((task) => task.status === "executed").length;
  if (bridgeChangeCount > 0 && executedReflectionCount === 0) {
    reasons.push(`reflection_missing_for_bridge(bridge_count=${bridgeChangeCount})`);
  }
  if (args.hypothesisGate.rejected > 0 && args.hypothesisGate.accepted === 0 && args.hypotheses.length > 0) {
    reasons.push(`hypothesis_gate_rejected_all(${args.hypothesisGate.rejected})`);
  }
  if (downgradedHighConfidenceCount > 0) {
    reasons.push(`high_confidence_downgraded(${downgradedHighConfidenceCount})`);
  }

  return {
    qualityGate: {
      passed: reasons.length === 0,
      fullTextCoveragePct,
      evidenceBindingRatePct,
      citationErrorRatePct,
      reasons,
    },
    unreadCorePaperIds,
    downgradedHighConfidenceCount,
  };
}

function normalizeChange(input: KnowledgeChangeInput): KnowledgeChangeInput | undefined {
  const statement = normalizeText(input.statement ?? "");
  if (!statement) return undefined;
  const type = ["NEW", "CONFIRM", "REVISE", "BRIDGE"].includes(input.type) ? input.type : "NEW";
  const evidenceIds = Array.isArray(input.evidenceIds)
    ? input.evidenceIds.map((id) => normalizeText(id)).filter((id) => id.length > 0)
    : undefined;
  return {
    type,
    statement,
    ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
    ...(input.topic ? { topic: normalizeText(input.topic) } : {}),
  };
}

function normalizeUpdate(input: KnowledgeUpdateInput): KnowledgeUpdateInput | undefined {
  const topic = normalizeText(input.topic ?? "");
  const content = normalizeText(input.content ?? "");
  if (!topic || !content) return undefined;
  const op = ["append", "revise", "confirm", "bridge"].includes(input.op) ? input.op : "append";
  const evidenceIds = Array.isArray(input.evidenceIds)
    ? input.evidenceIds.map((id) => normalizeText(id)).filter((id) => id.length > 0)
    : undefined;
  const confidence = input.confidence && ["low", "medium", "high"].includes(input.confidence) ? input.confidence : undefined;

  return {
    topic,
    op,
    content,
    ...(confidence ? { confidence } : {}),
    ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
  };
}

function normalizeHypothesis(input: KnowledgeHypothesisInput): KnowledgeHypothesisInput | undefined {
  const statement = normalizeText(input.statement ?? "");
  if (!statement) return undefined;
  const trigger = ["GAP", "BRIDGE", "TREND", "CONTRADICTION"].includes(input.trigger)
    ? input.trigger
    : "TREND";
  const dependencyPath = Array.isArray(input.dependencyPath)
    ? input.dependencyPath.map((step) => normalizeText(step)).filter((step) => step.length > 0)
    : undefined;
  const evidenceIds = Array.isArray(input.evidenceIds)
    ? input.evidenceIds.map((id) => normalizeText(id)).filter((id) => id.length > 0)
    : undefined;
  const validationStatusRaw = input.validationStatus?.trim().toLowerCase();
  const validationStatus =
    validationStatusRaw &&
    ["unchecked", "supporting", "conflicting", "openreview_related", "openreview_not_found"].includes(
      validationStatusRaw,
    )
      ? (validationStatusRaw as
          | "unchecked"
          | "supporting"
          | "conflicting"
          | "openreview_related"
          | "openreview_not_found")
      : undefined;
  const validationEvidence = normalizeStringArray(input.validationEvidence);
  const validationNotes = input.validationNotes ? normalizeText(input.validationNotes) : undefined;

  const withScore = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)) : undefined;

  return {
    ...(input.id ? { id: sanitizeId(input.id) } : {}),
    statement,
    trigger,
    ...(dependencyPath && dependencyPath.length > 0 ? { dependencyPath } : {}),
    ...(typeof withScore(input.novelty) === "number" ? { novelty: withScore(input.novelty) } : {}),
    ...(typeof withScore(input.feasibility) === "number" ? { feasibility: withScore(input.feasibility) } : {}),
    ...(typeof withScore(input.impact) === "number" ? { impact: withScore(input.impact) } : {}),
    ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
    ...(validationStatus ? { validationStatus } : {}),
    ...(validationNotes ? { validationNotes } : {}),
    ...(validationEvidence ? { validationEvidence } : {}),
  };
}

async function acquireLock(projectPath: string): Promise<void> {
  const lockPath = getLockPath(projectPath);
  const start = Date.now();
  while (Date.now() - start < 8_000) {
    try {
      await writeFile(lockPath, String(process.pid), { flag: "wx" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw new Error("knowledge_state lock timeout");
}

async function releaseLock(projectPath: string): Promise<void> {
  const lockPath = getLockPath(projectPath);
  await unlink(lockPath).catch(() => undefined);
}

function makeStreamKey(scope: string, topic: string, fallbackTopicKey: string): string {
  const normalizedScope = normalizeScope(scope);
  const normalizedTopic = normalizeText(topic).toLowerCase();
  const digest = createHash("sha1").update(`${normalizedScope}\n${normalizedTopic}`).digest("hex").slice(0, 20);
  return fallbackTopicKey || digest;
}

function toSummary(stream: KnowledgeStreamState): KnowledgeStateSummary {
  return {
    projectId: stream.projectId,
    streamKey: stream.topicKey,
    totalRuns: stream.totalRuns,
    totalHypotheses: stream.totalHypotheses,
    knowledgeTopicsCount: stream.knowledgeTopics.length,
    paperNotesCount: stream.paperNotes.length,
    recentFullTextReadCount: stream.recentFullTextReadCount,
    recentNotFullTextReadCount: stream.recentNotFullTextReadCount,
    qualityGate: stream.lastQualityGate,
    unreadCorePaperIds: stream.lastUnreadCorePaperIds,
    recentPapers: stream.recentPapers,
    ...(stream.lastRunAtMs ? { lastRunAtMs: stream.lastRunAtMs } : {}),
    ...(stream.lastStatus ? { lastStatus: stream.lastStatus } : {}),
    recentHypotheses: stream.recentHypotheses,
    recentChangeStats: stream.recentChangeStats,
    lastExplorationTrace: stream.lastExplorationTrace,
    lastReflectionTasks: stream.lastReflectionTasks,
    hypothesisGate: stream.lastHypothesisGate,
  };
}

function countChangeStats(day: string, runId: string, changes: KnowledgeChangeInput[]): RecentChangeStat {
  let newCount = 0;
  let confirmCount = 0;
  let reviseCount = 0;
  let bridgeCount = 0;

  for (const item of changes) {
    if (item.type === "NEW") newCount += 1;
    else if (item.type === "CONFIRM") confirmCount += 1;
    else if (item.type === "REVISE") reviseCount += 1;
    else if (item.type === "BRIDGE") bridgeCount += 1;
  }

  return {
    day,
    runId,
    newCount,
    confirmCount,
    reviseCount,
    bridgeCount,
  };
}

function tokenizeForQuery(raw: string): string[] {
  return normalizeText(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s_-]+/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
}

function uniqueText(values: string[]): string[] {
  return [...new Set(values.map((item) => normalizeText(item)).filter((item) => item.length > 0))];
}

function buildReflectionQuery(topic: string, statement: string, fallbackHint: string): string {
  const topicTokens = tokenizeForQuery(topic).slice(0, 4);
  const stmtTokens = tokenizeForQuery(statement).slice(0, 6);
  const merged = uniqueText([...topicTokens, ...stmtTokens]);
  if (merged.length === 0) return `${topic} ${fallbackHint}`.trim();
  return merged.join(" ");
}

function queryMatchesTrace(query: string, trace: ExplorationTraceInput[]): boolean {
  const tokens = tokenizeForQuery(query).slice(0, 4);
  if (tokens.length === 0) return false;
  return trace.some((step) => {
    const hay = normalizeText(step.query).toLowerCase();
    let hit = 0;
    for (const token of tokens) {
      if (hay.includes(token)) hit += 1;
      if (hit >= Math.min(2, tokens.length)) return true;
    }
    return false;
  });
}

function deriveReflectionTasks(args: {
  topic: string;
  changes: KnowledgeChangeInput[];
  trace: ExplorationTraceInput[];
  corePapers: KnowledgePaperInput[];
}): ReflectionTaskInput[] {
  const tasks: ReflectionTaskInput[] = [];
  const bridge = args.changes.filter((item) => item.type === "BRIDGE");
  const revise = args.changes.filter((item) => item.type === "REVISE");
  const confirm = args.changes.filter((item) => item.type === "CONFIRM");
  const newly = args.changes.filter((item) => item.type === "NEW");

  for (const [idx, change] of bridge.slice(0, 3).entries()) {
    const query = buildReflectionQuery(args.topic, change.statement, "cross-domain mechanism");
    tasks.push({
      id: sanitizeId(`bridge-${idx + 1}-${query}`),
      trigger: "BRIDGE",
      reason: `Bridge signal requires cross-domain follow-up: ${change.statement}`,
      query,
      priority: "high",
      status: queryMatchesTrace(query, args.trace) ? "executed" : "planned",
    });
  }

  if (newly.length >= 3) {
    const query = buildReflectionQuery(args.topic, newly.map((item) => item.statement).join(" "), "trend synthesis");
    tasks.push({
      id: sanitizeId(`trend-${query}`),
      trigger: "TREND",
      reason: `New findings accumulated (${newly.length}); run trend synthesis and gap scan.`,
      query,
      priority: "medium",
      status: queryMatchesTrace(query, args.trace) ? "executed" : "planned",
    });
  }

  if (revise.length > 0 && confirm.length > 0) {
    const query = buildReflectionQuery(
      args.topic,
      `${revise[0]?.statement ?? ""} ${confirm[0]?.statement ?? ""}`,
      "contradiction resolution",
    );
    tasks.push({
      id: sanitizeId(`contradiction-${query}`),
      trigger: "CONTRADICTION",
      reason: `Revise and confirm signals co-exist; verify contradiction boundaries.`,
      query,
      priority: "high",
      status: queryMatchesTrace(query, args.trace) ? "executed" : "planned",
    });
  }

  const unreadCore = args.corePapers.filter((paper) => !isFullTextRead(paper));
  if (unreadCore.length > 0) {
    const topId = unreadCore[0]?.id ?? unreadCore[0]?.title ?? "core-paper";
    const query = buildReflectionQuery(args.topic, String(topId), "full text retrieval");
    tasks.push({
      id: sanitizeId(`unread-core-${query}`),
      trigger: "UNREAD_CORE",
      reason: `${unreadCore.length} core paper(s) were not fully read; prioritize retrieval and verification.`,
      query,
      priority: "medium",
      status: queryMatchesTrace(query, args.trace) ? "executed" : "planned",
    });
  }

  const dedup = new Map<string, ReflectionTaskInput>();
  for (const task of tasks) {
    const key = normalizeText(task.query).toLowerCase();
    if (!key) continue;
    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, task);
      continue;
    }
    // Keep higher priority / executed status when duplicates collide.
    const priorityRank = { high: 3, medium: 2, low: 1 } as const;
    const pick =
      (existing.status !== "executed" && task.status === "executed") ||
      priorityRank[task.priority] > priorityRank[existing.priority]
        ? task
        : existing;
    dedup.set(key, pick);
  }
  return [...dedup.values()].slice(0, MAX_LAST_REFLECTION_TASKS);
}

function sanitizeKnowledgeChanges(args: {
  changes: KnowledgeChangeInput[];
  allRunPapers: KnowledgePaperInput[];
}): {
  changes: KnowledgeChangeInput[];
  droppedBridgeCount: number;
} {
  if (args.changes.length === 0) {
    return {
      changes: [],
      droppedBridgeCount: 0,
    };
  }

  const paperLookup = buildPaperLookup(args.allRunPapers);
  const next: KnowledgeChangeInput[] = [];
  let droppedBridgeCount = 0;

  for (const change of args.changes) {
    if (change.type !== "BRIDGE") {
      next.push(change);
      continue;
    }

    const evidenceIds = (change.evidenceIds ?? []).map((id) => normalizedCitationToken(id)).filter((id) => id.length > 0);
    if (evidenceIds.length === 0) {
      droppedBridgeCount += 1;
      continue;
    }

    let hasResolvedEvidence = false;
    let hasFullTextEvidence = false;
    for (const evidenceId of evidenceIds) {
      const paper = paperLookup.get(evidenceId);
      if (!paper) continue;
      hasResolvedEvidence = true;
      if (isFullTextRead(paper)) hasFullTextEvidence = true;
    }

    // Guard against speculative bridge signals with no grounded full-text evidence.
    if (!hasResolvedEvidence || !hasFullTextEvidence) {
      droppedBridgeCount += 1;
      continue;
    }

    next.push(change);
  }

  return {
    changes: next,
    droppedBridgeCount,
  };
}

function applyHypothesisGate(args: {
  hypotheses: KnowledgeHypothesisInput[];
  allRunPapers: KnowledgePaperInput[];
  knowledgeChanges: KnowledgeChangeInput[];
}): {
  acceptedHypotheses: KnowledgeHypothesisInput[];
  gate: HypothesisGateSummary;
} {
  const acceptedHypotheses: KnowledgeHypothesisInput[] = [];
  const rejectionReasonSet = new Set<string>();
  const paperLookup = buildPaperLookup(args.allRunPapers);
  const changeCounts = {
    NEW: args.knowledgeChanges.filter((item) => item.type === "NEW").length,
    CONFIRM: args.knowledgeChanges.filter((item) => item.type === "CONFIRM").length,
    REVISE: args.knowledgeChanges.filter((item) => item.type === "REVISE").length,
    BRIDGE: args.knowledgeChanges.filter((item) => item.type === "BRIDGE").length,
  };

  for (const hypothesis of args.hypotheses) {
    const reasons: string[] = [];
    const statementLen = normalizeText(hypothesis.statement).length;
    if (statementLen < MIN_HYPOTHESIS_STATEMENT_CHARS) {
      reasons.push(`statement_too_short(${statementLen}<${MIN_HYPOTHESIS_STATEMENT_CHARS})`);
    }

    const evidenceIds = uniqueText((hypothesis.evidenceIds ?? []).map((id) => normalizedCitationToken(id)));
    if (evidenceIds.length < MIN_HYPOTHESIS_EVIDENCE) {
      reasons.push(`insufficient_evidence_ids(${evidenceIds.length}<${MIN_HYPOTHESIS_EVIDENCE})`);
    }

    let resolvedEvidence = 0;
    let fullTextSupported = 0;
    for (const evidenceId of evidenceIds) {
      const paper = paperLookup.get(evidenceId);
      if (!paper) continue;
      resolvedEvidence += 1;
      if (isFullTextRead(paper)) fullTextSupported += 1;
    }
    if (resolvedEvidence < evidenceIds.length) {
      reasons.push(`unresolved_evidence_ids(${evidenceIds.length - resolvedEvidence})`);
    }
    if (fullTextSupported === 0) {
      reasons.push("no_fulltext_backed_evidence");
    }

    const dependencyPathLength = hypothesis.dependencyPath?.length ?? 0;
    if (dependencyPathLength < MIN_HYPOTHESIS_DEPENDENCY_STEPS) {
      reasons.push(
        `dependency_path_too_short(${dependencyPathLength}<${MIN_HYPOTHESIS_DEPENDENCY_STEPS})`,
      );
    }

    const hasScore =
      typeof hypothesis.novelty === "number" &&
      typeof hypothesis.feasibility === "number" &&
      typeof hypothesis.impact === "number";
    if (!hasScore) {
      reasons.push("missing_self_assessment_scores");
    }

    if (hypothesis.trigger === "BRIDGE" && changeCounts.BRIDGE === 0) {
      reasons.push("trigger_bridge_without_bridge_change");
    }
    if (hypothesis.trigger === "TREND" && changeCounts.NEW < 2) {
      reasons.push("trigger_trend_without_new_accumulation");
    }
    if (hypothesis.trigger === "CONTRADICTION" && !(changeCounts.REVISE > 0 && changeCounts.CONFIRM > 0)) {
      reasons.push("trigger_contradiction_without_revise_confirm_pair");
    }
    if (hypothesis.trigger === "GAP" && changeCounts.NEW + changeCounts.REVISE < 2) {
      reasons.push("trigger_gap_without_gap_signal");
    }

    if (reasons.length > 0) {
      for (const reason of reasons) rejectionReasonSet.add(reason);
      continue;
    }
    acceptedHypotheses.push(hypothesis);
  }

  return {
    acceptedHypotheses,
    gate: {
      accepted: acceptedHypotheses.length,
      rejected: Math.max(0, args.hypotheses.length - acceptedHypotheses.length),
      rejectionReasons: [...rejectionReasonSet].slice(0, MAX_HYPOTHESIS_REJECTION_REASONS),
    },
  };
}

export async function commitKnowledgeRun(input: CommitKnowledgeRunInput): Promise<{
  projectId: string;
  streamKey: string;
  summary: KnowledgeStateSummary;
  runId: string;
  createdProject: boolean;
}> {
  const project = await resolveProjectContext({
    projectId: input.projectId,
    scope: input.scope,
    topic: input.topic,
    autoCreate: true,
  });

  await ensureLayout(project.projectPath);
  await acquireLock(project.projectPath);

  try {
    const root = await loadState(project.projectPath);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const dayKey = dayKeyFromTimestamp(nowMs);

    const knowledgeState = input.knowledgeState ?? {};
    const corePapersFromState = (knowledgeState.corePapers ?? [])
      .filter((item) => item && typeof item === "object")
      .map((item) => withReadMark(item, "Core paper was recorded without full-text evidence."));
    const explorationPapers = (knowledgeState.explorationPapers ?? [])
      .filter((item) => item && typeof item === "object")
      .map((item) => withReadMark(item, "Exploration paper not fully read in this run."));
    const explorationTrace = (knowledgeState.explorationTrace ?? [])
      .map(normalizeTrace)
      .filter((item): item is ExplorationTraceInput => Boolean(item));
    const submittedKnowledgeChanges = (knowledgeState.knowledgeChanges ?? [])
      .map(normalizeChange)
      .filter((item): item is KnowledgeChangeInput => Boolean(item));
    const knowledgeUpdates = (knowledgeState.knowledgeUpdates ?? [])
      .map(normalizeUpdate)
      .filter((item): item is KnowledgeUpdateInput => Boolean(item));
    const hypotheses = (knowledgeState.hypotheses ?? [])
      .map(normalizeHypothesis)
      .filter((item): item is KnowledgeHypothesisInput => Boolean(item));

    const selectedPapers = (input.papers ?? [])
      .filter((paper) => paper && typeof paper === "object")
      .map((paper) =>
        withReadMark(
          {
          id: paper.id,
          title: paper.title,
          url: paper.url,
          score: paper.score,
          reason: paper.reason,
          summary: paper.reason,
          },
          "Paper selected from ranking payload without full-text-read evidence.",
        ),
      );
    const corePapers = mergePapers(selectedPapers, corePapersFromState).map((paper) =>
      withReadMark(paper, "Core paper missing explicit full-text-read evidence."),
    );

    const streamKey = makeStreamKey(input.scope, input.topic, input.topicKey);
    const stream =
      root.streams[streamKey] ??
      ({
        scope: normalizeScope(input.scope),
        topic: normalizeText(input.topic),
        topicKey: streamKey,
        projectId: project.projectId,
        totalRuns: 0,
        totalHypotheses: 0,
        knowledgeTopics: [],
        paperNotes: [],
        recentFullTextReadCount: 0,
        recentNotFullTextReadCount: 0,
        lastQualityGate: defaultQualityGateState(),
        lastUnreadCorePaperIds: [],
        recentPapers: [],
        recentRunIds: [],
        recentHypothesisIds: [],
        recentHypotheses: [],
        recentChangeStats: [],
        lastExplorationTrace: [],
        lastReflectionTasks: [],
        lastHypothesisGate: defaultHypothesisGateState(),
      } as KnowledgeStreamState);

    const paperIds = mergePapers(corePapers, explorationPapers)
      .map((paper) => paper.id || paper.url || paper.title || "")
      .map((value) => normalizeText(value))
      .filter((value) => value.length > 0);
    const runId = input.runId?.trim()
      ? sanitizeId(input.runId)
      : buildRunFingerprint({
          scope: stream.scope,
          topic: stream.topic,
          status: input.status,
          day: dayKey,
          paperIds,
          note: input.note,
        });

    if (stream.recentRunIds.includes(runId)) {
      root.streams[streamKey] = stream;
      return {
        projectId: project.projectId,
        streamKey,
        summary: toSummary(stream),
        runId,
        createdProject: project.created,
      };
    }

    const rootPath = getKnowledgeStateRoot(project.projectPath);
    const logDir = path.join(rootPath, "logs");
    const dailyDir = path.join(rootPath, "daily_changes");
    const knowledgeDir = path.join(rootPath, "knowledge");
    const paperNotesDir = path.join(rootPath, "paper_notes");
    const hypothesesDir = path.join(rootPath, "hypotheses");

    await appendMarkdown(
      path.join(logDir, `day-${dayKey}-ingest.md`),
      renderIngestLogMarkdown({ now: nowIso, runId, scope: stream.scope, topic: stream.topic, papers: corePapers }),
    );

    await appendMarkdown(
      path.join(logDir, `day-${dayKey}-exploration.md`),
      renderExplorationLogMarkdown({
        now: nowIso,
        runId,
        trace: explorationTrace,
        papers: explorationPapers,
      }),
    );

    const mergedRunPapers = mergePapers(corePapers, explorationPapers);
    const changeSanitization = sanitizeKnowledgeChanges({
      changes: submittedKnowledgeChanges,
      allRunPapers: mergedRunPapers,
    });
    const knowledgeChanges = changeSanitization.changes;
    await appendMarkdown(
      path.join(dailyDir, `day-${dayKey}.md`),
      renderDailyChangesMarkdown({ now: nowIso, runId, topic: stream.topic, changes: knowledgeChanges }),
    );

    const reflectionTasks = deriveReflectionTasks({
      topic: stream.topic,
      changes: knowledgeChanges,
      trace: explorationTrace,
      corePapers,
    });
    await appendMarkdown(
      path.join(logDir, `day-${dayKey}-reflection.md`),
      renderReflectionLogMarkdown({
        now: nowIso,
        runId,
        tasks: reflectionTasks,
      }),
    );
    const submittedHypotheses = hypotheses;
    const hypothesisEval = applyHypothesisGate({
      hypotheses: submittedHypotheses,
      allRunPapers: mergedRunPapers,
      knowledgeChanges,
    });
    const acceptedHypotheses = hypothesisEval.acceptedHypotheses;
    const qualityEval = applyQualityGates({
      corePapers,
      allRunPapers: mergedRunPapers,
      explorationTrace,
      reflectionTasks,
      knowledgeChanges,
      knowledgeUpdates,
      hypotheses: acceptedHypotheses,
      hypothesisGate: hypothesisEval.gate,
      requiredCorePapers: input.knowledgeState?.runLog?.requiredCorePapers,
      requiredFullTextCoveragePct: input.knowledgeState?.runLog?.requiredFullTextCoveragePct,
    });
    const requestedStatus = normalizeText(input.status ?? "ok");
    const qualitySensitiveStatus = requestedStatus === "ok" || requestedStatus === "fallback_representative";
    const effectiveStatus =
      qualitySensitiveStatus && !qualityEval.qualityGate.passed ? "degraded_quality" : requestedStatus;

    const topicToUpdates = new Map<string, KnowledgeUpdateInput[]>();
    for (const update of knowledgeUpdates) {
      const key = slugifyTopic(update.topic);
      const list = topicToUpdates.get(key) ?? [];
      list.push(update);
      topicToUpdates.set(key, list);
    }

    for (const [topicSlug, updates] of topicToUpdates.entries()) {
      const topicFile = `topic-${topicSlug}.md`;
      const topicPath = path.join(knowledgeDir, topicFile);
      if (!existsSync(topicPath)) {
        await writeFile(topicPath, `# Topic: ${topicSlug}\n\n`, "utf-8");
      }
      await appendMarkdown(topicPath, renderTopicUpdateMarkdown({ now: nowIso, runId, updates }));
      if (!stream.knowledgeTopics.includes(topicFile)) {
        stream.knowledgeTopics.push(topicFile);
      }
    }

    const coreKeys = new Set(corePapers.map((paper) => paperIdentity(paper)).filter((item) => item.length > 0));
    const runPaperNoteFiles: string[] = [];
    for (const paper of mergedRunPapers) {
      const noteFile = `paper-${toPaperNoteSlug(paper)}.md`;
      const notePath = path.join(paperNotesDir, noteFile);
      const role: "core" | "exploration" = coreKeys.has(paperIdentity(paper)) ? "core" : "exploration";
      if (!existsSync(notePath)) {
        await writeFile(notePath, `${renderPaperNoteHeaderMarkdown({ paper, file: noteFile })}\n`, "utf-8");
      }
      await appendMarkdown(
        notePath,
        renderPaperNoteRunMarkdown({
          now: nowIso,
          runId,
          role,
          paper,
        }),
      );
      runPaperNoteFiles.push(noteFile);
    }
    stream.paperNotes = [...new Set([...runPaperNoteFiles, ...stream.paperNotes])].slice(0, MAX_PAPER_NOTES);

    const recentHypothesisSummaries: RecentHypothesisSummary[] = [];
    let seq = stream.totalHypotheses;
    const dayToken = dayKey.replace(/-/g, "");
    for (const hypothesis of acceptedHypotheses) {
      seq += 1;
      const hypothesisId = hypothesis.id && hypothesis.id.length > 0 ? sanitizeId(hypothesis.id) : `hyp-${dayToken}-${String(seq).padStart(4, "0")}`;
      const file = `${hypothesisId}.md`;
      await writeFile(
        path.join(hypothesesDir, file),
        renderHypothesisMarkdown({ now: nowIso, hypothesisId, runId, hypothesis }),
        "utf-8",
      );
      recentHypothesisSummaries.push({
        id: hypothesisId,
        statement: hypothesis.statement,
        trigger: hypothesis.trigger,
        createdAtMs: nowMs,
        file,
      });
    }

    const fullTextStats = countFullTextStats(mergedRunPapers);
    const structuredProfileCount = mergedRunPapers.filter(hasStructuredProfile).length;

    await writeFile(
      path.join(knowledgeDir, "_index.md"),
      renderKnowledgeIndexMarkdown({
        now: nowIso,
        topic: stream.topic,
        topicFiles: stream.knowledgeTopics,
        paperNotesCount: stream.paperNotes.length,
        totalHypotheses: stream.totalHypotheses + recentHypothesisSummaries.length,
        recentPapers: mergedRunPapers,
        fullTextReadCount: fullTextStats.fullTextReadCount,
        notFullTextReadCount: fullTextStats.notFullTextReadCount,
        qualityGate: qualityEval.qualityGate,
        unreadCorePaperIds: qualityEval.unreadCorePaperIds,
        reflectionTasks,
        hypothesisGate: hypothesisEval.gate,
        lastStatus: effectiveStatus,
      }),
      "utf-8",
    );

    const changeStat = countChangeStats(dayKey, runId, knowledgeChanges);

    stream.projectId = project.projectId;
    stream.totalRuns += 1;
    stream.totalHypotheses += recentHypothesisSummaries.length;
    stream.lastRunAtMs = nowMs;
    stream.lastStatus = effectiveStatus;
    stream.recentFullTextReadCount = fullTextStats.fullTextReadCount;
    stream.recentNotFullTextReadCount = fullTextStats.notFullTextReadCount;
    stream.lastQualityGate = qualityEval.qualityGate;
    stream.lastUnreadCorePaperIds = qualityEval.unreadCorePaperIds;
    stream.lastExplorationTrace = explorationTrace.slice(0, MAX_LAST_TRACE);
    stream.lastReflectionTasks = reflectionTasks.slice(0, MAX_LAST_REFLECTION_TASKS);
    stream.lastHypothesisGate = hypothesisEval.gate;
    stream.recentPapers = mergePapers(mergedRunPapers, stream.recentPapers).slice(0, MAX_RECENT_PAPERS);
    stream.recentRunIds = [runId, ...stream.recentRunIds.filter((id) => id !== runId)].slice(0, MAX_RECENT_RUN_IDS);
    stream.recentHypothesisIds = [
      ...recentHypothesisSummaries.map((item) => item.id),
      ...stream.recentHypothesisIds,
    ].slice(0, MAX_RECENT_HYPOTHESES);
    stream.recentHypotheses = [...recentHypothesisSummaries, ...stream.recentHypotheses].slice(0, MAX_RECENT_HYPOTHESES);
    stream.recentChangeStats = [changeStat, ...stream.recentChangeStats].slice(0, MAX_RECENT_CHANGE_STATS);

    root.streams[streamKey] = stream;
    await saveStateAtomic(project.projectPath, root);

    await appendFile(
      path.join(logDir, `day-${dayKey}-run-details.jsonl`),
      `${JSON.stringify({
        ts: nowMs,
        runId,
        scope: stream.scope,
        topic: stream.topic,
        streamKey,
        status: effectiveStatus,
        corePapers,
        explorationPapers,
        explorationTrace,
        reflectionTasks,
        submittedKnowledgeChanges,
        knowledgeChanges,
        droppedBridgeCount: changeSanitization.droppedBridgeCount,
        knowledgeUpdates,
        hypotheses: acceptedHypotheses,
        submittedHypotheses,
        hypothesisGate: hypothesisEval.gate,
        paperNoteFiles: runPaperNoteFiles,
        quality: {
          fullTextReadCount: fullTextStats.fullTextReadCount,
          notFullTextReadCount: fullTextStats.notFullTextReadCount,
          paperNotesCount: stream.paperNotes.length,
          structuredProfileCount,
          qualityGate: qualityEval.qualityGate,
          unreadCorePaperIds: qualityEval.unreadCorePaperIds,
          downgradedHighConfidenceCount: qualityEval.downgradedHighConfidenceCount,
        },
        runLog: input.knowledgeState?.runLog ?? null,
        note: input.note ?? null,
      })}\n`,
      "utf-8",
    );

    await appendEvent(project.projectPath, {
      ts: nowMs,
      runId,
      scope: stream.scope,
      topic: stream.topic,
      streamKey,
      projectId: project.projectId,
      status: effectiveStatus,
      paperCount: corePapers.length,
      explorationPaperCount: explorationPapers.length,
      fullTextReadCount: fullTextStats.fullTextReadCount,
      notFullTextReadCount: fullTextStats.notFullTextReadCount,
      paperNotesCount: stream.paperNotes.length,
      paperNoteFiles: runPaperNoteFiles,
      structuredProfileCount,
      qualityGate: qualityEval.qualityGate,
      unreadCorePaperIds: qualityEval.unreadCorePaperIds,
      downgradedHighConfidenceCount: qualityEval.downgradedHighConfidenceCount,
      submittedChangeCount: submittedKnowledgeChanges.length,
      changeCount: knowledgeChanges.length,
      droppedBridgeCount: changeSanitization.droppedBridgeCount,
      hypothesisCount: recentHypothesisSummaries.length,
      submittedHypothesisCount: submittedHypotheses.length,
      hypothesisGate: hypothesisEval.gate,
      reflectionTasks,
      corePapers,
      explorationPapers,
      note: input.note,
      runLog: input.knowledgeState?.runLog ?? null,
    });

    return {
      projectId: project.projectId,
      streamKey,
      summary: toSummary(stream),
      runId,
      createdProject: project.created,
    };
  } finally {
    await releaseLock(project.projectPath);
  }
}

export async function readKnowledgeSummary(args: {
  scope: string;
  topic: string;
  topicKey: string;
  projectId?: string;
}): Promise<{ projectId: string; streamKey: string; summary: KnowledgeStateSummary } | undefined> {
  let project;
  try {
    project = await resolveProjectContext({
      projectId: args.projectId,
      scope: args.scope,
      topic: args.topic,
      autoCreate: false,
    });
  } catch {
    return undefined;
  }

  const statePath = getStatePath(project.projectPath);
  if (!existsSync(statePath)) return undefined;

  const root = await loadState(project.projectPath);
  const streamKey = makeStreamKey(args.scope, args.topic, args.topicKey);
  const stream = root.streams[streamKey];
  if (!stream) return undefined;

  return {
    projectId: project.projectId,
    streamKey,
    summary: toSummary(stream),
  };
}

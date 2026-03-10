import { Type } from "@sinclair/typebox";
import {
  getIncrementalStateStatus,
  prepareIncrementalState,
  recordIncrementalPush,
  recordUserFeedback,
  type FeedbackSignal,
  type LightweightPreferences,
} from "../literature/subscription-state.js";
import type { KnowledgeStateInput } from "../knowledge-state/types.js";
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

const KnowledgePaperSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "Optional stable paper id." })),
  title: Type.Optional(Type.String({ description: "Paper title." })),
  url: Type.Optional(Type.String({ description: "Paper source URL." })),
  source: Type.Optional(Type.String({ description: "Paper source name/domain." })),
  published_at: Type.Optional(Type.String({ description: "Published time in ISO string." })),
  score: Type.Optional(Type.Number({ description: "Optional score used in ranking." })),
  reason: Type.Optional(Type.String({ description: "Optional rationale for selecting this paper." })),
  summary: Type.Optional(Type.String({ description: "Optional short summary text." })),
  evidence_ids: Type.Optional(Type.Array(Type.String({ description: "Optional evidence IDs for this paper." }))),
  full_text_read: Type.Optional(Type.Boolean({ description: "Whether this paper was read from full text." })),
  read_status: Type.Optional(
    Type.String({
      description: "Read status: fulltext | partial | metadata | unread.",
    }),
  ),
  full_text_source: Type.Optional(Type.String({ description: "Where full text came from (e.g. arxiv_pdf)." })),
  full_text_ref: Type.Optional(Type.String({ description: "Reference to full text location/path/URL." })),
  unread_reason: Type.Optional(Type.String({ description: "Why full-text reading was not completed." })),
  key_evidence_spans: Type.Optional(
    Type.Array(Type.String({ description: "Short evidence excerpts/anchors from full text." })),
  ),
  domain: Type.Optional(Type.String({ description: "Primary research domain." })),
  subdomains: Type.Optional(Type.Array(Type.String({ description: "Sub-research domains." }))),
  cross_domain_links: Type.Optional(
    Type.Array(Type.String({ description: "Cross-domain links/intersections." })),
  ),
  research_goal: Type.Optional(Type.String({ description: "Core research goal/question of this paper." })),
  approach: Type.Optional(Type.String({ description: "What the paper does under that goal." })),
  methodology_design: Type.Optional(Type.String({ description: "Method/experiment design summary." })),
  key_contributions: Type.Optional(Type.Array(Type.String({ description: "Main contributions of this paper." }))),
  practical_insights: Type.Optional(
    Type.Array(Type.String({ description: "Practical takeaways or reusable experience." })),
  ),
  must_understand_points: Type.Optional(
    Type.Array(Type.String({ description: "Critical points that must be understood after reading." })),
  ),
  limitations: Type.Optional(Type.Array(Type.String({ description: "Known limitations." }))),
  evidence_anchors: Type.Optional(
    Type.Array(
      Type.Object({
        section: Type.Optional(Type.String({ description: "Section title or identifier." })),
        locator: Type.Optional(Type.String({ description: "Fine-grained locator, e.g. Eq.3/Table2/Page4." })),
        claim: Type.String({ description: "Claim supported by this anchor." }),
        quote: Type.Optional(Type.String({ description: "Short quote/excerpt supporting the claim." })),
      }),
    ),
  ),
});

const ExplorationTraceSchema = Type.Object({
  query: Type.String({ description: "Exploration query text." }),
  reason: Type.Optional(Type.String({ description: "Why this exploration query was chosen." })),
  source: Type.Optional(Type.String({ description: "Source used for this exploration step (e.g. arxiv/openalex)." })),
  candidates: Type.Optional(Type.Number({ description: "Candidate count before filtering." })),
  filtered_to: Type.Optional(Type.Number({ description: "Candidate count after filtering." })),
  filtered_out_reasons: Type.Optional(
    Type.Array(Type.String({ description: "Optional filtering reasons for dropped candidates." })),
  ),
  result_count: Type.Optional(Type.Number({ description: "Optional result count from this query." })),
});

const KnowledgeChangeSchema = Type.Object({
  type: Type.String({ description: "One of NEW|CONFIRM|REVISE|BRIDGE." }),
  statement: Type.String({ description: "Change statement." }),
  evidence_ids: Type.Optional(Type.Array(Type.String({ description: "Evidence IDs for this change." }))),
  topic: Type.Optional(Type.String({ description: "Optional topic affected by this change." })),
});

const KnowledgeUpdateSchema = Type.Object({
  topic: Type.String({ description: "Topic name for this update." }),
  op: Type.String({ description: "Update operation: append|revise|confirm|bridge." }),
  content: Type.String({ description: "Update content text." }),
  confidence: Type.Optional(Type.String({ description: "Optional confidence: low|medium|high." })),
  evidence_ids: Type.Optional(Type.Array(Type.String({ description: "Evidence IDs for this update." }))),
});

const KnowledgeHypothesisSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "Optional hypothesis ID." })),
  statement: Type.String({ description: "Hypothesis statement." }),
  trigger: Type.String({ description: "Trigger type: GAP|BRIDGE|TREND|CONTRADICTION." }),
  dependency_path: Type.Optional(Type.Array(Type.String({ description: "Dependency path steps." }))),
  strengths: Type.Optional(
    Type.Array(Type.String({ description: "Hypothesis strengths based on current evidence." })),
  ),
  weaknesses: Type.Optional(
    Type.Array(Type.String({ description: "Hypothesis weaknesses, risks, or uncertainty points." })),
  ),
  plan_steps: Type.Optional(
    Type.Array(Type.String({ description: "Actionable research plan steps for execution." })),
  ),
  strict_evaluation: Type.Optional(
    Type.Object({
      overall_score: Type.Optional(Type.Number({ description: "Strict overall score (0-100)." })),
      decision: Type.Optional(
        Type.String({
          description: "Strict decision: accept | revise | reject.",
        }),
      ),
      reason: Type.Optional(Type.String({ description: "Why this decision is made." })),
    }),
  ),
  novelty: Type.Optional(Type.Number({ description: "Optional novelty score." })),
  feasibility: Type.Optional(Type.Number({ description: "Optional feasibility score." })),
  impact: Type.Optional(Type.Number({ description: "Optional impact score." })),
  evidence_ids: Type.Optional(Type.Array(Type.String({ description: "Evidence IDs for this hypothesis." }))),
  validation_status: Type.Optional(
    Type.String({
      description:
        "Optional validation status: unchecked | supporting | conflicting | openreview_related | openreview_not_found.",
    }),
  ),
  validation_notes: Type.Optional(Type.String({ description: "Optional validation notes." })),
  validation_evidence: Type.Optional(
    Type.Array(Type.String({ description: "Optional validation evidence links/ids." })),
  ),
});

const KnowledgeRunLogSchema = Type.Object({
  model: Type.Optional(Type.String({ description: "Optional model name." })),
  run_profile: Type.Optional(
    Type.String({
      description: "Optional run profile: fast | strict.",
    }),
  ),
  duration_ms: Type.Optional(Type.Number({ description: "Optional run duration in ms." })),
  error: Type.Optional(Type.String({ description: "Optional run error text." })),
  degraded: Type.Optional(Type.Boolean({ description: "Whether this run used degraded behavior." })),
  notes: Type.Optional(Type.String({ description: "Optional extra notes." })),
  required_core_papers: Type.Optional(
    Type.Number({ description: "Optional hard requirement for minimum core papers in this run." }),
  ),
  required_full_text_coverage_pct: Type.Optional(
    Type.Number({ description: "Optional hard requirement for minimum full-text coverage percentage." }),
  ),
  temp_full_text_dir: Type.Optional(Type.String({ description: "Temporary local directory for full-text files." })),
  temp_files_downloaded: Type.Optional(Type.Number({ description: "Number of temporary full-text files downloaded." })),
  temp_cleanup_status: Type.Optional(
    Type.String({
      description: "Temporary full-text cleanup status: done | partial | failed | not_needed.",
    }),
  ),
  temp_cleanup_note: Type.Optional(Type.String({ description: "Optional cleanup note/error." })),
  full_text_attempted: Type.Optional(Type.Number({ description: "Number of papers attempted for full-text read." })),
  full_text_completed: Type.Optional(Type.Number({ description: "Number of papers successfully full-text read." })),
  recall_tier_stats: Type.Optional(
    Type.Object({
      tier_a: Type.Optional(
        Type.Object({
          candidates: Type.Number(),
          selected: Type.Number(),
        }),
      ),
      tier_b: Type.Optional(
        Type.Object({
          candidates: Type.Number(),
          selected: Type.Number(),
        }),
      ),
      tier_c: Type.Optional(
        Type.Object({
          candidates: Type.Number(),
          selected: Type.Number(),
        }),
      ),
    }),
  ),
  reflection_step_executed: Type.Optional(Type.Boolean({ description: "Whether one reflection follow-up query was executed." })),
  reflection_step_result_count: Type.Optional(Type.Number({ description: "Number of papers added by reflection step." })),
});

const KnowledgeStateSchema = Type.Optional(
  Type.Object({
    core_papers: Type.Optional(Type.Array(KnowledgePaperSchema)),
    exploration_papers: Type.Optional(Type.Array(KnowledgePaperSchema)),
    exploration_trace: Type.Optional(Type.Array(ExplorationTraceSchema)),
    knowledge_changes: Type.Optional(Type.Array(KnowledgeChangeSchema)),
    knowledge_updates: Type.Optional(Type.Array(KnowledgeUpdateSchema)),
    hypotheses: Type.Optional(Type.Array(KnowledgeHypothesisSchema)),
    run_log: Type.Optional(KnowledgeRunLogSchema),
  }),
);

export const ScientifyLiteratureStateToolSchema = Type.Object({
  action: Type.String({
    description:
      'Action: "prepare" | "record" | "feedback" | "status". `status` returns recent papers plus knowledge_state summary for follow-up traceability.',
  }),
  scope: Type.String({
    description: "Scope key used to isolate user/channel state.",
  }),
  topic: Type.String({
    description: "Research topic text.",
  }),
  project_id: Type.Optional(
    Type.String({
      description: "Optional project id to pin knowledge_state writes.",
    }),
  ),
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
  run_profile: Type.Optional(
    Type.String({
      description: "Optional run profile override: fast | strict.",
    }),
  ),
  required_core_papers: Type.Optional(
    Type.Number({
      description: "Optional hard requirement for minimum core papers in this run.",
    }),
  ),
  required_full_text_coverage_pct: Type.Optional(
    Type.Number({
      description: "Optional hard requirement for minimum core full-text coverage in this run.",
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
  knowledge_state: KnowledgeStateSchema,
});

function readStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberParam(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
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

function readKnowledgePapers(raw: unknown): Array<{
  id?: string;
  title?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  score?: number;
  reason?: string;
  summary?: string;
  evidenceIds?: string[];
  fullTextRead?: boolean;
  readStatus?: "fulltext" | "partial" | "metadata" | "unread";
  fullTextSource?: string;
  fullTextRef?: string;
  unreadReason?: string;
  keyEvidenceSpans?: string[];
  domain?: string;
  subdomains?: string[];
  crossDomainLinks?: string[];
  researchGoal?: string;
  approach?: string;
  methodologyDesign?: string;
  keyContributions?: string[];
  practicalInsights?: string[];
  mustUnderstandPoints?: string[];
  limitations?: string[];
  evidenceAnchors?: Array<{
    section?: string;
    locator?: string;
    claim: string;
    quote?: string;
  }>;
}> {
  if (!Array.isArray(raw)) return [];
  const papers: Array<{
    id?: string;
    title?: string;
    url?: string;
    source?: string;
    publishedAt?: string;
    score?: number;
    reason?: string;
    summary?: string;
    evidenceIds?: string[];
    fullTextRead?: boolean;
    readStatus?: "fulltext" | "partial" | "metadata" | "unread";
    fullTextSource?: string;
    fullTextRef?: string;
    unreadReason?: string;
    keyEvidenceSpans?: string[];
    domain?: string;
    subdomains?: string[];
    crossDomainLinks?: string[];
    researchGoal?: string;
    approach?: string;
    methodologyDesign?: string;
    keyContributions?: string[];
    practicalInsights?: string[];
    mustUnderstandPoints?: string[];
    limitations?: string[];
    evidenceAnchors?: Array<{
      section?: string;
      locator?: string;
      claim: string;
      quote?: string;
    }>;
  }> = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : undefined;
    const title = typeof record.title === "string" ? record.title.trim() : undefined;
    const url = typeof record.url === "string" ? record.url.trim() : undefined;
    const source = typeof record.source === "string" ? record.source.trim() : undefined;
    const publishedAt =
      typeof record.published_at === "string"
        ? record.published_at.trim()
        : typeof record.publishedAt === "string"
          ? record.publishedAt.trim()
          : undefined;
    const score = typeof record.score === "number" && Number.isFinite(record.score) ? record.score : undefined;
    const reason = typeof record.reason === "string" ? record.reason.trim() : undefined;
    const summary = typeof record.summary === "string" ? record.summary.trim() : undefined;
    const evidenceRaw = record.evidence_ids ?? record.evidenceIds;
    const evidenceIds = Array.isArray(evidenceRaw)
      ? evidenceRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const fullTextReadRaw = record.full_text_read ?? record.fullTextRead;
    const fullTextRead = typeof fullTextReadRaw === "boolean" ? fullTextReadRaw : undefined;
    const readStatusRaw = typeof (record.read_status ?? record.readStatus) === "string"
      ? String(record.read_status ?? record.readStatus).trim().toLowerCase()
      : undefined;
    const readStatus =
      readStatusRaw && ["fulltext", "partial", "metadata", "unread"].includes(readStatusRaw)
        ? (readStatusRaw as "fulltext" | "partial" | "metadata" | "unread")
        : undefined;
    const fullTextSource = typeof (record.full_text_source ?? record.fullTextSource) === "string"
      ? String(record.full_text_source ?? record.fullTextSource).trim()
      : undefined;
    const fullTextRef = typeof (record.full_text_ref ?? record.fullTextRef) === "string"
      ? String(record.full_text_ref ?? record.fullTextRef).trim()
      : undefined;
    const unreadReason = typeof (record.unread_reason ?? record.unreadReason) === "string"
      ? String(record.unread_reason ?? record.unreadReason).trim()
      : undefined;
    const keyEvidenceSpansRaw = record.key_evidence_spans ?? record.keyEvidenceSpans;
    const keyEvidenceSpans = Array.isArray(keyEvidenceSpansRaw)
      ? keyEvidenceSpansRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const domain = typeof record.domain === "string" ? record.domain.trim() : undefined;
    const subdomainsRaw = record.subdomains;
    const subdomains = Array.isArray(subdomainsRaw)
      ? subdomainsRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const crossDomainLinksRaw = record.cross_domain_links ?? record.crossDomainLinks;
    const crossDomainLinks = Array.isArray(crossDomainLinksRaw)
      ? crossDomainLinksRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const researchGoal = typeof (record.research_goal ?? record.researchGoal) === "string"
      ? String(record.research_goal ?? record.researchGoal).trim()
      : undefined;
    const approach = typeof record.approach === "string" ? record.approach.trim() : undefined;
    const methodologyDesign = typeof (record.methodology_design ?? record.methodologyDesign) === "string"
      ? String(record.methodology_design ?? record.methodologyDesign).trim()
      : undefined;
    const keyContributionsRaw = record.key_contributions ?? record.keyContributions;
    const keyContributions = Array.isArray(keyContributionsRaw)
      ? keyContributionsRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const practicalInsightsRaw = record.practical_insights ?? record.practicalInsights;
    const practicalInsights = Array.isArray(practicalInsightsRaw)
      ? practicalInsightsRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const mustUnderstandPointsRaw = record.must_understand_points ?? record.mustUnderstandPoints;
    const mustUnderstandPoints = Array.isArray(mustUnderstandPointsRaw)
      ? mustUnderstandPointsRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const limitationsRaw = record.limitations;
    const limitations = Array.isArray(limitationsRaw)
      ? limitationsRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const evidenceAnchorsRaw = record.evidence_anchors ?? record.evidenceAnchors;
    const evidenceAnchors = Array.isArray(evidenceAnchorsRaw)
      ? evidenceAnchorsRaw
          .filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v))
          .map((anchor) => {
            const section = typeof anchor.section === "string" ? anchor.section.trim() : undefined;
            const locator = typeof anchor.locator === "string" ? anchor.locator.trim() : undefined;
            const claim = typeof anchor.claim === "string" ? anchor.claim.trim() : "";
            const quote = typeof anchor.quote === "string" ? anchor.quote.trim() : undefined;
            if (!claim) return undefined;
            return {
              ...(section ? { section } : {}),
              ...(locator ? { locator } : {}),
              claim,
              ...(quote ? { quote } : {}),
            };
          })
          .filter(
            (v): v is {
              section?: string;
              locator?: string;
              claim: string;
              quote?: string;
            } => Boolean(v),
          )
      : undefined;
    if (
      !id &&
      !title &&
      !url &&
      !summary &&
      !reason &&
      !domain &&
      !researchGoal &&
      !approach &&
      !methodologyDesign &&
      (!keyContributions || keyContributions.length === 0) &&
      (!practicalInsights || practicalInsights.length === 0) &&
      (!mustUnderstandPoints || mustUnderstandPoints.length === 0) &&
      (!limitations || limitations.length === 0)
    ) {
      continue;
    }
    papers.push({
      ...(id ? { id } : {}),
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
      ...(source ? { source } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(reason ? { reason } : {}),
      ...(summary ? { summary } : {}),
      ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
      ...(typeof fullTextRead === "boolean" ? { fullTextRead } : {}),
      ...(readStatus ? { readStatus } : {}),
      ...(fullTextSource ? { fullTextSource } : {}),
      ...(fullTextRef ? { fullTextRef } : {}),
      ...(unreadReason ? { unreadReason } : {}),
      ...(keyEvidenceSpans && keyEvidenceSpans.length > 0 ? { keyEvidenceSpans } : {}),
      ...(domain ? { domain } : {}),
      ...(subdomains && subdomains.length > 0 ? { subdomains } : {}),
      ...(crossDomainLinks && crossDomainLinks.length > 0 ? { crossDomainLinks } : {}),
      ...(researchGoal ? { researchGoal } : {}),
      ...(approach ? { approach } : {}),
      ...(methodologyDesign ? { methodologyDesign } : {}),
      ...(keyContributions && keyContributions.length > 0 ? { keyContributions } : {}),
      ...(practicalInsights && practicalInsights.length > 0 ? { practicalInsights } : {}),
      ...(mustUnderstandPoints && mustUnderstandPoints.length > 0 ? { mustUnderstandPoints } : {}),
      ...(limitations && limitations.length > 0 ? { limitations } : {}),
      ...(evidenceAnchors && evidenceAnchors.length > 0 ? { evidenceAnchors } : {}),
    });
  }

  return papers;
}

function readKnowledgeStatePayload(params: Record<string, unknown>): KnowledgeStateInput | undefined {
  const raw = params.knowledge_state;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;

  const corePapers = readKnowledgePapers(record.core_papers ?? record.corePapers);
  const explorationPapers = readKnowledgePapers(record.exploration_papers ?? record.explorationPapers);
  const explorationTraceRaw = record.exploration_trace ?? record.explorationTrace;
  const explorationTrace = Array.isArray(explorationTraceRaw)
    ? explorationTraceRaw
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
        .map((item) => {
          const query = typeof item.query === "string" ? item.query.trim() : "";
          if (!query) return undefined;
          const reason = typeof item.reason === "string" ? item.reason.trim() : undefined;
          const source = typeof item.source === "string" ? item.source.trim() : undefined;
          const candidatesRaw = item.candidates;
          const candidates =
            typeof candidatesRaw === "number" && Number.isFinite(candidatesRaw) ? candidatesRaw : undefined;
          const filteredToRaw = item.filtered_to ?? item.filteredTo;
          const filteredTo =
            typeof filteredToRaw === "number" && Number.isFinite(filteredToRaw) ? filteredToRaw : undefined;
          const filteredOutRaw = item.filtered_out_reasons ?? item.filteredOutReasons;
          const filteredOutReasons = Array.isArray(filteredOutRaw)
            ? filteredOutRaw
                .filter((v): v is string => typeof v === "string")
                .map((v) => v.trim())
                .filter((v) => v.length > 0)
            : undefined;
          const resultCountRaw = item.result_count ?? item.resultCount;
          const resultCount =
            typeof resultCountRaw === "number" && Number.isFinite(resultCountRaw)
              ? resultCountRaw
              : undefined;
          return {
            query,
            ...(reason ? { reason } : {}),
            ...(source ? { source } : {}),
            ...(typeof candidates === "number" ? { candidates } : {}),
            ...(typeof filteredTo === "number" ? { filteredTo } : {}),
            ...(filteredOutReasons && filteredOutReasons.length > 0 ? { filteredOutReasons } : {}),
            ...(typeof resultCount === "number" ? { resultCount } : {}),
          };
        })
        .filter((item): item is { query: string; reason?: string; resultCount?: number } => Boolean(item))
    : [];

  const knowledgeChangesRaw = record.knowledge_changes ?? record.knowledgeChanges;
  const knowledgeChanges: NonNullable<KnowledgeStateInput["knowledgeChanges"]> = [];
  if (Array.isArray(knowledgeChangesRaw)) {
    for (const item of knowledgeChangesRaw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const rawType = typeof row.type === "string" ? row.type.trim().toUpperCase() : "NEW";
      const type = ["NEW", "CONFIRM", "REVISE", "BRIDGE"].includes(rawType)
        ? (rawType as "NEW" | "CONFIRM" | "REVISE" | "BRIDGE")
        : "NEW";
      const statement = typeof row.statement === "string" ? row.statement.trim() : "";
      if (!statement) continue;
      const evidenceRaw = row.evidence_ids ?? row.evidenceIds;
      const evidenceIds = Array.isArray(evidenceRaw)
        ? evidenceRaw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;
      const topic = typeof row.topic === "string" ? row.topic.trim() : undefined;
      knowledgeChanges.push({
        type,
        statement,
        ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
        ...(topic ? { topic } : {}),
      });
    }
  }

  const knowledgeUpdatesRaw = record.knowledge_updates ?? record.knowledgeUpdates;
  const knowledgeUpdates: NonNullable<KnowledgeStateInput["knowledgeUpdates"]> = [];
  if (Array.isArray(knowledgeUpdatesRaw)) {
    for (const item of knowledgeUpdatesRaw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const topic = typeof row.topic === "string" ? row.topic.trim() : "";
      const rawOp = typeof row.op === "string" ? row.op.trim().toLowerCase() : "append";
      const op = ["append", "revise", "confirm", "bridge"].includes(rawOp)
        ? (rawOp as "append" | "revise" | "confirm" | "bridge")
        : "append";
      const content = typeof row.content === "string" ? row.content.trim() : "";
      if (!topic || !content) continue;
      const rawConfidence = typeof row.confidence === "string" ? row.confidence.trim().toLowerCase() : undefined;
      const confidence =
        rawConfidence && ["low", "medium", "high"].includes(rawConfidence)
          ? (rawConfidence as "low" | "medium" | "high")
          : undefined;
      const evidenceRaw = row.evidence_ids ?? row.evidenceIds;
      const evidenceIds = Array.isArray(evidenceRaw)
        ? evidenceRaw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;
      knowledgeUpdates.push({
        topic,
        op,
        content,
        ...(confidence ? { confidence } : {}),
        ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
      });
    }
  }

  const hypothesesRaw = record.hypotheses;
  const hypotheses: NonNullable<KnowledgeStateInput["hypotheses"]> = [];
  if (Array.isArray(hypothesesRaw)) {
    for (const item of hypothesesRaw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id.trim() : undefined;
      const statement = typeof row.statement === "string" ? row.statement.trim() : "";
      const rawTrigger = typeof row.trigger === "string" ? row.trigger.trim().toUpperCase() : "TREND";
      const trigger = ["GAP", "BRIDGE", "TREND", "CONTRADICTION"].includes(rawTrigger)
        ? (rawTrigger as "GAP" | "BRIDGE" | "TREND" | "CONTRADICTION")
        : "TREND";
      if (!statement) continue;
      const dependencyRaw = row.dependency_path ?? row.dependencyPath;
      const dependencyPath = Array.isArray(dependencyRaw)
        ? dependencyRaw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;
      const strengthsRaw = row.strengths;
      const strengths = Array.isArray(strengthsRaw)
        ? strengthsRaw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;
      const weaknessesRaw = row.weaknesses;
      const weaknesses = Array.isArray(weaknessesRaw)
        ? weaknessesRaw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;
      const planStepsRaw = row.plan_steps ?? row.planSteps;
      const planSteps = Array.isArray(planStepsRaw)
        ? planStepsRaw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;
      const strictEvaluationRaw = row.strict_evaluation ?? row.strictEvaluation;
      const strictEvaluation =
        strictEvaluationRaw && typeof strictEvaluationRaw === "object" && !Array.isArray(strictEvaluationRaw)
          ? (() => {
              const evalRow = strictEvaluationRaw as Record<string, unknown>;
              const overallScoreRaw = evalRow.overall_score ?? evalRow.overallScore;
              const overallScore =
                typeof overallScoreRaw === "number" && Number.isFinite(overallScoreRaw)
                  ? Math.max(0, Math.min(100, Number(overallScoreRaw.toFixed(2))))
                  : undefined;
              const decisionRaw =
                typeof evalRow.decision === "string" ? String(evalRow.decision).trim().toLowerCase() : undefined;
              const decision =
                decisionRaw === "accept" || decisionRaw === "revise" || decisionRaw === "reject"
                  ? (decisionRaw as "accept" | "revise" | "reject")
                  : undefined;
              const reason = typeof evalRow.reason === "string" ? evalRow.reason.trim() : undefined;
              if (overallScore === undefined && !decision && !reason) return undefined;
              return {
                ...(overallScore !== undefined ? { overallScore } : {}),
                ...(decision ? { decision } : {}),
                ...(reason ? { reason } : {}),
              };
            })()
          : undefined;
      const evidenceRaw = row.evidence_ids ?? row.evidenceIds;
      const evidenceIds = Array.isArray(evidenceRaw)
        ? evidenceRaw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;
      const validationStatusRaw =
        typeof (row.validation_status ?? row.validationStatus) === "string"
          ? String(row.validation_status ?? row.validationStatus).trim().toLowerCase()
          : undefined;
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
      const validationNotes =
        typeof (row.validation_notes ?? row.validationNotes) === "string"
          ? String(row.validation_notes ?? row.validationNotes).trim()
          : undefined;
      const validationEvidenceRaw = row.validation_evidence ?? row.validationEvidence;
      const validationEvidence = Array.isArray(validationEvidenceRaw)
        ? validationEvidenceRaw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        : undefined;
      const novelty = typeof row.novelty === "number" && Number.isFinite(row.novelty) ? row.novelty : undefined;
      const feasibility =
        typeof row.feasibility === "number" && Number.isFinite(row.feasibility) ? row.feasibility : undefined;
      const impact = typeof row.impact === "number" && Number.isFinite(row.impact) ? row.impact : undefined;
      hypotheses.push({
        ...(id ? { id } : {}),
        statement,
        trigger,
        ...(dependencyPath && dependencyPath.length > 0 ? { dependencyPath } : {}),
        ...(strengths && strengths.length > 0 ? { strengths } : {}),
        ...(weaknesses && weaknesses.length > 0 ? { weaknesses } : {}),
        ...(planSteps && planSteps.length > 0 ? { planSteps } : {}),
        ...(strictEvaluation ? { strictEvaluation } : {}),
        ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
        ...(validationStatus ? { validationStatus } : {}),
        ...(validationNotes ? { validationNotes } : {}),
        ...(validationEvidence && validationEvidence.length > 0 ? { validationEvidence } : {}),
        ...(novelty !== undefined ? { novelty } : {}),
        ...(feasibility !== undefined ? { feasibility } : {}),
        ...(impact !== undefined ? { impact } : {}),
      });
    }
  }

  const runLogRaw = record.run_log ?? record.runLog;
  const runLog =
    runLogRaw && typeof runLogRaw === "object" && !Array.isArray(runLogRaw)
      ? (() => {
          const runLogRecord = runLogRaw as Record<string, unknown>;
          const model = typeof runLogRecord.model === "string" ? runLogRecord.model.trim() : undefined;
          const runProfileRaw =
            typeof (runLogRecord.run_profile ?? runLogRecord.runProfile) === "string"
              ? String(runLogRecord.run_profile ?? runLogRecord.runProfile).trim().toLowerCase()
              : undefined;
          const runProfile =
            runProfileRaw === "fast" || runProfileRaw === "strict"
              ? (runProfileRaw as "fast" | "strict")
              : undefined;
          const durationMsRaw = runLogRecord.duration_ms ?? runLogRecord.durationMs;
          const durationMs =
            typeof durationMsRaw === "number" && Number.isFinite(durationMsRaw) ? durationMsRaw : undefined;
          const error = typeof runLogRecord.error === "string" ? runLogRecord.error.trim() : undefined;
          const degraded = runLogRecord.degraded === true;
          const notes = typeof runLogRecord.notes === "string" ? runLogRecord.notes.trim() : undefined;
          const requiredCorePapersRaw = runLogRecord.required_core_papers ?? runLogRecord.requiredCorePapers;
          const requiredCorePapers =
            typeof requiredCorePapersRaw === "number" && Number.isFinite(requiredCorePapersRaw)
              ? Math.max(0, Math.floor(requiredCorePapersRaw))
              : undefined;
          const requiredFullTextCoveragePctRaw =
            runLogRecord.required_full_text_coverage_pct ?? runLogRecord.requiredFullTextCoveragePct;
          const requiredFullTextCoveragePct =
            typeof requiredFullTextCoveragePctRaw === "number" && Number.isFinite(requiredFullTextCoveragePctRaw)
              ? Math.max(0, Math.min(100, Number(requiredFullTextCoveragePctRaw.toFixed(2))))
              : undefined;
          const tempFullTextDir =
            typeof (runLogRecord.temp_full_text_dir ?? runLogRecord.tempFullTextDir) === "string"
              ? String(runLogRecord.temp_full_text_dir ?? runLogRecord.tempFullTextDir).trim()
              : undefined;
          const tempFilesDownloadedRaw = runLogRecord.temp_files_downloaded ?? runLogRecord.tempFilesDownloaded;
          const tempFilesDownloaded =
            typeof tempFilesDownloadedRaw === "number" && Number.isFinite(tempFilesDownloadedRaw)
              ? tempFilesDownloadedRaw
              : undefined;
          const tempCleanupStatusRaw =
            typeof (runLogRecord.temp_cleanup_status ?? runLogRecord.tempCleanupStatus) === "string"
              ? String(runLogRecord.temp_cleanup_status ?? runLogRecord.tempCleanupStatus).trim().toLowerCase()
              : undefined;
          const tempCleanupStatus =
            tempCleanupStatusRaw && ["done", "partial", "failed", "not_needed"].includes(tempCleanupStatusRaw)
              ? (tempCleanupStatusRaw as "done" | "partial" | "failed" | "not_needed")
              : undefined;
          const tempCleanupNote =
            typeof (runLogRecord.temp_cleanup_note ?? runLogRecord.tempCleanupNote) === "string"
              ? String(runLogRecord.temp_cleanup_note ?? runLogRecord.tempCleanupNote).trim()
              : undefined;
          const fullTextAttemptedRaw = runLogRecord.full_text_attempted ?? runLogRecord.fullTextAttempted;
          const fullTextAttempted =
            typeof fullTextAttemptedRaw === "number" && Number.isFinite(fullTextAttemptedRaw)
              ? fullTextAttemptedRaw
              : undefined;
          const fullTextCompletedRaw = runLogRecord.full_text_completed ?? runLogRecord.fullTextCompleted;
          const fullTextCompleted =
            typeof fullTextCompletedRaw === "number" && Number.isFinite(fullTextCompletedRaw)
              ? fullTextCompletedRaw
              : undefined;
          const recallTierStatsRaw = runLogRecord.recall_tier_stats ?? runLogRecord.recallTierStats;
          const normalizeTierStat = (
            raw: unknown,
          ): { candidates: number; selected: number } | undefined => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
            const record = raw as Record<string, unknown>;
            const candidatesRaw = record.candidates;
            const selectedRaw = record.selected;
            const candidates =
              typeof candidatesRaw === "number" && Number.isFinite(candidatesRaw)
                ? Math.max(0, Math.floor(candidatesRaw))
                : undefined;
            const selected =
              typeof selectedRaw === "number" && Number.isFinite(selectedRaw)
                ? Math.max(0, Math.floor(selectedRaw))
                : undefined;
            if (candidates === undefined && selected === undefined) return undefined;
            return {
              candidates: candidates ?? 0,
              selected: selected ?? 0,
            };
          };
          const recallTierStats =
            recallTierStatsRaw && typeof recallTierStatsRaw === "object" && !Array.isArray(recallTierStatsRaw)
              ? (() => {
                  const record = recallTierStatsRaw as Record<string, unknown>;
                  const tierA = normalizeTierStat(record.tier_a ?? record.tierA);
                  const tierB = normalizeTierStat(record.tier_b ?? record.tierB);
                  const tierC = normalizeTierStat(record.tier_c ?? record.tierC);
                  if (!tierA && !tierB && !tierC) return undefined;
                  return {
                    ...(tierA ? { tierA } : {}),
                    ...(tierB ? { tierB } : {}),
                    ...(tierC ? { tierC } : {}),
                  };
                })()
              : undefined;
          const reflectionStepExecuted =
            typeof (runLogRecord.reflection_step_executed ?? runLogRecord.reflectionStepExecuted) === "boolean"
              ? Boolean(runLogRecord.reflection_step_executed ?? runLogRecord.reflectionStepExecuted)
              : undefined;
          const reflectionStepResultCountRaw =
            runLogRecord.reflection_step_result_count ?? runLogRecord.reflectionStepResultCount;
          const reflectionStepResultCount =
            typeof reflectionStepResultCountRaw === "number" && Number.isFinite(reflectionStepResultCountRaw)
              ? Math.max(0, Math.floor(reflectionStepResultCountRaw))
              : undefined;
          if (
            !model &&
            !runProfile &&
            durationMs === undefined &&
            !error &&
            !degraded &&
            !notes &&
            requiredCorePapers === undefined &&
            requiredFullTextCoveragePct === undefined &&
            !tempFullTextDir &&
            tempFilesDownloaded === undefined &&
            !tempCleanupStatus &&
            !tempCleanupNote &&
            fullTextAttempted === undefined &&
            fullTextCompleted === undefined &&
            !recallTierStats &&
            reflectionStepExecuted === undefined &&
            reflectionStepResultCount === undefined
          ) {
            return undefined;
          }
          return {
            ...(model ? { model } : {}),
            ...(runProfile ? { runProfile } : {}),
            ...(durationMs !== undefined ? { durationMs } : {}),
            ...(error ? { error } : {}),
            ...(degraded ? { degraded } : {}),
            ...(notes ? { notes } : {}),
            ...(requiredCorePapers !== undefined ? { requiredCorePapers } : {}),
            ...(requiredFullTextCoveragePct !== undefined ? { requiredFullTextCoveragePct } : {}),
            ...(tempFullTextDir ? { tempFullTextDir } : {}),
            ...(tempFilesDownloaded !== undefined ? { tempFilesDownloaded } : {}),
            ...(tempCleanupStatus ? { tempCleanupStatus } : {}),
            ...(tempCleanupNote ? { tempCleanupNote } : {}),
            ...(fullTextAttempted !== undefined ? { fullTextAttempted } : {}),
            ...(fullTextCompleted !== undefined ? { fullTextCompleted } : {}),
            ...(recallTierStats ? { recallTierStats } : {}),
            ...(reflectionStepExecuted !== undefined ? { reflectionStepExecuted } : {}),
            ...(reflectionStepResultCount !== undefined ? { reflectionStepResultCount } : {}),
          };
        })()
      : undefined;

  const hasAny =
    corePapers.length > 0 ||
    explorationPapers.length > 0 ||
    explorationTrace.length > 0 ||
    knowledgeChanges.length > 0 ||
    knowledgeUpdates.length > 0 ||
    hypotheses.length > 0 ||
    Boolean(runLog);

  if (!hasAny) return undefined;

  return {
    ...(corePapers.length > 0 ? { corePapers } : {}),
    ...(explorationPapers.length > 0 ? { explorationPapers } : {}),
    ...(explorationTrace.length > 0 ? { explorationTrace } : {}),
    ...(knowledgeChanges.length > 0 ? { knowledgeChanges } : {}),
    ...(knowledgeUpdates.length > 0 ? { knowledgeUpdates } : {}),
    ...(hypotheses.length > 0 ? { hypotheses } : {}),
    ...(runLog ? { runLog } : {}),
  };
}

function serializeKnowledgePaper(paper: NonNullable<KnowledgeStateInput["corePapers"]>[number]): Record<string, unknown> {
  return {
    id: paper.id ?? null,
    title: paper.title ?? null,
    url: paper.url ?? null,
    source: paper.source ?? null,
    published_at: paper.publishedAt ?? null,
    score: paper.score ?? null,
    reason: paper.reason ?? null,
    summary: paper.summary ?? null,
    evidence_ids: paper.evidenceIds ?? [],
    full_text_read: paper.fullTextRead ?? null,
    read_status: paper.readStatus ?? null,
    full_text_source: paper.fullTextSource ?? null,
    full_text_ref: paper.fullTextRef ?? null,
    unread_reason: paper.unreadReason ?? null,
    key_evidence_spans: paper.keyEvidenceSpans ?? [],
    domain: paper.domain ?? null,
    subdomains: paper.subdomains ?? [],
    cross_domain_links: paper.crossDomainLinks ?? [],
    research_goal: paper.researchGoal ?? null,
    approach: paper.approach ?? null,
    methodology_design: paper.methodologyDesign ?? null,
    key_contributions: paper.keyContributions ?? [],
    practical_insights: paper.practicalInsights ?? [],
    must_understand_points: paper.mustUnderstandPoints ?? [],
    limitations: paper.limitations ?? [],
    evidence_anchors: (paper.evidenceAnchors ?? []).map((anchor) => ({
      section: anchor.section ?? null,
      locator: anchor.locator ?? null,
      claim: anchor.claim,
      quote: anchor.quote ?? null,
    })),
  };
}

function serializeKnowledgeSummaryPayload(
  summary: NonNullable<
    Awaited<ReturnType<typeof getIncrementalStateStatus>>["knowledgeStateSummary"]
  >,
): Record<string, unknown> {
  return {
    project_id: summary.projectId,
    stream_key: summary.streamKey,
    run_profile: summary.runProfile,
    total_runs: summary.totalRuns,
    total_hypotheses: summary.totalHypotheses,
    knowledge_topics_count: summary.knowledgeTopicsCount,
    paper_notes_count: summary.paperNotesCount,
    trigger_state: {
      consecutive_new_revise_days: summary.triggerState.consecutiveNewReviseDays,
      bridge_count_7d: summary.triggerState.bridgeCount7d,
      unread_core_backlog: summary.triggerState.unreadCoreBacklog,
      last_updated_at_ms: summary.triggerState.lastUpdatedAtMs,
    },
    recent_full_text_read_count: summary.recentFullTextReadCount,
    recent_not_full_text_read_count: summary.recentNotFullTextReadCount,
    quality_gate: {
      mode: summary.qualityGate.mode,
      severity: summary.qualityGate.severity,
      warnings: summary.qualityGate.warnings,
      fatal_reasons: summary.qualityGate.fatalReasons,
      blocking: summary.qualityGate.blocking,
      passed: summary.qualityGate.passed,
      full_text_coverage_pct: summary.qualityGate.fullTextCoveragePct,
      evidence_binding_rate_pct: summary.qualityGate.evidenceBindingRatePct,
      citation_error_rate_pct: summary.qualityGate.citationErrorRatePct,
      reasons: summary.qualityGate.reasons,
    },
    hypothesis_gate: {
      accepted: summary.hypothesisGate.accepted,
      rejected: summary.hypothesisGate.rejected,
      rejection_reasons: summary.hypothesisGate.rejectionReasons,
    },
    unread_core_paper_ids: summary.unreadCorePaperIds,
    last_run_at_ms: summary.lastRunAtMs ?? null,
    last_status: summary.lastStatus ?? null,
    last_reflection_tasks: summary.lastReflectionTasks.map((task) => ({
      id: task.id,
      trigger: task.trigger,
      reason: task.reason,
      query: task.query,
      priority: task.priority,
      status: task.status,
    })),
    recent_papers: summary.recentPapers.map(serializeKnowledgePaper),
  };
}

function defaultKnowledgeSummaryPayload(args: {
  projectId?: string;
  streamKey?: string;
}): Record<string, unknown> {
  return {
    project_id: args.projectId ?? null,
    stream_key: args.streamKey ?? null,
    run_profile: "strict",
    total_runs: 0,
    total_hypotheses: 0,
    knowledge_topics_count: 0,
    paper_notes_count: 0,
    trigger_state: {
      consecutive_new_revise_days: 0,
      bridge_count_7d: 0,
      unread_core_backlog: 0,
      last_updated_at_ms: null,
    },
    recent_full_text_read_count: 0,
    recent_not_full_text_read_count: 0,
    quality_gate: {
      mode: "soft",
      severity: "warn",
      warnings: ["knowledge_state_summary_missing"],
      fatal_reasons: [],
      blocking: false,
      passed: false,
      full_text_coverage_pct: 0,
      evidence_binding_rate_pct: 0,
      citation_error_rate_pct: 0,
      reasons: ["knowledge_state_summary_missing"],
    },
    hypothesis_gate: {
      accepted: 0,
      rejected: 0,
      rejection_reasons: [],
    },
    unread_core_paper_ids: [],
    last_run_at_ms: null,
    last_status: null,
    last_reflection_tasks: [],
    recent_papers: [],
  };
}

export function createScientifyLiteratureStateTool() {
  return {
    label: "Scientify Literature State",
    name: "scientify_literature_state",
    description:
      "Manage incremental research state for subscriptions: prepare dedupe context, record pushed papers plus knowledge_state artifacts, persist lightweight feedback memory, and query status.",
    parameters: ScientifyLiteratureStateToolSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = (rawArgs ?? {}) as Record<string, unknown>;
      const action = (readStringParam(params, "action") ?? "").toLowerCase();
      const scope = readStringParam(params, "scope");
      const topic = readStringParam(params, "topic");
      const projectId = readStringParam(params, "project_id");
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
          const runProfileRaw = readStringParam(params, "run_profile")?.toLowerCase();
          const requiredCorePapers = readNumberParam(params, "required_core_papers");
          const requiredFullTextCoveragePct = readNumberParam(params, "required_full_text_coverage_pct");
          const runProfile =
            runProfileRaw === "fast" || runProfileRaw === "strict"
              ? (runProfileRaw as "fast" | "strict")
              : undefined;
          const note = readStringParam(params, "note");
          const knowledgeState = readKnowledgeStatePayload(params);
          const mergedRunLog =
            runProfile !== undefined ||
            requiredCorePapers !== undefined ||
            requiredFullTextCoveragePct !== undefined ||
            knowledgeState?.runLog
              ? {
                  ...(knowledgeState?.runLog ?? {}),
                  ...(!knowledgeState?.runLog?.runProfile && runProfile !== undefined
                    ? { runProfile }
                    : {}),
                  ...(knowledgeState?.runLog?.requiredCorePapers === undefined && requiredCorePapers !== undefined
                    ? { requiredCorePapers }
                    : {}),
                  ...(knowledgeState?.runLog?.requiredFullTextCoveragePct === undefined &&
                  requiredFullTextCoveragePct !== undefined
                    ? { requiredFullTextCoveragePct }
                    : {}),
                }
              : undefined;
          const mergedKnowledgeState: KnowledgeStateInput | undefined =
            knowledgeState || mergedRunLog
              ? {
                  ...(knowledgeState ?? {}),
                  ...(mergedRunLog ? { runLog: mergedRunLog } : {}),
                }
              : undefined;
          const recorded = await recordIncrementalPush({
            scope,
            topic,
            preferences,
            status,
            runId,
            note,
            papers,
            ...(projectId ? { projectId } : {}),
            ...(mergedKnowledgeState ? { knowledgeState: mergedKnowledgeState } : {}),
          });
          return Result.ok({
            action,
            scope: recorded.scope,
            topic: recorded.topic,
            topic_key: recorded.topicKey,
            run_id: recorded.runId,
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
            project_id: recorded.projectId ?? null,
            knowledge_state_summary: recorded.knowledgeStateSummary
              ? serializeKnowledgeSummaryPayload(recorded.knowledgeStateSummary)
              : defaultKnowledgeSummaryPayload({ projectId: recorded.projectId, streamKey: recorded.streamKey }),
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
          const status = await getIncrementalStateStatus({
            scope,
            topic,
            ...(projectId ? { projectId } : {}),
          });
          const detailedPaperById = new Map<
            string,
            NonNullable<typeof status.knowledgeStateSummary>["recentPapers"][number]
          >(
            (status.knowledgeStateSummary?.recentPapers ?? [])
              .map((paper) => [paper.id, paper] as const)
              .filter((entry): entry is [string, NonNullable<typeof status.knowledgeStateSummary>["recentPapers"][number]] => {
                const [id] = entry;
                return typeof id === "string" && id.trim().length > 0;
              }),
          );
          return Result.ok({
            action,
            scope: status.scope,
            topic: status.topic,
            topic_key: status.topicKey,
            latest_run_id: status.recentChangeStats[0]?.runId ?? null,
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
            knowledge_state_missing_reason: status.knowledgeStateSummary
              ? null
              : status.knowledgeStateMissingReason ?? "project_or_stream_not_found",
            knowledge_state_summary: status.knowledgeStateSummary
              ? serializeKnowledgeSummaryPayload(status.knowledgeStateSummary)
              : defaultKnowledgeSummaryPayload({ projectId }),
            recent_hypotheses: status.recentHypotheses.map((item) => ({
              id: item.id,
              statement: item.statement,
              trigger: item.trigger,
              created_at_ms: item.createdAtMs,
              file: item.file,
              strict_overall_score:
                typeof item.strictOverallScore === "number" ? item.strictOverallScore : null,
              strict_decision: item.strictDecision ?? null,
            })),
            recent_change_stats: status.recentChangeStats.map((item) => ({
              day: item.day,
              run_id: item.runId,
              new_count: item.newCount,
              confirm_count: item.confirmCount,
              revise_count: item.reviseCount,
              bridge_count: item.bridgeCount,
            })),
            last_exploration_trace: status.lastExplorationTrace.map((item) => ({
              query: item.query,
              reason: item.reason ?? null,
              source: item.source ?? null,
              candidates: item.candidates ?? null,
              filtered_to: item.filteredTo ?? null,
              filtered_out_reasons: item.filteredOutReasons ?? [],
              result_count: item.resultCount ?? null,
            })),
            recent_papers: status.recentPapers.map((paper) => ({
              id: paper.id,
              title: paper.title ?? null,
              url: paper.url ?? null,
              last_score: paper.lastScore ?? null,
              last_reason: paper.lastReason ?? null,
              first_pushed_at_ms: paper.firstPushedAtMs,
              last_pushed_at_ms: paper.lastPushedAtMs,
              push_count: paper.pushCount,
              ...(detailedPaperById.has(paper.id)
                ? {
                    full_text_read: detailedPaperById.get(paper.id)?.fullTextRead ?? null,
                    read_status: detailedPaperById.get(paper.id)?.readStatus ?? null,
                    unread_reason: detailedPaperById.get(paper.id)?.unreadReason ?? null,
                    evidence_anchors: (detailedPaperById.get(paper.id)?.evidenceAnchors ?? []).map((anchor) => ({
                      section: anchor.section ?? null,
                      locator: anchor.locator ?? null,
                      claim: anchor.claim,
                      quote: anchor.quote ?? null,
                    })),
                  }
                : {}),
            })),
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

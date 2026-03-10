import type {
  ExplorationTraceInput,
  HypothesisGateSummary,
  KnowledgeChangeInput,
  KnowledgeHypothesisInput,
  KnowledgePaperInput,
  KnowledgeUpdateInput,
  ReflectionTaskInput,
} from "./types.js";

const PLACEHOLDER_TEXT_RE =
  /^(?:n\/a|na|none|not provided|not available|unknown|tbd|todo|null|nil|未提供|暂无|未知|无)$/iu;

function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function cleanText(raw?: string): string | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = normalizeText(raw);
  if (!normalized) return undefined;
  if (PLACEHOLDER_TEXT_RE.test(normalized)) return undefined;
  return normalized;
}

function toCsv(values?: string[]): string | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const cleaned = values.map((item) => cleanText(item)).filter((item): item is string => Boolean(item));
  return cleaned.length > 0 ? cleaned.join(", ") : undefined;
}

function renderStringArray(lines: string[], label: string, values?: string[]): void {
  if (!Array.isArray(values) || values.length === 0) return;
  for (const [idx, value] of values.entries()) {
    const trimmed = cleanText(value);
    if (!trimmed) continue;
    lines.push(`   - ${label}_${idx + 1}: ${trimmed}`);
  }
}

function formatEvidenceAnchor(anchor: NonNullable<KnowledgePaperInput["evidenceAnchors"]>[number]): string {
  const tags = [
    anchor.section?.trim() ? `section=${anchor.section.trim()}` : undefined,
    anchor.locator?.trim() ? `locator=${anchor.locator.trim()}` : undefined,
  ].filter((item): item is string => Boolean(item));
  const claim = anchor.claim.trim();
  const quote = anchor.quote?.trim();
  const head = tags.length > 0 ? `[${tags.join(" | ")}] ` : "";
  return quote ? `${head}${claim} :: ${quote}` : `${head}${claim}`;
}

function renderEvidenceAnchors(lines: string[], anchors?: KnowledgePaperInput["evidenceAnchors"]): void {
  if (!Array.isArray(anchors) || anchors.length === 0) return;
  for (const [idx, anchor] of anchors.entries()) {
    if (!anchor || typeof anchor !== "object") continue;
    if (!anchor.claim || !anchor.claim.trim()) continue;
    lines.push(`   - evidence_anchor_${idx + 1}: ${formatEvidenceAnchor(anchor)}`);
  }
}

export function dayKeyFromTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function slugifyTopic(raw: string): string {
  const normalized = normalizeText(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "topic";
}

function renderPaperBlock(paper: KnowledgePaperInput, index: number): string[] {
  const title = paper.title?.trim() || "Untitled";
  const lines = [`${index + 1}. ${title}`];

  if (paper.id?.trim()) lines.push(`   - id: ${paper.id.trim()}`);
  if (paper.url?.trim()) lines.push(`   - url: ${paper.url.trim()}`);
  if (paper.source?.trim()) lines.push(`   - source: ${paper.source.trim()}`);
  if (paper.publishedAt?.trim()) lines.push(`   - published_at: ${paper.publishedAt.trim()}`);
  if (typeof paper.score === "number" && Number.isFinite(paper.score)) {
    lines.push(`   - score: ${paper.score}`);
  }
  if (paper.reason?.trim()) lines.push(`   - reason: ${paper.reason.trim()}`);
  if (paper.summary?.trim()) lines.push(`   - summary: ${paper.summary.trim()}`);
  if (paper.evidenceIds && paper.evidenceIds.length > 0) {
    lines.push(`   - evidence_ids: ${paper.evidenceIds.join(", ")}`);
  }
  if (typeof paper.fullTextRead === "boolean") {
    lines.push(`   - full_text_read: ${paper.fullTextRead ? "true" : "false"}`);
  }
  if (paper.readStatus?.trim()) lines.push(`   - read_status: ${paper.readStatus.trim()}`);
  if (paper.fullTextSource?.trim()) lines.push(`   - full_text_source: ${paper.fullTextSource.trim()}`);
  if (paper.fullTextRef?.trim()) lines.push(`   - full_text_ref: ${paper.fullTextRef.trim()}`);
  if (paper.unreadReason?.trim()) lines.push(`   - unread_reason: ${paper.unreadReason.trim()}`);
  if (paper.domain?.trim()) lines.push(`   - domain: ${paper.domain.trim()}`);
  const subdomains = toCsv(paper.subdomains);
  if (subdomains) lines.push(`   - subdomains: ${subdomains}`);
  const crossDomainLinks = toCsv(paper.crossDomainLinks);
  if (crossDomainLinks) lines.push(`   - cross_domain_links: ${crossDomainLinks}`);
  if (paper.researchGoal?.trim()) lines.push(`   - research_goal: ${paper.researchGoal.trim()}`);
  if (paper.approach?.trim()) lines.push(`   - approach: ${paper.approach.trim()}`);
  if (paper.methodologyDesign?.trim()) lines.push(`   - methodology_design: ${paper.methodologyDesign.trim()}`);
  renderStringArray(lines, "key_contribution", paper.keyContributions);
  renderStringArray(lines, "practical_insight", paper.practicalInsights);
  renderStringArray(lines, "must_understand_point", paper.mustUnderstandPoints);
  renderStringArray(lines, "limitation", paper.limitations);
  if (paper.keyEvidenceSpans && paper.keyEvidenceSpans.length > 0) {
    for (const [spanIdx, span] of paper.keyEvidenceSpans.entries()) {
      lines.push(`   - key_evidence_span_${spanIdx + 1}: ${span}`);
    }
  }
  renderEvidenceAnchors(lines, paper.evidenceAnchors);

  return lines;
}

export function renderPaperNoteHeaderMarkdown(args: { paper: KnowledgePaperInput; file: string }): string {
  const title = args.paper.title?.trim() || "Untitled paper";
  const lines = [`# Paper Note: ${title}`, "", `- File: ${args.file}`];
  if (args.paper.id?.trim()) lines.push(`- Canonical ID: ${args.paper.id.trim()}`);
  if (args.paper.url?.trim()) lines.push(`- Canonical URL: ${args.paper.url.trim()}`);
  if (args.paper.source?.trim()) lines.push(`- Source: ${args.paper.source.trim()}`);
  lines.push("");
  return lines.join("\n");
}

export function renderPaperNoteRunMarkdown(args: {
  now: string;
  runId: string;
  role: "core" | "exploration";
  paper: KnowledgePaperInput;
}): string {
  const paper = args.paper;
  const profileFieldChecks: Array<{ label: string; filled: boolean }> = [
    { label: "domain", filled: Boolean(cleanText(paper.domain)) },
    { label: "subdomains", filled: Boolean(toCsv(paper.subdomains)) },
    { label: "cross_domain_links", filled: Boolean(toCsv(paper.crossDomainLinks)) },
    { label: "research_goal", filled: Boolean(cleanText(paper.researchGoal)) },
    { label: "approach", filled: Boolean(cleanText(paper.approach)) },
    { label: "methodology_design", filled: Boolean(cleanText(paper.methodologyDesign)) },
    { label: "key_contributions", filled: Boolean(paper.keyContributions && paper.keyContributions.length > 0) },
    { label: "practical_insights", filled: Boolean(paper.practicalInsights && paper.practicalInsights.length > 0) },
    {
      label: "must_understand_points",
      filled: Boolean(paper.mustUnderstandPoints && paper.mustUnderstandPoints.length > 0),
    },
    { label: "limitations", filled: Boolean(paper.limitations && paper.limitations.length > 0) },
    { label: "evidence_anchors", filled: Boolean(paper.evidenceAnchors && paper.evidenceAnchors.length > 0) },
  ];
  const profileFilledCount = profileFieldChecks.filter((item) => item.filled).length;
  const profileMissingFields = profileFieldChecks.filter((item) => !item.filled).map((item) => item.label);

  const lines = [
    `## Run ${args.runId}`,
    `- Time: ${args.now}`,
    `- Role in run: ${args.role}`,
    `- Read status: ${cleanText(paper.readStatus) ?? (paper.fullTextRead ? "fulltext" : "metadata")}`,
    `- Full-text read: ${paper.fullTextRead === true ? "true" : "false"}`,
    `- Profile coverage: ${profileFilledCount}/${profileFieldChecks.length}`,
  ];
  if (profileMissingFields.length > 0) lines.push(`- Missing fields: ${profileMissingFields.join(", ")}`);
  if (cleanText(paper.fullTextSource)) lines.push(`- Full-text source: ${cleanText(paper.fullTextSource)}`);
  if (cleanText(paper.fullTextRef)) lines.push(`- Full-text ref: ${cleanText(paper.fullTextRef)}`);
  if (cleanText(paper.unreadReason)) lines.push(`- Unread reason: ${cleanText(paper.unreadReason)}`);
  lines.push("");

  lines.push("### Research Positioning");
  const domain = cleanText(paper.domain);
  const subdomains = toCsv(paper.subdomains);
  const crossDomainLinks = toCsv(paper.crossDomainLinks);
  if (domain) lines.push(`- Domain: ${domain}`);
  if (subdomains) lines.push(`- Subdomains: ${subdomains}`);
  if (crossDomainLinks) lines.push(`- Cross-domain links: ${crossDomainLinks}`);
  if (!domain && !subdomains && !crossDomainLinks) {
    lines.push("- Pending enrichment: taxonomy fields were not extracted in this run.");
  }
  lines.push("");

  lines.push("### Study Focus");
  const researchGoal = cleanText(paper.researchGoal);
  const approach = cleanText(paper.approach);
  const methodologyDesign = cleanText(paper.methodologyDesign);
  if (researchGoal) lines.push(`- Research goal: ${researchGoal}`);
  if (approach) lines.push(`- Approach: ${approach}`);
  if (methodologyDesign) lines.push(`- Methodology design: ${methodologyDesign}`);
  if (!researchGoal && !approach && !methodologyDesign) {
    lines.push("- Pending enrichment: study-focus fields were not extracted in this run.");
  }
  lines.push("");

  lines.push("### Contributions");
  const keyContributions = (paper.keyContributions ?? [])
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item));
  if (keyContributions.length > 0) {
    lines.push(...keyContributions.map((item, idx) => `${idx + 1}. ${item}`));
  } else {
    lines.push("- Pending enrichment: no concrete contribution extracted yet.");
  }
  lines.push("");

  lines.push("### Practical Insights");
  const practicalInsights = (paper.practicalInsights ?? [])
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item));
  if (practicalInsights.length > 0) {
    lines.push(...practicalInsights.map((item, idx) => `${idx + 1}. ${item}`));
  } else {
    lines.push("- Pending enrichment: no practical insight extracted yet.");
  }
  lines.push("");

  lines.push("### Must Understand");
  const mustUnderstandPoints = (paper.mustUnderstandPoints ?? [])
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item));
  if (mustUnderstandPoints.length > 0) {
    lines.push(...mustUnderstandPoints.map((item, idx) => `${idx + 1}. ${item}`));
  } else {
    lines.push("- Pending enrichment: key concepts to master were not extracted yet.");
  }
  lines.push("");

  lines.push("### Limitations");
  const limitations = (paper.limitations ?? [])
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item));
  if (limitations.length > 0) {
    lines.push(...limitations.map((item, idx) => `${idx + 1}. ${item}`));
  } else {
    lines.push("- Pending enrichment: limitation analysis not extracted yet.");
  }
  lines.push("");

  lines.push("### Evidence Anchors");
  if (paper.evidenceAnchors && paper.evidenceAnchors.length > 0) {
    for (const [idx, anchor] of paper.evidenceAnchors.entries()) {
      if (!anchor?.claim?.trim()) continue;
      lines.push(`${idx + 1}. ${formatEvidenceAnchor(anchor)}`);
    }
  } else if (paper.keyEvidenceSpans && paper.keyEvidenceSpans.length > 0) {
    lines.push(...paper.keyEvidenceSpans.map((item, idx) => `${idx + 1}. ${item}`));
  } else {
    if (paper.fullTextRead === true || paper.readStatus === "fulltext") {
      lines.push("- Pending enrichment: add section + locator + quote evidence anchors.");
    } else {
      lines.push("- Metadata-only read in this run; evidence anchors require full-text reading.");
    }
  }
  lines.push("");

  return lines.join("\n");
}

export function renderIngestLogMarkdown(args: {
  now: string;
  runId: string;
  scope: string;
  topic: string;
  papers: KnowledgePaperInput[];
}): string {
  const lines = [
    `## Run ${args.runId}`,
    `- Time: ${args.now}`,
    `- Scope: ${args.scope}`,
    `- Topic: ${args.topic}`,
    `- Count: ${args.papers.length}`,
    "",
    "### Papers",
    ...(args.papers.length > 0 ? args.papers.flatMap(renderPaperBlock) : ["- (none)"]),
    "",
  ];
  return lines.join("\n");
}

export function renderExplorationLogMarkdown(args: {
  now: string;
  runId: string;
  trace: ExplorationTraceInput[];
  papers: KnowledgePaperInput[];
}): string {
  const lines = [
    `## Run ${args.runId}`,
    `- Time: ${args.now}`,
    `- Trace count: ${args.trace.length}`,
    `- Paper count: ${args.papers.length}`,
    "",
    "### Exploration Trace",
    ...(args.trace.length > 0
      ? args.trace.map((step, idx) => {
          const attrs = [
            `query=${step.query}`,
            ...(step.reason ? [`reason=${step.reason}`] : []),
            ...(step.source ? [`source=${step.source}`] : []),
            ...(typeof step.candidates === "number" ? [`candidates=${step.candidates}`] : []),
            ...(typeof step.filteredTo === "number" ? [`filtered_to=${step.filteredTo}`] : []),
            ...(typeof step.resultCount === "number" ? [`result_count=${step.resultCount}`] : []),
            ...(step.filteredOutReasons && step.filteredOutReasons.length > 0
              ? [`filtered_out=${step.filteredOutReasons.join("; ")}`]
              : []),
          ];
          return `${idx + 1}. ${attrs.join(" | ")}`;
        })
      : ["- (none)"]),
    "",
    "### Exploration Papers",
    ...(args.papers.length > 0 ? args.papers.flatMap(renderPaperBlock) : ["- (none)"]),
    "",
  ];
  return lines.join("\n");
}

export function renderReflectionLogMarkdown(args: {
  now: string;
  runId: string;
  tasks: ReflectionTaskInput[];
}): string {
  const lines = [
    `## Run ${args.runId}`,
    `- Time: ${args.now}`,
    `- Reflection tasks: ${args.tasks.length}`,
    "",
    "### Tasks",
    ...(args.tasks.length > 0
      ? args.tasks.map((task, idx) => {
          const attrs = [
            `trigger=${task.trigger}`,
            `priority=${task.priority}`,
            `status=${task.status}`,
            `query=${task.query}`,
            `reason=${task.reason}`,
          ];
          return `${idx + 1}. ${attrs.join(" | ")}`;
        })
      : ["- (none)"]),
    "",
  ];
  return lines.join("\n");
}

export function renderDailyChangesMarkdown(args: {
  now: string;
  runId: string;
  topic: string;
  changes: KnowledgeChangeInput[];
}): string {
  const groups: Record<string, KnowledgeChangeInput[]> = {
    NEW: [],
    CONFIRM: [],
    REVISE: [],
    BRIDGE: [],
  };

  for (const change of args.changes) {
    const key = change.type in groups ? change.type : "NEW";
    groups[key].push(change);
  }

  const lines = [
    `## Run ${args.runId}`,
    `- Time: ${args.now}`,
    `- Topic: ${args.topic}`,
    `- Total changes: ${args.changes.length}`,
    "",
  ];

  for (const type of ["NEW", "CONFIRM", "REVISE", "BRIDGE"] as const) {
    lines.push(`### ${type}`);
    const items = groups[type];
    if (items.length === 0) {
      lines.push("- (none)");
      lines.push("");
      continue;
    }
    for (const [idx, item] of items.entries()) {
      const evidence = item.evidenceIds && item.evidenceIds.length > 0 ? ` | evidence=${item.evidenceIds.join(",")}` : "";
      const topic = item.topic ? ` | topic=${item.topic}` : "";
      lines.push(`${idx + 1}. ${item.statement}${topic}${evidence}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderTopicUpdateMarkdown(args: {
  now: string;
  runId: string;
  updates: KnowledgeUpdateInput[];
}): string {
  const lines = [
    `### Run ${args.runId} @ ${args.now}`,
    ...(args.updates.length > 0
      ? args.updates.map((item, idx) => {
          const confidence = item.confidence ? ` [confidence=${item.confidence}]` : "";
          const evidence = item.evidenceIds && item.evidenceIds.length > 0 ? ` (evidence: ${item.evidenceIds.join(",")})` : "";
          return `${idx + 1}. (${item.op}) ${item.content}${confidence}${evidence}`;
        })
      : ["- (no updates)"]),
    "",
  ];
  return lines.join("\n");
}

export function renderHypothesisMarkdown(args: {
  now: string;
  hypothesisId: string;
  runId: string;
  hypothesis: KnowledgeHypothesisInput;
}): string {
  const novelty = typeof args.hypothesis.novelty === "number" ? args.hypothesis.novelty : "pending";
  const feasibility = typeof args.hypothesis.feasibility === "number" ? args.hypothesis.feasibility : "pending";
  const impact = typeof args.hypothesis.impact === "number" ? args.hypothesis.impact : "pending";

  const lines = [
    `# ${args.hypothesisId}`,
    "",
    `- Created: ${args.now}`,
    `- Run: ${args.runId}`,
    `- Trigger: ${args.hypothesis.trigger}`,
    "",
    "## Statement",
    args.hypothesis.statement,
    "",
    "## Dependency Path",
    ...(args.hypothesis.dependencyPath && args.hypothesis.dependencyPath.length > 0
      ? args.hypothesis.dependencyPath.map((step, idx) => `${idx + 1}. ${step}`)
      : ["- Pending enrichment: dependency path not extracted in this run."]),
    "",
    "## Strengths",
    ...(args.hypothesis.strengths && args.hypothesis.strengths.length > 0
      ? args.hypothesis.strengths.map((item, idx) => `${idx + 1}. ${item}`)
      : ["1. (none)"]),
    "",
    "## Weaknesses",
    ...(args.hypothesis.weaknesses && args.hypothesis.weaknesses.length > 0
      ? args.hypothesis.weaknesses.map((item, idx) => `${idx + 1}. ${item}`)
      : ["1. (none)"]),
    "",
    "## Research Plan",
    ...(args.hypothesis.planSteps && args.hypothesis.planSteps.length > 0
      ? args.hypothesis.planSteps.map((step, idx) => `${idx + 1}. ${step}`)
      : ["1. (none)"]),
    "",
    "## Evidence IDs",
    ...(args.hypothesis.evidenceIds && args.hypothesis.evidenceIds.length > 0
      ? args.hypothesis.evidenceIds.map((id, idx) => `${idx + 1}. ${id}`)
      : ["1. (none)"]),
    "",
    "## Validation",
    `- Status: ${args.hypothesis.validationStatus ?? "unchecked"}`,
    `- Notes: ${args.hypothesis.validationNotes ?? "pending"}`,
    ...(args.hypothesis.validationEvidence && args.hypothesis.validationEvidence.length > 0
      ? [
          "- Evidence:",
          ...args.hypothesis.validationEvidence.map((item, idx) => `  ${idx + 1}. ${item}`),
        ]
      : ["- Evidence: (none)"]),
    "",
    "## Self Assessment",
    `- Novelty: ${novelty}`,
    `- Feasibility: ${feasibility}`,
    `- Impact: ${impact}`,
    ...(args.hypothesis.strictEvaluation
      ? [
          `- Strict overall score: ${typeof args.hypothesis.strictEvaluation.overallScore === "number" ? args.hypothesis.strictEvaluation.overallScore : "pending"}`,
          `- Strict decision: ${args.hypothesis.strictEvaluation.decision ?? "pending"}`,
          `- Strict reason: ${args.hypothesis.strictEvaluation.reason ?? "pending"}`,
        ]
      : [
          "- Strict overall score: pending",
          "- Strict decision: pending",
          "- Strict reason: pending",
        ]),
    "",
  ];

  return lines.join("\n");
}

export function renderKnowledgeIndexMarkdown(args: {
  now: string;
  topic: string;
  runProfile: "fast" | "strict";
  topicFiles: string[];
  paperNotesCount: number;
  totalHypotheses: number;
  recentPapers: KnowledgePaperInput[];
  fullTextReadCount: number;
  notFullTextReadCount: number;
  qualityGate: {
    passed: boolean;
    fullTextCoveragePct: number;
    evidenceBindingRatePct: number;
    citationErrorRatePct: number;
    reasons: string[];
  };
  unreadCorePaperIds: string[];
  reflectionTasks: ReflectionTaskInput[];
  hypothesisGate: HypothesisGateSummary;
  lastStatus?: string;
}): string {
  const lines = [
    "# Knowledge Index",
    "",
    `- Updated: ${args.now}`,
    `- Topic: ${args.topic}`,
    `- Run profile: ${args.runProfile}`,
    `- Topic files: ${args.topicFiles.length}`,
    `- Paper notes: ${args.paperNotesCount}`,
    `- Total hypotheses: ${args.totalHypotheses}`,
    `- Last status: ${args.lastStatus ?? "unknown"}`,
    `- Recent papers (full-text read): ${args.fullTextReadCount}`,
    `- Recent papers (not full-text-read): ${args.notFullTextReadCount}`,
    `- Quality gate: ${args.qualityGate.passed ? "pass" : "fail"}`,
    `- Full-text coverage: ${args.qualityGate.fullTextCoveragePct}%`,
    `- Evidence binding rate: ${args.qualityGate.evidenceBindingRatePct}%`,
    `- Citation error rate: ${args.qualityGate.citationErrorRatePct}%`,
    `- Reflection tasks (executed): ${args.reflectionTasks.filter((task) => task.status === "executed").length}`,
    `- Hypothesis gate: accepted=${args.hypothesisGate.accepted}, rejected=${args.hypothesisGate.rejected}`,
    "",
    "## Quality Notes",
    ...(args.qualityGate.reasons.length > 0 ? args.qualityGate.reasons.map((reason) => `- ${reason}`) : ["- (none)"]),
    ...(args.unreadCorePaperIds.length > 0
      ? ["- unread_core_paper_ids: " + args.unreadCorePaperIds.join(", ")]
      : ["- unread_core_paper_ids: (none)"]),
    ...(args.hypothesisGate.rejectionReasons.length > 0
      ? args.hypothesisGate.rejectionReasons.map((reason) => `- hypothesis_gate_reason: ${reason}`)
      : ["- hypothesis_gate_reason: (none)"]),
    ...(args.reflectionTasks.length > 0
      ? ["- reflection_tasks: " + args.reflectionTasks.map((task) => `${task.trigger}:${task.status}`).join(", ")]
      : ["- reflection_tasks: (none)"]),
    "",
    "## Topics",
    ...(args.topicFiles.length > 0 ? args.topicFiles.map((file) => `- ${file}`) : ["- (none)"]),
    "",
    "## Recent Papers",
    ...(args.recentPapers.length > 0 ? args.recentPapers.slice(0, 10).flatMap(renderPaperBlock) : ["- (none)"]),
    "",
    "## Open Questions",
    "- Keep tracking high-signal NEW/BRIDGE changes and unresolved contradictions.",
    "",
  ];
  return lines.join("\n");
}

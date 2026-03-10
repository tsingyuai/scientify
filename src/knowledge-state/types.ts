export type KnowledgeChangeType = "NEW" | "CONFIRM" | "REVISE" | "BRIDGE";
export type RunProfile = "fast" | "strict";

export type TriggerState = {
  consecutiveNewReviseDays: number;
  bridgeCount7d: number;
  unreadCoreBacklog: number;
  lastUpdatedAtMs: number;
};

export type PaperEvidenceAnchorInput = {
  section?: string;
  locator?: string;
  claim: string;
  quote?: string;
};

export type KnowledgePaperInput = {
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
  evidenceAnchors?: PaperEvidenceAnchorInput[];
};

export type ExplorationTraceInput = {
  query: string;
  reason?: string;
  source?: string;
  candidates?: number;
  filteredTo?: number;
  filteredOutReasons?: string[];
  resultCount?: number;
};

export type ReflectionTaskInput = {
  id: string;
  trigger: "BRIDGE" | "TREND" | "CONTRADICTION" | "UNREAD_CORE";
  reason: string;
  query: string;
  priority: "high" | "medium" | "low";
  status: "planned" | "executed";
};

export type HypothesisGateSummary = {
  accepted: number;
  rejected: number;
  rejectionReasons: string[];
};

export type KnowledgeChangeInput = {
  type: KnowledgeChangeType;
  statement: string;
  evidenceIds?: string[];
  topic?: string;
};

export type KnowledgeUpdateInput = {
  topic: string;
  op: "append" | "revise" | "confirm" | "bridge";
  content: string;
  confidence?: "low" | "medium" | "high";
  evidenceIds?: string[];
};

export type KnowledgeHypothesisInput = {
  id?: string;
  statement: string;
  trigger: "GAP" | "BRIDGE" | "TREND" | "CONTRADICTION";
  dependencyPath?: string[];
  novelty?: number;
  feasibility?: number;
  impact?: number;
  evidenceIds?: string[];
  validationStatus?: "unchecked" | "supporting" | "conflicting" | "openreview_related" | "openreview_not_found";
  validationNotes?: string;
  validationEvidence?: string[];
};

export type KnowledgeRunLogInput = {
  model?: string;
  durationMs?: number;
  error?: string;
  degraded?: boolean;
  notes?: string;
  runProfile?: RunProfile;
  requiredCorePapers?: number;
  requiredFullTextCoveragePct?: number;
  tempFullTextDir?: string;
  tempFilesDownloaded?: number;
  tempCleanupStatus?: "done" | "partial" | "failed" | "not_needed";
  tempCleanupNote?: string;
  fullTextAttempted?: number;
  fullTextCompleted?: number;
};

export type KnowledgeStateInput = {
  corePapers?: KnowledgePaperInput[];
  explorationPapers?: KnowledgePaperInput[];
  explorationTrace?: ExplorationTraceInput[];
  knowledgeChanges?: KnowledgeChangeInput[];
  knowledgeUpdates?: KnowledgeUpdateInput[];
  hypotheses?: KnowledgeHypothesisInput[];
  runLog?: KnowledgeRunLogInput;
};

export type RecentHypothesisSummary = {
  id: string;
  statement: string;
  trigger: KnowledgeHypothesisInput["trigger"];
  createdAtMs: number;
  file: string;
};

export type RecentChangeStat = {
  day: string;
  runId: string;
  newCount: number;
  confirmCount: number;
  reviseCount: number;
  bridgeCount: number;
};

export type KnowledgeStateSummary = {
  projectId: string;
  streamKey: string;
  runProfile: RunProfile;
  totalRuns: number;
  totalHypotheses: number;
  knowledgeTopicsCount: number;
  paperNotesCount: number;
  triggerState: TriggerState;
  recentFullTextReadCount: number;
  recentNotFullTextReadCount: number;
  qualityGate: {
    passed: boolean;
    fullTextCoveragePct: number;
    evidenceBindingRatePct: number;
    citationErrorRatePct: number;
    reasons: string[];
  };
  unreadCorePaperIds: string[];
  recentPapers: KnowledgePaperInput[];
  lastRunAtMs?: number;
  lastStatus?: string;
  recentHypotheses: RecentHypothesisSummary[];
  recentChangeStats: RecentChangeStat[];
  lastExplorationTrace: ExplorationTraceInput[];
  lastReflectionTasks: ReflectionTaskInput[];
  hypothesisGate: HypothesisGateSummary;
};

export type CommitKnowledgeRunInput = {
  projectId?: string;
  scope: string;
  topic: string;
  topicKey: string;
  status: string;
  runId?: string;
  note?: string;
  papers?: Array<{ id?: string; title?: string; url?: string; score?: number; reason?: string }>;
  knowledgeState?: KnowledgeStateInput;
};

export type KnowledgeStreamState = {
  scope: string;
  topic: string;
  topicKey: string;
  projectId: string;
  lastRunProfile: RunProfile;
  totalRuns: number;
  totalHypotheses: number;
  knowledgeTopics: string[];
  paperNotes: string[];
  triggerState: TriggerState;
  recentFullTextReadCount: number;
  recentNotFullTextReadCount: number;
  lastQualityGate: {
    passed: boolean;
    fullTextCoveragePct: number;
    evidenceBindingRatePct: number;
    citationErrorRatePct: number;
    reasons: string[];
  };
  lastUnreadCorePaperIds: string[];
  recentPapers: KnowledgePaperInput[];
  lastRunAtMs?: number;
  lastStatus?: string;
  recentRunIds: string[];
  recentHypothesisIds: string[];
  recentHypotheses: RecentHypothesisSummary[];
  recentChangeStats: RecentChangeStat[];
  lastExplorationTrace: ExplorationTraceInput[];
  lastReflectionTasks: ReflectionTaskInput[];
  lastHypothesisGate: HypothesisGateSummary;
};

export type KnowledgeStateRoot = {
  version: 1;
  updatedAtMs: number;
  streams: Record<string, KnowledgeStreamState>;
};

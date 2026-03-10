import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { PluginCommandContext, PluginCommandResult } from "openclaw";

const WORKSPACE_ROOT = path.join(os.homedir(), ".openclaw", "workspace", "projects");

type StreamState = {
  lastRunAtMs?: number;
  lastStatus?: string;
  lastRunProfile?: "fast" | "strict";
  totalRuns?: number;
  totalHypotheses?: number;
  paperNotes?: string[];
  triggerState?: {
    consecutiveNewReviseDays?: number;
    bridgeCount7d?: number;
    unreadCoreBacklog?: number;
  };
  lastQualityGate?: {
    passed?: boolean;
    fullTextCoveragePct?: number;
    evidenceBindingRatePct?: number;
    citationErrorRatePct?: number;
    reasons?: string[];
  };
};

type KnowledgeStateRoot = {
  streams?: Record<string, StreamState>;
};

function getActiveProject(): string | null {
  const activePath = path.join(WORKSPACE_ROOT, ".active");
  try {
    return fs.readFileSync(activePath, "utf-8").trim();
  } catch {
    return null;
  }
}

function listProjects(): string[] {
  try {
    return fs
      .readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function readKnowledgeState(projectId: string): KnowledgeStateRoot | null {
  const file = path.join(WORKSPACE_ROOT, projectId, "knowledge_state", "state.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as KnowledgeStateRoot;
  } catch {
    return null;
  }
}

/**
 * /metabolism-status — compatibility alias of continuous research engine status.
 */
export function handleMetabolismStatus(ctx: PluginCommandContext): PluginCommandResult {
  const requested = (ctx.args ?? "").trim();
  const projectId = requested || getActiveProject() || listProjects()[0];
  if (!projectId) {
    return {
      text: "No project found. Use /research-subscribe with --project, or create a project under ~/.openclaw/workspace/projects/.",
    };
  }

  const data = readKnowledgeState(projectId);
  if (!data?.streams || Object.keys(data.streams).length === 0) {
    return {
      text:
        `**Continuous Research Engine Status — ${projectId}**\n\n` +
        "No knowledge_state runs yet. Trigger a research run first.\n\n" +
        "(Compatibility note: /metabolism-status is an alias view over knowledge_state.)",
    };
  }

  const streams = Object.values(data.streams);
  let totalRuns = 0;
  let totalHypotheses = 0;
  let totalPaperNotes = 0;
  let latest: StreamState | null = null;
  let latestTs = 0;

  for (const stream of streams) {
    totalRuns += Number.isFinite(stream.totalRuns) ? Math.max(0, Math.floor(stream.totalRuns!)) : 0;
    totalHypotheses += Number.isFinite(stream.totalHypotheses) ? Math.max(0, Math.floor(stream.totalHypotheses!)) : 0;
    totalPaperNotes += Array.isArray(stream.paperNotes) ? stream.paperNotes.length : 0;
    const ts = Number.isFinite(stream.lastRunAtMs) ? Math.floor(stream.lastRunAtMs!) : 0;
    if (ts >= latestTs) {
      latestTs = ts;
      latest = stream;
    }
  }

  const runProfile = latest?.lastRunProfile ?? "fast";
  const trigger = latest?.triggerState;
  const gate = latest?.lastQualityGate;

  let output = `**Continuous Research Engine Status — ${projectId}**\n\n`;
  output += `- Streams: ${streams.length}\n`;
  output += `- Total runs: ${totalRuns}\n`;
  output += `- Total hypotheses: ${totalHypotheses}\n`;
  output += `- Total paper notes: ${totalPaperNotes}\n`;
  output += `- Latest run profile: ${runProfile}\n`;
  output += `- Latest status: ${latest?.lastStatus ?? "(unknown)"}\n`;
  output += `- Latest run: ${latestTs > 0 ? new Date(latestTs).toISOString() : "(none)"}\n`;

  if (trigger) {
    output += `\n**Trigger State**\n`;
    output += `- Consecutive NEW/REVISE days: ${trigger.consecutiveNewReviseDays ?? 0}\n`;
    output += `- BRIDGE count (7d): ${trigger.bridgeCount7d ?? 0}\n`;
    output += `- Unread core backlog: ${trigger.unreadCoreBacklog ?? 0}\n`;
  }

  if (gate) {
    output += `\n**Quality Gate**\n`;
    output += `- Passed: ${gate.passed ? "yes" : "no"}\n`;
    output += `- Full-text coverage: ${gate.fullTextCoveragePct ?? 0}%\n`;
    output += `- Evidence binding: ${gate.evidenceBindingRatePct ?? 0}%\n`;
    output += `- Citation error: ${gate.citationErrorRatePct ?? 0}%\n`;
    if (Array.isArray(gate.reasons) && gate.reasons.length > 0) {
      output += `- Reasons: ${gate.reasons.join("; ")}\n`;
    }
  }

  output += "\n(Compatibility note: /metabolism-status is an alias view over knowledge_state.)";
  return { text: output };
}

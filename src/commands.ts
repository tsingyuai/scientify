import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { formatReleaseGateStatus, getReleaseGateNextStep, hasReleaseFacingArtifacts, readReleaseGateStatus } from "./release-gate.js";
import type { PluginCommandContext, PluginCommandResult } from "./types.js";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");

interface ResearchAgent {
  id: string;
  workspace: string;
}

export interface ProjectSnapshot {
  hasConfig: boolean;
  hasSurvey: boolean;
  hasSelection: boolean;
  hasPlan: boolean;
  hasDataValidation: boolean;
  hasBaseline: boolean;
  hasImplementationReport: boolean;
  latestReviewVerdict: "PASS" | "NEEDS_REVISION" | "NEEDS_ALGORITHM_REVIEW" | "BLOCKED" | "MISSING" | "UNKNOWN";
  hasExperiment: boolean;
}

export interface NextActionState {
  stage: string;
  command: string;
  expectedOutputs: string[];
  reason: string;
}

/**
 * List all research agents from openclaw.json.
 */
function listResearchAgents(): ResearchAgent[] {
  const configPath = path.join(OPENCLAW_HOME, "openclaw.json");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const agents = (config.agents as { list?: Array<{ id: string; workspace?: string }> })?.list ?? [];
    return agents
      .filter((a) => a.id.startsWith("research-"))
      .map((a) => ({
        id: a.id,
        workspace: (a.workspace ?? `~/.openclaw/workspace-${a.id}`).replace("~", os.homedir()),
      }));
  } catch {
    return [];
  }
}

export function countFiles(dirPath: string, filter?: (name: string) => boolean): number {
  try {
    const entries = fs.readdirSync(dirPath);
    return filter ? entries.filter(filter).length : entries.length;
  } catch {
    return 0;
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readLatestReviewVerdict(workspace: string): ProjectSnapshot["latestReviewVerdict"] {
  const iterationsDir = path.join(workspace, "iterations");
  if (!fileExists(iterationsDir)) return "MISSING";

  try {
    const files = fs.readdirSync(iterationsDir)
      .filter((f) => /^judge_v\d+\.md$/.test(f))
      .sort((a, b) => {
        const na = Number(a.match(/\d+/)?.[0] ?? "0");
        const nb = Number(b.match(/\d+/)?.[0] ?? "0");
        return nb - na;
      });

    const latest = files[0];
    if (!latest) return "MISSING";

    const content = fs.readFileSync(path.join(iterationsDir, latest), "utf-8");
    const verdictMatch = content.match(/##\s+Verdict:\s+([A-Z_]+)/);
    const verdict = verdictMatch?.[1] as ProjectSnapshot["latestReviewVerdict"] | undefined;
    return verdict ?? "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

export function buildProjectSnapshot(workspace: string): ProjectSnapshot {
  return {
    hasConfig: fileExists(path.join(workspace, "config.json")),
    hasSurvey: fileExists(path.join(workspace, "survey_res.md")),
    hasSelection: fileExists(path.join(workspace, "selection_res.md")),
    hasPlan: fileExists(path.join(workspace, "plan_res.md")),
    hasDataValidation: fileExists(path.join(workspace, "data_validation.md")),
    hasBaseline: fileExists(path.join(workspace, "baseline_res.md")),
    hasImplementationReport: fileExists(path.join(workspace, "ml_res.md")),
    latestReviewVerdict: readLatestReviewVerdict(workspace),
    hasExperiment: fileExists(path.join(workspace, "experiment_res.md")),
  };
}

export function inferNextAction(snapshot: ProjectSnapshot): NextActionState {
  if (!snapshot.hasConfig) {
    return {
      stage: "Bootstrap pending",
      command: "complete BOOTSTRAP configuration",
      expectedOutputs: ["config.json", "SOUL.md"],
      reason: "The project is missing its base configuration, so later survey, selection, and experiment steps do not yet share a stable direction.",
    };
  }

  if (!snapshot.hasSurvey) {
    return {
      stage: "Survey needed",
      command: "/research-survey",
      expectedOutputs: ["knowledge/", "survey_res.md"],
      reason: "There is no deep survey result yet, so route selection and implementation would be premature.",
    };
  }

  if (!snapshot.hasSelection && !snapshot.hasPlan) {
    return {
      stage: "Route selection",
      command: "/algorithm-selection",
      expectedOutputs: ["selection_res.md"],
      reason: "A survey exists, but the project has not yet narrowed candidate approaches into Chosen / Rejected / Fallback routes.",
    };
  }

  if (!snapshot.hasPlan) {
    return {
      stage: "Planning",
      command: "/research-plan",
      expectedOutputs: ["plan_res.md"],
      reason: "The project still needs a concrete Dataset / Model / Training / Testing plan before implementation.",
    };
  }

  if (!snapshot.hasDataValidation) {
    return {
      stage: "Dataset validation",
      command: "/dataset-validate",
      expectedOutputs: ["data_validation.md"],
      reason: "Data reality, splits, labels, and leakage risk should be reviewed separately before judging model quality.",
    };
  }

  if (!snapshot.hasBaseline) {
    return {
      stage: "Baseline setup",
      command: "/baseline-runner",
      expectedOutputs: ["baseline_res.md", "experiments/baselines/"],
      reason: "The project still lacks baseline results under a matched protocol, so headline comparisons would be too early.",
    };
  }

  if (!snapshot.hasImplementationReport) {
    return {
      stage: "Implementation",
      command: "/research-implement",
      expectedOutputs: ["project/", "ml_res.md"],
      reason: "The route, plan, data check, and baseline contract are already in place, so the next step is implementation plus 2-epoch validation.",
    };
  }

  if (snapshot.latestReviewVerdict !== "PASS") {
    return {
      stage: "Review",
      command: "/research-review",
      expectedOutputs: ["iterations/judge_v{N}.md"],
      reason: "Implementation exists, but review has not yet reached PASS, so model quality still needs a dedicated review pass.",
    };
  }

  if (!snapshot.hasExperiment) {
    return {
      stage: "Full experiment",
      command: "/research-experiment",
      expectedOutputs: ["experiment_res.md", "experiment_analysis/"],
      reason: "Implementation and review are ready, so the next step is full training, ablations, and supplementary experiments.",
    };
  }

  return {
    stage: "Experiment complete",
    command: "/write-review-paper",
    expectedOutputs: ["review/"],
    reason: "The core ML execution chain is complete, so the project can move into synthesis, survey writing, or outward-facing summaries.",
  };
}

export function formatArtifactPresence(snapshot: ProjectSnapshot): string {
  const items = [
    ["survey", snapshot.hasSurvey],
    ["selection", snapshot.hasSelection],
    ["plan", snapshot.hasPlan],
    ["data_validation", snapshot.hasDataValidation],
    ["baseline", snapshot.hasBaseline],
    ["implement", snapshot.hasImplementationReport],
    ["review", snapshot.latestReviewVerdict === "PASS"],
    ["experiment", snapshot.hasExperiment],
  ];

  return items.map(([label, ok]) => `${ok ? "yes" : "no"} ${label}`).join(" | ");
}

/**
 * /research-status - Show workspace status for all research agents
 */
export function handleResearchStatus(_ctx: PluginCommandContext): PluginCommandResult {
  const agents = listResearchAgents();

  if (agents.length === 0) {
    return { text: "No research projects found. Use `openclaw research init <id>` to create one." };
  }

  let output = "**Research Projects**\n\n";

  for (const agent of agents) {
    const projectId = agent.id.replace("research-", "");
    const w = agent.workspace;

    const papersCount = countFiles(path.join(w, "papers"), (f) => f.endsWith(".tex") || f.endsWith(".pdf"));
    const ideasCount = countFiles(path.join(w, "ideas"), (f) => f.endsWith(".md"));
    const topicCount = countFiles(path.join(w, "knowledge"), (f) => f.startsWith("topic-"));
    const hypothesisCount = countFiles(path.join(w, "ideas"), (f) => f.startsWith("hyp-"));
    const snapshot = buildProjectSnapshot(w);
    const next = inferNextAction(snapshot);

    let currentDay = 0;
    try {
      const config = JSON.parse(fs.readFileSync(path.join(w, "config.json"), "utf-8"));
      currentDay = config.currentDay ?? 0;
    } catch { /* not yet bootstrapped */ }

    output += `**${projectId}** (Day ${currentDay})\n`;
    output += `  Workspace: \`${w}\`\n`;
    output += `  Topics: ${topicCount} | Hypotheses: ${hypothesisCount} | Papers: ${papersCount} | Ideas: ${ideasCount}\n`;
    output += `  Stage: ${next.stage}\n`;
    output += `  Artifacts: ${formatArtifactPresence(snapshot)}\n`;
    output += `  Next: \`${next.command}\`\n`;
    output += `  Why: ${next.reason}\n`;
    output += `  Expected: ${next.expectedOutputs.map((p) => `\`${p}\``).join(", ")}\n`;
    const gateStatus = readReleaseGateStatus(w);
    if (hasReleaseFacingArtifacts(w) || gateStatus.state !== "missing") {
      output += `  Release Gate: ${formatReleaseGateStatus(gateStatus)}\n`;
      if (gateStatus.state === "stale" && gateStatus.staleReasons.length > 0) {
        output += `  Gate Detail: ${gateStatus.staleReasons[0]}\n`;
      }
      const nextStep = getReleaseGateNextStep(w, gateStatus);
      if (nextStep) {
        output += `  Release Next: ${nextStep}\n`;
      }
    }
    output += `\n`;
  }

  return { text: output };
}

/**
 * /papers - List downloaded papers in a research agent workspace
 */
export function handlePapers(ctx: PluginCommandContext): PluginCommandResult {
  const agent = resolveAgent(ctx.args?.trim());
  if (!agent) {
    return { text: "No research project found. Use `openclaw research init <id>` to create one." };
  }

  const papersDir = path.join(agent.workspace, "papers");
  if (!fs.existsSync(papersDir)) {
    return { text: `No papers directory in project ${agent.id}.` };
  }

  const downloadsDir = path.join(papersDir, "_downloads");
  let output = `**Papers — ${agent.id.replace("research-", "")}**\n\n`;
  let hasItems = false;

  try {
    const entries = fs.readdirSync(downloadsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const texCount = fs.readdirSync(path.join(downloadsDir, entry.name)).filter((f) => f.endsWith(".tex")).length;
        output += `  [tex] \`${entry.name}\` (${texCount} files)\n`;
        hasItems = true;
      } else if (entry.name.endsWith(".pdf")) {
        output += `  [pdf] \`${entry.name.replace(".pdf", "")}\`\n`;
        hasItems = true;
      }
    }
  } catch { /* empty */ }

  if (!hasItems) output += "_No papers downloaded yet._";
  return { text: output };
}

/**
 * /ideas - List generated ideas in a research agent workspace
 */
export function handleIdeas(ctx: PluginCommandContext): PluginCommandResult {
  const agent = resolveAgent(ctx.args?.trim());
  if (!agent) {
    return { text: "No research project found. Use `openclaw research init <id>` to create one." };
  }

  const ideasDir = path.join(agent.workspace, "ideas");
  if (!fs.existsSync(ideasDir)) {
    return { text: `No ideas in project ${agent.id.replace("research-", "")}.` };
  }

  const files = fs.readdirSync(ideasDir).filter((f) => f.endsWith(".md"));
  let output = `**Ideas — ${agent.id.replace("research-", "")}**\n\n`;

  if (files.length === 0) {
    output += "_No ideas generated yet._";
  } else {
    for (const file of files) {
      const content = fs.readFileSync(path.join(ideasDir, file), "utf-8");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : file;
      const isSelected = file === "selected_idea.md";
      const marker = isSelected ? "* " : "  ";
      output += `${marker}\`${file}\` ${title}\n`;
    }
  }

  return { text: output };
}

/**
 * /projects - List all research projects (alias for /research-status)
 */
export function handleProjects(_ctx: PluginCommandContext): PluginCommandResult {
  return handleResearchStatus(_ctx);
}

/**
 * /project-switch - No longer needed (each agent has its own workspace)
 */
export function handleProjectSwitch(_ctx: PluginCommandContext): PluginCommandResult {
  return { text: "Project switching is no longer needed. Each research agent has its own workspace. Use `openclaw research list` to see all projects." };
}

/**
 * /project-delete - Delete via CLI instead
 */
export function handleProjectDelete(_ctx: PluginCommandContext): PluginCommandResult {
  return { text: "Use `openclaw research delete <id>` to delete a research project." };
}

/**
 * Resolve which research agent to use.
 * If an arg is given, match by project id; otherwise use the first (or only) agent.
 */
function resolveAgent(arg?: string): ResearchAgent | null {
  const agents = listResearchAgents();
  if (agents.length === 0) return null;

  if (arg) {
    const agentId = arg.startsWith("research-") ? arg : `research-${arg}`;
    return agents.find((a) => a.id === agentId) ?? null;
  }

  return agents[0] ?? null;
}

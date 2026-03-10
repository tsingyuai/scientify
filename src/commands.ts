import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { PluginCommandContext, PluginCommandResult } from "openclaw";

const WORKSPACE_ROOT = path.join(os.homedir(), ".openclaw", "workspace", "projects");

interface ProjectMeta {
  id: string;
  name: string;
  created: string;
  topics?: string[];
}

function getActiveProject(): string | null {
  const activePath = path.join(WORKSPACE_ROOT, ".active");
  try {
    return fs.readFileSync(activePath, "utf-8").trim();
  } catch {
    return null;
  }
}

function getProjectMeta(projectId: string): ProjectMeta | null {
  const metaPath = path.join(WORKSPACE_ROOT, projectId, "project.json");
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

function listProjects(): string[] {
  try {
    return fs
      .readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {
    // ignore
  }
  return size;
}

function countFiles(dirPath: string, pattern?: RegExp): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countFiles(fullPath, pattern);
      } else if (!pattern || pattern.test(entry.name)) {
        count++;
      }
    }
  } catch {
    // ignore
  }
  return count;
}

function getKnowledgeStateSummary(projectId: string): {
  totalRuns: number;
  totalHypotheses: number;
  totalPaperNotes: number;
  recentFullTextReadCount: number;
  recentNotFullTextReadCount: number;
  lastQualityGatePassed?: boolean;
  lastQualityGateReasons?: string[];
  lastChangeStat?: {
    newCount: number;
    confirmCount: number;
    reviseCount: number;
    bridgeCount: number;
  };
  lastRunAtMs?: number;
  lastStatus?: string;
  streamCount: number;
} | null {
  const file = path.join(WORKSPACE_ROOT, projectId, "knowledge_state", "state.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as {
      streams?: Record<
        string,
        {
          totalRuns?: number;
          totalHypotheses?: number;
          paperNotes?: string[];
          recentFullTextReadCount?: number;
          recentNotFullTextReadCount?: number;
          lastQualityGate?: {
            passed?: boolean;
            reasons?: string[];
          };
          recentChangeStats?: Array<{
            newCount?: number;
            confirmCount?: number;
            reviseCount?: number;
            bridgeCount?: number;
          }>;
          lastRunAtMs?: number;
          lastStatus?: string;
        }
      >;
    };
    const streams = parsed.streams ?? {};
    const streamEntries = Object.values(streams);
    let totalRuns = 0;
    let totalHypotheses = 0;
    let totalPaperNotes = 0;
    let recentFullTextReadCount = 0;
    let recentNotFullTextReadCount = 0;
    let lastRunAtMs = 0;
    let lastStatus: string | undefined;
    let lastQualityGatePassed: boolean | undefined;
    let lastQualityGateReasons: string[] | undefined;
    let lastChangeStat:
      | {
          newCount: number;
          confirmCount: number;
          reviseCount: number;
          bridgeCount: number;
        }
      | undefined;
    for (const stream of streamEntries) {
      totalRuns += Number.isFinite(stream.totalRuns) ? Math.max(0, Math.floor(stream.totalRuns!)) : 0;
      totalHypotheses += Number.isFinite(stream.totalHypotheses)
        ? Math.max(0, Math.floor(stream.totalHypotheses!))
        : 0;
      totalPaperNotes += Array.isArray(stream.paperNotes) ? stream.paperNotes.length : 0;
      recentFullTextReadCount += Number.isFinite(stream.recentFullTextReadCount)
        ? Math.max(0, Math.floor(stream.recentFullTextReadCount!))
        : 0;
      recentNotFullTextReadCount += Number.isFinite(stream.recentNotFullTextReadCount)
        ? Math.max(0, Math.floor(stream.recentNotFullTextReadCount!))
        : 0;
      const runAt = Number.isFinite(stream.lastRunAtMs) ? Math.floor(stream.lastRunAtMs!) : 0;
      if (runAt >= lastRunAtMs) {
        lastRunAtMs = runAt;
        lastStatus = stream.lastStatus;
        if (stream.lastQualityGate && typeof stream.lastQualityGate === "object") {
          lastQualityGatePassed = stream.lastQualityGate.passed === true;
          if (Array.isArray(stream.lastQualityGate.reasons)) {
            lastQualityGateReasons = stream.lastQualityGate.reasons
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
              .slice(0, 5);
          } else {
            lastQualityGateReasons = undefined;
          }
        } else {
          lastQualityGatePassed = undefined;
          lastQualityGateReasons = undefined;
        }
        const firstChange = Array.isArray(stream.recentChangeStats) ? stream.recentChangeStats[0] : undefined;
        if (firstChange && typeof firstChange === "object") {
          lastChangeStat = {
            newCount:
              typeof firstChange.newCount === "number" && Number.isFinite(firstChange.newCount)
                ? Math.max(0, Math.floor(firstChange.newCount))
                : 0,
            confirmCount:
              typeof firstChange.confirmCount === "number" && Number.isFinite(firstChange.confirmCount)
                ? Math.max(0, Math.floor(firstChange.confirmCount))
                : 0,
            reviseCount:
              typeof firstChange.reviseCount === "number" && Number.isFinite(firstChange.reviseCount)
                ? Math.max(0, Math.floor(firstChange.reviseCount))
                : 0,
            bridgeCount:
              typeof firstChange.bridgeCount === "number" && Number.isFinite(firstChange.bridgeCount)
                ? Math.max(0, Math.floor(firstChange.bridgeCount))
                : 0,
          };
        } else {
          lastChangeStat = undefined;
        }
      }
    }
    return {
      totalRuns,
      totalHypotheses,
      totalPaperNotes,
      recentFullTextReadCount,
      recentNotFullTextReadCount,
      ...(typeof lastQualityGatePassed === "boolean" ? { lastQualityGatePassed } : {}),
      ...(lastQualityGateReasons && lastQualityGateReasons.length > 0 ? { lastQualityGateReasons } : {}),
      ...(lastChangeStat ? { lastChangeStat } : {}),
      ...(lastRunAtMs > 0 ? { lastRunAtMs } : {}),
      ...(lastStatus ? { lastStatus } : {}),
      streamCount: streamEntries.length,
    };
  } catch {
    return null;
  }
}

/**
 * /research-status - Show workspace status
 */
export function handleResearchStatus(_ctx: PluginCommandContext): PluginCommandResult {
  const activeProject = getActiveProject();
  const projects = listProjects();

  let output = "📁 **Research Workspace Status**\n\n";
  output += `Root: \`${WORKSPACE_ROOT}\`\n`;
  output += `Active: ${activeProject ? `**${activeProject}**` : "(none)"}\n\n`;

  if (activeProject) {
    const knowledgeSummary = getKnowledgeStateSummary(activeProject);
    if (knowledgeSummary) {
      output += "**Knowledge State (active project):**\n";
      output += `- streams: ${knowledgeSummary.streamCount}\n`;
      output += `- total runs: ${knowledgeSummary.totalRuns}\n`;
      output += `- total hypotheses: ${knowledgeSummary.totalHypotheses}\n`;
      output += `- total paper notes: ${knowledgeSummary.totalPaperNotes}\n`;
      output += `- recent full-text-read papers: ${knowledgeSummary.recentFullTextReadCount}\n`;
      output += `- recent not-full-text-read papers: ${knowledgeSummary.recentNotFullTextReadCount}\n`;
      output += `- last status: ${knowledgeSummary.lastStatus ?? "(unknown)"}\n`;
      if (typeof knowledgeSummary.lastQualityGatePassed === "boolean") {
        output += `- quality gate: ${knowledgeSummary.lastQualityGatePassed ? "passed" : "failed"}\n`;
      }
      if (knowledgeSummary.lastQualityGateReasons && knowledgeSummary.lastQualityGateReasons.length > 0) {
        output += `- quality reasons: ${knowledgeSummary.lastQualityGateReasons.join("; ")}\n`;
      }
      if (knowledgeSummary.lastChangeStat) {
        output +=
          `- last change stats (NEW/CONFIRM/REVISE/BRIDGE): ` +
          `${knowledgeSummary.lastChangeStat.newCount}/${knowledgeSummary.lastChangeStat.confirmCount}/` +
          `${knowledgeSummary.lastChangeStat.reviseCount}/${knowledgeSummary.lastChangeStat.bridgeCount}\n`;
      }
      output += `- last run: ${
        knowledgeSummary.lastRunAtMs ? new Date(knowledgeSummary.lastRunAtMs).toISOString() : "(none)"
      }\n\n`;
    }
  }

  if (projects.length === 0) {
    output += "_No projects found. Use /idea-generation to create one._";
  } else {
    output += "**Projects:**\n";
    for (const proj of projects) {
      const isActive = proj === activeProject;
      const papersCount = countFiles(path.join(WORKSPACE_ROOT, proj, "papers"));
      const ideasCount = countFiles(path.join(WORKSPACE_ROOT, proj, "ideas"), /\.md$/);
      let reposCount = 0;
      try {
        const reposDir = path.join(WORKSPACE_ROOT, proj, "repos");
        if (fs.existsSync(reposDir)) {
          reposCount = fs
            .readdirSync(reposDir, { withFileTypes: true })
            .filter((d) => d.isDirectory()).length;
        }
      } catch {
        // ignore
      }

      const marker = isActive ? "● " : "  ";
      output += `${marker}\`${proj}\` (papers: ${papersCount}, ideas: ${ideasCount}, repos: ${reposCount})\n`;
    }
  }

  return { text: output };
}

/**
 * /papers - List downloaded papers
 */
export function handlePapers(ctx: PluginCommandContext): PluginCommandResult {
  const projectId = ctx.args?.trim() || getActiveProject();
  if (!projectId) {
    return { text: "❌ No active project. Use: `/papers <project-id>`" };
  }

  const papersDir = path.join(WORKSPACE_ROOT, projectId, "papers");
  if (!fs.existsSync(papersDir)) {
    return { text: `📄 **Papers in ${projectId}**\n\n_No papers directory found._` };
  }

  let output = `📄 **Papers in ${projectId}**\n\n`;
  const entries = fs.readdirSync(papersDir, { withFileTypes: true });
  let hasItems = false;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const paperDir = path.join(papersDir, entry.name);
      const texFiles = fs.readdirSync(paperDir).filter((f) => f.endsWith(".tex"));
      output += `  [tex] \`${entry.name}\` (${texFiles.length} files)\n`;
      hasItems = true;
    } else if (entry.name.endsWith(".pdf")) {
      const size = formatSize(fs.statSync(path.join(papersDir, entry.name)).size);
      output += `  [pdf] \`${entry.name.replace(".pdf", "")}\` (${size})\n`;
      hasItems = true;
    }
  }

  if (!hasItems) {
    output += "_No papers downloaded yet._";
  }

  return { text: output };
}

/**
 * /ideas - List generated ideas
 */
export function handleIdeas(ctx: PluginCommandContext): PluginCommandResult {
  const projectId = ctx.args?.trim() || getActiveProject();
  if (!projectId) {
    return { text: "❌ No active project. Use: `/ideas <project-id>`" };
  }

  const ideasDir = path.join(WORKSPACE_ROOT, projectId, "ideas");
  if (!fs.existsSync(ideasDir)) {
    return { text: `💡 **Ideas in ${projectId}**\n\n_No ideas directory found._` };
  }

  let output = `💡 **Ideas in ${projectId}**\n\n`;
  const files = fs.readdirSync(ideasDir).filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    output += "_No ideas generated yet._";
  } else {
    for (const file of files) {
      const content = fs.readFileSync(path.join(ideasDir, file), "utf-8");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : file;
      const isSelected = file === "selected_idea.md";
      const marker = isSelected ? "⭐ " : "   ";
      output += `${marker}\`${file.padEnd(22)}\` ${title}\n`;
    }
  }

  return { text: output };
}

/**
 * /projects - List all research projects
 */
export function handleProjects(_ctx: PluginCommandContext): PluginCommandResult {
  const activeProject = getActiveProject();
  const projects = listProjects();

  let output = "📂 **Research Projects**\n\n";

  if (projects.length === 0) {
    output += "_No projects found._";
  } else {
    for (const proj of projects) {
      const isActive = proj === activeProject;
      const meta = getProjectMeta(proj);
      const marker = isActive ? "● " : "  ";
      output += `${marker}**${proj}**\n`;
      if (meta?.name) output += `    name: ${meta.name}\n`;
      if (meta?.created) output += `    created: ${meta.created}\n`;
      if (meta?.topics?.length) output += `    topics: ${meta.topics.join(", ")}\n`;
    }
  }

  return { text: output };
}

/**
 * /project-switch <project-id> - Switch to a different project
 */
export function handleProjectSwitch(ctx: PluginCommandContext): PluginCommandResult {
  const projectId = ctx.args?.trim();
  if (!projectId) {
    return { text: "❌ Usage: `/project-switch <project-id>`" };
  }

  const projectPath = path.join(WORKSPACE_ROOT, projectId);
  if (!fs.existsSync(projectPath)) {
    return { text: `❌ Project '${projectId}' not found.` };
  }

  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE_ROOT, ".active"), projectId);
  return { text: `✓ Switched to project '**${projectId}**'` };
}

/**
 * /project-delete <project-id> - Delete a research project
 */
export function handleProjectDelete(ctx: PluginCommandContext): PluginCommandResult {
  const args = ctx.args?.trim() || "";
  const hasForce = args.includes("--force");
  // Extract project ID by removing the --force flag
  const projectId = args.replace(/--force/g, "").trim();

  if (!projectId) {
    return { text: "❌ Usage: `/project-delete <project-id>`" };
  }

  const projectPath = path.join(WORKSPACE_ROOT, projectId);
  if (!fs.existsSync(projectPath)) {
    return { text: `❌ Project '${projectId}' not found.` };
  }

  const size = formatSize(getDirSize(projectPath));
  const papersCount = countFiles(path.join(projectPath, "papers"));
  const ideasCount = countFiles(path.join(projectPath, "ideas"), /\.md$/);

  // For safety, we'll return info and ask for confirmation
  // Note: Plugin commands don't support interactive confirmation,
  // so we provide a force flag via the args
  if (!hasForce) {
    return {
      text:
        `⚠️ **About to delete:**\n\n` +
        `- Project: \`${projectId}\`\n` +
        `- Papers: ${papersCount}\n` +
        `- Ideas: ${ideasCount}\n` +
        `- Size: ${size}\n\n` +
        `To confirm, use: \`/project-delete ${projectId} --force\``,
    };
  }

  // Clear active if this is the active project
  const activeProject = getActiveProject();
  if (activeProject === projectId) {
    try {
      fs.unlinkSync(path.join(WORKSPACE_ROOT, ".active"));
    } catch {
      // ignore
    }
  }

  // Delete the project directory
  fs.rmSync(projectPath, { recursive: true, force: true });
  return { text: `✓ Deleted project '**${projectId}**'` };
}

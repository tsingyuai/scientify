import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { PluginCommandContext, PluginCommandResult } from "./types.js";
import { ensureWithinDirectory } from "./utils/security.js";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");

interface ResearchAgent {
  id: string;
  workspace: string;
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
      .map((a) => {
        const workspace = (a.workspace ?? `~/.openclaw/workspace-${a.id}`).replace("~", os.homedir());
        ensureWithinDirectory(workspace, OPENCLAW_HOME);
        return { id: a.id, workspace };
      });
  } catch {
    return [];
  }
}

function countFiles(dirPath: string, filter?: (name: string) => boolean): number {
  try {
    const entries = fs.readdirSync(dirPath);
    return filter ? entries.filter(filter).length : entries.length;
  } catch {
    return 0;
  }
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

    let currentDay = 0;
    try {
      const config = JSON.parse(fs.readFileSync(path.join(w, "config.json"), "utf-8"));
      currentDay = config.currentDay ?? 0;
    } catch { /* not yet bootstrapped */ }

    output += `**${projectId}** (Day ${currentDay})\n`;
    output += `  Workspace: \`${w}\`\n`;
    output += `  Topics: ${topicCount} | Hypotheses: ${hypothesisCount} | Papers: ${papersCount} | Ideas: ${ideasCount}\n\n`;
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

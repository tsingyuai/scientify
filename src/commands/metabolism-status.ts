import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { PluginCommandContext, PluginCommandResult } from "openclaw";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");

interface MetabolismConfig {
  projectId: string;
  currentDay: number;
  heartbeat?: { enabled?: boolean };
}

/**
 * Find the research project workspace for the current agent context.
 * In a Feishu group bound to a project agent, the workspace is at
 * ~/.openclaw/workspace-research-{id}/
 */
function findProjectWorkspace(): { workspace: string; projectId: string } | null {
  // Read openclaw.json to find research agents
  const configPath = path.join(OPENCLAW_HOME, "openclaw.json");
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }

  const agents = (config.agents as { list?: Array<{ id: string; workspace?: string }> })?.list ?? [];
  const researchAgents = agents.filter((a) => a.id.startsWith("research-"));

  // Try each research agent workspace to find one with metabolism/config.json
  for (const agent of researchAgents) {
    const workspace = (agent.workspace ?? `~/.openclaw/workspace-${agent.id}`).replace("~", os.homedir());
    const metabolismConfig = path.join(workspace, "metabolism", "config.json");
    if (fs.existsSync(metabolismConfig)) {
      return { workspace, projectId: agent.id.replace("research-", "") };
    }
  }

  // If only one research agent, use it even without config.json (pre-bootstrap)
  if (researchAgents.length === 1) {
    const agent = researchAgents[0];
    const workspace = (agent.workspace ?? `~/.openclaw/workspace-${agent.id}`).replace("~", os.homedir());
    return { workspace, projectId: agent.id.replace("research-", "") };
  }

  return null;
}

function readMetabolismConfig(workspace: string): MetabolismConfig | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(workspace, "metabolism", "config.json"), "utf-8"));
  } catch {
    return null;
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

function readRecentDiffs(workspace: string, count: number): string[] {
  const diffsDir = path.join(workspace, "metabolism", "diffs");
  try {
    return fs
      .readdirSync(diffsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .slice(-count);
  } catch {
    return [];
  }
}

/**
 * /metabolism-status — Show knowledge metabolism status
 */
export function handleMetabolismStatus(_ctx: PluginCommandContext): PluginCommandResult {
  const project = findProjectWorkspace();
  if (!project) {
    return { text: "No research project found. Use `openclaw research init <id>` to create one." };
  }

  const { workspace, projectId } = project;
  const config = readMetabolismConfig(workspace);

  const topicCount = countFiles(
    path.join(workspace, "metabolism", "knowledge"),
    (f) => f.startsWith("topic-"),
  );
  const hypothesisCount = countFiles(
    path.join(workspace, "metabolism", "hypotheses"),
    (f) => f.endsWith(".md"),
  );
  const recentDiffs = readRecentDiffs(workspace, 3);

  let output = `**Metabolism Status — ${projectId}**\n\n`;

  if (!config) {
    output += "Status: Pending BOOTSTRAP configuration\n";
    output += "Send a message in this group to start the configuration flow.\n";
    return { text: output };
  }

  const heartbeatStatus = config.heartbeat?.enabled !== false ? "active" : "paused";

  output += `Day: ${config.currentDay}\n`;
  output += `Topics: ${topicCount}\n`;
  output += `Hypotheses: ${hypothesisCount}\n`;
  output += `Heartbeat: ${heartbeatStatus}\n`;

  if (recentDiffs.length > 0) {
    output += `\nRecent diffs:\n`;
    for (const diff of recentDiffs) {
      output += `  ${diff}\n`;
    }
  }

  return { text: output };
}

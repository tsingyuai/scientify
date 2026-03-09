import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { renderBootstrapMd, renderSoulMd, renderAgentsMd } from "../templates/bootstrap.js";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");
const OPENCLAW_CONFIG = path.join(OPENCLAW_HOME, "openclaw.json");
const CRON_JOBS_PATH = path.join(OPENCLAW_HOME, "cron", "jobs.json");

interface ResearchProject {
  id: string;
  agentId: string;
  workspace: string;
  currentDay: number;
  createdAt: string;
}

interface CronJob {
  name: string;
  jobId: string;
  schedule: { kind: "cron"; expr: string; tz: string };
  sessionTarget: "isolated";
  payload: { kind: "agentTurn"; agentId: string; message: string };
  delivery: { mode: "announce" };
  enabled: boolean;
}

interface CronJobsFile {
  version: number;
  jobs: CronJob[];
}

function readOpenClawConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, "utf-8"));
  } catch {
    return {};
  }
}

function writeOpenClawConfig(config: Record<string, unknown>): void {
  fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + "\n");
}

function readCronJobs(): CronJobsFile {
  try {
    return JSON.parse(fs.readFileSync(CRON_JOBS_PATH, "utf-8"));
  } catch {
    return { version: 1, jobs: [] };
  }
}

function writeCronJobs(data: CronJobsFile): void {
  const dir = path.dirname(CRON_JOBS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CRON_JOBS_PATH, JSON.stringify(data, null, 2) + "\n");
}

function addCronJob(agentId: string): void {
  const data = readCronJobs();
  const jobId = `${agentId}-metabolism`;

  // Avoid duplicates
  if (data.jobs.some((j) => j.jobId === jobId)) return;

  data.jobs.push({
    name: `${agentId} daily metabolism`,
    jobId,
    schedule: { kind: "cron", expr: "0 6 * * *", tz: "Asia/Shanghai" },
    sessionTarget: "isolated",
    payload: {
      kind: "agentTurn",
      agentId,
      message: "执行每日知识新陈代谢。阅读 AGENTS.md 了解工作流，然后使用 /metabolism 技能完成今日代谢。",
    },
    delivery: { mode: "announce" },
    enabled: true,
  });

  writeCronJobs(data);
}

function removeCronJob(agentId: string): void {
  const data = readCronJobs();
  const jobId = `${agentId}-metabolism`;
  const before = data.jobs.length;
  data.jobs = data.jobs.filter((j) => j.jobId !== jobId);
  if (data.jobs.length < before) {
    writeCronJobs(data);
  }
}

function findPluginSkillsDir(entryDir: string): string {
  // Walk up to find openclaw.plugin.json
  let dir = entryDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, "openclaw.plugin.json"))) {
      return path.join(dir, "skills");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(entryDir, "skills");
}

function listResearchProjects(): ResearchProject[] {
  const config = readOpenClawConfig();
  const agents = (config.agents as { list?: Array<{ id: string; workspace?: string }> })?.list ?? [];
  const projects: ResearchProject[] = [];

  for (const agent of agents) {
    if (!agent.id.startsWith("research-")) continue;

    const projectId = agent.id.replace("research-", "");
    const workspace = agent.workspace
      ? agent.workspace.replace("~", os.homedir())
      : path.join(OPENCLAW_HOME, `workspace-${agent.id}`);

    let currentDay = 0;
    let createdAt = "";
    const configPath = path.join(workspace, "metabolism", "config.json");
    try {
      const mc = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      currentDay = mc.currentDay ?? 0;
      createdAt = mc.createdAt ?? "";
    } catch {
      // config not yet created (pre-bootstrap)
    }

    projects.push({
      id: projectId,
      agentId: agent.id,
      workspace,
      currentDay,
      createdAt,
    });
  }

  return projects;
}

function initProject(id: string, pluginSkillsDir: string): void {
  const agentId = `research-${id}`;
  const workspace = path.join(OPENCLAW_HOME, `workspace-${agentId}`);

  // Check if workspace already exists
  if (fs.existsSync(workspace)) {
    console.error(`Error: workspace already exists at ${workspace}`);
    process.exit(1);
  }

  // 1. Create workspace directory structure
  const dirs = [
    workspace,
    path.join(workspace, "metabolism"),
    path.join(workspace, "metabolism", "knowledge"),
    path.join(workspace, "metabolism", "diffs"),
    path.join(workspace, "metabolism", "hypotheses"),
    path.join(workspace, "metabolism", "log"),
    path.join(workspace, "skills", "metabolism"),
    path.join(workspace, "survey"),
    path.join(workspace, "papers"),
    path.join(workspace, "ideas"),
    path.join(workspace, "experiments"),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 2. Write bootstrap files
  fs.writeFileSync(path.join(workspace, "BOOTSTRAP.md"), renderBootstrapMd(id));
  fs.writeFileSync(path.join(workspace, "SOUL.md"), renderSoulMd(id));
  fs.writeFileSync(path.join(workspace, "AGENTS.md"), renderAgentsMd());

  // 3. Copy metabolism SKILL.md from plugin bundled skills
  const srcSkill = path.join(pluginSkillsDir, "metabolism", "SKILL.md");
  const dstSkill = path.join(workspace, "skills", "metabolism", "SKILL.md");
  if (fs.existsSync(srcSkill)) {
    fs.copyFileSync(srcSkill, dstSkill);
  } else {
    console.warn(`Warning: metabolism SKILL.md not found at ${srcSkill}`);
  }

  // 4. Modify openclaw.json
  const config = readOpenClawConfig();

  // Add agent to agents.list
  if (!config.agents) config.agents = {};
  const agents = config.agents as { list?: Array<{ id: string; workspace: string }> };
  if (!agents.list) agents.list = [];

  // Check for duplicate
  if (agents.list.some((a) => a.id === agentId)) {
    console.error(`Error: agent '${agentId}' already exists in openclaw.json`);
    process.exit(1);
  }

  agents.list.push({
    id: agentId,
    workspace: `~/.openclaw/workspace-${agentId}`,
  });

  writeOpenClawConfig(config);

  // 5. Register daily metabolism cron job
  addCronJob(agentId);

  console.log(`\nResearch project '${id}' created successfully.\n`);
  console.log(`  Agent ID:  ${agentId}`);
  console.log(`  Workspace: ${workspace}`);
  console.log(`  Cron:      daily metabolism at 06:00 (Asia/Shanghai)\n`);
  console.log("Next steps:");
  console.log("  1. Restart Gateway to load the new agent");
  console.log("  2. In Gateway web UI, create a Feishu group binding for this agent");
  console.log("  3. Send a message in the Feishu group to start the BOOTSTRAP configuration");
}

function showStatus(id: string): void {
  const projects = listResearchProjects();
  const project = projects.find((p) => p.id === id);
  if (!project) {
    console.error(`Error: research project '${id}' not found`);
    process.exit(1);
  }

  const knowledgeDir = path.join(project.workspace, "metabolism", "knowledge");
  const hypothesesDir = path.join(project.workspace, "metabolism", "hypotheses");
  const diffsDir = path.join(project.workspace, "metabolism", "diffs");

  let topicCount = 0;
  let hypothesisCount = 0;
  let latestDiffs: string[] = [];

  try {
    topicCount = fs.readdirSync(knowledgeDir).filter((f) => f.startsWith("topic-")).length;
  } catch { /* empty */ }
  try {
    hypothesisCount = fs.readdirSync(hypothesesDir).filter((f) => f.endsWith(".md")).length;
  } catch { /* empty */ }
  try {
    latestDiffs = fs
      .readdirSync(diffsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .slice(-3);
  } catch { /* empty */ }

  console.log(`\nResearch Project: ${id}`);
  console.log(`  Agent:      ${project.agentId}`);
  console.log(`  Workspace:  ${project.workspace}`);
  console.log(`  Day:        ${project.currentDay}`);
  console.log(`  Topics:     ${topicCount}`);
  console.log(`  Hypotheses: ${hypothesisCount}`);
  if (latestDiffs.length > 0) {
    console.log(`  Recent diffs: ${latestDiffs.join(", ")}`);
  }
  if (project.createdAt) {
    console.log(`  Created:    ${project.createdAt}`);
  }
}

function deleteProject(id: string): void {
  const agentId = `research-${id}`;
  const workspace = path.join(OPENCLAW_HOME, `workspace-${agentId}`);

  // Remove workspace
  if (fs.existsSync(workspace)) {
    fs.rmSync(workspace, { recursive: true, force: true });
    console.log(`Deleted workspace: ${workspace}`);
  }

  // Remove from openclaw.json
  const config = readOpenClawConfig();

  const agents = config.agents as { list?: Array<{ id: string }> } | undefined;
  if (agents?.list) {
    agents.list = agents.list.filter((a) => a.id !== agentId);
  }

  // Remove cron job
  removeCronJob(agentId);

  writeOpenClawConfig(config);

  console.log(`Removed agent '${agentId}' from openclaw.json`);
  console.log(`\nNote: If you created a Feishu group binding, remove it manually in the Gateway web UI.`);
}

/**
 * Register the `openclaw research` CLI command.
 */
export function registerResearchCli(
  api: { registerCli: (registrar: unknown, opts?: { commands?: string[] }) => void; source: string },
) {
  const entryDir = path.dirname(api.source);

  api.registerCli(
    ({ program }: { program: { command: (name: string) => unknown } }) => {
      const cmd = program.command("research") as {
        description: (desc: string) => unknown;
        command: (name: string) => {
          description: (desc: string) => unknown;
          argument?: (name: string, desc: string) => unknown;
          option?: (flags: string, desc: string) => unknown;
          action: (fn: (...args: unknown[]) => void) => unknown;
        };
      };
      cmd.description("Manage CKM research projects");

      const pluginSkillsDir = findPluginSkillsDir(entryDir);

      // openclaw research init <id>
      const initCmd = cmd.command("init <id>");
      initCmd.description("Create a new research project agent + workspace");
      initCmd.action((id: unknown) => {
        initProject(String(id), pluginSkillsDir);
      });

      // openclaw research list
      const listCmd = cmd.command("list");
      listCmd.description("List all research projects");
      listCmd.action(() => {
        const projects = listResearchProjects();
        if (projects.length === 0) {
          console.log("No research projects found.");
          return;
        }
        console.log("\nResearch Projects:\n");
        for (const p of projects) {
          const configured = p.currentDay > 0 || p.createdAt ? "" : " (pending BOOTSTRAP)";
          console.log(`  ${p.id}  Day ${p.currentDay}${configured}`);
          console.log(`    ${p.workspace}`);
        }
        console.log();
      });

      // openclaw research status <id>
      const statusCmd = cmd.command("status <id>");
      statusCmd.description("Show research project metabolism status");
      statusCmd.action((id: unknown) => {
        showStatus(String(id));
      });

      // openclaw research delete <id>
      const deleteCmd = cmd.command("delete <id>");
      deleteCmd.description("Delete a research project (agent + workspace + cron)");
      deleteCmd.action((id: unknown) => {
        deleteProject(String(id));
      });
    },
    { commands: ["research"] },
  );
}

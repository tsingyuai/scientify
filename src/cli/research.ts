import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");
const PROJECTS_ROOT = path.join(OPENCLAW_HOME, "workspace", "projects");
const ACTIVE_FILE = path.join(PROJECTS_ROOT, ".active");
const CRON_JOBS_PATH = path.join(OPENCLAW_HOME, "cron", "jobs.json");

type CronJob = {
  id?: string;
  jobId?: string;
  name?: string;
  payload?: { message?: string };
};

function ensureProjectsRoot(): void {
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
}

function readCronJobs(): CronJob[] {
  try {
    const raw = fs.readFileSync(CRON_JOBS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { jobs?: CronJob[] };
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {
    return [];
  }
}

function normalizeProjectId(raw: string): string {
  const v = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!v) throw new Error("project id is empty after normalization");
  return v;
}

function listProjects(): string[] {
  ensureProjectsRoot();
  return fs
    .readdirSync(PROJECTS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();
}

function getActiveProject(): string | undefined {
  try {
    const raw = fs.readFileSync(ACTIVE_FILE, "utf-8").trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}

function setActiveProject(projectId: string): void {
  ensureProjectsRoot();
  fs.writeFileSync(ACTIVE_FILE, `${projectId}\n`, "utf-8");
}

function initProject(rawId: string): void {
  const id = normalizeProjectId(rawId);
  ensureProjectsRoot();
  const projectDir = path.join(PROJECTS_ROOT, id);
  if (fs.existsSync(projectDir)) {
    console.error(`Error: project already exists at ${projectDir}`);
    process.exit(1);
  }

  const dirs = [
    projectDir,
    path.join(projectDir, "papers"),
    path.join(projectDir, "survey"),
    path.join(projectDir, "ideas"),
    path.join(projectDir, "knowledge_state"),
  ];
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });

  const now = new Date().toISOString();
  fs.writeFileSync(
    path.join(projectDir, "project.json"),
    JSON.stringify({ id, name: id, created: now, topics: [] }, null, 2) + "\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, "task.json"),
    JSON.stringify({ topic: id, created: now, mode: "continuous-research-engine" }, null, 2) + "\n",
    "utf-8",
  );

  if (!getActiveProject()) setActiveProject(id);

  console.log(`\nResearch project '${id}' initialized under unified workspace.`);
  console.log(`  Path: ${projectDir}`);
  console.log("  Note: use /research-subscribe ... --project <id> to create heartbeat schedules.\n");
}

function showStatus(rawId: string): void {
  const id = normalizeProjectId(rawId);
  const projectDir = path.join(PROJECTS_ROOT, id);
  if (!fs.existsSync(projectDir)) {
    console.error(`Error: research project '${id}' not found`);
    process.exit(1);
  }

  const stateFile = path.join(projectDir, "knowledge_state", "state.json");
  let streamCount = 0;
  let totalRuns = 0;
  let totalHypotheses = 0;
  let lastStatus = "(unknown)";
  let lastRunAtMs = 0;

  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf-8")) as {
      streams?: Record<string, { totalRuns?: number; totalHypotheses?: number; lastStatus?: string; lastRunAtMs?: number }>;
    };
    const streams = Object.values(state.streams ?? {});
    streamCount = streams.length;
    for (const s of streams) {
      totalRuns += Number.isFinite(s.totalRuns) ? Math.max(0, Math.floor(s.totalRuns!)) : 0;
      totalHypotheses += Number.isFinite(s.totalHypotheses) ? Math.max(0, Math.floor(s.totalHypotheses!)) : 0;
      const ts = Number.isFinite(s.lastRunAtMs) ? Math.floor(s.lastRunAtMs!) : 0;
      if (ts >= lastRunAtMs) {
        lastRunAtMs = ts;
        lastStatus = s.lastStatus ?? lastStatus;
      }
    }
  } catch {
    // no state yet
  }

  const cronJobs = readCronJobs();
  const relatedJobs = cronJobs.filter((job) => {
    const name = (job.name ?? "").toLowerCase();
    const msg = (job.payload?.message ?? "").toLowerCase();
    return name.includes(id) || msg.includes(`--project ${id}`) || msg.includes(`project_id=${id}`);
  });

  console.log(`\nResearch Project: ${id}`);
  console.log(`  Path: ${projectDir}`);
  console.log(`  Streams: ${streamCount}`);
  console.log(`  Total runs: ${totalRuns}`);
  console.log(`  Total hypotheses: ${totalHypotheses}`);
  console.log(`  Last status: ${lastStatus}`);
  console.log(`  Last run: ${lastRunAtMs > 0 ? new Date(lastRunAtMs).toISOString() : "(none)"}`);
  console.log(`  Related cron jobs: ${relatedJobs.length}`);
  for (const job of relatedJobs.slice(0, 5)) {
    console.log(`    - ${job.id ?? job.jobId ?? "(unknown-id)"} ${job.name ?? ""}`);
  }
  if (relatedJobs.length > 5) {
    console.log(`    ... (${relatedJobs.length - 5} more)`);
  }
}

function deleteProject(rawId: string): void {
  const id = normalizeProjectId(rawId);
  const projectDir = path.join(PROJECTS_ROOT, id);
  if (!fs.existsSync(projectDir)) {
    console.error(`Error: project '${id}' not found`);
    process.exit(1);
  }

  fs.rmSync(projectDir, { recursive: true, force: true });
  if (getActiveProject() === id) {
    try {
      fs.unlinkSync(ACTIVE_FILE);
    } catch {
      // ignore
    }
  }
  console.log(`Deleted project: ${id}`);
  console.log("Note: cron jobs are not auto-removed. Use /research-unsubscribe or openclaw cron list/remove.");
}

/**
 * Register the `openclaw research` CLI command.
 * Compatibility alias over unified project/cron architecture.
 */
export function registerResearchCli(
  api: { registerCli: (registrar: unknown, opts?: { commands?: string[] }) => void },
) {
  api.registerCli(
    ({ program }: { program: { command: (name: string) => unknown } }) => {
      const cmd = program.command("research") as {
        description: (desc: string) => unknown;
        command: (name: string) => {
          description: (desc: string) => unknown;
          action: (fn: (...args: unknown[]) => void) => unknown;
        };
      };
      cmd.description("Manage continuous research engine projects (compatibility alias)");

      const initCmd = cmd.command("init <id>");
      initCmd.description("Initialize a project under ~/.openclaw/workspace/projects/<id>");
      initCmd.action((id: unknown) => initProject(String(id)));

      const listCmd = cmd.command("list");
      listCmd.description("List unified workspace projects");
      listCmd.action(() => {
        const projects = listProjects();
        const active = getActiveProject();
        if (projects.length === 0) {
          console.log("No projects found.");
          return;
        }
        console.log("\nProjects:\n");
        for (const id of projects) {
          const marker = id === active ? "*" : " ";
          console.log(` ${marker} ${id}`);
        }
        console.log();
      });

      const statusCmd = cmd.command("status <id>");
      statusCmd.description("Show project status from unified knowledge_state");
      statusCmd.action((id: unknown) => showStatus(String(id)));

      const deleteCmd = cmd.command("delete <id>");
      deleteCmd.description("Delete a project from unified workspace (compatibility)");
      deleteCmd.action((id: unknown) => deleteProject(String(id)));
    },
    { commands: ["research"] },
  );
}

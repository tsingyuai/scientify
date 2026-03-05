import type { RunCommandResult } from "openclaw";
import type { CronCommandDeps, CronJob, CronListResult } from "./types.js";

export async function runCommand(
  deps: CronCommandDeps,
  argv: string[],
  timeoutMs = 30_000,
): Promise<RunCommandResult> {
  deps.logger.debug?.(`[scientify-cron] run: ${argv.join(" ")}`);
  return deps.runtime.system.runCommandWithTimeout(argv, { timeoutMs });
}

export function parseJsonFromOutput<T>(stdout: string): T | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Continue to best-effort extraction.
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const maybeJson = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(maybeJson) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export async function listAllJobs(deps: CronCommandDeps): Promise<CronJob[]> {
  const res = await runCommand(deps, ["openclaw", "cron", "list", "--all", "--json"]);
  if (res.code !== 0) {
    throw new Error(res.stderr || "cron list failed");
  }
  const payload = parseJsonFromOutput<CronListResult>(res.stdout);
  return payload?.jobs ?? [];
}

async function getJobById(deps: CronCommandDeps, jobId: string): Promise<CronJob | undefined> {
  const jobs = await listAllJobs(deps);
  return jobs.find((job) => job.id === jobId);
}

export async function ensureJobEnabled(deps: CronCommandDeps, jobId: string): Promise<CronJob | undefined> {
  const current = await getJobById(deps, jobId);
  if (!current || current.enabled !== false) {
    return current;
  }

  const enable = await runCommand(deps, ["openclaw", "cron", "enable", jobId]);
  if (enable.code !== 0) {
    throw new Error(enable.stderr || `failed to enable cron job ${jobId}`);
  }

  const after = await getJobById(deps, jobId);
  if (after?.enabled === false) {
    throw new Error(`cron job ${jobId} is disabled after enable attempt`);
  }
  return after;
}

export function scheduleText(job: CronJob): string {
  const schedule = job.schedule;
  if (!schedule) return "(unknown)";

  if (schedule.kind === "cron") {
    const expr = schedule.expr ?? "(missing expr)";
    const tz = schedule.tz ? ` (${schedule.tz})` : "";
    return `${expr}${tz}`;
  }

  if (schedule.kind === "every") {
    if (typeof schedule.everyMs === "number" && schedule.everyMs > 0) {
      const totalSeconds = Math.floor(schedule.everyMs / 1000);
      if (totalSeconds % 3600 === 0) return `every ${totalSeconds / 3600}h`;
      if (totalSeconds % 60 === 0) return `every ${totalSeconds / 60}m`;
      return `every ${totalSeconds}s`;
    }
  }

  if (schedule.kind === "at") {
    if (typeof schedule.at === "string" && schedule.at.trim().length > 0) {
      return `at ${schedule.at}`;
    }
  }

  return JSON.stringify(schedule);
}

import type { PluginCommandContext, PluginCommandResult } from "openclaw";
import { buildScopedJobName, buildStateScopeKey, resolveDeliveryTarget } from "./delivery.js";
import { ensureJobEnabled, listAllJobs, parseJsonFromOutput, runCommand, scheduleText } from "./cron-client.js";
import { isDurationLike, parseScheduleArgs, parseSubscribeOptions } from "./parse.js";
import { buildScheduledTaskMessage, formatUsage, withSignature } from "./prompt.js";
import type { CronCommandDeps, CronJob } from "./types.js";

export function createResearchSubscribeHandler(deps: CronCommandDeps) {
  return async (ctx: PluginCommandContext): Promise<PluginCommandResult> => {
    const options = parseSubscribeOptions(ctx.args);
    if ("error" in options) {
      return {
        error: options.error,
        text: `${options.error}\n\n${formatUsage()}`,
      };
    }

    const parsed = parseScheduleArgs(options.scheduleTokens);
    if ("error" in parsed) {
      return {
        error: parsed.error,
        text: `${parsed.error}\n\n${formatUsage()}`,
      };
    }

    if (parsed.kind === "at" && !isDurationLike(parsed.when)) {
      const atMs = Date.parse(parsed.when);
      if (!Number.isNaN(atMs) && atMs <= Date.now()) {
        const error =
          "Error: `at` time is in the past. Use a future ISO datetime (for example `2026-03-04T08:00:00+08:00`) or a relative duration like `at 5m`.";
        return {
          error,
          text: `${error}\n\n${formatUsage()}`,
        };
      }
    }

    const jobName = buildScopedJobName(ctx);
    const delivery = resolveDeliveryTarget(ctx, options);
    if ("error" in delivery) {
      return {
        error: delivery.error,
        text: `${delivery.error}\n\n${formatUsage()}`,
      };
    }
    const stateScopeKey = buildStateScopeKey(ctx, delivery);

    try {
      const jobs = await listAllJobs(deps);
      const existing = jobs.filter((job) => job.name === jobName);

      const addArgs = [
        "openclaw",
        "cron",
        "add",
        "--name",
        jobName,
        "--description",
        "Scientify scheduled job",
        "--session",
        "isolated",
        "--message",
        buildScheduledTaskMessage(options, parsed.kind, stateScopeKey),
        "--timeout-seconds",
        "1800",
      ];

      if (delivery.mode === "none") {
        addArgs.push("--no-deliver");
      } else {
        addArgs.push("--announce", "--best-effort-deliver", "--channel", delivery.channel);
        if (delivery.to) {
          addArgs.push("--to", delivery.to);
        }
      }

      if (parsed.kind === "cron") {
        addArgs.push("--cron", parsed.expr, "--tz", parsed.tz);
      } else if (parsed.kind === "every") {
        addArgs.push("--every", parsed.duration);
      } else {
        addArgs.push("--at", parsed.when, "--delete-after-run");
      }

      addArgs.push("--json");

      const addRes = await runCommand(deps, addArgs, 60_000);
      if (addRes.code !== 0) {
        throw new Error(addRes.stderr || "cron add failed");
      }

      const created = parseJsonFromOutput<CronJob>(addRes.stdout);
      if (!created?.id) {
        throw new Error("cron add did not return job id");
      }
      const createdId = created.id;

      const persisted = await ensureJobEnabled(deps, createdId);

      if (delivery.mode === "announce" && delivery.channel !== "last" && !created.delivery?.to) {
        await runCommand(deps, ["openclaw", "cron", "rm", createdId, "--json"]).catch(() => undefined);
        throw new Error(
          `cron add created a job without delivery.to for channel "${delivery.channel}". Refusing to keep this job.`,
        );
      }

      const cleanupErrors: string[] = [];
      for (const job of existing) {
        const rm = await runCommand(deps, ["openclaw", "cron", "rm", job.id, "--json"]);
        if (rm.code !== 0) {
          cleanupErrors.push(rm.stderr || `failed to remove previous job ${job.id}`);
        }
      }

      const lines = [
        "Created scheduled job successfully.",
        "",
        `- Job ID: \`${createdId}\``,
        `- Name: \`${jobName}\``,
        `- Enabled: \`${persisted?.enabled === false ? "no" : "yes"}\``,
        `- Schedule: \`${parsed.display}\``,
        `- Delivery: \`${delivery.display}\``,
        `- Incremental Scope: \`${stateScopeKey}\``,
        "",
        "Useful commands:",
        `- Run now: \`openclaw cron run ${createdId}\``,
        `- Show runs: \`openclaw cron runs --id ${createdId} --limit 20\``,
        "- Cancel: `/research-unsubscribe`",
      ];
      if (cleanupErrors.length > 0) {
        lines.push(`- Warning: previous job cleanup had ${cleanupErrors.length} error(s).`);
      }

      const message = lines.join("\n");
      return { text: ctx.channel === "tool" ? message : withSignature(message) };
    } catch (error) {
      const message = `Error: failed to create scheduled job: ${error instanceof Error ? error.message : String(error)}`;
      deps.logger.warn(
        `[scientify-cron] subscribe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        error: message,
        text: message,
      };
    }
  };
}

export function createResearchUnsubscribeHandler(deps: CronCommandDeps) {
  return async (ctx: PluginCommandContext): Promise<PluginCommandResult> => {
    const maybeId = (ctx.args ?? "").trim();
    const jobName = buildScopedJobName(ctx);

    try {
      if (maybeId) {
        const rm = await runCommand(deps, ["openclaw", "cron", "rm", maybeId, "--json"]);
        if (rm.code !== 0) {
          throw new Error(rm.stderr || `failed to remove ${maybeId}`);
        }
        return { text: `Removed scheduled job: \`${maybeId}\`` };
      }

      const jobs = await listAllJobs(deps);
      const mine = jobs.filter((job) => job.name === jobName);
      if (mine.length === 0) {
        return {
          text: "No Scientify scheduled jobs found for this scope.",
        };
      }

      for (const job of mine) {
        const rm = await runCommand(deps, ["openclaw", "cron", "rm", job.id, "--json"]);
        if (rm.code !== 0) {
          throw new Error(rm.stderr || `failed to remove ${job.id}`);
        }
      }

      return {
        text: `Canceled Scientify subscription. Removed ${mine.length} job(s).`,
      };
    } catch (error) {
      deps.logger.warn(
        `[scientify-cron] unsubscribe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      const message = `Error: failed to cancel subscription: ${error instanceof Error ? error.message : String(error)}`;
      return {
        error: message,
        text: message,
      };
    }
  };
}

export function createResearchSubscriptionsHandler(deps: CronCommandDeps) {
  return async (ctx: PluginCommandContext): Promise<PluginCommandResult> => {
    const jobName = buildScopedJobName(ctx);
    try {
      const jobs = await listAllJobs(deps);
      const mine = jobs.filter((job) => job.name === jobName);
      if (mine.length === 0) {
        return {
          text: "No Scientify scheduled jobs found. Use `/research-subscribe daily 09:00 Asia/Shanghai` to create one.",
        };
      }

      const lines = ["Your Scientify scheduled jobs:", ""];
      for (const job of mine) {
        lines.push(`- ID: \`${job.id}\``);
        lines.push(`  enabled: ${job.enabled ? "yes" : "no"}`);
        lines.push(`  schedule: \`${scheduleText(job)}\``);
        lines.push(`  delivery: \`${job.delivery?.channel ?? "unknown"}${job.delivery?.to ? `:${job.delivery.to}` : ""}\``);
      }
      lines.push("");
      lines.push("Cancel all: `/research-unsubscribe`");

      return { text: lines.join("\n") };
    } catch (error) {
      deps.logger.warn(
        `[scientify-cron] list subscriptions failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      const message = `Error: failed to list scheduled jobs: ${error instanceof Error ? error.message : String(error)}`;
      return {
        error: message,
        text: message,
      };
    }
  };
}

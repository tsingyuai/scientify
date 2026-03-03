import type {
  PluginCommandContext,
  PluginCommandResult,
  PluginLogger,
  PluginRuntime,
  RunCommandResult,
} from "openclaw";

const DEFAULT_TIME = "09:00";
const DEFAULT_TZ = "Asia/Shanghai";

const DEFAULT_CRON_PROMPT =
  "/research-pipeline Run an incremental literature check for the active project. Only report if there are newly relevant papers: provide 3 concise highlights with sources. If no increment is found, reply with 'No new literature found.'";

const SCIENTIFY_SIGNATURE_FOOTER = "---\n🐍Scientify";

const REMINDER_HINT_RE =
  /\b(remind(?:er)?|remember|alarm|wake|break|sleep|coffee|water|drink)\b|提醒|记得|闹钟|休息|喝水|喝咖啡|睡觉/u;
const RESEARCH_HINT_RE =
  /\b(research|paper|papers|survey|literature|arxiv|openalex|citation|benchmark|dataset|model)\b|论文|文献|研究|综述|检索|引用|实验/u;

const ALLOWED_DELIVERY_CHANNELS = new Set([
  "telegram",
  "whatsapp",
  "discord",
  "irc",
  "googlechat",
  "slack",
  "signal",
  "imessage",
  "feishu",
  "nostr",
  "msteams",
  "mattermost",
  "nextcloud-talk",
  "matrix",
  "bluebubbles",
  "line",
  "zalo",
  "zalouser",
  "synology-chat",
  "tlon",
]);

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

type ScheduleSpec =
  | {
      kind: "cron";
      expr: string;
      tz: string;
      display: string;
    }
  | {
      kind: "every";
      duration: string;
      display: string;
    }
  | {
      kind: "at";
      when: string;
      display: string;
    };

type CronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: {
    kind?: string;
    expr?: string;
    tz?: string;
    everyMs?: number;
    at?: string;
  };
  delivery?: {
    mode?: string;
    channel?: string;
    to?: string;
  };
};

type CronListResult = {
  jobs?: CronJob[];
};

type CronCommandDeps = {
  runtime: PluginRuntime;
  logger: PluginLogger;
};

type DeliveryTarget = {
  mode: "announce" | "none";
  channel: string;
  to?: string;
  display: string;
};

type SubscriptionOptions = {
  scheduleTokens: string[];
  channelOverride?: string;
  toOverride?: string;
  noDeliver: boolean;
  topic?: string;
  message?: string;
};

function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (quote) {
      if (ch === "\\") {
        const next = raw[i + 1];
        if (next === quote || next === "\\") {
          escaped = true;
          continue;
        }
      }
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function parseTime(raw: string): { hour: number; minute: number } | null {
  const m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function isValidTimezone(raw: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}

function validateEveryDuration(raw: string): boolean {
  return /^\d+[smhdw]$/i.test(raw);
}

function isDurationLike(raw: string): boolean {
  return /^\+?\d+[smhdw]$/i.test(raw);
}

function validateCronExpr(raw: string): boolean {
  const fields = raw.trim().split(/\s+/);
  return fields.length === 5 || fields.length === 6;
}

function parseTimeAndTz(
  tokens: string[],
  startIndex: number,
): { time: string; tz: string } | { error: string } {
  let time = DEFAULT_TIME;
  let tz = DEFAULT_TZ;

  const first = tokens[startIndex];
  const second = tokens[startIndex + 1];

  if (!first) {
    return { time, tz };
  }

  if (parseTime(first)) {
    time = first;
    if (second) {
      if (!isValidTimezone(second)) {
        return {
          error: `Error: invalid timezone \`${second}\`. Use an IANA timezone like \`Asia/Shanghai\`.`,
        };
      }
      tz = second;
    }
    return { time, tz };
  }

  if (!isValidTimezone(first)) {
    return {
      error: `Error: invalid time format \`${first}\`. Use \`HH:MM\` (24-hour) or a timezone value.`,
    };
  }

  tz = first;
  return { time, tz };
}

function parseScheduleArgs(tokens: string[]): ScheduleSpec | { error: string } {
  if (tokens.length === 0) {
    const parsed = parseTime(DEFAULT_TIME)!;
    const expr = `${parsed.minute} ${parsed.hour} * * *`;
    return { kind: "cron", expr, tz: DEFAULT_TZ, display: `daily ${DEFAULT_TIME} (${DEFAULT_TZ})` };
  }

  const mode = tokens[0]?.toLowerCase();

  if (mode === "daily" || mode === "day") {
    const parsed = parseTimeAndTz(tokens, 1);
    if ("error" in parsed) return parsed;
    const time = parseTime(parsed.time)!;
    return {
      kind: "cron",
      expr: `${time.minute} ${time.hour} * * *`,
      tz: parsed.tz,
      display: `daily ${parsed.time} (${parsed.tz})`,
    };
  }

  if (mode === "weekly" || mode === "week") {
    const dayToken = (tokens[1] ?? "").toLowerCase();
    const dow = WEEKDAY_MAP[dayToken];
    if (dow === undefined) {
      return {
        error: "Error: weekly mode requires a weekday, for example \`mon\`, \`tue\`, or \`sun\`.",
      };
    }
    const parsed = parseTimeAndTz(tokens, 2);
    if ("error" in parsed) return parsed;
    const time = parseTime(parsed.time)!;
    return {
      kind: "cron",
      expr: `${time.minute} ${time.hour} * * ${dow}`,
      tz: parsed.tz,
      display: `weekly ${tokens[1]} ${parsed.time} (${parsed.tz})`,
    };
  }

  if (mode === "every") {
    const duration = tokens[1];
    if (!duration || !validateEveryDuration(duration)) {
      return {
        error: "Error: every mode needs an interval, for example \`every 6h\` or \`every 30m\`.",
      };
    }
    return {
      kind: "every",
      duration,
      display: `every ${duration}`,
    };
  }

  if (mode === "at" || mode === "once") {
    const when = tokens[1];
    if (!when) {
      return {
        error: "Error: at mode needs a time value, for example \`at 2m\` or \`at 2026-03-04T08:00:00+08:00\`.",
      };
    }
    if (isDurationLike(when)) {
      return {
        kind: "at",
        when: when.startsWith("+") ? when.slice(1) : when,
        display: `at ${when}`,
      };
    }
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) {
      return {
        error:
          "Error: invalid at time format. Use a duration like \`2m\` or an ISO datetime like \`2026-03-04T08:00:00+08:00\`.",
      };
    }
    return {
      kind: "at",
      when,
      display: `at ${when}`,
    };
  }

  if (mode === "cron") {
    let expr = "";
    let tz = DEFAULT_TZ;

    if (tokens[1]?.includes(" ")) {
      expr = tokens[1];
      tz = tokens[2] ?? DEFAULT_TZ;
      if (tokens.length > 3) {
        return {
          error:
            "Error: invalid cron mode format. Use either `cron \"<expr>\" [TZ]` or split fields (`cron 0 9 * * * [TZ]`).",
        };
      }
    } else {
      const valueCount = tokens.length - 1;
      if (valueCount < 5 || valueCount > 7) {
        return {
          error:
            "Error: invalid cron mode format. Example: `cron \"0 9 * * *\" Asia/Shanghai`, `cron 0 9 * * * Asia/Shanghai`, or `cron 0 0 9 * * * Asia/Shanghai`.",
        };
      }

      if (valueCount === 7) {
        // 6-field cron + timezone
        expr = tokens.slice(1, 7).join(" ").trim();
        tz = tokens[7] ?? DEFAULT_TZ;
      } else if (valueCount === 6) {
        // Ambiguous case:
        // - 5-field cron + timezone
        // - 6-field cron with no timezone
        const maybeTz = tokens[6];
        if (maybeTz && isValidTimezone(maybeTz)) {
          expr = tokens.slice(1, 6).join(" ").trim();
          tz = maybeTz;
        } else {
          expr = tokens.slice(1, 7).join(" ").trim();
          tz = DEFAULT_TZ;
        }
      } else {
        // 5-field cron, no timezone
        expr = tokens.slice(1, 6).join(" ").trim();
        tz = DEFAULT_TZ;
      }
    }

    if (!validateCronExpr(expr)) {
      return {
        error:
          "Error: invalid cron mode format. Example: \`cron \"0 9 * * *\" Asia/Shanghai\` or \`cron 0 9 * * * Asia/Shanghai\`.",
      };
    }

    if (!isValidTimezone(tz)) {
      return {
        error: `Error: invalid timezone \`${tz}\`. Use an IANA timezone like \`Asia/Shanghai\`.`,
      };
    }

    return {
      kind: "cron",
      expr,
      tz,
      display: `cron ${expr} (${tz})`,
    };
  }

  return {
    error:
      "Error: usage is \`/research-subscribe daily [HH:MM] [TZ]\`, \`/research-subscribe weekly <day> [HH:MM] [TZ]\`, \`/research-subscribe every <duration>\`, \`/research-subscribe at <2m|ISO>\`, or \`/research-subscribe cron \"<expr>\" [TZ]\`.",
  };
}

function parseSubscribeOptions(rawArgs: string | undefined): SubscriptionOptions | { error: string } {
  const tokens = tokenizeArgs((rawArgs ?? "").trim());
  const scheduleTokens: string[] = [];
  let channelOverride: string | undefined;
  let toOverride: string | undefined;
  let topic: string | undefined;
  let message: string | undefined;
  let noDeliver = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "--channel") {
      const value = tokens[i + 1];
      if (!value) {
        return { error: "Error: \`--channel\` expects a value, e.g. \`--channel feishu\`." };
      }
      channelOverride = value.toLowerCase();
      i++;
      continue;
    }

    if (token === "--to") {
      const value = tokens[i + 1];
      if (!value) {
        return { error: "Error: \`--to\` expects a value, e.g. \`--to user_or_chat_id\`." };
      }
      toOverride = value;
      i++;
      continue;
    }

    if (token === "--no-deliver") {
      noDeliver = true;
      continue;
    }

    if (token === "--topic") {
      const value = tokens[i + 1];
      if (!value) {
        return { error: "Error: \`--topic\` expects a value, e.g. \`--topic \"multimodal LLM safety\"\`." };
      }
      topic = value;
      i++;
      continue;
    }

    if (token === "--message") {
      const value = tokens[i + 1];
      if (!value) {
        return { error: "Error: `--message` expects a value, e.g. `--message \"Time to drink water.\"`." };
      }
      message = value;
      i++;
      continue;
    }

    if (token.startsWith("--")) {
      return { error: `Error: unknown argument \`${token}\`.` };
    }

    scheduleTokens.push(token);
  }

  return {
    scheduleTokens,
    channelOverride,
    toOverride,
    noDeliver,
    topic,
    message,
  };
}

function sanitizeIdPart(value: string | undefined): string {
  const cleaned = (value ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 48) || "unknown";
}

function buildScopedJobName(ctx: PluginCommandContext): string {
  const channel = sanitizeIdPart(ctx.channel);
  const sender = sanitizeIdPart(ctx.senderId);
  return `scientify-report-${channel}-${sender}`;
}

function resolveDeliveryTarget(
  ctx: PluginCommandContext,
  opts: SubscriptionOptions,
): DeliveryTarget | { error: string } {
  if (opts.noDeliver) {
    return {
      mode: "none",
      channel: "last",
      display: "none",
    };
  }

  if (opts.channelOverride) {
    const channel = opts.channelOverride;
    if (channel !== "last" && !ALLOWED_DELIVERY_CHANNELS.has(channel)) {
      return {
        error:
          "Error: unsupported channel override. Try one of: feishu, telegram, slack, discord, last.",
      };
    }
    if (channel !== "last" && !opts.toOverride) {
      return {
        error:
          "Error: `--to` is required when `--channel` is set to a concrete channel (for example: `--channel feishu --to ou_xxx`).",
      };
    }
    return {
      mode: "announce",
      channel,
      to: opts.toOverride,
      display: `${channel}${opts.toOverride ? `:${opts.toOverride}` : ""}`,
    };
  }

  const channel = (ctx.channel ?? "").trim().toLowerCase();
  const senderId = ctx.senderId?.trim();

  if (senderId && ALLOWED_DELIVERY_CHANNELS.has(channel)) {
    return {
      mode: "announce",
      channel,
      to: opts.toOverride ?? senderId,
      display: `${channel}:${opts.toOverride ?? senderId}`,
    };
  }

  if (opts.toOverride) {
    return {
      error: "Error: cannot infer channel from current source. Please set \`--channel\` together with \`--to\`.",
    };
  }

  // Tool-created subscriptions must not silently fall back to "last",
  // otherwise jobs may be created without a concrete delivery target.
  if ((ctx.channel ?? "").trim().toLowerCase() === "tool") {
    return {
      error:
        "Error: cannot infer delivery target in tool context. Provide both \`--channel\` and \`--to\` (or set \`--no-deliver\`).",
    };
  }

  return {
    mode: "announce",
    channel: "last",
    display: "last",
  };
}

async function runCommand(
  deps: CronCommandDeps,
  argv: string[],
  timeoutMs = 30_000,
): Promise<RunCommandResult> {
  deps.logger.debug?.(`[scientify-cron] run: ${argv.join(" ")}`);
  return deps.runtime.system.runCommandWithTimeout(argv, { timeoutMs });
}

function parseJsonFromOutput<T>(stdout: string): T | null {
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

async function listAllJobs(deps: CronCommandDeps): Promise<CronJob[]> {
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

async function ensureJobEnabled(deps: CronCommandDeps, jobId: string): Promise<CronJob | undefined> {
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

function scheduleText(job: CronJob): string {
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

function normalizeReminderText(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^(please\s+)?remind\s+(me|us|you)\s+(to\s+)?/i, "");
  text = text.replace(/^remember\s+to\s+/i, "");
  text = text.replace(/^(请)?(提醒我|提醒你|提醒|记得)(一下|一声)?[：:,\s]*/u, "");
  const normalized = text.trim();
  return normalized.length > 0 ? normalized : raw.trim();
}

function inferReminderMessageFromTopic(topic?: string): string | undefined {
  const trimmed = topic?.trim();
  if (!trimmed) return undefined;
  if (!REMINDER_HINT_RE.test(trimmed)) return undefined;
  if (RESEARCH_HINT_RE.test(trimmed)) return undefined;
  return normalizeReminderText(trimmed);
}

function buildScheduledTaskMessage(
  options: Pick<SubscriptionOptions, "topic" | "message">,
  scheduleKind: ScheduleSpec["kind"],
): string {
  const customMessage = options.message?.trim();
  if (customMessage) {
    return [
      "Scheduled reminder task.",
      `Please send this reminder now: "${customMessage}"`,
      "Keep the reminder concise and do not run a research workflow unless explicitly requested.",
    ].join("\n");
  }

  const reminderFromTopic = inferReminderMessageFromTopic(options.topic);
  if (reminderFromTopic) {
    return [
      "Scheduled reminder task.",
      `Please send this reminder now: "${reminderFromTopic}"`,
      "Keep the reminder concise and do not run a research workflow unless explicitly requested.",
    ].join("\n");
  }

  const trimmedTopic = options.topic?.trim();
  if (!trimmedTopic) {
    return DEFAULT_CRON_PROMPT;
  }

  if (scheduleKind === "at") {
    return `/research-pipeline Run a focused literature study on \"${trimmedTopic}\" and return exactly 3 high-value representative papers (not limited to newly published or previously pushed items). For each paper, include source link, the specific core pain point it addresses, and why that pain point is still important now. Then provide a one-paragraph synthesis answering the user's core question.`;
  }

  return `/research-pipeline Run an incremental literature check focused on \"${trimmedTopic}\". Return only the 3 highest-value papers that have not been pushed before, each with a source link and one-line value summary. If there is no new high-value paper, reply with 'No new literature found.'`;
}

function formatUsage(): string {
  return [
    "## Scientify Scheduled Subscription",
    "",
    "Examples:",
    "- `/research-subscribe`",
    "- `/research-subscribe daily 09:00 Asia/Shanghai`",
    "- `/research-subscribe weekly mon 09:30 Asia/Shanghai`",
    "- `/research-subscribe every 6h`",
    "- `/research-subscribe at 2m`",
    "- `/research-subscribe at 2026-03-04T08:00:00+08:00`",
    "- `/research-subscribe cron \"0 9 * * 1\" Asia/Shanghai`",
    "- `/research-subscribe daily 09:00 --channel feishu --to ou_xxx`",
    "- `/research-subscribe every 2h --channel telegram --to 12345678`",
    "- `/research-subscribe daily 08:00 --topic \"LLM alignment\"`",
    "- `/research-subscribe at 1m --message \"Time to drink coffee.\"`",
    "- `/research-subscribe daily 09:00 --no-deliver`",
  ].join("\n");
}

function withSignature(text: string): string {
  return `${text}\n${SCIENTIFY_SIGNATURE_FOOTER}`;
}

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
        buildScheduledTaskMessage(options, parsed.kind),
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

      // Defensive check: if a job is persisted disabled, enable it immediately.
      const persisted = await ensureJobEnabled(deps, createdId);

      // Hard safety: for concrete announce channels, `delivery.to` must exist.
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
        lines.push(
          `  delivery: \`${job.delivery?.channel ?? "unknown"}${job.delivery?.to ? `:${job.delivery.to}` : ""}\``,
        );
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

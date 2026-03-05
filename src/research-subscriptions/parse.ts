import {
  DEFAULT_CANDIDATE_POOL,
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_TIME,
  DEFAULT_TZ,
  MAX_CANDIDATE_POOL,
  MIN_CANDIDATE_POOL,
  SCORE_WEIGHT_KEYS,
  WEEKDAY_MAP,
} from "./constants.js";
import type { ScheduleSpec, ScoreWeights, SubscriptionOptions } from "./types.js";

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

export function isDurationLike(raw: string): boolean {
  return /^\+?\d+[smhdw]$/i.test(raw);
}

function validateCronExpr(raw: string): boolean {
  const fields = raw.trim().split(/\s+/);
  return fields.length === 5 || fields.length === 6;
}

function isScoreWeightKey(raw: string): raw is (typeof SCORE_WEIGHT_KEYS)[number] {
  return SCORE_WEIGHT_KEYS.includes(raw as (typeof SCORE_WEIGHT_KEYS)[number]);
}

function parseScoreWeights(raw: string): ScoreWeights | { error: string } {
  const value = raw.trim();
  if (!value) {
    return {
      error:
        "Error: `--score-weights` expects a value, e.g. `--score-weights relevance:40,novelty:20,authority:30,actionability:10`.",
    };
  }

  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (parts.length === 0) {
    return {
      error:
        "Error: `--score-weights` expects a non-empty value, e.g. `--score-weights 40,20,30,10`.",
    };
  }

  const parsed: Partial<ScoreWeights> = {};
  const hasNamedWeights = parts.some((item) => item.includes(":") || item.includes("="));

  if (hasNamedWeights) {
    for (const part of parts) {
      const match = part.match(/^([a-z_]+)\s*[:=]\s*(-?\d+(?:\.\d+)?)$/i);
      if (!match) {
        return {
          error:
            "Error: invalid `--score-weights` entry. Use `key:value` pairs, e.g. `relevance:40,novelty:20,authority:30,actionability:10`.",
        };
      }
      const key = match[1].toLowerCase();
      if (!isScoreWeightKey(key)) {
        return {
          error:
            "Error: unknown score weight key. Allowed keys: relevance, novelty, authority, actionability.",
        };
      }
      const num = Number(match[2]);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        return {
          error: `Error: score weight \`${key}\` must be between 0 and 100.`,
        };
      }
      parsed[key] = num;
    }
  } else {
    if (parts.length !== 4) {
      return {
        error:
          "Error: positional `--score-weights` needs exactly 4 numbers: relevance,novelty,authority,actionability.",
      };
    }
    const nums = parts.map((part) => Number(part));
    if (nums.some((num) => !Number.isFinite(num) || num < 0 || num > 100)) {
      return {
        error: "Error: each positional score weight must be between 0 and 100.",
      };
    }
    parsed.relevance = nums[0];
    parsed.novelty = nums[1];
    parsed.authority = nums[2];
    parsed.actionability = nums[3];
  }

  const merged: ScoreWeights = {
    relevance: parsed.relevance ?? DEFAULT_SCORE_WEIGHTS.relevance,
    novelty: parsed.novelty ?? DEFAULT_SCORE_WEIGHTS.novelty,
    authority: parsed.authority ?? DEFAULT_SCORE_WEIGHTS.authority,
    actionability: parsed.actionability ?? DEFAULT_SCORE_WEIGHTS.actionability,
  };

  const sum = merged.relevance + merged.novelty + merged.authority + merged.actionability;
  if (sum <= 0) {
    return {
      error: "Error: score weights must sum to a positive value.",
    };
  }

  return merged;
}

export function resolveCandidatePool(candidatePool: number | undefined, maxPapers: number): number {
  const base = candidatePool ?? Math.max(DEFAULT_CANDIDATE_POOL, maxPapers);
  const normalized = Math.floor(base);
  return Math.max(maxPapers, Math.min(MAX_CANDIDATE_POOL, Math.max(MIN_CANDIDATE_POOL, normalized)));
}

export function formatScoreWeights(weights: ScoreWeights): string {
  const sum = weights.relevance + weights.novelty + weights.authority + weights.actionability;
  const ratio = (value: number): string => {
    const pct = (value / sum) * 100;
    const text = pct.toFixed(1);
    return text.endsWith(".0") ? `${text.slice(0, -2)}%` : `${text}%`;
  };
  return `relevance ${ratio(weights.relevance)}, novelty ${ratio(weights.novelty)}, authority ${ratio(weights.authority)}, actionability ${ratio(weights.actionability)}`;
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

export function parseScheduleArgs(tokens: string[]): ScheduleSpec | { error: string } {
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
        expr = tokens.slice(1, 7).join(" ").trim();
        tz = tokens[7] ?? DEFAULT_TZ;
      } else if (valueCount === 6) {
        const maybeTz = tokens[6];
        if (maybeTz && isValidTimezone(maybeTz)) {
          expr = tokens.slice(1, 6).join(" ").trim();
          tz = maybeTz;
        } else {
          expr = tokens.slice(1, 7).join(" ").trim();
          tz = DEFAULT_TZ;
        }
      } else {
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

export function parseSubscribeOptions(rawArgs: string | undefined): SubscriptionOptions | { error: string } {
  const tokens = tokenizeArgs((rawArgs ?? "").trim());
  const scheduleTokens: string[] = [];
  let channelOverride: string | undefined;
  let toOverride: string | undefined;
  let topic: string | undefined;
  let message: string | undefined;
  let maxPapers: number | undefined;
  let recencyDays: number | undefined;
  let sources: string[] | undefined;
  let candidatePool: number | undefined;
  let scoreWeights: ScoreWeights | undefined;
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

    if (token === "--max-papers") {
      const value = tokens[i + 1];
      if (!value) {
        return { error: "Error: `--max-papers` expects an integer value, e.g. `--max-papers 3`." };
      }
      const num = Number.parseInt(value, 10);
      if (!Number.isFinite(num) || num < 1 || num > 20) {
        return { error: "Error: `--max-papers` must be an integer between 1 and 20." };
      }
      maxPapers = num;
      i++;
      continue;
    }

    if (token === "--recency-days") {
      const value = tokens[i + 1];
      if (!value) {
        return { error: "Error: `--recency-days` expects an integer value, e.g. `--recency-days 30`." };
      }
      const num = Number.parseInt(value, 10);
      if (!Number.isFinite(num) || num < 1 || num > 3650) {
        return { error: "Error: `--recency-days` must be an integer between 1 and 3650." };
      }
      recencyDays = num;
      i++;
      continue;
    }

    if (token === "--sources") {
      const value = tokens[i + 1];
      if (!value) {
        return { error: "Error: `--sources` expects a CSV value, e.g. `--sources arxiv,openalex`." };
      }
      const parsed = value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0);
      if (parsed.length === 0) {
        return { error: "Error: `--sources` must include at least one source." };
      }
      sources = [...new Set(parsed)];
      i++;
      continue;
    }

    if (token === "--candidate-pool") {
      const value = tokens[i + 1];
      if (!value) {
        return { error: "Error: `--candidate-pool` expects an integer value, e.g. `--candidate-pool 12`." };
      }
      const num = Number.parseInt(value, 10);
      if (!Number.isFinite(num) || num < MIN_CANDIDATE_POOL || num > MAX_CANDIDATE_POOL) {
        return {
          error: `Error: \`--candidate-pool\` must be an integer between ${MIN_CANDIDATE_POOL} and ${MAX_CANDIDATE_POOL}.`,
        };
      }
      candidatePool = num;
      i++;
      continue;
    }

    if (token === "--score-weights") {
      const value = tokens[i + 1];
      if (!value) {
        return {
          error:
            "Error: `--score-weights` expects a value, e.g. `--score-weights relevance:40,novelty:20,authority:30,actionability:10`.",
        };
      }
      const parsed = parseScoreWeights(value);
      if ("error" in parsed) {
        return parsed;
      }
      scoreWeights = parsed;
      i++;
      continue;
    }

    if (token.startsWith("--")) {
      return { error: `Error: unknown argument \`${token}\`.` };
    }

    scheduleTokens.push(token);
  }

  if (candidatePool !== undefined && maxPapers !== undefined && candidatePool < maxPapers) {
    return {
      error: "Error: `--candidate-pool` must be greater than or equal to `--max-papers`.",
    };
  }

  return {
    scheduleTokens,
    channelOverride,
    toOverride,
    noDeliver,
    topic,
    message,
    ...(maxPapers !== undefined ? { maxPapers } : {}),
    ...(recencyDays !== undefined ? { recencyDays } : {}),
    ...(sources && sources.length > 0 ? { sources } : {}),
    ...(candidatePool !== undefined ? { candidatePool } : {}),
    ...(scoreWeights ? { scoreWeights } : {}),
  };
}

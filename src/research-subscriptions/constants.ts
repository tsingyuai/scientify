import type { ScoreWeights } from "./types.js";

export const DEFAULT_TIME = "09:00";
export const DEFAULT_TZ = "Asia/Shanghai";

export const DEFAULT_CRON_PROMPT =
  "/research-pipeline Run an incremental literature check for the active project. Only report if there are newly relevant papers: provide 3 concise highlights with sources. If no increment is found, reply with 'No new literature found.'";

export const SCIENTIFY_SIGNATURE_FOOTER = "---\n🐍Scientify";

export const REMINDER_HINT_RE =
  /\b(remind(?:er)?|remember|alarm|wake|break|sleep|coffee|water|drink)\b|提醒|记得|闹钟|休息|喝水|喝咖啡|睡觉/u;
export const RESEARCH_HINT_RE =
  /\b(research|paper|papers|survey|literature|arxiv|openalex|citation|benchmark|dataset|model)\b|论文|文献|研究|综述|检索|引用|实验/u;

export const ALLOWED_DELIVERY_CHANNELS = new Set([
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

export const DELIVERY_LAST_ALIASES = new Set(["last", "webui", "tui"]);

export const WEEKDAY_MAP: Record<string, number> = {
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

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  relevance: 40,
  novelty: 20,
  authority: 30,
  actionability: 10,
};

export const SCORE_WEIGHT_KEYS = ["relevance", "novelty", "authority", "actionability"] as const;
export const MIN_CANDIDATE_POOL = 3;
export const MAX_CANDIDATE_POOL = 50;
export const DEFAULT_CANDIDATE_POOL = 10;

import type { PluginLogger, PluginRuntime } from "openclaw";

export type ScheduleSpec =
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

export type CronJob = {
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

export type CronListResult = {
  jobs?: CronJob[];
};

export type CronCommandDeps = {
  runtime: PluginRuntime;
  logger: PluginLogger;
};

export type DeliveryTarget = {
  mode: "announce" | "none";
  channel: string;
  to?: string;
  display: string;
};

export type ScoreWeights = {
  relevance: number;
  novelty: number;
  authority: number;
  actionability: number;
};

export type SubscriptionOptions = {
  scheduleTokens: string[];
  channelOverride?: string;
  toOverride?: string;
  noDeliver: boolean;
  topic?: string;
  message?: string;
  maxPapers?: number;
  recencyDays?: number;
  sources?: string[];
  candidatePool?: number;
  scoreWeights?: ScoreWeights;
};

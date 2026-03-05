import type { PluginCommandContext } from "openclaw";
import { ALLOWED_DELIVERY_CHANNELS, DELIVERY_LAST_ALIASES } from "./constants.js";
import type { DeliveryTarget, SubscriptionOptions } from "./types.js";

export function sanitizeIdPart(value: string | undefined): string {
  const cleaned = (value ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 48) || "unknown";
}

export function buildScopedJobName(ctx: PluginCommandContext): string {
  const channel = sanitizeIdPart(ctx.channel);
  const sender = sanitizeIdPart(ctx.senderId);
  return `scientify-report-${channel}-${sender}`;
}

export function normalizeDeliveryChannelOverride(value: string): string {
  const channel = value.trim().toLowerCase();
  return DELIVERY_LAST_ALIASES.has(channel) ? "last" : channel;
}

export function resolveDeliveryTarget(
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
    const channel = normalizeDeliveryChannelOverride(opts.channelOverride);
    const displayChannel =
      channel === "last" && opts.channelOverride !== "last"
        ? `last(${opts.channelOverride.toLowerCase()})`
        : channel;
    if (channel !== "last" && !ALLOWED_DELIVERY_CHANNELS.has(channel)) {
      return {
        error:
          "Error: unsupported channel override. Try one of: feishu, telegram, slack, discord, last (or aliases: webui, tui).",
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
      display: `${displayChannel}${opts.toOverride ? `:${opts.toOverride}` : ""}`,
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

export function buildStateScopeKey(ctx: PluginCommandContext, delivery: DeliveryTarget): string {
  const channel =
    delivery.channel && delivery.channel !== "last"
      ? delivery.channel
      : (ctx.channel ?? "").trim().toLowerCase() || "unknown";
  const target = (delivery.to ?? ctx.senderId ?? "unknown").trim();
  return `${sanitizeIdPart(channel)}:${sanitizeIdPart(target)}`;
}

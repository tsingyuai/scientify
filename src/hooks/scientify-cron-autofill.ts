type BeforeToolCallEvent = {
  toolName: string;
  params?: Record<string, unknown>;
};

type BeforeToolCallContext = {
  sessionKey?: string;
  agentId?: string;
  channel?: string;
  senderId?: string;
};

const CHANNELS_WITH_TARGET = new Set([
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

type Origin = {
  channel?: string;
  senderId?: string;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readLowerString(value: unknown): string | undefined {
  const raw = readString(value);
  return raw ? raw.toLowerCase() : undefined;
}

function splitSessionKeyParts(sessionKey: string): string[] {
  // OpenClaw may append thread suffix: ...:thread:<id>
  // Strip that suffix first to avoid treating thread id as peer id.
  const lower = sessionKey.toLowerCase();
  const threadIndex = lower.lastIndexOf(":thread:");
  const base = threadIndex >= 0 ? sessionKey.slice(0, threadIndex) : sessionKey;
  return base.split(":").filter((part) => part.length > 0);
}

function joinParts(parts: string[], start: number): string | undefined {
  const joined = parts.slice(start).join(":").trim();
  return joined.length > 0 ? joined : undefined;
}

function deriveFromSessionKey(sessionKey?: string): Origin {
  const raw = readString(sessionKey);
  if (!raw) return {};

  // Canonical OpenClaw patterns:
  // - agent:<agentId>:<channel>:direct:<peerId>
  // - agent:<agentId>:<channel>:<accountId>:direct:<peerId>
  // - agent:<agentId>:<channel>:group:<peerId>
  // - agent:<agentId>:direct:<peerId>
  const parts = splitSessionKeyParts(raw);
  if (parts.length < 3 || parts[0].toLowerCase() !== "agent") return {};

  const rest = parts.slice(2);
  if (rest.length === 0) return {};

  const token0 = rest[0]?.toLowerCase();
  const token1 = rest[1]?.toLowerCase();
  const token2 = rest[2]?.toLowerCase();

  // agent:<agentId>:direct:<peerId>
  if (token0 === "direct" || token0 === "dm") {
    return { senderId: joinParts(rest, 1) };
  }

  // agent:<agentId>:<channel>:direct:<peerId>
  if (token1 === "direct" || token1 === "dm") {
    return {
      channel: token0,
      senderId: joinParts(rest, 2),
    };
  }

  // agent:<agentId>:<channel>:<accountId>:direct:<peerId>
  if (token2 === "direct" || token2 === "dm") {
    return {
      channel: token0,
      senderId: joinParts(rest, 3),
    };
  }

  // Non-direct session (group/channel/thread), peer id is still a valid delivery target.
  if (rest.length >= 3) {
    return {
      channel: token0,
      senderId: joinParts(rest, 2),
    };
  }

  return { channel: token0 };
}

function deriveOrigin(context: BeforeToolCallContext): Origin {
  const fromContext: Origin = {
    channel: readLowerString(context.channel),
    senderId: readString(context.senderId),
  };

  if (fromContext.channel && fromContext.senderId) {
    return fromContext;
  }

  const fromSession = deriveFromSessionKey(context.sessionKey);
  return {
    channel: fromContext.channel ?? fromSession.channel,
    senderId: fromContext.senderId ?? fromSession.senderId,
  };
}

function sanitizeScopePart(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "unknown";
}

export function createScientifyCronAutofillHook() {
  return (
    event: BeforeToolCallEvent,
    context: BeforeToolCallContext,
  ): { params: Record<string, unknown> } | void => {
    if (event.toolName !== "scientify_cron_job") return;

    const params = event.params ?? {};
    const action = readLowerString(params.action);
    if (action !== "upsert") return;

    if (params.no_deliver === true) return;

    const explicitChannel = readLowerString(params.channel);
    const explicitTo = readString(params.to);
    const explicitScope = readString(params.scope);

    const origin = deriveOrigin(context);
    const originChannel = readLowerString(origin.channel);
    const originSender = readString(origin.senderId);

    let nextChannel = explicitChannel;
    let nextTo = explicitTo;
    let nextScope = explicitScope;

    if (!nextChannel && originChannel && CHANNELS_WITH_TARGET.has(originChannel)) {
      nextChannel = originChannel;
    }

    if (!nextTo && nextChannel && nextChannel !== "last" && originSender) {
      if (!originChannel || originChannel === nextChannel) {
        nextTo = originSender;
      }
    }

    // Avoid global scope collisions across users when tool calls omit scope.
    if (!nextScope && nextChannel && nextTo) {
      nextScope = `${sanitizeScopePart(nextChannel)}-${sanitizeScopePart(nextTo)}`;
    }

    if (nextChannel === explicitChannel && nextTo === explicitTo && nextScope === explicitScope) {
      return;
    }

    return {
      params: {
        ...params,
        ...(nextChannel ? { channel: nextChannel } : {}),
        ...(nextTo ? { to: nextTo } : {}),
        ...(nextScope ? { scope: nextScope } : {}),
      },
    };
  };
}

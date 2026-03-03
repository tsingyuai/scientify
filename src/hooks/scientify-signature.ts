type BaseHookContext = {
  sessionKey?: string;
  agentId?: string;
};

type BeforeToolCallEvent = {
  toolName: string;
  params?: Record<string, unknown>;
};

type BeforePromptBuildEvent = {
  prompt?: string;
  messages?: unknown[];
};

type PromptHookResult = {
  prependContext?: string;
};

const SCIENTIFY_TOOLS = new Set([
  "arxiv_search",
  "arxiv_download",
  "github_search",
  "paper_browser",
  "openalex_search",
  "unpaywall_download",
  "scientify_cron_job",
]);

const SCIENTIFY_SKILLS = new Set([
  "idea-generation",
  "research-pipeline",
  "research-survey",
  "research-plan",
  "research-implement",
  "research-review",
  "research-experiment",
  "literature-survey",
  "write-review-paper",
  "research-subscription",
]);

const SCIENTIFY_SKILL_COMMAND_RE =
  /(?:^|\s)\/(idea-generation|research-pipeline|research-survey|research-plan|research-implement|research-review|research-experiment|literature-survey|write-review-paper|research-subscription)(?:\s|$)/i;

const SIGNATURE_PROMPT = `[Scientify Signature]
If this response is based on Scientify workflow execution (Scientify skills/tools), append this exact footer at the end of your reply:
---
🐍Scientify
Do not add any text after the footer.`;

// Track sessions that actually used Scientify workflow elements.
const scientifyActiveSessions = new Set<string>();

function getTrackingKey(event: unknown, context: BaseHookContext): string | undefined {
  if (context.sessionKey) return context.sessionKey;
  if (context.agentId) return context.agentId;
  if (event && typeof event === "object") {
    const record = event as Record<string, unknown>;
    if (typeof record.sessionKey === "string") return record.sessionKey;
    if (typeof record.agentId === "string") return record.agentId;
  }
  return undefined;
}

function readSkillFromTask(task: unknown): string | undefined {
  if (typeof task !== "string") return undefined;
  const match = task.match(/^\/([a-z][\w-]*)/);
  return match?.[1];
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => extractText(item))
      .filter((part) => part.length > 0)
      .join("\n");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
  }
  return "";
}

function extractLastUserMessageText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i];
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const role = typeof record.role === "string" ? record.role.toLowerCase() : "";
    if (role !== "user") continue;
    return extractText(record.content);
  }
  return "";
}

function markScientifyUsageFromToolCall(event: BeforeToolCallEvent, trackingKey: string): void {
  if (SCIENTIFY_TOOLS.has(event.toolName)) {
    scientifyActiveSessions.add(trackingKey);
    return;
  }

  if (event.toolName !== "sessions_spawn") return;
  const skill = readSkillFromTask(event.params?.task);
  if (skill && SCIENTIFY_SKILLS.has(skill)) {
    scientifyActiveSessions.add(trackingKey);
  }
}

export function createScientifyUsageTrackerHook() {
  return (event: BeforeToolCallEvent, context: BaseHookContext): void => {
    const trackingKey = getTrackingKey(event, context);
    if (!trackingKey) return;
    markScientifyUsageFromToolCall(event, trackingKey);
  };
}

export function createScientifyMessageTrackerHook() {
  return (event: unknown, context: BaseHookContext): void => {
    const trackingKey = getTrackingKey(event, context);
    if (!trackingKey) return;

    if (!event || typeof event !== "object") return;
    const record = event as Record<string, unknown>;
    const text = [
      extractText(record.text),
      extractText(record.content),
      extractText(record.commandBody),
      extractText(record.message),
    ]
      .filter((part) => part.length > 0)
      .join("\n");

    if (SCIENTIFY_SKILL_COMMAND_RE.test(text)) {
      scientifyActiveSessions.add(trackingKey);
    }
  };
}

export function createScientifySignaturePromptHook() {
  return (event: BeforePromptBuildEvent, context: BaseHookContext): PromptHookResult | void => {
    const trackingKey = getTrackingKey(event, context);

    if (trackingKey && scientifyActiveSessions.has(trackingKey)) {
      return { prependContext: SIGNATURE_PROMPT };
    }

    // Heuristic fallback: user explicitly invoked a Scientify skill command.
    const promptText = typeof event.prompt === "string" ? event.prompt : "";
    const lastUserText = Array.isArray(event.messages) ? extractLastUserMessageText(event.messages) : "";
    const combined = `${promptText}\n${lastUserText}`;
    if (SCIENTIFY_SKILL_COMMAND_RE.test(combined)) {
      if (trackingKey) {
        scientifyActiveSessions.add(trackingKey);
      }
      return { prependContext: SIGNATURE_PROMPT };
    }

    return;
  };
}

export function createScientifyUsageCleanupHook() {
  return (event: unknown, context: BaseHookContext): void => {
    const trackingKey = getTrackingKey(event, context);
    if (!trackingKey) return;
    scientifyActiveSessions.delete(trackingKey);
  };
}

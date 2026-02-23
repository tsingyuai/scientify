/**
 * Hook types (simplified for plugin use)
 */
type HookEvent = {
  prompt: string;
  messages?: unknown[];
};

type HookContext = {
  agentId?: string;
  sessionKey?: string;
  workspaceDir?: string;
};

type HookResult = {
  prependContext?: string;
  systemPrompt?: string;
};

/**
 * Concise research mode prompt.
 * Injected only on session first message; persists via message history.
 * Complements <available_skills> XML (which already lists skill descriptions).
 */
const RESEARCH_MODE_PROMPT = `[Scientify] For academic research tasks, match a skill from <available_skills> and read its SKILL.md before acting. Research projects are managed under $W/projects/<topic>/.`;

/**
 * Creates the research mode hook.
 * Only injects on the first message of a session (messages array empty).
 * Subsequent messages retain it via conversation history.
 */
export function createResearchModeHook() {
  return (event: HookEvent, _context: HookContext): HookResult => {
    if (!event.messages || event.messages.length === 0) {
      return { prependContext: RESEARCH_MODE_PROMPT };
    }
    return {};
  };
}

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Hook for injecting SKILL.md content into cron session messages.
 *
 * When a cron job fires with a heartbeat message starting with `/skill-name`,
 * this hook reads the matching SKILL.md from the agent's workspace and
 * prepends its body to the message, so the agent receives full workflow
 * instructions in the isolated cron session.
 */
export function createCronSkillInjectionHook() {
  return async (
    event: { payload?: { message?: string }; [key: string]: unknown },
    ctx: { sessionType?: string; agentWorkspace?: string; [key: string]: unknown },
  ): Promise<{ payload: Record<string, unknown> } | void> => {
    // Only process cron sessions
    if (ctx.sessionType !== "cron") return;

    const message = event.payload?.message;
    if (typeof message !== "string") return;

    // Extract /skill-name from the first line
    const match = message.match(/^\/([a-z][\w-]*)/);
    if (!match) return;
    const skillName = match[1];

    // Resolve agent workspace
    const workspace = ctx.agentWorkspace;
    if (typeof workspace !== "string") return;

    const skillPath = path.join(workspace, "skills", skillName, "SKILL.md");

    let content: string;
    try {
      content = await fs.readFile(skillPath, "utf-8");
    } catch {
      // No SKILL.md found in workspace — skip
      return;
    }

    // Strip YAML frontmatter
    const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
    if (!body) return;

    // Inject skill body after the first line (/skill-name), before the rest
    const firstNewline = message.indexOf("\n");
    const newMessage =
      firstNewline === -1
        ? message + "\n\n" + body
        : message.slice(0, firstNewline) +
          "\n\n" +
          body +
          "\n\n" +
          message.slice(firstNewline + 1);

    return { payload: { ...event.payload, message: newMessage } };
  };
}

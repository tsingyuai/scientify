import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

/**
 * Build a before_tool_call hook that injects SKILL.md content into
 * sessions_spawn task parameters.
 *
 * When the orchestrator spawns a sub-agent with task="/research-survey\n...",
 * this hook reads the matching SKILL.md and appends its body to the task,
 * so the sub-agent receives full workflow instructions even though its
 * system prompt runs in "minimal" mode (no <available_skills> section).
 */

/**
 * Find the plugin root by walking up from a starting directory until
 * we find openclaw.plugin.json (the canonical plugin manifest).
 * Falls back to the starting directory if not found.
 */
function findPluginRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (fsSync.existsSync(path.join(dir, "openclaw.plugin.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return startDir;
}

export function createSkillInjectionHook(entryFileDir: string) {
  const pluginRoot = findPluginRoot(entryFileDir);
  const skillsDir = path.join(pluginRoot, "skills");

  return async (
    event: { toolName: string; params: Record<string, unknown> },
    _ctx: { agentId?: string; sessionKey?: string; toolName: string },
  ): Promise<{ params: Record<string, unknown> } | void> => {
    if (event.toolName !== "sessions_spawn") return;

    const task = event.params?.task;
    if (typeof task !== "string") return;

    // Extract /skill-name from the first line
    const match = task.match(/^\/([a-z][\w-]*)/);
    if (!match) return;
    const skillName = match[1];

    const skillMdPath = path.join(skillsDir, skillName, "SKILL.md");
    let content: string;
    try {
      content = await fs.readFile(skillMdPath, "utf-8");
    } catch {
      // No SKILL.md for this skill — not one of ours, skip
      return;
    }

    // Strip YAML frontmatter (---\n...\n---)
    const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
    if (!body) return;

    // Inject after the first line (/skill-name), before the rest of the context.
    const firstNewline = task.indexOf("\n");
    const newTask =
      firstNewline === -1
        ? task + "\n\n" + body
        : task.slice(0, firstNewline) +
          "\n\n" +
          body +
          "\n\n" +
          task.slice(firstNewline + 1);

    return { params: { ...event.params, task: newTask } };
  };
}

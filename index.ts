import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  handleResearchStatus,
  handlePapers,
  handleIdeas,
  handleProjects,
  handleProjectSwitch,
  handleProjectDelete,
} from "./src/commands.js";
import { createArxivSearchTool } from "./src/tools/arxiv-search.js";
import { createOpenAlexSearchTool } from "./src/tools/openalex-search.js";
import { createSkillInjectionHook } from "./src/hooks/inject-skill.js";
import { createCronSkillInjectionHook } from "./src/hooks/cron-skill-inject.js";
import { registerResearchCli } from "./src/cli/research.js";
import { handleMetabolismStatus } from "./src/commands/metabolism-status.js";

const scientifyPlugin = {
  id: "scientify",
  name: "Scientify",
  description: "Continuous AI research workflow for survey, planning, implementation, review, experimentation, and writing",
  register(api: OpenClawPluginApi) {
    // Register tools
    api.registerTool(createArxivSearchTool());
    api.registerTool(createOpenAlexSearchTool());

    // Register chat commands (bypass LLM)
    api.registerCommand({
      name: "research-status",
      description: "Show research workspace status (active project, papers, ideas)",
      acceptsArgs: false,
      requireAuth: false,
      handler: handleResearchStatus,
    });

    api.registerCommand({
      name: "papers",
      description: "List downloaded papers in active project",
      acceptsArgs: true,
      requireAuth: false,
      handler: handlePapers,
    });

    api.registerCommand({
      name: "ideas",
      description: "List generated ideas in active project",
      acceptsArgs: true,
      requireAuth: false,
      handler: handleIdeas,
    });

    api.registerCommand({
      name: "projects",
      description: "List all research projects",
      acceptsArgs: false,
      requireAuth: false,
      handler: handleProjects,
    });

    api.registerCommand({
      name: "project-switch",
      description: "Switch to a different research project",
      acceptsArgs: true,
      requireAuth: false,
      handler: handleProjectSwitch,
    });

    api.registerCommand({
      name: "project-delete",
      description: "Delete a research project (use --force to confirm)",
      acceptsArgs: true,
      requireAuth: true,
      handler: handleProjectDelete,
    });

    // Inject SKILL.md content into sessions_spawn tasks.
    api.on("before_tool_call", createSkillInjectionHook(path.dirname(api.source)));

    // Inject SKILL.md into cron session messages (for metabolism heartbeat).
    api.on("before_agent_start", createCronSkillInjectionHook());

    // Register CLI commands: openclaw research init/list/status/delete
    registerResearchCli(api);

    // Register metabolism chat commands
    api.registerCommand({
      name: "metabolism-status",
      description: "Show knowledge metabolism status (day, topics, hypotheses)",
      acceptsArgs: false,
      requireAuth: false,
      handler: handleMetabolismStatus,
    });

    api.logger.info("Scientify plugin loaded");
  },
};

export default scientifyPlugin;

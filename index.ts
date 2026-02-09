import path from "node:path";
import type { OpenClawPluginApi } from "openclaw";
import {
  handleResearchStatus,
  handlePapers,
  handleIdeas,
  handleProjects,
  handleProjectSwitch,
  handleProjectDelete,
} from "./src/commands.js";
import { createArxivSearchTool } from "./src/tools/arxiv-search.js";
import { createArxivDownloadTool } from "./src/tools/arxiv-download.js";
import { createGithubSearchTool } from "./src/tools/github-search-tool.js";
import { createAutoUpdaterService } from "./src/services/auto-updater.js";
import { createSkillInjectionHook } from "./src/hooks/inject-skill.js";

// Default: check every hour
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export default function register(api: OpenClawPluginApi) {
  // Register tools
  api.registerTool(createArxivSearchTool());
  api.registerTool(createArxivDownloadTool());
  api.registerTool(createGithubSearchTool());

  // Register auto-updater service (silent updates)
  const pluginConfig = api.pluginConfig as { autoUpdate?: boolean } | undefined;
  const autoUpdateEnabled = pluginConfig?.autoUpdate !== false; // enabled by default

  if (autoUpdateEnabled) {
    api.registerService(
      createAutoUpdaterService({
        packageName: "scientify",
        checkIntervalMs: UPDATE_CHECK_INTERVAL_MS,
        logger: {
          info: (msg) => api.logger.info(msg),
          warn: (msg) => api.logger.warn(msg),
          debug: (msg) => api.logger.debug?.(msg),
        },
      })
    );
  }

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
    requireAuth: true, // Require auth for destructive operation
    handler: handleProjectDelete,
  });

  // Inject SKILL.md content into sessions_spawn tasks.
  // Sub-agents run in "minimal" prompt mode and don't see <available_skills>,
  // so this hook reads the matching SKILL.md and embeds it in the task body.
  // api.source = entry file path (e.g. dist/index.js); findPluginRoot() walks
  // up to locate openclaw.plugin.json, which is always at the plugin root.
  api.on("before_tool_call", createSkillInjectionHook(path.dirname(api.source)));

  api.logger.info("Scientify plugin loaded successfully");
}

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
import {
  createResearchSubscribeHandler,
  createResearchSubscriptionsHandler,
  createResearchUnsubscribeHandler,
} from "./src/research-subscriptions.js";
import { createArxivSearchTool } from "./src/tools/arxiv-search.js";
import { createArxivDownloadTool } from "./src/tools/arxiv-download.js";
import { createGithubSearchTool } from "./src/tools/github-search-tool.js";
import { createPaperBrowserTool } from "./src/tools/paper-browser.js";
import { createOpenAlexSearchTool } from "./src/tools/openalex-search.js";
import { createOpenReviewLookupTool } from "./src/tools/openreview-lookup.js";
import { createUnpaywallDownloadTool } from "./src/tools/unpaywall-download.js";
import { createScientifyCronTool } from "./src/tools/scientify-cron.js";
import { createScientifyLiteratureStateTool } from "./src/tools/scientify-literature-state.js";
import { createAutoUpdaterService } from "./src/services/auto-updater.js";
import { createSkillInjectionHook } from "./src/hooks/inject-skill.js";
import { createResearchModeHook } from "./src/hooks/research-mode.js";
import { createScientifyCronAutofillHook } from "./src/hooks/scientify-cron-autofill.js";
import {
  createScientifyMessageTrackerHook,
  createScientifySignaturePromptHook,
  createScientifyUsageCleanupHook,
  createScientifyUsageTrackerHook,
} from "./src/hooks/scientify-signature.js";
import { createCronSkillInjectionHook } from "./src/hooks/cron-skill-inject.js";
import { registerResearchCli } from "./src/cli/research.js";
import { handleMetabolismStatus } from "./src/commands/metabolism-status.js";

// Default: check every hour
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export default function register(api: OpenClawPluginApi) {
  // Register tools
  api.registerTool(createArxivSearchTool());
  api.registerTool(createArxivDownloadTool());
  api.registerTool(createGithubSearchTool());
  api.registerTool(createPaperBrowserTool());
  api.registerTool(createOpenAlexSearchTool());
  api.registerTool(createOpenReviewLookupTool());
  api.registerTool(createUnpaywallDownloadTool());
  api.registerTool(createScientifyCronTool({ runtime: api.runtime, logger: api.logger }));
  api.registerTool(createScientifyLiteratureStateTool());

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

  api.registerCommand({
    name: "research-subscribe",
    description:
      "Create/update a scheduled Scientify job (research digest or reminder). Example: /research-subscribe daily 09:00 Asia/Shanghai",
    acceptsArgs: true,
    requireAuth: false,
    handler: createResearchSubscribeHandler({ runtime: api.runtime, logger: api.logger }),
  });

  api.registerCommand({
    name: "research-subscriptions",
    description: "Show your Scientify scheduled jobs",
    acceptsArgs: false,
    requireAuth: false,
    handler: createResearchSubscriptionsHandler({ runtime: api.runtime, logger: api.logger }),
  });

  api.registerCommand({
    name: "research-unsubscribe",
    description: "Remove your Scientify scheduled jobs (or pass a specific job id)",
    acceptsArgs: true,
    requireAuth: false,
    handler: createResearchUnsubscribeHandler({ runtime: api.runtime, logger: api.logger }),
  });

  // Inject SKILL.md content into sessions_spawn tasks.
  // Sub-agents run in "minimal" prompt mode and don't see <available_skills>,
  // so this hook reads the matching SKILL.md and embeds it in the task body.
  // api.source = entry file path (e.g. dist/index.js); findPluginRoot() walks
  // up to locate openclaw.plugin.json, which is always at the plugin root.
  api.on("before_tool_call", createSkillInjectionHook(path.dirname(api.source)));

  // Track whether a session actually used Scientify skills/tools.
  // The signature is prompt-driven (model-generated), not post-processed.
  api.on("before_tool_call", createScientifyUsageTrackerHook());
  // Auto-fill cron delivery target from current conversation origin when omitted.
  api.on("before_tool_call", createScientifyCronAutofillHook());
  api.on("message_received", createScientifyMessageTrackerHook());
  api.on("session_end", createScientifyUsageCleanupHook());

  // Inject prompts at agent start so they affect the current turn.
  // OpenClaw runs this hook before model execution and merges prependContext.
  api.on("before_agent_start", createResearchModeHook(), {
    priority: 100, // High priority to inject early
  });
  api.on("before_agent_start", createScientifySignaturePromptHook(), {
    priority: 90,
  });

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
}

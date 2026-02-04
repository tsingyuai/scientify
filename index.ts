import type { OpenClawPluginApi } from "openclaw";
import {
  handleResearchStatus,
  handlePapers,
  handleIdeas,
  handleProjects,
  handleProjectSwitch,
  handleProjectDelete,
} from "./src/commands.js";
import { createArxivTool } from "./src/tools/arxiv-tool.js";

export default function register(api: OpenClawPluginApi) {
  // Register the arxiv tool
  api.registerTool(createArxivTool());

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

  api.logger.info("Scientify plugin loaded successfully");
}

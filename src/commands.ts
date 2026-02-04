import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { PluginCommandContext, PluginCommandResult } from "openclaw";

const WORKSPACE_ROOT = path.join(os.homedir(), ".openclaw", "workspace", "projects");

interface ProjectMeta {
  id: string;
  name: string;
  created: string;
  topics?: string[];
}

function getActiveProject(): string | null {
  const activePath = path.join(WORKSPACE_ROOT, ".active");
  try {
    return fs.readFileSync(activePath, "utf-8").trim();
  } catch {
    return null;
  }
}

function getProjectMeta(projectId: string): ProjectMeta | null {
  const metaPath = path.join(WORKSPACE_ROOT, projectId, "project.json");
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

function listProjects(): string[] {
  try {
    return fs
      .readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {
    // ignore
  }
  return size;
}

function countFiles(dirPath: string, pattern?: RegExp): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countFiles(fullPath, pattern);
      } else if (!pattern || pattern.test(entry.name)) {
        count++;
      }
    }
  } catch {
    // ignore
  }
  return count;
}

/**
 * /research-status - Show workspace status
 */
export function handleResearchStatus(_ctx: PluginCommandContext): PluginCommandResult {
  const activeProject = getActiveProject();
  const projects = listProjects();

  let output = "📁 **Research Workspace Status**\n\n";
  output += `Root: \`${WORKSPACE_ROOT}\`\n`;
  output += `Active: ${activeProject ? `**${activeProject}**` : "(none)"}\n\n`;

  if (projects.length === 0) {
    output += "_No projects found. Use /idea-generation to create one._";
  } else {
    output += "**Projects:**\n";
    for (const proj of projects) {
      const isActive = proj === activeProject;
      const papersCount = countFiles(path.join(WORKSPACE_ROOT, proj, "papers"));
      const ideasCount = countFiles(path.join(WORKSPACE_ROOT, proj, "ideas"), /\.md$/);
      let reposCount = 0;
      try {
        const reposDir = path.join(WORKSPACE_ROOT, proj, "repos");
        if (fs.existsSync(reposDir)) {
          reposCount = fs
            .readdirSync(reposDir, { withFileTypes: true })
            .filter((d) => d.isDirectory()).length;
        }
      } catch {
        // ignore
      }

      const marker = isActive ? "● " : "  ";
      output += `${marker}\`${proj}\` (papers: ${papersCount}, ideas: ${ideasCount}, repos: ${reposCount})\n`;
    }
  }

  return { text: output };
}

/**
 * /papers - List downloaded papers
 */
export function handlePapers(ctx: PluginCommandContext): PluginCommandResult {
  const projectId = ctx.args?.trim() || getActiveProject();
  if (!projectId) {
    return { text: "❌ No active project. Use: `/papers <project-id>`" };
  }

  const papersDir = path.join(WORKSPACE_ROOT, projectId, "papers");
  if (!fs.existsSync(papersDir)) {
    return { text: `📄 **Papers in ${projectId}**\n\n_No papers directory found._` };
  }

  let output = `📄 **Papers in ${projectId}**\n\n`;
  const entries = fs.readdirSync(papersDir, { withFileTypes: true });
  let hasItems = false;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const paperDir = path.join(papersDir, entry.name);
      const texFiles = fs.readdirSync(paperDir).filter((f) => f.endsWith(".tex"));
      output += `  [tex] \`${entry.name}\` (${texFiles.length} files)\n`;
      hasItems = true;
    } else if (entry.name.endsWith(".pdf")) {
      const size = formatSize(fs.statSync(path.join(papersDir, entry.name)).size);
      output += `  [pdf] \`${entry.name.replace(".pdf", "")}\` (${size})\n`;
      hasItems = true;
    }
  }

  if (!hasItems) {
    output += "_No papers downloaded yet._";
  }

  return { text: output };
}

/**
 * /ideas - List generated ideas
 */
export function handleIdeas(ctx: PluginCommandContext): PluginCommandResult {
  const projectId = ctx.args?.trim() || getActiveProject();
  if (!projectId) {
    return { text: "❌ No active project. Use: `/ideas <project-id>`" };
  }

  const ideasDir = path.join(WORKSPACE_ROOT, projectId, "ideas");
  if (!fs.existsSync(ideasDir)) {
    return { text: `💡 **Ideas in ${projectId}**\n\n_No ideas directory found._` };
  }

  let output = `💡 **Ideas in ${projectId}**\n\n`;
  const files = fs.readdirSync(ideasDir).filter((f) => f.endsWith(".md"));

  if (files.length === 0) {
    output += "_No ideas generated yet._";
  } else {
    for (const file of files) {
      const content = fs.readFileSync(path.join(ideasDir, file), "utf-8");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : file;
      const isSelected = file === "selected_idea.md";
      const marker = isSelected ? "⭐ " : "   ";
      output += `${marker}\`${file.padEnd(22)}\` ${title}\n`;
    }
  }

  return { text: output };
}

/**
 * /projects - List all research projects
 */
export function handleProjects(_ctx: PluginCommandContext): PluginCommandResult {
  const activeProject = getActiveProject();
  const projects = listProjects();

  let output = "📂 **Research Projects**\n\n";

  if (projects.length === 0) {
    output += "_No projects found._";
  } else {
    for (const proj of projects) {
      const isActive = proj === activeProject;
      const meta = getProjectMeta(proj);
      const marker = isActive ? "● " : "  ";
      output += `${marker}**${proj}**\n`;
      if (meta?.name) output += `    name: ${meta.name}\n`;
      if (meta?.created) output += `    created: ${meta.created}\n`;
      if (meta?.topics?.length) output += `    topics: ${meta.topics.join(", ")}\n`;
    }
  }

  return { text: output };
}

/**
 * /project-switch <project-id> - Switch to a different project
 */
export function handleProjectSwitch(ctx: PluginCommandContext): PluginCommandResult {
  const projectId = ctx.args?.trim();
  if (!projectId) {
    return { text: "❌ Usage: `/project-switch <project-id>`" };
  }

  const projectPath = path.join(WORKSPACE_ROOT, projectId);
  if (!fs.existsSync(projectPath)) {
    return { text: `❌ Project '${projectId}' not found.` };
  }

  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE_ROOT, ".active"), projectId);
  return { text: `✓ Switched to project '**${projectId}**'` };
}

/**
 * /project-delete <project-id> - Delete a research project
 */
export function handleProjectDelete(ctx: PluginCommandContext): PluginCommandResult {
  const projectId = ctx.args?.trim();
  if (!projectId) {
    return { text: "❌ Usage: `/project-delete <project-id>`" };
  }

  const projectPath = path.join(WORKSPACE_ROOT, projectId);
  if (!fs.existsSync(projectPath)) {
    return { text: `❌ Project '${projectId}' not found.` };
  }

  const size = formatSize(getDirSize(projectPath));
  const papersCount = countFiles(path.join(projectPath, "papers"));
  const ideasCount = countFiles(path.join(projectPath, "ideas"), /\.md$/);

  // For safety, we'll return info and ask for confirmation
  // Note: Plugin commands don't support interactive confirmation,
  // so we provide a force flag via the args
  if (!ctx.args?.includes("--force")) {
    return {
      text:
        `⚠️ **About to delete:**\n\n` +
        `- Project: \`${projectId}\`\n` +
        `- Papers: ${papersCount}\n` +
        `- Ideas: ${ideasCount}\n` +
        `- Size: ${size}\n\n` +
        `To confirm, use: \`/project-delete ${projectId} --force\``,
    };
  }

  // Clear active if this is the active project
  const activeProject = getActiveProject();
  if (activeProject === projectId) {
    try {
      fs.unlinkSync(path.join(WORKSPACE_ROOT, ".active"));
    } catch {
      // ignore
    }
  }

  // Delete the project directory
  fs.rmSync(projectPath, { recursive: true, force: true });
  return { text: `✓ Deleted project '**${projectId}**'` };
}

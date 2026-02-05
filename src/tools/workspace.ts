/**
 * Workspace utilities for tools that need to access project directories.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const WORKSPACE_ROOT = path.join(os.homedir(), ".openclaw", "workspace", "projects");

export class NoActiveProjectError extends Error {
  constructor() {
    super(
      "No active project set. Please create a project first:\n" +
      "1. mkdir -p ~/.openclaw/workspace/projects/{project-id}/{survey,papers,ideas,repos}\n" +
      "2. echo '{project-id}' > ~/.openclaw/workspace/projects/.active\n" +
      "Or specify output_dir explicitly."
    );
    this.name = "NoActiveProjectError";
  }
}

/**
 * Get the active project ID.
 * @throws NoActiveProjectError if no project is active
 */
export function getActiveProject(): string {
  const activePath = path.join(WORKSPACE_ROOT, ".active");
  try {
    const activeProject = fs.readFileSync(activePath, "utf-8").trim();
    if (activeProject) {
      return activeProject;
    }
  } catch {
    // File doesn't exist
  }
  throw new NoActiveProjectError();
}

/**
 * Get the active project's root directory.
 * @throws NoActiveProjectError if no project is active
 */
export function getActiveProjectDir(): string {
  return path.join(WORKSPACE_ROOT, getActiveProject());
}

/**
 * Get a subdirectory of the active project.
 * @param subdir - Subdirectory name (e.g., "papers", "survey", "ideas")
 * @throws NoActiveProjectError if no project is active
 */
export function getProjectSubdir(subdir: string): string {
  return path.join(getActiveProjectDir(), subdir);
}

/**
 * Check if there's an active project without throwing.
 */
export function hasActiveProject(): boolean {
  try {
    getActiveProject();
    return true;
  } catch {
    return false;
  }
}

export const Workspace = {
  root: WORKSPACE_ROOT,
  getActiveProject,
  getActiveProjectDir,
  getProjectSubdir,
  hasActiveProject,
  NoActiveProjectError,
};

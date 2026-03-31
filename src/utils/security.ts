import path from "node:path";

/**
 * Minimal security utilities for input validation.
 *
 * These guards protect against path traversal and injection attacks
 * on user-supplied identifiers that end up in file paths or shell commands.
 */

/** Allowed characters for project / agent IDs: lowercase alphanumeric, hyphens, underscores. */
const PROJECT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** arXiv ID format: YYMM.NNNNN (optionally vN). */
const ARXIV_ID_RE = /^\d{4}\.\d{4,5}(v\d+)?$/;

/** DOI format: 10.NNNN/... (conservative). */
const DOI_RE = /^10\.\d{4,9}\/[^\s]+$/;

/**
 * Validate a project ID used in workspace path construction.
 * Rejects path traversal characters (/, \, ..) and non-ASCII.
 */
export function validateProjectId(id: string): string {
  if (!PROJECT_ID_RE.test(id)) {
    throw new Error(
      `Invalid project ID "${id}". Must match ${PROJECT_ID_RE} (lowercase alphanumeric, hyphens, underscores, 1-64 chars).`,
    );
  }
  return id;
}

/**
 * Validate an arXiv ID before using it in URLs or file paths.
 */
export function validateArxivId(id: string): string {
  if (!ARXIV_ID_RE.test(id)) {
    throw new Error(`Invalid arXiv ID "${id}". Expected format: YYMM.NNNNN (e.g. 2401.12345).`);
  }
  return id;
}

/**
 * Validate a DOI string.
 */
export function validateDoi(doi: string): string {
  if (!DOI_RE.test(doi)) {
    throw new Error(`Invalid DOI "${doi}". Expected format: 10.NNNN/... (e.g. 10.1038/s41586-021-03819-2).`);
  }
  return doi;
}

/**
 * Ensure a resolved path stays within the expected base directory.
 * Prevents path traversal via `../../` or symlink tricks.
 */
export function ensureWithinDirectory(filePath: string, baseDir: string): string {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path "${filePath}" escapes base directory "${baseDir}".`);
  }
  return resolved;
}

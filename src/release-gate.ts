import * as fs from "node:fs";
import * as path from "node:path";

export type ReleaseVerdict = "HOLD" | "CONDITIONAL_GO" | "GO";

interface ReleaseGateFile {
  release_verdict: ReleaseVerdict;
  generated_at?: string;
  review_scope?: string[];
  blocking_findings?: number;
  p1_findings?: number;
  checked_files?: string[];
  stale_if_any_newer_than?: string[];
}

export interface ReleaseGateStatus {
  state: "missing" | "invalid" | "fresh" | "stale";
  verdict?: ReleaseVerdict;
  gatePath: string;
  checkedFiles: string[];
  staleReasons: string[];
  generatedAt?: string;
}

function isReleaseVerdict(value: unknown): value is ReleaseVerdict {
  return value === "HOLD" || value === "CONDITIONAL_GO" || value === "GO";
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function defaultReleaseGateInputs(workspace: string): string[] {
  const candidates = [
    "paper/draft.md",
    "paper/claim_inventory.md",
    "paper/figures_manifest.md",
    "README.md",
    "docs/index.html",
  ];

  return candidates.filter((relativePath) => fs.existsSync(path.join(workspace, relativePath)));
}

function resolveWorkspacePath(workspace: string, candidate: string): string {
  return path.isAbsolute(candidate) ? candidate : path.join(workspace, candidate);
}

export function hasReleaseFacingArtifacts(workspace: string): boolean {
  return defaultReleaseGateInputs(workspace).length > 0;
}

export function readReleaseGateStatus(workspace: string): ReleaseGateStatus {
  const gatePath = path.join(workspace, "review", "release_gate.json");

  if (!fs.existsSync(gatePath)) {
    return {
      state: "missing",
      gatePath,
      checkedFiles: [],
      staleReasons: [],
    };
  }

  let parsed: ReleaseGateFile;
  try {
    parsed = JSON.parse(fs.readFileSync(gatePath, "utf-8")) as ReleaseGateFile;
  } catch {
    return {
      state: "invalid",
      gatePath,
      checkedFiles: [],
      staleReasons: ["release_gate.json is not valid JSON"],
    };
  }

  if (!isReleaseVerdict(parsed.release_verdict)) {
    return {
      state: "invalid",
      gatePath,
      checkedFiles: [],
      staleReasons: ["release_gate.json is missing a valid release_verdict"],
    };
  }

  const checkedFiles = normalizeStringArray(parsed.checked_files);
  const freshnessInputs = normalizeStringArray(parsed.stale_if_any_newer_than);
  const trackedInputs = freshnessInputs.length > 0
    ? freshnessInputs
    : checkedFiles.length > 0
      ? checkedFiles
      : defaultReleaseGateInputs(workspace);

  const gateMtimeMs = fs.statSync(gatePath).mtimeMs;
  const staleReasons: string[] = [];

  for (const candidate of trackedInputs) {
    const candidatePath = resolveWorkspacePath(workspace, candidate);
    const displayPath = path.isAbsolute(candidate) ? candidate : candidate;

    if (!fs.existsSync(candidatePath)) {
      staleReasons.push(`${displayPath} is missing`);
      continue;
    }

    if (fs.statSync(candidatePath).mtimeMs > gateMtimeMs) {
      staleReasons.push(`${displayPath} changed after the last gate`);
    }
  }

  return {
    state: staleReasons.length > 0 ? "stale" : "fresh",
    verdict: parsed.release_verdict,
    gatePath,
    checkedFiles,
    staleReasons,
    generatedAt: parsed.generated_at,
  };
}

export function formatReleaseGateStatus(status: ReleaseGateStatus): string {
  switch (status.state) {
    case "missing":
      return "not run";
    case "invalid":
      return "invalid";
    case "stale":
      return status.verdict ? `${status.verdict} (stale)` : "stale";
    case "fresh":
      return status.verdict ? `${status.verdict} (fresh)` : "fresh";
    default:
      return status.state;
  }
}

export function getReleaseGateNextStep(workspace: string, status: ReleaseGateStatus): string | null {
  if (!hasReleaseFacingArtifacts(workspace) && status.state === "missing") {
    return null;
  }

  switch (status.state) {
    case "missing":
      return "Run `/artifact-review` before sharing the current paper, figures, or release page.";
    case "invalid":
      return "Rerun `/artifact-review` to regenerate a valid `review/release_gate.json`.";
    case "stale":
      return "Rerun `/artifact-review` because one or more reviewed artifacts changed after the last gate.";
    case "fresh":
      if (status.verdict === "HOLD") {
        return "Fix the blocking findings in `review/artifact_review.md`, then rerun `/artifact-review`.";
      }
      if (status.verdict === "CONDITIONAL_GO") {
        return "Resolve the remaining P1 findings or explicitly accept a conditional release before sharing.";
      }
      return "Release gate is fresh. You can proceed to `/release-layout` or share the reviewed artifacts.";
    default:
      return null;
  }
}

import { Type } from "@sinclair/typebox";
import { readFileSync, existsSync, statSync } from "node:fs";
import { Result } from "./result.js";

const DEFAULT_VIEWPORT_SIZE = 100;
const MAX_VIEWPORT_SIZE = 500;

export const PaperBrowserToolSchema = Type.Object({
  file_path: Type.String({
    description: "Path to the paper file (.tex, .md, or any text file).",
  }),
  start_line: Type.Optional(
    Type.Number({
      description: "Starting line number (1-indexed). Default: 1.",
      minimum: 1,
    }),
  ),
  num_lines: Type.Optional(
    Type.Number({
      description: `Number of lines to display (default: ${DEFAULT_VIEWPORT_SIZE}, max: ${MAX_VIEWPORT_SIZE}).`,
      minimum: 1,
      maximum: MAX_VIEWPORT_SIZE,
    }),
  ),
});

function readStringParam(params: Record<string, unknown>, key: string, opts?: { required?: boolean }): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    if (opts?.required) {
      throw new Error(`Missing required parameter: ${key}`);
    }
    return undefined;
  }
  return String(value);
}

function readNumberParam(params: Record<string, unknown>, key: string, opts?: { integer?: boolean }): number | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  if (isNaN(num)) return undefined;
  return opts?.integer ? Math.floor(num) : num;
}

export function createPaperBrowserTool() {
  return {
    label: "Paper Browser",
    name: "paper_browser",
    description:
      "Read large paper files (.tex, .md) in paginated chunks. Use this to avoid loading entire multi-thousand-line files into context at once. Returns a viewport of lines with navigation information.",
    parameters: PaperBrowserToolSchema,
    execute: async (_toolCallId: string, rawArgs: unknown) => {
      const params = rawArgs as Record<string, unknown>;
      const filePath = readStringParam(params, "file_path", { required: true })!;
      const startLine = Math.max(1, readNumberParam(params, "start_line", { integer: true }) ?? 1);
      const numLines = Math.min(
        readNumberParam(params, "num_lines", { integer: true }) ?? DEFAULT_VIEWPORT_SIZE,
        MAX_VIEWPORT_SIZE,
      );

      // Validate file exists
      if (!existsSync(filePath)) {
        return Result.err("file_not_found", `File does not exist: ${filePath}`);
      }

      // Check if it's a file (not directory)
      let stats;
      try {
        stats = statSync(filePath);
      } catch (error) {
        return Result.err("file_error", `Cannot access file: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!stats.isFile()) {
        return Result.err("not_a_file", `Path is not a file: ${filePath}`);
      }

      // Read file content
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch (error) {
        return Result.err("read_error", `Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Split into lines
      const lines = content.split("\n");
      const totalLines = lines.length;

      // Validate start line
      if (startLine > totalLines) {
        return Result.err(
          "invalid_range",
          `Start line ${startLine} exceeds total lines ${totalLines}`,
        );
      }

      // Extract viewport
      const endLine = Math.min(startLine + numLines - 1, totalLines);
      const viewportLines = lines.slice(startLine - 1, endLine);

      // Add line numbers (matching cat -n format for consistency with Read tool)
      const numberedLines = viewportLines
        .map((line, idx) => {
          const lineNum = startLine + idx;
          return `${lineNum.toString().padStart(6, " ")}\t${line}`;
        })
        .join("\n");

      // Navigation hints
      const hasMore = endLine < totalLines;
      const hasPrev = startLine > 1;

      let navigationHint = "";
      if (hasMore && hasPrev) {
        navigationHint = `\n\nNavigate: paper_browser({ file_path: "${filePath}", start_line: ${endLine + 1} }) for next page, or start_line: ${Math.max(1, startLine - numLines)} for previous page.`;
      } else if (hasMore) {
        navigationHint = `\n\nMore content below. Use: paper_browser({ file_path: "${filePath}", start_line: ${endLine + 1} })`;
      } else if (hasPrev) {
        navigationHint = `\n\nEnd of file. Use: paper_browser({ file_path: "${filePath}", start_line: ${Math.max(1, startLine - numLines)} }) for previous page.`;
      } else {
        navigationHint = "\n\n[End of file]";
      }

      return Result.ok({
        file_path: filePath,
        total_lines: totalLines,
        viewport: {
          start_line: startLine,
          end_line: endLine,
          num_lines: viewportLines.length,
        },
        content: numberedLines + navigationHint,
        has_more: hasMore,
        has_prev: hasPrev,
      });
    },
  };
}

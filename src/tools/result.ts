/**
 * Tool result helpers for pi-ai compatibility.
 *
 * pi-ai expects tool results in format:
 * { type: "tool_result", content: [{ type: "text", text: string }] }
 */

type ToolResultContent = { type: "text"; text: string };

type ToolResult = {
  type: "tool_result";
  content: ToolResultContent[];
  isError?: boolean;
};

/**
 * Create a successful tool result with JSON data.
 */
export function ok<T extends Record<string, unknown>>(data: T): ToolResult {
  return {
    type: "tool_result",
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

/**
 * Create an error tool result.
 */
export function err(code: string, message: string): ToolResult {
  return {
    type: "tool_result",
    content: [{ type: "text", text: JSON.stringify({ error: code, message }) }],
    isError: true,
  };
}

/**
 * Create a tool result with plain text (no JSON).
 */
export function text(content: string): ToolResult {
  return {
    type: "tool_result",
    content: [{ type: "text", text: content }],
  };
}

/**
 * Namespace for cleaner imports: `import { Result } from "./result.js"`
 */
export const Result = { ok, err, text };

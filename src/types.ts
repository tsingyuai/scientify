/**
 * Re-export SDK types and derive types not directly exported.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export type { OpenClawPluginApi };

type RegisteredCommand = Parameters<OpenClawPluginApi["registerCommand"]>[0];

export type PluginCommandContext = RegisteredCommand extends {
  handler: (ctx: infer Context) => unknown;
}
  ? Context
  : never;

/** Derived from the return type of command handlers */
export type PluginCommandResult = RegisteredCommand extends {
  handler: (...args: never[]) => infer Result;
}
  ? Awaited<Result>
  : never;

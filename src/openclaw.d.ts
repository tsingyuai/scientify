declare module "openclaw" {
  export interface PluginCommandContext {
    senderId?: string;
    channel: string;
    isAuthorizedSender: boolean;
    args?: string;
    commandBody: string;
    config: unknown;
  }

  export interface PluginCommandResult {
    text?: string;
    markdown?: string;
    html?: string;
    error?: string;
  }

  export type PluginCommandHandler = (
    ctx: PluginCommandContext,
  ) => PluginCommandResult | Promise<PluginCommandResult>;

  export interface OpenClawPluginCommandDefinition {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: PluginCommandHandler;
  }

  export interface PluginLogger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  }

  export interface OpenClawPluginApi {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    config: unknown;
    pluginConfig?: Record<string, unknown>;
    logger: PluginLogger;
    registerTool: (tool: unknown, opts?: unknown) => void;
    registerHook: (events: string | string[], handler: unknown, opts?: unknown) => void;
    registerHttpHandler: (handler: unknown) => void;
    registerHttpRoute: (params: { path: string; handler: unknown }) => void;
    registerChannel: (registration: unknown) => void;
    registerGatewayMethod: (method: string, handler: unknown) => void;
    registerCli: (registrar: unknown, opts?: { commands?: string[] }) => void;
    registerService: (service: unknown) => void;
    registerProvider: (provider: unknown) => void;
    registerCommand: (command: OpenClawPluginCommandDefinition) => void;
    resolvePath: (input: string) => string;
    on: (hookName: string, handler: unknown, opts?: { priority?: number }) => void;
  }
}

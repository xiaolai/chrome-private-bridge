export interface CommandRequest {
  command: string
  params?: Record<string, unknown>
}

export interface CommandResponse {
  id: string
  ok: boolean
  result?: unknown
  error?: string
  duration: number
}

export type WsMessage =
  | { type: "command"; id: string; command: string; params?: Record<string, unknown> }
  | { type: "response"; id: string; result?: unknown; error?: string }
  | { type: "event"; command: string; data?: unknown }

export interface ApiKey {
  key: string
  name: string
  created: string
  lastUsed: string | null
  allowedIPs: string[] | null
  allowedCommands: string[] | null
}

export interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
  startedAt: number
}

export interface BridgePlugin {
  name: string
  version: string
  commands: Record<string, PluginCommandHandler>
  init?(ctx: PluginContext): Promise<void>
}

export interface PluginCommandHandler {
  description: string
  params?: import("zod/v4").z.ZodObject<any>
  execute(params: unknown, ctx: ExecutionContext): Promise<unknown>
}

export interface PluginContext {
  log(msg: string): void
}

export interface ExecutionContext {
  send(command: string, params: unknown): Promise<unknown>
  log(msg: string): void
}

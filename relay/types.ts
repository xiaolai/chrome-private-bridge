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

export interface WsMessage {
  id: string
  type: "command" | "response" | "event"
  command?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: string
}

export interface ApiKey {
  key: string
  name: string
  created: string
  lastUsed: string | null
  allowedIPs: string[] | null
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
  commands: Record<string, CommandHandler>
  init?(ctx: PluginContext): Promise<void>
}

export interface CommandHandler {
  description: string
  execute(params: unknown, ctx: ExecutionContext): Promise<unknown>
}

export interface PluginContext {
  log(msg: string): void
}

export interface ExecutionContext {
  send(command: string, params: unknown): Promise<unknown>
  log(msg: string): void
}

import { getKeyPermissions } from "../auth"
import { config } from "../config"
import { log } from "../logger"
import { sendToExtension, isConnected } from "../ws/manager"
import { getCommand, getAllCommands } from "../registry/index"
import { getPluginCommand, createPluginExecutionContext } from "../plugins/loader"
import { toError } from "../utils"
import { jsonResponse as json } from "../response"
import type { CommandRequest, CommandResponse } from "../types"

function findByExtensionCommand(extCmd: string) {
  for (const def of getAllCommands().values()) {
    if (def.extensionCommand === extCmd) return def
  }
  return undefined
}

export async function handleCommand(req: Request, token: string): Promise<Response> {
  const body = await parseBody(req)
  if (body instanceof Response) return body

  const authError = checkPermissions(body.command, token)
  if (authError) return authError

  const def = findByExtensionCommand(body.command) ?? getCommand(body.command)

  const validation = validateParams(def, body.params)
  if (validation instanceof Response) return validation

  return executeCommand(def, body.command, validation, token)
}

async function parseBody(req: Request): Promise<CommandRequest | Response> {
  let body: CommandRequest
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  if (!body.command || typeof body.command !== "string") {
    return json({ ok: false, error: "Missing 'command' field" }, 400)
  }

  if (body.command === "evaluate" && !config.enableEvaluate) {
    return json({ ok: false, error: "evaluate command is disabled. Set ENABLE_EVALUATE=true to enable" }, 403)
  }

  return body
}

function checkPermissions(command: string, token: string): Response | null {
  const allowed = getKeyPermissions(token)
  if (allowed && !allowed.includes(command)) {
    const def = getCommand(command)
    if (!def || !allowed.includes(def.extensionCommand)) {
      return json({ ok: false, error: `Command "${command}" not allowed for this key` }, 403)
    }
  }
  return null
}

function validateParams(
  def: ReturnType<typeof getCommand>,
  params?: Record<string, unknown>,
): Record<string, unknown> | Response {
  const raw = params ?? {}
  if (!def) return raw

  const parsed = def.params.safeParse(raw)
  if (!parsed.success) {
    const errors = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
    return json({ ok: false, error: errors }, 400)
  }
  return parsed.data as Record<string, unknown>
}

async function executeCommand(
  def: ReturnType<typeof getCommand>,
  command: string,
  validatedParams: Record<string, unknown>,
  token: string,
): Promise<Response> {
  const start = Date.now()
  const id = `cmd_${Date.now().toString(36)}`
  const keyPrefix = token.slice(0, 8)
  const extCmd = def?.extensionCommand ?? command

  try {
    const pluginHandler = getPluginCommand(extCmd)
    if (pluginHandler) {
      const ctx = createPluginExecutionContext()
      const result = await pluginHandler.execute(validatedParams, ctx)
      const duration = Date.now() - start
      log("info", "command.executed", { command: extCmd, keyPrefix, duration, ok: true })
      return json({ id, ok: true, result, duration })
    }

    if (!isConnected()) {
      log("warn", "command.no_extension", { command: extCmd, keyPrefix })
      return json({ id, ok: false, error: "Extension not connected" }, 503)
    }

    const result = await sendToExtension(extCmd, validatedParams)
    const duration = Date.now() - start
    log("info", "command.executed", { command: extCmd, keyPrefix, duration, ok: true })
    const resp: CommandResponse = { id, ok: true, result, duration }
    return json(resp)
  } catch (thrown: unknown) {
    const err = toError(thrown)
    const duration = Date.now() - start
    log("error", "command.failed", { command: extCmd, keyPrefix, duration, error: err.message })
    const resp: CommandResponse = { id, ok: false, error: err.message, duration }
    return json(resp, 500)
  }
}

import { getKeyPermissions } from "../auth"
import { config } from "../config"
import { log } from "../logger"
import { sendToExtension, isConnected } from "../ws/extension-handler"
import { getPluginCommand } from "../plugins/registry"
import { validateParams } from "../schemas"
import type { CommandRequest, CommandResponse } from "../types"

export async function handleCommand(req: Request, token: string): Promise<Response> {
  let body: CommandRequest
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  if (!body.command || typeof body.command !== "string") {
    return json({ ok: false, error: "Missing 'command' field" }, 400)
  }

  // WI-1.2: Gate evaluate command
  if (body.command === "evaluate" && !config.enableEvaluate) {
    return json({ ok: false, error: "evaluate command is disabled. Set ENABLE_EVALUATE=true to enable" }, 403)
  }

  // WI-3.2: Per-key command permissions
  const allowed = getKeyPermissions(token)
  if (allowed && !allowed.includes(body.command)) {
    return json({ ok: false, error: `Command "${body.command}" not allowed for this key` }, 403)
  }

  // WI-3.1: Validate command parameters
  const validationError = validateParams(body.command, body.params)
  if (validationError) {
    return json({ ok: false, error: validationError }, 400)
  }

  const start = Date.now()
  const id = `cmd_${Date.now().toString(36)}`
  const keyPrefix = token.slice(0, 8)

  try {
    const pluginCmd = getPluginCommand(body.command)

    if (pluginCmd) {
      const result = await pluginCmd.execute(body.params ?? {}, {
        send: sendToExtension,
        log: (msg: string) => log("info", "plugin.log", { message: msg }),
      })
      const duration = Date.now() - start
      log("info", "command.executed", { command: body.command, keyPrefix, duration, ok: true })
      return json({ id, ok: true, result, duration })
    }

    if (!isConnected()) {
      log("warn", "command.no_extension", { command: body.command, keyPrefix })
      return json({ id, ok: false, error: "Extension not connected" }, 503)
    }

    const result = await sendToExtension(body.command, body.params)
    const duration = Date.now() - start
    log("info", "command.executed", { command: body.command, keyPrefix, duration, ok: true })
    const resp: CommandResponse = { id, ok: true, result, duration }
    return json(resp)
  } catch (err: any) {
    const duration = Date.now() - start
    log("error", "command.failed", { command: body.command, keyPrefix, duration, error: err.message })
    const resp: CommandResponse = { id, ok: false, error: err.message, duration }
    return json(resp, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
}

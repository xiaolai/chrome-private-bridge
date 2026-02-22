import { getKeyPermissions } from "../auth"
import { config } from "../config"
import { log } from "../logger"
import { sendToExtension, isConnected } from "../ws/manager"
import { getCommand, getAllCommands } from "../registry/index"
import { getPluginCommand, createPluginExecutionContext } from "../plugins/loader"
import type { CommandRequest, CommandResponse } from "../types"

// Find command def by extension command name
function findByExtensionCommand(extCmd: string) {
  for (const def of getAllCommands().values()) {
    if (def.extensionCommand === extCmd) return def
  }
  return undefined
}

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

  // Gate evaluate command
  if (body.command === "evaluate" && !config.enableEvaluate) {
    return json({ ok: false, error: "evaluate command is disabled. Set ENABLE_EVALUATE=true to enable" }, 403)
  }

  // Per-key command permissions
  const allowed = getKeyPermissions(token)
  if (allowed && !allowed.includes(body.command)) {
    const def = getCommand(body.command)
    if (!def || !allowed.includes(def.extensionCommand)) {
      return json({ ok: false, error: `Command "${body.command}" not allowed for this key` }, 403)
    }
  }

  // Find command definition (try extension command name first, then MCP tool name)
  const def = findByExtensionCommand(body.command) ?? getCommand(body.command)

  // Validate params with Zod if we have a definition
  if (def) {
    const parsed = def.params.safeParse(body.params ?? {})
    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
      return json({ ok: false, error: errors }, 400)
    }
  }

  const start = Date.now()
  const id = `cmd_${Date.now().toString(36)}`
  const keyPrefix = token.slice(0, 8)
  const extCmd = def?.extensionCommand ?? body.command

  try {
    // Check for plugin command
    const pluginHandler = getPluginCommand(extCmd)
    if (pluginHandler) {
      const ctx = createPluginExecutionContext()
      const result = await pluginHandler.execute(body.params ?? {}, ctx)
      const duration = Date.now() - start
      log("info", "command.executed", { command: extCmd, keyPrefix, duration, ok: true })
      return json({ id, ok: true, result, duration })
    }

    if (!isConnected()) {
      log("warn", "command.no_extension", { command: extCmd, keyPrefix })
      return json({ id, ok: false, error: "Extension not connected" }, 503)
    }

    const result = await sendToExtension(extCmd, body.params)
    const duration = Date.now() - start
    log("info", "command.executed", { command: extCmd, keyPrefix, duration, ok: true })
    const resp: CommandResponse = { id, ok: true, result, duration }
    return json(resp)
  } catch (err: any) {
    const duration = Date.now() - start
    log("error", "command.failed", { command: extCmd, keyPrefix, duration, error: err.message })
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

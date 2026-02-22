import { sendToExtension, isConnected } from "../ws/extension-handler"
import { getPluginCommand } from "../plugins/registry"
import type { CommandRequest, CommandResponse } from "../types"

export async function handleCommand(req: Request): Promise<Response> {
  let body: CommandRequest
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  if (!body.command || typeof body.command !== "string") {
    return json({ ok: false, error: "Missing 'command' field" }, 400)
  }

  const start = Date.now()
  const id = `cmd_${Date.now().toString(36)}`

  try {
    const dotIdx = body.command.indexOf(".")
    const pluginCmd = getPluginCommand(body.command)

    if (pluginCmd) {
      const result = await pluginCmd.execute(body.params ?? {}, {
        send: sendToExtension,
        log: (msg: string) => console.log(`[plugin] ${msg}`),
      })
      return json({ id, ok: true, result, duration: Date.now() - start })
    }

    if (!isConnected()) {
      return json({ id, ok: false, error: "Extension not connected" }, 503)
    }

    const result = await sendToExtension(body.command, body.params)
    const resp: CommandResponse = { id, ok: true, result, duration: Date.now() - start }
    return json(resp)
  } catch (err: any) {
    const resp: CommandResponse = { id, ok: false, error: err.message, duration: Date.now() - start }
    return json(resp, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
}

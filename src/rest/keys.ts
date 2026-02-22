import { generateKey, listKeys, revokeKey } from "../auth"

export async function handleKeys(req: Request, remoteIP: string): Promise<Response> {
  const isLocal = remoteIP === "127.0.0.1" || remoteIP === "::1" || remoteIP === "localhost"
  if (!isLocal) {
    return json({ ok: false, error: "Key management only allowed from localhost" }, 403)
  }

  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const act = (body.action as string) || action

    if (act === "generate") {
      const name = (body.name as string) || "unnamed"
      const cmds = body.commands
        ? (Array.isArray(body.commands) ? body.commands as string[] : (body.commands as string).split(","))
        : null
      const key = generateKey(name, cmds)
      return json({ ok: true, key, name })
    }

    if (act === "revoke") {
      const prefix = body.prefix as string
      if (!prefix) return json({ ok: false, error: "Missing 'prefix'" }, 400)
      const revoked = revokeKey(prefix)
      return json({ ok: revoked, message: revoked ? "Key revoked" : "Key not found" })
    }

    if (act === "list") {
      return json({ ok: true, keys: listKeys() })
    }

    return json({ ok: false, error: "Unknown action. Use: generate, list, revoke" }, 400)
  }

  if (req.method === "GET") {
    return json({ ok: true, keys: listKeys() })
  }

  return json({ ok: false, error: "Method not allowed" }, 405)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
}

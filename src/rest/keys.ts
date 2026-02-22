import { generateKey, listKeys, revokeKey } from "../auth"
import { jsonResponse as json } from "../response"

export async function handleKeys(req: Request, remoteIP: string): Promise<Response> {
  const isLocal = remoteIP === "127.0.0.1" || remoteIP === "::1" || remoteIP === "localhost"
  if (!isLocal) {
    return json({ ok: false, error: "Key management only allowed from localhost" }, 403)
  }

  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  if (req.method === "POST") {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400)
    }
    if (!body || typeof body !== "object") {
      return json({ ok: false, error: "Invalid JSON body" }, 400)
    }
    const act = (typeof body.action === "string" ? body.action : null) || action

    if (act === "generate") {
      const name = (typeof body.name === "string" ? body.name : null) || "unnamed"
      let cmds: string[] | null = null
      if (body.commands != null) {
        if (Array.isArray(body.commands)) {
          cmds = body.commands.filter((c): c is string => typeof c === "string")
        } else if (typeof body.commands === "string") {
          cmds = body.commands.split(",")
        } else {
          return json({ ok: false, error: "'commands' must be a string or array of strings" }, 400)
        }
      }
      const key = generateKey(name, cmds)
      return json({ ok: true, key, name })
    }

    if (act === "revoke") {
      const prefix = typeof body.prefix === "string" ? body.prefix : ""
      if (!prefix) return json({ ok: false, error: "Missing 'prefix'" }, 400)
      const revoked = revokeKey(prefix)
      if (revoked === "ambiguous") {
        return json({ ok: false, error: "Ambiguous prefix — matches multiple keys. Use a longer prefix." }, 400)
      }
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

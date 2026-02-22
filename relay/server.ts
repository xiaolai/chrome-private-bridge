import { extractBearerToken, generateKey, getExtensionToken, listKeys, validateKey } from "./auth"
import { handleCommand } from "./routes/commands"
import { handleKeys } from "./routes/keys"
import { handleStatus } from "./routes/status"
import { handleClose, handleMessage, handleOpen, type WsData } from "./ws/extension-handler"
import { registerPlugin } from "./plugins/registry"
import xPost from "./plugins/x-post"
import wechatPost from "./plugins/wechat-post"

const PORT = parseInt(process.env.PORT || "7890")
const RATE_LIMIT = 60
const RATE_WINDOW = 60_000

const rateLimits = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  let entry = rateLimits.get(key)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW }
    rateLimits.set(key, entry)
  }
  entry.count++
  return entry.count <= RATE_LIMIT
}

function getRemoteIP(req: Request, server: any): string {
  const addr = server.requestIP(req)
  return addr?.address || "unknown"
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  })
}

async function handleCli() {
  const args = process.argv.slice(2)
  if (args[0] === "keygen") {
    const nameIdx = args.indexOf("--name")
    const name = nameIdx !== -1 ? args[nameIdx + 1] : "default"
    const key = generateKey(name)
    console.log(`Generated API key: ${key}`)
    console.log(`Name: ${name}`)
    process.exit(0)
  }
  if (args[0] === "keys") {
    const keys = listKeys()
    if (keys.length === 0) {
      console.log("No API keys. Run: npx -y bun relay/server.ts keygen --name <name>")
    } else {
      console.table(keys)
    }
    process.exit(0)
  }
  if (args[0] === "token") {
    console.log(`Extension token: ${getExtensionToken()}`)
    process.exit(0)
  }
}

async function main() {
  await handleCli()

  await registerPlugin(xPost)
  await registerPlugin(wechatPost)

  const extToken = getExtensionToken()

  const server = Bun.serve<WsData>({
    port: PORT,
    hostname: "0.0.0.0",

    async fetch(req, server) {
      const url = new URL(req.url)
      const remoteIP = getRemoteIP(req, server)

      if (req.method === "OPTIONS") {
        return json({ ok: true })
      }

      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req, { data: { authenticated: false } })
        if (!upgraded) {
          return json({ error: "WebSocket upgrade failed" }, 400)
        }
        return undefined as any
      }

      if (url.pathname === "/api/v1/keys" || url.pathname === "/api/v1/keys/") {
        return handleKeys(req, remoteIP)
      }

      const token = extractBearerToken(req)
      if (!token || !validateKey(token, remoteIP)) {
        return json({ ok: false, error: "Unauthorized" }, 401)
      }

      if (!checkRateLimit(token)) {
        return json({ ok: false, error: "Rate limit exceeded" }, 429)
      }

      if (url.pathname === "/api/v1/command" && req.method === "POST") {
        return handleCommand(req)
      }

      if (url.pathname === "/api/v1/status" && req.method === "GET") {
        return handleStatus()
      }

      return json({ ok: false, error: "Not found" }, 404)
    },

    websocket: {
      open: handleOpen,
      message: handleMessage,
      close: handleClose,
    },
  })

  console.log(`
┌─────────────────────────────────────────┐
│  Chrome Bridge Relay Server             │
├─────────────────────────────────────────┤
│  HTTP API:  http://0.0.0.0:${PORT}       │
│  WebSocket: ws://localhost:${PORT}/ws     │
│  Extension token: ${extToken.slice(0, 12)}...         │
└─────────────────────────────────────────┘

Commands:
  keygen --name <name>   Generate an API key
  keys                   List API keys
  token                  Show extension token
`)
}

main().catch(console.error)

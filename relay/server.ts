import { extractBearerToken, flushKeys, generateKey, getExtensionToken, listKeys, validateKey } from "./auth"
import { config } from "./config"
import { log } from "./logger"
import { handleCommand } from "./routes/commands"
import { handleKeys } from "./routes/keys"
import { handleStatus } from "./routes/status"
import { handleClose, handleMessage, handleOpen, shutdownPending, type WsData } from "./ws/extension-handler"
import { registerPlugin } from "./plugins/registry"
import xPost from "./plugins/x-post"
import wechatPost from "./plugins/wechat-post"

const rateLimits = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  let entry = rateLimits.get(key)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + config.rateWindow }
    rateLimits.set(key, entry)
  }
  entry.count++
  return entry.count <= config.rateLimit
}

// WI-2.3: Cleanup expired rate limit entries
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(key)
  }
}, 60_000)

// WI-3.6: Batch lastUsed disk writes
const flushInterval = setInterval(flushKeys, 30_000)

function getRemoteIP(req: Request, server: any): string {
  const addr = server.requestIP(req)
  return addr?.address || "unknown"
}

function json(data: unknown, status = 200): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
  }
  // WI-1.1: Only add CORS headers when CORS_ORIGIN is configured
  if (config.corsOrigin) {
    headers["access-control-allow-origin"] = config.corsOrigin
    headers["access-control-allow-headers"] = "Authorization, Content-Type"
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS"
  }
  return new Response(JSON.stringify(data), { status, headers })
}

// WI-1.4: WebSocket origin validation
function isAllowedWsOrigin(origin: string | null): boolean {
  if (origin === null) return true // non-browser clients
  if (origin.startsWith("chrome-extension://")) return true
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  return false
}

async function handleCli() {
  const args = process.argv.slice(2)
  if (args[0] === "keygen") {
    const nameIdx = args.indexOf("--name")
    const name = nameIdx !== -1 ? args[nameIdx + 1] : "default"
    const cmdsIdx = args.indexOf("--commands")
    const cmds = cmdsIdx !== -1 ? args[cmdsIdx + 1].split(",") : null
    const key = generateKey(name, cmds)
    // WI-1.3: Mask key in output (first 12 chars)
    console.log(`Generated API key: ${key.slice(0, 12)}...`)
    console.log(`Name: ${name}`)
    if (cmds) {
      console.log(`Allowed commands: ${cmds.join(", ")}`)
    }
    process.exit(0)
  }
  if (args[0] === "keys") {
    const keys = listKeys()
    if (keys.length === 0) {
      console.log("No API keys. Run: bun relay/server.ts keygen --name <name>")
    } else {
      console.table(keys)
    }
    process.exit(0)
  }
  if (args[0] === "token") {
    // WI-1.3: User explicitly asked for token — show full value
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
    port: config.port,
    hostname: config.host,

    async fetch(req, server) {
      const url = new URL(req.url)
      const remoteIP = getRemoteIP(req, server)

      if (req.method === "OPTIONS") {
        return json({ ok: true })
      }

      if (url.pathname === "/ws") {
        // WI-1.4: Validate WebSocket origin
        const origin = req.headers.get("origin")
        if (!isAllowedWsOrigin(origin)) {
          return json({ ok: false, error: "Forbidden origin" }, 403)
        }
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
        log("warn", "rate_limit.exceeded", { keyPrefix: token.slice(0, 8) })
        return json({ ok: false, error: "Rate limit exceeded" }, 429)
      }

      if (url.pathname === "/api/v1/command" && req.method === "POST") {
        return handleCommand(req, token)
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

  // Keep banner for human readability
  console.log(`
┌─────────────────────────────────────────┐
│  Chrome Bridge Relay Server             │
├─────────────────────────────────────────┤
│  HTTP API:  http://${config.host}:${config.port}       │
│  WebSocket: ws://localhost:${config.port}/ws     │
│  Extension token: ${extToken.slice(0, 8)}...              │
└─────────────────────────────────────────┘

Commands:
  keygen --name <name> [--commands cmd1,cmd2]   Generate an API key
  keys                                          List API keys
  token                                         Show extension token
`)

  // Structured log for programmatic consumption
  log("info", "server.started", { port: config.port, wsPath: "/ws" })

  // WI-2.4: Graceful shutdown
  const shutdown = () => {
    log("info", "server.stopping")
    clearInterval(cleanupInterval)
    clearInterval(flushInterval)
    flushKeys()
    shutdownPending()
    server.stop()
    process.exit(0)
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch(console.error)

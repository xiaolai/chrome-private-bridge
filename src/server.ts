import { extractBearerToken, flushKeys, hasKeys, listKeys, validateKey } from "./auth"
import { runCli } from "./cli"
import { config } from "./config"
import { log } from "./logger"
import { handleMcp } from "./mcp/handler"
import { handleCommand } from "./rest/commands"
import { handleKeys } from "./rest/keys"
import { handleStatus } from "./rest/status"
import { handleClose, handleMessage, handleOpen, shutdownPending } from "./ws/manager"
import { registerPlugin } from "./plugins/loader"
import { jsonResponse } from "./response"
import xPost from "./plugins/x-post"
import wechatPost from "./plugins/wechat-post"

// Ensure all commands are registered
import "./registry/index"

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

function getRemoteIP(req: Request, server: any): string {
  const addr = server.requestIP(req)
  return addr?.address || "unknown"
}

function json(data: unknown, status = 200): Response {
  const resp = jsonResponse(data, status)
  resp.headers.set("x-content-type-options", "nosniff")
  if (config.corsOrigin) {
    resp.headers.set("access-control-allow-origin", config.corsOrigin)
    resp.headers.set("access-control-allow-headers", "Authorization, Content-Type")
    resp.headers.set("access-control-allow-methods", "GET, POST, OPTIONS")
  }
  return resp
}

function applyHeaders(resp: Response): Response {
  resp.headers.set("x-content-type-options", "nosniff")
  if (config.corsOrigin) {
    resp.headers.set("access-control-allow-origin", config.corsOrigin)
    resp.headers.set("access-control-allow-headers", "Authorization, Content-Type")
    resp.headers.set("access-control-allow-methods", "GET, POST, OPTIONS")
  }
  return resp
}

function isAllowedWsOrigin(origin: string | null): boolean {
  if (origin === null) return false
  if (origin.startsWith("chrome-extension://")) return true
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  return false
}

async function main() {
  const result = await runCli(process.argv.slice(2))
  if (result.exit) process.exit(result.code)

  await registerPlugin(xPost)
  await registerPlugin(wechatPost)

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,

    async fetch(req, server) {
      const url = new URL(req.url)
      const remoteIP = getRemoteIP(req, server)

      if (req.method === "OPTIONS") {
        return json({ ok: true })
      }

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        const origin = req.headers.get("origin")
        if (!isAllowedWsOrigin(origin)) {
          return json({ ok: false, error: "Forbidden origin" }, 403)
        }
        const upgraded = server.upgrade(req)
        if (!upgraded) {
          return json({ error: "WebSocket upgrade failed" }, 400)
        }
        return undefined as any
      }

      // Key management (localhost only, no auth required)
      if (url.pathname === "/api/v1/keys" || url.pathname === "/api/v1/keys/") {
        return handleKeys(req, remoteIP)
      }

      // Status endpoint (no auth required for REST)
      if (url.pathname === "/api/v1/status" && req.method === "GET") {
        return handleStatus()
      }

      // Authentication: required only when keys exist
      let token: string | null = extractBearerToken(req)
      if (hasKeys()) {
        if (!token || !validateKey(token, remoteIP)) {
          return json({ ok: false, error: "Unauthorized" }, 401)
        }
        if (!checkRateLimit(token)) {
          log("warn", "rate_limit.exceeded", { keyPrefix: token.slice(0, 8) })
          return json({ ok: false, error: "Rate limit exceeded" }, 429)
        }
      } else {
        token = null // open access mode
      }

      // MCP endpoint
      if (url.pathname === "/mcp" && req.method === "POST" && config.mcpEnabled) {
        return applyHeaders(await handleMcp(req, token))
      }

      // REST command endpoint
      if (url.pathname === "/api/v1/command" && req.method === "POST" && config.restEnabled) {
        return applyHeaders(await handleCommand(req, token))
      }

      return json({ ok: false, error: "Not found" }, 404)
    },

    websocket: {
      open: handleOpen,
      message: handleMessage,
      close: handleClose,
    },
  })

  const mcpStatus = config.mcpEnabled ? "enabled" : "disabled"
  const restStatus = config.restEnabled ? "enabled" : "disabled"
  const keys = listKeys()
  const authStatus = keys.length > 0 ? `enabled (${keys.length} key${keys.length > 1 ? "s" : ""})` : "open (no keys)"

  console.log(`
┌─────────────────────────────────────────┐
│  Chrome Bridge Server                   │
├─────────────────────────────────────────┤
│  HTTP API:  http://${config.host}:${config.port}       │
│  WebSocket: ws://${config.host}:${config.port}/ws     │
│  MCP:       ${mcpStatus.padEnd(28)}│
│  REST:      ${restStatus.padEnd(28)}│
│  Auth:      ${authStatus.padEnd(28)}│
└─────────────────────────────────────────┘

Commands:
  help                                          Show help
  version                                       Show version
  keygen --name <name> [--commands c1,c2] [--ip 1.2.3.4]
                                                Generate an API key
  keys                                          List API keys
  revoke <prefix>                               Revoke an API key
  status                                        Check if server is running
`)

  log("info", "server.started", { port: config.port, wsPath: "/ws", mcp: config.mcpEnabled, rest: config.restEnabled })

  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimits) {
      if (now > entry.resetAt) rateLimits.delete(key)
    }
  }, 60_000)

  const flushInterval = setInterval(flushKeys, 30_000)

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

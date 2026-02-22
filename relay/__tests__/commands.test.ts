import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// Setup test environment before any imports
const testDir = mkdtempSync(join(tmpdir(), "chrome-bridge-cmd-test-"))
process.env.CONFIG_DIR = testDir
process.env.ENABLE_EVALUATE = "false"

import { generateKey } from "../auth"
import { config } from "../config"
import { registerPlugin } from "../plugins/registry"
import type { BridgePlugin } from "../types"

let server: ReturnType<typeof Bun.serve>
let apiKey: string
let baseUrl: string

// Minimal test plugin
const testPlugin: BridgePlugin = {
  name: "testplugin",
  version: "1.0.0",
  commands: {
    echo: {
      description: "Echo params back",
      execute: async (params) => params,
    },
  },
}

// Import handlers
import { extractBearerToken, validateKey, getKeyPermissions, flushKeys } from "../auth"
import { handleCommand } from "../routes/commands"
import { handleKeys } from "../routes/keys"
import { handleStatus } from "../routes/status"
import { isConnected, handleMessage, handleClose, getExtensionSocket } from "../ws/extension-handler"
import { getExtensionToken } from "../auth"
import type { WsData } from "../ws/extension-handler"

// Build a mini server for integration testing
function buildFetch() {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const remoteIP = "127.0.0.1"

    if (req.method === "OPTIONS") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      })
    }

    if (url.pathname === "/api/v1/keys" || url.pathname === "/api/v1/keys/") {
      return handleKeys(req, remoteIP)
    }

    const token = extractBearerToken(req)
    if (!token || !validateKey(token, remoteIP)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.pathname === "/api/v1/command" && req.method === "POST") {
      return handleCommand(req, token)
    }

    if (url.pathname === "/api/v1/status" && req.method === "GET") {
      return handleStatus()
    }

    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })
  }
}

describe("command routing integration", () => {
  let fetch_handler: ReturnType<typeof buildFetch>

  beforeAll(async () => {
    apiKey = generateKey("test-integration")
    await registerPlugin(testPlugin)
    fetch_handler = buildFetch()
  })

  function makeReq(path: string, opts: RequestInit = {}): Request {
    return new Request(`http://localhost:7890${path}`, {
      ...opts,
      headers: {
        "content-type": "application/json",
        ...opts.headers,
      },
    })
  }

  function authedReq(path: string, opts: RequestInit = {}): Request {
    return makeReq(path, {
      ...opts,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(opts.headers || {}),
      },
    })
  }

  test("POST /api/v1/command without auth → 401", async () => {
    const req = makeReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ command: "tab.list" }),
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(401)
  })

  test("POST /api/v1/command with valid auth but no body → 400", async () => {
    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: "not json{{{",
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(400)
  })

  test("POST /api/v1/command with valid auth, valid body, extension not connected → 503", async () => {
    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ command: "tab.list" }),
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(503)
    const data = await resp.json()
    expect(data.error).toContain("Extension not connected")
  })

  test("POST /api/v1/command with valid auth, plugin command → plugin executes", async () => {
    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ command: "testplugin.echo", params: { msg: "hi" } }),
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.result).toEqual({ msg: "hi" })
  })

  test("GET /api/v1/status → returns status object", async () => {
    const req = authedReq("/api/v1/status", { method: "GET" })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.extension).toBe("disconnected")
    expect(typeof data.uptime).toBe("number")
  })

  test("POST /api/v1/keys from non-localhost → 403", async () => {
    const req = makeReq("/api/v1/keys", {
      method: "POST",
      body: JSON.stringify({ action: "list" }),
    })
    // Call handleKeys directly with non-local IP
    const resp = await handleKeys(req, "8.8.8.8")
    expect(resp.status).toBe(403)
  })

  test("POST /api/v1/command with missing 'command' field → 400", async () => {
    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ params: { url: "https://x.com" } }),
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("Missing 'command' field")
  })

  test("POST /api/v1/command with non-string command → 400", async () => {
    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ command: 123 }),
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("Missing 'command' field")
  })

  test("POST /api/v1/command with invalid params → 400 validation error", async () => {
    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ command: "navigate", params: {} }),
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("Missing required field: url")
  })

  test("POST /api/v1/command with restricted key → 403 permission denied", async () => {
    const restrictedKey = generateKey("restricted", ["tab.list"])
    const req = makeReq("/api/v1/command", {
      method: "POST",
      headers: {
        authorization: `Bearer ${restrictedKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ command: "navigate", params: { url: "https://x.com" } }),
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(403)
    const data = await resp.json()
    expect(data.error).toContain("not allowed for this key")
  })

  test("POST /api/v1/command evaluate when disabled → 403", async () => {
    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ command: "evaluate", params: { expression: "1+1" } }),
    })
    const resp = await fetch_handler(req)
    expect(resp.status).toBe(403)
    const data = await resp.json()
    expect(data.error).toContain("evaluate command is disabled")
  })

  test("POST /api/v1/command with connected extension → sends to extension and returns result", async () => {
    // Create mock WebSocket and authenticate it
    const sentMessages: string[] = []
    const mockWs: any = {
      data: { authenticated: false } as WsData,
      readyState: WebSocket.OPEN,
      send(msg: string) { sentMessages.push(msg) },
      close() { this.readyState = WebSocket.CLOSED },
    }
    const token = getExtensionToken()
    handleMessage(mockWs, JSON.stringify({ type: "auth", token }))

    // Now send a command that will go to the extension
    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ command: "tab.list" }),
    })
    const respPromise = fetch_handler(req)

    // Wait a tick for the command to be sent
    await new Promise(r => setTimeout(r, 10))

    // Find the command message sent to the extension
    const cmdMsg = sentMessages.find(m => {
      const parsed = JSON.parse(m)
      return parsed.type === "command" && parsed.command === "tab.list"
    })
    expect(cmdMsg).toBeDefined()
    const parsed = JSON.parse(cmdMsg!)

    // Simulate extension response
    handleMessage(mockWs, JSON.stringify({ type: "response", id: parsed.id, result: [{ id: 1, url: "https://x.com" }] }))

    const resp = await respPromise
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.result).toEqual([{ id: 1, url: "https://x.com" }])

    // Cleanup: disconnect mock extension
    handleClose(mockWs)
  })

  test("POST /api/v1/command when extension throws → 500", async () => {
    // Connect mock extension
    const sentMessages: string[] = []
    const mockWs: any = {
      data: { authenticated: false } as WsData,
      readyState: WebSocket.OPEN,
      send(msg: string) { sentMessages.push(msg) },
      close() { this.readyState = WebSocket.CLOSED },
    }
    const token = getExtensionToken()
    handleMessage(mockWs, JSON.stringify({ type: "auth", token }))

    const req = authedReq("/api/v1/command", {
      method: "POST",
      body: JSON.stringify({ command: "screenshot" }),
    })
    const respPromise = fetch_handler(req)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = sentMessages.find(m => {
      const parsed = JSON.parse(m)
      return parsed.type === "command" && parsed.command === "screenshot"
    })
    const parsed = JSON.parse(cmdMsg!)

    // Simulate error response from extension
    handleMessage(mockWs, JSON.stringify({ type: "response", id: parsed.id, error: "Screenshot failed" }))

    const resp = await respPromise
    expect(resp.status).toBe(500)
    const data = await resp.json()
    expect(data.ok).toBe(false)
    expect(data.error).toBe("Screenshot failed")

    handleClose(mockWs)
  })
})

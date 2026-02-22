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
import { isConnected } from "../ws/extension-handler"

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
})

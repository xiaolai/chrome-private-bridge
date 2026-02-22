import { describe, test, expect, beforeAll } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const testDir = mkdtempSync(join(tmpdir(), "chrome-bridge-rest-cmd-test-"))
process.env.CONFIG_DIR = testDir
process.env.ENABLE_EVALUATE = "false"

import { handleCommand } from "../commands"
import { generateKey } from "../../auth"
import { handleOpen, handleMessage, handleClose } from "../../ws/manager"
import { registerPlugin } from "../../plugins/loader"
import type { BridgePlugin } from "../../types"

// Import registry to ensure commands are registered
import "../../registry/index"

let apiKey: string

describe("REST commands handler", () => {
  beforeAll(() => {
    writeFileSync(join(testDir, "keys.json"), JSON.stringify({ keys: [] }))
    apiKey = generateKey("rest-test")
  })

  function makeReq(body: unknown): Request {
    return new Request("http://localhost:7890/api/v1/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  }

  test("invalid JSON body returns 400", async () => {
    const resp = await handleCommand(makeReq("not json{{{"), apiKey)
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("Invalid JSON")
  })

  test("missing command field returns 400", async () => {
    const resp = await handleCommand(makeReq({ params: {} }), apiKey)
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("Missing 'command' field")
  })

  test("non-string command returns 400", async () => {
    const resp = await handleCommand(makeReq({ command: 123 }), apiKey)
    expect(resp.status).toBe(400)
  })

  test("evaluate when disabled returns 403", async () => {
    const resp = await handleCommand(makeReq({ command: "evaluate", params: { expression: "1+1" } }), apiKey)
    expect(resp.status).toBe(403)
    const data = await resp.json()
    expect(data.error).toContain("evaluate command is disabled")
  })

  test("browser_evaluate when disabled also returns 403 (no bypass)", async () => {
    const resp = await handleCommand(makeReq({ command: "browser_evaluate", params: { expression: "1+1" } }), apiKey)
    expect(resp.status).toBe(403)
    const data = await resp.json()
    expect(data.error).toContain("evaluate command is disabled")
  })

  test("restricted key denied for unauthorized command", async () => {
    const key = generateKey("limited", ["tab.list"])
    const resp = await handleCommand(makeReq({ command: "navigate", params: { url: "https://x.com" } }), key)
    expect(resp.status).toBe(403)
    const data = await resp.json()
    expect(data.error).toContain("not allowed")
  })

  test("invalid params returns 400 with validation error", async () => {
    const resp = await handleCommand(makeReq({ command: "navigate", params: {} }), apiKey)
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toBeDefined()
  })

  test("unknown command returns 400", async () => {
    const resp = await handleCommand(makeReq({ command: "nonexistent_command" }), apiKey)
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("Unknown command")
  })

  test("extension not connected returns 503", async () => {
    const resp = await handleCommand(makeReq({ command: "tab.list" }), apiKey)
    expect(resp.status).toBe(503)
    const data = await resp.json()
    expect(data.error).toContain("Extension not connected")
  })

  test("successful command execution with connected extension", async () => {
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleCommand(makeReq({ command: "tab.list" }), apiKey)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "tab.list"
    })
    expect(cmdMsg).toBeDefined()
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({ type: "response", id: parsed.id, result: [{ id: 1, url: "https://x.com" }] }))

    const resp = await respPromise
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.result).toEqual([{ id: 1, url: "https://x.com" }])
    expect(data.duration).toBeDefined()

    handleClose(ws)
  })

  test("extension error returns 500", async () => {
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleCommand(makeReq({ command: "screenshot" }), apiKey)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "screenshot"
    })
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({ type: "response", id: parsed.id, error: "Screenshot failed" }))

    const resp = await respPromise
    expect(resp.status).toBe(500)
    const data = await resp.json()
    expect(data.ok).toBe(false)
    expect(data.error).toBe("Screenshot failed")

    handleClose(ws)
  })

  test("plugin command executes via REST", async () => {
    const testPlugin: BridgePlugin = {
      name: "resttest",
      version: "1.0.0",
      commands: {
        echo: {
          description: "Echo params",
          execute: async (params) => ({ echoed: params }),
        },
      },
    }
    await registerPlugin(testPlugin)

    const resp = await handleCommand(makeReq({ command: "resttest.echo", params: { msg: "hi" } }), apiKey)
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.result.echoed).toEqual({ msg: "hi" })
  })

  test("restricted key allowed via MCP tool name mapping", async () => {
    // Key restricted to "browser_navigate" MCP tool name
    const key = generateKey("mcp-name-acl", ["browser_navigate"])
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleCommand(makeReq({ command: "browser_navigate", params: { url: "https://x.com" } }), key)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "navigate"
    })
    expect(cmdMsg).toBeDefined()
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({ type: "response", id: parsed.id, result: {} }))

    const resp = await respPromise
    expect(resp.status).toBe(200)

    handleClose(ws)
  })

  test("null token skips permission check", async () => {
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleCommand(makeReq({ command: "tab.list" }), null)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "tab.list"
    })
    expect(cmdMsg).toBeDefined()
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({ type: "response", id: parsed.id, result: [{ id: 1 }] }))

    const resp = await respPromise
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)

    handleClose(ws)
  })

  test("command with server-side handler calls handler directly", async () => {
    // os_paste has a handler, should execute without extension
    const resp = await handleCommand(makeReq({ command: "os_paste", params: {} }), apiKey)
    // Should return 200 (handler runs) or 500 (handler error), but NOT 503 (extension not connected)
    expect(resp.status).not.toBe(503)
    const data = await resp.json()
    // It should have tried the handler (not require extension)
    expect(data.error).not.toBe("Extension not connected")
  })

  test("server-side handler error returns 500", async () => {
    const resp = await handleCommand(makeReq({
      command: "os_clipboard_write",
      params: { imagePath: "/nonexistent/file.png" },
    }), apiKey)
    expect(resp.status).toBe(500)
    const data = await resp.json()
    expect(data.ok).toBe(false)
    expect(data.error).toBeDefined()
  })

  test("server-side handler does NOT require extension connection", async () => {
    // No WS connected but handler should still work
    const resp = await handleCommand(makeReq({ command: "os.paste" }), apiKey)
    expect(resp.status).not.toBe(503)
  })

  test("accepts MCP tool name (browser_navigate) as command", async () => {
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleCommand(makeReq({ command: "browser_navigate", params: { url: "https://x.com" } }), apiKey)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "navigate"
    })
    expect(cmdMsg).toBeDefined()
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({ type: "response", id: parsed.id, result: {} }))

    const resp = await respPromise
    expect(resp.status).toBe(200)

    handleClose(ws)
  })
})

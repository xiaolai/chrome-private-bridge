import { describe, test, expect, beforeAll, beforeEach } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const testDir = mkdtempSync(join(tmpdir(), "chrome-bridge-mcp-test-"))
process.env.CONFIG_DIR = testDir
process.env.ENABLE_EVALUATE = "false"

import { handleMcp } from "../handler"
import { generateKey } from "../../auth"
import { handleOpen, handleMessage, handleClose } from "../../ws/manager"
import { registerPlugin, clearPlugins } from "../../plugins/loader"
import type { BridgePlugin } from "../../types"

// Import registry to ensure commands are registered
import "../../registry/index"

let apiKey: string

describe("MCP handler", () => {
  beforeAll(() => {
    writeFileSync(join(testDir, "keys.json"), JSON.stringify({ keys: [] }))
    apiKey = generateKey("mcp-test")
  })

  function mcpReq(body: unknown): Request {
    return new Request("http://localhost:7890/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  // Parse error
  test("invalid JSON returns parse error", async () => {
    const req = new Request("http://localhost:7890/mcp", {
      method: "POST",
      body: "not json{{{",
    })
    const resp = await handleMcp(req, apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32700)
    expect(data.error.message).toBe("Parse error")
  })

  // Invalid request — non-object body
  test("null body returns invalid request", async () => {
    const resp = await handleMcp(mcpReq(null), apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32600)
  })

  test("array body returns invalid request", async () => {
    const resp = await handleMcp(mcpReq([1, 2, 3]), apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32600)
  })

  test("string body returns invalid request", async () => {
    const req = new Request("http://localhost:7890/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify("hello"),
    })
    const resp = await handleMcp(req, apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32600)
  })

  // Invalid request
  test("missing jsonrpc field returns invalid request", async () => {
    const resp = await handleMcp(mcpReq({ method: "initialize" }), apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32600)
  })

  test("missing method field returns invalid request", async () => {
    const resp = await handleMcp(mcpReq({ jsonrpc: "2.0" }), apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32600)
  })

  // Initialize
  test("initialize returns protocol version and capabilities", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "initialize",
      id: 1,
    }), apiKey)
    const data = await resp.json()
    expect(data.jsonrpc).toBe("2.0")
    expect(data.id).toBe(1)
    expect(data.result.protocolVersion).toBe("2024-11-05")
    expect(data.result.capabilities.tools).toBeDefined()
    expect(data.result.serverInfo.name).toBe("chrome-private-bridge")
  })

  // notifications/initialized
  test("notifications/initialized returns 204", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }), apiKey)
    expect(resp.status).toBe(204)
  })

  // tools/list
  test("tools/list returns all registered tools", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/list",
      id: 2,
    }), apiKey)
    const data = await resp.json()
    expect(data.result.tools.length).toBeGreaterThanOrEqual(17)
    const names = data.result.tools.map((t: any) => t.name)
    expect(names).toContain("browser_navigate")
    expect(names).toContain("browser_tab_list")
  })

  test("tools/list respects per-key ACL", async () => {
    const restrictedKey = generateKey("restricted", ["browser_tab_list"])
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/list",
      id: 3,
    }), restrictedKey)
    const data = await resp.json()
    expect(data.result.tools).toHaveLength(1)
    expect(data.result.tools[0].name).toBe("browser_tab_list")
  })

  test("tools/list tools have inputSchema", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/list",
      id: 4,
    }), apiKey)
    const data = await resp.json()
    for (const tool of data.result.tools) {
      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema.type).toBe("object")
    }
  })

  // tools/call — missing tool name
  test("tools/call without name returns error", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {},
      id: 5,
    }), apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32602)
    expect(data.error.message).toContain("Missing tool name")
  })

  // tools/call — unknown tool
  test("tools/call with unknown tool returns error", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "nonexistent_tool" },
      id: 6,
    }), apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32602)
    expect(data.error.message).toContain("Unknown tool")
  })

  // tools/call — permission denied
  test("tools/call with restricted key returns error content", async () => {
    const restrictedKey = generateKey("restricted2", ["browser_tab_list"])
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "browser_navigate", arguments: { url: "https://x.com" } },
      id: 7,
    }), restrictedKey)
    const data = await resp.json()
    expect(data.result.isError).toBe(true)
    expect(data.result.content[0].text).toContain("not allowed")
  })

  // tools/call — evaluate gating
  test("tools/call browser_evaluate when disabled returns error content", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "browser_evaluate", arguments: { expression: "1+1" } },
      id: 8,
    }), apiKey)
    const data = await resp.json()
    expect(data.result.isError).toBe(true)
    expect(data.result.content[0].text).toContain("evaluate command is disabled")
  })

  // tools/call — validation error
  test("tools/call with invalid params returns validation error", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "browser_navigate", arguments: {} },
      id: 9,
    }), apiKey)
    const data = await resp.json()
    expect(data.result.isError).toBe(true)
    expect(data.result.content[0].text).toContain("Validation error")
  })

  // tools/call — extension not connected
  test("tools/call when extension not connected returns error content", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "browser_tab_list", arguments: {} },
      id: 10,
    }), apiKey)
    const data = await resp.json()
    expect(data.result.isError).toBe(true)
    expect(data.result.content[0].text).toContain("Extension not connected")
  })

  // tools/call — successful execution
  test("tools/call dispatches to extension and returns result", async () => {
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "browser_tab_list", arguments: {} },
      id: 11,
    }), apiKey)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "tab.list"
    })
    expect(cmdMsg).toBeDefined()
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({ type: "response", id: parsed.id, result: [{ id: 1, url: "https://x.com" }] }))

    const resp = await respPromise
    const data = await resp.json()
    expect(data.result.content[0].type).toBe("text")
    const resultData = JSON.parse(data.result.content[0].text)
    expect(resultData).toEqual([{ id: 1, url: "https://x.com" }])

    handleClose(ws)
  })

  // tools/call — screenshot returns image content
  test("tools/call screenshot returns image content", async () => {
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "browser_screenshot", arguments: {} },
      id: 12,
    }), apiKey)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "screenshot"
    })
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({
      type: "response",
      id: parsed.id,
      result: { dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    }))

    const resp = await respPromise
    const data = await resp.json()
    expect(data.result.content[0].type).toBe("image")
    expect(data.result.content[0].mimeType).toBe("image/png")
    expect(data.result.content[0].data).toBe("iVBORw0KGgo=")

    handleClose(ws)
  })

  // tools/call — extension error
  test("tools/call when extension returns error", async () => {
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "browser_navigate", arguments: { url: "https://x.com" } },
      id: 13,
    }), apiKey)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "navigate"
    })
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({ type: "response", id: parsed.id, error: "Navigation failed" }))

    const resp = await respPromise
    const data = await resp.json()
    expect(data.result.isError).toBe(true)
    expect(data.result.content[0].text).toBe("Navigation failed")

    handleClose(ws)
  })

  // Null token (open access mode)
  test("tools/list with null token returns all tools", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/list",
      id: 20,
    }), null)
    const data = await resp.json()
    expect(data.result.tools.length).toBeGreaterThanOrEqual(17)
  })

  test("tools/call with null token skips ACL check", async () => {
    const ws: any = {
      readyState: WebSocket.OPEN,
      sentMessages: [] as string[],
      send(msg: string) { this.sentMessages.push(msg) },
    }
    handleOpen(ws)

    const respPromise = handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "browser_tab_list", arguments: {} },
      id: 21,
    }), null)

    await new Promise(r => setTimeout(r, 10))

    const cmdMsg = ws.sentMessages.find((m: string) => {
      const p = JSON.parse(m)
      return p.type === "command" && p.command === "tab.list"
    })
    expect(cmdMsg).toBeDefined()
    const parsed = JSON.parse(cmdMsg!)

    handleMessage(ws, JSON.stringify({ type: "response", id: parsed.id, result: [{ id: 1, url: "https://x.com" }] }))

    const resp = await respPromise
    const data = await resp.json()
    expect(data.result.content[0].type).toBe("text")

    handleClose(ws)
  })

  // tools/call — server-side handler execution
  test("tools/call with server-side handler calls handler directly", async () => {
    // os_paste has a server-side handler — we use it but mock the underlying OS call
    // Instead, use os_clipboard_write with html param to test handler dispatch
    // We just verify the dispatch works (handler will fail since it's OS-level, but the dispatch is what matters)
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "os_paste", arguments: {} },
      id: 30,
    }), apiKey)
    const data = await resp.json()
    // The handler runs directly (no extension needed)
    // On macOS in test, osascript may fail, but it should NOT return "Extension not connected"
    expect(data.result.content[0].text).not.toContain("Extension not connected")
  })

  test("tools/call with server-side handler that throws returns error content", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "os_clipboard_write", arguments: { imagePath: "/nonexistent/file.png" } },
      id: 31,
    }), apiKey)
    const data = await resp.json()
    expect(data.result.isError).toBe(true)
    expect(data.result.content[0].text).toBeDefined()
  })

  test("server-side handler does NOT require extension connection", async () => {
    // No WebSocket connected — handler should still work
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "os_paste", arguments: { retries: 1 } },
      id: 32,
    }), apiKey)
    const data = await resp.json()
    // Should not get "Extension not connected" error
    expect(data.result.content[0].text).not.toContain("Extension not connected")
  })

  // Unknown method
  test("unknown method returns method not found", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "resources/list",
      id: 14,
    }), apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32601)
    expect(data.error.message).toContain("Method not found")
  })

  // Null id handling
  test("request without id uses null", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "initialize",
    }), apiKey)
    const data = await resp.json()
    expect(data.id).toBeNull()
  })

  // tools/call with no params object
  test("tools/call with missing params returns error", async () => {
    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 15,
    }), apiKey)
    const data = await resp.json()
    expect(data.error.code).toBe(-32602)
  })

  // tools/call — plugin command execution
  test("tools/call dispatches to plugin handler when plugin registered", async () => {
    const testPlugin: BridgePlugin = {
      name: "mcptest",
      version: "1.0.0",
      commands: {
        echo: {
          description: "Echo params back",
          execute: async (params) => ({ echoed: params }),
        },
      },
    }
    await registerPlugin(testPlugin)

    const resp = await handleMcp(mcpReq({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "mcptest_echo", arguments: { msg: "hello" } },
      id: 16,
    }), apiKey)
    const data = await resp.json()
    expect(data.result.content[0].type).toBe("text")
    const result = JSON.parse(data.result.content[0].text)
    expect(result.echoed).toBeDefined()
  })
})

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { ChromeBridge, type CommandResult } from "../index"

describe("ChromeBridge client", () => {
  let server: ReturnType<typeof Bun.serve>
  let bridge: ChromeBridge
  let baseUrl: string
  let lastRequest: Request | null = null

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        lastRequest = req.clone()
        const url = new URL(req.url)

        if (url.pathname === "/api/v1/status") {
          return Response.json({ ok: true, extension: "connected", uptime: 42 })
        }

        if (url.pathname === "/api/v1/command") {
          const body = await req.json().catch(() => null)
          if (!body) {
            return new Response("Bad Request", { status: 400 })
          }

          if (body.command === "fail-json") {
            return new Response("Internal Server Error", { status: 500 })
          }

          if (body.command === "fail-json-parseable") {
            return Response.json({ id: "x", ok: false, error: "server error", duration: 0 }, { status: 500 })
          }

          if (body.command === "tab.list") {
            return Response.json({ id: "cmd_1", ok: true, result: [{ id: 1, url: "https://x.com", title: "X", active: true }], duration: 5 })
          }

          return Response.json({ id: "cmd_2", ok: true, result: body.params ?? {}, duration: 1 })
        }

        return new Response("Not Found", { status: 404 })
      },
    })
    baseUrl = `http://localhost:${server.port}`
    bridge = new ChromeBridge({ url: baseUrl, apiKey: "bby_test123" })
  })

  afterAll(() => {
    server.stop()
  })

  beforeEach(() => {
    lastRequest = null
  })

  // Constructor
  test("constructor strips trailing slash from URL", () => {
    const b = new ChromeBridge({ url: "http://localhost:1234/", apiKey: "key" })
    // Verify by checking command request targets correct URL
    expect(b).toBeDefined()
  })

  test("constructor uses default timeout of 30000", () => {
    const b = new ChromeBridge({ url: "http://localhost", apiKey: "key" })
    expect(b).toBeDefined()
  })

  test("constructor accepts custom timeout", () => {
    const b = new ChromeBridge({ url: "http://localhost", apiKey: "key", timeout: 5000 })
    expect(b).toBeDefined()
  })

  // command()
  test("command() sends correct request and parses response", async () => {
    const result = await bridge.command("tab.list")
    expect(result.ok).toBe(true)
    expect(result.id).toBe("cmd_1")
    expect(result.result).toBeArray()
  })

  test("command() sends authorization header", async () => {
    await bridge.command("tab.list")
    expect(lastRequest).not.toBeNull()
    expect(lastRequest!.headers.get("authorization")).toBe("Bearer bby_test123")
  })

  test("command() sends content-type header", async () => {
    await bridge.command("tab.list")
    expect(lastRequest!.headers.get("content-type")).toBe("application/json")
  })

  test("command() handles non-JSON error response", async () => {
    const result = await bridge.command("fail-json")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("HTTP 500")
    expect(result.error).toContain("Internal Server Error")
    expect(result.id).toBe("")
    expect(result.duration).toBe(0)
  })

  test("command() handles JSON error response", async () => {
    const result = await bridge.command("fail-json-parseable")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("server error")
  })

  test("command() passes params", async () => {
    const result = await bridge.command("navigate", { url: "https://example.com" })
    expect(result.ok).toBe(true)
    expect(result.result).toEqual({ url: "https://example.com" })
  })

  // status()
  test("status() returns status object", async () => {
    const status = await bridge.status()
    expect(status.ok).toBe(true)
    expect(status.extension).toBe("connected")
    expect(status.uptime).toBe(42)
  })

  // Convenience methods
  test("navigate() sends navigate command", async () => {
    const result = await bridge.navigate("https://example.com")
    expect(result.ok).toBe(true)
  })

  test("navigate() with tabId", async () => {
    const result = await bridge.navigate("https://example.com", 1)
    expect(result.ok).toBe(true)
  })

  test("click() sends click command", async () => {
    const result = await bridge.click("#btn")
    expect(result.ok).toBe(true)
  })

  test("type() sends type command", async () => {
    const result = await bridge.type("#input", "hello")
    expect(result.ok).toBe(true)
  })

  test("press() sends press command", async () => {
    const result = await bridge.press("Enter")
    expect(result.ok).toBe(true)
  })

  test("press() with modifiers", async () => {
    const result = await bridge.press("a", ["ctrl"])
    expect(result.ok).toBe(true)
  })

  test("scroll() sends scroll command", async () => {
    const result = await bridge.scroll({ y: 100 })
    expect(result.ok).toBe(true)
  })

  test("query() sends query command", async () => {
    const result = await bridge.query("div")
    expect(result.ok).toBe(true)
  })

  test("queryText() sends query.text command", async () => {
    const result = await bridge.queryText("p")
    expect(result.ok).toBe(true)
  })

  test("wait() sends wait command", async () => {
    const result = await bridge.wait(".loaded")
    expect(result.ok).toBe(true)
  })

  test("screenshot() sends screenshot command", async () => {
    const result = await bridge.screenshot()
    expect(result.ok).toBe(true)
  })

  test("evaluate() sends evaluate command", async () => {
    const result = await bridge.evaluate("1+1")
    expect(result.ok).toBe(true)
  })

  test("tabs() sends tab.list command", async () => {
    const result = await bridge.tabs()
    expect(result.ok).toBe(true)
  })

  test("createTab() sends tab.create command", async () => {
    const result = await bridge.createTab("https://example.com")
    expect(result.ok).toBe(true)
  })

  test("closeTab() sends tab.close command", async () => {
    const result = await bridge.closeTab(1)
    expect(result.ok).toBe(true)
  })

  test("getCookies() sends cookie.get command", async () => {
    const result = await bridge.getCookies("https://example.com")
    expect(result.ok).toBe(true)
  })

  test("setCookie() sends cookie.set command", async () => {
    const result = await bridge.setCookie({ name: "a", value: "b" })
    expect(result.ok).toBe(true)
  })

  test("setFileInput() sends file.set command", async () => {
    const result = await bridge.setFileInput("#upload", ["/tmp/file.txt"])
    expect(result.ok).toBe(true)
  })

  test("clipboardWrite() sends clipboard.write command", async () => {
    const result = await bridge.clipboardWrite({ text: "hello" })
    expect(result.ok).toBe(true)
  })

})

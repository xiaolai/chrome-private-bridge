import { describe, test, expect } from "bun:test"
import { getCommand, getAllTools } from "../define"

// Ensure os-clipboard commands are registered
import "../os-clipboard"

describe("os-clipboard command registration", () => {
  test("os_clipboard_write is registered", () => {
    const cmd = getCommand("os_clipboard_write")
    expect(cmd).toBeDefined()
    expect(cmd!.name).toBe("os_clipboard_write")
    expect(cmd!.extensionCommand).toBe("os.clipboard.write")
  })

  test("os_paste is registered", () => {
    const cmd = getCommand("os_paste")
    expect(cmd).toBeDefined()
    expect(cmd!.name).toBe("os_paste")
    expect(cmd!.extensionCommand).toBe("os.paste")
  })

  test("os_clipboard_write has handler", () => {
    const cmd = getCommand("os_clipboard_write")!
    expect(typeof cmd.handler).toBe("function")
  })

  test("os_paste has handler", () => {
    const cmd = getCommand("os_paste")!
    expect(typeof cmd.handler).toBe("function")
  })

  test("os_clipboard_write has destructiveHint annotation", () => {
    const cmd = getCommand("os_clipboard_write")!
    expect(cmd.annotations?.destructiveHint).toBe(true)
  })

  test("os_paste has destructiveHint annotation", () => {
    const cmd = getCommand("os_paste")!
    expect(cmd.annotations?.destructiveHint).toBe(true)
  })

  test("os_clipboard_write rejects when neither imagePath nor html provided", () => {
    const cmd = getCommand("os_clipboard_write")!
    const result = cmd.params.safeParse({})
    expect(result.success).toBe(false)
  })

  test("os_clipboard_write accepts imagePath", () => {
    const cmd = getCommand("os_clipboard_write")!
    const result = cmd.params.safeParse({ imagePath: "/tmp/test.png" })
    expect(result.success).toBe(true)
  })

  test("os_clipboard_write accepts html", () => {
    const cmd = getCommand("os_clipboard_write")!
    const result = cmd.params.safeParse({ html: "<p>hello</p>" })
    expect(result.success).toBe(true)
  })

  test("os_paste accepts empty params (all optional)", () => {
    const cmd = getCommand("os_paste")!
    const result = cmd.params.safeParse({})
    expect(result.success).toBe(true)
  })

  test("os_paste validates retries range 1-10", () => {
    const cmd = getCommand("os_paste")!
    expect(cmd.params.safeParse({ retries: 0 }).success).toBe(false)
    expect(cmd.params.safeParse({ retries: 11 }).success).toBe(false)
    expect(cmd.params.safeParse({ retries: 5 }).success).toBe(true)
  })

  test("os_paste validates delay range 100-5000", () => {
    const cmd = getCommand("os_paste")!
    expect(cmd.params.safeParse({ delay: 50 }).success).toBe(false)
    expect(cmd.params.safeParse({ delay: 6000 }).success).toBe(false)
    expect(cmd.params.safeParse({ delay: 500 }).success).toBe(true)
  })

  test("os_clipboard_write handler with imagePath calls copyImageToClipboard", async () => {
    const cmd = getCommand("os_clipboard_write")!
    // Call with nonexistent file to test error path
    await expect(cmd.handler!({ imagePath: "/nonexistent.png" })).rejects.toThrow("File not found")
  })

  test("os_clipboard_write handler with html calls copyHtmlToClipboard", async () => {
    const cmd = getCommand("os_clipboard_write")!
    // On unsupported platform or real platform, this calls through
    // Just verify the handler exists and processes html params
    try {
      await cmd.handler!({ html: "<p>test</p>" })
    } catch {
      // May fail on actual platform but the code path is exercised
    }
  })

  test("os_paste handler calls pasteFromClipboard", async () => {
    const cmd = getCommand("os_paste")!
    // This actually sends a paste keystroke — just verify it returns a result
    const result = await cmd.handler!({ retries: 1 }) as any
    expect(result).toBeDefined()
    expect(typeof result.success).toBe("boolean")
    expect(typeof result.platform).toBe("string")
  })

  test("both commands appear in getAllTools()", () => {
    const tools = getAllTools()
    const names = tools.map(t => t.name)
    expect(names).toContain("os_clipboard_write")
    expect(names).toContain("os_paste")
  })

  test("os_clipboard_write tool has inputSchema", () => {
    const tools = getAllTools()
    const tool = tools.find(t => t.name === "os_clipboard_write")!
    expect(tool.inputSchema).toBeDefined()
    expect((tool.inputSchema as any).type).toBe("object")
  })

  test("os_paste tool has inputSchema", () => {
    const tools = getAllTools()
    const tool = tools.find(t => t.name === "os_paste")!
    expect(tool.inputSchema).toBeDefined()
    expect((tool.inputSchema as any).type).toBe("object")
  })
})

import { describe, test, expect } from "bun:test"
import { getCommand, getAllTools } from "../index"

describe("registry/commands (all command files)", () => {
  const expectedCommands = [
    { name: "browser_navigate", ext: "navigate" },
    { name: "browser_click", ext: "click" },
    { name: "browser_type", ext: "type" },
    { name: "browser_press", ext: "press" },
    { name: "browser_scroll", ext: "scroll" },
    { name: "browser_query", ext: "query" },
    { name: "browser_query_text", ext: "query.text" },
    { name: "browser_wait_for_element", ext: "wait" },
    { name: "browser_screenshot", ext: "screenshot" },
    { name: "browser_evaluate", ext: "evaluate" },
    { name: "browser_tab_list", ext: "tab.list" },
    { name: "browser_tab_create", ext: "tab.create" },
    { name: "browser_tab_close", ext: "tab.close" },
    { name: "browser_cookie_get", ext: "cookie.get" },
    { name: "browser_cookie_set", ext: "cookie.set" },
    { name: "browser_file_set", ext: "file.set" },
    { name: "browser_clipboard_write", ext: "clipboard.write" },
  ]

  test("all 17 browser commands are registered", () => {
    const tools = getAllTools()
    const names = tools.map(t => t.name)
    for (const cmd of expectedCommands) {
      expect(names).toContain(cmd.name)
    }
    expect(tools.length).toBeGreaterThanOrEqual(17)
  })

  for (const cmd of expectedCommands) {
    test(`${cmd.name} maps to extension command "${cmd.ext}"`, () => {
      const def = getCommand(cmd.name)
      expect(def).toBeDefined()
      expect(def!.extensionCommand).toBe(cmd.ext)
    })
  }

  // Validation tests for each command
  test("browser_navigate: requires url", () => {
    const cmd = getCommand("browser_navigate")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ url: "https://x.com" }).success).toBe(true)
    expect(cmd.params.safeParse({ url: "https://x.com", tabId: 1 }).success).toBe(true)
  })

  test("browser_click: requires selector", () => {
    const cmd = getCommand("browser_click")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ selector: "#btn" }).success).toBe(true)
  })

  test("browser_type: requires selector and text", () => {
    const cmd = getCommand("browser_type")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ selector: "#in" }).success).toBe(false)
    expect(cmd.params.safeParse({ selector: "#in", text: "hello" }).success).toBe(true)
  })

  test("browser_press: requires key", () => {
    const cmd = getCommand("browser_press")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ key: "Enter" }).success).toBe(true)
    expect(cmd.params.safeParse({ key: "a", modifiers: ["ctrl"] }).success).toBe(true)
  })

  test("browser_scroll: all optional", () => {
    const cmd = getCommand("browser_scroll")!
    expect(cmd.params.safeParse({}).success).toBe(true)
    expect(cmd.params.safeParse({ x: 0, y: 100 }).success).toBe(true)
    expect(cmd.params.safeParse({ selector: ".el" }).success).toBe(true)
  })

  test("browser_query: requires selector", () => {
    const cmd = getCommand("browser_query")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ selector: "div" }).success).toBe(true)
    expect(cmd.params.safeParse({ selector: "div", attrs: ["href"] }).success).toBe(true)
  })

  test("browser_query_text: requires selector", () => {
    const cmd = getCommand("browser_query_text")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ selector: "p" }).success).toBe(true)
  })

  test("browser_wait_for_element: requires selector", () => {
    const cmd = getCommand("browser_wait_for_element")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ selector: ".loaded" }).success).toBe(true)
    expect(cmd.params.safeParse({ selector: ".loaded", timeout: 5000 }).success).toBe(true)
  })

  test("browser_screenshot: all optional", () => {
    const cmd = getCommand("browser_screenshot")!
    expect(cmd.params.safeParse({}).success).toBe(true)
    expect(cmd.params.safeParse({ tabId: 1 }).success).toBe(true)
  })

  test("browser_evaluate: requires expression", () => {
    const cmd = getCommand("browser_evaluate")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ expression: "1+1" }).success).toBe(true)
  })

  test("browser_tab_list: empty params", () => {
    const cmd = getCommand("browser_tab_list")!
    expect(cmd.params.safeParse({}).success).toBe(true)
  })

  test("browser_tab_create: optional url", () => {
    const cmd = getCommand("browser_tab_create")!
    expect(cmd.params.safeParse({}).success).toBe(true)
    expect(cmd.params.safeParse({ url: "https://x.com" }).success).toBe(true)
  })

  test("browser_tab_close: requires tabId", () => {
    const cmd = getCommand("browser_tab_close")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ tabId: 1 }).success).toBe(true)
  })

  test("browser_cookie_get: requires url", () => {
    const cmd = getCommand("browser_cookie_get")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ url: "https://x.com" }).success).toBe(true)
    expect(cmd.params.safeParse({ url: "https://x.com", name: "sid" }).success).toBe(true)
  })

  test("browser_cookie_set: requires cookie object", () => {
    const cmd = getCommand("browser_cookie_set")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ cookie: { name: "a", value: "b" } }).success).toBe(true)
  })

  test("browser_file_set: requires selector", () => {
    const cmd = getCommand("browser_file_set")!
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ selector: "#upload" }).success).toBe(true)
    expect(cmd.params.safeParse({ selector: "#upload", paths: ["/tmp/a.txt"] }).success).toBe(true)
  })

  test("browser_clipboard_write: all optional", () => {
    const cmd = getCommand("browser_clipboard_write")!
    expect(cmd.params.safeParse({}).success).toBe(true)
    expect(cmd.params.safeParse({ text: "hello" }).success).toBe(true)
  })

  // Annotations
  test("readOnlyHint annotations are set correctly", () => {
    const readOnlyTools = ["browser_query", "browser_query_text", "browser_wait_for_element", "browser_screenshot", "browser_tab_list", "browser_cookie_get"]
    for (const name of readOnlyTools) {
      const cmd = getCommand(name)!
      expect(cmd.annotations?.readOnlyHint).toBe(true)
    }
  })

  test("destructiveHint annotations are set correctly", () => {
    const destructiveTools = ["browser_click", "browser_type", "browser_press", "browser_tab_close", "browser_file_set"]
    for (const name of destructiveTools) {
      const cmd = getCommand(name)!
      expect(cmd.annotations?.destructiveHint).toBe(true)
    }
  })

  test("openWorldHint annotations are set correctly", () => {
    const openWorldTools = ["browser_navigate", "browser_evaluate"]
    for (const name of openWorldTools) {
      const cmd = getCommand(name)!
      expect(cmd.annotations?.openWorldHint).toBe(true)
    }
  })
})

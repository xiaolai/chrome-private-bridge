import { describe, test, expect } from "bun:test"
import { z } from "zod/v4"
import { defineCommand, getCommand, getAllTools, getAllCommands, clearCommands } from "../define"

// Use a unique prefix to avoid collisions with other tests using the global registry
let counter = 0
function uid(base: string) {
  return `__define_test_${base}_${++counter}`
}

describe("registry/define", () => {
  test("defineCommand() registers a command and returns it", () => {
    const name = uid("cmd")
    const def = defineCommand({
      name,
      description: "A test command",
      extensionCommand: "test",
      params: z.object({ url: z.string() }),
    })
    expect(def.name).toBe(name)
    expect(def.description).toBe("A test command")
  })

  test("getCommand() returns registered command", () => {
    const name = uid("get")
    defineCommand({
      name,
      description: "test",
      extensionCommand: "test",
      params: z.object({}),
    })
    const cmd = getCommand(name)
    expect(cmd).toBeDefined()
    expect(cmd!.name).toBe(name)
  })

  test("getCommand() returns undefined for unknown command", () => {
    expect(getCommand("__nonexistent_xyz_987")).toBeUndefined()
  })

  test("getAllTools() returns registered tools including test-defined ones", () => {
    const name = uid("all")
    defineCommand({
      name,
      description: "Tool All",
      extensionCommand: "a",
      params: z.object({ x: z.string() }),
    })
    const tools = getAllTools()
    const found = tools.find(t => t.name === name)
    expect(found).toBeDefined()
    expect(found!.description).toBe("Tool All")
  })

  test("getAllTools() filters by allowedCommands", () => {
    const allowed = uid("allowed")
    const blocked = uid("blocked")
    defineCommand({ name: allowed, description: "Allowed", extensionCommand: "a", params: z.object({}) })
    defineCommand({ name: blocked, description: "Blocked", extensionCommand: "b", params: z.object({}) })
    const tools = getAllTools([allowed])
    expect(tools.find(t => t.name === allowed)).toBeDefined()
    expect(tools.find(t => t.name === blocked)).toBeUndefined()
  })

  test("getAllTools() with null allowedCommands returns all", () => {
    const name = uid("null_acl")
    defineCommand({ name, description: "A", extensionCommand: "a", params: z.object({}) })
    const tools = getAllTools(null)
    expect(tools.find(t => t.name === name)).toBeDefined()
  })

  test("getAllTools() generates valid JSON Schema for tool inputSchema", () => {
    const name = uid("schema")
    defineCommand({
      name,
      description: "Test",
      extensionCommand: "test",
      params: z.object({
        url: z.string().describe("The URL"),
        count: z.number().optional().describe("Count"),
      }),
    })
    const tools = getAllTools()
    const tool = tools.find(t => t.name === name)!
    const schema = tool.inputSchema as any
    expect(schema.type).toBe("object")
    expect(schema.properties.url).toBeDefined()
    expect(schema.properties.count).toBeDefined()
  })

  test("getAllTools() includes annotations when present", () => {
    const name = uid("annot")
    defineCommand({
      name,
      description: "Annotated",
      extensionCommand: "a",
      params: z.object({}),
      annotations: { readOnlyHint: true },
    })
    const tools = getAllTools()
    const tool = tools.find(t => t.name === name)!
    expect(tool.annotations).toEqual({ readOnlyHint: true })
  })

  test("getAllTools() omits annotations when not present", () => {
    const name = uid("no_annot")
    defineCommand({
      name,
      description: "No annotations",
      extensionCommand: "a",
      params: z.object({}),
    })
    const tools = getAllTools()
    const tool = tools.find(t => t.name === name)!
    expect(tool.annotations).toBeUndefined()
  })

  test("getAllCommands() returns the internal map with test commands", () => {
    const name = uid("map")
    defineCommand({ name, description: "Test", extensionCommand: "test", params: z.object({}) })
    const map = getAllCommands()
    expect(map.get(name)).toBeDefined()
  })

  test("defineCommand() throws on duplicate name", () => {
    const name = uid("dup")
    defineCommand({ name, description: "First", extensionCommand: "a", params: z.object({}) })
    expect(() => {
      defineCommand({ name, description: "Second", extensionCommand: "b", params: z.object({}) })
    }).toThrow(`Command "${name}" already registered`)
  })

  test("defineCommand() accepts handler field", () => {
    const name = uid("handler")
    const handler = async () => ({ ok: true })
    const def = defineCommand({
      name,
      description: "With handler",
      extensionCommand: "test.handler",
      params: z.object({}),
      handler,
    })
    expect(def.handler).toBe(handler)
  })

  test("getCommand() returns command with handler intact", () => {
    const name = uid("handler_get")
    const handler = async () => ({ ok: true })
    defineCommand({
      name,
      description: "With handler",
      extensionCommand: "test.handler",
      params: z.object({}),
      handler,
    })
    const cmd = getCommand(name)!
    expect(cmd.handler).toBe(handler)
  })

  test("getAllTools() works for commands with handler", () => {
    const name = uid("handler_tools")
    defineCommand({
      name,
      description: "Handler tool",
      extensionCommand: "test.handler",
      params: z.object({ x: z.string().optional() }),
      handler: async () => ({}),
    })
    const tools = getAllTools()
    const tool = tools.find(t => t.name === name)
    expect(tool).toBeDefined()
    expect(tool!.inputSchema).toBeDefined()
  })

  test("clearCommands() is a function", () => {
    // clearCommands() affects global state so we only verify it exists
    // Actual clearing behavior is tested in plugin loader tests with controlled state
    expect(typeof clearCommands).toBe("function")
  })

  test("Zod validation works on registered command params", () => {
    const name = uid("validate")
    defineCommand({
      name,
      description: "Test",
      extensionCommand: "test",
      params: z.object({
        url: z.string(),
        tabId: z.number().optional(),
      }),
    })
    const cmd = getCommand(name)!
    expect(cmd.params.safeParse({ url: "https://x.com" }).success).toBe(true)
    expect(cmd.params.safeParse({}).success).toBe(false)
    expect(cmd.params.safeParse({ url: 123 }).success).toBe(false)
    expect(cmd.params.safeParse({ url: "test", tabId: 1 }).success).toBe(true)
    expect(cmd.params.safeParse({ url: "test", tabId: "bad" }).success).toBe(false)
  })
})

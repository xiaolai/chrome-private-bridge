import { describe, test, expect, beforeEach } from "bun:test"
import type { BridgePlugin } from "../../types"

// We need fresh module state for each test, so we use dynamic imports
let registerPlugin: typeof import("../registry").registerPlugin
let getPluginCommand: typeof import("../registry").getPluginCommand
let listPlugins: typeof import("../registry").listPlugins

function makePlugin(name: string, commands: string[] = ["run"], init?: () => Promise<void>): BridgePlugin {
  const cmds: BridgePlugin["commands"] = {}
  for (const cmd of commands) {
    cmds[cmd] = {
      description: `${cmd} command`,
      execute: async () => ({ ok: true }),
    }
  }
  return {
    name,
    version: "1.0.0",
    commands: cmds,
    ...(init ? { init: async () => { await init() } } : {}),
  }
}

describe("plugin registry", () => {
  beforeEach(async () => {
    // Clear module cache to reset plugins map
    const regPath = require.resolve("../registry")
    const logPath = require.resolve("../../logger")
    delete require.cache[regPath]
    delete require.cache[logPath]
    const mod = await import("../registry")
    registerPlugin = mod.registerPlugin
    getPluginCommand = mod.getPluginCommand
    listPlugins = mod.listPlugins
  })

  test("registerPlugin() succeeds for valid plugin", async () => {
    const plugin = makePlugin("test")
    await expect(registerPlugin(plugin)).resolves.toBeUndefined()
  })

  test("registerPlugin() throws for duplicate name", async () => {
    const plugin1 = makePlugin("dup")
    const plugin2 = makePlugin("dup")
    await registerPlugin(plugin1)
    await expect(registerPlugin(plugin2)).rejects.toThrow('Plugin "dup" already registered')
  })

  test("registerPlugin() calls init() if present", async () => {
    let called = false
    const plugin = makePlugin("init-test", ["run"], async () => { called = true })
    await registerPlugin(plugin)
    expect(called).toBe(true)
  })

  test('getPluginCommand("test.run") returns handler after registration', async () => {
    const plugin = makePlugin("test", ["run"])
    await registerPlugin(plugin)
    const handler = getPluginCommand("test.run")
    expect(handler).not.toBeNull()
    expect(handler!.description).toBe("run command")
  })

  test('getPluginCommand("unknown.cmd") returns null', () => {
    expect(getPluginCommand("unknown.cmd")).toBeNull()
  })

  test('getPluginCommand("noprefix") returns null (no dot)', () => {
    expect(getPluginCommand("noprefix")).toBeNull()
  })

  test("listPlugins() returns registered plugin metadata", async () => {
    await registerPlugin(makePlugin("alpha", ["a", "b"]))
    await registerPlugin(makePlugin("beta", ["x"]))
    const list = listPlugins()
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe("alpha")
    expect(list[0].commands).toEqual(["a", "b"])
    expect(list[1].name).toBe("beta")
  })
})

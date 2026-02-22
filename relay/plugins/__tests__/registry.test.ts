import { describe, test, expect, beforeEach } from "bun:test"
import { registerPlugin, getPluginCommand, listPlugins } from "../registry"
import type { BridgePlugin } from "../../types"

// Track registered names to avoid conflicts across tests
let testCounter = 0

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
  beforeEach(() => {
    testCounter++
  })

  test("registerPlugin() succeeds for valid plugin", async () => {
    const plugin = makePlugin(`valid-${testCounter}`)
    await expect(registerPlugin(plugin)).resolves.toBeUndefined()
  })

  test("registerPlugin() throws for duplicate name", async () => {
    const name = `dup-${testCounter}`
    const plugin1 = makePlugin(name)
    const plugin2 = makePlugin(name)
    await registerPlugin(plugin1)
    await expect(registerPlugin(plugin2)).rejects.toThrow(`Plugin "${name}" already registered`)
  })

  test("registerPlugin() calls init() if present", async () => {
    let called = false
    const plugin = makePlugin(`init-${testCounter}`, ["run"], async () => { called = true })
    await registerPlugin(plugin)
    expect(called).toBe(true)
  })

  test("getPluginCommand() returns handler after registration", async () => {
    const name = `cmd-${testCounter}`
    const plugin = makePlugin(name, ["run"])
    await registerPlugin(plugin)
    const handler = getPluginCommand(`${name}.run`)
    expect(handler).not.toBeNull()
    expect(handler!.description).toBe("run command")
  })

  test("getPluginCommand() handler executes correctly", async () => {
    const name = `exec-${testCounter}`
    const plugin = makePlugin(name, ["run"])
    await registerPlugin(plugin)
    const handler = getPluginCommand(`${name}.run`)
    const result = await handler!.execute({}, { send: async () => {}, log: () => {} })
    expect(result).toEqual({ ok: true })
  })

  test('getPluginCommand("unknown.cmd") returns null', () => {
    expect(getPluginCommand("unknown_nonexistent.cmd")).toBeNull()
  })

  test('getPluginCommand("noprefix") returns null (no dot)', () => {
    expect(getPluginCommand("noprefix")).toBeNull()
  })

  test("listPlugins() includes registered plugins", async () => {
    const name = `list-${testCounter}`
    await registerPlugin(makePlugin(name, ["a", "b"]))
    const list = listPlugins()
    const found = list.find(p => p.name === name)
    expect(found).toBeDefined()
    expect(found!.commands).toEqual(["a", "b"])
  })
})

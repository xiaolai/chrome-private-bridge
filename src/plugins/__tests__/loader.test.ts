import { describe, test, expect, beforeEach } from "bun:test"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

if (!process.env.CONFIG_DIR) {
  process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), "chrome-bridge-plugin-test-"))
}

import { registerPlugin, getPluginCommand, listPlugins, clearPlugins, createPluginExecutionContext } from "../loader"
import { clearCommands, getCommand } from "../../registry/define"
import type { BridgePlugin } from "../../types"

let testCounter = 0

function makePlugin(name: string, commands: string[] = ["run"], init?: () => Promise<void>): BridgePlugin {
  const cmds: BridgePlugin["commands"] = {}
  for (const cmd of commands) {
    cmds[cmd] = {
      description: `${cmd} command`,
      execute: async (params) => ({ ok: true, params }),
    }
  }
  return {
    name,
    version: "1.0.0",
    commands: cmds,
    ...(init ? { init: async () => { await init() } } : {}),
  }
}

describe("plugin loader", () => {
  beforeEach(() => {
    testCounter++
    clearPlugins()
    clearCommands()
  })

  test("registerPlugin() succeeds for valid plugin", async () => {
    const plugin = makePlugin(`valid-${testCounter}`)
    await expect(registerPlugin(plugin)).resolves.toBeUndefined()
  })

  test("registerPlugin() throws for duplicate name", async () => {
    const name = `dup-${testCounter}`
    await registerPlugin(makePlugin(name))
    await expect(registerPlugin(makePlugin(name))).rejects.toThrow(`Plugin "${name}" already registered`)
  })

  test("registerPlugin() calls init() if present", async () => {
    let called = false
    const plugin = makePlugin(`init-${testCounter}`, ["run"], async () => { called = true })
    await registerPlugin(plugin)
    expect(called).toBe(true)
  })

  test("registerPlugin() registers commands into command registry", async () => {
    const name = `reg-${testCounter}`
    await registerPlugin(makePlugin(name, ["run", "stop"]))
    // Plugin commands should be registered as MCP tools
    expect(getCommand(`${name}_run`)).toBeDefined()
    expect(getCommand(`${name}_stop`)).toBeDefined()
  })

  test("getPluginCommand() returns handler after registration", async () => {
    const name = `cmd-${testCounter}`
    await registerPlugin(makePlugin(name, ["run"]))
    const handler = getPluginCommand(`${name}.run`)
    expect(handler).not.toBeNull()
  })

  test("getPluginCommand() handler executes correctly", async () => {
    const name = `exec-${testCounter}`
    await registerPlugin(makePlugin(name, ["run"]))
    const handler = getPluginCommand(`${name}.run`)
    const result = await handler!.execute({ msg: "hi" }, { send: async () => {}, log: () => {} })
    expect(result).toEqual({ ok: true, params: { msg: "hi" } })
  })

  test('getPluginCommand("unknown.cmd") returns null', () => {
    expect(getPluginCommand("unknown_nonexistent.cmd")).toBeNull()
  })

  test('getPluginCommand("noprefix") returns null (no dot)', () => {
    expect(getPluginCommand("noprefix")).toBeNull()
  })

  test("getPluginCommand() returns null for unknown command on known plugin", async () => {
    const name = `partial-${testCounter}`
    await registerPlugin(makePlugin(name, ["run"]))
    expect(getPluginCommand(`${name}.nonexistent`)).toBeNull()
  })

  test("listPlugins() includes registered plugins", async () => {
    const name = `list-${testCounter}`
    await registerPlugin(makePlugin(name, ["a", "b"]))
    const list = listPlugins()
    const found = list.find(p => p.name === name)
    expect(found).toBeDefined()
    expect(found!.commands).toEqual(["a", "b"])
  })

  test("createPluginExecutionContext() returns valid context", () => {
    const ctx = createPluginExecutionContext()
    expect(typeof ctx.send).toBe("function")
    expect(typeof ctx.log).toBe("function")
  })

  test("clearPlugins() removes all plugins", async () => {
    await registerPlugin(makePlugin(`clear-${testCounter}`))
    clearPlugins()
    expect(listPlugins()).toHaveLength(0)
  })
})

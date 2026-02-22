import { z } from "zod/v4"
import { defineCommand } from "../registry/define"
import { log } from "../logger"
import { sendToExtension } from "../ws/manager"
import type { BridgePlugin, PluginContext, ExecutionContext } from "../types"

const plugins = new Map<string, BridgePlugin>()

export async function registerPlugin(plugin: BridgePlugin): Promise<void> {
  if (plugins.has(plugin.name)) {
    throw new Error(`Plugin "${plugin.name}" already registered`)
  }
  const ctx: PluginContext = {
    log: (msg: string) => log("info", "plugin.log", { plugin: plugin.name, message: msg }),
  }
  if (plugin.init) {
    await plugin.init(ctx)
  }

  // Register commands first before storing plugin to avoid partial state
  for (const [cmdName, handler] of Object.entries(plugin.commands)) {
    const toolName = `${plugin.name}_${cmdName}`
    const extCommand = `${plugin.name}.${cmdName}`

    defineCommand({
      name: toolName,
      description: handler.description,
      extensionCommand: extCommand,
      params: handler.params ?? z.object({}).passthrough(),
    })
  }

  plugins.set(plugin.name, plugin)

  const cmds = Object.keys(plugin.commands)
  log("info", "plugin.registered", { name: plugin.name, version: plugin.version, commands: cmds })
}

export function getPluginCommand(fullCommand: string): { execute: (params: unknown, ctx: ExecutionContext) => Promise<unknown> } | null {
  const dot = fullCommand.indexOf(".")
  if (dot === -1) return null
  const pluginName = fullCommand.slice(0, dot)
  const cmdName = fullCommand.slice(dot + 1)
  const plugin = plugins.get(pluginName)
  if (!plugin) return null
  const handler = plugin.commands[cmdName]
  if (!handler) return null
  return handler
}

export function createPluginExecutionContext(): ExecutionContext {
  return {
    send: sendToExtension,
    log: (msg: string) => log("info", "plugin.log", { message: msg }),
  }
}

export function listPlugins(): Array<{ name: string; version: string; commands: string[] }> {
  return Array.from(plugins.values()).map(p => ({
    name: p.name,
    version: p.version,
    commands: Object.keys(p.commands),
  }))
}

export function clearPlugins(): void {
  plugins.clear()
}

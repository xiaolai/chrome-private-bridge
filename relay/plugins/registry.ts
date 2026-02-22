import type { BridgePlugin, CommandHandler, ExecutionContext, PluginContext } from "../types"

const plugins = new Map<string, BridgePlugin>()

export async function registerPlugin(plugin: BridgePlugin): Promise<void> {
  if (plugins.has(plugin.name)) {
    throw new Error(`Plugin "${plugin.name}" already registered`)
  }
  const ctx: PluginContext = {
    log: (msg: string) => console.log(`[plugin:${plugin.name}] ${msg}`),
  }
  if (plugin.init) {
    await plugin.init(ctx)
  }
  plugins.set(plugin.name, plugin)
  const cmds = Object.keys(plugin.commands)
  console.log(`[plugins] Registered "${plugin.name}" v${plugin.version} (${cmds.length} commands: ${cmds.join(", ")})`)
}

export function getPluginCommand(fullCommand: string): CommandHandler | null {
  const dot = fullCommand.indexOf(".")
  if (dot === -1) return null
  const pluginName = fullCommand.slice(0, dot)
  const cmdName = fullCommand.slice(dot + 1)
  const plugin = plugins.get(pluginName)
  if (!plugin) return null
  return plugin.commands[cmdName] ?? null
}

export function listPlugins(): Array<{ name: string; version: string; commands: string[] }> {
  return Array.from(plugins.values()).map(p => ({
    name: p.name,
    version: p.version,
    commands: Object.keys(p.commands),
  }))
}

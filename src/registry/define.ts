import { z } from "zod/v4"

export interface McpToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  openWorldHint?: boolean
}

export interface CommandDef {
  name: string
  description: string
  params: z.ZodObject<any> | z.ZodPipe<z.ZodObject<any>, any>
  extensionCommand: string
  handler?: (params: Record<string, unknown>) => Promise<unknown>
  annotations?: McpToolAnnotations
}

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: McpToolAnnotations
}

const commands = new Map<string, CommandDef>()

export function defineCommand(def: CommandDef): CommandDef {
  if (commands.has(def.name)) {
    throw new Error(`Command "${def.name}" already registered`)
  }
  commands.set(def.name, def)
  return def
}

export function getCommand(name: string): CommandDef | undefined {
  return commands.get(name)
}

export function getAllTools(allowedCommands?: string[] | null): McpTool[] {
  const tools: McpTool[] = []
  for (const def of commands.values()) {
    if (allowedCommands && !allowedCommands.includes(def.name)) continue
    const tool: McpTool = {
      name: def.name,
      description: def.description,
      inputSchema: z.toJSONSchema(def.params),
    }
    if (def.annotations) {
      tool.annotations = def.annotations
    }
    tools.push(tool)
  }
  return tools
}

export function getAllCommands(): Map<string, CommandDef> {
  return commands
}

export function clearCommands(): void {
  commands.clear()
}

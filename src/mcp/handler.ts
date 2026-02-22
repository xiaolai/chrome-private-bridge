import { getCommand, getAllTools } from "../registry/index"
import { getKeyPermissions } from "../auth"
import { config } from "../config"
import { log } from "../logger"
import { sendToExtension, isConnected } from "../ws/manager"
import { getPluginCommand, createPluginExecutionContext } from "../plugins/loader"
import { toError } from "../utils"
import { jsonResponse } from "../response"

const MCP_PROTOCOL_VERSION = "2024-11-05"
const SERVER_NAME = "chrome-private-bridge"
const SERVER_VERSION = "0.2.0"

interface JsonRpcRequest {
  jsonrpc: "2.0"
  method: string
  params?: Record<string, unknown>
  id?: string | number | null
}

interface JsonRpcResponse {
  jsonrpc: "2.0"
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
  id: string | number | null
}

function jsonRpc(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", result, id }
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", error: { code, message, ...(data !== undefined ? { data } : {}) }, id }
}

function mcpResponse(data: JsonRpcResponse): Response {
  return jsonResponse(data)
}

function errorContent(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true }
}

export async function handleMcp(req: Request, token: string | null): Promise<Response> {
  let body: JsonRpcRequest
  try {
    body = await req.json()
  } catch {
    return mcpResponse(jsonRpcError(null, -32700, "Parse error"))
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return mcpResponse(jsonRpcError(null, -32600, "Invalid Request"))
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return mcpResponse(jsonRpcError(body.id ?? null, -32600, "Invalid Request"))
  }

  const id = body.id ?? null

  switch (body.method) {
    case "initialize":
      return handleInitialize(id)
    case "notifications/initialized":
      return new Response(null, { status: 204 })
    case "tools/list":
      return handleToolsList(id, token)
    case "tools/call":
      return handleToolsCall(id, token, body.params)
    default:
      return mcpResponse(jsonRpcError(id, -32601, `Method not found: ${body.method}`))
  }
}

function handleInitialize(id: string | number | null): Response {
  return mcpResponse(jsonRpc(id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  }))
}

function handleToolsList(id: string | number | null, token: string | null): Response {
  const allowed = token ? getKeyPermissions(token) : null
  const tools = getAllTools(allowed)
  return mcpResponse(jsonRpc(id, { tools }))
}

async function handleToolsCall(
  id: string | number | null,
  token: string | null,
  params?: Record<string, unknown>,
): Promise<Response> {
  const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined
  if (!p?.name) {
    return mcpResponse(jsonRpcError(id, -32602, "Missing tool name"))
  }

  const toolName = p.name
  const args = p.arguments ?? {}

  const allowed = token ? getKeyPermissions(token) : null
  if (allowed && !allowed.includes(toolName)) {
    return mcpResponse(jsonRpc(id, errorContent(`Tool "${toolName}" not allowed for this key`)))
  }

  const def = getCommand(toolName)
  if (!def) {
    return mcpResponse(jsonRpcError(id, -32602, `Unknown tool: ${toolName}`))
  }

  if (def.extensionCommand === "evaluate" && !config.enableEvaluate) {
    return mcpResponse(jsonRpc(id, errorContent("evaluate command is disabled. Set ENABLE_EVALUATE=true to enable")))
  }

  const parsed = def.params.safeParse(args)
  if (!parsed.success) {
    const errors = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
    return mcpResponse(jsonRpc(id, errorContent(`Validation error: ${errors}`)))
  }

  return executeAndRespond(id, toolName, def, parsed.data)
}

async function executeAndRespond(
  id: string | number | null,
  toolName: string,
  def: ReturnType<typeof getCommand> & {},
  validatedArgs: unknown,
): Promise<Response> {
  const start = Date.now()

  try {
    let result: unknown

    if (def.handler) {
      result = await def.handler(validatedArgs as Record<string, unknown>)
    } else {
      const pluginHandler = getPluginCommand(def.extensionCommand)
      if (pluginHandler) {
        const ctx = createPluginExecutionContext()
        result = await pluginHandler.execute(validatedArgs, ctx)
      } else {
        if (!isConnected()) {
          return mcpResponse(jsonRpc(id, errorContent("Extension not connected")))
        }
        result = await sendToExtension(def.extensionCommand, validatedArgs as Record<string, unknown>)
      }
    }

    const duration = Date.now() - start
    log("info", "mcp.tool.executed", { tool: toolName, duration, ok: true })

    if (def.extensionCommand === "screenshot" && result && typeof result === "object" && "dataUrl" in (result as any)) {
      const dataUrl = (result as { dataUrl: string }).dataUrl
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "")
      return mcpResponse(jsonRpc(id, {
        content: [{ type: "image", data: base64, mimeType: "image/png" }],
      }))
    }

    return mcpResponse(jsonRpc(id, {
      content: [{ type: "text", text: JSON.stringify(result ?? null) }],
    }))
  } catch (thrown: unknown) {
    const err = toError(thrown)
    const duration = Date.now() - start
    log("error", "mcp.tool.failed", { tool: toolName, duration, error: err.message })
    return mcpResponse(jsonRpc(id, errorContent(err.message)))
  }
}

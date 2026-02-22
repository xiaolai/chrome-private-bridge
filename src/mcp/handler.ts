import { getCommand, getAllTools } from "../registry/index"
import { getKeyPermissions } from "../auth"
import { config } from "../config"
import { log } from "../logger"
import { sendToExtension, isConnected } from "../ws/manager"
import { getPluginCommand, createPluginExecutionContext } from "../plugins/loader"

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

export async function handleMcp(req: Request, token: string): Promise<Response> {
  let body: JsonRpcRequest
  try {
    body = await req.json()
  } catch {
    return mcpResponse(jsonRpcError(null, -32700, "Parse error"))
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return mcpResponse(jsonRpcError(body.id ?? null, -32600, "Invalid Request"))
  }

  const id = body.id ?? null

  switch (body.method) {
    case "initialize":
      return mcpResponse(jsonRpc(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      }))

    case "notifications/initialized":
      return new Response(null, { status: 204 })

    case "tools/list": {
      const allowed = getKeyPermissions(token)
      const tools = getAllTools(allowed)
      return mcpResponse(jsonRpc(id, { tools }))
    }

    case "tools/call": {
      const params = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined
      if (!params?.name) {
        return mcpResponse(jsonRpcError(id, -32602, "Missing tool name"))
      }

      const toolName = params.name
      const args = params.arguments ?? {}

      // Check per-key permissions
      const allowed = getKeyPermissions(token)
      if (allowed && !allowed.includes(toolName)) {
        return mcpResponse(jsonRpc(id, {
          content: [{ type: "text", text: `Tool "${toolName}" not allowed for this key` }],
          isError: true,
        }))
      }

      const def = getCommand(toolName)
      if (!def) {
        return mcpResponse(jsonRpcError(id, -32602, `Unknown tool: ${toolName}`))
      }

      // Gate evaluate command
      if (def.extensionCommand === "evaluate" && !config.enableEvaluate) {
        return mcpResponse(jsonRpc(id, {
          content: [{ type: "text", text: "evaluate command is disabled. Set ENABLE_EVALUATE=true to enable" }],
          isError: true,
        }))
      }

      // Validate params with Zod
      const parsed = def.params.safeParse(args)
      if (!parsed.success) {
        const errors = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
        return mcpResponse(jsonRpc(id, {
          content: [{ type: "text", text: `Validation error: ${errors}` }],
          isError: true,
        }))
      }

      const start = Date.now()

      try {
        // Check if this is a plugin command (extensionCommand contains a dot like "x.post")
        const pluginHandler = getPluginCommand(def.extensionCommand)
        let result: unknown

        if (pluginHandler) {
          const ctx = createPluginExecutionContext()
          result = await pluginHandler.execute(parsed.data, ctx)
        } else {
          // Dispatch to extension
          if (!isConnected()) {
            return mcpResponse(jsonRpc(id, {
              content: [{ type: "text", text: "Extension not connected" }],
              isError: true,
            }))
          }
          result = await sendToExtension(def.extensionCommand, parsed.data as Record<string, unknown>)
        }

        const duration = Date.now() - start
        log("info", "mcp.tool.executed", { tool: toolName, duration, ok: true })

        // Screenshot returns image content
        if (def.extensionCommand === "screenshot" && result && typeof result === "object" && "dataUrl" in (result as any)) {
          const dataUrl = (result as { dataUrl: string }).dataUrl
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, "")
          return mcpResponse(jsonRpc(id, {
            content: [{ type: "image", data: base64, mimeType: "image/png" }],
          }))
        }

        return mcpResponse(jsonRpc(id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
        }))
      } catch (err: any) {
        const duration = Date.now() - start
        log("error", "mcp.tool.failed", { tool: toolName, duration, error: err.message })
        return mcpResponse(jsonRpc(id, {
          content: [{ type: "text", text: err.message }],
          isError: true,
        }))
      }
    }

    default:
      return mcpResponse(jsonRpcError(id, -32601, `Method not found: ${body.method}`))
  }
}

function mcpResponse(data: JsonRpcResponse): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  })
}

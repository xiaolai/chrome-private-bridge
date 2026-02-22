import type { ServerWebSocket } from "bun"
import { validateExtensionToken } from "../auth"
import { log } from "../logger"
import type { WsMessage } from "../types"
import { PendingMap } from "./pending"

export interface WsData {
  authenticated: boolean
}

const pending = new PendingMap()
let extensionSocket: ServerWebSocket<WsData> | null = null

export function isConnected(): boolean {
  return extensionSocket !== null && extensionSocket.readyState === WebSocket.OPEN
}

export function getExtensionSocket(): ServerWebSocket<WsData> | null {
  return extensionSocket
}

export function shutdownPending(): void {
  pending.clear()
}

export async function sendToExtension(command: string, params?: Record<string, unknown>): Promise<unknown> {
  if (!isConnected()) {
    throw new Error("Extension not connected")
  }
  const id = pending.nextId()
  const msg = { id, type: "command" as const, command, params }
  const promise = pending.add(id)
  extensionSocket!.send(JSON.stringify(msg))
  return promise
}

export function handleOpen(ws: ServerWebSocket<WsData>): void {
  ws.data.authenticated = false
  log("info", "ws.connection_opened")
}

export function handleMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer): void {
  let msg: WsMessage
  try {
    msg = JSON.parse(typeof raw === "string" ? raw : raw.toString())
  } catch {
    ws.send(JSON.stringify({ error: "Invalid JSON" }))
    return
  }

  if (!ws.data.authenticated) {
    if (msg.type === "auth" && "token" in msg && typeof msg.token === "string") {
      if (validateExtensionToken(msg.token)) {
        ws.data.authenticated = true
        extensionSocket = ws
        ws.send(JSON.stringify({ type: "auth", ok: true }))
        log("info", "ws.authenticated")
      } else {
        ws.send(JSON.stringify({ type: "auth", ok: false, error: "Invalid token" }))
        ws.close(4001, "Invalid token")
        log("warn", "ws.auth_failed")
      }
    } else {
      ws.send(JSON.stringify({ error: "Must authenticate first" }))
    }
    return
  }

  if (msg.type === "response" && "id" in msg) {
    if ("error" in msg && msg.error) {
      pending.reject(msg.id, new Error(msg.error))
    } else {
      pending.resolve(msg.id, "result" in msg ? msg.result : undefined)
    }
    return
  }

  if (msg.type === "event") {
    log("debug", "ws.event", { command: msg.command })
  }
}

export function handleClose(ws: ServerWebSocket<WsData>): void {
  if (ws === extensionSocket) {
    extensionSocket = null
    pending.clear()
    log("info", "ws.disconnected")
  }
}

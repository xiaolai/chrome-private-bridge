import type { ServerWebSocket } from "bun"
import { log } from "../logger"
import type { WsMessage } from "../types"
import { PendingMap } from "./pending"

const pending = new PendingMap()
let extensionSocket: ServerWebSocket | null = null

export function isConnected(): boolean {
  return extensionSocket !== null && extensionSocket.readyState === WebSocket.OPEN
}

export function getExtensionSocket(): ServerWebSocket | null {
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

export function handleOpen(ws: ServerWebSocket): void {
  extensionSocket = ws
  log("info", "ws.connected")
}

export function handleMessage(ws: ServerWebSocket, raw: string | Buffer): void {
  let msg: WsMessage
  try {
    msg = JSON.parse(typeof raw === "string" ? raw : raw.toString())
  } catch {
    ws.send(JSON.stringify({ error: "Invalid JSON" }))
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

export function handleClose(ws: ServerWebSocket): void {
  if (ws === extensionSocket) {
    extensionSocket = null
    pending.clear()
    log("info", "ws.disconnected")
  }
}

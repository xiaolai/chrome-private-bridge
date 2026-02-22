import type { ServerWebSocket } from "bun"
import { validateExtensionToken } from "../auth"
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

export async function sendToExtension(command: string, params?: Record<string, unknown>): Promise<unknown> {
  if (!isConnected()) {
    throw new Error("Extension not connected")
  }
  const id = pending.nextId()
  const msg: WsMessage = { id, type: "command", command, params }
  const promise = pending.add(id)
  extensionSocket!.send(JSON.stringify(msg))
  return promise
}

export function handleOpen(ws: ServerWebSocket<WsData>): void {
  ws.data.authenticated = false
  log("WebSocket connection opened, awaiting auth")
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
    if (msg.type === "auth" && typeof (msg as any).token === "string") {
      if (validateExtensionToken((msg as any).token)) {
        ws.data.authenticated = true
        extensionSocket = ws
        ws.send(JSON.stringify({ type: "auth", ok: true }))
        log("Extension authenticated")
      } else {
        ws.send(JSON.stringify({ type: "auth", ok: false, error: "Invalid token" }))
        ws.close(4001, "Invalid token")
      }
    } else {
      ws.send(JSON.stringify({ error: "Must authenticate first" }))
    }
    return
  }

  if (msg.type === "response" && msg.id) {
    if (msg.error) {
      pending.reject(msg.id, new Error(msg.error))
    } else {
      pending.resolve(msg.id, msg.result)
    }
    return
  }

  if (msg.type === "event") {
    log(`Event from extension: ${msg.command}`)
  }
}

export function handleClose(ws: ServerWebSocket<WsData>): void {
  if (ws === extensionSocket) {
    extensionSocket = null
    pending.clear()
    log("Extension disconnected")
  }
}

function log(msg: string): void {
  console.log(`[ws] ${new Date().toISOString()} ${msg}`)
}

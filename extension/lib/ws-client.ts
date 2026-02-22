type MessageHandler = (msg: any) => void
type StatusHandler = (status: "connected" | "disconnected" | "connecting") => void

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let messageHandler: MessageHandler | null = null
let statusHandler: StatusHandler | null = null
let relayUrl = ""
let token = ""
let reconnectDelay = 1000

export function configure(url: string, authToken: string): void {
  relayUrl = url.replace(/^http/, "ws").replace(/\/$/, "") + "/ws"
  token = authToken
}

export function onMessage(handler: MessageHandler): void {
  messageHandler = handler
}

export function onStatus(handler: StatusHandler): void {
  statusHandler = handler
}

export function connect(): void {
  if (ws && ws.readyState === WebSocket.OPEN) return
  if (!relayUrl || !token) return

  statusHandler?.("connecting")

  ws = new WebSocket(relayUrl)

  ws.onopen = () => {
    reconnectDelay = 1000
    ws!.send(JSON.stringify({ type: "auth", token }))
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === "auth") {
        if (msg.ok) {
          statusHandler?.("connected")
        } else {
          console.error("[ws] Auth failed:", msg.error)
          ws?.close()
        }
        return
      }
      messageHandler?.(msg)
    } catch (e) {
      console.error("[ws] Parse error:", e)
    }
  }

  ws.onclose = () => {
    statusHandler?.("disconnected")
    scheduleReconnect()
  }

  ws.onerror = () => {
    ws?.close()
  }
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  ws?.close()
  ws = null
}

// WI-5.2: Return success/failure and log on failure
export function send(data: unknown): boolean {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
    return true
  }
  console.warn("[ws] Cannot send: socket not open")
  return false
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    // WI-5.1: Add jitter to prevent thundering herd
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000) * (1 + Math.random() * 0.3)
    connect()
  }, reconnectDelay)
}

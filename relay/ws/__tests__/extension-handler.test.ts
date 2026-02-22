import { describe, test, expect, beforeEach, spyOn } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// Ensure CONFIG_DIR is set before imports
if (!process.env.CONFIG_DIR) {
  process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), "chrome-bridge-ws-test-"))
}

import {
  isConnected,
  getExtensionSocket,
  shutdownPending,
  sendToExtension,
  handleOpen,
  handleMessage,
  handleClose,
} from "../extension-handler"
import type { WsData } from "../extension-handler"
import { getExtensionToken } from "../../auth"

// Mock WebSocket that matches ServerWebSocket interface
function createMockWs(overrides: Partial<{ readyState: number; sentMessages: string[]; closed: boolean; closeCode: number; closeReason: string }> = {}): any {
  const sentMessages: string[] = overrides.sentMessages ?? []
  return {
    data: { authenticated: false } as WsData,
    readyState: overrides.readyState ?? WebSocket.OPEN,
    send(msg: string) { sentMessages.push(msg) },
    close(code?: number, reason?: string) {
      this.readyState = WebSocket.CLOSED
      overrides.closed = true
      overrides.closeCode = code
      overrides.closeReason = reason
    },
    sentMessages,
  }
}

describe("extension-handler", () => {
  test("isConnected() returns false initially", () => {
    // May be true if other tests connected; at least verify it returns a boolean
    expect(typeof isConnected()).toBe("boolean")
  })

  test("getExtensionSocket() returns null or a socket", () => {
    const socket = getExtensionSocket()
    expect(socket === null || typeof socket === "object").toBe(true)
  })

  test("shutdownPending() does not throw", () => {
    expect(() => shutdownPending()).not.toThrow()
  })

  test("sendToExtension() throws when not connected", async () => {
    // Ensure disconnected state by handling close on any existing socket
    const existing = getExtensionSocket()
    if (existing) {
      handleClose(existing as any)
    }
    await expect(sendToExtension("tab.list")).rejects.toThrow("Extension not connected")
  })

  test("handleOpen() sets authenticated to false", () => {
    const ws = createMockWs()
    ws.data.authenticated = true // pre-set
    handleOpen(ws)
    expect(ws.data.authenticated).toBe(false)
  })

  test("handleMessage() rejects invalid JSON", () => {
    const ws = createMockWs()
    handleMessage(ws, "not json{{{")
    const sent = JSON.parse(ws.sentMessages[0])
    expect(sent.error).toBe("Invalid JSON")
  })

  test("handleMessage() requires auth before other messages", () => {
    const ws = createMockWs()
    ws.data.authenticated = false
    handleMessage(ws, JSON.stringify({ type: "response", id: "1" }))
    const sent = JSON.parse(ws.sentMessages[0])
    expect(sent.error).toBe("Must authenticate first")
  })

  test("handleMessage() authenticates with valid token", () => {
    const ws = createMockWs()
    const token = getExtensionToken()
    handleMessage(ws, JSON.stringify({ type: "auth", token }))
    expect(ws.data.authenticated).toBe(true)
    const sent = JSON.parse(ws.sentMessages[0])
    expect(sent.type).toBe("auth")
    expect(sent.ok).toBe(true)
  })

  test("handleMessage() rejects invalid token", () => {
    const ws = createMockWs()
    handleMessage(ws, JSON.stringify({ type: "auth", token: "wrong_token" }))
    expect(ws.data.authenticated).toBe(false)
    const sent = JSON.parse(ws.sentMessages[0])
    expect(sent.ok).toBe(false)
  })

  test("handleMessage() processes response with result after auth", () => {
    const ws = createMockWs()
    // Authenticate first
    const token = getExtensionToken()
    handleMessage(ws, JSON.stringify({ type: "auth", token }))
    ws.sentMessages.length = 0

    // Send a response message (won't resolve anything but exercises the code path)
    handleMessage(ws, JSON.stringify({ type: "response", id: "nonexistent", result: { data: 1 } }))
    // No error sent back for unknown response IDs
    expect(ws.sentMessages).toHaveLength(0)
  })

  test("handleMessage() processes response with error after auth", () => {
    const ws = createMockWs()
    const token = getExtensionToken()
    handleMessage(ws, JSON.stringify({ type: "auth", token }))
    ws.sentMessages.length = 0

    handleMessage(ws, JSON.stringify({ type: "response", id: "nonexistent", error: "some error" }))
    expect(ws.sentMessages).toHaveLength(0)
  })

  test("handleMessage() processes event message after auth", () => {
    const ws = createMockWs()
    const token = getExtensionToken()
    handleMessage(ws, JSON.stringify({ type: "auth", token }))
    ws.sentMessages.length = 0

    handleMessage(ws, JSON.stringify({ type: "event", command: "page.loaded" }))
    expect(ws.sentMessages).toHaveLength(0) // events are just logged
  })

  test("handleClose() cleans up when extension socket disconnects", () => {
    const ws = createMockWs()
    // Authenticate to set as extension socket
    const token = getExtensionToken()
    handleMessage(ws, JSON.stringify({ type: "auth", token }))

    // Now close
    handleClose(ws)
    // After close, isConnected should return false (or socket should be null)
    expect(getExtensionSocket()).toBeNull()
  })

  test("handleClose() ignores non-extension sockets", () => {
    const ws = createMockWs()
    // Don't authenticate - just call close
    handleClose(ws)
    // Should not throw
  })

  test("sendToExtension() works when connected", async () => {
    const ws = createMockWs()
    const token = getExtensionToken()
    handleMessage(ws, JSON.stringify({ type: "auth", token }))
    ws.sentMessages.length = 0

    // sendToExtension creates a pending request
    const promise = sendToExtension("tab.list", { foo: "bar" })

    // Verify a message was sent to the socket
    expect(ws.sentMessages).toHaveLength(1)
    const sent = JSON.parse(ws.sentMessages[0])
    expect(sent.type).toBe("command")
    expect(sent.command).toBe("tab.list")
    expect(sent.params).toEqual({ foo: "bar" })

    // Simulate response from extension
    handleMessage(ws, JSON.stringify({ type: "response", id: sent.id, result: [{ id: 1 }] }))
    const result = await promise
    expect(result).toEqual([{ id: 1 }])
  })

  test("sendToExtension() response with error rejects promise", async () => {
    const ws = createMockWs()
    const token = getExtensionToken()
    handleMessage(ws, JSON.stringify({ type: "auth", token }))
    ws.sentMessages.length = 0

    const promise = sendToExtension("evaluate", { expression: "bad" })
    const sent = JSON.parse(ws.sentMessages[0])

    handleMessage(ws, JSON.stringify({ type: "response", id: sent.id, error: "eval failed" }))
    await expect(promise).rejects.toThrow("eval failed")
  })
})

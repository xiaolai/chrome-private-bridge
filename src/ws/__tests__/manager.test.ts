import { describe, test, expect } from "bun:test"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

if (!process.env.CONFIG_DIR) {
  process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), "chrome-bridge-ws-mgr-test-"))
}

import {
  isConnected,
  getExtensionSocket,
  shutdownPending,
  sendToExtension,
  handleOpen,
  handleMessage,
  handleClose,
} from "../manager"

function createMockWs(overrides: Partial<{ readyState: number; sentMessages: string[] }> = {}): any {
  const sentMessages: string[] = overrides.sentMessages ?? []
  return {
    readyState: overrides.readyState ?? WebSocket.OPEN,
    send(msg: string) { sentMessages.push(msg) },
    close() { this.readyState = WebSocket.CLOSED },
    sentMessages,
  }
}

describe("ws/manager", () => {
  test("isConnected() returns false initially", () => {
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
    const existing = getExtensionSocket()
    if (existing) handleClose(existing as any)
    await expect(sendToExtension("tab.list")).rejects.toThrow("Extension not connected")
  })

  test("handleOpen() sets socket as connected", () => {
    const ws = createMockWs()
    handleOpen(ws)
    expect(isConnected()).toBe(true)
    handleClose(ws)
  })

  test("handleMessage() rejects invalid JSON", () => {
    const ws = createMockWs()
    handleOpen(ws)
    handleMessage(ws, "not json{{{")
    const sent = JSON.parse(ws.sentMessages[0])
    expect(sent.error).toBe("Invalid JSON")
    handleClose(ws)
  })

  test("handleMessage() processes response with result", () => {
    const ws = createMockWs()
    handleOpen(ws)
    handleMessage(ws, JSON.stringify({ type: "response", id: "nonexistent", result: { data: 1 } }))
    expect(ws.sentMessages).toHaveLength(0)
    handleClose(ws)
  })

  test("handleMessage() processes response with error", () => {
    const ws = createMockWs()
    handleOpen(ws)
    handleMessage(ws, JSON.stringify({ type: "response", id: "nonexistent", error: "some error" }))
    expect(ws.sentMessages).toHaveLength(0)
    handleClose(ws)
  })

  test("handleMessage() processes event message", () => {
    const ws = createMockWs()
    handleOpen(ws)
    handleMessage(ws, JSON.stringify({ type: "event", command: "page.loaded" }))
    expect(ws.sentMessages).toHaveLength(0)
    handleClose(ws)
  })

  test("handleClose() cleans up when extension socket disconnects", () => {
    const ws = createMockWs()
    handleOpen(ws)
    handleClose(ws)
    expect(getExtensionSocket()).toBeNull()
  })

  test("handleClose() ignores non-extension sockets", () => {
    const ws = createMockWs()
    handleClose(ws)
  })

  test("sendToExtension() works when connected", async () => {
    const ws = createMockWs()
    handleOpen(ws)

    const promise = sendToExtension("tab.list", { foo: "bar" })

    expect(ws.sentMessages).toHaveLength(1)
    const sent = JSON.parse(ws.sentMessages[0])
    expect(sent.type).toBe("command")
    expect(sent.command).toBe("tab.list")
    expect(sent.params).toEqual({ foo: "bar" })

    handleMessage(ws, JSON.stringify({ type: "response", id: sent.id, result: [{ id: 1 }] }))
    const result = await promise
    expect(result).toEqual([{ id: 1 }])

    handleClose(ws)
  })

  test("sendToExtension() response with error rejects promise", async () => {
    const ws = createMockWs()
    handleOpen(ws)

    const promise = sendToExtension("evaluate", { expression: "bad" })
    const sent = JSON.parse(ws.sentMessages[0])

    handleMessage(ws, JSON.stringify({ type: "response", id: sent.id, error: "eval failed" }))
    await expect(promise).rejects.toThrow("eval failed")

    handleClose(ws)
  })

  test("handleMessage() with Buffer input", () => {
    const ws = createMockWs()
    handleOpen(ws)
    const buf = Buffer.from(JSON.stringify({ type: "event", command: "test" }))
    handleMessage(ws, buf)
    expect(ws.sentMessages).toHaveLength(0)
    handleClose(ws)
  })

  test("handleMessage() resolves response with undefined when no result field", async () => {
    const ws = createMockWs()
    handleOpen(ws)

    const promise = sendToExtension("tab.list")
    const sent = JSON.parse(ws.sentMessages[0])

    handleMessage(ws, JSON.stringify({ type: "response", id: sent.id }))
    const result = await promise
    expect(result).toBeUndefined()

    handleClose(ws)
  })

  test("handleOpen() replaces existing connection and clears pending", () => {
    const ws1 = createMockWs()
    handleOpen(ws1)
    expect(isConnected()).toBe(true)

    const ws2 = createMockWs()
    handleOpen(ws2)
    expect(isConnected()).toBe(true)
    expect(getExtensionSocket()).toBe(ws2)
    // ws1 should have been closed
    expect(ws1.readyState).toBe(WebSocket.CLOSED)

    handleClose(ws2)
  })

  test("sendToExtension() rejects when send throws", async () => {
    const ws = createMockWs()
    ws.send = () => { throw new Error("send failed") }
    handleOpen(ws)

    await expect(sendToExtension("tab.list")).rejects.toThrow("send failed")

    handleClose(ws)
  })
})

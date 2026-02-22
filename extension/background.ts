import { configure, connect, disconnect, isConnected, onMessage, onStatus, send } from "./lib/ws-client"
import { navigate } from "./lib/commands/navigate"
import { tabList, tabCreate, tabClose } from "./lib/commands/tabs"
import { click, type as typeCmd, press, scroll } from "./lib/commands/interact"
import { query, queryText, wait } from "./lib/commands/query"
import { screenshot } from "./lib/commands/screenshot"
import { evaluate } from "./lib/commands/evaluate"
import { cookieGet, cookieSet } from "./lib/commands/cookies"
import { fileSet } from "./lib/commands/file-input"
import { clipboardWrite, clipboardPaste } from "./lib/commands/clipboard"

type CommandFn = (params: any) => Promise<unknown>

const commands: Record<string, CommandFn> = {
  navigate,
  "tab.list": tabList,
  "tab.create": tabCreate,
  "tab.close": tabClose,
  click,
  type: typeCmd,
  press,
  scroll,
  query,
  "query.text": queryText,
  wait,
  screenshot,
  evaluate,
  "cookie.get": cookieGet,
  "cookie.set": cookieSet,
  "file.set": fileSet,
  "clipboard.write": clipboardWrite,
  "clipboard.paste": clipboardPaste,
}

onMessage(async (msg) => {
  if (msg.type !== "command" || !msg.id || !msg.command) return

  const handler = commands[msg.command]
  if (!handler) {
    const sent = send({ id: msg.id, type: "response", error: `Unknown command: ${msg.command}` })
    if (!sent) console.warn("[bg] Failed to send unknown command response")
    return
  }

  try {
    const result = await handler(msg.params ?? {})
    const sent = send({ id: msg.id, type: "response", result })
    if (!sent) console.warn("[bg] Failed to send command response")
  } catch (err: any) {
    const sent = send({ id: msg.id, type: "response", error: err.message })
    if (!sent) console.warn("[bg] Failed to send error response")
  }
})

onStatus((status) => {
  chrome.action.setBadgeText({ text: status === "connected" ? "ON" : "" })
  chrome.action.setBadgeBackgroundColor({ color: status === "connected" ? "#22c55e" : "#ef4444" })
})

chrome.storage.local.get(["relayUrl", "token"], (data) => {
  if (data.relayUrl && data.token) {
    configure(data.relayUrl, data.token)
    connect()
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "connect") {
    chrome.storage.local.set({ relayUrl: msg.relayUrl, token: msg.token }, () => {
      configure(msg.relayUrl, msg.token)
      connect()
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.action === "disconnect") {
    disconnect()
    sendResponse({ ok: true })
    return true
  }
  // WI-3.4: Return actual connection status instead of hardcoded false
  if (msg.action === "getStatus") {
    sendResponse({ connected: isConnected() })
    return true
  }
})

import { configure, connect, disconnect, isConnected, onMessage, onStatus, send } from "./lib/ws-client"
import { navigate } from "./lib/commands/navigate"
import { tabList, tabCreate, tabClose } from "./lib/commands/tabs"
import { click, type as typeCmd, press, scroll } from "./lib/commands/interact"
import { query, queryText, wait } from "./lib/commands/query"
import { screenshot } from "./lib/commands/screenshot"
import { evaluate } from "./lib/commands/evaluate"
import { cookieGet, cookieSet } from "./lib/commands/cookies"
import { fileSet } from "./lib/commands/file-input"
import { clipboardWrite } from "./lib/commands/clipboard"

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

const iconOff = { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" }
const iconOn = { 16: "icons/icon16-on.png", 48: "icons/icon48-on.png", 128: "icons/icon128-on.png" }

onStatus((status) => {
  chrome.storage.local.set({ connectionStatus: status })
  chrome.action.setIcon({ path: status === "connected" ? iconOn : iconOff })
})

// Auto-connect on startup
const DEFAULT_URL = "http://localhost:7890"

chrome.storage.local.get(["relayUrl"], (data) => {
  const url = data.relayUrl || DEFAULT_URL
  chrome.storage.local.set({ relayUrl: url })
  configure(url)
  connect()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "connect") {
    chrome.storage.local.set({ relayUrl: msg.relayUrl }, () => {
      configure(msg.relayUrl)
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
  if (msg.action === "getStatus") {
    sendResponse({ connected: isConnected() })
    return true
  }
})

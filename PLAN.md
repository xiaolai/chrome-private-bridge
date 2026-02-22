# Chrome Extension Bridge — Implementation Plan

## Context

baoyu-skills automates Chrome via raw CDP over WebSocket, duplicated across 3 skills (~500 lines repeated). The approach is single-machine, macOS-dependent (osascript, Swift clipboard). The goal: build a Chrome Extension bridge so LLMs on **any machine in the LAN** can control Chrome remotely, with auth. New standalone repo, Bun runtime, extensible plugin system.

## Architecture

```
Remote LLM (any machine)                    Machine running Chrome
─────────────────────────                    ────────────────────────

  LLM Agent / Claude Code                   Chrome Browser
       │                                    ┌─────────────────────┐
       │ HTTP POST                          │  Extension (MV3)    │
       │ Authorization: Bearer bby_xxx      │  - Service Worker   │
       ▼                                    │  - Content Scripts  │
  ┌──────────────────┐    WebSocket         │  - chrome.scripting │
  │  Relay Server    │◄────────────────────►│  - chrome.debugger  │
  │  (Bun, 0.0.0.0) │    localhost only     └─────────────────────┘
  │  Port 7890       │                              │
  │  - Auth layer    │                     (optional) Native Messaging
  │  - Plugin system │                              │
  └──────────────────┘                      ┌───────▼─────────────┐
                                            │  Native Host (Bun)  │
                                            │  - osascript paste   │
                                            │  - Swift clipboard   │
                                            └─────────────────────┘
```

**LLM → Relay**: HTTP REST (request/response maps naturally to LLM tool calls)
**Relay → Extension**: WebSocket (persistent, localhost-only, bidirectional)
**Extension → Native Host**: Chrome Native Messaging (stdio pipe, for OS-level operations)

## Repo Structure

```
chrome-bridge/
├── relay/
│   ├── server.ts                # Bun.serve() — HTTP + WS
│   ├── auth.ts                  # API key validation
│   ├── store.ts                 # Key file I/O (~/.config/chrome-bridge/keys.json)
│   ├── types.ts                 # Shared types
│   ├── routes/
│   │   ├── commands.ts          # POST /api/v1/command
│   │   ├── status.ts           # GET /api/v1/status
│   │   └── keys.ts             # Key management (keygen, list, revoke)
│   ├── ws/
│   │   ├── extension-handler.ts # Extension WS connection manager
│   │   └── pending.ts          # Correlation map (id → {resolve, reject, timer})
│   └── plugins/
│       ├── registry.ts          # Plugin loader
│       ├── base.ts              # Plugin interface
│       ├── x-post.ts            # Example: X/Twitter posting
│       └── wechat-post.ts       # Example: WeChat posting
├── extension/
│   ├── manifest.json            # Manifest V3
│   ├── background.ts            # Service worker: WS to relay, command dispatch
│   ├── content.ts               # Content script: DOM ops, injected on demand
│   ├── popup.html               # Settings UI (relay URL, status, local token)
│   ├── popup.ts
│   └── lib/
│       ├── ws-client.ts         # Reconnecting WebSocket
│       └── commands/
│           ├── navigate.ts
│           ├── interact.ts      # click, type, press, scroll
│           ├── query.ts         # DOM queries
│           ├── screenshot.ts    # chrome.tabs.captureVisibleTab
│           ├── tabs.ts
│           ├── cookies.ts
│           ├── evaluate.ts      # chrome.scripting.executeScript
│           └── file-input.ts    # chrome.debugger + DOM.setFileInputFiles
├── native-host/
│   ├── manifest.json            # Native messaging host manifest
│   ├── host.ts                  # Bun script: osascript, clipboard
│   └── install.sh               # Register native host with Chrome
├── client/
│   └── index.ts                 # TypeScript client library for LLM scripts
└── README.md
```

## API Surface

### HTTP Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/command` | Bearer key | Execute a browser command |
| GET | `/api/v1/status` | Bearer key | Extension connected? Tabs list? |
| POST | `/api/v1/keys` | Local only | Generate/list/revoke API keys |

### Command Envelope

Request:
```json
{ "command": "click", "params": { "selector": "[data-testid='tweetButton']", "tabId": 123 } }
```

Response:
```json
{ "id": "cmd_abc123", "ok": true, "result": { "success": true }, "duration": 142 }
```

### Core Commands (Built-in)

| Command | Key Params | Implementation |
|---------|-----------|----------------|
| `navigate` | `url, tabId?` | `chrome.tabs.update` |
| `tab.list` | — | `chrome.tabs.query` |
| `tab.create` | `url?` | `chrome.tabs.create` |
| `tab.close` | `tabId` | `chrome.tabs.remove` |
| `click` | `selector, tabId?` | content script: querySelector + click |
| `type` | `selector, text, tabId?` | content script: focus + execCommand('insertText') |
| `press` | `key, modifiers?, tabId?` | content script: KeyboardEvent dispatch |
| `scroll` | `x?, y?, selector?` | content script: scrollTo/scrollIntoView |
| `query` | `selector, attrs?, tabId?` | content script: querySelectorAll |
| `query.text` | `selector` | content script: textContent |
| `wait` | `selector, timeout?` | content script: MutationObserver polling |
| `screenshot` | `tabId?, selector?` | `chrome.tabs.captureVisibleTab` |
| `evaluate` | `expression, tabId?` | `chrome.scripting.executeScript` |
| `cookie.get` | `url, name?` | `chrome.cookies.getAll` |
| `cookie.set` | `cookie` | `chrome.cookies.set` |
| `file.set` | `selector, paths[]` | `chrome.debugger` + `DOM.setFileInputFiles` |
| `clipboard.write` | `text? / html? / imageBase64?` | `navigator.clipboard.write` (extension) |
| `clipboard.paste` | — | native host → osascript Cmd+V |
| `native.exec` | `command, args[]` | native host (whitelisted commands only) |

`tabId` defaults to active tab when omitted.

## Auth Model

**API keys**: `bby_` prefix + 32 random hex chars.
**Storage**: `~/.config/chrome-bridge/keys.json` (plaintext, for LAN simplicity).
**Validation**: Bearer token in Authorization header.
**Per-key metadata**: name, created, lastUsed, optional IP allowlist.
**Key management**: CLI commands via the relay (`npx -y bun relay/server.ts keygen --name "my-agent"`).

**Extension-to-relay auth**: Local token generated at relay startup, entered in extension popup. Localhost-only WebSocket.

## What the Extension Handles vs. What Needs Native Host

| Capability | Extension alone? | Notes |
|-----------|:---:|-------|
| Navigate, click, type, scroll | Yes | content script |
| DOM queries, text extraction | Yes | content script |
| Screenshot | Yes | `chrome.tabs.captureVisibleTab` |
| Cookie read/write | Yes | `chrome.cookies` API |
| JS evaluation | Yes | `chrome.scripting.executeScript` |
| Tab management | Yes | `chrome.tabs` API |
| File input upload | Yes | `chrome.debugger` + `DOM.setFileInputFiles` |
| Clipboard write (text, PNG) | Yes | `navigator.clipboard.write` |
| Clipboard write (JPEG/GIF) | **No** → Native Host | Swift NSPasteboard |
| OS-level paste (Cmd+V) | **No** → Native Host | osascript / xdotool |
| Window activation/focus | **No** → Native Host | osascript |

**Key insight**: For sites without aggressive anti-bot detection (WeChat, Gemini, most sites), the extension alone is sufficient. The native host is only needed for X/Twitter's image paste detection.

## Plugin Interface

```typescript
interface BridgePlugin {
  name: string
  version: string
  commands: Record<string, CommandHandler>
  init?(ctx: PluginContext): Promise<void>
}

interface CommandHandler {
  description: string
  execute(params: unknown, ctx: ExecutionContext): Promise<unknown>
}

interface ExecutionContext {
  send(command: string, params: unknown): Promise<unknown>  // send to extension
  log(msg: string): void
}
```

Commands namespaced as `pluginName.commandName`. Built-in commands have no namespace.

## Security

- API key required for all HTTP requests
- Extension WS only accepts localhost connections
- `native.exec` restricted to whitelisted executables (osascript, pbcopy)
- `evaluate` command enabled by default, can be disabled via config
- All commands logged with timestamp + key name
- No TLS by default (LAN), optional `--tls-cert`/`--tls-key` flags
- Rate limiting: 60 requests/minute per key

## Implementation Phases

### Phase 1: Core Bridge (MVP)
1. Relay server: `Bun.serve` with HTTP routes + WS endpoint
2. Auth: keygen CLI, Bearer token validation
3. Pending request correlation map (same `Map<id, {resolve, reject, timer}>` pattern as existing `CdpConnection`)
4. Extension service worker: reconnecting WS to relay
5. Core commands: navigate, click, type, query, wait, screenshot, evaluate, tabs
6. Extension popup: relay URL config, connection status
7. Client library (`client/index.ts`) with typed methods

### Phase 2: Anti-Bot Support
8. Native messaging host manifest + install script
9. Native host: osascript paste, Swift clipboard write
10. Extension `chrome.debugger` integration for `file.set`
11. `clipboard.write` and `clipboard.paste` commands

### Phase 3: Plugins + Migration
12. Plugin registry and dynamic loading
13. Port X/Twitter posting as plugin
14. Port WeChat posting as plugin

## Verification

1. **Relay starts**: `npx -y bun relay/server.ts` → listening on 0.0.0.0:7890
2. **Keygen**: `npx -y bun relay/server.ts keygen --name test` → prints API key
3. **Extension loads**: Load unpacked in `chrome://extensions/` → popup shows "Disconnected"
4. **Extension connects**: Enter relay URL in popup → status shows "Connected"
5. **Remote command**: From another machine, `curl -X POST http://<ip>:7890/api/v1/command -H "Authorization: Bearer bby_xxx" -d '{"command":"tab.list"}'` → returns tab list
6. **DOM interaction**: Send `navigate` + `wait` + `click` sequence targeting a test page
7. **Screenshot**: Send `screenshot` command → returns base64 PNG
8. **Native paste** (Phase 2): Send `clipboard.write` + `clipboard.paste` → image appears in target editor

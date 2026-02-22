# chrome-private-bridge: MCP-First Rewrite Plan

## Vision

Rewrite chrome-private-bridge as an **MCP-native browser automation server**. The MCP protocol becomes the primary interface — any MCP client (Claude Desktop, Claude Code, CASA in mecha, Cursor, etc.) can control a real Chrome browser through a Chrome Extension, completely undetectable by bot-detection.

The existing REST API (`/api/v1/command`) remains as a secondary interface for non-MCP clients.

## Why Rewrite vs. Bolt-On

The current codebase works but was designed REST-first with MCP as an afterthought. A rewrite lets us:

1. **MCP as the primary protocol** — tool definitions drive the command registry, not the other way around
2. **Streamable HTTP transport** — MCP's native transport, replaces the custom REST+WS plumbing
3. **Simplify the relay** — MCP already defines request/response correlation, tool schemas, and error codes
4. **Better tool descriptions** — Claude performs dramatically better with well-described tools; MCP tool definitions are the single source of truth
5. **Session support** — MCP sessions map naturally to browser tab contexts
6. **Clean dependency tree** — drop Fastify-style routing, use MCP SDK directly

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Any MCP Client                                             │
│  (Claude Desktop / Claude Code / CASA / Cursor / custom)    │
└──────────────────────────┬──────────────────────────────────┘
                           │ MCP over Streamable HTTP
                           │ POST http://host:7890/mcp
                           │ Authorization: Bearer bby_xxx
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  chrome-private-bridge (Bun)                                │
│                                                             │
│  ┌─────────────────┐  ┌──────────────────┐                  │
│  │  MCP Server      │  │  Legacy REST API │  (optional)     │
│  │  /mcp            │  │  /api/v1/command │                  │
│  └────────┬─────────┘  └────────┬─────────┘                  │
│           │                     │                            │
│           ▼                     ▼                            │
│  ┌──────────────────────────────────────────┐                │
│  │  Command Registry                        │                │
│  │  (single source of truth for all tools)  │                │
│  └────────────────────┬─────────────────────┘                │
│                       │                                      │
│  ┌────────────────────▼─────────────────────┐                │
│  │  WebSocket Manager                       │                │
│  │  (relay ↔ Chrome Extension)              │                │
│  └────────────────────┬─────────────────────┘                │
│                       │                                      │
│  ┌────────────────────▼─────────────────────┐                │
│  │  Plugin System                           │                │
│  │  (x.post, wechat.post, custom plugins)   │                │
│  └──────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                           │ WebSocket (localhost)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3) — unchanged                 │
│  background.ts → lib/commands/* → chrome.scripting API      │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. MCP Transport: Streamable HTTP

Use the MCP SDK's Streamable HTTP transport. One endpoint: `POST /mcp`. The client sends JSON-RPC requests, the server responds. For long-running operations (screenshot of large page, evaluate with delays), the response can stream via SSE.

No stdio mode needed — the bridge must run on the machine with Chrome, so HTTP is the natural transport. Stdio would complicate the Chrome Extension WebSocket connection.

### 2. Command Registry as Single Source of Truth

Today, commands are defined in three places: relay schemas, extension handlers, and client types. In the rewrite, one registry defines everything:

```typescript
// registry/navigate.ts
export const navigate = defineCommand({
  name: "browser_navigate",
  description: "Navigate the active browser tab to a URL. Waits for the page to finish loading before returning.",
  params: z.object({
    url: z.string().url().describe("The URL to navigate to"),
  }),
  returns: z.object({
    tabId: z.number(),
    url: z.string(),
    title: z.string(),
  }),
  // Maps to extension command
  extensionCommand: "navigate",
});
```

This definition generates:
- MCP tool schema (for `tools/list`)
- REST API validation (for `/api/v1/command`)
- TypeScript client types (for `ChromeBridge` class)
- Extension message format

### 3. Tool Naming Convention

MCP tools are flat-namespaced. Use `browser_` prefix for core commands, plugin names for plugin commands:

| Extension Command | MCP Tool Name | Why |
|---|---|---|
| `navigate` | `browser_navigate` | Core browser action |
| `click` | `browser_click` | Core browser action |
| `type` | `browser_type` | Core browser action |
| `press` | `browser_press` | Core browser action |
| `scroll` | `browser_scroll` | Core browser action |
| `query` | `browser_query` | Core browser action |
| `query.text` | `browser_query_text` | Core browser action |
| `wait` | `browser_wait_for_element` | Clearer than just "wait" |
| `screenshot` | `browser_screenshot` | Core browser action |
| `evaluate` | `browser_evaluate` | Core browser action (gated) |
| `tab.list` | `browser_tab_list` | Tab management |
| `tab.create` | `browser_tab_create` | Tab management |
| `tab.close` | `browser_tab_close` | Tab management |
| `cookie.get` | `browser_cookie_get` | Cookie access |
| `cookie.set` | `browser_cookie_set` | Cookie access |
| `file.set` | `browser_file_set` | File input |
| `clipboard.write` | `browser_clipboard_write` | Clipboard |
| `x.post` | `x_post` | Plugin command |
| `wechat.post` | `wechat_post` | Plugin command |

### 4. Tool Descriptions Matter

Claude's tool-use performance is heavily influenced by tool descriptions. Each tool gets a detailed, actionable description:

```typescript
// BAD: "Click an element"
// GOOD:
{
  name: "browser_click",
  description: `Click on a DOM element matching a CSS selector. The element is scrolled into view before clicking. Use browser_query first to verify the selector matches the intended element. For dynamic content that may not be loaded yet, use browser_wait_for_element before clicking.`,
  params: z.object({
    selector: z.string().describe(
      "CSS selector for the element to click. Examples: '#submit-btn', '.nav-item:first-child', '[data-testid=\"login\"]'"
    ),
    tabId: z.number().optional().describe(
      "Target tab ID. Omit to use the active tab. Get tab IDs from browser_tab_list."
    ),
  }),
}
```

### 5. Authentication

Reuse the existing bearer token system. MCP Streamable HTTP carries auth in the `Authorization` header naturally:

```
POST /mcp HTTP/1.1
Authorization: Bearer bby_a1b2c3d4...
Content-Type: application/json

{"jsonrpc":"2.0","method":"tools/call","params":{"name":"browser_click","arguments":{"selector":"#submit"}},"id":1}
```

Per-key command ACLs (`allowedCommands`) translate to MCP tool filtering — keys with restricted access only see their allowed tools in `tools/list`.

### 6. Extension: No Changes

The Chrome Extension stays exactly as-is. It speaks the same WebSocket protocol, receives the same command/params messages, returns the same responses. The rewrite only affects the relay server.

## Project Structure

```
chrome-private-bridge/
├── src/
│   ├── server.ts                  # Bun server: MCP + REST + WS endpoints
│   ├── config.ts                  # Env-based configuration
│   ├── auth.ts                    # API key generation, validation, store
│   ├── logger.ts                  # Structured logging
│   │
│   ├── registry/                  # Command registry (single source of truth)
│   │   ├── index.ts               # defineCommand(), getAllTools(), getCommand()
│   │   ├── navigate.ts            # browser_navigate
│   │   ├── click.ts               # browser_click
│   │   ├── type.ts                # browser_type
│   │   ├── press.ts               # browser_press
│   │   ├── scroll.ts              # browser_scroll
│   │   ├── query.ts               # browser_query, browser_query_text
│   │   ├── wait.ts                # browser_wait_for_element
│   │   ├── screenshot.ts          # browser_screenshot
│   │   ├── evaluate.ts            # browser_evaluate (gated)
│   │   ├── tabs.ts                # browser_tab_list, browser_tab_create, browser_tab_close
│   │   ├── cookies.ts             # browser_cookie_get, browser_cookie_set
│   │   ├── file.ts                # browser_file_set
│   │   └── clipboard.ts           # browser_clipboard_write
│   │
│   ├── mcp/                       # MCP protocol layer
│   │   ├── handler.ts             # MCP server setup, tool registration
│   │   └── transport.ts           # Streamable HTTP transport adapter
│   │
│   ├── rest/                      # Legacy REST API (thin wrapper)
│   │   ├── commands.ts            # POST /api/v1/command → registry lookup
│   │   ├── status.ts              # GET /api/v1/status
│   │   └── keys.ts                # POST/GET /api/v1/keys
│   │
│   ├── ws/                        # WebSocket to Chrome Extension
│   │   ├── manager.ts             # Connection lifecycle, sendToExtension()
│   │   └── pending.ts             # Request/response correlation map
│   │
│   └── plugins/                   # Plugin system
│       ├── loader.ts              # Plugin discovery and registration
│       ├── x-post.ts              # x_post plugin
│       └── wechat-post.ts         # wechat_post plugin
│
├── extension/                     # Chrome Extension (unchanged)
│   ├── manifest.json
│   ├── background.ts
│   ├── popup.html / popup.ts
│   ├── build.ts
│   └── lib/
│       ├── ws-client.ts
│       └── commands/
│           └── ... (all unchanged)
│
├── client/                        # TypeScript client library
│   └── index.ts                   # ChromeBridge class (auto-generated from registry)
│
├── __tests__/
│   ├── mcp/                       # MCP protocol tests
│   │   ├── tools-list.test.ts     # Tool discovery
│   │   ├── tools-call.test.ts     # Command execution
│   │   └── auth.test.ts           # Bearer token + ACL filtering
│   ├── rest/                      # Legacy API tests
│   ├── ws/                        # WebSocket tests
│   └── registry/                  # Command definition tests
│
├── package.json
├── tsconfig.json
└── README.md
```

## Implementation Phases

### Phase 1: Command Registry

Extract all command definitions into the `registry/` module. Each command is a single file with schema, description, and extension command mapping. This is the foundation everything else builds on.

**Deliverable**: `defineCommand()` utility, all 17 commands defined, `getAllTools()` returns MCP-compatible tool list.

### Phase 2: MCP Server

Wire up the MCP SDK with Streamable HTTP transport. Register all tools from the registry. Implement `tools/list` (with per-key ACL filtering) and `tools/call` (dispatch to extension via WebSocket).

**Deliverable**: `POST /mcp` endpoint works with any MCP client. Claude Desktop or Claude Code can control Chrome.

### Phase 3: REST API Migration

Rewrite the legacy REST routes as thin wrappers around the command registry. Same endpoints, same behavior, but now the registry is the source of truth.

**Deliverable**: `/api/v1/command` works exactly as before, shares code with MCP path.

### Phase 4: Plugin System

Migrate plugins to register commands via the same registry. Plugin commands appear in both MCP `tools/list` and REST API automatically.

**Deliverable**: `x_post` and `wechat_post` accessible via MCP.

### Phase 5: Client Library

Auto-generate the TypeScript client from the command registry. Each command becomes a typed method with JSDoc from the tool description.

**Deliverable**: `ChromeBridge` class with full type safety, zero manual type maintenance.

## MCP Protocol Details

### tools/list Response

```json
{
  "tools": [
    {
      "name": "browser_navigate",
      "description": "Navigate the active browser tab to a URL...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "format": "uri", "description": "The URL to navigate to" }
        },
        "required": ["url"]
      }
    },
    {
      "name": "browser_click",
      "description": "Click on a DOM element matching a CSS selector...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "selector": { "type": "string", "description": "CSS selector..." },
          "tabId": { "type": "number", "description": "Target tab ID..." }
        },
        "required": ["selector"]
      }
    }
  ]
}
```

### tools/call Request → Response

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "browser_click",
    "arguments": { "selector": "#submit" }
  },
  "id": 1
}

// Success Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      { "type": "text", "text": "{\"success\":true}" }
    ]
  },
  "id": 1
}

// Error Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      { "type": "text", "text": "Element not found: #submit" }
    ],
    "isError": true
  },
  "id": 1
}
```

### Screenshot: Image Content

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      { "type": "image", "data": "iVBORw0KGgo...", "mimeType": "image/png" }
    ]
  },
  "id": 1
}
```

MCP's native image content type means Claude receives screenshots as actual images, not base64 text blobs. This is a major improvement over the REST API.

## Configuration

Same env vars as today, plus:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7890` | HTTP/WS listening port |
| `HOST` | `0.0.0.0` | Bind address |
| `RATE_LIMIT` | `60` | Requests per window per API key |
| `RATE_WINDOW` | `60000` | Rate limit window in ms |
| `COMMAND_TIMEOUT` | `30000` | Max wait for extension response |
| `ENABLE_EVALUATE` | `false` | Enable arbitrary JS execution |
| `CONFIG_DIR` | `~/.config/chrome-bridge` | Key storage directory |
| `MCP_ENABLED` | `true` | Enable MCP endpoint (new) |
| `REST_ENABLED` | `true` | Enable legacy REST API (new) |

## Usage with CASA in Mecha

Once built, a CASA just needs this in its MCP configuration:

```json
{
  "mcpServers": {
    "chrome": {
      "type": "url",
      "url": "http://host.docker.internal:7890/mcp",
      "headers": {
        "Authorization": "Bearer bby_a1b2c3d4..."
      }
    }
  }
}
```

Claude inside the CASA immediately sees `browser_navigate`, `browser_click`, `browser_screenshot`, etc. as available tools. No special prompting, no HTTP fetch code, no schema definitions — it just works.

## Out of Scope

- **CDP fallback** — Extension-only by design (undetectable)
- **Multi-browser** — One Chrome instance per bridge (run multiple bridges for multiple browsers)
- **Recording/replay** — Possible future plugin but not in initial rewrite
- **Visual grounding** — Screenshot + query is sufficient; no computer-use-style coordinate clicking
- **Proxy/network interception** — Use Chrome's built-in DevTools for that

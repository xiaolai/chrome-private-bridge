# Chrome Bridge

Remote browser automation bridge for LLM agents. Control Chrome from any machine on your LAN via HTTP API.

## Architecture

```
LLM Agent (any machine)          Machine running Chrome
       │                         ┌─────────────────────┐
       │ HTTP POST               │  Chrome Extension   │
       │ Bearer bby_xxx          │  (Manifest V3)      │
       ▼                         └────────┬────────────┘
  ┌──────────────┐  WebSocket             │
  │ Relay Server │◄───────────────────────┘
  │ (Bun, :7890) │
  └──────────────┘
```

## Quick Start

### 1. Start the relay server

```bash
# Generate an API key
npx -y bun relay/server.ts keygen --name "my-agent"

# Start the server
npx -y bun relay/server.ts
```

### 2. Load the Chrome extension

```bash
# Build the extension
npx -y bun extension/build.ts

# Load in Chrome:
# 1. Open chrome://extensions/
# 2. Enable Developer Mode
# 3. Click "Load unpacked" → select extension/dist/
```

### 3. Connect the extension

1. Click the Chrome Bridge extension icon
2. Enter the relay URL: `http://localhost:7890`
3. Enter the extension token (shown when relay starts)
4. Click Connect

### 4. Send commands

```bash
# List tabs
curl -X POST http://localhost:7890/api/v1/command \
  -H "Authorization: Bearer bby_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": "tab.list"}'

# Navigate
curl -X POST http://localhost:7890/api/v1/command \
  -H "Authorization: Bearer bby_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": "navigate", "params": {"url": "https://example.com"}}'

# Screenshot
curl -X POST http://localhost:7890/api/v1/command \
  -H "Authorization: Bearer bby_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": "screenshot"}'
```

### 5. Use the TypeScript client

```typescript
import { ChromeBridge } from "./client"

const bridge = new ChromeBridge({
  url: "http://192.168.1.100:7890",
  apiKey: "bby_your_key_here",
})

await bridge.navigate("https://example.com")
await bridge.wait("h1")
const text = await bridge.queryText("h1")
console.log(text.result) // { text: "Example Domain" }
```

## Commands

| Command | Params | Description |
|---------|--------|-------------|
| `navigate` | `url, tabId?` | Navigate to URL |
| `tab.list` | — | List all tabs |
| `tab.create` | `url?` | Create new tab |
| `tab.close` | `tabId` | Close a tab |
| `click` | `selector, tabId?` | Click an element |
| `type` | `selector, text, tabId?` | Type text into element |
| `press` | `key, modifiers?, tabId?` | Press a key |
| `scroll` | `x?, y?, selector?` | Scroll page or to element |
| `query` | `selector, attrs?, tabId?` | Query DOM elements |
| `query.text` | `selector, tabId?` | Get element text |
| `wait` | `selector, timeout?, tabId?` | Wait for element |
| `screenshot` | `tabId?` | Capture visible tab |
| `evaluate` | `expression, tabId?` | Execute JavaScript |
| `cookie.get` | `url, name?` | Get cookies |
| `cookie.set` | `cookie` | Set a cookie |
| `file.set` | `selector, paths[]` | Set file input |
| `clipboard.write` | `text?/html?/imageBase64?` | Write to clipboard |
| `clipboard.paste` | — | OS-level Cmd+V (native host) |

## Plugins

Commands can be extended via plugins. Built-in plugins:

- **x.post** — Post to X/Twitter: `{"command": "x.post", "params": {"text": "Hello!", "images": [...]}}`
- **wechat.post** — Draft WeChat article: `{"command": "wechat.post", "params": {"title": "...", "html": "..."}}`

## API Keys

```bash
# Generate
npx -y bun relay/server.ts keygen --name "agent-1"

# List
npx -y bun relay/server.ts keys

# Show extension token
npx -y bun relay/server.ts token
```

## Native Host (Optional)

Required only for OS-level paste (Cmd+V) and non-PNG clipboard images.

```bash
# Install (pass your extension ID)
chmod +x native-host/install.sh
./native-host/install.sh <extension-id>
```

## Security

- All HTTP requests require Bearer API key
- Extension WebSocket is localhost-only
- Native host commands are whitelisted
- Rate limited to 60 req/min per key
- `evaluate` command can be disabled via config

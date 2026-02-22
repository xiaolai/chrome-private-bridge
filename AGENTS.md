# Project Instructions

> MCP-native Chrome browser automation bridge

## Guidelines

- Primary interface: MCP JSON-RPC via `POST /mcp`
- Secondary interface: REST API via `POST /api/v1/command` (backward compat)
- Chrome Extension is the command executor (unchanged)
- Zod schemas are the single source of truth for validation, MCP tool schemas, and TypeScript types
- Command registry pattern: each command file calls `defineCommand()` at import time

## Architecture

```
src/
├── server.ts              # Bun.serve: MCP + REST + WS routing, CLI, shutdown
├── config.ts              # Env-based config
├── auth.ts                # API key management
├── logger.ts              # Structured JSON logging
├── store.ts               # Key persistence
├── types.ts               # Shared types
├── registry/              # Command registry (single source of truth)
│   ├── define.ts          # defineCommand(), getAllTools(), getCommand()
│   ├── *.ts               # Individual command definitions with Zod schemas
│   └── index.ts           # Imports all commands, re-exports registry API
├── mcp/
│   └── handler.ts         # JSON-RPC dispatcher: initialize, tools/list, tools/call
├── rest/                  # Legacy REST (thin wrappers)
│   ├── commands.ts        # POST /api/v1/command
│   ├── status.ts          # GET /api/v1/status
│   └── keys.ts            # POST/GET /api/v1/keys
├── ws/
│   ├── manager.ts         # WebSocket lifecycle, sendToExtension
│   └── pending.ts         # PendingMap (promise-based request tracking)
└── plugins/
    ├── loader.ts          # Plugin registration into command registry
    ├── x-post.ts          # x_post plugin
    └── wechat-post.ts     # wechat_post plugin

extension/                 # Chrome Extension (unchanged)
client/                    # TypeScript client library
```

## Shared Memory

**Always write new instructions, rules, and memory to `AGENTS.md` only.**

Never modify `CLAUDE.md` or `GEMINI.md` directly - they only import `AGENTS.md`.
This ensures Claude Code, Codex CLI, and Gemini CLI share the same context consistently.

## Project Structure

- `.claude/agents/` - Custom subagents for specialized tasks
- `.claude/skills/` - Claude Code skills (slash commands)
- `.claude/rules/` - Modular rules auto-loaded into context
- `.codex/skills/` - Codex CLI skills
- `.codex/prompts/` - Codex CLI custom slash commands
- `.gemini/skills/` - Gemini CLI skills
- `.gemini/commands/` - Gemini CLI custom slash commands (TOML)
- `.mcp.json` - MCP server configuration

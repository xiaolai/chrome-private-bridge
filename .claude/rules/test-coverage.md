---
description: Enforces 100% test coverage — no code without tests
globs: "**/*.ts"
---

# 100% Test Coverage Rule

## Target: 100% coverage on all src/, client/ code

Every module MUST have corresponding tests. No exceptions for "simple" code.

## Coverage requirements

- **Statements**: 100%
- **Branches**: 100%
- **Functions**: 100%
- **Lines**: 100%

## What this means in practice

### Every new file needs tests
When creating `src/foo.ts`, you MUST also create `src/__tests__/foo.test.ts`.

### Every exported function needs tests
- Happy path (expected inputs produce expected outputs)
- Error path (invalid inputs produce correct errors)
- Edge cases (empty inputs, boundary values, null/undefined)

### Every branch needs tests
- `if/else` — test both branches
- `switch` — test every case including default
- `try/catch` — test both success and error paths
- Optional chaining `?.` — test when value exists AND when it's null/undefined
- Ternary `? :` — test both outcomes

### Current test inventory (keep up to date)
| Module | Test File | Tests |
|--------|-----------|-------|
| src/ws/pending.ts | src/ws/__tests__/pending.test.ts | 10 |
| src/ws/manager.ts | src/ws/__tests__/manager.test.ts | 14 |
| src/auth.ts | src/__tests__/auth.test.ts | 19 |
| src/plugins/loader.ts | src/plugins/__tests__/loader.test.ts | 12 |
| src/rest/commands.ts | src/rest/__tests__/commands.test.ts | 13 |
| src/registry/define.ts | src/registry/__tests__/define.test.ts | 11 |
| src/registry/* | src/registry/__tests__/commands.test.ts | 38 |
| src/mcp/handler.ts | src/mcp/__tests__/handler.test.ts | 19 |
| src/config.ts | src/__tests__/config.test.ts | 12 |
| src/logger.ts | src/__tests__/logger.test.ts | 8 |
| src/store.ts | src/__tests__/store.test.ts | 7 |
| src/rest/keys.ts | src/rest/__tests__/keys.test.ts | 20 |
| src/rest/status.ts | src/rest/__tests__/status.test.ts | 4 |
| client/index.ts | client/__tests__/client.test.ts | 29 |

## Tooling

### Coverage configuration (`bunfig.toml`)
- `coverageSkipTestFiles = true` — excludes test files from coverage report
- Coverage reporters: text (console) + lcov (for CI artifacts)
- Coverage output: `coverage/` directory (gitignored)

### Scripts (`package.json`)
- `bun test` — fast iteration, no coverage overhead
- `bun run test:coverage` — tests + coverage report
- `bun run test:ci` — tests + coverage + bail on first failure (CI)
- `bun run typecheck` — TypeScript type checking

### Pre-commit hook (`.githooks/pre-commit`)
- Runs typecheck + test:coverage before every commit
- Activated via `prepare` script (auto-runs after `bun install`)
- Blocks commits that fail typecheck or have insufficient coverage

### CI (`.github/workflows/ci.yml`)
- Triggers on push to main and PRs to main
- Steps: checkout → setup-bun → install → typecheck → test:ci
- Uploads coverage artifacts (30-day retention)

## Before any PR or commit
1. Run `bun test` — all tests must pass
2. Run `bun run test:coverage` — verify coverage
3. Run `bun run typecheck` — no type errors

## Extension code (extension/) is EXEMPT
Extension code runs in Chrome and requires browser APIs — unit testing is not practical without a full browser harness. Focus testing effort on src/ and client/.

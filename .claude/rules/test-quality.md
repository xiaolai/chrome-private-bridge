---
description: Enforces behavior-driven test quality — bans wiring-only tests
globs: "**/__tests__/**/*.test.ts"
---

# Test Quality Rule

## The one rule: Test BEHAVIOR, not WIRING

Every test must verify what the code DOES (return values, side effects, state changes), not how it does it (which functions it called internally).

## Quick check

Before writing `expect(mockFn).toHaveBeenCalledWith(...)`, ask: "Do I also assert the observable result?" If no — your test is wiring-only and will pass even if the code is broken.

## Assertion requirements

Every `it()` / `test()` block MUST include at least one of:
- `expect(result)...` — verify return value
- `expect(() => fn()).toThrow(...)` — verify error
- `expect(response.status)...` — verify HTTP response status
- `await expect(promise).rejects.toThrow(...)` — verify async error
- `expect(data)...` — verify parsed response body

Mock call assertions (`toHaveBeenCalledWith`) are allowed ONLY as supplements alongside the above.

## Mock boundaries

**Acceptable to mock**: Network I/O, WebSocket connections, Chrome extension APIs, child_process, filesystem for isolation, Date.now, crypto

**Never mock**: Internal modules from this repo, validation schemas, pure functions, type definitions

## Prefer real implementations

```typescript
// PREFER: Real temp directory for config isolation
const dir = mkdtempSync(join(tmpdir(), "test-"));
process.env.CONFIG_DIR = dir;

// PREFER: Real HTTP handler testing
const resp = await handler(new Request("http://localhost/api/v1/status"));
expect(resp.status).toBe(200);

// PREFER: Real validation
const error = validateParams("navigate", {});
expect(error).toBe("Missing required field: url");

// PREFER: Real class instances
const pm = new PendingMap();
const promise = pm.add("id", 50);
await expect(promise).rejects.toThrow(/timed out/);
```

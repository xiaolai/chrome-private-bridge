import { describe, test, expect, beforeEach } from "bun:test"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const testDir = mkdtempSync(join(tmpdir(), "chrome-bridge-rest-keys-test-"))
process.env.CONFIG_DIR = testDir

import { handleKeys } from "../keys"
import { generateKey } from "../../auth"
import { loadKeys, saveKeys } from "../../store"

describe("REST keys handler", () => {
  beforeEach(() => {
    saveKeys({ keys: [] })
  })

  function makeReq(method: string, body?: Record<string, unknown>, query = ""): Request {
    return new Request(`http://localhost:7890/api/v1/keys${query}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  }

  test("non-localhost IP returns 403", async () => {
    const req = makeReq("POST", { action: "list" })
    const resp = await handleKeys(req, "8.8.8.8")
    expect(resp.status).toBe(403)
    const data = await resp.json()
    expect(data.error).toContain("localhost")
  })

  test("127.0.0.1 is allowed", async () => {
    const req = makeReq("POST", { action: "list" })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(200)
  })

  test("::1 is allowed", async () => {
    const req = makeReq("POST", { action: "list" })
    const resp = await handleKeys(req, "::1")
    expect(resp.status).toBe(200)
  })

  test("localhost string is allowed", async () => {
    const req = makeReq("POST", { action: "list" })
    const resp = await handleKeys(req, "localhost")
    expect(resp.status).toBe(200)
  })

  test("POST generate creates a key", async () => {
    const req = makeReq("POST", { action: "generate", name: "test-key" })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.key).toMatch(/^bby_/)
    expect(data.name).toBe("test-key")
  })

  test("POST generate with commands array", async () => {
    const req = makeReq("POST", { action: "generate", name: "limited", commands: ["tab.list", "screenshot"] })
    const resp = await handleKeys(req, "127.0.0.1")
    const data = await resp.json()
    expect(data.ok).toBe(true)
    const store = loadKeys()
    const entry = store.keys.find(k => k.key === data.key)
    expect(entry!.allowedCommands).toEqual(["tab.list", "screenshot"])
  })

  test("POST generate with commands as comma-separated string", async () => {
    const req = makeReq("POST", { action: "generate", name: "csv", commands: "tab.list,screenshot" })
    const resp = await handleKeys(req, "127.0.0.1")
    const data = await resp.json()
    expect(data.ok).toBe(true)
    const store = loadKeys()
    const entry = store.keys.find(k => k.key === data.key)
    expect(entry!.allowedCommands).toEqual(["tab.list", "screenshot"])
  })

  test("POST generate defaults name to 'unnamed'", async () => {
    const req = makeReq("POST", { action: "generate" })
    const resp = await handleKeys(req, "127.0.0.1")
    const data = await resp.json()
    expect(data.name).toBe("unnamed")
  })

  test("POST list returns keys", async () => {
    generateKey("one")
    generateKey("two")
    const req = makeReq("POST", { action: "list" })
    const resp = await handleKeys(req, "127.0.0.1")
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.keys).toHaveLength(2)
  })

  test("POST revoke removes a key", async () => {
    const key = generateKey("to-revoke")
    const prefix = key.slice(0, 8)
    const req = makeReq("POST", { action: "revoke", prefix })
    const resp = await handleKeys(req, "127.0.0.1")
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.message).toBe("Key revoked")
  })

  test("POST revoke without prefix returns 400", async () => {
    const req = makeReq("POST", { action: "revoke" })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(400)
  })

  test("POST revoke unknown prefix returns not found", async () => {
    const req = makeReq("POST", { action: "revoke", prefix: "bby_zzzz" })
    const resp = await handleKeys(req, "127.0.0.1")
    const data = await resp.json()
    expect(data.ok).toBe(false)
    expect(data.message).toBe("Key not found")
  })

  test("POST unknown action returns 400", async () => {
    const req = makeReq("POST", { action: "destroy" })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(400)
  })

  test("GET returns key list", async () => {
    generateKey("gettest")
    const req = makeReq("GET")
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)
    expect(data.keys.length).toBeGreaterThanOrEqual(1)
  })

  test("PUT returns 405", async () => {
    const req = new Request("http://localhost:7890/api/v1/keys", { method: "PUT" })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(405)
  })

  test("DELETE returns 405", async () => {
    const req = new Request("http://localhost:7890/api/v1/keys", { method: "DELETE" })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(405)
  })

  test("POST with action in query param", async () => {
    const req = makeReq("POST", {}, "?action=list")
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.ok).toBe(true)
  })

  test("POST with invalid JSON body returns 400 with error message", async () => {
    const req = new Request("http://localhost:7890/api/v1/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json{",
    })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("Invalid JSON body")
  })

  test("POST generate with invalid commands type returns 400", async () => {
    const req = makeReq("POST", { action: "generate", name: "bad", commands: 123 })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("commands")
  })

  test("POST revoke with ambiguous prefix returns 400", async () => {
    // Generate two keys, then try to revoke with common prefix "bby_"
    generateKey("ambig1")
    generateKey("ambig2")
    const req = makeReq("POST", { action: "revoke", prefix: "bby_" })
    const resp = await handleKeys(req, "127.0.0.1")
    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain("Ambiguous")
  })
})

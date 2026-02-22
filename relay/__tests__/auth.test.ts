import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// Set CONFIG_DIR before importing modules
const testDir = mkdtempSync(join(tmpdir(), "chrome-bridge-test-"))
process.env.CONFIG_DIR = testDir

// Dynamic import after env is set — re-import fresh modules
let auth: typeof import("../auth")
let store: typeof import("../store")

describe("auth module", () => {
  beforeEach(async () => {
    // Clear module cache and re-import to get fresh state
    const configPath = require.resolve("../config")
    const storePath = require.resolve("../store")
    const authPath = require.resolve("../auth")
    delete require.cache[configPath]
    delete require.cache[storePath]
    delete require.cache[authPath]

    // Reset CONFIG_DIR for each test
    const freshDir = mkdtempSync(join(tmpdir(), "chrome-bridge-test-"))
    process.env.CONFIG_DIR = freshDir

    // Re-import
    const configMod = await import("../config")
    store = await import("../store")
    auth = await import("../auth")
  })

  test("generateKey() returns string starting with bby_", () => {
    const key = auth.generateKey("test")
    expect(key.startsWith("bby_")).toBe(true)
  })

  test("generateKey() stores key in loadKeys()", () => {
    const key = auth.generateKey("test")
    const keys = store.loadKeys()
    expect(keys.keys.some(k => k.key === key)).toBe(true)
  })

  test("validateKey() returns true for valid key", () => {
    const key = auth.generateKey("test")
    expect(auth.validateKey(key, "127.0.0.1")).toBe(true)
  })

  test("validateKey() returns false for unknown key", () => {
    expect(auth.validateKey("bby_nonexistent", "127.0.0.1")).toBe(false)
  })

  test("validateKey() returns false for wrong prefix", () => {
    expect(auth.validateKey("wrong_prefix", "127.0.0.1")).toBe(false)
  })

  test("validateKey() with IP allowlist — allowed IP passes", () => {
    const key = auth.generateKey("test")
    // Manually set allowedIPs
    const keys = store.loadKeys()
    keys.keys[0].allowedIPs = ["10.0.0.1"]
    store.saveKeys(keys)
    // Invalidate cache by generating another key and clearing
    const authFresh = auth
    expect(authFresh.validateKey(key, "10.0.0.1")).toBe(true)
  })

  test("validateKey() with IP allowlist — blocked IP fails", () => {
    const key = auth.generateKey("test")
    const keys = store.loadKeys()
    keys.keys[0].allowedIPs = ["10.0.0.1"]
    store.saveKeys(keys)
    expect(auth.validateKey(key, "192.168.1.1")).toBe(false)
  })

  test("revokeKey() removes key, subsequent validate returns false", () => {
    const key = auth.generateKey("test")
    const prefix = key.slice(0, 8)
    expect(auth.revokeKey(prefix)).toBe(true)
    expect(auth.validateKey(key, "127.0.0.1")).toBe(false)
  })

  test("revokeKey() with unknown prefix returns false", () => {
    expect(auth.revokeKey("bby_zzzz")).toBe(false)
  })

  test("extractBearerToken() parses Authorization: Bearer xxx correctly", () => {
    const req = new Request("http://localhost", {
      headers: { "Authorization": "Bearer mytoken123" },
    })
    expect(auth.extractBearerToken(req)).toBe("mytoken123")
  })

  test("extractBearerToken() returns null for missing header", () => {
    const req = new Request("http://localhost")
    expect(auth.extractBearerToken(req)).toBeNull()
  })

  test("getExtensionToken() returns consistent value (singleton)", () => {
    const t1 = auth.getExtensionToken()
    const t2 = auth.getExtensionToken()
    expect(t1).toBe(t2)
    expect(t1.startsWith("ext_")).toBe(true)
  })

  test("validateExtensionToken() returns true for correct token", () => {
    const token = auth.getExtensionToken()
    expect(auth.validateExtensionToken(token)).toBe(true)
    expect(auth.validateExtensionToken("wrong")).toBe(false)
  })
})

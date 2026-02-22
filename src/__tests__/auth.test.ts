import { describe, test, expect, beforeEach } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const testDir = mkdtempSync(join(tmpdir(), "chrome-bridge-src-auth-test-"))
process.env.CONFIG_DIR = testDir

import {
  generateKey,
  validateKey,
  getKeyPermissions,
  flushKeys,
  listKeys,
  revokeKey,
  extractBearerToken,
} from "../auth"
import { loadKeys, saveKeys } from "../store"

describe("auth module", () => {
  beforeEach(() => {
    const keysFile = join(process.env.CONFIG_DIR!, "keys.json")
    writeFileSync(keysFile, JSON.stringify({ keys: [] }))
  })

  test("generateKey() returns string starting with bby_", () => {
    const key = generateKey("test")
    expect(key.startsWith("bby_")).toBe(true)
  })

  test("generateKey() stores key in loadKeys()", () => {
    const key = generateKey("test")
    const keys = loadKeys()
    expect(keys.keys.some(k => k.key === key)).toBe(true)
  })

  test("generateKey() with allowedCommands", () => {
    const key = generateKey("restricted", ["tab.list", "screenshot"])
    const keys = loadKeys()
    const entry = keys.keys.find(k => k.key === key)
    expect(entry!.allowedCommands).toEqual(["tab.list", "screenshot"])
  })

  test("validateKey() returns true for valid key", () => {
    const key = generateKey("test")
    expect(validateKey(key, "127.0.0.1")).toBe(true)
  })

  test("validateKey() returns false for unknown key", () => {
    expect(validateKey("bby_nonexistent0000000000000000000000000000000000000000000000000000", "127.0.0.1")).toBe(false)
  })

  test("validateKey() returns false for wrong prefix", () => {
    expect(validateKey("wrong_prefix", "127.0.0.1")).toBe(false)
  })

  test("validateKey() with IP allowlist — allowed IP passes", () => {
    const key = generateKey("test")
    const keys = loadKeys()
    keys.keys.find(k => k.key === key)!.allowedIPs = ["10.0.0.1"]
    saveKeys(keys)
    generateKey("dummy")
    expect(validateKey(key, "10.0.0.1")).toBe(true)
  })

  test("validateKey() with IP allowlist — blocked IP fails", () => {
    const key = generateKey("test")
    const keys = loadKeys()
    keys.keys.find(k => k.key === key)!.allowedIPs = ["10.0.0.1"]
    saveKeys(keys)
    generateKey("dummy")
    expect(validateKey(key, "192.168.1.1")).toBe(false)
  })

  test("validateKey() updates lastUsed", () => {
    const key = generateKey("test")
    validateKey(key, "127.0.0.1")
    flushKeys()
    const keys = loadKeys()
    expect(keys.keys.find(k => k.key === key)!.lastUsed).not.toBeNull()
  })

  test("getKeyPermissions() returns null for unrestricted key", () => {
    const key = generateKey("test")
    validateKey(key, "127.0.0.1")
    expect(getKeyPermissions(key)).toBeNull()
  })

  test("getKeyPermissions() returns commands for restricted key", () => {
    const key = generateKey("restricted", ["tab.list"])
    validateKey(key, "127.0.0.1")
    expect(getKeyPermissions(key)).toEqual(["tab.list"])
  })

  test("flushKeys() writes dirty cache to disk", () => {
    const key = generateKey("test")
    validateKey(key, "127.0.0.1")
    flushKeys()
    const keys = loadKeys()
    expect(keys.keys.find(k => k.key === key)!.lastUsed).not.toBeNull()
  })

  test("flushKeys() does nothing when not dirty", () => {
    flushKeys()
  })

  test("revokeKey() removes key, subsequent validate returns false", () => {
    const key = generateKey("test")
    const prefix = key.slice(0, 8)
    expect(revokeKey(prefix)).toBe(true)
    expect(validateKey(key, "127.0.0.1")).toBe(false)
  })

  test("revokeKey() with unknown prefix returns false", () => {
    expect(revokeKey("bby_zzzz")).toBe(false)
  })

  test("revokeKey() with ambiguous prefix returns 'ambiguous'", () => {
    generateKey("dup1")
    generateKey("dup2")
    // "bby_" matches all keys
    expect(revokeKey("bby_")).toBe("ambiguous")
  })

  test("listKeys() returns key metadata", () => {
    generateKey("alpha")
    generateKey("beta")
    const keys = listKeys()
    expect(keys.length).toBeGreaterThanOrEqual(2)
    expect(keys[0].name).toBeDefined()
    expect(keys[0].prefix).toMatch(/^bby_.*\.\.\./)
  })

  test("extractBearerToken() parses Authorization: Bearer xxx correctly", () => {
    const req = new Request("http://localhost", {
      headers: { "Authorization": "Bearer mytoken123" },
    })
    expect(extractBearerToken(req)).toBe("mytoken123")
  })

  test("extractBearerToken() returns null for missing header", () => {
    const req = new Request("http://localhost")
    expect(extractBearerToken(req)).toBeNull()
  })

  test("extractBearerToken() returns null for non-Bearer auth", () => {
    const req = new Request("http://localhost", {
      headers: { "Authorization": "Basic abc123" },
    })
    expect(extractBearerToken(req)).toBeNull()
  })
})

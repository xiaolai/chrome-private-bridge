import { describe, test, expect, beforeEach } from "bun:test"
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { config } from "../config"
import { loadKeys, saveKeys, isStoreCorrupted } from "../store"

const testDir = config.configDir

describe("store module", () => {
  beforeEach(() => {
    const keysFile = join(testDir, "keys.json")
    if (existsSync(keysFile)) {
      rmSync(keysFile)
    }
  })

  test("loadKeys returns empty store when no file exists", () => {
    const store = loadKeys()
    expect(store.keys).toEqual([])
  })

  test("loadKeys returns empty store and sets corrupted flag when file contains invalid JSON", () => {
    saveKeys({ keys: [] })
    writeFileSync(join(testDir, "keys.json"), "not valid json{{{")
    const store = loadKeys()
    expect(store.keys).toEqual([])
    expect(isStoreCorrupted()).toBe(true)
  })

  test("saveKeys creates config directory and does not throw", () => {
    expect(() => saveKeys({ keys: [] })).not.toThrow()
    expect(existsSync(testDir)).toBe(true)
  })

  test("round-trip: saveKeys then loadKeys", () => {
    const key = {
      key: "bby_test123",
      name: "test",
      created: "2026-01-01T00:00:00.000Z",
      lastUsed: null,
      allowedIPs: null,
      allowedCommands: null,
    }
    saveKeys({ keys: [key] })
    const store = loadKeys()
    expect(store.keys).toHaveLength(1)
    expect(store.keys[0].key).toBe("bby_test123")
    expect(store.keys[0].name).toBe("test")
  })

  test("saveKeys writes valid JSON to disk", () => {
    saveKeys({ keys: [{ key: "bby_x", name: "x", created: "", lastUsed: null, allowedIPs: null, allowedCommands: null }] })
    const raw = readFileSync(join(testDir, "keys.json"), "utf-8")
    const parsed = JSON.parse(raw)
    expect(parsed.keys).toHaveLength(1)
  })

  test("saveKeys overwrites existing data", () => {
    saveKeys({ keys: [{ key: "bby_a", name: "a", created: "", lastUsed: null, allowedIPs: null, allowedCommands: null }] })
    saveKeys({ keys: [{ key: "bby_b", name: "b", created: "", lastUsed: null, allowedIPs: null, allowedCommands: null }] })
    const store = loadKeys()
    expect(store.keys).toHaveLength(1)
    expect(store.keys[0].key).toBe("bby_b")
  })

  test("loadKeys returns existing data when file exists", () => {
    const data = { keys: [{ key: "bby_abc", name: "existing", created: "2026-01-01", lastUsed: null, allowedIPs: null, allowedCommands: null }] }
    saveKeys({ keys: [] })
    writeFileSync(join(testDir, "keys.json"), JSON.stringify(data))
    const store = loadKeys()
    expect(store.keys).toHaveLength(1)
    expect(store.keys[0].name).toBe("existing")
  })

  test("loadKeys returns empty store and sets corrupted flag when JSON has no keys array", () => {
    writeFileSync(join(testDir, "keys.json"), JSON.stringify({ notkeys: true }))
    const store = loadKeys()
    expect(store.keys).toEqual([])
    expect(isStoreCorrupted()).toBe(true)
  })

  test("loadKeys clears corrupted flag on successful load", () => {
    writeFileSync(join(testDir, "keys.json"), "not json")
    loadKeys()
    expect(isStoreCorrupted()).toBe(true)
    saveKeys({ keys: [] })
    loadKeys()
    expect(isStoreCorrupted()).toBe(false)
  })
})

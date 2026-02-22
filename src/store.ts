import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs"
import { join } from "path"
import { config } from "./config"
import type { ApiKey } from "./types"

export interface KeyStore {
  keys: ApiKey[]
}

const CONFIG_DIR = config.configDir
const KEYS_FILE = join(CONFIG_DIR, "keys.json")

let storeCorrupted = false

export function isStoreCorrupted(): boolean {
  return storeCorrupted
}

export function loadKeys(): KeyStore {
  storeCorrupted = false
  if (!existsSync(KEYS_FILE)) return { keys: [] }
  try {
    const data = JSON.parse(readFileSync(KEYS_FILE, "utf-8"))
    if (!data || !Array.isArray(data.keys)) {
      console.error(`[store] Invalid keys.json: missing "keys" array`)
      storeCorrupted = true
      return { keys: [] }
    }
    // Filter out malformed key entries
    const validKeys = data.keys.filter((k: unknown) =>
      k && typeof k === "object" && typeof (k as any).key === "string" && typeof (k as any).name === "string"
    )
    if (validKeys.length !== data.keys.length) {
      console.error(`[store] Filtered ${data.keys.length - validKeys.length} invalid key entries`)
    }
    return { keys: validKeys } as KeyStore
  } catch (err) {
    console.error(`[store] Failed to parse keys.json: ${err instanceof Error ? err.message : err}`)
    storeCorrupted = true
    return { keys: [] }
  }
}

export function saveKeys(store: KeyStore): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  }
  const tmpFile = KEYS_FILE + ".tmp"
  writeFileSync(tmpFile, JSON.stringify(store, null, 2), { mode: 0o600 })
  renameSync(tmpFile, KEYS_FILE)
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { config } from "./config"
import type { ApiKey } from "./types"

export interface KeyStore {
  keys: ApiKey[]
}

const CONFIG_DIR = config.configDir
const KEYS_FILE = join(CONFIG_DIR, "keys.json")

export function loadKeys(): KeyStore {
  if (!existsSync(KEYS_FILE)) return { keys: [] }
  try {
    return JSON.parse(readFileSync(KEYS_FILE, "utf-8"))
  } catch {
    return { keys: [] }
  }
}

export function saveKeys(store: KeyStore): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  writeFileSync(KEYS_FILE, JSON.stringify(store, null, 2))
}

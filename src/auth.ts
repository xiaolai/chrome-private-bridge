import { loadKeys, saveKeys, type KeyStore } from "./store"

const KEY_PREFIX = "bby_"
const KEY_LENGTH = 32

let dirty = false
let keyCache: KeyStore | null = null

export function generateKey(name: string, allowedCommands: string[] | null = null): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(KEY_LENGTH)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
  const key = `${KEY_PREFIX}${hex}`
  const store = loadKeys()
  store.keys.push({
    key,
    name,
    created: new Date().toISOString(),
    lastUsed: null,
    allowedIPs: null,
    allowedCommands,
  })
  saveKeys(store)
  keyCache = null // invalidate cache
  return key
}

export function validateKey(token: string, remoteIP: string): boolean {
  if (!token.startsWith(KEY_PREFIX)) return false
  if (!keyCache) keyCache = loadKeys()
  const entry = keyCache.keys.find(k => k.key === token)
  if (!entry) return false
  if (entry.allowedIPs && !entry.allowedIPs.includes(remoteIP)) return false
  entry.lastUsed = new Date().toISOString()
  dirty = true
  return true
}

export function getKeyPermissions(token: string): string[] | null {
  if (!keyCache) keyCache = loadKeys()
  const entry = keyCache.keys.find(k => k.key === token)
  return entry?.allowedCommands ?? null
}

export function flushKeys(): void {
  if (dirty && keyCache) {
    saveKeys(keyCache)
    dirty = false
  }
}

export function listKeys(): Array<{ name: string; created: string; lastUsed: string | null; prefix: string }> {
  const store = loadKeys()
  return store.keys.map(k => ({
    name: k.name,
    created: k.created,
    lastUsed: k.lastUsed,
    prefix: k.key.slice(0, 8) + "...",
  }))
}

export function revokeKey(prefix: string): boolean {
  const store = loadKeys()
  const idx = store.keys.findIndex(k => k.key.startsWith(prefix))
  if (idx === -1) return false
  store.keys.splice(idx, 1)
  saveKeys(store)
  keyCache = null // invalidate cache
  return true
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  return auth.slice(7)
}

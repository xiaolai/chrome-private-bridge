import { loadKeys, saveKeys, type KeyStore } from "./store"

const KEY_PREFIX = "bby_"
const KEY_LENGTH = 32

export function generateKey(name: string): string {
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
  })
  saveKeys(store)
  return key
}

export function validateKey(token: string, remoteIP: string): boolean {
  if (!token.startsWith(KEY_PREFIX)) return false
  const store = loadKeys()
  const entry = store.keys.find(k => k.key === token)
  if (!entry) return false
  if (entry.allowedIPs && !entry.allowedIPs.includes(remoteIP)) return false
  entry.lastUsed = new Date().toISOString()
  saveKeys(store)
  return true
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
  return true
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  return auth.slice(7)
}

let extensionToken: string | null = null

export function getExtensionToken(): string {
  if (!extensionToken) {
    extensionToken = `ext_${crypto.randomUUID().replace(/-/g, "")}`
  }
  return extensionToken
}

export function validateExtensionToken(token: string): boolean {
  return token === extensionToken
}

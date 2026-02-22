import type { PendingRequest } from "../types"

const DEFAULT_TIMEOUT = 30_000

export class PendingMap {
  private map = new Map<string, PendingRequest>()
  private counter = 0

  nextId(): string {
    return `cmd_${(++this.counter).toString(36)}_${Date.now().toString(36)}`
  }

  add(id: string, timeoutMs = DEFAULT_TIMEOUT): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.map.delete(id)
        reject(new Error(`Command ${id} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.map.set(id, { resolve, reject, timer, startedAt: Date.now() })
    })
  }

  resolve(id: string, result: unknown): boolean {
    const entry = this.map.get(id)
    if (!entry) return false
    clearTimeout(entry.timer)
    this.map.delete(id)
    entry.resolve(result)
    return true
  }

  reject(id: string, error: Error): boolean {
    const entry = this.map.get(id)
    if (!entry) return false
    clearTimeout(entry.timer)
    this.map.delete(id)
    entry.reject(error)
    return true
  }

  elapsed(id: string): number {
    const entry = this.map.get(id)
    return entry ? Date.now() - entry.startedAt : -1
  }

  get size(): number {
    return this.map.size
  }

  clear(): void {
    for (const [, entry] of this.map) {
      clearTimeout(entry.timer)
      entry.reject(new Error("Connection closed"))
    }
    this.map.clear()
  }
}

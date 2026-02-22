type Level = "info" | "warn" | "error" | "debug"

export function log(level: Level, event: string, data?: Record<string, unknown>): void {
  const entry = { ts: new Date().toISOString(), level, event, ...data }
  console.log(JSON.stringify(entry))
}

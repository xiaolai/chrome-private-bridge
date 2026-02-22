import { join } from "path"
import { homedir } from "os"

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) {
    console.error(`[config] Invalid ${name}: "${raw}" — using default ${fallback}`)
    return fallback
  }
  return n
}

export const config = {
  port: intEnv("PORT", 7890),
  host: process.env.HOST || "0.0.0.0",
  rateLimit: intEnv("RATE_LIMIT", 60),
  rateWindow: intEnv("RATE_WINDOW", 60000),
  commandTimeout: intEnv("COMMAND_TIMEOUT", 30000),
  corsOrigin: process.env.CORS_ORIGIN || "",
  enableEvaluate: process.env.ENABLE_EVALUATE === "true",
  configDir: process.env.CONFIG_DIR || join(homedir(), ".config", "chrome-bridge"),
  mcpEnabled: process.env.MCP_ENABLED !== "false",
  restEnabled: process.env.REST_ENABLED !== "false",
}

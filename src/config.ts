import { join } from "path"
import { homedir } from "os"

export const config = {
  port: parseInt(process.env.PORT || "7890"),
  host: process.env.HOST || "0.0.0.0",
  rateLimit: parseInt(process.env.RATE_LIMIT || "60"),
  rateWindow: parseInt(process.env.RATE_WINDOW || "60000"),
  commandTimeout: parseInt(process.env.COMMAND_TIMEOUT || "30000"),
  corsOrigin: process.env.CORS_ORIGIN || "",
  enableEvaluate: process.env.ENABLE_EVALUATE === "true",
  configDir: process.env.CONFIG_DIR || join(homedir(), ".config", "chrome-bridge"),
  mcpEnabled: process.env.MCP_ENABLED !== "false",
  restEnabled: process.env.REST_ENABLED !== "false",
}

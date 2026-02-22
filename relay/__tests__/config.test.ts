import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { homedir } from "os"

// Since config.ts evaluates at import time, we must clear cache to test env overrides
const originalEnv = { ...process.env }

describe("config module", () => {
  beforeEach(() => {
    delete require.cache[require.resolve("../config")]
  })

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  test("default values when no env vars set", async () => {
    delete process.env.PORT
    delete process.env.HOST
    delete process.env.RATE_LIMIT
    delete process.env.RATE_WINDOW
    delete process.env.COMMAND_TIMEOUT
    delete process.env.CORS_ORIGIN
    delete process.env.ENABLE_EVALUATE
    delete process.env.CONFIG_DIR

    const { config } = await import("../config")
    expect(config.port).toBe(7890)
    expect(config.host).toBe("0.0.0.0")
    expect(config.rateLimit).toBe(60)
    expect(config.rateWindow).toBe(60000)
    expect(config.commandTimeout).toBe(30000)
    expect(config.corsOrigin).toBe("")
    expect(config.enableEvaluate).toBe(false)
    expect(config.configDir).toBe(join(homedir(), ".config", "chrome-bridge"))
  })

  test("PORT override", async () => {
    process.env.PORT = "9999"
    const { config } = await import("../config")
    expect(config.port).toBe(9999)
  })

  test("HOST override", async () => {
    process.env.HOST = "127.0.0.1"
    const { config } = await import("../config")
    expect(config.host).toBe("127.0.0.1")
  })

  test("RATE_LIMIT override", async () => {
    process.env.RATE_LIMIT = "100"
    const { config } = await import("../config")
    expect(config.rateLimit).toBe(100)
  })

  test("RATE_WINDOW override", async () => {
    process.env.RATE_WINDOW = "120000"
    const { config } = await import("../config")
    expect(config.rateWindow).toBe(120000)
  })

  test("COMMAND_TIMEOUT override", async () => {
    process.env.COMMAND_TIMEOUT = "5000"
    const { config } = await import("../config")
    expect(config.commandTimeout).toBe(5000)
  })

  test("CORS_ORIGIN override", async () => {
    process.env.CORS_ORIGIN = "http://localhost:3000"
    const { config } = await import("../config")
    expect(config.corsOrigin).toBe("http://localhost:3000")
  })

  test("ENABLE_EVALUATE=true", async () => {
    process.env.ENABLE_EVALUATE = "true"
    const { config } = await import("../config")
    expect(config.enableEvaluate).toBe(true)
  })

  test("ENABLE_EVALUATE=other stays false", async () => {
    process.env.ENABLE_EVALUATE = "yes"
    const { config } = await import("../config")
    expect(config.enableEvaluate).toBe(false)
  })

  test("CONFIG_DIR override", async () => {
    process.env.CONFIG_DIR = "/tmp/custom-config"
    const { config } = await import("../config")
    expect(config.configDir).toBe("/tmp/custom-config")
  })
})

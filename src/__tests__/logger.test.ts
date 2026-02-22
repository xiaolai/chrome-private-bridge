import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test"
import { log } from "../logger"

describe("logger", () => {
  let consoleSpy: ReturnType<typeof spyOn>
  let captured: string[]

  beforeEach(() => {
    captured = []
    consoleSpy = spyOn(console, "log").mockImplementation((...args: any[]) => {
      captured.push(args[0])
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  test("outputs valid JSON", () => {
    log("info", "test.event")
    expect(captured).toHaveLength(1)
    const parsed = JSON.parse(captured[0])
    expect(parsed).toBeDefined()
  })

  test("includes ts, level, and event fields", () => {
    log("info", "server.started")
    const parsed = JSON.parse(captured[0])
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(parsed.level).toBe("info")
    expect(parsed.event).toBe("server.started")
  })

  test("info level", () => {
    log("info", "test")
    const parsed = JSON.parse(captured[0])
    expect(parsed.level).toBe("info")
  })

  test("warn level", () => {
    log("warn", "test")
    const parsed = JSON.parse(captured[0])
    expect(parsed.level).toBe("warn")
  })

  test("error level", () => {
    log("error", "test")
    const parsed = JSON.parse(captured[0])
    expect(parsed.level).toBe("error")
  })

  test("debug level", () => {
    log("debug", "test")
    const parsed = JSON.parse(captured[0])
    expect(parsed.level).toBe("debug")
  })

  test("merges data fields into output", () => {
    log("info", "command.executed", { command: "navigate", duration: 42 })
    const parsed = JSON.parse(captured[0])
    expect(parsed.command).toBe("navigate")
    expect(parsed.duration).toBe(42)
    expect(parsed.event).toBe("command.executed")
  })

  test("no data field produces only ts, level, event", () => {
    log("info", "simple")
    const parsed = JSON.parse(captured[0])
    expect(Object.keys(parsed).sort()).toEqual(["event", "level", "ts"])
  })
})

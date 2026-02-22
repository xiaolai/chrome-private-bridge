import { describe, test, expect } from "bun:test"
import { runCommand, commandExists } from "../exec"

describe("commandExists", () => {
  test("returns true for existing command (echo)", async () => {
    const result = await commandExists("echo")
    expect(result).toBe(true)
  })

  test("returns false for nonexistent command", async () => {
    const result = await commandExists("__nonexistent_command_xyz_999__")
    expect(result).toBe(false)
  })
})

describe("runCommand", () => {
  test("returns stdout/stderr/exitCode on success", async () => {
    const result = await runCommand("echo", ["hello"], { timeout: 5000 })
    expect(result.stdout.trim()).toBe("hello")
    expect(result.exitCode).toBe(0)
  })

  test("throws on non-zero exit by default", async () => {
    await expect(runCommand("false", [], { timeout: 5000 })).rejects.toThrow("Command failed")
  })

  test("includes stderr in error message", async () => {
    try {
      await runCommand("sh", ["-c", "echo err >&2; exit 1"], { timeout: 5000 })
      expect(true).toBe(false)
    } catch (e: any) {
      expect(e.message).toContain("err")
    }
  })

  test("allowNonZeroExit returns result without throwing", async () => {
    const result = await runCommand("false", [], { allowNonZeroExit: true, timeout: 5000 })
    expect(result.exitCode).not.toBe(0)
  })

  test("passes string stdin correctly", async () => {
    const result = await runCommand("cat", [], { input: "hello from stdin", timeout: 5000 })
    expect(result.stdout).toBe("hello from stdin")
  })

  test("passes Buffer stdin correctly", async () => {
    const buf = Buffer.from("buffer input")
    const result = await runCommand("cat", [], { input: buf, timeout: 5000 })
    expect(result.stdout).toBe("buffer input")
  })
})

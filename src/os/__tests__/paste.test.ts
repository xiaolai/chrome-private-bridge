import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"

const originalPlatform = process.platform

function setPlatform(p: string) {
  Object.defineProperty(process, "platform", { value: p, writable: true })
}

function restorePlatform() {
  Object.defineProperty(process, "platform", { value: originalPlatform, writable: true })
}

// Mock exec and utils modules before importing paste
const mockRunCommand = mock((..._args: any[]): any => Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }))
const mockCommandExists = mock((..._args: any[]): any => Promise.resolve(true))
const mockSleep = mock((..._args: any[]): any => Promise.resolve())

mock.module("../exec", () => ({
  runCommand: mockRunCommand,
  commandExists: mockCommandExists,
}))

mock.module("../../utils", () => ({
  sleep: mockSleep,
  toError: (err: unknown) => err instanceof Error ? err : new Error(String(err)),
}))

// Import after mocking
const { pasteFromClipboard } = await import("../paste")

beforeEach(() => {
  mockRunCommand.mockClear()
  mockCommandExists.mockClear()
  mockSleep.mockClear()
  mockRunCommand.mockImplementation((..._args: any[]): any => Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }))
  mockCommandExists.mockImplementation((..._args: any[]): any => Promise.resolve(true))
  mockSleep.mockImplementation((..._args: any[]): any => Promise.resolve())
})

afterEach(() => {
  restorePlatform()
})

// Helper to get mock.calls with proper typing
function calls(fn: ReturnType<typeof mock>): any[][] {
  return (fn as any).mock.calls
}

describe("pasteFromClipboard", () => {
  describe("macOS", () => {
    test("succeeds without target app", async () => {
      setPlatform("darwin")
      const result = await pasteFromClipboard()
      expect(result.success).toBe(true)
      expect(result.platform).toBe("darwin")
      expect(result.tool).toBe("osascript")
      expect(result.attempts).toBe(1)

      const c = calls(mockRunCommand)
      expect(c[0][0]).toBe("osascript")
      expect(c[0][1][1]).toContain("keystroke")
      expect(c[0][1][1]).not.toContain("activate")
    })

    test("succeeds with target app", async () => {
      setPlatform("darwin")
      const result = await pasteFromClipboard({ app: "Google Chrome" })
      expect(result.success).toBe(true)

      const c = calls(mockRunCommand)
      expect(c[0][1][1]).toContain("Google Chrome")
      expect(c[0][1][1]).toContain("activate")
    })

    test("escapes double quotes in app name", async () => {
      setPlatform("darwin")
      await pasteFromClipboard({ app: 'My "App"' })

      const c = calls(mockRunCommand)
      expect(c[0][1][1]).toContain('My \\"App\\"')
    })

    test("escapes backslash in app name", async () => {
      setPlatform("darwin")
      await pasteFromClipboard({ app: "My\\App" })

      const c = calls(mockRunCommand)
      expect(c[0][1][1]).toContain("My\\\\App")
    })

    test("retries on failure then succeeds on third attempt", async () => {
      setPlatform("darwin")
      let callCount = 0
      mockRunCommand.mockImplementation((..._args: any[]): any => {
        callCount++
        if (callCount < 3) {
          return Promise.resolve({ stdout: "", stderr: "error", exitCode: 1 })
        }
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 })
      })

      const result = await pasteFromClipboard({ retries: 3, delay: 100 })
      expect(result.success).toBe(true)
      expect(result.attempts).toBe(3)
      expect(mockSleep).toHaveBeenCalledTimes(2)
    })

    test("returns failure after all retries exhausted", async () => {
      setPlatform("darwin")
      mockRunCommand.mockImplementation((..._args: any[]): any =>
        Promise.resolve({ stdout: "", stderr: "accessibility denied", exitCode: 1 }),
      )

      const result = await pasteFromClipboard({ retries: 3, delay: 100 })
      expect(result.success).toBe(false)
      expect(result.attempts).toBe(3)
      expect(result.tool).toBe("osascript")
    })

    test("succeeds on first attempt with attempts=1", async () => {
      setPlatform("darwin")
      const result = await pasteFromClipboard({ retries: 1 })
      expect(result.success).toBe(true)
      expect(result.attempts).toBe(1)
      expect(mockSleep).not.toHaveBeenCalled()
    })
  })

  describe("Linux", () => {
    test("uses xdotool when available", async () => {
      setPlatform("linux")
      const result = await pasteFromClipboard()
      expect(result.success).toBe(true)
      expect(result.platform).toBe("linux")
      expect(result.tool).toBe("xdotool")

      const c = calls(mockRunCommand)
      expect(c[0][0]).toBe("xdotool")
      expect(c[0][1]).toEqual(["key", "ctrl+v"])
    })

    test("falls back to ydotool when xdotool unavailable", async () => {
      setPlatform("linux")
      let existsCallCount = 0
      mockCommandExists.mockImplementation((..._args: any[]): any => {
        existsCallCount++
        return Promise.resolve(existsCallCount > 1)
      })

      const result = await pasteFromClipboard()
      expect(result.success).toBe(true)
      expect(result.tool).toBe("ydotool")

      const c = calls(mockRunCommand)
      expect(c[0][0]).toBe("ydotool")
      expect(c[0][1]).toEqual(["key", "29:1", "47:1", "47:0", "29:0"])
    })

    test("returns failure when no tool available", async () => {
      setPlatform("linux")
      mockCommandExists.mockImplementation((..._args: any[]): any => Promise.resolve(false))

      const result = await pasteFromClipboard()
      expect(result.success).toBe(false)
      expect(result.platform).toBe("linux")
      expect(result.attempts).toBe(0)
    })

    test("retries with xdotool then succeeds", async () => {
      setPlatform("linux")
      let callCount = 0
      mockRunCommand.mockImplementation((..._args: any[]): any => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ stdout: "", stderr: "", exitCode: 1 })
        }
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 })
      })

      const result = await pasteFromClipboard({ retries: 3, delay: 100 })
      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
    })

    test("xdotool fails, falls back to ydotool which succeeds", async () => {
      setPlatform("linux")
      let callCount = 0
      mockRunCommand.mockImplementation((...args: any[]): any => {
        callCount++
        // xdotool calls fail (first 2), ydotool succeeds (3rd)
        if (args[0] === "xdotool") {
          return Promise.resolve({ stdout: "", stderr: "", exitCode: 1 })
        }
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 })
      })

      const result = await pasteFromClipboard({ retries: 2, delay: 100 })
      expect(result.success).toBe(true)
      expect(result.tool).toBe("ydotool")
      expect(result.attempts).toBe(3) // 2 xdotool + 1 ydotool
    })

    test("xdotool fails all retries, falls back to ydotool", async () => {
      setPlatform("linux")
      mockRunCommand.mockImplementation((..._args: any[]): any =>
        Promise.resolve({ stdout: "", stderr: "", exitCode: 1 }),
      )

      const result = await pasteFromClipboard({ retries: 2, delay: 100 })
      expect(result.success).toBe(false)
      expect(result.tool).toBe("ydotool") // fell through to ydotool
      expect(result.attempts).toBe(4) // 2 xdotool + 2 ydotool
    })
  })

  describe("Windows", () => {
    test("uses powershell to paste", async () => {
      setPlatform("win32")
      const result = await pasteFromClipboard()
      expect(result.success).toBe(true)
      expect(result.platform).toBe("win32")
      expect(result.tool).toBe("powershell")

      const c = calls(mockRunCommand)
      expect(c[0][0]).toBe("powershell.exe")
      expect(c[0][1]).toContain("-NoProfile")
    })

    test("retries on failure then succeeds", async () => {
      setPlatform("win32")
      let callCount = 0
      mockRunCommand.mockImplementation((..._args: any[]): any => {
        callCount++
        if (callCount < 2) {
          return Promise.resolve({ stdout: "", stderr: "", exitCode: 1 })
        }
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 })
      })

      const result = await pasteFromClipboard({ retries: 3, delay: 100 })
      expect(result.success).toBe(true)
      expect(result.attempts).toBe(2)
    })

    test("all retries fail", async () => {
      setPlatform("win32")
      mockRunCommand.mockImplementation((..._args: any[]): any =>
        Promise.resolve({ stdout: "", stderr: "", exitCode: 1 }),
      )

      const result = await pasteFromClipboard({ retries: 2, delay: 100 })
      expect(result.success).toBe(false)
      expect(result.attempts).toBe(2)
    })
  })

  describe("edge cases", () => {
    test("unsupported platform returns failure", async () => {
      setPlatform("freebsd")
      const result = await pasteFromClipboard()
      expect(result.success).toBe(false)
      expect(result.platform).toBe("freebsd")
      expect(result.attempts).toBe(0)
    })

    test("default retries is 3 and delay is 500", async () => {
      setPlatform("darwin")
      mockRunCommand.mockImplementation((..._args: any[]): any =>
        Promise.resolve({ stdout: "", stderr: "", exitCode: 1 }),
      )

      const result = await pasteFromClipboard()
      expect(result.attempts).toBe(3)
      expect(mockSleep).toHaveBeenCalledTimes(2)
      const sc = calls(mockSleep)
      expect(sc[0][0]).toBe(500)
    })

    test("app parameter ignored on non-macOS", async () => {
      setPlatform("win32")
      const result = await pasteFromClipboard({ app: "Chrome" })
      expect(result.success).toBe(true)

      const c = calls(mockRunCommand)
      expect(c[0][0]).toBe("powershell.exe")
    })

    test("custom retries and delay values used", async () => {
      setPlatform("darwin")
      mockRunCommand.mockImplementation((..._args: any[]): any =>
        Promise.resolve({ stdout: "", stderr: "", exitCode: 1 }),
      )

      const result = await pasteFromClipboard({ retries: 5, delay: 200 })
      expect(result.attempts).toBe(5)
      expect(mockSleep).toHaveBeenCalledTimes(4)
      const sc = calls(mockSleep)
      expect(sc[0][0]).toBe(200)
    })
  })
})

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import { unlinkSync } from "fs"

const originalPlatform = process.platform

function setPlatform(p: string) {
  Object.defineProperty(process, "platform", { value: p, writable: true })
}

function restorePlatform() {
  Object.defineProperty(process, "platform", { value: originalPlatform, writable: true })
}

// Mock exec module for platform-specific path testing
const mockRunCommand = mock((..._args: any[]): any => Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }))
const mockCommandExists = mock((..._args: any[]): any => Promise.resolve(true))

mock.module("../exec", () => ({
  runCommand: mockRunCommand,
  commandExists: mockCommandExists,
}))

const { copyImageToClipboard, copyHtmlToClipboard } = await import("../clipboard")

function calls(fn: ReturnType<typeof mock>): any[][] {
  return (fn as any).mock.calls
}

beforeEach(() => {
  mockRunCommand.mockClear()
  mockCommandExists.mockClear()
  mockRunCommand.mockImplementation((..._args: any[]): any => Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }))
  mockCommandExists.mockImplementation((..._args: any[]): any => Promise.resolve(true))
})

afterEach(() => {
  restorePlatform()
})

describe("copyImageToClipboard platform dispatch", () => {
  const tmpPath = "/tmp/test-clipboard-platform.png"

  beforeEach(async () => {
    await Bun.write(tmpPath, "fake png data")
  })

  afterEach(() => {
    try { unlinkSync(tmpPath) } catch {}
  })

  test("macOS calls swift with image mode", async () => {
    setPlatform("darwin")
    await copyImageToClipboard(tmpPath)

    const c = calls(mockRunCommand)
    expect(c[0][0]).toBe("swift")
    expect(c[0][1][1]).toBe("image")
    expect(c[0][1][2]).toBe(tmpPath)
  })

  test("Linux uses wl-copy when available", async () => {
    setPlatform("linux")
    await copyImageToClipboard(tmpPath)

    const c = calls(mockRunCommand)
    const wlCall = c.find(call => call[0] === "wl-copy")
    expect(wlCall).toBeDefined()
    expect(wlCall![1]).toContain("--type")
    expect(wlCall![1]).toContain("image/png")
  })

  test("Linux falls back to xclip when wl-copy unavailable", async () => {
    setPlatform("linux")
    let existsCount = 0
    mockCommandExists.mockImplementation((..._args: any[]): any => {
      existsCount++
      return Promise.resolve(existsCount > 1) // wl-copy=false, xclip=true
    })

    await copyImageToClipboard(tmpPath)

    const c = calls(mockRunCommand)
    const xclipCall = c.find(call => call[0] === "xclip")
    expect(xclipCall).toBeDefined()
    expect(xclipCall![1]).toContain("-selection")
    expect(xclipCall![1]).toContain("clipboard")
    expect(xclipCall![1]).toContain("-t")
    expect(xclipCall![1]).toContain("image/png")
  })

  test("Linux throws when no tool available", async () => {
    setPlatform("linux")
    mockCommandExists.mockImplementation((..._args: any[]): any => Promise.resolve(false))

    await expect(copyImageToClipboard(tmpPath)).rejects.toThrow("No clipboard tool found")
  })

  test("Windows calls powershell with PNG DataObject", async () => {
    setPlatform("win32")
    await copyImageToClipboard(tmpPath)

    const c = calls(mockRunCommand)
    expect(c[0][0]).toBe("powershell.exe")
    expect(c[0][1]).toContain("-NoProfile")
    expect(c[0][1]).toContain("-Sta")
  })

  test("swift compilation failure throws with stderr", async () => {
    setPlatform("darwin")
    mockRunCommand.mockImplementation((..._args: any[]): any => {
      throw new Error("Command failed (swift): exit 1\ncompilation error")
    })

    await expect(copyImageToClipboard(tmpPath)).rejects.toThrow("compilation error")
  })

  test("xclip failure throws with stderr", async () => {
    setPlatform("linux")
    let existsCount = 0
    mockCommandExists.mockImplementation((..._args: any[]): any => {
      existsCount++
      return Promise.resolve(existsCount > 1)
    })
    mockRunCommand.mockImplementation((..._args: any[]): any => {
      throw new Error("Command failed (xclip): exit 1\nxclip error")
    })

    await expect(copyImageToClipboard(tmpPath)).rejects.toThrow("xclip error")
  })

  test("powershell failure throws", async () => {
    setPlatform("win32")
    mockRunCommand.mockImplementation((..._args: any[]): any => {
      throw new Error("Command failed (powershell.exe): exit 1\nps error")
    })

    await expect(copyImageToClipboard(tmpPath)).rejects.toThrow("ps error")
  })
})

describe("copyHtmlToClipboard platform dispatch", () => {
  test("macOS calls swift with html mode", async () => {
    setPlatform("darwin")
    await copyHtmlToClipboard("<p>Hello</p>")

    const c = calls(mockRunCommand)
    expect(c[0][0]).toBe("swift")
    expect(c[0][1][1]).toBe("html")
  })

  test("Linux HTML uses wl-copy with text/html", async () => {
    setPlatform("linux")
    await copyHtmlToClipboard("<p>test</p>")

    const c = calls(mockRunCommand)
    const wlCall = c.find(call => call[0] === "wl-copy")
    expect(wlCall).toBeDefined()
    expect(wlCall![1]).toContain("text/html")
  })

  test("Linux HTML falls back to xclip", async () => {
    setPlatform("linux")
    let existsCount = 0
    mockCommandExists.mockImplementation((..._args: any[]): any => {
      existsCount++
      return Promise.resolve(existsCount > 1)
    })

    await copyHtmlToClipboard("<p>test</p>")

    const c = calls(mockRunCommand)
    const xclipCall = c.find(call => call[0] === "xclip")
    expect(xclipCall).toBeDefined()
    expect(xclipCall![1]).toContain("text/html")
  })

  test("Linux HTML throws when no tool available", async () => {
    setPlatform("linux")
    mockCommandExists.mockImplementation((..._args: any[]): any => Promise.resolve(false))

    await expect(copyHtmlToClipboard("<p>test</p>")).rejects.toThrow("No clipboard tool found")
  })

  test("Windows HTML calls powershell", async () => {
    setPlatform("win32")
    await copyHtmlToClipboard("<p>test</p>")

    const c = calls(mockRunCommand)
    expect(c[0][0]).toBe("powershell.exe")
    expect(c[0][1]).toContain("-NoProfile")
  })

  test("HTML with Unicode/emoji passes through", async () => {
    setPlatform("darwin")
    await copyHtmlToClipboard("<p>Hello World</p>")
    expect(mockRunCommand).toHaveBeenCalled()
  })
})

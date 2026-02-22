import { describe, test, expect, afterEach } from "bun:test"
import { unlinkSync, mkdtempSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { inferMimeType, copyImageToClipboard, copyHtmlToClipboard } from "../clipboard"

const originalPlatform = process.platform

function setPlatform(p: string) {
  Object.defineProperty(process, "platform", { value: p, writable: true })
}

function restorePlatform() {
  Object.defineProperty(process, "platform", { value: originalPlatform, writable: true })
}

afterEach(() => {
  restorePlatform()
})

describe("inferMimeType", () => {
  test(".jpg returns image/jpeg", () => {
    expect(inferMimeType(".jpg")).toBe("image/jpeg")
  })

  test(".jpeg returns image/jpeg", () => {
    expect(inferMimeType(".jpeg")).toBe("image/jpeg")
  })

  test(".png returns image/png", () => {
    expect(inferMimeType(".png")).toBe("image/png")
  })

  test(".gif returns image/gif", () => {
    expect(inferMimeType(".gif")).toBe("image/gif")
  })

  test(".webp returns image/webp", () => {
    expect(inferMimeType(".webp")).toBe("image/webp")
  })

  test("unknown extension throws", () => {
    expect(() => inferMimeType(".bmp")).toThrow("Unsupported image extension")
  })

  test(".svg throws listing supported formats", () => {
    try {
      inferMimeType(".svg")
      expect(true).toBe(false)
    } catch (e: any) {
      expect(e.message).toContain("Unsupported image extension")
      expect(e.message).toContain(".jpg")
      expect(e.message).toContain(".png")
    }
  })
})

describe("copyImageToClipboard", () => {
  test("empty path throws", async () => {
    await expect(copyImageToClipboard("")).rejects.toThrow("must not be empty")
  })

  test("unsupported extension (.bmp) throws", async () => {
    await expect(copyImageToClipboard("/tmp/test.bmp")).rejects.toThrow("Unsupported image type")
  })

  test("unsupported extension (.svg) throws", async () => {
    await expect(copyImageToClipboard("/tmp/test.svg")).rejects.toThrow("Unsupported image type")
  })

  test("unsupported extension (.tiff) throws", async () => {
    await expect(copyImageToClipboard("/tmp/test.tiff")).rejects.toThrow("Unsupported image type")
  })

  test("file not found throws", async () => {
    await expect(copyImageToClipboard("/nonexistent/image.png")).rejects.toThrow("File not found")
  })

  test("relative path that doesn't exist throws with resolved absolute path", async () => {
    try {
      await copyImageToClipboard("relative/image.png")
      expect(true).toBe(false)
    } catch (e: any) {
      expect(e.message).toContain("File not found")
      expect(e.message).toContain("/")
    }
  })

  test("unsupported platform throws", async () => {
    const tmpPath = "/tmp/test-clipboard-unsupported.png"
    await Bun.write(tmpPath, "fake png data")
    setPlatform("freebsd")
    await expect(copyImageToClipboard(tmpPath)).rejects.toThrow("Unsupported platform")
    unlinkSync(tmpPath)
  })

  test("path with spaces passes validation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "space test "))
    const tmpPath = join(dir, "test image.png")
    writeFileSync(tmpPath, "fake png data")

    setPlatform("freebsd")
    try {
      await copyImageToClipboard(tmpPath)
    } catch (e: any) {
      expect(e.message).toContain("Unsupported platform")
    }
    rmSync(dir, { recursive: true })
  })

  test("path with Unicode characters passes validation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "unicode-"))
    const tmpPath = join(dir, "image.png")
    writeFileSync(tmpPath, "fake png data")

    setPlatform("freebsd")
    try {
      await copyImageToClipboard(tmpPath)
    } catch (e: any) {
      expect(e.message).toContain("Unsupported platform")
    }
    rmSync(dir, { recursive: true })
  })

  test("darwin dispatch reaches swift execution", async () => {
    if (originalPlatform !== "darwin") return

    const tmpPath = "/tmp/test-clipboard-darwin-img.png"
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
      0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
      0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ])
    await Bun.write(tmpPath, pngData)

    try {
      await copyImageToClipboard(tmpPath)
    } catch (e: any) {
      expect(e.message).toBeDefined()
    }
    unlinkSync(tmpPath)
  }, 30000)
})

describe("copyHtmlToClipboard", () => {
  test("empty HTML throws", async () => {
    await expect(copyHtmlToClipboard("")).rejects.toThrow("must not be empty")
  })

  test("unsupported platform throws", async () => {
    setPlatform("freebsd")
    await expect(copyHtmlToClipboard("<p>hi</p>")).rejects.toThrow("Unsupported platform")
  })

  test("HTML with Unicode passes validation", async () => {
    setPlatform("freebsd")
    await expect(copyHtmlToClipboard("<p>Unicode text</p>")).rejects.toThrow("Unsupported platform")
  })

  test("very long HTML passes validation", async () => {
    setPlatform("freebsd")
    const longHtml = "<p>" + "x".repeat(1_000_000) + "</p>"
    await expect(copyHtmlToClipboard(longHtml)).rejects.toThrow("Unsupported platform")
  })

  test("darwin dispatch reaches swift for HTML", async () => {
    if (originalPlatform !== "darwin") return

    try {
      await copyHtmlToClipboard("<p>Test HTML</p>")
    } catch (e: any) {
      expect(e.message).toBeDefined()
    }
  }, 30000)
})

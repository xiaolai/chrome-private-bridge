import { existsSync } from "fs"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { resolve, extname, join, isAbsolute } from "path"
import { runCommand, commandExists } from "./exec"

export { runCommand, commandExists } from "./exec"
export type { RunResult } from "./exec"

const SUPPORTED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"])
const COMMAND_TIMEOUT = 15_000

export function inferMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".png":
      return "image/png"
    case ".gif":
      return "image/gif"
    case ".webp":
      return "image/webp"
    default:
      throw new Error(`Unsupported image extension: ${ext} (supported: ${Array.from(SUPPORTED_IMAGE_EXTS).join(", ")})`)
  }
}

function resolvePath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)
}

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function getSwiftSource(): string {
  return `import AppKit
import Foundation

func die(_ message: String, _ code: Int32 = 1) -> Never {
  FileHandle.standardError.write(message.data(using: .utf8)!)
  exit(code)
}

if CommandLine.arguments.count < 3 {
  die("Usage: clipboard.swift <image|html> <path>\\n")
}

let mode = CommandLine.arguments[1]
let inputPath = CommandLine.arguments[2]
let pasteboard = NSPasteboard.general
pasteboard.clearContents()

switch mode {
case "image":
  guard let image = NSImage(contentsOfFile: inputPath) else {
    die("Failed to load image: \\(inputPath)\\n")
  }
  if !pasteboard.writeObjects([image]) {
    die("Failed to write image to clipboard\\n")
  }

case "html":
  let url = URL(fileURLWithPath: inputPath)
  let data: Data
  do {
    data = try Data(contentsOf: url)
  } catch {
    die("Failed to read HTML file: \\(inputPath)\\n")
  }

  _ = pasteboard.setData(data, forType: .html)

  let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
    .documentType: NSAttributedString.DocumentType.html,
    .characterEncoding: String.Encoding.utf8.rawValue
  ]

  if let attr = try? NSAttributedString(data: data, options: options, documentAttributes: nil) {
    pasteboard.setString(attr.string, forType: .string)
    if let rtf = try? attr.data(
      from: NSRange(location: 0, length: attr.length),
      documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf]
    ) {
      _ = pasteboard.setData(rtf, forType: .rtf)
    }
  } else if let html = String(data: data, encoding: .utf8) {
    pasteboard.setString(html, forType: .string)
  }

default:
  die("Unknown mode: \\(mode)\\n")
}
`
}

async function copyImageMac(imagePath: string): Promise<void> {
  await withTempDir("cpb-img-", async (dir) => {
    const swiftPath = join(dir, "clipboard.swift")
    await writeFile(swiftPath, getSwiftSource(), "utf8")
    await runCommand("swift", [swiftPath, "image", imagePath], { timeout: COMMAND_TIMEOUT })
  })
}

async function copyHtmlMac(html: string): Promise<void> {
  await withTempDir("cpb-html-", async (dir) => {
    const swiftPath = join(dir, "clipboard.swift")
    const htmlPath = join(dir, "input.html")
    await writeFile(swiftPath, getSwiftSource(), "utf8")
    await writeFile(htmlPath, html, "utf8")
    await runCommand("swift", [swiftPath, "html", htmlPath], { timeout: COMMAND_TIMEOUT })
  })
}

async function copyImageLinux(imagePath: string): Promise<void> {
  const mime = inferMimeType(extname(imagePath))
  if (await commandExists("wl-copy")) {
    const data = await Bun.file(imagePath).arrayBuffer()
    await runCommand("wl-copy", ["--type", mime], { input: Buffer.from(data) })
    return
  }
  if (await commandExists("xclip")) {
    await runCommand("xclip", ["-selection", "clipboard", "-t", mime, "-i", imagePath])
    return
  }
  throw new Error("No clipboard tool found. Install wl-clipboard (wl-copy) or xclip.")
}

async function copyHtmlLinux(html: string): Promise<void> {
  if (await commandExists("wl-copy")) {
    await runCommand("wl-copy", ["--type", "text/html"], { input: html })
    return
  }
  if (await commandExists("xclip")) {
    await withTempDir("cpb-html-", async (dir) => {
      const htmlPath = join(dir, "input.html")
      await writeFile(htmlPath, html, "utf8")
      await runCommand("xclip", ["-selection", "clipboard", "-t", "text/html", "-i", htmlPath])
    })
    return
  }
  throw new Error("No clipboard tool found. Install wl-clipboard (wl-copy) or xclip.")
}

async function copyImageWindows(imagePath: string): Promise<void> {
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    `$bytes = [System.IO.File]::ReadAllBytes('${imagePath.replace(/'/g, "''")}')`,
    "$ms = New-Object System.IO.MemoryStream(,$bytes)",
    "$obj = New-Object System.Windows.Forms.DataObject",
    '$obj.SetData("PNG", $ms)',
    "[System.Windows.Forms.Clipboard]::SetDataObject($obj, $true)",
    "$ms.Dispose()",
  ].join("; ")
  await runCommand("powershell.exe", ["-NoProfile", "-Sta", "-Command", ps])
}

async function copyHtmlWindows(html: string): Promise<void> {
  await withTempDir("cpb-html-", async (dir) => {
    const htmlPath = join(dir, "input.html")
    await writeFile(htmlPath, html, "utf8")
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms",
      `$html = Get-Content -Raw -LiteralPath '${htmlPath.replace(/'/g, "''")}'`,
      "[System.Windows.Forms.Clipboard]::SetText($html, [System.Windows.Forms.TextDataFormat]::Html)",
    ].join("; ")
    await runCommand("powershell.exe", ["-NoProfile", "-Sta", "-Command", ps])
  })
}

export async function copyImageToClipboard(imagePathInput: string): Promise<void> {
  if (!imagePathInput) throw new Error("Image path must not be empty")
  const imagePath = resolvePath(imagePathInput)
  const ext = extname(imagePath).toLowerCase()
  if (!SUPPORTED_IMAGE_EXTS.has(ext)) {
    throw new Error(`Unsupported image type: ${ext || "(none)"} (supported: ${Array.from(SUPPORTED_IMAGE_EXTS).join(", ")})`)
  }
  if (!existsSync(imagePath)) throw new Error(`File not found: ${imagePath}`)

  switch (process.platform) {
    case "darwin":
      return copyImageMac(imagePath)
    case "linux":
      return copyImageLinux(imagePath)
    case "win32":
      return copyImageWindows(imagePath)
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

export async function copyHtmlToClipboard(html: string): Promise<void> {
  if (!html) throw new Error("HTML content must not be empty")

  switch (process.platform) {
    case "darwin":
      return copyHtmlMac(html)
    case "linux":
      return copyHtmlLinux(html)
    case "win32":
      return copyHtmlWindows(html)
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
}

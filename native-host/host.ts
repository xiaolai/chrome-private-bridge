import { spawnSync } from "child_process"

const ALLOWED_COMMANDS = new Set(["osascript", "pbcopy", "pbpaste"])

function readMessage(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const header = Buffer.alloc(4)
    let bytesRead = 0

    process.stdin.on("readable", function onReadable() {
      while (bytesRead < 4) {
        const chunk = process.stdin.read(4 - bytesRead) as Buffer | null
        if (!chunk) return
        chunk.copy(header, bytesRead)
        bytesRead += chunk.length
      }
      process.stdin.removeListener("readable", onReadable)

      const length = header.readUInt32LE(0)
      const body = process.stdin.read(length) as Buffer | null
      if (body) {
        resolve(JSON.parse(body.toString()))
      } else {
        process.stdin.once("readable", () => {
          const body = process.stdin.read(length) as Buffer
          resolve(JSON.parse(body.toString()))
        })
      }
    })
  })
}

function sendMessage(msg: unknown): void {
  const json = JSON.stringify(msg)
  const header = Buffer.alloc(4)
  header.writeUInt32LE(json.length, 0)
  process.stdout.write(header)
  process.stdout.write(json)
}

function paste(): { success: boolean; error?: string } {
  const platform = process.platform
  if (platform === "darwin") {
    const result = spawnSync("osascript", [
      "-e", 'tell application "Google Chrome" to activate',
      "-e", "delay 0.3",
      "-e", 'tell application "System Events" to keystroke "v" using command down',
    ])
    if (result.status !== 0) {
      return { success: false, error: result.stderr?.toString() }
    }
    return { success: true }
  }
  if (platform === "linux") {
    const result = spawnSync("xdotool", ["key", "ctrl+v"])
    if (result.status !== 0) {
      return { success: false, error: "xdotool failed" }
    }
    return { success: true }
  }
  return { success: false, error: `Unsupported platform: ${platform}` }
}

function clipboardWriteImage(base64: string): { success: boolean; error?: string } {
  if (process.platform !== "darwin") {
    return { success: false, error: "Image clipboard only supported on macOS" }
  }

  const swift = `
import AppKit
let data = Data(base64Encoded: CommandLine.arguments[1])!
let image = NSImage(data: data)!
let pb = NSPasteboard.general
pb.clearContents()
pb.writeObjects([image])
`
  const tmpFile = `/tmp/chrome-bridge-clip-${Date.now()}.swift`
  Bun.write(tmpFile, swift)

  const result = spawnSync("swift", [tmpFile, base64])
  spawnSync("rm", [tmpFile])

  if (result.status !== 0) {
    return { success: false, error: result.stderr?.toString() }
  }
  return { success: true }
}

function exec(command: string, args: string[]): { success: boolean; stdout?: string; error?: string } {
  if (!ALLOWED_COMMANDS.has(command)) {
    return { success: false, error: `Command not allowed: ${command}` }
  }
  const result = spawnSync(command, args, { timeout: 10000 })
  if (result.status !== 0) {
    return { success: false, error: result.stderr?.toString() }
  }
  return { success: true, stdout: result.stdout?.toString() }
}

async function main() {
  while (true) {
    try {
      const msg = await readMessage()

      let response: unknown
      switch (msg.command) {
        case "paste":
          response = paste()
          break
        case "clipboard.writeImage":
          response = clipboardWriteImage(msg.base64 as string)
          break
        case "exec":
          response = exec(msg.executable as string, (msg.args as string[]) ?? [])
          break
        default:
          response = { success: false, error: `Unknown command: ${msg.command}` }
      }

      sendMessage(response)
    } catch (err: any) {
      sendMessage({ success: false, error: err.message })
    }
  }
}

main()

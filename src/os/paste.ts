import { log } from "../logger"
import { runCommand, commandExists } from "./exec"
import { sleep } from "../utils"

export interface PasteResult {
  success: boolean
  platform: string
  tool?: string
  attempts: number
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

async function pasteMac(retries: number, delay: number, app?: string): Promise<PasteResult> {
  for (let i = 1; i <= retries; i++) {
    const script = app
      ? `tell application "${escapeAppleScript(app)}"
  activate
end tell
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`
      : `tell application "System Events"
  keystroke "v" using command down
end tell`

    const result = await runCommand("osascript", ["-e", script], { allowNonZeroExit: true })
    if (result.exitCode === 0) {
      return { success: true, platform: "darwin", tool: "osascript", attempts: i }
    }

    if (result.stderr.trim()) {
      log("warn", "paste.attempt.failed", { attempt: i, retries, error: result.stderr.trim() })
    }

    if (i < retries) {
      await sleep(delay)
    }
  }
  return { success: false, platform: "darwin", tool: "osascript", attempts: retries }
}

async function pasteLinux(retries: number, delay: number): Promise<PasteResult> {
  const tools = [
    { cmd: "xdotool", args: ["key", "ctrl+v"] },
    { cmd: "ydotool", args: ["key", "29:1", "47:1", "47:0", "29:0"] },
  ]

  let lastTool: string | undefined
  let totalAttempts = 0

  for (const tool of tools) {
    if (!(await commandExists(tool.cmd))) continue
    lastTool = tool.cmd

    for (let i = 1; i <= retries; i++) {
      totalAttempts++
      const result = await runCommand(tool.cmd, tool.args, { allowNonZeroExit: true })
      if (result.exitCode === 0) {
        return { success: true, platform: "linux", tool: tool.cmd, attempts: totalAttempts }
      }

      if (i < retries) {
        log("warn", "paste.attempt.failed", { attempt: i, retries, tool: tool.cmd })
        await sleep(delay)
      }
    }
    // Tool exhausted retries, try next tool
    log("warn", "paste.tool.exhausted", { tool: tool.cmd, retries })
  }

  return { success: false, platform: "linux", tool: lastTool, attempts: totalAttempts }
}

async function pasteWindows(retries: number, delay: number): Promise<PasteResult> {
  const ps = 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")'

  for (let i = 1; i <= retries; i++) {
    const result = await runCommand("powershell.exe", ["-NoProfile", "-Command", ps], { allowNonZeroExit: true })
    if (result.exitCode === 0) {
      return { success: true, platform: "win32", tool: "powershell", attempts: i }
    }

    if (i < retries) {
      log("warn", "paste.attempt.failed", { attempt: i, retries })
      await sleep(delay)
    }
  }
  return { success: false, platform: "win32", tool: "powershell", attempts: retries }
}

export async function pasteFromClipboard(options?: {
  retries?: number
  delay?: number
  app?: string
}): Promise<PasteResult> {
  const retries = options?.retries ?? 3
  const delay = options?.delay ?? 500

  switch (process.platform) {
    case "darwin":
      return pasteMac(retries, delay, options?.app)
    case "linux":
      return pasteLinux(retries, delay)
    case "win32":
      return pasteWindows(retries, delay)
    default:
      return { success: false, platform: process.platform, attempts: 0 }
  }
}

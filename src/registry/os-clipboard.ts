import { z } from "zod/v4"
import { defineCommand } from "./define"
import { copyImageToClipboard, copyHtmlToClipboard } from "../os/clipboard"
import { pasteFromClipboard } from "../os/paste"

defineCommand({
  name: "os_clipboard_write",
  description: "Copy an image file or HTML content to the system clipboard. Use this before os_paste to paste content into applications that detect synthetic events.",
  extensionCommand: "os.clipboard.write",
  params: z.object({
    imagePath: z.string().optional().describe("Absolute path to image file (.jpg, .png, .gif, .webp)"),
    html: z.string().optional().describe("HTML content to copy as rich text"),
  }).refine(d => !!(d.imagePath || d.html), { message: "Provide imagePath or html" }),
  handler: async (params) => {
    const { imagePath, html } = params as { imagePath?: string; html?: string }
    if (imagePath) {
      await copyImageToClipboard(imagePath)
      return { copied: "image", path: imagePath }
    }
    await copyHtmlToClipboard(html!)
    return { copied: "html", length: html!.length }
  },
  annotations: { destructiveHint: true },
})

defineCommand({
  name: "os_paste",
  description: "Send a real OS-level paste keystroke (Cmd+V on macOS, Ctrl+V on Linux/Windows). Pastes whatever is on the system clipboard into the frontmost application.",
  extensionCommand: "os.paste",
  params: z.object({
    retries: z.number().min(1).max(10).optional().describe("Number of retry attempts (default: 3)"),
    delay: z.number().min(100).max(5000).optional().describe("Delay between retries in ms (default: 500)"),
    app: z.string().optional().describe("macOS only: application name to activate before pasting"),
  }),
  handler: async (params) => {
    const { retries, delay, app } = params as { retries?: number; delay?: number; app?: string }
    return pasteFromClipboard({ retries, delay, app })
  },
  annotations: { destructiveHint: true },
})

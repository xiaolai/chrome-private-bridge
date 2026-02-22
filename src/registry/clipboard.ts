import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_clipboard_write",
  description: "Write text, HTML, or an image to the clipboard",
  extensionCommand: "clipboard.write",
  params: z.object({
    text: z.string().optional().describe("Plain text to write to clipboard"),
    html: z.string().optional().describe("HTML content to write to clipboard"),
    imageBase64: z.string().optional().describe("Base64-encoded PNG image to write to clipboard"),
  }),
})

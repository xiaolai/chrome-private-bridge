import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_press",
  description: "Press a keyboard key, optionally with modifier keys",
  extensionCommand: "press",
  params: z.object({
    key: z.string().describe("Key to press (e.g. 'Enter', 'Tab', 'a')"),
    modifiers: z.array(z.string()).optional().describe("Modifier keys: 'shift', 'ctrl', 'alt', 'meta'"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { destructiveHint: true },
})

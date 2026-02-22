import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_type",
  description: "Type text into an element matching a CSS selector",
  extensionCommand: "type",
  params: z.object({
    selector: z.string().describe("CSS selector of the input element"),
    text: z.string().describe("Text to type into the element"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { destructiveHint: true },
})

import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_click",
  description: "Click an element matching a CSS selector",
  extensionCommand: "click",
  params: z.object({
    selector: z.string().describe("CSS selector of the element to click"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { destructiveHint: true },
})

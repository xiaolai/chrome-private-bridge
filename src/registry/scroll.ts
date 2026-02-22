import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_scroll",
  description: "Scroll the page to absolute coordinates or scroll an element into view",
  extensionCommand: "scroll",
  params: z.object({
    x: z.number().optional().describe("Horizontal scroll position in pixels"),
    y: z.number().optional().describe("Vertical scroll position in pixels"),
    selector: z.string().optional().describe("CSS selector of element to scroll into view"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
})

import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_screenshot",
  description: "Capture a screenshot of the visible area of a tab",
  extensionCommand: "screenshot",
  params: z.object({
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
    selector: z.string().optional().describe("CSS selector of element to capture (currently captures full visible area)"),
  }),
  annotations: { readOnlyHint: true },
})

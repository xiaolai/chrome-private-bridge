import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_wait_for_element",
  description: "Wait for an element matching a CSS selector to appear in the DOM",
  extensionCommand: "wait",
  params: z.object({
    selector: z.string().describe("CSS selector to wait for"),
    timeout: z.number().optional().describe("Maximum wait time in milliseconds (default 10000)"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { readOnlyHint: true },
})

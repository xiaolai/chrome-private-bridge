import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_navigate",
  description: "Navigate a browser tab to a URL",
  extensionCommand: "navigate",
  params: z.object({
    url: z.string().describe("The URL to navigate to"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { openWorldHint: true },
})

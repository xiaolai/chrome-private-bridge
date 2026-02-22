import { z } from "zod/v4"
import { defineCommand } from "./define"

defineCommand({
  name: "browser_tab_list",
  description: "List all open browser tabs with their IDs, URLs, titles, and active state",
  extensionCommand: "tab.list",
  params: z.object({}),
  annotations: { readOnlyHint: true },
})

defineCommand({
  name: "browser_tab_create",
  description: "Create a new browser tab, optionally navigating to a URL",
  extensionCommand: "tab.create",
  params: z.object({
    url: z.string().optional().describe("URL to open in the new tab"),
  }),
})

export default defineCommand({
  name: "browser_tab_close",
  description: "Close a browser tab by its ID",
  extensionCommand: "tab.close",
  params: z.object({
    tabId: z.number().describe("ID of the tab to close"),
  }),
  annotations: { destructiveHint: true },
})

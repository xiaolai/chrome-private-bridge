import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_file_set",
  description: "Set files on a file input element using Chrome Debugger protocol",
  extensionCommand: "file.set",
  params: z.object({
    selector: z.string().describe("CSS selector of the file input element"),
    paths: z.array(z.string()).optional().describe("Array of file paths to set"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { destructiveHint: true },
})

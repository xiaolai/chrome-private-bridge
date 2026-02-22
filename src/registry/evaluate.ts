import { z } from "zod/v4"
import { defineCommand } from "./define"

export default defineCommand({
  name: "browser_evaluate",
  description: "Execute a JavaScript expression in the page context. Requires ENABLE_EVALUATE=true.",
  extensionCommand: "evaluate",
  params: z.object({
    expression: z.string().describe("JavaScript expression to evaluate"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { openWorldHint: true },
})

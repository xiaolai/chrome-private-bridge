import { z } from "zod/v4"
import { defineCommand } from "./define"

defineCommand({
  name: "browser_query",
  description: "Query elements matching a CSS selector. Returns tag name, text content, and specified attributes for each match.",
  extensionCommand: "query",
  params: z.object({
    selector: z.string().describe("CSS selector to query"),
    attrs: z.array(z.string()).optional().describe("Attributes to extract (defaults to id, class, href, src, data-testid)"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { readOnlyHint: true },
})

export default defineCommand({
  name: "browser_query_text",
  description: "Get the text content of an element matching a CSS selector",
  extensionCommand: "query.text",
  params: z.object({
    selector: z.string().describe("CSS selector to query"),
    tabId: z.number().optional().describe("Target tab ID (defaults to active tab)"),
  }),
  annotations: { readOnlyHint: true },
})

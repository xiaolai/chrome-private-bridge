import { z } from "zod/v4"
import { defineCommand } from "./define"

defineCommand({
  name: "browser_cookie_get",
  description: "Get cookies for a URL, optionally filtered by name",
  extensionCommand: "cookie.get",
  params: z.object({
    url: z.string().describe("URL to get cookies for"),
    name: z.string().optional().describe("Cookie name to filter by"),
  }),
  annotations: { readOnlyHint: true },
})

export default defineCommand({
  name: "browser_cookie_set",
  description: "Set a cookie",
  extensionCommand: "cookie.set",
  params: z.object({
    cookie: z.record(z.string(), z.unknown()).describe("Cookie object with url, name, value, and optional fields"),
  }),
})

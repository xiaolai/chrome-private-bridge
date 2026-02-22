import { describe, test, expect } from "bun:test"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

if (!process.env.CONFIG_DIR) {
  process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), "chrome-bridge-xpost-test-"))
}

import xPost from "../x-post"
import type { ExecutionContext } from "../../types"

function createMockCtx(): { ctx: ExecutionContext; calls: Array<{ command: string; params: unknown }> } {
  const calls: Array<{ command: string; params: unknown }> = []
  const ctx: ExecutionContext = {
    async send(command: string, params: unknown) {
      calls.push({ command, params })
      return {}
    },
    log() {},
  }
  return { ctx, calls }
}

describe("x-post plugin", () => {
  test("plugin has correct metadata", () => {
    expect(xPost.name).toBe("x")
    expect(xPost.version).toBe("0.1.0")
    expect(xPost.commands.post).toBeDefined()
    expect(xPost.commands.post.description).toContain("tweet")
  })

  test("execute throws when missing text", async () => {
    const { ctx } = createMockCtx()
    await expect(xPost.commands.post.execute({}, ctx)).rejects.toThrow("Missing 'text'")
  })

  test("execute sends navigate, wait, click, type, click sequence", async () => {
    const { ctx, calls } = createMockCtx()
    const result = await xPost.commands.post.execute({ text: "Hello world" }, ctx)

    expect(result).toEqual({ success: true })
    const commands = calls.map(c => c.command)
    expect(commands).toContain("navigate")
    expect(commands).toContain("wait")
    expect(commands).toContain("click")
    expect(commands).toContain("type")
  })

  test("execute handles images", async () => {
    const { ctx, calls } = createMockCtx()
    await xPost.commands.post.execute({ text: "With images", images: ["/tmp/img.png"] }, ctx)

    const fileSetCall = calls.find(c => c.command === "file.set")
    expect(fileSetCall).toBeDefined()
    expect((fileSetCall!.params as any).paths).toEqual(["/tmp/img.png"])
  }, 10000)
})

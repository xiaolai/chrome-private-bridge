import { describe, test, expect } from "bun:test"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

if (!process.env.CONFIG_DIR) {
  process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), "chrome-bridge-wechat-test-"))
}
process.env.ENABLE_EVALUATE = "false"

import wechatPost from "../wechat-post"
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

describe("wechat-post plugin", () => {
  test("plugin has correct metadata", () => {
    expect(wechatPost.name).toBe("wechat")
    expect(wechatPost.version).toBe("0.1.0")
    expect(wechatPost.commands.post).toBeDefined()
    expect(wechatPost.commands.post.description).toContain("WeChat")
  })

  test("execute throws when missing title", async () => {
    const { ctx } = createMockCtx()
    await expect(wechatPost.commands.post.execute({ html: "<p>hi</p>" }, ctx)).rejects.toThrow("Missing 'title' or 'html'")
  })

  test("execute throws when missing html", async () => {
    const { ctx } = createMockCtx()
    await expect(wechatPost.commands.post.execute({ title: "Test" }, ctx)).rejects.toThrow("Missing 'title' or 'html'")
  })

  test("execute throws when evaluate is disabled", async () => {
    const { ctx } = createMockCtx()
    await expect(
      wechatPost.commands.post.execute({ title: "Test", html: "<p>content</p>" }, ctx)
    ).rejects.toThrow("evaluate command is disabled")
  })

  test("execute sends correct command sequence when evaluate enabled", async () => {
    // Temporarily enable evaluate for this test
    const origEval = process.env.ENABLE_EVALUATE
    process.env.ENABLE_EVALUATE = "true"

    // Re-import to pick up config change
    const { config } = await import("../../config")
    const savedVal = config.enableEvaluate
    ;(config as any).enableEvaluate = true

    try {
      const { ctx, calls } = createMockCtx()
      const result = await wechatPost.commands.post.execute({ title: "Test Article", html: "<p>content</p>" }, ctx)

      expect(result).toEqual({ success: true, message: "Article drafted. Review and publish manually." })
      const commands = calls.map(c => c.command)
      expect(commands).toContain("navigate")
      expect(commands).toContain("wait")
      expect(commands).toContain("click")
      expect(commands).toContain("type")
      expect(commands).toContain("evaluate")
    } finally {
      ;(config as any).enableEvaluate = savedVal
      process.env.ENABLE_EVALUATE = origEval
    }
  })
})

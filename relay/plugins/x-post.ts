import type { BridgePlugin, ExecutionContext } from "../types"

const xPost: BridgePlugin = {
  name: "x",
  version: "0.1.0",
  commands: {
    post: {
      description: "Post a tweet to X/Twitter",
      async execute(params: unknown, ctx: ExecutionContext) {
        const p = params as { text: string; images?: string[] }
        if (!p.text) throw new Error("Missing 'text' parameter")

        await ctx.send("navigate", { url: "https://x.com/compose/post" })
        await ctx.send("wait", { selector: "[data-testid='tweetTextarea_0']", timeout: 10000 })
        await sleep(500)

        await ctx.send("click", { selector: "[data-testid='tweetTextarea_0']" })
        await ctx.send("type", { selector: "[data-testid='tweetTextarea_0']", text: p.text })

        if (p.images?.length) {
          for (const img of p.images) {
            const isBase64 = img.startsWith("data:") || img.length > 260
            if (isBase64) {
              await ctx.send("clipboard.write", { imageBase64: img })
              await ctx.send("clipboard.paste", {})
              await sleep(2000)
            } else {
              await ctx.send("file.set", {
                selector: "input[type='file'][accept*='image']",
                paths: [img],
              })
              await sleep(2000)
            }
          }
        }

        await sleep(1000)
        await ctx.send("click", { selector: "[data-testid='tweetButton']" })
        await sleep(2000)

        ctx.log(`Posted tweet: ${p.text.slice(0, 50)}...`)
        return { success: true }
      },
    },
  },
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export default xPost

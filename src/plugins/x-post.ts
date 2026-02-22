import type { BridgePlugin, ExecutionContext } from "../types"
import { sleep } from "../utils"

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
          await ctx.send("file.set", {
            selector: "input[type='file'][accept*='image']",
            paths: p.images,
          })
          await sleep(2000)
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

export default xPost

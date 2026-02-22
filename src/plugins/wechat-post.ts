import { config } from "../config"
import type { BridgePlugin, ExecutionContext } from "../types"
import { sleep } from "../utils"

const wechatPost: BridgePlugin = {
  name: "wechat",
  version: "0.1.0",
  commands: {
    post: {
      description: "Post an article to WeChat Official Account",
      async execute(params: unknown, ctx: ExecutionContext) {
        const p = params as { title: string; html: string }
        if (!p.title || !p.html) throw new Error("Missing 'title' or 'html'")

        await ctx.send("navigate", { url: "https://mp.weixin.qq.com/" })
        await ctx.send("wait", { selector: ".weui-desktop-account__nickname", timeout: 15000 })

        await ctx.send("navigate", { url: "https://mp.weixin.qq.com/cgi-bin/appmsg?action=edit&type=77" })
        await ctx.send("wait", { selector: "#title", timeout: 10000 })
        await sleep(1000)

        await ctx.send("click", { selector: "#title" })
        await ctx.send("type", { selector: "#title", text: p.title })

        if (!config.enableEvaluate) {
          throw new Error("evaluate command is disabled. Set ENABLE_EVALUATE=true to enable")
        }
        await ctx.send("evaluate", {
          expression: `
            const editor = document.querySelector('#edui1_contentplaceholder');
            if (editor) {
              editor.innerHTML = ${JSON.stringify(p.html)};
              editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
          `,
        })

        await sleep(1000)
        ctx.log(`Drafted WeChat article: ${p.title}`)
        return { success: true, message: "Article drafted. Review and publish manually." }
      },
    },
  },
}

export default wechatPost

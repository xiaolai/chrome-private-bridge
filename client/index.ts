export interface BridgeConfig {
  url: string
  apiKey: string
  timeout?: number
}

export interface CommandResult<T = unknown> {
  id: string
  ok: boolean
  result?: T
  error?: string
  duration: number
}

export class ChromeBridge {
  private url: string
  private apiKey: string
  private timeout: number

  constructor(config: BridgeConfig) {
    this.url = config.url.replace(/\/$/, "")
    this.apiKey = config.apiKey
    this.timeout = config.timeout ?? 30000
  }

  async command<T = unknown>(command: string, params?: Record<string, unknown>): Promise<CommandResult<T>> {
    const resp = await fetch(`${this.url}/api/v1/command`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ command, params }),
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!resp.ok) {
      const text = await resp.text()
      try {
        return JSON.parse(text)
      } catch {
        return { id: "", ok: false, error: `HTTP ${resp.status}: ${text}`, duration: 0 }
      }
    }
    return resp.json()
  }

  async status(): Promise<{ ok: boolean; extension: string; uptime: number }> {
    const resp = await fetch(`${this.url}/api/v1/status`, {
      headers: { "authorization": `Bearer ${this.apiKey}` },
    })
    return resp.json()
  }

  async navigate(url: string, tabId?: number) {
    return this.command("navigate", { url, tabId })
  }

  async click(selector: string, tabId?: number) {
    return this.command("click", { selector, tabId })
  }

  async type(selector: string, text: string, tabId?: number) {
    return this.command("type", { selector, text, tabId })
  }

  async press(key: string, modifiers?: string[], tabId?: number) {
    return this.command("press", { key, modifiers, tabId })
  }

  async scroll(opts: { x?: number; y?: number; selector?: string; tabId?: number }) {
    return this.command("scroll", opts)
  }

  async query(selector: string, attrs?: string[], tabId?: number) {
    return this.command("query", { selector, attrs, tabId })
  }

  async queryText(selector: string, tabId?: number) {
    return this.command<{ text: string }>("query.text", { selector, tabId })
  }

  async wait(selector: string, timeout?: number, tabId?: number) {
    return this.command("wait", { selector, timeout, tabId })
  }

  async screenshot(tabId?: number, selector?: string) {
    return this.command<{ dataUrl: string }>("screenshot", { tabId, selector })
  }

  async evaluate(expression: string, tabId?: number) {
    return this.command("evaluate", { expression, tabId })
  }

  async tabs() {
    return this.command<Array<{ id: number; url: string; title: string; active: boolean }>>("tab.list")
  }

  async createTab(url?: string) {
    return this.command("tab.create", { url })
  }

  async closeTab(tabId: number) {
    return this.command("tab.close", { tabId })
  }

  async getCookies(url: string, name?: string) {
    return this.command("cookie.get", { url, name })
  }

  async setCookie(cookie: Record<string, unknown>) {
    return this.command("cookie.set", { cookie })
  }

  async setFileInput(selector: string, paths: string[], tabId?: number) {
    return this.command("file.set", { selector, paths, tabId })
  }

  async clipboardWrite(opts: { text?: string; html?: string; imageBase64?: string }) {
    return this.command("clipboard.write", opts)
  }

  async clipboardPaste() {
    return this.command("clipboard.paste")
  }
}

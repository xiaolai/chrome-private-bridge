export async function query(params: { selector: string; attrs?: string[]; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, attrs: string[]) => {
      const els = Array.from(document.querySelectorAll(sel))
      return els.map(el => {
        const obj: Record<string, string | null> = {
          tagName: el.tagName.toLowerCase(),
          textContent: el.textContent?.trim().slice(0, 200) ?? null,
        }
        for (const attr of attrs) {
          obj[attr] = el.getAttribute(attr)
        }
        return obj
      })
    },
    args: [params.selector, params.attrs ?? ["id", "class", "href", "src", "data-testid"]],
  })
  return results[0]?.result
}

export async function queryText(params: { selector: string; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const el = document.querySelector(sel)
      return el ? { text: el.textContent?.trim() ?? "" } : { error: `Not found: ${sel}` }
    },
    args: [params.selector],
  })
  return results[0]?.result
}

export async function wait(params: { selector: string; timeout?: number; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()
  const timeout = params.timeout ?? 10000
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, timeoutMs: number) => {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        const existing = document.querySelector(sel)
        if (existing) {
          resolve({ success: true })
          return
        }
        const timer = setTimeout(() => {
          observer.disconnect()
          resolve({ success: false, error: `Timeout waiting for: ${sel}` })
        }, timeoutMs)
        const observer = new MutationObserver(() => {
          if (document.querySelector(sel)) {
            observer.disconnect()
            clearTimeout(timer)
            resolve({ success: true })
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
      })
    },
    args: [params.selector, timeout],
  })
  return results[0]?.result
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab")
  return tab.id
}

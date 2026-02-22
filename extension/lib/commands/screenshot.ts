export async function screenshot(params: { tabId?: number; selector?: string }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()

  if (params.selector) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel: string) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      },
      args: [params.selector],
    })
    const rect = results[0]?.result
    if (!rect) throw new Error(`Element not found: ${params.selector}`)
  }

  const tab = await chrome.tabs.get(tabId)
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" })
  return { dataUrl }
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab")
  return tab.id
}

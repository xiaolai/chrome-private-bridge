export async function evaluate(params: { expression: string; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (expr: string) => {
      try {
        return { result: eval(expr) }
      } catch (e: any) {
        return { error: e.message }
      }
    },
    args: [params.expression],
  })
  return results[0]?.result
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab")
  return tab.id
}

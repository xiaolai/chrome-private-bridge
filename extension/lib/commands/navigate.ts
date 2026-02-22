export async function navigate(params: { url: string; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? (await getActiveTabId())
  await chrome.tabs.update(tabId, { url: params.url })
  return { success: true, tabId }
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab")
  return tab.id
}

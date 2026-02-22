export async function tabList(): Promise<unknown> {
  const tabs = await chrome.tabs.query({})
  return tabs.map(t => ({
    id: t.id,
    url: t.url,
    title: t.title,
    active: t.active,
    windowId: t.windowId,
  }))
}

export async function tabCreate(params: { url?: string }): Promise<unknown> {
  const tab = await chrome.tabs.create({ url: params.url })
  return { id: tab.id, url: tab.url }
}

export async function tabClose(params: { tabId: number }): Promise<unknown> {
  await chrome.tabs.remove(params.tabId)
  return { success: true }
}

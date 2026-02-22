export async function fileSet(params: { selector: string; paths: string[]; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()

  await chrome.debugger.attach({ tabId }, "1.3")

  try {
    const doc = await chrome.debugger.sendCommand({ tabId }, "DOM.getDocument") as any
    const node = await chrome.debugger.sendCommand({ tabId }, "DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: params.selector,
    }) as any

    if (!node.nodeId) {
      throw new Error(`Element not found: ${params.selector}`)
    }

    await chrome.debugger.sendCommand({ tabId }, "DOM.setFileInputFiles", {
      nodeId: node.nodeId,
      files: params.paths,
    })

    return { success: true }
  } finally {
    await chrome.debugger.detach({ tabId }).catch(() => {})
  }
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab")
  return tab.id
}

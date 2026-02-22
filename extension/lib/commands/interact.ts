export async function click(params: { selector: string; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return { success: false, error: `Element not found: ${sel}` }
      el.scrollIntoView({ block: "center" })
      el.click()
      return { success: true }
    },
    args: [params.selector],
  })
  return results[0]?.result
}

export async function type(params: { selector: string; text: string; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, text: string) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return { success: false, error: `Element not found: ${sel}` }
      el.focus()
      const lines = text.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          const enterEvent = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })
          el.dispatchEvent(enterEvent)
          document.execCommand("insertLineBreak")
        }
        if (lines[i]) {
          document.execCommand("insertText", false, lines[i])
        }
      }
      return { success: true }
    },
    args: [params.selector, params.text],
  })
  return results[0]?.result
}

export async function press(params: { key: string; modifiers?: string[]; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (key: string, mods: string[]) => {
      const opts: KeyboardEventInit = {
        key,
        code: key,
        bubbles: true,
        ctrlKey: mods.includes("ctrl"),
        shiftKey: mods.includes("shift"),
        altKey: mods.includes("alt"),
        metaKey: mods.includes("meta"),
      }
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", opts))
      document.activeElement?.dispatchEvent(new KeyboardEvent("keyup", opts))
      return { success: true }
    },
    args: [params.key, params.modifiers ?? []],
  })
  return results[0]?.result
}

export async function scroll(params: { x?: number; y?: number; selector?: string; tabId?: number }): Promise<unknown> {
  const tabId = params.tabId ?? await getActiveTabId()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (x: number, y: number, sel?: string) => {
      if (sel) {
        const el = document.querySelector(sel)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return { success: true }
        }
        return { success: false, error: `Element not found: ${sel}` }
      }
      window.scrollTo({ left: x, top: y, behavior: "smooth" })
      return { success: true }
    },
    args: [params.x ?? 0, params.y ?? 0, params.selector],
  })
  return results[0]?.result
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab")
  return tab.id
}

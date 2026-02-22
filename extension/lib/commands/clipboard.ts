export async function clipboardWrite(params: { text?: string; html?: string; imageBase64?: string }): Promise<unknown> {
  if (params.imageBase64) {
    let base64 = params.imageBase64
    if (base64.includes(",")) base64 = base64.split(",")[1]

    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const blob = new Blob([bytes], { type: "image/png" })
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ])
    return { success: true, type: "image" }
  }

  if (params.html) {
    const htmlBlob = new Blob([params.html], { type: "text/html" })
    const textBlob = new Blob([params.text || ""], { type: "text/plain" })
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ])
    return { success: true, type: "html" }
  }

  if (params.text) {
    await navigator.clipboard.writeText(params.text)
    return { success: true, type: "text" }
  }

  throw new Error("Provide text, html, or imageBase64")
}

export async function clipboardPaste(): Promise<unknown> {
  const port = chrome.runtime.connectNative("com.chrome_bridge.native_host")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      port.disconnect()
      reject(new Error("Native host timeout"))
    }, 10000)

    port.onMessage.addListener((msg: any) => {
      clearTimeout(timeout)
      port.disconnect()
      resolve(msg)
    })

    port.onDisconnect.addListener(() => {
      clearTimeout(timeout)
      const err = chrome.runtime.lastError?.message || "Native host disconnected"
      reject(new Error(err))
    })

    port.postMessage({ command: "paste" })
  })
}

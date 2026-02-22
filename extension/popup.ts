const relayUrlInput = document.getElementById("relayUrl") as HTMLInputElement
const dot = document.getElementById("dot") as HTMLDivElement
const statusText = document.getElementById("statusText") as HTMLSpanElement

chrome.storage.local.get(["relayUrl", "connectionStatus"], (data) => {
  relayUrlInput.value = data.relayUrl || "http://localhost:7890"
  if (data.connectionStatus) setStatus(data.connectionStatus)
})

// Auto-save and reconnect when URL changes
relayUrlInput.addEventListener("change", () => {
  const relayUrl = relayUrlInput.value.trim()
  if (!relayUrl) return
  chrome.runtime.sendMessage({ action: "connect", relayUrl })
})

function setStatus(status: "connected" | "disconnected" | "connecting") {
  dot.className = `dot ${status}`
  const labels: Record<string, string> = {
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Connecting...",
  }
  statusText.textContent = labels[status] || status
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.connectionStatus) {
    setStatus(changes.connectionStatus.newValue)
  }
})

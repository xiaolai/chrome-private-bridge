const relayUrlInput = document.getElementById("relayUrl") as HTMLInputElement
const tokenInput = document.getElementById("token") as HTMLInputElement
const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement
const disconnectBtn = document.getElementById("disconnectBtn") as HTMLButtonElement
const dot = document.getElementById("dot") as HTMLDivElement
const statusText = document.getElementById("statusText") as HTMLSpanElement

chrome.storage.local.get(["relayUrl", "token"], (data) => {
  if (data.relayUrl) relayUrlInput.value = data.relayUrl
  if (data.token) tokenInput.value = data.token
})

connectBtn.addEventListener("click", () => {
  const relayUrl = relayUrlInput.value.trim()
  const token = tokenInput.value.trim()
  if (!relayUrl || !token) return

  chrome.runtime.sendMessage({ action: "connect", relayUrl, token }, () => {
    setStatus("connecting")
  })
})

disconnectBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "disconnect" }, () => {
    setStatus("disconnected")
  })
})

function setStatus(status: "connected" | "disconnected" | "connecting") {
  dot.className = `dot ${status}`
  statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1)
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.connectionStatus) {
    setStatus(changes.connectionStatus.newValue)
  }
})

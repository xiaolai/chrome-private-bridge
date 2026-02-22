import { isConnected } from "../ws/extension-handler"

export function handleStatus(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      extension: isConnected() ? "connected" : "disconnected",
      uptime: Math.floor(process.uptime()),
    }),
    { headers: { "content-type": "application/json" } }
  )
}

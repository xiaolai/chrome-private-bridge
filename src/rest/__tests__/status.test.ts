import { describe, test, expect } from "bun:test"
import { handleStatus } from "../status"

describe("REST status handler", () => {
  test("returns 200 with JSON content-type", () => {
    const resp = handleStatus()
    expect(resp.status).toBe(200)
    expect(resp.headers.get("content-type")).toBe("application/json")
  })

  test("response contains ok field", async () => {
    const resp = handleStatus()
    const data = await resp.json()
    expect(data.ok).toBe(true)
  })

  test("response contains extension field", async () => {
    const resp = handleStatus()
    const data = await resp.json()
    expect(typeof data.extension).toBe("string")
    expect(["connected", "disconnected"]).toContain(data.extension)
  })

  test("response contains uptime as number", async () => {
    const resp = handleStatus()
    const data = await resp.json()
    expect(typeof data.uptime).toBe("number")
    expect(data.uptime).toBeGreaterThanOrEqual(0)
  })
})

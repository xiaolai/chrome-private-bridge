import { describe, test, expect } from "bun:test"
import { jsonResponse } from "../response"

describe("jsonResponse", () => {
  test("returns JSON response with 200 status by default", async () => {
    const resp = jsonResponse({ ok: true })
    expect(resp.status).toBe(200)
    expect(resp.headers.get("content-type")).toBe("application/json")
    const data = await resp.json()
    expect(data).toEqual({ ok: true })
  })

  test("returns JSON response with custom status", async () => {
    const resp = jsonResponse({ error: "not found" }, 404)
    expect(resp.status).toBe(404)
  })

  test("serializes complex objects", async () => {
    const resp = jsonResponse({ items: [1, 2, 3], nested: { a: true } })
    const data = await resp.json()
    expect(data.items).toEqual([1, 2, 3])
    expect(data.nested.a).toBe(true)
  })
})

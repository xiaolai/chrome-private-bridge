import { describe, test, expect, beforeEach } from "bun:test"
import { PendingMap } from "../pending"

describe("PendingMap", () => {
  let pm: PendingMap

  beforeEach(() => {
    pm = new PendingMap()
  })

  test("nextId() returns unique IDs", () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(pm.nextId())
    }
    expect(ids.size).toBe(100)
  })

  test("add() + resolve() — promise resolves with correct value", async () => {
    const id = pm.nextId()
    const promise = pm.add(id, 5000)
    pm.resolve(id, { data: "hello" })
    const result = await promise
    expect(result).toEqual({ data: "hello" })
  })

  test("add() + reject() — promise rejects with correct error", async () => {
    const id = pm.nextId()
    const promise = pm.add(id, 5000)
    pm.reject(id, new Error("test error"))
    await expect(promise).rejects.toThrow("test error")
  })

  test("add() timeout — promise rejects after timeout", async () => {
    const id = pm.nextId()
    const promise = pm.add(id, 50)
    await expect(promise).rejects.toThrow(/timed out/)
  })

  test("resolve() with unknown ID returns false", () => {
    expect(pm.resolve("unknown_id", null)).toBe(false)
  })

  test("reject() with unknown ID returns false", () => {
    expect(pm.reject("unknown_id", new Error("err"))).toBe(false)
  })

  test("clear() rejects all pending, map size becomes 0", async () => {
    const id1 = pm.nextId()
    const id2 = pm.nextId()
    const p1 = pm.add(id1, 5000)
    const p2 = pm.add(id2, 5000)
    expect(pm.size).toBe(2)

    pm.clear()

    expect(pm.size).toBe(0)
    await expect(p1).rejects.toThrow("Connection closed")
    await expect(p2).rejects.toThrow("Connection closed")
  })

  test("size reflects correct count after add/resolve/reject", async () => {
    const id1 = pm.nextId()
    const id2 = pm.nextId()
    const id3 = pm.nextId()
    pm.add(id1, 5000)
    const p2 = pm.add(id2, 5000)
    pm.add(id3, 5000)
    expect(pm.size).toBe(3)

    pm.resolve(id1, null)
    expect(pm.size).toBe(2)

    pm.reject(id2, new Error("err"))
    expect(pm.size).toBe(1)

    // Catch the rejection to avoid unhandled promise
    await expect(p2).rejects.toThrow("err")
  })

  test("elapsed() returns positive number for pending, -1 for unknown", () => {
    const id = pm.nextId()
    pm.add(id, 5000)
    expect(pm.elapsed(id)).toBeGreaterThanOrEqual(0)
    expect(pm.elapsed("nonexistent")).toBe(-1)
  })

  test("double resolve — second call returns false", () => {
    const id = pm.nextId()
    pm.add(id, 5000)
    expect(pm.resolve(id, "first")).toBe(true)
    expect(pm.resolve(id, "second")).toBe(false)
  })
})

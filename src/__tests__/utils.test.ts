import { describe, test, expect } from "bun:test"
import { sleep, toError } from "../utils"

describe("utils", () => {
  test("sleep resolves after delay", async () => {
    const start = Date.now()
    await sleep(50)
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
  })

  test("toError returns Error as-is", () => {
    const e = new Error("test")
    expect(toError(e)).toBe(e)
  })

  test("toError wraps string in Error", () => {
    const e = toError("oops")
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe("oops")
  })

  test("toError wraps number in Error", () => {
    const e = toError(42)
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe("42")
  })

  test("toError wraps null in Error", () => {
    const e = toError(null)
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe("null")
  })

  test("toError wraps undefined in Error", () => {
    const e = toError(undefined)
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe("undefined")
  })
})

import { describe, test, expect } from "bun:test"
import { validateParams } from "../schemas"

describe("validateParams", () => {
  test("unknown command returns null (skips validation)", () => {
    expect(validateParams("unknown.command", { foo: "bar" })).toBeNull()
  })

  test("undefined params treated as empty object", () => {
    expect(validateParams("navigate", undefined)).toBe("Missing required field: url")
  })

  // --- navigate ---
  test("navigate: valid params pass", () => {
    expect(validateParams("navigate", { url: "https://example.com" })).toBeNull()
  })

  test("navigate: missing required url", () => {
    expect(validateParams("navigate", {})).toBe("Missing required field: url")
  })

  test("navigate: wrong type for url", () => {
    expect(validateParams("navigate", { url: 123 })).toBe("Field 'url' must be string")
  })

  test("navigate: optional tabId accepted", () => {
    expect(validateParams("navigate", { url: "https://x.com", tabId: 1 })).toBeNull()
  })

  test("navigate: wrong type for optional tabId", () => {
    expect(validateParams("navigate", { url: "https://x.com", tabId: "bad" })).toBe("Field 'tabId' must be number")
  })

  test("navigate: null url treated as missing (optional check)", () => {
    expect(validateParams("navigate", { url: null })).toBe("Missing required field: url")
  })

  // --- tab.list (empty schema) ---
  test("tab.list: empty params pass", () => {
    expect(validateParams("tab.list", {})).toBeNull()
  })

  // --- tab.create ---
  test("tab.create: no params pass (url is optional)", () => {
    expect(validateParams("tab.create", {})).toBeNull()
  })

  test("tab.create: valid url passes", () => {
    expect(validateParams("tab.create", { url: "https://x.com" })).toBeNull()
  })

  // --- tab.close ---
  test("tab.close: valid tabId passes", () => {
    expect(validateParams("tab.close", { tabId: 1 })).toBeNull()
  })

  test("tab.close: missing required tabId", () => {
    expect(validateParams("tab.close", {})).toBe("Missing required field: tabId")
  })

  test("tab.close: wrong type for tabId", () => {
    expect(validateParams("tab.close", { tabId: "abc" })).toBe("Field 'tabId' must be number")
  })

  // --- click ---
  test("click: valid params pass", () => {
    expect(validateParams("click", { selector: "#btn" })).toBeNull()
  })

  test("click: missing selector", () => {
    expect(validateParams("click", {})).toBe("Missing required field: selector")
  })

  // --- type ---
  test("type: valid params pass", () => {
    expect(validateParams("type", { selector: "#input", text: "hello" })).toBeNull()
  })

  test("type: missing text", () => {
    expect(validateParams("type", { selector: "#input" })).toBe("Missing required field: text")
  })

  // --- press ---
  test("press: valid params pass", () => {
    expect(validateParams("press", { key: "Enter" })).toBeNull()
  })

  test("press: optional modifiers array accepted", () => {
    expect(validateParams("press", { key: "a", modifiers: ["ctrl", "shift"] })).toBeNull()
  })

  test("press: wrong type for modifiers", () => {
    expect(validateParams("press", { key: "a", modifiers: "ctrl" })).toBe("Field 'modifiers' must be string[]")
  })

  // --- scroll ---
  test("scroll: all optional, empty passes", () => {
    expect(validateParams("scroll", {})).toBeNull()
  })

  test("scroll: valid x and y", () => {
    expect(validateParams("scroll", { x: 0, y: 100 })).toBeNull()
  })

  // --- query ---
  test("query: valid selector passes", () => {
    expect(validateParams("query", { selector: "div" })).toBeNull()
  })

  test("query: optional attrs array", () => {
    expect(validateParams("query", { selector: "div", attrs: ["href", "class"] })).toBeNull()
  })

  // --- query.text ---
  test("query.text: valid selector passes", () => {
    expect(validateParams("query.text", { selector: "p" })).toBeNull()
  })

  // --- wait ---
  test("wait: valid selector passes", () => {
    expect(validateParams("wait", { selector: ".loaded" })).toBeNull()
  })

  test("wait: optional timeout accepted", () => {
    expect(validateParams("wait", { selector: ".loaded", timeout: 5000 })).toBeNull()
  })

  // --- screenshot ---
  test("screenshot: no params pass (all optional)", () => {
    expect(validateParams("screenshot", {})).toBeNull()
  })

  // --- evaluate ---
  test("evaluate: valid expression passes", () => {
    expect(validateParams("evaluate", { expression: "1+1" })).toBeNull()
  })

  test("evaluate: missing expression", () => {
    expect(validateParams("evaluate", {})).toBe("Missing required field: expression")
  })

  // --- cookie.get ---
  test("cookie.get: valid url passes", () => {
    expect(validateParams("cookie.get", { url: "https://x.com" })).toBeNull()
  })

  test("cookie.get: missing url", () => {
    expect(validateParams("cookie.get", {})).toBe("Missing required field: url")
  })

  // --- cookie.set ---
  test("cookie.set: valid cookie object passes", () => {
    expect(validateParams("cookie.set", { cookie: { name: "a", value: "b" } })).toBeNull()
  })

  test("cookie.set: missing cookie", () => {
    expect(validateParams("cookie.set", {})).toBe("Missing required field: cookie")
  })

  test("cookie.set: array is not a valid object", () => {
    expect(validateParams("cookie.set", { cookie: [1, 2] })).toBe("Field 'cookie' must be object")
  })

  test("cookie.set: null is not a valid object", () => {
    expect(validateParams("cookie.set", { cookie: null })).toBe("Missing required field: cookie")
  })

  // --- file.set ---
  test("file.set: valid selector passes", () => {
    expect(validateParams("file.set", { selector: "#upload" })).toBeNull()
  })

  test("file.set: optional paths array", () => {
    expect(validateParams("file.set", { selector: "#upload", paths: ["/tmp/a.txt"] })).toBeNull()
  })

  // --- clipboard.write ---
  test("clipboard.write: all optional, empty passes", () => {
    expect(validateParams("clipboard.write", {})).toBeNull()
  })

  test("clipboard.write: text passes", () => {
    expect(validateParams("clipboard.write", { text: "hello" })).toBeNull()
  })

  // --- clipboard.paste ---
  test("clipboard.paste: empty passes", () => {
    expect(validateParams("clipboard.paste", {})).toBeNull()
  })
})

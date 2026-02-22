import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const testDir = mkdtempSync(join(tmpdir(), "chrome-bridge-cli-test-"))
process.env.CONFIG_DIR = testDir

import { runCli } from "../cli"
import { generateKey } from "../auth"
import { saveKeys } from "../store"

function resetKeys() {
  saveKeys({ keys: [] })
}

describe("CLI", () => {
  let logSpy: ReturnType<typeof spyOn>
  let errorSpy: ReturnType<typeof spyOn>
  let tableSpy: ReturnType<typeof spyOn>
  let logged: string[]
  let errors: string[]

  beforeEach(() => {
    resetKeys()
    logged = []
    errors = []
    logSpy = spyOn(console, "log").mockImplementation((...args: any[]) => {
      logged.push(args.map(String).join(" "))
    })
    errorSpy = spyOn(console, "error").mockImplementation((...args: any[]) => {
      errors.push(args.map(String).join(" "))
    })
    tableSpy = spyOn(console, "table").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    tableSpy.mockRestore()
  })

  // No args → start server
  test("no args returns exit: false", async () => {
    const result = await runCli([])
    expect(result).toEqual({ exit: false, code: 0 })
  })

  // Help
  test("help prints usage and exits 0", async () => {
    const result = await runCli(["help"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged.some(l => l.includes("Usage:"))).toBe(true)
  })

  test("--help prints usage and exits 0", async () => {
    const result = await runCli(["--help"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged.some(l => l.includes("Usage:"))).toBe(true)
  })

  test("-h prints usage and exits 0", async () => {
    const result = await runCli(["-h"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged.some(l => l.includes("Usage:"))).toBe(true)
  })

  // Version
  test("version prints version and exits 0", async () => {
    const result = await runCli(["version"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[0]).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test("--version prints version and exits 0", async () => {
    const result = await runCli(["--version"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[0]).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test("-v prints version and exits 0", async () => {
    const result = await runCli(["-v"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[0]).toMatch(/^\d+\.\d+\.\d+$/)
  })

  // Keygen
  test("keygen --name test generates full key", async () => {
    const result = await runCli(["keygen", "--name", "test"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[0]).toMatch(/^Generated API key: bby_[0-9a-f]{64}$/)
    expect(logged[1]).toBe("Name: test")
  })

  test("keygen without --name defaults to 'default'", async () => {
    const result = await runCli(["keygen"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[1]).toBe("Name: default")
  })

  test("keygen --name test --commands a,b shows allowed commands", async () => {
    const result = await runCli(["keygen", "--name", "test", "--commands", "a,b"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[2]).toBe("Allowed commands: a, b")
  })

  test("keygen --name test --ip 1.2.3.4 sets allowedIPs", async () => {
    const result = await runCli(["keygen", "--name", "test", "--ip", "1.2.3.4"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[2]).toBe("Allowed IPs: 1.2.3.4")
  })

  test("keygen --name test --ip 1.2.3.4,5.6.7.8 sets multiple IPs", async () => {
    const result = await runCli(["keygen", "--name", "test", "--ip", "1.2.3.4,5.6.7.8"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[2]).toBe("Allowed IPs: 1.2.3.4, 5.6.7.8")
  })

  test("keygen --name (missing value) errors", async () => {
    const result = await runCli(["keygen", "--name"])
    expect(result).toEqual({ exit: true, code: 1 })
    expect(errors[0]).toContain("--name requires a value")
  })

  test("keygen --name --commands (name is flag) errors", async () => {
    const result = await runCli(["keygen", "--name", "--commands"])
    expect(result).toEqual({ exit: true, code: 1 })
    expect(errors[0]).toContain("--name requires a value")
  })

  test("keygen --commands (missing value) errors", async () => {
    const result = await runCli(["keygen", "--commands"])
    expect(result).toEqual({ exit: true, code: 1 })
    expect(errors[0]).toContain("--commands requires a value")
  })

  test("keygen --ip (missing value) errors", async () => {
    const result = await runCli(["keygen", "--ip"])
    expect(result).toEqual({ exit: true, code: 1 })
    expect(errors[0]).toContain("--ip requires a value")
  })

  // Keys
  test("keys with no keys shows empty message", async () => {
    const result = await runCli(["keys"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[0]).toContain("No API keys")
  })

  test("keys lists existing keys", async () => {
    generateKey("alpha")
    const result = await runCli(["keys"])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(tableSpy).toHaveBeenCalled()
  })

  // Revoke
  test("revoke with valid prefix succeeds", async () => {
    const key = generateKey("to-revoke")
    const prefix = key.slice(0, 12)
    const result = await runCli(["revoke", prefix])
    expect(result).toEqual({ exit: true, code: 0 })
    expect(logged[0]).toContain("revoked successfully")
  })

  test("revoke with unknown prefix errors", async () => {
    const result = await runCli(["revoke", "bby_zzzzzzzz"])
    expect(result).toEqual({ exit: true, code: 1 })
    expect(errors[0]).toContain("no key found")
  })

  test("revoke with ambiguous prefix errors", async () => {
    generateKey("dup1")
    generateKey("dup2")
    const result = await runCli(["revoke", "bby_"])
    expect(result).toEqual({ exit: true, code: 1 })
    expect(errors[0]).toContain("multiple keys match")
  })

  test("revoke without prefix errors", async () => {
    const result = await runCli(["revoke"])
    expect(result).toEqual({ exit: true, code: 1 })
    expect(errors[0]).toContain("revoke requires a key prefix")
  })

  // Status
  test("status when server is running", async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response("OK", { status: 200 })) as any
    try {
      const result = await runCli(["status"])
      expect(result).toEqual({ exit: true, code: 0 })
      expect(logged[0]).toContain("Server is running")
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("status when server responds with error", async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response("error", { status: 500 })) as any
    try {
      const result = await runCli(["status"])
      expect(result).toEqual({ exit: true, code: 0 })
      expect(logged[0]).toContain("Server responded with status 500")
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("status when server is not running", async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = (() => { throw new Error("ECONNREFUSED") }) as any
    try {
      const result = await runCli(["status"])
      expect(result).toEqual({ exit: true, code: 1 })
      expect(logged[0]).toContain("Server is not running")
    } finally {
      globalThis.fetch = origFetch
    }
  })

  // Unknown command
  test("unknown command prints error and usage", async () => {
    const result = await runCli(["foobar"])
    expect(result).toEqual({ exit: true, code: 1 })
    expect(errors[0]).toContain("Unknown command: foobar")
    expect(logged.some(l => l.includes("Usage:"))).toBe(true)
  })
})

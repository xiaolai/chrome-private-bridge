import { generateKey, listKeys, revokeKey } from "./auth"
import { config } from "./config"

const pkg = require("../package.json")

const USAGE = `Chrome Bridge Server v${pkg.version}

Usage: bun src/server.ts [command]

Commands:
  help                                          Show this help message
  version                                       Show version
  keygen --name <name> [--commands c1,c2] [--ip 1.2.3.4,5.6.7.8]
                                                Generate an API key
  keys                                          List API keys
  revoke <prefix>                               Revoke an API key
  status                                        Check if server is running

If no command is given, the server starts normally.`

export async function runCli(args: string[]): Promise<{ exit: boolean; code: number }> {
  const cmd = args[0]

  if (!cmd) return { exit: false, code: 0 }

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(USAGE)
    return { exit: true, code: 0 }
  }

  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    console.log(pkg.version)
    return { exit: true, code: 0 }
  }

  if (cmd === "keygen") {
    const nameIdx = args.indexOf("--name")
    if (nameIdx !== -1 && (args[nameIdx + 1] === undefined || args[nameIdx + 1].startsWith("-"))) {
      console.error("Error: --name requires a value")
      return { exit: true, code: 1 }
    }
    const name = nameIdx !== -1 ? args[nameIdx + 1] : "default"

    const cmdsIdx = args.indexOf("--commands")
    if (cmdsIdx !== -1 && (args[cmdsIdx + 1] === undefined || args[cmdsIdx + 1].startsWith("-"))) {
      console.error("Error: --commands requires a value")
      return { exit: true, code: 1 }
    }
    const cmds = cmdsIdx !== -1 ? args[cmdsIdx + 1].split(",") : null

    const ipIdx = args.indexOf("--ip")
    if (ipIdx !== -1 && (args[ipIdx + 1] === undefined || args[ipIdx + 1].startsWith("-"))) {
      console.error("Error: --ip requires a value")
      return { exit: true, code: 1 }
    }
    const ips = ipIdx !== -1 ? args[ipIdx + 1].split(",") : null

    const key = generateKey(name, cmds, ips)
    console.log(`Generated API key: ${key}`)
    console.log(`Name: ${name}`)
    if (cmds) console.log(`Allowed commands: ${cmds.join(", ")}`)
    if (ips) console.log(`Allowed IPs: ${ips.join(", ")}`)
    return { exit: true, code: 0 }
  }

  if (cmd === "keys") {
    const keys = listKeys()
    if (keys.length === 0) {
      console.log("No API keys. Run: bun src/server.ts keygen --name <name>")
    } else {
      console.table(keys)
    }
    return { exit: true, code: 0 }
  }

  if (cmd === "revoke") {
    const prefix = args[1]
    if (!prefix) {
      console.error("Error: revoke requires a key prefix. Usage: revoke <prefix>")
      return { exit: true, code: 1 }
    }
    const result = revokeKey(prefix)
    if (result === true) {
      console.log(`Key ${prefix}... revoked successfully`)
      return { exit: true, code: 0 }
    }
    if (result === false) {
      console.error(`Error: no key found matching prefix "${prefix}"`)
      return { exit: true, code: 1 }
    }
    console.error(`Error: multiple keys match prefix "${prefix}". Use a longer prefix.`)
    return { exit: true, code: 1 }
  }

  if (cmd === "status") {
    try {
      const resp = await fetch(`http://localhost:${config.port}/api/v1/status`)
      if (resp.ok) {
        console.log("Server is running")
      } else {
        console.log(`Server responded with status ${resp.status}`)
      }
      return { exit: true, code: 0 }
    } catch {
      console.log("Server is not running")
      return { exit: true, code: 1 }
    }
  }

  console.error(`Unknown command: ${cmd}\n`)
  console.log(USAGE)
  return { exit: true, code: 1 }
}

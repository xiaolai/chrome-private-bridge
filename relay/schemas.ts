type FieldType = "string" | "number" | "object" | "string?" | "number?" | "object?" | "string[]?" | "number[]?"

type Schema = Record<string, FieldType>

const schemas: Record<string, Schema> = {
  navigate: { url: "string", tabId: "number?" },
  "tab.list": {},
  "tab.create": { url: "string?" },
  "tab.close": { tabId: "number" },
  click: { selector: "string", tabId: "number?" },
  type: { selector: "string", text: "string", tabId: "number?" },
  press: { key: "string", modifiers: "string[]?", tabId: "number?" },
  scroll: { x: "number?", y: "number?", selector: "string?", tabId: "number?" },
  query: { selector: "string", attrs: "string[]?", tabId: "number?" },
  "query.text": { selector: "string", tabId: "number?" },
  wait: { selector: "string", timeout: "number?", tabId: "number?" },
  screenshot: { tabId: "number?", selector: "string?" },
  evaluate: { expression: "string", tabId: "number?" },
  "cookie.get": { url: "string", name: "string?" },
  "cookie.set": { cookie: "object" },
  "file.set": { selector: "string", paths: "string[]?", tabId: "number?" },
  "clipboard.write": { text: "string?", html: "string?", imageBase64: "string?" },
  "clipboard.paste": {},
}

function checkType(value: unknown, type: string): boolean {
  if (type === "string") return typeof value === "string"
  if (type === "number") return typeof value === "number"
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value)
  if (type === "string[]") return Array.isArray(value) && value.every(v => typeof v === "string")
  if (type === "number[]") return Array.isArray(value) && value.every(v => typeof v === "number")
  return false
}

export function validateParams(command: string, params: Record<string, unknown> | undefined): string | null {
  const schema = schemas[command]
  if (!schema) return null // unknown commands skip validation

  const p = params ?? {}

  for (const [field, type] of Object.entries(schema)) {
    const isOptional = type.endsWith("?")
    const baseType = isOptional ? type.slice(0, -1) : type
    const value = p[field]

    if (value === undefined || value === null) {
      if (!isOptional) return `Missing required field: ${field}`
      continue
    }

    if (!checkType(value, baseType)) {
      return `Field '${field}' must be ${baseType}`
    }
  }

  return null
}

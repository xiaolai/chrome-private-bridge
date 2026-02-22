// Import all command files to trigger registration
import "./navigate"
import "./click"
import "./type"
import "./press"
import "./scroll"
import "./query"
import "./wait"
import "./screenshot"
import "./evaluate"
import "./tabs"
import "./cookies"
import "./file"
import "./clipboard"

// Re-export registry functions
export { defineCommand, getCommand, getAllTools, getAllCommands, clearCommands } from "./define"
export type { CommandDef, McpTool, McpToolAnnotations } from "./define"

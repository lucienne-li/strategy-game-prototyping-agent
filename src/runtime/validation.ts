import type { RunCommandCall, ToolCall } from "../agent/types.js";

const MAX_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new Error(`unexpected field(s): ${unexpected.join(", ")}`);
  }
}

export function validateToolCall(value: unknown): ToolCall {
  if (!isRecord(value)) throw new Error("tool call must be an object");
  const tool = requireString(value.tool, "tool");

  if (tool === "read_file") {
    requireOnlyKeys(value, ["tool", "path"]);
    return { tool, path: requireString(value.path, "path") };
  }

  if (tool === "write_file") {
    requireOnlyKeys(value, ["tool", "path", "content"]);
    if (typeof value.content !== "string") {
      throw new Error("content must be a string");
    }
    return {
      tool,
      path: requireString(value.path, "path"),
      content: value.content
    };
  }

  if (tool === "run_command") {
    requireOnlyKeys(value, ["tool", "command", "args", "timeoutMs"]);
    const command = requireString(value.command, "command");
    if (!Array.isArray(value.args) || !value.args.every((arg) => typeof arg === "string")) {
      throw new Error("args must be an array of strings");
    }

    const call: RunCommandCall = { tool, command, args: value.args };
    if (value.timeoutMs !== undefined) {
      if (!Number.isInteger(value.timeoutMs) || (value.timeoutMs as number) <= 0 || (value.timeoutMs as number) > MAX_TIMEOUT_MS) {
        throw new Error(`timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
      }
      call.timeoutMs = value.timeoutMs as number;
    }
    return call;
  }

  throw new Error(`unsupported tool: ${tool}`);
}

import assert from "node:assert/strict";
import test from "node:test";
import { validateToolCall } from "../src/runtime/validation.js";

test("validates the three MVP tool schemas", () => {
  assert.deepEqual(validateToolCall({ tool: "read_file", path: "a.ts" }), { tool: "read_file", path: "a.ts" });
  assert.deepEqual(validateToolCall({ tool: "write_file", path: "a.ts", content: "x" }), {
    tool: "write_file",
    path: "a.ts",
    content: "x"
  });
  assert.deepEqual(validateToolCall({ tool: "run_command", command: "node", args: ["a.ts"] }), {
    tool: "run_command",
    command: "node",
    args: ["a.ts"]
  });
});

test("rejects malformed and unsupported calls", () => {
  assert.throws(() => validateToolCall({ tool: "write_file", path: "a.ts" }), /content/);
  assert.throws(() => validateToolCall({ tool: "run_command", command: "node", args: "a.ts" }), /args/);
  assert.throws(() => validateToolCall({ tool: "delete_file", path: "a.ts" }), /unsupported/);
  assert.throws(() => validateToolCall({ tool: "read_file", path: "a.ts", hidden: true }), /unexpected field/);
  assert.throws(
    () => validateToolCall({ tool: "run_command", command: "node", args: [], timeoutMs: 30_001 }),
    /timeoutMs/
  );
});

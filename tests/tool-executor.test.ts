import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ToolExecutor } from "../src/runtime/tool-executor.js";

test("write_file and read_file stay inside the workspace", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-tools-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const executor = new ToolExecutor({ workspace });

  const write = await executor.execute({ tool: "write_file", path: "src/value.ts", content: "export const value = 1;\n" });
  assert.equal(write.result.ok, true);
  assert.equal(await readFile(path.join(workspace, "src/value.ts"), "utf8"), "export const value = 1;\n");

  const read = await executor.execute({ tool: "read_file", path: "src/value.ts" });
  assert.equal(read.result.content, "export const value = 1;\n");

  const escape = await executor.execute({ tool: "write_file", path: "../escaped.ts", content: "bad" });
  assert.equal(escape.result.ok, false);
  assert.match(escape.result.error ?? "", /inside the workspace/);
});

test("run_command captures output and enforces the allowlist", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-command-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const executor = new ToolExecutor({ workspace, allowedCommands: ["node"] });

  const run = await executor.execute({ tool: "run_command", command: "node", args: ["-e", "console.log('ok')"] });
  assert.equal(run.result.ok, true);
  assert.equal(run.result.stdout?.trim(), "ok");
  assert.equal(run.result.exitCode, 0);
  assert.equal(run.result.stderr, "");

  const denied = await executor.execute({ tool: "run_command", command: "sh", args: ["-c", "echo bad"] });
  assert.equal(denied.result.ok, false);
  assert.match(denied.result.error ?? "", /not allowed/);
});

test("run_command reports stderr, non-zero exits, and timeout", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-command-errors-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const executor = new ToolExecutor({ workspace, allowedCommands: ["node"] });

  const failed = await executor.execute({
    tool: "run_command",
    command: "node",
    args: ["-e", "console.error('expected failure'); process.exit(3)"]
  });
  assert.equal(failed.result.ok, false);
  assert.equal(failed.result.exitCode, 3);
  assert.match(failed.result.stderr ?? "", /expected failure/);

  const timedOut = await executor.execute({
    tool: "run_command",
    command: "node",
    args: ["-e", "setTimeout(() => {}, 1_000)"],
    timeoutMs: 20
  });
  assert.equal(timedOut.result.ok, false);
  assert.equal(timedOut.result.exitCode, null);
  assert.match(timedOut.result.error ?? "", /timed out/);
});

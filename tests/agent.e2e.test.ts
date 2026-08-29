import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAgent } from "../src/agent/agent-loop.js";
import { FakeHelloAgentModel } from "../src/agent/fake-model.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";

test("end-to-end: model writes, runs, observes, and finishes", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-e2e-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));

  const result = await runAgent("Create a TypeScript file that prints hello agent, then run it and verify the output.", {
    model: new FakeHelloAgentModel(),
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    maxIterations: 6
  });

  assert.equal(result.status, "success");
  assert.equal(result.iterations, 3);
  assert.equal(await readFile(path.join(workspace, "hello-agent.ts"), "utf8"), 'console.log("hello agent");\n');
  assert.equal(result.events.length, 4);

  const runObservation = result.events[3];
  assert.equal(runObservation?.type, "tool_result");
  if (runObservation?.type === "tool_result") {
    assert.equal(runObservation.result.exitCode, 0);
    assert.equal(runObservation.result.stdout?.trim(), "hello agent");
  }
});

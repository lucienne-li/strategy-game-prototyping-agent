import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAgent } from "../src/agent/agent-loop.js";
import type { AgentModel } from "../src/agent/types.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";

test("stops a model that never returns a final response", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-limit-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const model: AgentModel = {
    async next() {
      return { type: "tool_call", call: { tool: "read_file", path: "missing.txt" } };
    }
  };

  const result = await runAgent("loop forever", {
    model,
    executor: new ToolExecutor({ workspace }),
    maxIterations: 2
  });
  assert.equal(result.status, "max_iterations");
  assert.equal(result.iterations, 2);
});

test("returns validation failures to the model as observations", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-observation-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const model: AgentModel = {
    async next(modelContext) {
      if (modelContext.events.length === 0) {
        return { type: "tool_call", call: { tool: "unknown_tool" } };
      }
      const result = modelContext.events.at(-1);
      assert.equal(result?.type, "tool_result");
      return { type: "final", status: "failure", message: "observed invalid tool" };
    }
  };

  const result = await runAgent("bad tool", {
    model,
    executor: new ToolExecutor({ workspace })
  });
  assert.equal(result.status, "failure");
  assert.equal(result.events[0]?.type, "tool_result");
});

test("executes a single tool call and returns its observation before the next model turn", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-single-call-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const model: AgentModel = {
    async next(modelContext) {
      if (modelContext.events.length === 0) {
        return { type: "tool_call", call: { tool: "write_file", path: "single.txt", content: "one" } };
      }
      assert.equal(modelContext.events.at(-1)?.type, "tool_result");
      return { type: "final", status: "success", message: "single observed" };
    }
  };

  const result = await runAgent("single", { model, executor: new ToolExecutor({ workspace }) });
  assert.equal(result.status, "success");
  assert.equal(await readFile(path.join(workspace, "single.txt"), "utf8"), "one");
  assert.deepEqual(result.events.map((event) => event.type), ["tool_call", "tool_result"]);
});

test("executes multiple tool calls sequentially and records every observation", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-multiple-calls-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const model: AgentModel = {
    async next(modelContext) {
      if (modelContext.events.length === 0) {
        return {
          type: "tool_calls",
          calls: [
            { tool: "write_file", path: "ordered.txt", content: "first" },
            { tool: "read_file", path: "ordered.txt" },
            { tool: "write_file", path: "ordered.txt", content: "last" }
          ]
        };
      }
      assert.equal(modelContext.events.length, 6);
      assert.equal(modelContext.events[3]?.type, "tool_result");
      if (modelContext.events[3]?.type === "tool_result") assert.equal(modelContext.events[3].result.content, "first");
      return { type: "final", status: "success", message: "batch observed" };
    }
  };

  const result = await runAgent("ordered batch", { model, executor: new ToolExecutor({ workspace }) });
  assert.equal(result.status, "success");
  assert.equal(await readFile(path.join(workspace, "ordered.txt"), "utf8"), "last");
  assert.deepEqual(result.events.map((event) => event.type), [
    "tool_call", "tool_result", "tool_call", "tool_result", "tool_call", "tool_result"
  ]);
});

test("preserves a failed middle tool observation and continues the ordered batch", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-batch-failure-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const model: AgentModel = {
    async next(modelContext) {
      if (modelContext.events.length === 0) {
        return {
          type: "tool_calls",
          calls: [
            { tool: "write_file", path: "before.txt", content: "before" },
            { tool: "run_command", command: "not-allowed", args: [] },
            { tool: "write_file", path: "after.txt", content: "after" }
          ]
        };
      }
      const results = modelContext.events.filter((event) => event.type === "tool_result");
      assert.equal(results.length, 3);
      assert.equal(results[1]?.result.ok, false);
      assert.match(results[1]?.result.error ?? "", /command is not allowed/);
      return { type: "final", status: "failure", message: "middle failure observed" };
    }
  };

  const result = await runAgent("batch failure", { model, executor: new ToolExecutor({ workspace }) });
  assert.equal(result.status, "failure");
  assert.equal(await readFile(path.join(workspace, "before.txt"), "utf8"), "before");
  assert.equal(await readFile(path.join(workspace, "after.txt"), "utf8"), "after");
});

test("rejects an over-limit tool batch without executing any call", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-batch-limit-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const model: AgentModel = {
    async next(modelContext) {
      if (modelContext.events.length === 0) {
        return {
          type: "tool_calls",
          calls: [1, 2, 3].map((value) => ({ tool: "write_file", path: `${value}.txt`, content: String(value) }))
        };
      }
      assert.equal(modelContext.events.length, 1);
      const observation = modelContext.events[0];
      assert.equal(observation?.type, "tool_result");
      if (observation?.type === "tool_result") assert.match(observation.result.error ?? "", /3 tool calls; limit is 2/);
      return { type: "final", status: "failure", message: "limit observed" };
    }
  };

  const result = await runAgent("over limit", {
    model,
    executor: new ToolExecutor({ workspace }),
    maxToolCallsPerIteration: 2
  });
  assert.equal(result.status, "failure");
  await assert.rejects(() => readFile(path.join(workspace, "1.txt"), "utf8"), /ENOENT/);
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

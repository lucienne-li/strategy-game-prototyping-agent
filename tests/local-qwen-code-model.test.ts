import assert from "node:assert/strict";
import test from "node:test";
import type { CodeGenerator } from "../src/model/local-qwen-code-model.js";
import { ScaffoldedLocalCodeModel } from "../src/model/local-qwen-code-model.js";

class FakeGenerator implements CodeGenerator {
  requests: unknown[] = [];
  async generate(request: unknown): Promise<string> {
    this.requests.push(request);
    return "export const value = 1;\n";
  }
}

test("local code adapter maps generation into existing write/run/final protocol", async () => {
  const generator = new FakeGenerator();
  const model = new ScaffoldedLocalCodeModel({ generator, targetFile: "solution.ts" });
  const write = await model.next({ request: "create it", iteration: 1, events: [] });
  assert.deepEqual(write, { type: "tool_call", call: { tool: "write_file", path: "solution.ts", content: "export const value = 1;\n" } });
  const run = await model.next({ request: "create it", iteration: 2, events: [
    { type: "tool_call", call: { tool: "write_file", path: "solution.ts", content: "x" } },
    { type: "tool_result", result: { tool: "write_file", ok: true } }
  ] });
  assert.equal(run.type, "tool_call");
  const final = await model.next({ request: "create it", iteration: 3, events: [
    { type: "tool_result", result: { tool: "run_command", ok: true, exitCode: 0 } }
  ] });
  assert.deepEqual(final, { type: "final", status: "success", message: "Local code candidate executed without a Node error." });
});

test("repair run reads the existing target before asking for replacement code", async () => {
  const generator = new FakeGenerator();
  const model = new ScaffoldedLocalCodeModel({ generator, targetFile: "solution.ts" });
  const read = await model.next({ request: "evaluator-guided repair 1", iteration: 1, events: [] });
  assert.deepEqual(read, { type: "tool_call", call: { tool: "read_file", path: "solution.ts" } });
  await model.next({ request: "evaluator-guided repair 1", iteration: 2, events: [
    { type: "tool_result", result: { tool: "read_file", ok: true, content: "broken" } }
  ] });
  assert.equal((generator.requests[0] as { existing_code: string }).existing_code, "broken");
});

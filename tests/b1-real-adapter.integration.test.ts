import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAgent } from "../src/agent/agent-loop.js";
import { B1_REQUEST, evaluateB1 } from "../src/evaluation/b1-evaluator.js";
import { OpenAIResponsesModel } from "../src/model/openai-responses-model.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";

function responseWith(output: unknown[]): Response {
  return new Response(JSON.stringify({ output }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("OpenAI adapter contract completes B1 and external evaluation", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b1-adapter-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const responses = [
    responseWith([
      {
        type: "function_call",
        name: "write_file",
        arguments: JSON.stringify({ path: "hello-agent.ts", content: 'console.log("hello agent");\n' })
      }
    ]),
    responseWith([
      {
        type: "function_call",
        name: "run_command",
        arguments: JSON.stringify({ command: "node", args: ["hello-agent.ts"] })
      }
    ]),
    responseWith([
      { type: "message", content: [{ type: "output_text", text: "SUCCESS: output verified" }] }
    ])
  ];
  let requestCount = 0;
  const fakeFetch = (async () => {
    const response = responses[requestCount];
    requestCount += 1;
    if (!response) throw new Error("unexpected model request");
    return response;
  }) as typeof globalThis.fetch;
  const model = OpenAIResponsesModel.fromEnv({ env: { OPENAI_API_KEY: "test-key" }, fetch: fakeFetch });

  const agentResult = await runAgent(B1_REQUEST, {
    model,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    maxIterations: 6
  });
  const evaluation = await evaluateB1(workspace);

  assert.equal(agentResult.status, "success");
  assert.equal(agentResult.iterations, 3);
  assert.equal(requestCount, 3);
  assert.deepEqual(
    agentResult.events.filter((event) => event.type === "tool_call").map((event) => event.call.tool),
    ["write_file", "run_command"]
  );
  assert.deepEqual(evaluation, {
    passed: true,
    fileExists: true,
    stdout: "hello agent\n",
    stderr: "",
    exitCode: 0
  });

  const escape = await new ToolExecutor({ workspace }).execute({
    tool: "write_file",
    path: "../benchmarks/b1/task.json",
    content: "tampered"
  });
  assert.equal(escape.result.ok, false);
});

test("external B1 evaluation rejects missing and incorrect artifacts", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b1-evaluator-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));

  const missing = await evaluateB1(workspace);
  assert.equal(missing.passed, false);
  assert.equal(missing.fileExists, false);

  const executor = new ToolExecutor({ workspace });
  await executor.execute({ tool: "write_file", path: "hello-agent.ts", content: 'console.log("wrong");\n' });
  const incorrect = await evaluateB1(workspace);
  assert.equal(incorrect.passed, false);
  assert.equal(incorrect.stdout.trim(), "wrong");
});

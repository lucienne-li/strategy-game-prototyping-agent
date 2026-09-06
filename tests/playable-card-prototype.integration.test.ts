import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAgent } from "../src/agent/agent-loop.js";
import { B4_REQUEST, evaluateB4 } from "../src/evaluation/b4-evaluator.js";
import { OpenAIResponsesModel } from "../src/model/openai-responses-model.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";
import { referenceGame, referenceIndex, referenceProjectScript } from "./fixtures/b4-reference.js";

function responseWith(output: unknown[]): Response {
  return new Response(JSON.stringify({ output }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("existing Agent Runtime generates and externally validates the B4 project", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b4-adapter-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const responses = [
    ["index.html", referenceIndex],
    ["src/game.ts", referenceGame],
    ["project.mjs", referenceProjectScript]
  ].map(([filePath, content]) =>
    responseWith([
      {
        type: "function_call",
        name: "write_file",
        arguments: JSON.stringify({ path: filePath, content })
      }
    ])
  );
  responses.push(
    responseWith([
      {
        type: "function_call",
        name: "run_command",
        arguments: JSON.stringify({ command: "node", args: ["project.mjs", "build"] })
      }
    ]),
    responseWith([{ type: "message", content: [{ type: "output_text", text: "SUCCESS: B4 build verified" }] }])
  );
  let index = 0;
  const fakeFetch = (async () => {
    const response = responses[index++];
    if (!response) throw new Error("unexpected model request");
    return response;
  }) as typeof globalThis.fetch;
  const model = OpenAIResponsesModel.fromEnv({ env: { OPENAI_API_KEY: "test-key" }, fetch: fakeFetch });

  const result = await runAgent(B4_REQUEST, {
    model,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    maxIterations: 6
  });
  const evaluation = await evaluateB4(workspace);

  assert.equal(result.status, "success");
  assert.equal(result.iterations, 5);
  assert.deepEqual(
    result.events.filter((event) => event.type === "tool_call").map((event) => event.call.tool),
    ["write_file", "write_file", "write_file", "run_command"]
  );
  assert.equal(evaluation.passed, true);
});

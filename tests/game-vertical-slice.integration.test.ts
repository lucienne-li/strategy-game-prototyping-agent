import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAgent } from "../src/agent/agent-loop.js";
import { B2_FILE_NAME, B2_REQUEST, evaluateB2 } from "../src/evaluation/b2-evaluator.js";
import { B3_REQUEST, evaluateB3 } from "../src/evaluation/b3-evaluator.js";
import { OpenAIResponsesModel } from "../src/model/openai-responses-model.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";

function responseWith(output: unknown[]): Response {
  return new Response(JSON.stringify({ output }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function modelWithResponses(responses: Response[]): OpenAIResponsesModel {
  let index = 0;
  const fakeFetch = (async () => {
    const response = responses[index];
    index += 1;
    if (!response) throw new Error("unexpected model request");
    return response;
  }) as typeof globalThis.fetch;
  return OpenAIResponsesModel.fromEnv({ env: { OPENAI_API_KEY: "test-key" }, fetch: fakeFetch });
}

test("OpenAI adapter contract modifies B2 and passes external evaluation", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b2-adapter-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await copyFile(path.resolve("benchmarks/b2/seed/math.ts"), path.join(workspace, B2_FILE_NAME));
  const model = modelWithResponses([
    responseWith([{ type: "function_call", name: "read_file", arguments: JSON.stringify({ path: B2_FILE_NAME }) }]),
    responseWith([
      {
        type: "function_call",
        name: "write_file",
        arguments: JSON.stringify({
          path: B2_FILE_NAME,
          content: "export function add(a: number, b: number): number {\n  return a + b;\n}\n"
        })
      }
    ]),
    responseWith([
      {
        type: "function_call",
        name: "run_command",
        arguments: JSON.stringify({
          command: "node",
          args: ["--input-type=module", "-e", "const m = await import('./math.ts'); console.log(m.add(2, 3));"]
        })
      }
    ]),
    responseWith([{ type: "message", content: [{ type: "output_text", text: "SUCCESS: B2 verified" }] }])
  ]);

  const result = await runAgent(B2_REQUEST, {
    model,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    maxIterations: 6
  });
  const evaluation = await evaluateB2(workspace);

  assert.equal(result.status, "success");
  assert.equal(result.iterations, 4);
  assert.deepEqual(
    result.events.filter((event) => event.type === "tool_call").map((event) => event.call.tool),
    ["read_file", "write_file", "run_command"]
  );
  assert.equal(evaluation.passed, true);
});

test("OpenAI adapter contract creates B3 and passes external evaluation", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b3-adapter-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const source = [
    "export function createInitialState() {",
    "  return { playerHp: 20, playerEnergy: 3, enemyHp: 20 };",
    "}",
    "export function strike(state: ReturnType<typeof createInitialState>) {",
    "  return { ...state, playerEnergy: state.playerEnergy - 1, enemyHp: state.enemyHp - 6 };",
    "}",
    ""
  ].join("\n");
  const model = modelWithResponses([
    responseWith([
      {
        type: "function_call",
        name: "write_file",
        arguments: JSON.stringify({ path: "card-game.ts", content: source })
      }
    ]),
    responseWith([
      {
        type: "function_call",
        name: "run_command",
        arguments: JSON.stringify({
          command: "node",
          args: [
            "--input-type=module",
            "-e",
            "const m = await import('./card-game.ts'); console.log(JSON.stringify(m.strike(m.createInitialState())));"
          ]
        })
      }
    ]),
    responseWith([{ type: "message", content: [{ type: "output_text", text: "SUCCESS: B3 verified" }] }])
  ]);

  const result = await runAgent(B3_REQUEST, {
    model,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    maxIterations: 6
  });
  const evaluation = await evaluateB3(workspace);

  assert.equal(result.status, "success");
  assert.equal(result.iterations, 3);
  assert.deepEqual(
    result.events.filter((event) => event.type === "tool_call").map((event) => event.call.tool),
    ["write_file", "run_command"]
  );
  assert.equal(evaluation.passed, true);
});

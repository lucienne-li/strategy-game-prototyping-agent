import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { B2_FILE_NAME, evaluateB2 } from "../src/evaluation/b2-evaluator.js";
import { evaluateB3 } from "../src/evaluation/b3-evaluator.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";

test("B2 evaluator rejects the seed bug and accepts a correct modification", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b2-evaluator-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await copyFile(path.resolve("benchmarks/b2/seed/math.ts"), path.join(workspace, B2_FILE_NAME));

  const before = await evaluateB2(workspace);
  assert.equal(before.passed, false);

  const executor = new ToolExecutor({ workspace });
  const write = await executor.execute({
    tool: "write_file",
    path: B2_FILE_NAME,
    content: "export function add(a: number, b: number): number {\n  return a + b;\n}\n"
  });
  assert.equal(write.result.ok, true);

  const after = await evaluateB2(workspace);
  assert.equal(after.passed, true);
  assert.equal(after.stdout.trim(), "B2 evaluator passed");
  assert.equal(after.stderr, "");
  assert.equal(after.exitCode, 0);
});

test("B3 evaluator rejects a missing artifact and accepts the required state transition", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-b3-evaluator-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));

  const missing = await evaluateB3(workspace);
  assert.equal(missing.passed, false);
  assert.equal(missing.fileExists, false);

  const executor = new ToolExecutor({ workspace });
  const write = await executor.execute({
    tool: "write_file",
    path: "card-game.ts",
    content: [
      "export function createInitialState() {",
      "  return { playerHp: 20, playerEnergy: 3, enemyHp: 20 };",
      "}",
      "export function strike(state: ReturnType<typeof createInitialState>) {",
      "  return { ...state, playerEnergy: state.playerEnergy - 1, enemyHp: state.enemyHp - 6 };",
      "}",
      ""
    ].join("\n")
  });
  assert.equal(write.result.ok, true);

  const evaluation = await evaluateB3(workspace);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.stdout.trim(), "B3 evaluator passed");
  assert.equal(evaluation.stderr, "");
  assert.equal(evaluation.exitCode, 0);
});

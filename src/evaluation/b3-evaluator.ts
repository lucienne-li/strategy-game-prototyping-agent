import { lstat } from "node:fs/promises";
import path from "node:path";
import { ToolExecutor } from "../runtime/tool-executor.js";

export const B3_FILE_NAME = "card-game.ts";
export const B3_REQUEST =
  "Create card-game.ts. Export createInitialState(), returning { playerHp: 20, playerEnergy: 3, enemyHp: 20 }, and strike(state), returning the state after spending 1 energy and dealing 6 enemy damage. Run a Node check before finishing.";

export type B3Evaluation = {
  passed: boolean;
  fileExists: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
};

export async function evaluateB3(workspace: string): Promise<B3Evaluation> {
  const target = path.join(workspace, B3_FILE_NAME);
  try {
    const stats = await lstat(target);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return failure(true, `${B3_FILE_NAME} must be a regular file`);
    }
  } catch (error) {
    return failure(false, error instanceof Error ? error.message : `${B3_FILE_NAME} does not exist`);
  }

  const evaluatorScript = [
    "import assert from 'node:assert/strict';",
    "const module = await import('./card-game.ts');",
    "assert.equal(typeof module.createInitialState, 'function');",
    "assert.equal(typeof module.strike, 'function');",
    "const initial = module.createInitialState();",
    "assert.deepEqual(initial, { playerHp: 20, playerEnergy: 3, enemyHp: 20 });",
    "const afterStrike = module.strike(initial);",
    "assert.deepEqual(afterStrike, { playerHp: 20, playerEnergy: 2, enemyHp: 14 });",
    "console.log('B3 evaluator passed');"
  ].join("\n");
  const result = (
    await new ToolExecutor({ workspace, allowedCommands: ["node"] }).execute({
      tool: "run_command",
      command: "node",
      args: ["--input-type=module", "-e", evaluatorScript],
      timeoutMs: 10_000
    })
  ).result;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const passed = result.ok && result.exitCode === 0 && stdout.trim() === "B3 evaluator passed" && stderr === "";
  return {
    passed,
    fileExists: true,
    stdout,
    stderr,
    exitCode: result.exitCode ?? null,
    ...(passed ? {} : { error: result.error ?? "B3 state transition did not satisfy the contract" })
  };
}

function failure(fileExists: boolean, error: string): B3Evaluation {
  return { passed: false, fileExists, stdout: "", stderr: "", exitCode: null, error };
}

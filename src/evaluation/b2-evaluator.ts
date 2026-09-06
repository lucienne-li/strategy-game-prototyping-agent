import { lstat } from "node:fs/promises";
import path from "node:path";
import { ToolExecutor } from "../runtime/tool-executor.js";

export const B2_FILE_NAME = "math.ts";
export const B2_REQUEST =
  "Read the existing math.ts file. Fix add(a, b) so it returns the arithmetic sum while preserving the exported function name and signature. Run a Node check before finishing.";

export type B2Evaluation = {
  passed: boolean;
  fileExists: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
};

export async function evaluateB2(workspace: string): Promise<B2Evaluation> {
  const target = path.join(workspace, B2_FILE_NAME);
  try {
    const stats = await lstat(target);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return failure(true, `${B2_FILE_NAME} must be a regular file`);
    }
  } catch (error) {
    return failure(false, error instanceof Error ? error.message : `${B2_FILE_NAME} does not exist`);
  }

  const evaluatorScript = [
    "import assert from 'node:assert/strict';",
    "const module = await import('./math.ts');",
    "assert.equal(typeof module.add, 'function');",
    "for (const [a, b, expected] of [[2, 3, 5], [-4, 7, 3], [0, 0, 0], [1.5, 2.25, 3.75]]) {",
    "  assert.equal(module.add(a, b), expected);",
    "}",
    "console.log('B2 evaluator passed');"
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
  const passed = result.ok && result.exitCode === 0 && stdout.trim() === "B2 evaluator passed" && stderr === "";
  return {
    passed,
    fileExists: true,
    stdout,
    stderr,
    exitCode: result.exitCode ?? null,
    ...(passed ? {} : { error: result.error ?? "B2 behavior did not satisfy the hidden cases" })
  };
}

function failure(fileExists: boolean, error: string): B2Evaluation {
  return { passed: false, fileExists, stdout: "", stderr: "", exitCode: null, error };
}

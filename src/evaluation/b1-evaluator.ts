import { lstat } from "node:fs/promises";
import path from "node:path";
import { ToolExecutor } from "../runtime/tool-executor.js";

export const B1_FILE_NAME = "hello-agent.ts";
export const B1_REQUEST =
  "Create hello-agent.ts so that running it prints exactly hello agent. Run it with node and verify the output before finishing.";

export type B1Evaluation = {
  passed: boolean;
  fileExists: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
};

export async function evaluateB1(workspace: string): Promise<B1Evaluation> {
  const target = path.join(workspace, B1_FILE_NAME);
  try {
    const stats = await lstat(target);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return {
        passed: false,
        fileExists: true,
        stdout: "",
        stderr: "",
        exitCode: null,
        error: `${B1_FILE_NAME} must be a regular file`
      };
    }
  } catch (error) {
    return {
      passed: false,
      fileExists: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      error: error instanceof Error ? error.message : `${B1_FILE_NAME} does not exist`
    };
  }

  const executor = new ToolExecutor({ workspace, allowedCommands: ["node"] });
  const execution = await executor.execute({
    tool: "run_command",
    command: "node",
    args: [B1_FILE_NAME],
    timeoutMs: 10_000
  });
  const result = execution.result;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const passed = result.ok && result.exitCode === 0 && stdout.trim() === "hello agent" && stderr === "";

  return {
    passed,
    fileExists: true,
    stdout,
    stderr,
    exitCode: result.exitCode ?? null,
    ...(passed ? {} : { error: result.error ?? "output did not match the B1 contract" })
  };
}

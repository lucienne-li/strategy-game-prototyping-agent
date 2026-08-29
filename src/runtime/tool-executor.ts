import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ToolCall, ToolResult } from "../agent/types.js";
import { validateToolCall } from "./validation.js";
import { resolveWorkspaceFile } from "./workspace.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_FILE_BYTES = 1_000_000;
const MAX_OUTPUT_BYTES = 1_000_000;
const FORBIDDEN_NODE_PERMISSION_ARGS = ["--permission", "--no-permission", "--allow-fs-read", "--allow-fs-write", "--allow-child-process", "--allow-worker"];

export type ToolExecutorOptions = {
  workspace: string;
  allowedCommands?: readonly string[];
};

export class ToolExecutor {
  private readonly workspace: string;
  private readonly allowedCommands: Set<string>;

  constructor(options: ToolExecutorOptions) {
    this.workspace = options.workspace;
    this.allowedCommands = new Set(options.allowedCommands ?? ["node"]);
  }

  async execute(rawCall: unknown): Promise<{ call?: ToolCall; result: ToolResult }> {
    let call: ToolCall;
    try {
      call = validateToolCall(rawCall);
    } catch (error) {
      return {
        result: {
          tool: "unknown",
          ok: false,
          error: error instanceof Error ? error.message : "invalid tool call"
        }
      };
    }

    try {
      if (call.tool === "read_file") return { call, result: await this.readFile(call.path) };
      if (call.tool === "write_file") return { call, result: await this.writeFile(call.path, call.content) };
      return { call, result: await this.runCommand(call.command, call.args, call.timeoutMs) };
    } catch (error) {
      return {
        call,
        result: {
          tool: call.tool,
          ok: false,
          error: error instanceof Error ? error.message : "tool execution failed"
        }
      };
    }
  }

  private async readFile(requestedPath: string): Promise<ToolResult> {
    const filePath = resolveWorkspaceFile(this.workspace, requestedPath);
    const content = await readFile(filePath, "utf8");
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
      throw new Error(`file exceeds ${MAX_FILE_BYTES} byte limit`);
    }
    return { tool: "read_file", ok: true, content };
  }

  private async writeFile(requestedPath: string, content: string): Promise<ToolResult> {
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
      throw new Error(`content exceeds ${MAX_FILE_BYTES} byte limit`);
    }
    const filePath = resolveWorkspaceFile(this.workspace, requestedPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
    return { tool: "write_file", ok: true, content: `wrote ${requestedPath}` };
  }

  private async runCommand(command: string, args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ToolResult> {
    if (!this.allowedCommands.has(command)) {
      throw new Error(`command is not allowed: ${command}`);
    }

    const commandArgs = command === "node" ? this.restrictNodeProcess(args) : args;

    return new Promise((resolve) => {
      const child = spawn(command, commandArgs, {
        cwd: this.workspace,
        shell: false,
        env: { PATH: process.env.PATH ?? "" }
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const finish = (result: ToolResult): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      };

      const capture = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString("utf8");
        if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
          child.kill("SIGKILL");
          throw new Error(`command output exceeds ${MAX_OUTPUT_BYTES} byte limit`);
        }
        return next;
      };

      child.stdout.on("data", (chunk: Buffer) => {
        try {
          stdout = capture(stdout, chunk);
        } catch (error) {
          finish({ tool: "run_command", ok: false, stdout, stderr, exitCode: null, error: (error as Error).message });
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        try {
          stderr = capture(stderr, chunk);
        } catch (error) {
          finish({ tool: "run_command", ok: false, stdout, stderr, exitCode: null, error: (error as Error).message });
        }
      });
      child.on("error", (error) => {
        finish({ tool: "run_command", ok: false, stdout, stderr, exitCode: null, error: error.message });
      });
      child.on("close", (exitCode) => {
        finish({ tool: "run_command", ok: exitCode === 0, stdout, stderr, exitCode });
      });

      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish({
          tool: "run_command",
          ok: false,
          stdout,
          stderr,
          exitCode: null,
          error: `command timed out after ${timeoutMs} ms`
        });
      }, timeoutMs);
    });
  }

  private restrictNodeProcess(args: string[]): string[] {
    const forbidden = args.find((arg) => FORBIDDEN_NODE_PERMISSION_ARGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)));
    if (forbidden) throw new Error(`node permission override is not allowed: ${forbidden}`);
    return [
      "--permission",
      `--allow-fs-read=${this.workspace}`,
      `--allow-fs-write=${this.workspace}`,
      ...args
    ];
  }
}

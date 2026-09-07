import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { AgentModel, ModelContext, ModelOutput } from "../agent/types.js";

type WorkerRequest = {
  id: number;
  request: string;
  target_file: string;
  existing_code?: string;
};

type WorkerResponse = {
  id: number;
  ok: boolean;
  code?: string;
  raw?: string;
  error?: string;
};

export interface CodeGenerator {
  generate(request: Omit<WorkerRequest, "id">): Promise<string>;
}

export type LocalQwenWorkerOptions = {
  python: string;
  workerScript: string;
  model: string;
  adapter?: string;
  maxNewTokens?: number;
};

export class LocalQwenWorker implements CodeGenerator {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly lines: Interface;
  private readonly pending = new Map<number, { resolve: (value: string) => void; reject: (reason: Error) => void }>();
  private nextId = 1;
  private stderr = "";

  constructor(options: LocalQwenWorkerOptions) {
    const args = [options.workerScript, "--model", options.model, "--max-new-tokens", String(options.maxNewTokens ?? 512)];
    if (options.adapter) args.push("--adapter", options.adapter);
    this.process = spawn(options.python, args, { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    this.lines = createInterface({ input: this.process.stdout });
    this.lines.on("line", (line) => this.handleLine(line));
    this.process.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-2_000);
    });
    this.process.on("exit", (code) => {
      const error = new Error(`local model worker exited with ${code}${this.stderr ? `: ${this.stderr}` : ""}`);
      for (const item of this.pending.values()) item.reject(error);
      this.pending.clear();
    });
  }

  generate(request: Omit<WorkerRequest, "id">): Promise<string> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(`${JSON.stringify({ id, ...request })}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  async close(): Promise<void> {
    this.lines.close();
    if (this.process.exitCode !== null) return;
    this.process.stdin.end();
    await new Promise<void>((resolve) => this.process.once("exit", () => resolve()));
  }

  private handleLine(line: string): void {
    let response: WorkerResponse;
    try {
      response = JSON.parse(line) as WorkerResponse;
    } catch {
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (!response.ok || !response.code) {
      pending.reject(new Error(response.error ?? "local model returned no code"));
      return;
    }
    pending.resolve(response.code);
  }
}

export type ScaffoldedLocalCodeModelOptions = {
  generator: CodeGenerator;
  targetFile: string;
  readBeforeWrite?: boolean;
  commandTimeoutMs?: number;
};

export class ScaffoldedLocalCodeModel implements AgentModel {
  constructor(private readonly options: ScaffoldedLocalCodeModelOptions) {}

  async next(context: ModelContext): Promise<ModelOutput> {
    const lastResult = [...context.events].reverse().find((event) => event.type === "tool_result");
    const isRepair = context.request.includes("evaluator-guided repair");
    if (context.events.length === 0 && (this.options.readBeforeWrite || isRepair)) {
      return { type: "tool_call", call: { tool: "read_file", path: this.options.targetFile } };
    }

    if (context.events.length === 0 || lastResult?.result.tool === "read_file") {
      const existingCode = lastResult?.result.tool === "read_file" && lastResult.result.ok ? lastResult.result.content : undefined;
      const code = await this.options.generator.generate({
        request: context.request,
        target_file: this.options.targetFile,
        ...(existingCode === undefined ? {} : { existing_code: existingCode })
      });
      return { type: "tool_call", call: { tool: "write_file", path: this.options.targetFile, content: code } };
    }

    if (lastResult?.result.tool === "write_file") {
      return {
        type: "tool_call",
        call: {
          tool: "run_command",
          command: "node",
          args: [this.options.targetFile],
          timeoutMs: this.options.commandTimeoutMs ?? 10_000
        }
      };
    }

    if (lastResult?.result.tool === "run_command") {
      return {
        type: "final",
        status: lastResult.result.ok ? "success" : "failure",
        message: lastResult.result.ok ? "Local code candidate executed without a Node error." : "Generated code failed the Node smoke run."
      };
    }

    return { type: "final", status: "failure", message: "Unexpected local adapter event sequence." };
  }
}

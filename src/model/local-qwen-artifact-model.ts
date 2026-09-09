import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { AgentModel, ModelContext, ModelOutput, ToolCall } from "../agent/types.js";

type Artifact = { files: Array<{ path: string; content: string }> };
type Pending = { resolve: (value: Artifact) => void; reject: (error: Error) => void };
export interface ArtifactGenerator { generate(request: string, existingFiles: Artifact["files"]): Promise<Artifact> }

export class LocalQwenArtifactWorker implements ArtifactGenerator {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly lines: Interface;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private stderr = "";

  constructor(options: { python: string; script: string; model: string; adapter?: string; maxNewTokens: number }) {
    const args = [options.script, "--model", options.model, "--max-new-tokens", String(options.maxNewTokens)];
    if (options.adapter) args.push("--adapter", options.adapter);
    this.process = spawn(options.python, args, { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    this.lines = createInterface({ input: this.process.stdout });
    this.lines.on("line", (line) => this.handleLine(line));
    this.process.stderr.on("data", (chunk: Buffer) => { this.stderr = (this.stderr + chunk.toString("utf8")).slice(-4000); });
    this.process.on("exit", (code) => {
      const error = new Error(`Qwen artifact worker exited with ${code}${this.stderr ? `: ${this.stderr}` : ""}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  generate(request: string, existingFiles: Artifact["files"]): Promise<Artifact> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(`${JSON.stringify({ id, request, existing_files: existingFiles })}\n`, (error) => {
        if (error) { this.pending.delete(id); reject(error); }
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
    let response: { id: number; ok: boolean; artifact?: Artifact; error?: string };
    try { response = JSON.parse(line) as typeof response; } catch { return; }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (!response.ok || !response.artifact) pending.reject(new Error(response.error ?? "worker returned no artifact"));
    else pending.resolve(response.artifact);
  }
}

export class ScaffoldedArtifactAgentModel implements AgentModel {
  private paths: string[] = [];
  private generatedForRequest: string | undefined;

  constructor(private readonly worker: ArtifactGenerator) {}

  async next(context: ModelContext): Promise<ModelOutput> {
    const repair = context.request.includes("evaluator-guided repair");
    if (context.events.length === 0) {
      if (!repair) this.paths = [];
      this.generatedForRequest = undefined;
      if (repair && this.paths.length) {
        return { type: "tool_calls", calls: this.paths.map((path): ToolCall => ({ tool: "read_file", path })) };
      }
      const requestedReads = [...context.request.matchAll(/\bRead\s+`?([A-Za-z0-9_./-]+\.(?:ts|js|html|mjs))`?/gi)]
        .map((match) => match[1]);
      if (requestedReads.length) {
        this.paths = [...new Set(requestedReads)].slice(0, 8);
        return { type: "tool_calls", calls: this.paths.map((path): ToolCall => ({ tool: "read_file", path })) };
      }
      return this.generateWrites(context.request, []);
    }
    const results = context.events.filter((event) => event.type === "tool_result");
    const last = results.at(-1)?.result;
    if (last?.tool === "read_file" && !this.generatedForRequest) {
      const existing = pairReadResults(context);
      return this.generateWrites(context.request, existing);
    }
    if (last?.tool === "write_file") {
      if (this.paths.includes("project.mjs")) {
        return { type: "tool_call", call: { tool: "run_command", command: "node", args: ["project.mjs", "build"], timeoutMs: 10_000 } };
      }
      return { type: "final", status: "success", message: "Generated artifact files." };
    }
    if (last?.tool === "run_command") {
      return { type: "final", status: last.ok ? "success" : "failure", message: last.ok ? "Generated and built artifact." : "Artifact build failed." };
    }
    return { type: "final", status: "failure", message: "Unexpected artifact adapter state." };
  }

  private async generateWrites(request: string, existing: Artifact["files"]): Promise<ModelOutput> {
    const artifact = await this.worker.generate(request, existing);
    this.paths = artifact.files.map((file) => file.path);
    this.generatedForRequest = request;
    return { type: "tool_calls", calls: artifact.files.map((file) => ({ tool: "write_file", path: file.path, content: file.content })) };
  }
}

function pairReadResults(context: ModelContext): Artifact["files"] {
  const files: Artifact["files"] = [];
  for (let index = 0; index < context.events.length - 1; index += 1) {
    const call = context.events[index];
    const result = context.events[index + 1];
    if (call.type === "tool_call" && call.call.tool === "read_file" && result.type === "tool_result" && result.result.ok) {
      files.push({ path: call.call.path, content: result.result.content ?? "" });
    }
  }
  return files;
}

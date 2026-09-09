import { randomUUID } from "node:crypto";
import { lstat, mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ServerResponse } from "node:http";
import type { AgentModel, ModelContext, ModelOutput, ToolResult } from "../agent/types.js";
import { B4_REQUEST, evaluateB4, type B4Evaluation } from "../evaluation/b4-evaluator.js";
import { OpenAIResponsesModel } from "../model/openai-responses-model.js";
import { runWithEvaluatorRepair } from "../repair/evaluator-repair-loop.js";
import { ToolExecutor } from "../runtime/tool-executor.js";
import { createDemoModel } from "./demo-project.js";

export type WebMode = "demo" | "live";
export type ProgressKind = "info" | "tool" | "success" | "error" | "repair" | "preview";

export type ProgressEvent = {
  id: number;
  at: string;
  kind: ProgressKind;
  label: string;
  detail?: string;
};

type VisualSubmission = {
  passed: boolean;
  rendered: boolean;
  nonBlank: boolean;
  controlsVisible: boolean;
  noObviousOverflow: boolean;
  interactionPassed: boolean;
  error?: string;
};

export type WebSession = {
  id: string;
  mode: WebMode;
  request: string;
  workspace: string;
  status: "running" | "success" | "failure";
  events: ProgressEvent[];
  finalResponse?: string;
  evaluation?: B4Evaluation;
  clients: Set<ServerResponse>;
  visualWaiter?: { resolve: (value: VisualSubmission) => void; timer: NodeJS.Timeout };
  pendingVisual?: VisualSubmission;
};

export class SessionManager {
  readonly liveAvailable = Boolean(process.env.OPENAI_API_KEY);
  private readonly sessions = new Map<string, WebSession>();

  async create(request: string, mode: WebMode): Promise<WebSession> {
    if (mode === "live" && !this.liveAvailable) throw new Error("Live generation is unavailable because OPENAI_API_KEY is not configured");
    const session: WebSession = {
      id: randomUUID(), mode, request, workspace: await mkdtemp(path.join(os.tmpdir(), "strategy-web-")),
      status: "running", events: [], clients: new Set()
    };
    this.sessions.set(session.id, session);
    setImmediate(() => void this.run(session));
    return session;
  }

  get(id: string): WebSession | undefined {
    return this.sessions.get(id);
  }

  publicView(session: WebSession) {
    return {
      id: session.id, mode: session.mode, request: session.request, status: session.status,
      events: session.events, finalResponse: session.finalResponse, evaluation: session.evaluation
    };
  }

  subscribe(session: WebSession, response: ServerResponse): void {
    session.clients.add(response);
    for (const event of session.events) response.write(`data: ${JSON.stringify(event)}\n\n`);
    response.on("close", () => session.clients.delete(response));
  }

  reportVisual(session: WebSession, result: VisualSubmission): void {
    const waiter = session.visualWaiter;
    if (!waiter) {
      session.pendingVisual = result;
      return;
    }
    clearTimeout(waiter.timer);
    session.visualWaiter = undefined;
    waiter.resolve(result);
  }

  async files(session: WebSession): Promise<string[]> {
    return walkFiles(session.workspace);
  }

  async file(session: WebSession, relativePath: string): Promise<string> {
    const allowed = await this.files(session);
    if (!allowed.includes(relativePath)) throw new Error("file is not part of the generated project");
    return readFile(path.join(session.workspace, relativePath), "utf8");
  }

  private emit(session: WebSession, kind: ProgressKind, label: string, detail?: string): void {
    const event = { id: session.events.length + 1, at: new Date().toISOString(), kind, label, ...(detail ? { detail } : {}) };
    session.events.push(event);
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of session.clients) client.write(payload);
  }

  private async run(session: WebSession): Promise<void> {
    this.emit(session, "info", "Understanding request", session.mode === "demo" ? "Loading the verified Card Combat path" : "Preparing the Card Combat implementation contract");
    const baseModel = session.mode === "demo"
      ? createDemoModel()
      : OpenAIResponsesModel.fromEnv({ maxOutputTokens: 4096 });
    const model = new ReportingModel(baseModel, (kind, label, detail) => this.emit(session, kind, label, detail));
    const executor = new ReportingExecutor(
      { workspace: session.workspace, allowedCommands: ["node"] },
      (result) => this.emit(session, result.ok ? "success" : "error", result.tool, summarizeToolResult(result))
    );
    const targetRequest = session.mode === "demo"
      ? session.request
      : `${session.request}\n\nThe generated deliverable must also satisfy this fixed playable Card Combat contract:\n${B4_REQUEST}`;

    try {
      const result = await runWithEvaluatorRepair(targetRequest, {
        model,
        executor,
        maxRepairs: session.mode === "demo" ? 0 : 1,
        maxIterationsPerAgentRun: 6,
        maxToolCallsPerIteration: 8,
        evaluator: async () => {
          session.pendingVisual = undefined;
          this.emit(session, "info", "Evaluating", "Build, functional, launch, and browser interaction checks");
          this.emit(session, "preview", "Preview ready", "Running an independent browser interaction check");
          const evaluation = await evaluateB4(session.workspace, {
            visualEvaluator: async () => this.waitForVisual(session)
          });
          this.emit(session, evaluation.passed ? "success" : "error", evaluation.passed ? "Evaluation passed" : "Evaluator failed", evaluation.error);
          return evaluation;
        }
      });
      session.evaluation = result.finalEvaluation;
      session.finalResponse = result.attempts.at(-1)?.agentResult.message ?? "Agent run finished";
      session.status = result.status === "success" ? "success" : "failure";
      this.emit(session, session.status === "success" ? "success" : "error", session.status === "success" ? "Complete" : "Stopped", session.finalResponse);
    } catch (error) {
      session.status = "failure";
      session.finalResponse = error instanceof Error ? error.message : "Web Agent run failed";
      this.emit(session, "error", "Run failed", session.finalResponse);
    }
  }

  private waitForVisual(session: WebSession): Promise<VisualSubmission> {
    if (session.pendingVisual) {
      const result = session.pendingVisual;
      session.pendingVisual = undefined;
      return Promise.resolve(result);
    }
    if (session.visualWaiter) {
      clearTimeout(session.visualWaiter.timer);
      session.visualWaiter.resolve(visualFailure("superseded by a new evaluation round"));
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        session.visualWaiter = undefined;
        resolve(visualFailure("browser interaction check timed out"));
      }, 20_000);
      session.visualWaiter = { resolve, timer };
    });
  }
}

class ReportingModel implements AgentModel {
  private repairingReported = false;
  constructor(private readonly model: AgentModel, private readonly report: (kind: ProgressKind, label: string, detail?: string) => void) {}

  async next(context: ModelContext): Promise<ModelOutput> {
    if (context.request.includes("External evaluator result:") && !this.repairingReported) {
      this.repairingReported = true;
      this.report("repair", "Repairing", "Evaluator feedback returned to the model");
    } else if (context.iteration === 1) {
      this.report("info", "Generating files", `Agent attempt started`);
    }
    const output = await this.model.next(context);
    const calls = output.type === "tool_calls" ? output.calls : output.type === "tool_call" ? [output.call] : [];
    for (const call of calls) {
      const tool = typeof call === "object" && call !== null && "tool" in call ? String(call.tool) : "invalid_tool";
      this.report("tool", tool, "Queued by model");
    }
    return output;
  }
}

class ReportingExecutor extends ToolExecutor {
  constructor(options: ConstructorParameters<typeof ToolExecutor>[0], private readonly report: (result: ToolResult) => void) {
    super(options);
  }

  override async execute(rawCall: unknown) {
    const result = await super.execute(rawCall);
    this.report(result.result);
    return result;
  }
}

async function walkFiles(root: string, current = ""): Promise<string[]> {
  const directory = path.join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const relative = path.posix.join(current, entry.name);
    const absolute = path.join(root, relative);
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) files.push(...await walkFiles(root, relative));
    else if (stats.isFile()) files.push(relative);
  }
  return files;
}

function summarizeToolResult(result: ToolResult): string {
  if (!result.ok) return result.error ?? "Tool failed";
  if (result.tool === "run_command") return `exit ${result.exitCode}; ${(result.stdout ?? "").trim() || "no stdout"}`;
  return result.content?.slice(0, 160) ?? "Completed";
}

function visualFailure(error: string): VisualSubmission {
  return { passed: false, rendered: false, nonBlank: false, controlsVisible: false, noObviousOverflow: false, interactionPassed: false, error };
}

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentModel } from "../agent/types.js";
import { runWithEvaluatorRepair } from "../repair/evaluator-repair-loop.js";
import { ToolExecutor } from "../runtime/tool-executor.js";
import {
  AGENT_BENCHMARK_TASKS,
  AGENT_BENCHMARK_VERSION,
  evaluateAgentBenchmarkTask,
  normalizeAgentBenchmarkEvaluation,
  prepareAgentBenchmarkWorkspace,
  type AgentBenchmarkCategory,
  type AgentBenchmarkDifficulty,
  type AgentBenchmarkEvaluation,
  type AgentBenchmarkTask
} from "./agent-benchmark-v1.js";

export const AGENT_BENCHMARK_BUDGET = {
  maxIterationsPerAgentRun: 6,
  maxToolCallsPerIteration: 8,
  maxToolCallsPerAgentRun: 48,
  repairBudget: 1,
  commandTimeoutMs: 10_000
} as const;

export const AGENT_BENCHMARK_MODEL_SETTINGS = {
  gpt: {
    toolChoice: "auto",
    sampling: "provider-managed",
    maxOutputTokens: 4096
  },
  qwen: {
    doSample: false,
    maxNewTokens: 4096,
    thinking: false
  }
} as const;

export type AgentBenchmarkRunOptions = {
  model: AgentModel;
  modelName: string;
  tasks?: readonly AgentBenchmarkTask[];
  reportPath?: string;
  modelSettings?: object;
};

type AgentBenchmarkTaskResult = {
  taskId: string;
  category: AgentBenchmarkCategory;
  difficulty: AgentBenchmarkDifficulty;
  familyId: string;
  evaluatorId: string;
  success: boolean;
  firstPassSuccess: boolean;
  buildPass: boolean;
  functionalPass: boolean;
  visualPass: boolean | null;
  repairAttempted: boolean;
  repairSuccess: boolean;
  repairsUsed: number;
  agentIterations: number;
  toolCalls: number;
  failedToolCalls: number;
  reachedRepairLimit: boolean;
  workspace: string;
  attempts: Array<{
    attempt: number;
    phase: "initial" | "repair";
    agentStatus: "success" | "failure" | "max_iterations";
    agentIterations: number;
    toolCalls: string[];
    evaluation: AgentBenchmarkEvaluation;
  }>;
};

export async function runAgentBenchmarkV1(options: AgentBenchmarkRunOptions) {
  const tasks = options.tasks ?? AGENT_BENCHMARK_TASKS;
  const results: AgentBenchmarkTaskResult[] = [];

  for (const task of tasks) {
    const workspace = await mkdtemp(path.join(os.tmpdir(), `agent-benchmark-v1-${task.id.toLowerCase()}-`));
    await prepareAgentBenchmarkWorkspace(workspace, task);
    const result = await runWithEvaluatorRepair(task.targetRequest, {
      model: options.model,
      executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
      evaluator: () => evaluateAgentBenchmarkTask(workspace, task),
      initialRequest: task.initialRequest,
      maxRepairs: AGENT_BENCHMARK_BUDGET.repairBudget,
      maxIterationsPerAgentRun: AGENT_BENCHMARK_BUDGET.maxIterationsPerAgentRun,
      maxToolCallsPerIteration: AGENT_BENCHMARK_BUDGET.maxToolCallsPerIteration
    });
    const final = normalizeAgentBenchmarkEvaluation(result.finalEvaluation);
    const first = normalizeAgentBenchmarkEvaluation(result.attempts[0].evaluation);
    const events = result.attempts.flatMap((attempt) => attempt.agentResult.events);
    const toolResults = events.filter((event) => event.type === "tool_result");
    const failedToolCalls = toolResults.filter((event) => !event.result.ok).length;
    results.push({
      taskId: task.id,
      category: task.category,
      difficulty: task.difficulty,
      familyId: task.familyId,
      evaluatorId: task.evaluatorId,
      success: final.passed,
      firstPassSuccess: first.passed,
      buildPass: final.buildPass,
      functionalPass: final.functionalPass,
      visualPass: final.visualPass,
      repairAttempted: result.attempts.length > 1,
      repairSuccess: !first.passed && final.passed,
      repairsUsed: result.repairsUsed,
      agentIterations: result.attempts.reduce((sum, attempt) => sum + attempt.agentResult.iterations, 0),
      toolCalls: toolResults.length,
      failedToolCalls,
      reachedRepairLimit: result.status === "repair_limit_reached",
      workspace,
      attempts: result.attempts.map((attempt) => ({
        attempt: attempt.attempt,
        phase: attempt.phase,
        agentStatus: attempt.agentResult.status,
        agentIterations: attempt.agentResult.iterations,
        toolCalls: attempt.agentResult.events
          .filter((event) => event.type === "tool_call")
          .map((event) => event.call.tool),
        evaluation: attempt.evaluation
      }))
    });
  }

  const summarize = (items: typeof results) => {
    const repairAttempts = items.filter((result) => result.repairAttempted);
    const totalToolCalls = items.reduce((sum, result) => sum + result.toolCalls, 0);
    const totalFailedToolCalls = items.reduce((sum, result) => sum + result.failedToolCalls, 0);
    const visualTasks = items.filter((result) => result.visualPass !== null);
    const rate = (count: number, denominator = items.length) => denominator === 0 ? null : count / denominator;
    return {
      tasks: items.length,
      taskSuccessRate: rate(items.filter((result) => result.success).length),
      firstPassSuccessRate: rate(items.filter((result) => result.firstPassSuccess).length),
      buildPassRate: rate(items.filter((result) => result.buildPass).length),
      functionalPassRate: rate(items.filter((result) => result.functionalPass).length),
      visualPassRate: rate(visualTasks.filter((result) => result.visualPass).length, visualTasks.length),
      repairSuccessRate: rate(repairAttempts.filter((result) => result.repairSuccess).length, repairAttempts.length),
      averageRepairsUsed: items.length === 0 ? null : items.reduce((sum, result) => sum + result.repairsUsed, 0) / items.length,
      averageAgentIterations: items.length === 0 ? null : items.reduce((sum, result) => sum + result.agentIterations, 0) / items.length,
      toolCallFailureRate: rate(totalFailedToolCalls, totalToolCalls)
    };
  };
  const report = {
    benchmark: AGENT_BENCHMARK_VERSION,
    model: options.modelName,
    modelSettings: options.modelSettings ?? null,
    tasks: results.length,
    budget: AGENT_BENCHMARK_BUDGET,
    summary: summarize(results),
    byCategory: Object.fromEntries(
      [...new Set(tasks.map((task) => task.category))]
        .map((category) => [category, summarize(results.filter((result) => result.category === category))])
    ),
    byDifficulty: Object.fromEntries(
      (["D1", "D2", "D3", "D4"] as const)
        .map((difficulty) => [difficulty, summarize(results.filter((result) => result.difficulty === difficulty))])
    ),
    results
  };

  if (options.reportPath) {
    await mkdir(path.dirname(options.reportPath), { recursive: true });
    await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

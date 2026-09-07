import { runAgent } from "../agent/agent-loop.js";
import type { AgentModel, AgentRunResult } from "../agent/types.js";
import { ToolExecutor } from "../runtime/tool-executor.js";

export type ExternalEvaluation = {
  passed: boolean;
};

export type RepairAttempt<T extends ExternalEvaluation> = {
  attempt: number;
  phase: "initial" | "repair";
  request: string;
  agentResult: AgentRunResult;
  evaluation: T;
};

export type EvaluatorRepairResult<T extends ExternalEvaluation> = {
  status: "success" | "repair_limit_reached";
  repairsUsed: number;
  attempts: RepairAttempt<T>[];
  finalEvaluation: T;
};

export type EvaluatorRepairOptions<T extends ExternalEvaluation> = {
  model: AgentModel;
  executor: ToolExecutor;
  evaluator: () => Promise<T>;
  initialRequest?: string;
  maxRepairs?: number;
  maxIterationsPerAgentRun?: number;
  maxToolCallsPerIteration?: number;
};

export async function runWithEvaluatorRepair<T extends ExternalEvaluation>(
  originalRequest: string,
  options: EvaluatorRepairOptions<T>
): Promise<EvaluatorRepairResult<T>> {
  const maxRepairs = options.maxRepairs ?? 2;
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0) {
    throw new Error("maxRepairs must be a non-negative integer");
  }

  const attempts: RepairAttempt<T>[] = [];
  let request = options.initialRequest ?? originalRequest;

  for (let attemptIndex = 0; attemptIndex <= maxRepairs; attemptIndex += 1) {
    const agentResult = await runAgent(request, {
      model: options.model,
      executor: options.executor,
      maxIterations: options.maxIterationsPerAgentRun,
      maxToolCallsPerIteration: options.maxToolCallsPerIteration
    });
    const evaluation = await options.evaluator();
    attempts.push({
      attempt: attemptIndex + 1,
      phase: attemptIndex === 0 ? "initial" : "repair",
      request,
      agentResult,
      evaluation
    });

    if (evaluation.passed) {
      return {
        status: "success",
        repairsUsed: attemptIndex,
        attempts,
        finalEvaluation: evaluation
      };
    }

    if (attemptIndex < maxRepairs) {
      request = createRepairRequest(originalRequest, evaluation, attemptIndex + 1, maxRepairs);
    }
  }

  return {
    status: "repair_limit_reached",
    repairsUsed: maxRepairs,
    attempts,
    finalEvaluation: attempts.at(-1)!.evaluation
  };
}

function createRepairRequest<T extends ExternalEvaluation>(
  originalRequest: string,
  evaluation: T,
  repairNumber: number,
  maxRepairs: number
): string {
  return [
    "Continue working in the existing task workspace.",
    `This is evaluator-guided repair ${repairNumber} of at most ${maxRepairs}.`,
    "Inspect the existing files and fix the implementation so the original request passes.",
    "Do not modify or replace the external evaluator; it is outside your workspace.",
    "Original request:",
    originalRequest,
    "External evaluator result:",
    JSON.stringify(evaluation, null, 2),
    "Run the relevant allowed build or test command and inspect its Observation before finishing."
  ].join("\n\n");
}

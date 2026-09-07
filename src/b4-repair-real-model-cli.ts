import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { B4_REPAIR_INITIAL_REQUEST, B4_REPAIR_TARGET_REQUEST } from "./evaluation/b4-repair-benchmark.js";
import { evaluateB4 } from "./evaluation/b4-evaluator.js";
import { OpenAIResponsesModel } from "./model/openai-responses-model.js";
import { runWithEvaluatorRepair } from "./repair/evaluator-repair-loop.js";
import { ToolExecutor } from "./runtime/tool-executor.js";

const workspace = await mkdtemp(path.join(os.tmpdir(), "strategy-agent-b4-repair-"));
const maxRepairs = 2;

try {
  const model = OpenAIResponsesModel.fromEnv();
  const result = await runWithEvaluatorRepair(B4_REPAIR_TARGET_REQUEST, {
    model,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    evaluator: () => evaluateB4(workspace),
    initialRequest: B4_REPAIR_INITIAL_REQUEST,
    maxRepairs,
    maxIterationsPerAgentRun: 6
  });

  console.log(
    JSON.stringify(
      {
        benchmark: "B4-REPAIR",
        model: model.modelName,
        workspace,
        workspaceRetained: true,
        repairLimit: maxRepairs,
        status: result.status,
        repairsUsed: result.repairsUsed,
        reachedRepairLimit: result.status === "repair_limit_reached",
        attempts: result.attempts.map((attempt) => ({
          attempt: attempt.attempt,
          phase: attempt.phase,
          agentStatus: attempt.agentResult.status,
          agentIterations: attempt.agentResult.iterations,
          toolCalls: attempt.agentResult.events
            .filter((event) => event.type === "tool_call")
            .map((event) => event.call.tool),
          finalMessage: attempt.agentResult.message,
          evaluation: attempt.evaluation
        })),
        finalEvaluation: result.finalEvaluation
      },
      null,
      2
    )
  );
  process.exitCode = result.status === "success" && result.finalEvaluation.passed ? 0 : 1;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        benchmark: "B4-REPAIR",
        workspace,
        workspaceRetained: true,
        error: error instanceof Error ? error.message : "B4-REPAIR run failed"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

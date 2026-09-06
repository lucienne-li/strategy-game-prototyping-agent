import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAgent } from "./agent/agent-loop.js";
import { B4_REQUEST, evaluateB4 } from "./evaluation/b4-evaluator.js";
import { OpenAIResponsesModel } from "./model/openai-responses-model.js";
import { ToolExecutor } from "./runtime/tool-executor.js";

const workspace = await mkdtemp(path.join(os.tmpdir(), "strategy-agent-b4-"));

try {
  const model = OpenAIResponsesModel.fromEnv();
  const agentResult = await runAgent(B4_REQUEST, {
    model,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    maxIterations: 6
  });
  const evaluation = await evaluateB4(workspace);
  const toolCalls = agentResult.events
    .filter((event) => event.type === "tool_call")
    .map((event) => event.call.tool);

  console.log(
    JSON.stringify(
      {
        benchmark: "B4",
        model: model.modelName,
        workspace,
        workspaceRetained: true,
        agentStatus: agentResult.status,
        agentIterations: agentResult.iterations,
        toolCalls,
        finalMessage: agentResult.message,
        evaluation
      },
      null,
      2
    )
  );
  process.exitCode = evaluation.passed ? 0 : 1;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        benchmark: "B4",
        workspace,
        workspaceRetained: true,
        error: error instanceof Error ? error.message : "B4 run failed"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAgent } from "./agent/agent-loop.js";
import { B1_REQUEST, evaluateB1 } from "./evaluation/b1-evaluator.js";
import { OpenAIResponsesModel } from "./model/openai-responses-model.js";
import { ToolExecutor } from "./runtime/tool-executor.js";

const workspace = await mkdtemp(path.join(os.tmpdir(), "strategy-agent-b1-"));

try {
  const model = OpenAIResponsesModel.fromEnv();
  const agentResult = await runAgent(B1_REQUEST, {
    model,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    maxIterations: 6
  });
  const evaluation = await evaluateB1(workspace);
  const toolCalls = agentResult.events
    .filter((event) => event.type === "tool_call")
    .map((event) => event.call.tool);

  console.log(
    JSON.stringify(
      {
        model: model.modelName,
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
      { error: error instanceof Error ? error.message : "B1 real-model run failed" },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  await rm(workspace, { recursive: true, force: true });
}

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAgent } from "./agent/agent-loop.js";
import { B3_REQUEST, evaluateB3 } from "./evaluation/b3-evaluator.js";
import { OpenAIResponsesModel } from "./model/openai-responses-model.js";
import { ToolExecutor } from "./runtime/tool-executor.js";

const workspace = await mkdtemp(path.join(os.tmpdir(), "strategy-agent-b3-"));

try {
  const model = OpenAIResponsesModel.fromEnv();
  const agentResult = await runAgent(B3_REQUEST, {
    model,
    executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
    maxIterations: 6
  });
  const evaluation = await evaluateB3(workspace);
  const toolCalls = agentResult.events
    .filter((event) => event.type === "tool_call")
    .map((event) => event.call.tool);

  console.log(
    JSON.stringify(
      {
        benchmark: "B3",
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
  console.error(JSON.stringify({ benchmark: "B3", error: error instanceof Error ? error.message : "B3 run failed" }, null, 2));
  process.exitCode = 1;
} finally {
  await rm(workspace, { recursive: true, force: true });
}

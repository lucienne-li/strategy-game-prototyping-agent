import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentBenchmarkV1 } from "./evaluation/agent-benchmark-runner.js";
import { AGENT_BENCHMARK_MODEL_SETTINGS } from "./evaluation/agent-benchmark-runner.js";
import { OpenAIResponsesModel } from "./model/openai-responses-model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportPath = process.env.AGENT_BENCHMARK_REPORT
  ?? path.join(root, "artifacts/agent-benchmark-v1/gpt-5.6-run.json");

try {
  const model = OpenAIResponsesModel.fromEnv({ maxOutputTokens: AGENT_BENCHMARK_MODEL_SETTINGS.gpt.maxOutputTokens });
  const report = await runAgentBenchmarkV1({
    model,
    modelName: model.modelName,
    modelSettings: AGENT_BENCHMARK_MODEL_SETTINGS.gpt,
    reportPath
  });
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    benchmark: "agent-benchmark-v1",
    error: error instanceof Error ? error.message : "benchmark run failed"
  }, null, 2));
  process.exitCode = 1;
}

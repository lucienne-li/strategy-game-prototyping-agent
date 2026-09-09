import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentBenchmarkV1, AGENT_BENCHMARK_MODEL_SETTINGS } from "./evaluation/agent-benchmark-runner.js";
import { LocalQwenArtifactWorker, ScaffoldedArtifactAgentModel } from "./model/local-qwen-artifact-model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const freezePath = path.join(root, "data_pipeline/v3/freeze-manifest.json");
const freeze = JSON.parse(await readFile(freezePath, "utf8")) as { status: string; training: { base_model: string };
  dataset: { path: string; sha256: string }; benchmark: { freeze_name: string; manifest_sha256: string } };
if (freeze.status !== "frozen" || freeze.benchmark.freeze_name !== "agent-benchmark-v1-final") {
  throw new Error("frozen Data v3 and Agent Benchmark v1 are required");
}
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
if (digest(await readFile(path.join(root, freeze.dataset.path))) !== freeze.dataset.sha256) throw new Error("frozen dataset hash mismatch");
if (digest(await readFile(path.join(root, "evals/agent_benchmark_v1/freeze-manifest.json"))) !== freeze.benchmark.manifest_sha256) {
  throw new Error("Agent Benchmark v1 manifest changed after dataset freeze");
}
const python = process.env.SFT_PYTHON ?? path.join(root, ".venv/bin/python");
const workerScript = path.join(root, "training/final/agent_worker.py");
const adapter = process.env.SFT_ADAPTER ?? path.join(root, "artifacts/final-sft/checkpoint-final");
const reportPath = process.env.SFT_FINAL_EVALUATION_REPORT ?? path.join(root, "artifacts/final-sft/base-vs-sft.json");
const variants = [{ name: "base", adapter: undefined }, { name: "sft", adapter }] as const;
const reports: unknown[] = [];

for (const variant of variants) {
  const worker = new LocalQwenArtifactWorker({ python, script: workerScript, model: freeze.training.base_model,
    adapter: variant.adapter, maxNewTokens: AGENT_BENCHMARK_MODEL_SETTINGS.qwen.maxNewTokens });
  try {
    const model = new ScaffoldedArtifactAgentModel(worker);
    reports.push(addRequestedGroups(await runAgentBenchmarkV1({ model, modelName: `${freeze.training.base_model}-${variant.name}`,
      modelSettings: AGENT_BENCHMARK_MODEL_SETTINGS.qwen })));
  } finally {
    await worker.close();
  }
}

const output = { benchmark: "agent-benchmark-v1-final", baseModel: freeze.training.base_model,
  decoding: AGENT_BENCHMARK_MODEL_SETTINGS.qwen, variants: reports };
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, variants: reports }, null, 2));

type Result = { taskId: string; success: boolean; firstPassSuccess: boolean; buildPass: boolean; functionalPass: boolean;
  repairAttempted: boolean; repairSuccess: boolean; repairsUsed: number; agentIterations: number; toolCalls: number; failedToolCalls: number };

function addRequestedGroups<T extends { results: Result[] }>(report: T) {
  const domains: Record<string, string[]> = {
    card: ["ABV1-GL-01", "ABV1-GL-04", "ABV1-GL-05", "ABV1-GL-06", "ABV1-GL-07", "ABV1-GL-08", "ABV1-GL-12", "ABV1-GL-13", "ABV1-PJ-01", "ABV1-PJ-04", "ABV1-RP-01", "ABV1-RP-02"],
    tactics: ["ABV1-CG-02", "ABV1-CG-03", "ABV1-CG-04", "ABV1-GL-02", "ABV1-GL-03", "ABV1-GL-09", "ABV1-GL-14", "ABV1-PJ-02", "ABV1-RP-03"],
    towerDefense: ["ABV1-GL-10", "ABV1-GL-11", "ABV1-PJ-03"]
  };
  const taskTypes: Record<string, (result: Result) => boolean> = {
    generation: (result) => /^ABV1-(CG|GL|PJ)-/.test(result.taskId),
    modification: (result) => /^ABV1-CM-/.test(result.taskId),
    bugFixing: (result) => /^ABV1-RP-/.test(result.taskId)
  };
  return { ...report,
    byGameDomain: Object.fromEntries(Object.entries(domains).map(([name, ids]) => [name, summarize(report.results.filter((item) => ids.includes(item.taskId)))])),
    byTaskType: Object.fromEntries(Object.entries(taskTypes).map(([name, select]) => [name, summarize(report.results.filter(select))])) };
}

function summarize(items: Result[]) {
  const repairs = items.filter((item) => item.repairAttempted); const tools = items.reduce((sum, item) => sum + item.toolCalls, 0);
  const rate = (count: number, total = items.length) => total ? count / total : null;
  return { tasks: items.length, taskSuccessRate: rate(items.filter((item) => item.success).length),
    firstPassSuccessRate: rate(items.filter((item) => item.firstPassSuccess).length),
    buildPassRate: rate(items.filter((item) => item.buildPass).length), functionalPassRate: rate(items.filter((item) => item.functionalPass).length),
    repairSuccessRate: rate(repairs.filter((item) => item.repairSuccess).length, repairs.length),
    averageRepairsUsed: items.length ? items.reduce((sum, item) => sum + item.repairsUsed, 0) / items.length : null,
    averageAgentIterations: items.length ? items.reduce((sum, item) => sum + item.agentIterations, 0) / items.length : null,
    toolCallFailureRate: rate(items.reduce((sum, item) => sum + item.failedToolCalls, 0), tools) };
}

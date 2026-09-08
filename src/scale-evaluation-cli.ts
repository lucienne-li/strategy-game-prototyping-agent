import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateHoldout, prepareHoldoutWorkspace } from "./evaluation/sft-holdout.js";
import { SCALE_HOLDOUT_TASKS } from "./evaluation/scale-holdout.js";
import { LocalQwenWorker, ScaffoldedLocalCodeModel } from "./model/local-qwen-code-model.js";
import { runWithEvaluatorRepair } from "./repair/evaluator-repair-loop.js";
import { ToolExecutor } from "./runtime/tool-executor.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = process.env.SFT_PYTHON ?? path.join(root, ".venv/bin/python");
const workerScript = path.join(root, "training/local_model_worker.py");
const baseModel = process.env.SFT_BASE_MODEL ?? "Qwen/Qwen3-4B";
const adapter = process.env.SFT_ADAPTER ?? path.join(root, "artifacts/sft-scale/checkpoint-final");
const dataset = process.env.SFT_DATASET ?? path.join(root, "data_pipeline/scale/accepted.jsonl");
const reportPath = process.env.SFT_EVALUATION_REPORT ?? path.join(root, "artifacts/sft-scale/comparison-run.json");
const freezePath = process.env.SFT_FREEZE ?? path.join(root, "data_pipeline/scale/freeze-manifest.json");
const freeze = JSON.parse(await readFile(freezePath, "utf8")) as {
  freeze_name: string;
  dataset: { sha256: string; samples: number };
  holdout: { tasks: string[]; count: number };
  experiment: {
    base_model: string;
    decoding: { do_sample: boolean; max_new_tokens: number; thinking: boolean };
    agent: { max_iterations: number; max_tool_calls_per_iteration: number; repair_budget: number };
  };
};
const datasetBytes = await readFile(dataset);
const datasetSha256 = createHash("sha256").update(datasetBytes).digest("hex");
if (datasetSha256 !== freeze.dataset.sha256) throw new Error("dataset does not match frozen SHA-256");
if (baseModel !== freeze.experiment.base_model) throw new Error("base model does not match frozen experiment");
const actualTaskIds = [...SCALE_HOLDOUT_TASKS.map((task) => task.id)].sort();
if (JSON.stringify(actualTaskIds) !== JSON.stringify([...freeze.holdout.tasks].sort())) throw new Error("holdout tasks do not match freeze manifest");
if (freeze.holdout.count !== SCALE_HOLDOUT_TASKS.length) throw new Error("holdout count does not match freeze manifest");
const frozenAgent = freeze.experiment.agent;
if (frozenAgent.max_iterations !== 4 || frozenAgent.max_tool_calls_per_iteration !== 8 || frozenAgent.repair_budget !== 1) {
  throw new Error("Agent budgets do not match frozen evaluation CLI");
}
if (freeze.experiment.decoding.do_sample || freeze.experiment.decoding.max_new_tokens !== 512 || freeze.experiment.decoding.thinking) {
  throw new Error("decoding settings do not match frozen evaluation CLI");
}
const trainingFamilies = new Set(
  (await readFile(dataset, "utf8")).split("\n").filter(Boolean)
    .map((line) => (JSON.parse(line) as { metadata: { repository_family_id: string } }).metadata.repository_family_id)
);
const leaked = SCALE_HOLDOUT_TASKS.map((task) => task.familyId).filter((family) => trainingFamilies.has(family));
if (leaked.length) throw new Error(`holdout repository-family leakage: ${leaked.join(", ")}`);
const variants = [{ name: "base", adapter: undefined }, { name: "sft", adapter }] as const;
const report = {
  baseModel,
  freezeName: freeze.freeze_name,
  datasetSha256,
  dataset,
  trainingFamilies: trainingFamilies.size,
  holdoutTasks: SCALE_HOLDOUT_TASKS.length,
  holdoutFamilyLeakage: leaked.length,
  maxIterations: 4,
  repairBudget: 1,
  maxNewTokens: 512,
  variants: [] as unknown[]
};

for (const variant of variants) {
  const worker = new LocalQwenWorker({ python, workerScript, model: baseModel, adapter: variant.adapter, maxNewTokens: 512, device: "auto" });
  const results = [];
  try {
    for (const task of SCALE_HOLDOUT_TASKS) {
      const workspace = await mkdtemp(path.join(os.tmpdir(), `scale-${variant.name}-${task.id.toLowerCase()}-`));
      await prepareHoldoutWorkspace(workspace, task);
      const model = new ScaffoldedLocalCodeModel({ generator: worker, targetFile: task.targetFile, readBeforeWrite: task.seed !== undefined });
      const result = await runWithEvaluatorRepair(task.request, {
        model,
        executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
        evaluator: () => evaluateHoldout(workspace, task),
        maxRepairs: 1,
        maxIterationsPerAgentRun: 4,
        maxToolCallsPerIteration: 8,
      });
      results.push({
        taskId: task.id,
        familyId: task.familyId,
        success: result.finalEvaluation.passed,
        buildPass: result.finalEvaluation.buildPass,
        functionalPass: result.finalEvaluation.functionalPass,
        firstPassSuccess: result.attempts[0].evaluation.passed,
        repairsUsed: result.repairsUsed,
        reachedRepairLimit: result.status === "repair_limit_reached",
        attempts: result.attempts.map((attempt) => ({
          phase: attempt.phase,
          agentStatus: attempt.agentResult.status,
          iterations: attempt.agentResult.iterations,
          toolCalls: attempt.agentResult.events.filter((event) => event.type === "tool_call").map((event) => event.call.tool),
          evaluation: attempt.evaluation,
        })),
      });
      console.error(`${variant.name} ${task.id}: ${result.finalEvaluation.passed ? "PASS" : "FAIL"}`);
    }
  } finally {
    await worker.close();
  }
  report.variants.push({
    name: variant.name,
    adapter: variant.adapter ?? null,
    summary: {
      tasks: results.length,
      taskSuccess: results.filter((item) => item.success).length,
      buildPass: results.filter((item) => item.buildPass).length,
      functionalPass: results.filter((item) => item.functionalPass).length,
      firstPassSuccess: results.filter((item) => item.firstPassSuccess).length,
      totalRepairsUsed: results.reduce((sum, item) => sum + item.repairsUsed, 0),
      repairLimitReached: results.filter((item) => item.reachedRepairLimit).length,
    },
    results,
  });
}
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, reportPath }, null, 2));

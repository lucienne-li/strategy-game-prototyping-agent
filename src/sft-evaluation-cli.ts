import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateHoldout, prepareHoldoutWorkspace, SFT_HOLDOUT_TASKS } from "./evaluation/sft-holdout.js";
import { LocalQwenWorker, ScaffoldedLocalCodeModel } from "./model/local-qwen-code-model.js";
import { runWithEvaluatorRepair } from "./repair/evaluator-repair-loop.js";
import { ToolExecutor } from "./runtime/tool-executor.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = process.env.SFT_PYTHON ?? path.join(root, ".venv/bin/python");
const workerScript = path.join(root, "training/local_model_worker.py");
const baseModel = process.env.SFT_BASE_MODEL ?? "Qwen/Qwen2.5-Coder-0.5B-Instruct";
const adapter = process.env.SFT_ADAPTER ?? path.join(root, "artifacts/sft-evaluation/checkpoint-final");
const dataset = path.join(root, "data_pipeline/samples/accepted-v2.jsonl");
const reportPath = process.env.SFT_EVALUATION_REPORT ?? path.join(root, "artifacts/sft-evaluation/comparison-run.json");
const trainingFamilies = new Set(
  (await readFile(dataset, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => (JSON.parse(line) as { metadata: { repository_family_id: string } }).metadata.repository_family_id)
);
const leakedFamilies = SFT_HOLDOUT_TASKS.map((task) => task.familyId).filter((family) => trainingFamilies.has(family));
if (leakedFamilies.length > 0) throw new Error(`holdout repository-family leakage: ${leakedFamilies.join(", ")}`);
const variants = [
  { name: "base", adapter: undefined },
  { name: "sft", adapter }
] as const;
const report = {
  baseModel,
  dataset,
  trainingFamilies: trainingFamilies.size,
  holdoutFamilyLeakage: leakedFamilies.length,
  maxIterations: 4,
  repairBudget: 1,
  maxNewTokens: 512,
  tasks: SFT_HOLDOUT_TASKS.length,
  variants: [] as unknown[]
};

for (const variant of variants) {
  const worker = new LocalQwenWorker({ python, workerScript, model: baseModel, adapter: variant.adapter, maxNewTokens: 512 });
  const results = [];
  try {
    for (const task of SFT_HOLDOUT_TASKS) {
      const workspace = await mkdtemp(path.join(os.tmpdir(), `sft-${variant.name}-${task.id.toLowerCase()}-`));
      await prepareHoldoutWorkspace(workspace, task);
      const model = new ScaffoldedLocalCodeModel({ generator: worker, targetFile: task.targetFile, readBeforeWrite: task.seed !== undefined });
      const result = await runWithEvaluatorRepair(task.request, {
        model,
        executor: new ToolExecutor({ workspace, allowedCommands: ["node"] }),
        evaluator: () => evaluateHoldout(workspace, task),
        maxRepairs: 1,
        maxIterationsPerAgentRun: 4,
        maxToolCallsPerIteration: 8
      });
      results.push({
        taskId: task.id,
        familyId: task.familyId,
        workspace,
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
          evaluation: attempt.evaluation
        }))
      });
      console.error(`${variant.name} ${task.id}: ${result.finalEvaluation.passed ? "PASS" : "FAIL"}`);
    }
  } finally {
    await worker.close();
  }
  report.variants.push({ name: variant.name, adapter: variant.adapter ?? null, results });
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, reportPath }, null, 2));

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentModel } from "../src/agent/types.js";
import {
  AGENT_BENCHMARK_TASKS,
  evaluateAgentBenchmarkTask,
  prepareAgentBenchmarkWorkspace
} from "../src/evaluation/agent-benchmark-v1.js";
import { AGENT_BENCHMARK_BUDGET, runAgentBenchmarkV1 } from "../src/evaluation/agent-benchmark-runner.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";
import { referenceProjectScript } from "./fixtures/b4-reference.js";

const EXPECTED_DISTRIBUTION = {
  "code-generation": 4,
  "code-modification": 4,
  "game-logic": 12,
  "project-browser-game": 2,
  "repair-self-correction": 3
};

test("Agent Benchmark v1 freezes 25 unique family-isolated tasks and budgets", async () => {
  assert.equal(AGENT_BENCHMARK_TASKS.length, 25);
  assert.equal(new Set(AGENT_BENCHMARK_TASKS.map((task) => task.id)).size, 25);
  assert.equal(new Set(AGENT_BENCHMARK_TASKS.map((task) => task.familyId)).size, 25);
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECTED_DISTRIBUTION).map((category) => [
      category,
      AGENT_BENCHMARK_TASKS.filter((task) => task.category === category).length
    ])),
    EXPECTED_DISTRIBUTION
  );
  const trainingFamilies = new Set(
    (await readFile("data_pipeline/scale/units.jsonl", "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as { repository_family_id: string })
      .map((unit) => unit.repository_family_id)
  );
  assert.deepEqual(AGENT_BENCHMARK_TASKS.filter((task) => trainingFamilies.has(task.familyId)), []);
  assert.deepEqual(AGENT_BENCHMARK_BUDGET, {
    maxIterationsPerAgentRun: 6,
    maxToolCallsPerIteration: 8,
    maxToolCallsPerAgentRun: 48,
    repairBudget: 1,
    commandTimeoutMs: 10_000
  });
  for (const task of AGENT_BENCHMARK_TASKS) {
    assert.match(task.evaluatorId, /^external-evaluator-v1:/);
    if (task.category === "repair-self-correction") {
      assert.ok(task.initialRequest);
      assert.notEqual(task.initialRequest, task.targetRequest);
    }
  }
});

test("freeze manifest matches task IDs, model budgets and executable source hashes", async () => {
  const freeze = JSON.parse(await readFile("evals/agent_benchmark_v1/freeze-manifest.json", "utf8")) as {
    task_count: number;
    task_ids: string[];
    evaluator_version: string;
    family_isolation: { training_repository_family_overlap: number };
    runtime_budget: Record<string, unknown>;
    sha256: Record<string, string>;
  };
  assert.equal(freeze.task_count, AGENT_BENCHMARK_TASKS.length);
  assert.deepEqual(freeze.task_ids, AGENT_BENCHMARK_TASKS.map((task) => task.id));
  assert.equal(freeze.evaluator_version, "external-evaluator-v1");
  assert.equal(freeze.family_isolation.training_repository_family_overlap, 0);
  assert.equal(freeze.runtime_budget.max_iterations_per_agent_run, AGENT_BENCHMARK_BUDGET.maxIterationsPerAgentRun);
  assert.equal(freeze.runtime_budget.max_tool_calls_per_iteration, AGENT_BENCHMARK_BUDGET.maxToolCallsPerIteration);
  assert.equal(freeze.runtime_budget.repair_budget, AGENT_BENCHMARK_BUDGET.repairBudget);
  for (const [file, expected] of Object.entries(freeze.sha256)) {
    const actual = createHash("sha256").update(await readFile(file)).digest("hex");
    assert.equal(actual, expected, `${file} differs from the frozen contract`);
  }
  const catalog = JSON.parse(await readFile("evals/agent_benchmark_v1/tasks.json", "utf8")) as {
    tasks: Array<{ id: string; category: string }>;
  };
  assert.deepEqual(
    catalog.tasks.map(({ id, category }) => ({ id, category })),
    AGENT_BENCHMARK_TASKS.map(({ id, category }) => ({ id, category }))
  );
});

test("the tactics project external evaluator accepts a complete gold browser project", async () => {
  const task = AGENT_BENCHMARK_TASKS.find((candidate) => candidate.id === "ABV1-PJ-02");
  assert.ok(task);
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-benchmark-tactics-gold-"));
  await prepareAgentBenchmarkWorkspace(workspace, task);
  await mkdir(path.join(workspace, "src"), { recursive: true });
  const html = `<!doctype html><html><body>
    <span id="player-hp"></span><span id="action-points"></span><span id="enemy-hp"></span>
    <button id="attack-button">Attack</button><script type="module" src="./dist/game.js"></script>
  </body></html>`;
  const game = `export function createInitialState(){return {playerHp:20,actionPoints:2,enemyHp:12}}
export function attack(state){return {...state,actionPoints:state.actionPoints-1,enemyHp:state.enemyHp-4}}
export function mountGame(documentRef){let state=createInitialState();const hp=documentRef.getElementById('player-hp');const ap=documentRef.getElementById('action-points');const enemy=documentRef.getElementById('enemy-hp');const button=documentRef.getElementById('attack-button');const render=()=>{hp.textContent=String(state.playerHp);ap.textContent=String(state.actionPoints);enemy.textContent=String(state.enemyHp)};button.addEventListener('click',()=>{state=attack(state);render()});render()}
if(typeof document!=='undefined')mountGame(document);`;
  await Promise.all([
    writeFile(path.join(workspace, "index.html"), html, "utf8"),
    writeFile(path.join(workspace, "src/game.ts"), game, "utf8"),
    writeFile(path.join(workspace, "project.mjs"), referenceProjectScript, "utf8")
  ]);
  const build = await new ToolExecutor({ workspace }).execute({
    tool: "run_command", command: "node", args: ["project.mjs", "build"]
  });
  assert.equal(build.result.ok, true);
  const result = await evaluateAgentBenchmarkTask(workspace, task);
  assert.equal(result.passed, true, "error" in result ? result.error : undefined);
});

test("modification seeds fail before an Agent fixes them", async () => {
  for (const task of AGENT_BENCHMARK_TASKS.filter((candidate) => candidate.category === "code-modification")) {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-benchmark-mod-seed-"));
    await prepareAgentBenchmarkWorkspace(workspace, task);
    const result = await evaluateAgentBenchmarkTask(workspace, task);
    assert.equal(result.passed, false, `${task.id} seed unexpectedly passed`);
  }
});

test("benchmark runner reports the frozen aggregate metrics", async () => {
  const task = AGENT_BENCHMARK_TASKS.find((candidate) => candidate.id === "ABV1-CG-01");
  assert.ok(task);
  const model: AgentModel = {
    async next(context) {
      if (context.events.length === 0) {
        return { type: "tool_call", call: { tool: "write_file", path: "hello-agent.ts", content: "console.log('hello agent');\n" } };
      }
      return { type: "final", status: "success", message: "created the requested file" };
    }
  };
  const report = await runAgentBenchmarkV1({ model, modelName: "deterministic-test", tasks: [task] });
  assert.equal(report.summary.taskSuccessRate, 1);
  assert.equal(report.summary.firstPassSuccessRate, 1);
  assert.equal(report.summary.buildPassRate, 1);
  assert.equal(report.summary.functionalPassRate, 1);
  assert.equal(report.summary.repairSuccessRate, null);
  assert.equal(report.summary.averageRepairsUsed, 0);
  assert.equal(report.summary.averageAgentIterations, 2);
  assert.equal(report.summary.toolCallFailureRate, 0);
});

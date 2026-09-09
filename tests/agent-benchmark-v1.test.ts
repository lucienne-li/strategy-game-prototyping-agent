import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import type { AgentModel } from "../src/agent/types.js";
import {
  AGENT_BENCHMARK_TASKS,
  evaluateAgentBenchmarkTask,
  prepareAgentBenchmarkWorkspace
} from "../src/evaluation/agent-benchmark-v1.js";
import { AGENT_BENCHMARK_BUDGET, runAgentBenchmarkV1 } from "../src/evaluation/agent-benchmark-runner.js";
import { ToolExecutor } from "../src/runtime/tool-executor.js";
import { evaluateBrowserProject } from "../src/evaluation/b4-evaluator.js";
import { passingVisualEvaluator, referenceGame, referenceIndex, referenceProjectScript } from "./fixtures/b4-reference.js";

const EXPECTED_DISTRIBUTION = {
  "code-generation": 4,
  "code-modification": 4,
  "game-logic": 14,
  "project-browser-game": 5,
  "repair-self-correction": 3
};

const EXPECTED_DIFFICULTY = { D1: 10, D2: 12, D3: 2, D4: 6 };

test("Agent Benchmark v1 freezes 30 unique family-isolated tasks, difficulties and budgets", async () => {
  assert.equal(AGENT_BENCHMARK_TASKS.length, 30);
  assert.equal(new Set(AGENT_BENCHMARK_TASKS.map((task) => task.id)).size, 30);
  assert.equal(new Set(AGENT_BENCHMARK_TASKS.map((task) => task.familyId)).size, 30);
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECTED_DISTRIBUTION).map((category) => [
      category,
      AGENT_BENCHMARK_TASKS.filter((task) => task.category === category).length
    ])),
    EXPECTED_DISTRIBUTION
  );
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECTED_DIFFICULTY).map((difficulty) => [
      difficulty,
      AGENT_BENCHMARK_TASKS.filter((task) => task.difficulty === difficulty).length
    ])),
    EXPECTED_DIFFICULTY
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
    assert.match(task.evaluatorId, /^external-evaluator-v1\.1:/);
    if (task.category === "repair-self-correction") {
      assert.ok(task.initialRequest);
      assert.notEqual(task.initialRequest, task.targetRequest);
    }
  }
  for (const task of AGENT_BENCHMARK_TASKS.filter((candidate) => candidate.category === "project-browser-game")) {
    assert.equal(task.difficulty, "D4");
    assert.equal(task.kind, "browser-project");
    if (task.kind === "browser-project") {
      assert.ok(task.contract.visual.requiredVisibleSelectors.length >= 4);
      assert.ok(task.contract.visual.interaction.expectations.length >= 1);
    }
  }
});

test("freeze manifest matches task IDs, model budgets and executable source hashes", async () => {
  const freeze = JSON.parse(await readFile("evals/agent_benchmark_v1/freeze-manifest.json", "utf8")) as {
    task_count: number;
    task_ids: string[];
    evaluator_version: string;
    difficulty_distribution: Record<string, number>;
    family_isolation: { training_repository_family_overlap: number };
    runtime_budget: Record<string, unknown>;
    sha256: Record<string, string>;
  };
  assert.equal(freeze.task_count, AGENT_BENCHMARK_TASKS.length);
  assert.deepEqual(freeze.task_ids, AGENT_BENCHMARK_TASKS.map((task) => task.id));
  assert.equal(freeze.evaluator_version, "external-evaluator-v1.1");
  assert.deepEqual(freeze.difficulty_distribution, EXPECTED_DIFFICULTY);
  assert.equal(freeze.family_isolation.training_repository_family_overlap, 0);
  assert.equal(freeze.runtime_budget.max_iterations_per_agent_run, AGENT_BENCHMARK_BUDGET.maxIterationsPerAgentRun);
  assert.equal(freeze.runtime_budget.max_tool_calls_per_iteration, AGENT_BENCHMARK_BUDGET.maxToolCallsPerIteration);
  assert.equal(freeze.runtime_budget.repair_budget, AGENT_BENCHMARK_BUDGET.repairBudget);
  for (const [file, expected] of Object.entries(freeze.sha256)) {
    const actual = createHash("sha256").update(await readFile(file)).digest("hex");
    assert.equal(actual, expected, `${file} differs from the frozen contract`);
  }
  const catalog = JSON.parse(await readFile("evals/agent_benchmark_v1/tasks.json", "utf8")) as {
    tasks: Array<{ id: string; category: string; difficulty: string }>;
  };
  assert.deepEqual(
    catalog.tasks.map(({ id, category, difficulty }) => ({ id, category, difficulty })),
    AGENT_BENCHMARK_TASKS.map(({ id, category, difficulty }) => ({ id, category, difficulty }))
  );
  const freezeHashLine = (await readFile("evals/agent_benchmark_v1/freeze-manifest.sha256", "utf8")).trim();
  const expectedFreezeHash = freezeHashLine.split(/\s+/)[0];
  const actualFreezeHash = createHash("sha256")
    .update(await readFile("evals/agent_benchmark_v1/freeze-manifest.json"))
    .digest("hex");
  assert.equal(actualFreezeHash, expectedFreezeHash);
});

test("all five project contracts accept independent gold multi-file projects", async () => {
  for (const task of AGENT_BENCHMARK_TASKS.filter((candidate) => candidate.category === "project-browser-game")) {
    assert.equal(task.kind, "browser-project");
    if (task.kind !== "browser-project") continue;
    const workspace = await mkdtemp(path.join(os.tmpdir(), `agent-benchmark-${task.id.toLowerCase()}-gold-`));
    await writeGoldProject(workspace, task.id);
    const result = await evaluateBrowserProject(workspace, task.contract, { visualEvaluator: passingVisualEvaluator });
    assert.equal(result.passed, true, result.error);
    assert.equal(result.visualPassed, true);
  }
});

test("Playwright performs a real render and interaction for the card gold project", {
  skip: !existsSync(chromium.executablePath())
}, async () => {
  const task = AGENT_BENCHMARK_TASKS.find((candidate) => candidate.id === "ABV1-PJ-01");
  assert.ok(task);
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-benchmark-playwright-gold-"));
  await writeGoldProject(workspace, task.id);
  const result = await evaluateAgentBenchmarkTask(workspace, task);
  assert.equal(result.passed, true, "error" in result ? result.error : undefined);
  if ("visualPassed" in result) assert.equal(result.visualPassed, true);
});

test("modification seeds fail before an Agent fixes them", async () => {
  for (const task of AGENT_BENCHMARK_TASKS.filter((candidate) => candidate.category === "code-modification")) {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "agent-benchmark-mod-seed-"));
    await prepareAgentBenchmarkWorkspace(workspace, task);
    const result = await evaluateAgentBenchmarkTask(workspace, task);
    assert.equal(result.passed, false, `${task.id} seed unexpectedly passed`);
  }
});

test("D3 tasks require and accept genuine multi-system state transitions", async () => {
  const implementations: Record<string, string> = {
    "ABV1-GL-13": `export function playCard(state,card){if(card.cost<0||card.damage<0||card.cost>state.energy)return {...state};return {...state,energy:state.energy-card.cost,enemyHp:Math.max(0,state.enemyHp-card.damage),discardPile:[...state.discardPile,card.id]}}
export function endTurn(state){const drawn=state.deck.slice(0,2);return {...state,energy:3,hand:drawn,deck:state.deck.slice(drawn.length),discardPile:[...state.discardPile,...state.hand],turn:state.turn+1}}`,
    "ABV1-GL-14": `export function resolveTurn(state,action){if(state.actionPoints<1||state.battleStatus!=='ongoing')return {...state};if(action.type==='move'){const distance=Math.abs(action.x-state.player.x)+Math.abs(action.y-state.player.y);if(distance!==1||action.x<0||action.x>=4||action.y<0||action.y>=4)return {...state};return {...state,actionPoints:state.actionPoints-1,player:{x:action.x,y:action.y}}}if(action.type==='attack'){const distance=Math.abs(state.enemy.x-state.player.x)+Math.abs(state.enemy.y-state.player.y);if(distance!==1)return {...state};const hp=Math.max(0,state.enemy.hp-5);return {...state,actionPoints:state.actionPoints-1,enemy:{...state.enemy,hp},battleStatus:hp===0?'victory':state.battleStatus}}return {...state}}`
  };
  for (const task of AGENT_BENCHMARK_TASKS.filter((candidate) => candidate.difficulty === "D3")) {
    const workspace = await mkdtemp(path.join(os.tmpdir(), `agent-benchmark-${task.id.toLowerCase()}-`));
    await prepareAgentBenchmarkWorkspace(workspace, task);
    assert.equal(task.kind, "single-file");
    if (task.kind !== "single-file") continue;
    await writeFile(path.join(workspace, task.holdout.targetFile), implementations[task.id] ?? "", "utf8");
    const result = await evaluateAgentBenchmarkTask(workspace, task);
    assert.equal(result.passed, true, result.error);
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
  assert.equal(report.summary.visualPassRate, null);
  assert.equal(report.summary.repairSuccessRate, null);
  assert.equal(report.summary.averageRepairsUsed, 0);
  assert.equal(report.summary.averageAgentIterations, 2);
  assert.equal(report.summary.toolCallFailureRate, 0);
});

async function writeGoldProject(workspace: string, taskId: string): Promise<void> {
  const projects: Record<string, { html: string; game: string }> = {
    "ABV1-PJ-01": { html: referenceIndex, game: referenceGame },
    "ABV1-PJ-02": projectGold(["player-hp", "action-points", "enemy-hp"], "attack-button", "attack", { playerHp: 20, actionPoints: 2, enemyHp: 12 }, { playerHp: 20, actionPoints: 1, enemyHp: 8 }),
    "ABV1-PJ-03": projectGold(["gold", "wave", "enemy-hp"], "fire-button", "fire", { gold: 10, wave: 1, enemyHp: 12 }, { gold: 10, wave: 1, enemyHp: 8 }),
    "ABV1-PJ-04": projectGold(["deck-count", "hand-count", "energy"], "draw-button", "drawCard", { deckCount: 5, handCount: 0, energy: 3 }, { deckCount: 4, handCount: 1, energy: 3 }),
    "ABV1-PJ-05": projectGold(["wood", "workers", "turn"], "gather-button", "gather", { wood: 0, workers: 2, turn: 1 }, { wood: 4, workers: 2, turn: 2 })
  };
  const project = projects[taskId];
  assert.ok(project, `missing gold project ${taskId}`);
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await Promise.all([
    writeFile(path.join(workspace, "index.html"), project.html, "utf8"),
    writeFile(path.join(workspace, "src/game.ts"), project.game, "utf8"),
    writeFile(path.join(workspace, "project.mjs"), referenceProjectScript, "utf8")
  ]);
  const build = await new ToolExecutor({ workspace }).execute({ tool: "run_command", command: "node", args: ["project.mjs", "build"] });
  assert.equal(build.result.ok, true);
}

function projectGold(
  stateIds: readonly string[], buttonId: string, actionName: string,
  initial: Record<string, number>, next: Record<string, number>
): { html: string; game: string } {
  const camel = (value: string) => value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const html = `<!doctype html><html><body><main>${stateIds.map((id) => `<p>${id}: <span id="${id}"></span></p>`).join("")}<button id="${buttonId}">Act</button></main><script type="module" src="./dist/game.js"></script></body></html>`;
  const render = stateIds.map((id) => `documentRef.getElementById('${id}').textContent=String(state.${camel(id)});`).join("");
  const game = `export function createInitialState(){return ${JSON.stringify(initial)}}
export function ${actionName}(state){return ${JSON.stringify(next).replace(/"([A-Za-z][A-Za-z0-9]*)":/g, "$1:")}}
export function mountGame(documentRef){let state=createInitialState();const render=()=>{${render}};documentRef.getElementById('${buttonId}').addEventListener('click',()=>{state=${actionName}(state);render()});render()}
if(typeof document!=='undefined')mountGame(document);`;
  return { html, game };
}

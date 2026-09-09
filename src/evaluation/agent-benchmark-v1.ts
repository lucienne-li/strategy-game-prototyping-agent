import { mkdir } from "node:fs/promises";
import type { B4Evaluation, BrowserProjectContract } from "./b4-evaluator.js";
import { B4_REQUEST, evaluateB4, evaluateBrowserProject } from "./b4-evaluator.js";
import { B4_REPAIR_INITIAL_REQUEST } from "./b4-repair-benchmark.js";
import { SCALE_HOLDOUT_TASKS } from "./scale-holdout.js";
import { evaluateHoldout, prepareHoldoutWorkspace, type HoldoutEvaluation, type HoldoutTask } from "./sft-holdout.js";

export const AGENT_BENCHMARK_VERSION = "agent-benchmark-v1";
export const EVALUATOR_VERSION = "external-evaluator-v1";

export type AgentBenchmarkCategory =
  | "code-generation"
  | "code-modification"
  | "game-logic"
  | "project-browser-game"
  | "repair-self-correction";

type BenchmarkBase = {
  id: string;
  category: AgentBenchmarkCategory;
  familyId: string;
  targetRequest: string;
  initialRequest?: string;
  evaluatorId: string;
};

export type SingleFileBenchmarkTask = BenchmarkBase & {
  kind: "single-file";
  holdout: HoldoutTask;
};

export type BrowserBenchmarkTask = BenchmarkBase & {
  kind: "browser-project";
  evaluator: (workspace: string) => Promise<B4Evaluation>;
};

export type AgentBenchmarkTask = SingleFileBenchmarkTask | BrowserBenchmarkTask;
export type AgentBenchmarkEvaluation = HoldoutEvaluation | B4Evaluation;

const byLegacyId = new Map(SCALE_HOLDOUT_TASKS.map((task) => [task.id, task]));

function sourceTask(id: string): HoldoutTask {
  const task = byLegacyId.get(id);
  if (!task) throw new Error(`missing source benchmark task: ${id}`);
  return task;
}

function single(
  id: string,
  category: AgentBenchmarkCategory,
  sourceId: string,
  overrides: Partial<Pick<HoldoutTask, "request" | "seed">> = {},
  initialRequest?: string
): SingleFileBenchmarkTask {
  const source = sourceTask(sourceId);
  const holdout = {
    ...source,
    ...overrides,
    id,
    familyId: `${AGENT_BENCHMARK_VERSION}:${id.toLowerCase()}`
  };
  return {
    id,
    category,
    familyId: holdout.familyId,
    targetRequest: holdout.request,
    ...(initialRequest ? { initialRequest } : {}),
    evaluatorId: `${EVALUATOR_VERSION}:${id.toLowerCase()}`,
    kind: "single-file",
    holdout
  };
}

const TACTICS_REQUEST = [
  "Create a complete no-dependency Browser + TypeScript tactics prototype in the empty workspace.",
  "Create index.html with visible values whose element IDs are player-hp, action-points, and enemy-hp, plus a button with ID attack-button.",
  "Create src/game.ts as browser-compatible TypeScript exporting createInitialState(), attack(state), and mountGame(document).",
  "The initial state is playerHp 20, actionPoints 2, enemyHp 12. One attack costs 1 action point and deals 4 enemy damage; return a new state without mutating the input.",
  "mountGame must render the initial values and update action points and enemy HP when attack-button is clicked.",
  "Create project.mjs with build and serve modes. Build copies src/game.ts to dist/game.js. Serve index.html and dist/game.js over HTTP using PORT or 4173.",
  "index.html must load ./dist/game.js as a module. The module may auto-mount in a browser but must be importable without a global document.",
  "Run node project.mjs build before finishing. Use only index.html, src/game.ts, and project.mjs as source files."
].join(" ");

const TACTICS_CONTRACT: BrowserProjectContract = {
  requiredFiles: ["index.html", "src/game.ts", "project.mjs", "dist/game.js"],
  sourceFile: "src/game.ts",
  buildArtifact: "dist/game.js",
  expectedStdout: "tactics evaluator passed",
  pageMarkers: ["player-hp", "action-points", "enemy-hp", "attack-button"],
  moduleMarkers: ["createInitialState", "attack", "mountGame"],
  createEvaluatorScript: (html) => [
    "import assert from 'node:assert/strict';",
    "const game = await import('./dist/game.js');",
    "assert.equal(typeof game.createInitialState, 'function');",
    "assert.equal(typeof game.attack, 'function');",
    "assert.equal(typeof game.mountGame, 'function');",
    "const initial = game.createInitialState();",
    "assert.deepEqual(initial, { playerHp: 20, actionPoints: 2, enemyHp: 12 });",
    "assert.deepEqual(game.attack(initial), { playerHp: 20, actionPoints: 1, enemyHp: 8 });",
    "assert.deepEqual(initial, { playerHp: 20, actionPoints: 2, enemyHp: 12 });",
    "const listeners = new Map();",
    "const elements = new Map(['player-hp','action-points','enemy-hp','attack-button'].map((id) => [id, { textContent: '', disabled: false, addEventListener(type, listener) { listeners.set(`${id}:${type}`, listener); } }]));",
    "const fakeDocument = { getElementById(id) { return elements.get(id) ?? null; } };",
    "game.mountGame(fakeDocument);",
    "assert.equal(elements.get('player-hp').textContent, '20');",
    "assert.equal(elements.get('action-points').textContent, '2');",
    "assert.equal(elements.get('enemy-hp').textContent, '12');",
    "const click = listeners.get('attack-button:click'); assert.equal(typeof click, 'function'); click();",
    "assert.equal(elements.get('action-points').textContent, '1');",
    "assert.equal(elements.get('enemy-hp').textContent, '8');",
    `const expectedHtml = ${JSON.stringify(html)};`,
    "for (const id of ['player-hp','action-points','enemy-hp','attack-button']) assert.match(expectedHtml, new RegExp(`id\\s*=\\s*[\"']${id}[\"']`));",
    "const moduleTag = expectedHtml.match(/<script\\b[^>]*>/gi)?.find((tag) => /src\\s*=\\s*[\"']\\.\\/dist\\/game\\.js[\"']/i.test(tag));",
    "assert.ok(moduleTag); assert.match(moduleTag, /type\\s*=\\s*[\"']module[\"']/i);",
    "console.log('tactics evaluator passed');"
  ].join("\n")
};

function browser(
  id: string,
  targetRequest: string,
  evaluatorId: string,
  evaluator: (workspace: string) => Promise<B4Evaluation>,
  initialRequest?: string,
  category: AgentBenchmarkCategory = "project-browser-game"
): BrowserBenchmarkTask {
  return {
    id,
    category,
    familyId: `${AGENT_BENCHMARK_VERSION}:${id.toLowerCase()}`,
    targetRequest,
    ...(initialRequest ? { initialRequest } : {}),
    evaluatorId: `${EVALUATOR_VERSION}:${evaluatorId}`,
    kind: "browser-project",
    evaluator
  };
}

export const AGENT_BENCHMARK_TASKS: readonly AgentBenchmarkTask[] = [
  single("ABV1-CG-01", "code-generation", "H1_HELLO_FILE"),
  single("ABV1-CG-02", "code-generation", "H4_GRID_NEIGHBORS"),
  single("ABV1-CG-03", "code-generation", "H13_HEX_NEIGHBORS"),
  single("ABV1-CG-04", "code-generation", "H14_MANHATTAN"),

  single("ABV1-CM-01", "code-modification", "H2_FIX_ADD"),
  single("ABV1-CM-02", "code-modification", "H10_SPEND_ENERGY", {
    request: "Read energy.ts and fix spendEnergy(state, cost). For a non-negative affordable cost, return a new state with energy reduced by cost; otherwise return a new unchanged state. Never mutate the input.",
    seed: "export function spendEnergy(state: any, cost: number) { return { ...state, energy: state.energy + cost }; }\n"
  }),
  single("ABV1-CM-03", "code-modification", "H16_LOWEST_HP", {
    request: "Read target.ts and fix selectLowestHp(enemies). Ignore enemies with alive false, return the living enemy with the lowest hp, preserve input order for ties, or return null when none are alive.",
    seed: "export function selectLowestHp(enemies: any[]) { return enemies.filter((enemy) => enemy.alive).at(-1) ?? null; }\n"
  }),
  single("ABV1-CM-04", "code-modification", "H21_RESOURCE_TICK", {
    request: "Read resources.ts and fix produceResources(state, turns). Return a new state adding productionPerTurn times non-negative whole turns; floor fractional turns, treat negative turns as zero, and do not mutate input.",
    seed: "export function produceResources(state: any, turns: number) { state.resources += state.productionPerTurn * Math.ceil(turns); return state; }\n"
  }),

  single("ABV1-GL-01", "game-logic", "H3_CARD_STRIKE"),
  single("ABV1-GL-02", "game-logic", "H5_NEAREST_TARGET"),
  single("ABV1-GL-03", "game-logic", "H6_TURN_ORDER"),
  single("ABV1-GL-04", "game-logic", "H07_DRAW_CARDS"),
  single("ABV1-GL-05", "game-logic", "H08_GAIN_BLOCK"),
  single("ABV1-GL-06", "game-logic", "H09_APPLY_DAMAGE"),
  single("ABV1-GL-07", "game-logic", "H11_DISCARD_HAND"),
  single("ABV1-GL-08", "game-logic", "H12_POISON_TICK"),
  single("ABV1-GL-09", "game-logic", "H15_MOVEMENT_RANGE"),
  single("ABV1-GL-10", "game-logic", "H18_TOWER_COOLDOWN"),
  single("ABV1-GL-11", "game-logic", "H19_TOWER_UPGRADE"),
  single("ABV1-GL-12", "game-logic", "H22_VICTORY"),

  browser("ABV1-PJ-01", B4_REQUEST, "browser-card", evaluateB4),
  browser("ABV1-PJ-02", TACTICS_REQUEST, "browser-tactics", (workspace) => evaluateBrowserProject(workspace, TACTICS_CONTRACT)),

  browser("ABV1-RP-01", B4_REQUEST, "browser-card-repair", evaluateB4, B4_REPAIR_INITIAL_REQUEST, "repair-self-correction"),
  single(
    "ABV1-RP-02",
    "repair-self-correction",
    "H23_CARD_PLAYABLE",
    {},
    sourceTask("H23_CARD_PLAYABLE").request.replace(
      "negative-cost cards and unaffordable cards are excluded",
      "for this controlled first attempt, deliberately include negative-cost cards when they are otherwise affordable"
    )
  ),
  single(
    "ABV1-RP-03",
    "repair-self-correction",
    "H17_INITIATIVE",
    {},
    sourceTask("H17_INITIATIVE").request.replace(
      "preserving original order for ties",
      "for this controlled first attempt, deliberately reverse the original order for ties"
    )
  )
] as const;

export async function prepareAgentBenchmarkWorkspace(workspace: string, task: AgentBenchmarkTask): Promise<void> {
  if (task.kind === "single-file") {
    await prepareHoldoutWorkspace(workspace, task.holdout);
    return;
  }
  await mkdir(workspace, { recursive: true });
}

export async function evaluateAgentBenchmarkTask(
  workspace: string,
  task: AgentBenchmarkTask
): Promise<AgentBenchmarkEvaluation> {
  return task.kind === "single-file" ? evaluateHoldout(workspace, task.holdout) : task.evaluator(workspace);
}

export function normalizeAgentBenchmarkEvaluation(evaluation: AgentBenchmarkEvaluation): {
  passed: boolean;
  buildPass: boolean;
  functionalPass: boolean;
} {
  if ("buildPass" in evaluation) return {
    passed: evaluation.passed,
    buildPass: evaluation.buildPass,
    functionalPass: evaluation.functionalPass
  };
  return {
    passed: evaluation.passed,
    buildPass: evaluation.filesValid && evaluation.buildArtifactMatches,
    functionalPass: evaluation.logicPassed && evaluation.uiPassed && evaluation.launchPassed
  };
}

import { mkdir } from "node:fs/promises";
import type { B4Evaluation, BrowserProjectContract } from "./b4-evaluator.js";
import { B4_CONTRACT, B4_REQUEST, evaluateBrowserProject } from "./b4-evaluator.js";
import { B4_REPAIR_INITIAL_REQUEST } from "./b4-repair-benchmark.js";
import { SCALE_HOLDOUT_TASKS } from "./scale-holdout.js";
import { evaluateHoldout, prepareHoldoutWorkspace, type HoldoutEvaluation, type HoldoutTask } from "./sft-holdout.js";

export const AGENT_BENCHMARK_VERSION = "agent-benchmark-v1";
export const EVALUATOR_VERSION = "external-evaluator-v1.1";
export type AgentBenchmarkDifficulty = "D1" | "D2" | "D3" | "D4";

export type AgentBenchmarkCategory =
  | "code-generation"
  | "code-modification"
  | "game-logic"
  | "project-browser-game"
  | "repair-self-correction";

type BenchmarkBase = {
  id: string;
  category: AgentBenchmarkCategory;
  difficulty: AgentBenchmarkDifficulty;
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
  contract: BrowserProjectContract;
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
  difficulty: AgentBenchmarkDifficulty,
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
    difficulty,
    familyId: holdout.familyId,
    targetRequest: holdout.request,
    ...(initialRequest ? { initialRequest } : {}),
    evaluatorId: `${EVALUATOR_VERSION}:${id.toLowerCase()}`,
    kind: "single-file",
    holdout
  };
}

function customSingle(
  id: string,
  difficulty: AgentBenchmarkDifficulty,
  targetFile: string,
  request: string,
  evaluatorScript: string
): SingleFileBenchmarkTask {
  const familyId = `${AGENT_BENCHMARK_VERSION}:${id.toLowerCase()}`;
  return {
    id,
    category: "game-logic",
    difficulty,
    familyId,
    targetRequest: request,
    evaluatorId: `${EVALUATOR_VERSION}:${id.toLowerCase()}`,
    kind: "single-file",
    holdout: { id, familyId, targetFile, request, evaluatorScript }
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
  visual: {
    viewport: { width: 1280, height: 720 },
    requiredVisibleSelectors: ["#player-hp", "#action-points", "#enemy-hp", "#attack-button"],
    interaction: {
      selector: "#attack-button",
      expectations: [
        { selector: "#action-points", before: "2", after: "1" },
        { selector: "#enemy-hp", before: "12", after: "8" }
      ]
    }
  },
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

const TOWER_DEFENSE_REQUEST = projectRequest(
  "tower-defense", ["gold", "wave", "enemy-hp", "fire-button"],
  "createInitialState(), fire(state), and mountGame(document)",
  "The initial state is gold 10, wave 1, enemyHp 12. Fire deals 4 damage without changing gold or wave."
);
const DECKBUILDER_REQUEST = projectRequest(
  "deckbuilder", ["deck-count", "hand-count", "energy", "draw-button"],
  "createInitialState(), drawCard(state), and mountGame(document)",
  "The initial state is deckCount 5, handCount 0, energy 3. Draw moves one card from deck to hand without changing energy."
);
const RESOURCE_REQUEST = projectRequest(
  "resource-management", ["wood", "workers", "turn", "gather-button"],
  "createInitialState(), gather(state), and mountGame(document)",
  "The initial state is wood 0, workers 2, turn 1. Gather adds 2 wood per worker and advances the turn by one."
);

const TOWER_DEFENSE_CONTRACT = simpleProjectContract({
  name: "tower defense", ids: ["gold", "wave", "enemy-hp", "fire-button"], button: "fire-button",
  functions: ["createInitialState", "fire", "mountGame"], initial: { gold: 10, wave: 1, enemyHp: 12 },
  next: { gold: 10, wave: 1, enemyHp: 8 }, expectedStdout: "tower defense evaluator passed",
  visualChanges: [{ selector: "#enemy-hp", before: "12", after: "8" }]
});
const DECKBUILDER_CONTRACT = simpleProjectContract({
  name: "deckbuilder", ids: ["deck-count", "hand-count", "energy", "draw-button"], button: "draw-button",
  functions: ["createInitialState", "drawCard", "mountGame"], initial: { deckCount: 5, handCount: 0, energy: 3 },
  next: { deckCount: 4, handCount: 1, energy: 3 }, expectedStdout: "deckbuilder evaluator passed",
  visualChanges: [
    { selector: "#deck-count", before: "5", after: "4" },
    { selector: "#hand-count", before: "0", after: "1" }
  ]
});
const RESOURCE_CONTRACT = simpleProjectContract({
  name: "resource management", ids: ["wood", "workers", "turn", "gather-button"], button: "gather-button",
  functions: ["createInitialState", "gather", "mountGame"], initial: { wood: 0, workers: 2, turn: 1 },
  next: { wood: 4, workers: 2, turn: 2 }, expectedStdout: "resource management evaluator passed",
  visualChanges: [
    { selector: "#wood", before: "0", after: "4" },
    { selector: "#turn", before: "1", after: "2" }
  ]
});

function browser(
  id: string,
  difficulty: AgentBenchmarkDifficulty,
  targetRequest: string,
  evaluatorId: string,
  contract: BrowserProjectContract,
  initialRequest?: string,
  category: AgentBenchmarkCategory = "project-browser-game"
): BrowserBenchmarkTask {
  return {
    id,
    category,
    difficulty,
    familyId: `${AGENT_BENCHMARK_VERSION}:${id.toLowerCase()}`,
    targetRequest,
    ...(initialRequest ? { initialRequest } : {}),
    evaluatorId: `${EVALUATOR_VERSION}:${evaluatorId}`,
    kind: "browser-project",
    contract,
    evaluator: (workspace) => evaluateBrowserProject(workspace, contract)
  };
}

export const AGENT_BENCHMARK_TASKS: readonly AgentBenchmarkTask[] = [
  single("ABV1-CG-01", "code-generation", "D1", "H1_HELLO_FILE"),
  single("ABV1-CG-02", "code-generation", "D1", "H4_GRID_NEIGHBORS"),
  single("ABV1-CG-03", "code-generation", "D1", "H13_HEX_NEIGHBORS"),
  single("ABV1-CG-04", "code-generation", "D1", "H14_MANHATTAN"),

  single("ABV1-CM-01", "code-modification", "D1", "H2_FIX_ADD"),
  single("ABV1-CM-02", "code-modification", "D1", "H10_SPEND_ENERGY", {
    request: "Read energy.ts and fix spendEnergy(state, cost). For a non-negative affordable cost, return a new state with energy reduced by cost; otherwise return a new unchanged state. Never mutate the input.",
    seed: "export function spendEnergy(state: any, cost: number) { return { ...state, energy: state.energy + cost }; }\n"
  }),
  single("ABV1-CM-03", "code-modification", "D1", "H16_LOWEST_HP", {
    request: "Read target.ts and fix selectLowestHp(enemies). Ignore enemies with alive false, return the living enemy with the lowest hp, preserve input order for ties, or return null when none are alive.",
    seed: "export function selectLowestHp(enemies: any[]) { return enemies.filter((enemy) => enemy.alive).at(-1) ?? null; }\n"
  }),
  single("ABV1-CM-04", "code-modification", "D1", "H21_RESOURCE_TICK", {
    request: "Read resources.ts and fix produceResources(state, turns). Return a new state adding productionPerTurn times non-negative whole turns; floor fractional turns, treat negative turns as zero, and do not mutate input.",
    seed: "export function produceResources(state: any, turns: number) { state.resources += state.productionPerTurn * Math.ceil(turns); return state; }\n"
  }),

  single("ABV1-GL-01", "game-logic", "D2", "H3_CARD_STRIKE"),
  single("ABV1-GL-02", "game-logic", "D2", "H5_NEAREST_TARGET"),
  single("ABV1-GL-03", "game-logic", "D2", "H6_TURN_ORDER"),
  single("ABV1-GL-04", "game-logic", "D2", "H07_DRAW_CARDS"),
  single("ABV1-GL-05", "game-logic", "D1", "H08_GAIN_BLOCK"),
  single("ABV1-GL-06", "game-logic", "D2", "H09_APPLY_DAMAGE"),
  single("ABV1-GL-07", "game-logic", "D2", "H11_DISCARD_HAND"),
  single("ABV1-GL-08", "game-logic", "D2", "H12_POISON_TICK"),
  single("ABV1-GL-09", "game-logic", "D2", "H15_MOVEMENT_RANGE"),
  single("ABV1-GL-10", "game-logic", "D2", "H18_TOWER_COOLDOWN"),
  single("ABV1-GL-11", "game-logic", "D2", "H19_TOWER_UPGRADE"),
  single("ABV1-GL-12", "game-logic", "D1", "H22_VICTORY"),
  customSingle("ABV1-GL-13", "D3", "card-turn.ts",
    "Create card-turn.ts exporting playCard(state, card) and endTurn(state). playCard must immutably spend an affordable non-negative card energy cost, damage enemyHp by non-negative card damage, and append the card id to discardPile; invalid cards return a cloned unchanged state. endTurn must immutably move the full hand to discardPile, draw up to two cards from the front of deck, reset energy to 3, and increment turn.",
    "const m=await import('./card-turn.ts');const s={energy:3,enemyHp:12,hand:['guard'],deck:['a','b','c'],discardPile:[],turn:1};const p=m.playCard(s,{id:'strike',cost:1,damage:4});if(JSON.stringify(p)!==JSON.stringify({...s,energy:2,enemyHp:8,discardPile:['strike']}))throw Error('play');if(s.energy!==3||s.discardPile.length)throw Error('mutated play');const e=m.endTurn(s);if(JSON.stringify(e)!==JSON.stringify({energy:3,enemyHp:12,hand:['a','b'],deck:['c'],discardPile:['guard'],turn:2}))throw Error('end');if(s.hand.length!==1||s.deck.length!==3)throw Error('mutated end');"),
  customSingle("ABV1-GL-14", "D3", "tactics-turn.ts",
    "Create tactics-turn.ts exporting resolveTurn(state, action). State contains actionPoints, player position, enemy hp and battleStatus. For a move action, spend 1 action point and move one orthogonal in-bounds step on a 4x4 grid. For an attack action, spend 1 action point and deal 5 damage only when the enemy is orthogonally adjacent. Clamp enemy hp at zero and set battleStatus to victory when it reaches zero. Invalid or unaffordable actions return a cloned unchanged state; never mutate input.",
    "const m=await import('./tactics-turn.ts');const s={actionPoints:2,player:{x:0,y:0},enemy:{x:1,y:1,hp:5},battleStatus:'ongoing'};const moved=m.resolveTurn(s,{type:'move',x:1,y:0});if(JSON.stringify(moved)!==JSON.stringify({...s,actionPoints:1,player:{x:1,y:0}}))throw Error('move');const won=m.resolveTurn(moved,{type:'attack'});if(won.actionPoints!==0||won.enemy.hp!==0||won.battleStatus!=='victory')throw Error('attack');const bad=m.resolveTurn(s,{type:'move',x:3,y:3});if(JSON.stringify(bad)!==JSON.stringify(s)||bad===s)throw Error('invalid');if(s.actionPoints!==2||s.player.x!==0)throw Error('mutated');"),

  browser("ABV1-PJ-01", "D4", B4_REQUEST, "browser-card", B4_CONTRACT),
  browser("ABV1-PJ-02", "D4", TACTICS_REQUEST, "browser-tactics", TACTICS_CONTRACT),
  browser("ABV1-PJ-03", "D4", TOWER_DEFENSE_REQUEST, "browser-tower-defense", TOWER_DEFENSE_CONTRACT),
  browser("ABV1-PJ-04", "D4", DECKBUILDER_REQUEST, "browser-deckbuilder", DECKBUILDER_CONTRACT),
  browser("ABV1-PJ-05", "D4", RESOURCE_REQUEST, "browser-resource-management", RESOURCE_CONTRACT),

  browser("ABV1-RP-01", "D4", B4_REQUEST, "browser-card-repair", B4_CONTRACT, B4_REPAIR_INITIAL_REQUEST, "repair-self-correction"),
  single(
    "ABV1-RP-02",
    "repair-self-correction",
    "D2",
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
    "D2",
    "H17_INITIATIVE",
    {},
    sourceTask("H17_INITIATIVE").request.replace(
      "preserving original order for ties",
      "for this controlled first attempt, deliberately reverse the original order for ties"
    )
  )
] as const;

function projectRequest(name: string, ids: readonly string[], exports: string, rules: string): string {
  return [
    `Create a complete no-dependency Browser + TypeScript ${name} prototype in the empty workspace.`,
    `Create index.html with visible elements whose IDs are ${ids.join(", ")}.`,
    `Create src/game.ts as browser-compatible TypeScript exporting ${exports}.`, rules,
    "mountGame must render every initial value and update the displayed state when the button is clicked.",
    "Create project.mjs with build and serve modes. Build copies src/game.ts to dist/game.js. Serve index.html and dist/game.js over HTTP using PORT or 4173.",
    "index.html must load ./dist/game.js as a module. The module may auto-mount in a browser but must be importable without a global document.",
    "Run node project.mjs build before finishing. Use only index.html, src/game.ts, and project.mjs as source files."
  ].join(" ");
}

function simpleProjectContract(config: {
  name: string;
  ids: readonly string[];
  button: string;
  functions: readonly [string, string, string];
  initial: Record<string, number>;
  next: Record<string, number>;
  expectedStdout: string;
  visualChanges: readonly { selector: string; before: string; after: string }[];
}): BrowserProjectContract {
  const [createName, actionName, mountName] = config.functions;
  const stateIds = config.ids.filter((id) => id !== config.button);
  return {
    requiredFiles: ["index.html", "src/game.ts", "project.mjs", "dist/game.js"],
    sourceFile: "src/game.ts", buildArtifact: "dist/game.js", expectedStdout: config.expectedStdout,
    pageMarkers: config.ids, moduleMarkers: config.functions,
    visual: {
      viewport: { width: 1280, height: 720 },
      requiredVisibleSelectors: config.ids.map((id) => `#${id}`),
      interaction: { selector: `#${config.button}`, expectations: config.visualChanges }
    },
    createEvaluatorScript: (html) => [
      "import assert from 'node:assert/strict';", "const game=await import('./dist/game.js');",
      ...config.functions.map((name) => `assert.equal(typeof game.${name}, 'function');`),
      `const initial=game.${createName}();`, `assert.deepEqual(initial, ${JSON.stringify(config.initial)});`,
      `assert.deepEqual(game.${actionName}(initial), ${JSON.stringify(config.next)});`,
      `assert.deepEqual(initial, ${JSON.stringify(config.initial)});`,
      "const listeners=new Map();",
      `const elements=new Map(${JSON.stringify(config.ids)}.map((id)=>[id,{textContent:'',disabled:false,addEventListener(type,listener){listeners.set(\`${'${id}:${type}'}\`,listener)}}]));`,
      "const fakeDocument={getElementById(id){return elements.get(id)??null}};",
      `game.${mountName}(fakeDocument);`,
      ...stateIds.map((id) => `assert.equal(elements.get('${id}').textContent, '${config.initial[toCamel(id)]}');`),
      `const click=listeners.get('${config.button}:click');assert.equal(typeof click,'function');click();`,
      ...stateIds.map((id) => `assert.equal(elements.get('${id}').textContent, '${config.next[toCamel(id)]}');`),
      `const expectedHtml=${JSON.stringify(html)};`,
      `for(const id of ${JSON.stringify(config.ids)})assert.match(expectedHtml,new RegExp(\`id\\\\s*=\\\\s*[\"']${'${id}'}[\"']\`));`,
      "const moduleTag=expectedHtml.match(/<script\\b[^>]*>/gi)?.find((tag)=>/src\\s*=\\s*[\"']\\.\\/dist\\/game\\.js[\"']/i.test(tag));",
      "assert.ok(moduleTag);assert.match(moduleTag,/type\\s*=\\s*[\"']module[\"']/i);",
      `console.log(${JSON.stringify(config.expectedStdout)});`
    ].join("\n")
  };
}

function toCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

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
  visualPass: boolean | null;
} {
  if ("buildPass" in evaluation) return {
    passed: evaluation.passed,
    buildPass: evaluation.buildPass,
    functionalPass: evaluation.functionalPass,
    visualPass: null
  };
  return {
    passed: evaluation.passed,
    buildPass: evaluation.filesValid && evaluation.buildArtifactMatches,
    functionalPass: evaluation.logicPassed && evaluation.uiPassed && evaluation.launchPassed,
    visualPass: evaluation.visualPassed
  };
}

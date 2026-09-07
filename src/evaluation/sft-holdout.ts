import { lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ToolExecutor } from "../runtime/tool-executor.js";

export type HoldoutTask = {
  id: string;
  familyId: string;
  targetFile: string;
  request: string;
  evaluatorScript: string;
  expectedStdout?: string;
  seed?: string;
};

export type HoldoutEvaluation = {
  passed: boolean;
  buildPass: boolean;
  functionalPass: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
};

export const SFT_HOLDOUT_TASKS: readonly HoldoutTask[] = [
  {
    id: "H1_HELLO_FILE",
    familyId: "benchmark:original:hello",
    targetFile: "hello-agent.ts",
    request: "Create hello-agent.ts so running it prints exactly hello agent followed by a newline.",
    evaluatorScript: "await import('./hello-agent.ts');",
    expectedStdout: "hello agent"
  },
  {
    id: "H2_FIX_ADD",
    familyId: "benchmark:original:add",
    targetFile: "math.ts",
    request: "Read math.ts and fix the exported add(a, b) function so it returns the arithmetic sum without changing its name.",
    seed: "export function add(a: number, b: number): number { return a - b; }\n",
    evaluatorScript: "const m=await import('./math.ts'); for(const [a,b,e] of [[2,3,5],[-4,7,3],[1.5,2.25,3.75]]) if(m.add(a,b)!==e) throw Error(`add ${a} ${b}`);"
  },
  {
    id: "H3_CARD_STRIKE",
    familyId: "benchmark:original:strike",
    targetFile: "card-game.ts",
    request: "Create card-game.ts exporting createInitialState() returning playerHp 20, playerEnergy 3, enemyHp 20, and strike(state) returning a new state after spending 1 energy and dealing 6 enemy damage.",
    evaluatorScript: "const m=await import('./card-game.ts'); const s=m.createInitialState(); if(JSON.stringify(s)!==JSON.stringify({playerHp:20,playerEnergy:3,enemyHp:20})) throw Error('initial'); const n=m.strike(s); if(JSON.stringify(n)!==JSON.stringify({playerHp:20,playerEnergy:2,enemyHp:14})) throw Error('strike'); if(s.playerEnergy!==3||s.enemyHp!==20) throw Error('mutated');"
  },
  {
    id: "H4_GRID_NEIGHBORS",
    familyId: "benchmark:original:grid-neighbors",
    targetFile: "grid-neighbors.ts",
    request: "Create grid-neighbors.ts exporting orthogonalNeighbors(x, y, width, height). Return in-bounds up/down/left/right cells as objects with x and y, with no diagonal or out-of-bounds cells.",
    evaluatorScript: "const m=await import('./grid-neighbors.ts'); const norm=x=>x.map(p=>`${p.x},${p.y}`).sort(); if(JSON.stringify(norm(m.orthogonalNeighbors(1,1,3,3)))!==JSON.stringify(['0,1','1,0','1,2','2,1'])) throw Error('center'); if(JSON.stringify(norm(m.orthogonalNeighbors(0,0,3,2)))!==JSON.stringify(['0,1','1,0'])) throw Error('corner');"
  },
  {
    id: "H5_NEAREST_TARGET",
    familyId: "benchmark:original:nearest-target",
    targetFile: "target-selection.ts",
    request: "Create target-selection.ts exporting chooseNearestTarget(tower, enemies, range). Ignore enemies whose alive field is false, exclude enemies beyond Euclidean range, return the nearest eligible enemy, and return null when none qualify.",
    evaluatorScript: "const m=await import('./target-selection.ts'); const t={x:0,y:0}; const a={id:'a',x:3,y:4,alive:true},b={id:'b',x:1,y:1,alive:false},c={id:'c',x:2,y:0,alive:true}; if(m.chooseNearestTarget(t,[a,b,c],5)!==c) throw Error('nearest'); if(m.chooseNearestTarget(t,[a],4)!==null) throw Error('range'); if(m.chooseNearestTarget(t,[b],10)!==null) throw Error('dead');"
  },
  {
    id: "H6_TURN_ORDER",
    familyId: "benchmark:original:turn-order",
    targetFile: "turn-order.ts",
    request: "Create turn-order.ts exporting nextTurn(state, playerCount). Return a new state whose playerIndex advances circularly; increment round only when the index wraps to zero; do not mutate the input.",
    evaluatorScript: "const m=await import('./turn-order.ts'); const a={playerIndex:1,round:4}; const b=m.nextTurn(a,3); if(JSON.stringify(b)!==JSON.stringify({playerIndex:2,round:4})||a.playerIndex!==1) throw Error('advance'); const c=m.nextTurn({playerIndex:2,round:4},3); if(JSON.stringify(c)!==JSON.stringify({playerIndex:0,round:5})) throw Error('wrap');"
  }
] as const;

export async function prepareHoldoutWorkspace(workspace: string, task: HoldoutTask): Promise<void> {
  await mkdir(workspace, { recursive: true });
  if (task.seed !== undefined) await writeFile(path.join(workspace, task.targetFile), task.seed, "utf8");
}

export async function evaluateHoldout(workspace: string, task: HoldoutTask): Promise<HoldoutEvaluation> {
  const target = path.join(workspace, task.targetFile);
  try {
    const stats = await lstat(target);
    if (!stats.isFile() || stats.isSymbolicLink()) return failure("target must be a regular file");
  } catch (error) {
    return failure(error instanceof Error ? error.message : "target missing");
  }

  const executor = new ToolExecutor({ workspace, allowedCommands: ["node"], nodeFsAccess: "read-only" });
  const build = (await executor.execute({ tool: "run_command", command: "node", args: [task.targetFile], timeoutMs: 10_000 })).result;
  if (!build.ok || build.exitCode !== 0) {
    return { passed: false, buildPass: false, functionalPass: false, stdout: build.stdout ?? "", stderr: build.stderr ?? "", exitCode: build.exitCode ?? null, error: build.error ?? "Node build/import failed" };
  }
  const functional = (await executor.execute({
    tool: "run_command",
    command: "node",
    args: ["--input-type=module", "-e", task.evaluatorScript],
    timeoutMs: 10_000
  })).result;
  const stdoutMatches = task.expectedStdout === undefined || functional.stdout?.trim() === task.expectedStdout;
  const functionalPass = functional.ok && functional.exitCode === 0 && stdoutMatches;
  return {
    passed: functionalPass,
    buildPass: true,
    functionalPass,
    stdout: functional.stdout ?? "",
    stderr: functional.stderr ?? "",
    exitCode: functional.exitCode ?? null,
    ...(functionalPass ? {} : {
      error: functional.error ?? (stdoutMatches ? "hidden functional checks failed" : `expected stdout ${JSON.stringify(task.expectedStdout)}`)
    })
  };
}

function failure(error: string): HoldoutEvaluation {
  return { passed: false, buildPass: false, functionalPass: false, stdout: "", stderr: "", exitCode: null, error };
}

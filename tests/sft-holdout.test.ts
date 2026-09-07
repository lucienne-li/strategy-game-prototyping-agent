import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateHoldout, prepareHoldoutWorkspace, SFT_HOLDOUT_TASKS } from "../src/evaluation/sft-holdout.js";

const GOLD: Record<string, string> = {
  H1_HELLO_FILE: "console.log('hello agent');\n",
  H2_FIX_ADD: "export function add(a:number,b:number):number{return a+b;}\n",
  H3_CARD_STRIKE: "export const createInitialState=()=>({playerHp:20,playerEnergy:3,enemyHp:20}); export const strike=(s:{playerHp:number;playerEnergy:number;enemyHp:number})=>({...s,playerEnergy:s.playerEnergy-1,enemyHp:s.enemyHp-6});\n",
  H4_GRID_NEIGHBORS: "export function orthogonalNeighbors(x:number,y:number,w:number,h:number){return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([a,b])=>a>=0&&b>=0&&a<w&&b<h).map(([x,y])=>({x,y}));}\n",
  H5_NEAREST_TARGET: "export function chooseNearestTarget(t:any,es:any[],r:number){return es.filter(e=>e.alive&&Math.hypot(e.x-t.x,e.y-t.y)<=r).sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y))[0]??null;}\n",
  H6_TURN_ORDER: "export function nextTurn(s:{playerIndex:number;round:number},n:number){const playerIndex=(s.playerIndex+1)%n;return {playerIndex,round:s.round+(playerIndex===0?1:0)};}\n"
};

test("all six family-isolated holdout evaluators accept their gold contracts", async () => {
  for (const task of SFT_HOLDOUT_TASKS) {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "sft-holdout-gold-"));
    await prepareHoldoutWorkspace(workspace, task);
    await writeFile(path.join(workspace, task.targetFile), GOLD[task.id], "utf8");
    const result = await evaluateHoldout(workspace, task);
    assert.equal(result.passed, true, `${task.id}: ${result.stderr || result.error}`);
  }
});

test("H1 rejects executable output that does not match the exact stdout contract", async () => {
  const task = SFT_HOLDOUT_TASKS[0];
  const workspace = await mkdtemp(path.join(os.tmpdir(), "sft-holdout-wrong-stdout-"));
  await prepareHoldoutWorkspace(workspace, task);
  await writeFile(path.join(workspace, task.targetFile), "console.log('almost');\n", "utf8");
  const result = await evaluateHoldout(workspace, task);
  assert.equal(result.buildPass, true);
  assert.equal(result.functionalPass, false);
  assert.match(result.error ?? "", /expected stdout/);
});

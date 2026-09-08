import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateHoldout, prepareHoldoutWorkspace } from "../src/evaluation/sft-holdout.js";
import { SCALE_HOLDOUT_TASKS } from "../src/evaluation/scale-holdout.js";

const GOLD: Record<string, string> = {
  H07_DRAW_CARDS: "export function drawCards(s:any,n:number){const take=s.deck.slice(0,Math.max(0,n));return {...s,deck:s.deck.slice(take.length),hand:[...s.hand,...take]}}",
  H08_GAIN_BLOCK: "export function gainBlock(s:any,n:number){return {...s,block:s.block+Math.max(0,n)}}",
  H09_APPLY_DAMAGE: "export function applyDamage(s:any,n:number){n=Math.max(0,n);const used=Math.min(s.block,n);return {...s,block:Math.max(0,s.block-used),hp:Math.max(0,s.hp-(n-used))}}",
  H10_SPEND_ENERGY: "export function spendEnergy(s:any,c:number){return c>=0&&c<=s.energy?{...s,energy:s.energy-c}:{...s}}",
  H11_DISCARD_HAND: "export function discardHand(s:any){return {...s,hand:[],discardPile:[...s.discardPile,...s.hand]}}",
  H12_POISON_TICK: "export function tickPoison(s:any){return {...s,hp:Math.max(0,s.hp-s.poison),poison:Math.max(0,s.poison-1)}}",
  H13_HEX_NEIGHBORS: "export function hexNeighbors(q:number,r:number){return [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]].map(([a,b])=>({q:q+a,r:r+b}))}",
  H14_MANHATTAN: "export function manhattanDistance(a:any,b:any){return Math.abs(a.x-b.x)+Math.abs(a.y-b.y)}",
  H15_MOVEMENT_RANGE: "export function cellsInRange(o:any,r:number,w:number,h:number){const a=[];for(let x=0;x<w;x++)for(let y=0;y<h;y++)if(Math.abs(x-o.x)+Math.abs(y-o.y)<=Math.max(0,r))a.push({x,y});return a}",
  H16_LOWEST_HP: "export function selectLowestHp(es:any[]){return es.reduce((a,e)=>!e.alive?a:a===null||e.hp<a.hp?e:a,null)}",
  H17_INITIATIVE: "export function sortByInitiative(us:any[]){return us.map((u,i)=>({u,i})).sort((a,b)=>b.u.initiative-a.u.initiative||a.i-b.i).map(x=>x.u)}",
  H18_TOWER_COOLDOWN: "export function tickCooldown(t:any,d:number){return {...t,cooldown:Math.max(0,t.cooldown-Math.max(0,d))}};export function canFire(t:any){return t.cooldown<=0}",
  H19_TOWER_UPGRADE: "export function upgradeTower(t:any,g:number){return g>=t.upgradeCost?{tower:{...t,level:t.level+1,damage:t.damage+1},remainingGold:g-t.upgradeCost}:{tower:{...t},remainingGold:g}}",
  H20_WAVE_SCHEDULE: "export function spawnTimes(c:number,i:number){return Array.from({length:Math.max(0,Math.floor(c))},(_,n)=>n*Math.max(0,i))}",
  H21_RESOURCE_TICK: "export function produceResources(s:any,t:number){return {...s,resources:s.resources+s.productionPerTurn*Math.max(0,Math.floor(t))}}",
  H22_VICTORY: "export function battleOutcome(h:number,es:any[]){return h<=0?'defeat':es.every(e=>e.hp<=0)?'victory':'ongoing'}",
  H23_CARD_PLAYABLE: "export function playableCards(h:any[],e:number){return h.filter(c=>c.cost>=0&&c.cost<=e)}",
  H24_STATUS_TICK: "export function tickStatuses(ss:any[]){return ss.map(s=>({...s,duration:s.duration-1})).filter(s=>s.duration>0)}"
};

test("scale benchmark has 24 unique holdout families", () => {
  assert.equal(SCALE_HOLDOUT_TASKS.length, 24);
  assert.equal(new Set(SCALE_HOLDOUT_TASKS.map((task) => task.familyId)).size, 24);
});

test("all 18 new external evaluators accept their gold contracts", async () => {
  for (const task of SCALE_HOLDOUT_TASKS.slice(6)) {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "scale-holdout-gold-"));
    await prepareHoldoutWorkspace(workspace, task);
    await writeFile(path.join(workspace, task.targetFile), `${GOLD[task.id]}\n`, "utf8");
    const result = await evaluateHoldout(workspace, task);
    assert.equal(result.passed, true, `${task.id}: ${result.stderr || result.error}`);
  }
});

from __future__ import annotations

import json
import tempfile
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

from .agent import AgentModel
from .evaluators import BrowserContract, VisualExpectation, evaluate_browser_project, evaluate_javascript, simple_browser_contract
from .repair import run_with_evaluator_repair
from .runtime import ToolExecutor


BENCHMARK_VERSION = "agent-benchmark-v2-python-first"
EVALUATOR_VERSION = "python-external-evaluator-v2"
BUDGET = {"maxIterationsPerAgentRun": 6, "maxToolCallsPerIteration": 8, "maxToolCallsPerAgentRun": 48, "repairBudget": 1, "commandTimeoutMs": 10_000}
MODEL_SETTINGS = {"gpt": {"toolChoice": "auto", "sampling": "provider-managed", "maxOutputTokens": 4096}, "qwen": {"doSample": False, "maxNewTokens": 4096, "thinking": False}}


@dataclass(frozen=True)
class Holdout:
    target_file: str
    request: str
    evaluator_script: str
    expected_stdout: str | None = None
    seed: str | None = None


@dataclass(frozen=True)
class BenchmarkTask:
    id: str
    category: str
    difficulty: str
    target_request: str
    evaluator_id: str
    kind: str = "single-file"
    holdout: Holdout | None = None
    browser: BrowserContract | None = None
    initial_request: str | None = None

    @property
    def family_id(self) -> str:
        return f"{BENCHMARK_VERSION}:{self.id.lower()}"


def _task(target: str, request: str, script: str, *, seed: str | None = None, stdout: str | None = None) -> Holdout:
    return Holdout(target, request, script, stdout, seed)


H: dict[str, Holdout] = {
    "H1": _task("hello-agent.js", "Create hello-agent.js so running it prints exactly hello agent followed by a newline.", "await import('./hello-agent.js');", stdout="hello agent"),
    "H2": _task("math.js", "Read math.js and fix the exported add(a, b) function so it returns the arithmetic sum without changing its name.", "const m=await import('./math.js');for(const [a,b,e] of [[2,3,5],[-4,7,3],[1.5,2.25,3.75]])if(m.add(a,b)!==e)throw Error('add');", seed="export function add(a,b){return a-b;}\n"),
    "H3": _task("card-game.js", "Create card-game.js exporting createInitialState() returning playerHp 20, playerEnergy 3, enemyHp 20, and strike(state) returning a new state after spending 1 energy and dealing 6 enemy damage.", "const m=await import('./card-game.js');const s=m.createInitialState();if(JSON.stringify(s)!==JSON.stringify({playerHp:20,playerEnergy:3,enemyHp:20}))throw Error('initial');const n=m.strike(s);if(JSON.stringify(n)!==JSON.stringify({playerHp:20,playerEnergy:2,enemyHp:14})||s.playerEnergy!==3)throw Error('strike');"),
    "H4": _task("grid-neighbors.js", "Create grid-neighbors.js exporting orthogonalNeighbors(x, y, width, height). Return in-bounds up/down/left/right cells as objects with x and y, with no diagonal or out-of-bounds cells.", "const m=await import('./grid-neighbors.js');const norm=x=>x.map(p=>`${p.x},${p.y}`).sort();if(JSON.stringify(norm(m.orthogonalNeighbors(1,1,3,3)))!==JSON.stringify(['0,1','1,0','1,2','2,1']))throw Error('center');if(JSON.stringify(norm(m.orthogonalNeighbors(0,0,3,2)))!==JSON.stringify(['0,1','1,0']))throw Error('corner');"),
    "H5": _task("target-selection.js", "Create target-selection.js exporting chooseNearestTarget(tower, enemies, range). Ignore dead or out-of-range enemies and return the nearest eligible enemy, or null.", "const m=await import('./target-selection.js');const t={x:0,y:0},a={id:'a',x:3,y:4,alive:true},b={id:'b',x:1,y:1,alive:false},c={id:'c',x:2,y:0,alive:true};if(m.chooseNearestTarget(t,[a,b,c],5)!==c||m.chooseNearestTarget(t,[a],4)!==null)throw Error('target');"),
    "H6": _task("turn-order.js", "Create turn-order.js exporting nextTurn(state, playerCount). Immutably advance playerIndex circularly and increment round only on wrap.", "const m=await import('./turn-order.js');const a={playerIndex:1,round:4};if(JSON.stringify(m.nextTurn(a,3))!==JSON.stringify({playerIndex:2,round:4})||a.playerIndex!==1)throw Error('advance');if(JSON.stringify(m.nextTurn({playerIndex:2,round:4},3))!==JSON.stringify({playerIndex:0,round:5}))throw Error('wrap');"),
    "H7": _task("draw-cards.js", "Create draw-cards.js exporting drawCards(state, count). Immutably move up to count cards from the front of deck to the end of hand.", "const m=await import('./draw-cards.js');const s={deck:['a','b'],hand:['x']},n=m.drawCards(s,3);if(JSON.stringify(n)!==JSON.stringify({deck:[],hand:['x','a','b']})||s.deck.length!==2)throw Error('draw');"),
    "H8": _task("block.js", "Create block.js exporting gainBlock(state, amount). Immutably add non-negative amount to block; negative amounts add zero.", "const m=await import('./block.js');const s={hp:10,block:3};if(m.gainBlock(s,4).block!==7||m.gainBlock(s,-2).block!==3||s.block!==3)throw Error('block');"),
    "H9": _task("damage.js", "Create damage.js exporting applyDamage(state, damage). Block absorbs non-negative damage first; clamp block and hp at zero; do not mutate.", "const m=await import('./damage.js');if(JSON.stringify(m.applyDamage({hp:20,block:5},8))!==JSON.stringify({hp:17,block:0})||JSON.stringify(m.applyDamage({hp:2,block:1},9))!==JSON.stringify({hp:0,block:0}))throw Error('damage');"),
    "H10": _task("energy.js", "Read energy.js and fix spendEnergy(state, cost). For a non-negative affordable cost, return a new state with energy reduced; otherwise clone unchanged.", "const m=await import('./energy.js');const s={energy:3,hp:20};if(m.spendEnergy(s,2).energy!==1||m.spendEnergy(s,4).energy!==3||m.spendEnergy(s,-1).energy!==3||s.energy!==3)throw Error('energy');", seed="export function spendEnergy(state,cost){return {...state,energy:state.energy+cost};}\n"),
    "H11": _task("discard.js", "Create discard.js exporting discardHand(state). Immutably append hand to discardPile in order and clear hand.", "const m=await import('./discard.js');const s={hand:['a','b'],discardPile:['x'],deck:[]},n=m.discardHand(s);if(JSON.stringify(n)!==JSON.stringify({hand:[],discardPile:['x','a','b'],deck:[]})||s.hand.length!==2)throw Error('discard');"),
    "H12": _task("poison.js", "Create poison.js exporting tickPoison(state). Immutably reduce hp by poison and poison by one, both clamped at zero.", "const m=await import('./poison.js');if(JSON.stringify(m.tickPoison({hp:10,poison:3}))!==JSON.stringify({hp:7,poison:2})||JSON.stringify(m.tickPoison({hp:1,poison:4}))!==JSON.stringify({hp:0,poison:3}))throw Error('poison');"),
    "H13": _task("hex.js", "Create hex.js exporting hexNeighbors(q, r). Return the six unique axial-coordinate neighbors, excluding the original cell.", "const m=await import('./hex.js');const n=m.hexNeighbors(2,3),s=new Set(n.map(x=>`${x.q},${x.r}`));for(const x of ['3,3','1,3','2,4','2,2','3,2','1,4'])if(!s.has(x))throw Error(x);if(n.length!==6||s.has('2,3'))throw Error('shape');"),
    "H14": _task("distance.js", "Create distance.js exporting manhattanDistance(a, b). Return Manhattan distance without mutating either point.", "const m=await import('./distance.js');if(m.manhattanDistance({x:1,y:2},{x:4,y:-2})!==7||m.manhattanDistance({x:0,y:0},{x:0,y:0})!==0)throw Error('distance');"),
    "H15": _task("movement.js", "Create movement.js exporting cellsInRange(origin, range, width, height). Return unique in-bounds cells within non-negative Manhattan range, including origin.", "const m=await import('./movement.js');const n=m.cellsInRange({x:0,y:0},1,3,3),s=new Set(n.map(x=>`${x.x},${x.y}`));if(JSON.stringify([...s].sort())!==JSON.stringify(['0,0','0,1','1,0'])||n.length!==s.size)throw Error('range');"),
    "H16": _task("target.js", "Read target.js and fix selectLowestHp(enemies). Ignore dead enemies, preserve input order for hp ties, or return null.", "const m=await import('./target.js');const a={id:'a',hp:4,alive:true},b={id:'b',hp:2,alive:false},c={id:'c',hp:4,alive:true};if(m.selectLowestHp([a,b,c])!==a||m.selectLowestHp([b])!==null)throw Error('target');", seed="export function selectLowestHp(enemies){return enemies.filter(x=>x.alive).at(-1)??null;}\n"),
    "H17": _task("initiative.js", "Create initiative.js exporting sortByInitiative(units). Return a new descending array and preserve original order for ties.", "const m=await import('./initiative.js');const a={id:'a',initiative:2},b={id:'b',initiative:5},c={id:'c',initiative:2},x=[a,b,c],n=m.sortByInitiative(x);if(n.map(v=>v.id).join('')!=='bac'||x.map(v=>v.id).join('')!=='abc')throw Error('order');"),
    "H18": _task("cooldown.js", "Create cooldown.js exporting tickCooldown(tower, delta) and canFire(tower). Clamp cooldown at zero and fire exactly at zero or less.", "const m=await import('./cooldown.js');if(m.tickCooldown({cooldown:2,range:5},3).cooldown!==0||!m.canFire({cooldown:0})||m.canFire({cooldown:.1}))throw Error('cooldown');"),
    "H19": _task("upgrade.js", "Create upgrade.js exporting upgradeTower(tower, gold). On affordable cost, clone and add one level and damage; return remainingGold; otherwise clone unchanged.", "const m=await import('./upgrade.js');const t={level:1,damage:3,upgradeCost:5},a=m.upgradeTower(t,7);if(JSON.stringify(a)!==JSON.stringify({tower:{level:2,damage:4,upgradeCost:5},remainingGold:2}))throw Error('up');const b=m.upgradeTower(t,4);if(b.remainingGold!==4||b.tower.level!==1||t.level!==1)throw Error('guard');"),
    "H21": _task("resources.js", "Read resources.js and fix produceResources(state, turns). Add productionPerTurn times non-negative whole turns, flooring fractions, without mutation.", "const m=await import('./resources.js');const s={resources:4,productionPerTurn:3};if(m.produceResources(s,2.8).resources!==10||m.produceResources(s,-2).resources!==4||s.resources!==4)throw Error('resources');", seed="export function produceResources(state,turns){state.resources+=state.productionPerTurn*Math.ceil(turns);return state;}\n"),
    "H22": _task("victory.js", "Create victory.js exporting battleOutcome(playerHp, enemies). Defeat when player hp is non-positive; otherwise victory if all enemies are defeated; else ongoing.", "const m=await import('./victory.js');if(m.battleOutcome(0,[{hp:0}])!=='defeat'||m.battleOutcome(2,[{hp:0},{hp:-1}])!=='victory'||m.battleOutcome(2,[{hp:1}])!=='ongoing')throw Error('outcome');"),
    "H23": _task("playable.js", "Create playable.js exporting playableCards(hand, energy). Preserve order and include only cards with non-negative cost at most energy.", "const m=await import('./playable.js');const a={id:'a',cost:1},b={id:'b',cost:3},c={id:'c',cost:-1};if(m.playableCards([a,b,c],2).map(x=>x.id).join('')!=='a')throw Error('filter');"),
}


def _single(id: str, category: str, difficulty: str, key: str, initial: str | None = None) -> BenchmarkTask:
    holdout = H[key]
    return BenchmarkTask(id, category, difficulty, holdout.request, f"{EVALUATOR_VERSION}:{id.lower()}", holdout=holdout, initial_request=initial)


CARD_TURN = _task("card-turn.js", "Create card-turn.js exporting immutable playCard(state, card) and endTurn(state), covering energy, damage, discard, draw and turn progression.", "const m=await import('./card-turn.js');const s={energy:3,enemyHp:12,hand:['guard'],deck:['a','b','c'],discardPile:[],turn:1};const p=m.playCard(s,{id:'strike',cost:1,damage:4});if(p.energy!==2||p.enemyHp!==8||p.discardPile[0]!=='strike'||s.energy!==3)throw Error('play');const e=m.endTurn(s);if(JSON.stringify(e)!==JSON.stringify({energy:3,enemyHp:12,hand:['a','b'],deck:['c'],discardPile:['guard'],turn:2}))throw Error('end');")
TACTICS_TURN = _task("tactics-turn.js", "Create tactics-turn.js exporting immutable resolveTurn(state, action) for one-step 4x4 movement, adjacent attack, action points and victory.", "const m=await import('./tactics-turn.js');const s={actionPoints:2,player:{x:0,y:0},enemy:{x:1,y:1,hp:5},battleStatus:'ongoing'};const a=m.resolveTurn(s,{type:'move',x:1,y:0}),b=m.resolveTurn(a,{type:'attack'});if(a.actionPoints!==1||b.enemy.hp!==0||b.battleStatus!=='victory'||s.player.x!==0)throw Error('turn');")


def _project_request(name: str, ids: list[str], exports: str, rule: str) -> str:
    return " ".join([
        f"Create a complete no-dependency Browser JavaScript {name} prototype in the empty workspace.",
        f"Create index.html with visible element IDs {', '.join(ids)}.",
        f"Create src/game.js exporting {exports}. {rule}",
        "Create project.mjs whose build copies src/game.js to dist/game.js and whose serve mode hosts both files using PORT or 4173.",
        "Load ./dist/game.js as a module and run node project.mjs build before finishing.",
    ])


PROJECTS = {
    "card": ("card combat", ["player-hp", "player-energy", "enemy-hp", "strike-button"], ["createInitialState", "strike", "mountGame"], {"playerHp":20,"playerEnergy":3,"enemyHp":20}, {"playerHp":20,"playerEnergy":2,"enemyHp":14}, "strike-button", [VisualExpectation("#player-energy","3","2"),VisualExpectation("#enemy-hp","20","14")]),
    "tactics": ("tactics", ["player-hp", "action-points", "enemy-hp", "attack-button"], ["createInitialState", "attack", "mountGame"], {"playerHp":20,"actionPoints":2,"enemyHp":12}, {"playerHp":20,"actionPoints":1,"enemyHp":8}, "attack-button", [VisualExpectation("#action-points","2","1"),VisualExpectation("#enemy-hp","12","8")]),
    "tower": ("tower defense", ["gold", "wave", "enemy-hp", "fire-button"], ["createInitialState", "fire", "mountGame"], {"gold":10,"wave":1,"enemyHp":12}, {"gold":10,"wave":1,"enemyHp":8}, "fire-button", [VisualExpectation("#enemy-hp","12","8")]),
    "deck": ("deckbuilder", ["deck-count", "hand-count", "energy", "draw-button"], ["createInitialState", "drawCard", "mountGame"], {"deckCount":5,"handCount":0,"energy":3}, {"deckCount":4,"handCount":1,"energy":3}, "draw-button", [VisualExpectation("#deck-count","5","4"),VisualExpectation("#hand-count","0","1")]),
    "resource": ("resource management", ["wood", "workers", "turn", "gather-button"], ["createInitialState", "gather", "mountGame"], {"wood":0,"workers":2,"turn":1}, {"wood":4,"workers":2,"turn":2}, "gather-button", [VisualExpectation("#wood","0","4"),VisualExpectation("#turn","1","2")]),
}


def _browser(id: str, key: str, *, repair: bool = False) -> BenchmarkTask:
    name, ids, functions, initial, after, button, changes = PROJECTS[key]
    contract = simple_browser_contract(name, ids, functions, initial, after, button, changes)
    rule = f"Initial state is {initial}; one action produces {after}; mountGame renders and updates the state without mutating input."
    request = _project_request(name, ids, ", ".join(functions), rule)
    initial_request = None
    if repair:
        initial_request = request + " For the controlled first attempt only, deliberately make the action produce enemy HP 15 instead of 14."
    return BenchmarkTask(id, "repair-self-correction" if repair else "project-browser-game", "D4", request, f"{EVALUATOR_VERSION}:{id.lower()}", kind="browser-project", browser=contract, initial_request=initial_request)


TASKS: list[BenchmarkTask] = [
    _single("ABV2-CG-01","code-generation","D1","H1"), _single("ABV2-CG-02","code-generation","D1","H4"), _single("ABV2-CG-03","code-generation","D1","H13"), _single("ABV2-CG-04","code-generation","D1","H14"),
    _single("ABV2-CM-01","code-modification","D1","H2"), _single("ABV2-CM-02","code-modification","D1","H10"), _single("ABV2-CM-03","code-modification","D1","H16"), _single("ABV2-CM-04","code-modification","D1","H21"),
    _single("ABV2-GL-01","game-logic","D2","H3"), _single("ABV2-GL-02","game-logic","D2","H5"), _single("ABV2-GL-03","game-logic","D2","H6"), _single("ABV2-GL-04","game-logic","D2","H7"), _single("ABV2-GL-05","game-logic","D1","H8"), _single("ABV2-GL-06","game-logic","D2","H9"), _single("ABV2-GL-07","game-logic","D2","H11"), _single("ABV2-GL-08","game-logic","D2","H12"), _single("ABV2-GL-09","game-logic","D2","H15"), _single("ABV2-GL-10","game-logic","D2","H18"), _single("ABV2-GL-11","game-logic","D2","H19"), _single("ABV2-GL-12","game-logic","D1","H22"),
    BenchmarkTask("ABV2-GL-13","game-logic","D3",CARD_TURN.request,f"{EVALUATOR_VERSION}:gl13",holdout=CARD_TURN), BenchmarkTask("ABV2-GL-14","game-logic","D3",TACTICS_TURN.request,f"{EVALUATOR_VERSION}:gl14",holdout=TACTICS_TURN),
    _browser("ABV2-PJ-01","card"), _browser("ABV2-PJ-02","tactics"), _browser("ABV2-PJ-03","tower"), _browser("ABV2-PJ-04","deck"), _browser("ABV2-PJ-05","resource"),
    _browser("ABV2-RP-01","card",repair=True),
    _single("ABV2-RP-02","repair-self-correction","D2","H23", H["H23"].request.replace("non-negative cost", "for the controlled first attempt, include negative cost")),
    _single("ABV2-RP-03","repair-self-correction","D2","H17", H["H17"].request.replace("preserve original order", "for the controlled first attempt, reverse original order")),
]


def prepare_workspace(workspace: Path, task: BenchmarkTask) -> None:
    workspace.mkdir(parents=True, exist_ok=True)
    if task.holdout and task.holdout.seed is not None:
        (workspace / task.holdout.target_file).write_text(task.holdout.seed)


def evaluate_task(workspace: Path, task: BenchmarkTask) -> dict[str, Any]:
    if task.holdout:
        return evaluate_javascript(workspace, task.holdout.target_file, task.holdout.evaluator_script, task.holdout.expected_stdout)
    assert task.browser
    return evaluate_browser_project(workspace, task.browser)


def _normalize(evaluation: dict[str, Any]) -> dict[str, Any]:
    browser = "filesValid" in evaluation
    return {"passed": bool(evaluation.get("passed")), "buildPass": bool(evaluation.get("buildPass", evaluation.get("buildArtifactMatches", False))), "functionalPass": bool(evaluation.get("functionalPass", evaluation.get("logicPassed", False))), "visualPass": bool(evaluation.get("visualPassed")) if browser else None}


def _summary(results: list[dict[str, Any]]) -> dict[str, Any]:
    def rate(count: int, total: int) -> float | None: return count / total if total else None
    repairs = [row for row in results if row["repairAttempted"]]
    visuals = [row for row in results if row["visualPass"] is not None]
    tools = sum(row["toolCalls"] for row in results)
    return {"tasks": len(results), "taskSuccessRate": rate(sum(row["success"] for row in results),len(results)), "firstPassSuccessRate": rate(sum(row["firstPassSuccess"] for row in results),len(results)), "buildPassRate": rate(sum(row["buildPass"] for row in results),len(results)), "functionalPassRate": rate(sum(row["functionalPass"] for row in results),len(results)), "visualPassRate": rate(sum(row["visualPass"] for row in visuals),len(visuals)), "repairSuccessRate": rate(sum(row["repairSuccess"] for row in repairs),len(repairs)), "averageRepairsUsed": rate(sum(row["repairsUsed"] for row in results),len(results)), "averageAgentIterations": rate(sum(row["agentIterations"] for row in results),len(results)), "toolCallFailureRate": rate(sum(row["failedToolCalls"] for row in results),tools)}


def run_benchmark(model: AgentModel, model_name: str, tasks: Iterable[BenchmarkTask] = TASKS, report_path: str | None = None, model_settings: dict[str, Any] | None = None) -> dict[str, Any]:
    selected = list(tasks); results=[]
    for task in selected:
        workspace=Path(tempfile.mkdtemp(prefix=f"agent-benchmark-v2-{task.id.lower()}-"));prepare_workspace(workspace,task)
        run=run_with_evaluator_repair(task.target_request,model=model,executor=ToolExecutor(workspace),evaluator=lambda t=task,w=workspace:evaluate_task(w,t),initial_request=task.initial_request,max_repairs=BUDGET["repairBudget"],max_iterations_per_agent_run=BUDGET["maxIterationsPerAgentRun"],max_tool_calls_per_iteration=BUDGET["maxToolCallsPerIteration"])
        final=_normalize(run.final_evaluation);first=_normalize(run.attempts[0].evaluation);events=[e for a in run.attempts for e in a.agent_result.events];tool_results=[e for e in events if e.type=="tool_result" and e.result]
        results.append({"taskId":task.id,"category":task.category,"difficulty":task.difficulty,"familyId":task.family_id,"evaluatorId":task.evaluator_id,"success":final["passed"],"firstPassSuccess":first["passed"],"buildPass":final["buildPass"],"functionalPass":final["functionalPass"],"visualPass":final["visualPass"],"repairAttempted":len(run.attempts)>1,"repairSuccess":not first["passed"] and final["passed"],"repairsUsed":run.repairs_used,"agentIterations":sum(a.agent_result.iterations for a in run.attempts),"toolCalls":len(tool_results),"failedToolCalls":sum(not e.result.ok for e in tool_results),"reachedRepairLimit":run.status=="repair_limit_reached","workspace":str(workspace)})
    report={"benchmark":BENCHMARK_VERSION,"model":model_name,"modelSettings":model_settings,"tasks":len(results),"budget":BUDGET,"summary":_summary(results),"byCategory":{key:_summary([x for x in results if x["category"]==key]) for key in sorted({x["category"] for x in results})},"byDifficulty":{key:_summary([x for x in results if x["difficulty"]==key]) for key in ("D1","D2","D3","D4")},"results":results}
    if report_path:
        path=Path(report_path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,indent=2)+"\n")
    return report

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from strategy_game_agent.benchmark import TASKS, evaluate_task, prepare_workspace
from strategy_game_agent.evaluators import evaluate_b1, evaluate_browser_project


GAME = """export function createInitialState(){return {playerHp:20,playerEnergy:3,enemyHp:20}}
export function strike(state){return {...state,playerEnergy:state.playerEnergy-1,enemyHp:state.enemyHp-6}}
export function mountGame(document){let state=createInitialState();const hp=document.getElementById('player-hp'),energy=document.getElementById('player-energy'),enemy=document.getElementById('enemy-hp'),button=document.getElementById('strike-button');const render=()=>{hp.textContent=String(state.playerHp);energy.textContent=String(state.playerEnergy);enemy.textContent=String(state.enemyHp)};button.addEventListener('click',()=>{state=strike(state);render()});render()}
if(typeof document!=='undefined')mountGame(document)
"""
INDEX = """<!doctype html><body><span id="player-hp"></span><span id="player-energy"></span><span id="enemy-hp"></span><button id="strike-button">Strike</button><script type="module" src="./dist/game.js"></script></body>"""
PROJECT = """import{mkdir,copyFile,readFile}from'node:fs/promises';import{createServer}from'node:http';
if(process.argv[2]==='build'){await mkdir('dist',{recursive:true});await copyFile('src/game.js','dist/game.js')}
else if(process.argv[2]==='serve'){await mkdir('dist',{recursive:true});const server=createServer(async(req,res)=>{const p=req.url==='/dist/game.js'?'dist/game.js':'index.html';res.end(await readFile(p))});server.listen(Number(process.env.PORT||4173),'127.0.0.1')}
"""


class EvaluatorTests(unittest.TestCase):
    def test_b1_is_external_and_checks_real_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / "hello-agent.js").write_text('console.log("hello agent")\n')
            self.assertTrue(evaluate_b1(root)["passed"])

    def test_single_file_gold_fixture(self):
        task = next(item for item in TASKS if item.id == "ABV2-CM-01")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); prepare_workspace(root, task)
            (root / "math.js").write_text("export function add(a,b){return a+b}\n")
            self.assertTrue(evaluate_task(root, task)["passed"])

    def test_browser_project_build_logic_launch_and_visual_contract(self):
        task = next(item for item in TASKS if item.id == "ABV2-PJ-01")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / "src").mkdir(); (root / "dist").mkdir()
            (root / "src/game.js").write_text(GAME); (root / "dist/game.js").write_text(GAME)
            (root / "index.html").write_text(INDEX); (root / "project.mjs").write_text(PROJECT)
            fake_visual = lambda url, contract: {"passed": True, "rendered": True, "interactionPassed": True}
            result = evaluate_browser_project(root, task.browser, fake_visual)
            self.assertTrue(result["passed"], result)

    def test_browser_server_cannot_write_outside_dist(self):
        task = next(item for item in TASKS if item.id == "ABV2-PJ-01")
        malicious = PROJECT.replace("await mkdir('dist',{recursive:true});const server", "await import('node:fs/promises').then(fs=>fs.writeFile('escape.txt','bad'));const server")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / "src").mkdir(); (root / "dist").mkdir()
            for path, content in (("src/game.js", GAME), ("dist/game.js", GAME), ("index.html", INDEX), ("project.mjs", malicious)):
                target = root / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(content)
            result = evaluate_browser_project(root, task.browser, lambda *_: {"passed": True})
            self.assertFalse(result["launchPassed"]); self.assertFalse((root / "escape.txt").exists())


if __name__ == "__main__":
    unittest.main()

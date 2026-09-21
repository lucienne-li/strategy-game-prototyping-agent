from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .runtime import ToolExecutor


def _regular_file(workspace: Path, relative: str) -> Path:
    path = workspace / relative
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"{relative} must be a regular file")
    return path


def evaluate_b1(workspace: str | Path) -> dict[str, Any]:
    root = Path(workspace)
    try:
        _regular_file(root, "hello-agent.js")
    except Exception as error:
        return {"passed": False, "fileExists": False, "stdout": "", "stderr": "", "exitCode": None, "error": str(error)}
    _, result = ToolExecutor(root, node_fs_access="read-only").execute({"tool": "run_command", "command": "node", "args": ["hello-agent.js"]})
    passed = result.ok and result.exit_code == 0 and (result.stdout or "").strip() == "hello agent" and not result.stderr
    return {"passed": passed, "fileExists": True, "stdout": result.stdout or "", "stderr": result.stderr or "", "exitCode": result.exit_code, **({} if passed else {"error": result.error or "output did not match B1"})}


def evaluate_javascript(workspace: str | Path, target_file: str, evaluator_script: str, expected_stdout: str | None = None) -> dict[str, Any]:
    root = Path(workspace)
    try:
        _regular_file(root, target_file)
    except Exception as error:
        return {"passed": False, "buildPass": False, "functionalPass": False, "stdout": "", "stderr": "", "exitCode": None, "error": str(error)}
    executor = ToolExecutor(root, node_fs_access="read-only")
    _, build = executor.execute({"tool": "run_command", "command": "node", "args": [target_file], "timeoutMs": 10_000})
    if not build.ok:
        return {"passed": False, "buildPass": False, "functionalPass": False, "stdout": build.stdout or "", "stderr": build.stderr or "", "exitCode": build.exit_code, "error": build.error or "Node parse/import failed"}
    _, functional = executor.execute({"tool": "run_command", "command": "node", "args": ["--input-type=module", "-e", evaluator_script], "timeoutMs": 10_000})
    output_ok = expected_stdout is None or (functional.stdout or "").strip() == expected_stdout
    passed = functional.ok and functional.exit_code == 0 and output_ok
    return {"passed": passed, "buildPass": True, "functionalPass": passed, "stdout": functional.stdout or "", "stderr": functional.stderr or "", "exitCode": functional.exit_code, **({} if passed else {"error": functional.error or "hidden functional checks failed"})}


@dataclass(frozen=True)
class VisualExpectation:
    selector: str
    before: str
    after: str


@dataclass(frozen=True)
class BrowserContract:
    required_files: tuple[str, ...]
    source_file: str
    build_artifact: str
    evaluator_script: str
    expected_stdout: str
    page_markers: tuple[str, ...]
    module_markers: tuple[str, ...]
    visible_selectors: tuple[str, ...]
    interaction_selector: str
    expectations: tuple[VisualExpectation, ...]
    viewport: tuple[int, int] = (1280, 720)


def evaluate_browser_visual(base_url: str, contract: BrowserContract) -> dict[str, Any]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"passed": False, "rendered": False, "nonBlank": False, "controlsVisible": False, "noObviousOverflow": False, "interactionPassed": False, "error": "install Python Playwright and Chromium"}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": contract.viewport[0], "height": contract.viewport[1]})
            response = page.goto(base_url, wait_until="networkidle", timeout=10_000)
            rendered = bool(response and response.ok)
            body = page.locator("body")
            non_blank = bool(body.inner_text().strip()) and page.evaluate("getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)' || document.body.children.length > 0")
            controls = all(page.locator(selector).is_visible() for selector in contract.visible_selectors)
            overflow = page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2 && document.documentElement.scrollHeight <= innerHeight + 2")
            before = {item.selector: page.locator(item.selector).inner_text().strip() for item in contract.expectations}
            page.locator(contract.interaction_selector).click()
            after = {item.selector: page.locator(item.selector).inner_text().strip() for item in contract.expectations}
            interaction = all(before[item.selector] == item.before and after[item.selector] == item.after for item in contract.expectations)
            browser.close()
            passed = rendered and non_blank and controls and overflow and interaction
            return {"passed": passed, "rendered": rendered, "nonBlank": non_blank, "controlsVisible": controls, "noObviousOverflow": overflow, "interactionPassed": interaction}
    except Exception as error:
        return {"passed": False, "rendered": False, "nonBlank": False, "controlsVisible": False, "noObviousOverflow": False, "interactionPassed": False, "error": str(error)}


def evaluate_browser_project(workspace: str | Path, contract: BrowserContract, visual_evaluator: Callable[[str, BrowserContract], dict[str, Any]] = evaluate_browser_visual) -> dict[str, Any]:
    root = Path(workspace).resolve()
    base = {"filesValid": False, "buildArtifactMatches": False, "logicPassed": False, "uiPassed": False, "launchPassed": False, "visualPassed": False, "stdout": "", "stderr": "", "exitCode": None}
    try:
        for relative in contract.required_files:
            _regular_file(root, relative)
        base["filesValid"] = True
        source = (root / contract.source_file).read_text()
        built = (root / contract.build_artifact).read_text()
        base["buildArtifactMatches"] = source == built
        if not base["buildArtifactMatches"]:
            return {"passed": False, **base, "error": f"{contract.build_artifact} does not match {contract.source_file}"}
        _, result = ToolExecutor(root, node_fs_access="read-only").execute({"tool": "run_command", "command": "node", "args": ["--input-type=module", "-e", contract.evaluator_script], "timeoutMs": 10_000})
        base.update(stdout=result.stdout or "", stderr=result.stderr or "", exitCode=result.exit_code)
        behavior = result.ok and result.exit_code == 0 and (result.stdout or "").strip() == contract.expected_stdout and not result.stderr
        if not behavior:
            return {"passed": False, **base, "error": result.error or "browser project behavior failed"}
        base["logicPassed"] = base["uiPassed"] = True
        launch, visual, error = _verify_server(root, contract, visual_evaluator)
        base["launchPassed"] = launch
        base["visualPassed"] = bool(visual.get("passed"))
        return {"passed": launch and base["visualPassed"], **base, "visual": visual, **({} if launch and base["visualPassed"] else {"error": error or visual.get("error")})}
    except Exception as error:
        return {"passed": False, **base, "error": str(error)}


def _verify_server(root: Path, contract: BrowserContract, visual_evaluator: Callable[[str, BrowserContract], dict[str, Any]]) -> tuple[bool, dict[str, Any], str | None]:
    dist = (root / "dist").resolve(strict=True)
    if not dist.is_dir() or dist.is_symlink() or dist.parent != root:
        return False, {"passed": False}, "dist must be a regular directory inside workspace"
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    node = shutil.which("node")
    if not node:
        return False, {"passed": False}, "node executable not found; it is required only to run generated browser JavaScript"
    process = subprocess.Popen(
        [node, "--permission", f"--allow-fs-read={root}", f"--allow-fs-write={dist}", "project.mjs", "serve"],
        cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        env={"PATH": os.environ.get("PATH", ""), "PORT": str(port)},
    )
    error = "server did not become reachable"
    try:
        base_url = f"http://127.0.0.1:{port}"
        for _ in range(40):
            if process.poll() is not None:
                break
            try:
                with urllib.request.urlopen(base_url + "/", timeout=1) as page, urllib.request.urlopen(base_url + "/dist/game.js", timeout=1) as module:
                    page_text, module_text = page.read().decode(), module.read().decode()
                    if all(marker in page_text for marker in contract.page_markers) and all(marker in module_text for marker in contract.module_markers):
                        visual = visual_evaluator(base_url, contract)
                        return True, visual, visual.get("error")
            except Exception as request_error:
                error = str(request_error)
            time.sleep(0.05)
        return False, {"passed": False, "rendered": False, "interactionPassed": False}, error
    finally:
        if process.poll() is None:
            process.kill()
        process.communicate(timeout=5)


def simple_browser_contract(name: str, ids: list[str], functions: list[str], initial: dict[str, int], after: dict[str, int], button: str, changes: list[VisualExpectation]) -> BrowserContract:
    state_ids = [item for item in ids if item != button]
    create, action, mount = functions
    expected = f"{name} evaluator passed"
    assertions = [
        "import assert from 'node:assert/strict';", "const game=await import('./dist/game.js');",
        *[f"assert.equal(typeof game.{function}, 'function');" for function in functions],
        f"const initial=game.{create}();", f"assert.deepEqual(initial,{json.dumps(initial, separators=(',', ':'))});",
        f"assert.deepEqual(game.{action}(initial),{json.dumps(after, separators=(',', ':'))});",
        f"assert.deepEqual(initial,{json.dumps(initial, separators=(',', ':'))});",
        "const listeners=new Map();",
        f"const elements=new Map({json.dumps(ids)}.map(id=>[id,{{textContent:'',disabled:false,addEventListener(type,fn){{listeners.set(`${{id}}:${{type}}`,fn)}}}}]));",
        "const document={getElementById(id){return elements.get(id)??null}};",
        f"game.{mount}(document);",
        *[f"assert.equal(elements.get('{item}').textContent,'{initial[_camel(item)]}');" for item in state_ids],
        f"listeners.get('{button}:click')();",
        *[f"assert.equal(elements.get('{item}').textContent,'{after[_camel(item)]}');" for item in state_ids],
        f"console.log({json.dumps(expected)});",
    ]
    return BrowserContract(
        required_files=("index.html", "src/game.js", "project.mjs", "dist/game.js"), source_file="src/game.js", build_artifact="dist/game.js",
        evaluator_script="\n".join(assertions), expected_stdout=expected, page_markers=tuple(ids), module_markers=tuple(functions),
        visible_selectors=tuple(f"#{item}" for item in ids), interaction_selector=f"#{button}", expectations=tuple(changes),
    )


def _camel(value: str) -> str:
    return re.sub(r"-([a-z])", lambda match: match.group(1).upper(), value)

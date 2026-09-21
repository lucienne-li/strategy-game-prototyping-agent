from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import asdict
from pathlib import Path

from .benchmark import BENCHMARK_VERSION, BUDGET, EVALUATOR_VERSION, MODEL_SETTINGS, TASKS


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "evals/agent_benchmark_v2"
SOURCE_FILES = (
    "strategy_game_agent/agent.py", "strategy_game_agent/models.py", "strategy_game_agent/runtime.py",
    "strategy_game_agent/repair.py", "strategy_game_agent/evaluators.py", "strategy_game_agent/benchmark.py",
)


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    catalog = [{**asdict(task), "family_id": task.family_id} for task in TASKS]
    catalog_bytes = (json.dumps(catalog, indent=2, ensure_ascii=False) + "\n").encode()
    (OUTPUT / "tasks.json").write_bytes(catalog_bytes)
    manifest = {
        "benchmarkVersion": BENCHMARK_VERSION,
        "status": "frozen",
        "taskCount": len(TASKS),
        "evaluatorVersion": EVALUATOR_VERSION,
        "agentRuntimeCommit": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip(),
        "budget": BUDGET,
        "modelSettings": MODEL_SETTINGS,
        "tasksSha256": digest_bytes(catalog_bytes),
        "sourceSha256": {path: digest_bytes((ROOT / path).read_bytes()) for path in SOURCE_FILES},
        "historicalBenchmark": "evals/agent_benchmark_v1 remains unchanged and is not comparable without an explicit migration note",
    }
    manifest_bytes = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()
    (OUTPUT / "freeze-manifest.json").write_bytes(manifest_bytes)
    freeze_hash = digest_bytes(manifest_bytes)
    (OUTPUT / "freeze-manifest.sha256").write_text(f"{freeze_hash}  freeze-manifest.json\n")
    print(json.dumps({"benchmark": BENCHMARK_VERSION, "tasks": len(TASKS), "freezeHash": freeze_hash}, indent=2))


if __name__ == "__main__":
    main()

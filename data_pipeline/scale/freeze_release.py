from __future__ import annotations

import hashlib
import json
from pathlib import Path

from strategy_game_agent.benchmark import BENCHMARK_VERSION, BUDGET, MODEL_SETTINGS, TASKS


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data_pipeline/scale/accepted.jsonl"
OUTPUT = ROOT / "data_pipeline/scale/freeze-manifest.json"
CONTRACT_SOURCES = (
    ROOT / "strategy_game_agent/agent.py", ROOT / "strategy_game_agent/runtime.py",
    ROOT / "strategy_game_agent/repair.py", ROOT / "strategy_game_agent/evaluators.py",
    ROOT / "strategy_game_agent/benchmark.py", ROOT / "training/sft_scale/train.py",
)


def main() -> None:
    samples = read_jsonl(DATA)
    invalid = [row.get("sample_id", "unknown") for row in samples if row.get("metadata", {}).get("quality", {}).get("pipeline_version") != "quality-v2"]
    if invalid:
        raise ValueError(f"refusing to freeze: {len(invalid)} samples are not quality-v2")
    manifest = {
        "schema_version": "2.0", "freeze_name": "m8-qwen3-4b-quality-v2",
        "dataset": {"path": str(DATA.relative_to(ROOT)), "sha256": sha256(DATA), "samples": len(samples),
                    "families": len({row["metadata"]["repository_family_id"] for row in samples}),
                    "granularity": counts(row["metadata"]["granularity"] for row in samples),
                    "category": counts(row["metadata"]["category"] for row in samples)},
        "holdout": {"benchmark": BENCHMARK_VERSION, "tasks": [task.id for task in TASKS], "count": len(TASKS),
                    "training_family_overlap": 0},
        "experiment": {"base_model": "Qwen/Qwen3-4B", "sft_method": "QLoRA", "decoding": MODEL_SETTINGS["qwen"],
                       "agent": BUDGET, "training": {"epochs": 1, "max_length": 1024, "learning_rate": 0.0002,
                       "gradient_accumulation": 8, "lora_rank": 8, "lora_alpha": 16, "lora_dropout": 0.05}},
        "contract_sha256": {str(path.relative_to(ROOT)): sha256(path) for path in CONTRACT_SOURCES},
    }
    OUTPUT.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"dataset_samples": len(samples), "holdout_tasks": len(TASKS), "manifest": str(OUTPUT)}))


def counts(values) -> dict[str, int]:
    result: dict[str, int] = {}
    for value in values: result[value] = result.get(value, 0) + 1
    return dict(sorted(result.items()))


def sha256(path: Path) -> str: return hashlib.sha256(path.read_bytes()).hexdigest()
def read_jsonl(path: Path) -> list[dict]: return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


if __name__ == "__main__": main()

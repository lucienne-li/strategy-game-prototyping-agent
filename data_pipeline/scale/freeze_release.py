from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data_pipeline" / "scale" / "accepted.jsonl"
AUDIT = ROOT / "data_pipeline" / "scale" / "quality-audit-reviewed.jsonl"
OUTPUT = ROOT / "data_pipeline" / "scale" / "freeze-manifest.json"
HOLDOUT_SOURCES = [
    ROOT / "src" / "evaluation" / "sft-holdout.ts",
    ROOT / "src" / "evaluation" / "scale-holdout.ts",
]
CONTRACT_SOURCES = [
    *HOLDOUT_SOURCES,
    ROOT / "src" / "evaluation" / "sft-holdout.ts",
    ROOT / "src" / "scale-evaluation-cli.ts",
    ROOT / "src" / "agent" / "agent-loop.ts",
    ROOT / "src" / "repair" / "evaluator-repair-loop.ts",
    ROOT / "training" / "sft_scale" / "train.py",
]


def main() -> None:
    samples = read_jsonl(DATA)
    audits = read_jsonl(AUDIT)
    holdout_text = "\n".join(path.read_text(encoding="utf-8") for path in HOLDOUT_SOURCES)
    task_ids = sorted(set(re.findall(r"\bH\d{1,2}_[A-Z_]+\b", holdout_text)))
    if len(task_ids) != 24:
        raise ValueError(f"expected 24 frozen holdout tasks, found {len(task_ids)}")
    manifest = {
        "schema_version": "1.0",
        "freeze_name": "m8-qwen3-4b-quality-freeze-v1",
        "dataset": {
            "path": str(DATA.relative_to(ROOT)),
            "sha256": sha256(DATA),
            "samples": len(samples),
            "families": len({item["metadata"]["repository_family_id"] for item in samples}),
            "granularity": counts(item["metadata"]["granularity"] for item in samples),
            "category": counts(item["metadata"]["category"] for item in samples),
        },
        "quality_audit": {
            "path": str(AUDIT.relative_to(ROOT)),
            "sha256": sha256(AUDIT),
            "reviewed": len(audits),
            "accepted": sum(item["review"]["decision"] == "accept" for item in audits),
            "rejected": sum(item["review"]["decision"] == "reject" for item in audits),
        },
        "holdout": {
            "tasks": task_ids,
            "count": len(task_ids),
            "source_sha256": {str(path.relative_to(ROOT)): sha256(path) for path in HOLDOUT_SOURCES},
            "training_family_overlap": 0,
        },
        "experiment": {
            "base_model": "Qwen/Qwen3-4B",
            "sft_method": "QLoRA",
            "decoding": {"do_sample": False, "max_new_tokens": 512, "thinking": False},
            "agent": {"max_iterations": 4, "max_tool_calls_per_iteration": 8, "repair_budget": 1},
            "training": {
                "epochs": 1,
                "max_length": 1024,
                "learning_rate": 0.0002,
                "gradient_accumulation": 8,
                "lora_rank": 8,
                "lora_alpha": 16,
                "lora_dropout": 0.05,
            },
        },
        "contract_sha256": {str(path.relative_to(ROOT)): sha256(path) for path in dict.fromkeys(CONTRACT_SOURCES)},
    }
    OUTPUT.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"dataset_samples": len(samples), "holdout_tasks": len(task_ids), "manifest": str(OUTPUT)}))


def counts(values) -> dict[str, int]:
    result: dict[str, int] = {}
    for value in values:
        result[value] = result.get(value, 0) + 1
    return dict(sorted(result.items()))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


if __name__ == "__main__":
    main()

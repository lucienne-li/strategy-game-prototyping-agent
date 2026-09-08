from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "data_pipeline" / "scale" / "freeze-manifest.json"


def main() -> None:
    freeze = json.loads(MANIFEST.read_text(encoding="utf-8"))
    checks = {
        freeze["dataset"]["path"]: freeze["dataset"]["sha256"],
        freeze["quality_audit"]["path"]: freeze["quality_audit"]["sha256"],
        **freeze["holdout"]["source_sha256"],
        **freeze["contract_sha256"],
    }
    mismatches = [path for path, expected in checks.items() if sha256(ROOT / path) != expected]
    samples = read_jsonl(ROOT / freeze["dataset"]["path"])
    audits = read_jsonl(ROOT / freeze["quality_audit"]["path"])
    if len(samples) != freeze["dataset"]["samples"]:
        mismatches.append("dataset sample count")
    if len(audits) != freeze["quality_audit"]["reviewed"]:
        mismatches.append("quality audit count")
    if mismatches:
        raise ValueError(f"frozen experiment mismatch: {', '.join(sorted(set(mismatches)))}")
    print(json.dumps({
        "freeze": freeze["freeze_name"],
        "dataset_samples": len(samples),
        "holdout_tasks": freeze["holdout"]["count"],
        "status": "verified",
    }))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


if __name__ == "__main__":
    main()

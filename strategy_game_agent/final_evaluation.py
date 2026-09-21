from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from .benchmark import MODEL_SETTINGS, run_benchmark
from .local_models import LocalQwenArtifactWorker, ScaffoldedArtifactAgentModel


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="Qwen/Qwen3-4B")
    parser.add_argument("--adapter", default="artifacts/final-sft/checkpoint-final")
    parser.add_argument("--output", default="artifacts/final-sft/base-vs-sft.json")
    args = parser.parse_args()
    freeze = ROOT / "data_pipeline/v3/freeze-manifest.json"
    if not freeze.exists():
        raise RuntimeError("freeze Data Pipeline v3 before final evaluation")
    manifest = json.loads(freeze.read_text())
    if sha256(ROOT / manifest["dataset"]["path"]) != manifest["dataset"]["sha256"]:
        raise RuntimeError("frozen dataset hash mismatch")
    reports = {}
    for label, adapter in (("base", None), ("sft", args.adapter)):
        worker = LocalQwenArtifactWorker(python=os.environ.get("QUALITY_PYTHON", ".venv/bin/python"), script="training/final/agent_worker.py", model=args.model, adapter=adapter, max_new_tokens=4096)
        try:
            reports[label] = run_benchmark(ScaffoldedArtifactAgentModel(worker), f"{args.model}:{label}", model_settings=MODEL_SETTINGS["qwen"])
        finally:
            worker.close()
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"model": args.model, "dataset": manifest["dataset"], **reports}, indent=2) + "\n")
    print(output)


if __name__ == "__main__":
    main()

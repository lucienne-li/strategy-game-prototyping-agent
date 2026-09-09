from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from .common import ROOT


def main() -> None:
    checkout = os.environ.get("V3_CHECKOUT_ROOT") or os.environ.get("SCALE_CHECKOUT_ROOT")
    if not checkout:
        raise RuntimeError("set V3_CHECKOUT_ROOT to a persistent local directory for repository checkouts")
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required for v3 generation and strong review")
    workers = os.environ.get("V3_WORKERS", "1")
    commands = [
        [sys.executable, "data_pipeline/scale/batch_repositories.py", "--checkout-root", checkout, "--workers", workers],
        [sys.executable, "data_pipeline/scale/group_families.py", "--checkout-root", checkout],
        ["node", "data_pipeline/scale/extract-units.mjs", "--checkout-root", checkout, "--output", "data_pipeline/v3/source-units.jsonl", "--target", "5000", "--limit-per-repo", "200"],
        ["node", "data_pipeline/scale/validate-targets.mjs", "--input", "data_pipeline/v3/source-units.jsonl", "--output", "data_pipeline/v3/source-validations.jsonl"],
        [sys.executable, "-m", "data_pipeline.v3.build_targets", "--target", "3600"],
        [sys.executable, "-m", "data_pipeline.v3.generate", "--workers", workers],
        [sys.executable, "-m", "data_pipeline.v3.finalize", "--workers", workers],
    ]
    for command in commands:
        print(f"running: {' '.join(command)}", flush=True)
        subprocess.run(command, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Reprocess the fixed 440-unit pool through quality-v2 without fetching repositories.")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--generator-model", default="gpt-5.6")
    parser.add_argument("--reviewer-model", default="gpt-5.6")
    args = parser.parse_args()
    commands = [
        ["node", "data_pipeline/scale/validate-targets.mjs"],
        [sys.executable, "data_pipeline/scale/generate_instructions.py", "--workers", str(args.workers), "--model", args.generator_model, "--max-output-tokens", "512"],
        [sys.executable, "data_pipeline/scale/review_instructions.py", "--workers", str(args.workers), "--model", args.reviewer_model],
        [sys.executable, "data_pipeline/scale/finalize_scale.py"],
    ]
    for command in commands:
        print(f"running: {' '.join(command)}", flush=True)
        subprocess.run(command, check=True)


if __name__ == "__main__":
    main()

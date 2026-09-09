from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the resumable repository-to-SFT JSONL scale pipeline.")
    parser.add_argument("--checkout-root", required=True)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    commands = [
        [sys.executable, "data_pipeline/scale/batch_repositories.py", "--checkout-root", args.checkout_root, "--workers", str(args.workers)],
        [sys.executable, "data_pipeline/scale/group_families.py", "--checkout-root", args.checkout_root],
        ["node", "data_pipeline/scale/extract-units.mjs", "--checkout-root", args.checkout_root, "--target", "520", "--limit-per-repo", "40"],
        ["node", "data_pipeline/scale/validate-targets.mjs"],
        [sys.executable, "data_pipeline/scale/generate_instructions.py", "--workers", str(args.workers), "--max-output-tokens", "1024"],
        [sys.executable, "data_pipeline/scale/review_instructions.py", "--workers", str(args.workers)],
        [sys.executable, "data_pipeline/scale/finalize_scale.py"],
    ]
    for command in commands:
        print(f"running: {' '.join(command)}", flush=True)
        subprocess.run(command, check=True)


if __name__ == "__main__":
    main()

from __future__ import annotations

import json

from .common import ROOT, read_jsonl, sha256_file


def main() -> None:
    path = ROOT / "data_pipeline/v3/freeze-manifest.json"
    freeze = json.loads(path.read_text(encoding="utf-8"))
    expected_line = (ROOT / "data_pipeline/v3/freeze-manifest.sha256").read_text(encoding="utf-8").split()[0]
    checks = {
        "manifest": sha256_file(path) == expected_line,
        "dataset": sha256_file(ROOT / freeze["dataset"]["path"]) == freeze["dataset"]["sha256"],
        "rejected": sha256_file(ROOT / freeze["rejected"]["path"]) == freeze["rejected"]["sha256"],
        "summary": sha256_file(ROOT / freeze["summary"]["path"]) == freeze["summary"]["sha256"],
        "sample_count": len(read_jsonl(ROOT / freeze["dataset"]["path"])) == freeze["dataset"]["samples"],
    }
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise RuntimeError(f"frozen v3 dataset mismatch: {', '.join(failed)}")
    print(json.dumps({"status": "verified", "freeze": freeze["freeze_name"], "samples": freeze["dataset"]["samples"]}))


if __name__ == "__main__":
    main()

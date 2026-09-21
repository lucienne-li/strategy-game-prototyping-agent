from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
ALLOWED = ["MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0"]


def rows(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def main() -> None:
    schema = json.loads((ROOT / "manifests/repository.schema.json").read_text())
    manifests, accepted, rejected = rows(ROOT / "manifests/pilot-repositories.jsonl"), rows(ROOT / "samples/accepted.jsonl"), rows(ROOT / "samples/rejected.jsonl")
    require(len(manifests) == 5, f"expected 5 repository manifests, found {len(manifests)}")
    require(len(accepted) + len(rejected) == 8, "expected 8 extracted code units")
    require(schema["properties"]["license"]["properties"]["spdx_id"]["enum"] == ALLOWED, "repository schema license allowlist differs from validator policy")
    by_repo: dict[str, Any] = {}
    for manifest in manifests:
        repo = manifest["repository_id"]
        require(manifest["schema_version"] == "0.1" and "/" in repo, "invalid manifest")
        require(manifest["url"].startswith("https://github.com/"), f"invalid repository URL for {repo}")
        require(bool(__import__("re").fullmatch(r"[0-9a-f]{40}", manifest["commit_sha"])), f"invalid commit for {repo}")
        require(manifest["license"]["spdx_id"] in ALLOWED and manifest["license"]["verified"] is True, f"license rejected for {repo}")
        require(manifest["build"]["exit_code"] == 0 and str(manifest["build"]["status"]).startswith("passed"), f"build not passed for {repo}")
        require(manifest["duplicate"]["is_fork"] is False and repo not in by_repo, f"duplicate/fork repository {repo}")
        by_repo[repo] = manifest
    ids: set[str] = set(); hashes: set[str] = set()
    for sample in accepted + rejected:
        sample_id, metadata = sample["sample_id"], sample["metadata"]
        require(sample_id not in ids, f"duplicate sample id {sample_id}"); ids.add(sample_id)
        require(metadata["source_repo"] in by_repo and by_repo[metadata["source_repo"]]["commit_sha"] == metadata["source_commit"], f"provenance mismatch for {sample_id}")
        require(metadata["granularity"] in {"G1", "G2"}, f"pilot granularity rejected for {sample_id}")
        messages = sample["messages"]
        require(len(messages) == 2 and [row["role"] for row in messages] == ["user", "assistant"], f"invalid messages for {sample_id}")
        target = messages[1]["content"].replace("\r\n", "\n").strip()
        digest = hashlib.sha256(target.encode()).hexdigest()
        require(digest == sample["target"]["content_sha256"] and digest not in hashes, f"target hash/duplicate mismatch for {sample_id}"); hashes.add(digest)
    for sample in accepted:
        quality = sample["metadata"]["quality"]
        require(all(quality[key] == "pass" for key in ("alignment", "granularity_match", "solvability")), f"quality failed for {sample['sample_id']}")
    for sample in rejected:
        require(sample["metadata"].get("status") == "rejected" and sample["metadata"].get("rejection_reasons"), f"missing rejection reason for {sample['sample_id']}")
    print(json.dumps({"repositories": len(manifests), "extractedUnits": len(accepted) + len(rejected), "acceptedSamples": len(accepted), "rejectedSamples": len(rejected), "exactDuplicateTargets": 0, "passed": True}))


if __name__ == "__main__":
    main()

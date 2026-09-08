from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict, deque
from pathlib import Path


CATEGORIES = ("card", "tactics", "tower-defense")
GRANULARITIES = ("G1", "G2")


def main() -> None:
    parser = argparse.ArgumentParser(description="Select a deterministic family-diverse stratified quality audit sample.")
    parser.add_argument("--input", default="data_pipeline/scale/accepted.jsonl")
    parser.add_argument("--output", default="data_pipeline/scale/quality-audit-sample.jsonl")
    parser.add_argument("--per-stratum", type=int, default=8)
    parser.add_argument("--seed", default="m8-freeze-audit-v1")
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists():
        frozen = read_jsonl(output)
        if len(frozen) != len(CATEGORIES) * len(GRANULARITIES) * args.per_stratum:
            raise ValueError(f"existing frozen audit has unexpected size: {len(frozen)}")
        print(json.dumps({"selected": len(frozen), "families": len({item['repository_family_id'] for item in frozen}), "status": "frozen_resume", "output": str(output)}))
        return
    records = read_jsonl(Path(args.input))
    selected = []
    for category in CATEGORIES:
        for granularity in GRANULARITIES:
            candidates = [
                record for record in records
                if record["metadata"]["category"] == category
                and record["metadata"]["granularity"] == granularity
            ]
            picked = family_round_robin(candidates, args.per_stratum, args.seed)
            if len(picked) != args.per_stratum:
                raise ValueError(f"insufficient samples for {category}/{granularity}: {len(picked)}")
            selected.extend(picked)

    output.write_text("".join(json.dumps({
        "audit_version": "1.0",
        "sample_id": record["sample_id"],
        "category": record["metadata"]["category"],
        "granularity": record["metadata"]["granularity"],
        "repository_family_id": record["metadata"]["repository_family_id"],
        "source_repo": record["metadata"]["source_repo"],
        "source_path": record["metadata"]["source_path"],
        "instruction": record["messages"][0]["content"],
        "code": record["messages"][1]["content"],
        "review": {
            "alignment": "pending",
            "granularity_match": "pending",
            "obvious_quality": "pending",
            "decision": "pending",
            "notes": "",
        },
    }, ensure_ascii=False, separators=(",", ":")) + "\n" for record in selected), encoding="utf-8")
    print(json.dumps({
        "selected": len(selected),
        "per_stratum": args.per_stratum,
        "families": len({record["metadata"]["repository_family_id"] for record in selected}),
        "output": str(output),
    }))


def family_round_robin(records: list[dict], count: int, seed: str) -> list[dict]:
    by_family: dict[str, deque[dict]] = defaultdict(deque)
    for record in sorted(records, key=lambda item: stable_key(seed, item["sample_id"])):
        by_family[record["metadata"]["repository_family_id"]].append(record)
    families = sorted(by_family, key=lambda family: stable_key(seed, family))
    selected = []
    while len(selected) < count and families:
        remaining = []
        for family in families:
            if by_family[family] and len(selected) < count:
                selected.append(by_family[family].popleft())
            if by_family[family]:
                remaining.append(family)
        families = remaining
    return selected


def stable_key(seed: str, value: str) -> str:
    return hashlib.sha256(f"{seed}:{value}".encode()).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


if __name__ == "__main__":
    main()

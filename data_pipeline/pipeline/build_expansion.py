from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build curated G1/G2 expansion candidates from fixed repository checkouts.")
    parser.add_argument("--checkout-root", required=True)
    parser.add_argument("--spec", default="data_pipeline/pipeline/expansion-units.json")
    parser.add_argument("--pilot", default="data_pipeline/samples/accepted.jsonl")
    parser.add_argument("--output", default="data_pipeline/samples/candidates-v2.jsonl")
    args = parser.parse_args()

    root = Path(args.checkout_root).resolve()
    manifests = {
        item["repository_id"]: item
        for item in read_jsonl(Path("data_pipeline/manifests/pilot-repositories.jsonl"))
    }
    specs = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    records = list(read_jsonl(Path(args.pilot)))
    seen_ids = {record["sample_id"] for record in records}

    for spec in specs:
        if spec["sample_id"] in seen_ids:
            raise ValueError(f"duplicate sample id: {spec['sample_id']}")
        manifest = manifests[spec["source_repo"]]
        source = (root / spec["checkout"] / spec["source_path"]).resolve()
        source.relative_to(root)
        lines = source.read_text(encoding="utf-8").splitlines()
        selected = lines[spec["start_line"] - 1 : spec["end_line"]]
        if len(selected) != spec["end_line"] - spec["start_line"] + 1:
            raise ValueError(f"line range outside file: {spec['sample_id']}")
        target = "\n".join(selected).strip() + "\n"
        digest = hashlib.sha256(target.strip().encode()).hexdigest()
        records.append({
            "schema_version": "0.2",
            "sample_id": spec["sample_id"],
            "messages": [
                {"role": "user", "content": spec["instruction"]},
                {"role": "assistant", "content": target},
            ],
            "instruction": spec["instruction"],
            "context": {"language": "TypeScript", "provided_symbols": spec["provided_symbols"]},
            "target": {"format": "code_unit", "content_sha256": digest},
            "metadata": {
                "source_repo": spec["source_repo"],
                "source_commit": manifest["commit_sha"],
                "source_path": spec["source_path"],
                "source_lines": f"{spec['start_line']}-{spec['end_line']}",
                "repository_family_id": manifest["duplicate"]["family_id"],
                "license": manifest["license"]["spdx_id"],
                "granularity": spec["granularity"],
                "mechanisms": spec["mechanisms"],
                "build_status": manifest["build"]["status"],
                "duplicate_status": "pending_v2_validation",
                "generation": {"method": "curated_code_to_instruction", "generator": "codex-work-session"},
                "quality": {"alignment": "pending", "granularity_match": "pending", "solvability": "pending"},
            },
        })
        seen_ids.add(spec["sample_id"])

    write_jsonl(Path(args.output), records)
    print(json.dumps({"pilot": len(records) - len(specs), "new": len(specs), "total": len(records), "output": args.output}))


def read_jsonl(path: Path):
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n" for record in records), encoding="utf-8")


if __name__ == "__main__":
    main()

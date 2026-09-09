from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from .common import DIFFICULTIES, ROOT, TASK_TYPES, read_jsonl, stable_choice, write_jsonl


def main() -> None:
    parser = argparse.ArgumentParser(description="Build genuinely different D1-D4 code targets from validated repository units.")
    parser.add_argument("--units", default="data_pipeline/v3/source-units.jsonl")
    parser.add_argument("--validations", default="data_pipeline/v3/source-validations.jsonl")
    parser.add_argument("--output", default="data_pipeline/v3/targets.jsonl")
    parser.add_argument("--target", type=int, default=3600)
    args = parser.parse_args()
    units = read_jsonl(ROOT / args.units)
    validations = {row["unit_id"]: row for row in read_jsonl(ROOT / args.validations)}
    valid = [unit for unit in units if source_valid(unit, validations.get(unit["unit_id"]))]
    targets = build_targets(valid, args.target)
    write_jsonl(ROOT / args.output, targets)
    print(json.dumps({
        "validated_source_units": len(valid), "targets": len(targets),
        "difficulty": counts(row["difficulty"] for row in targets),
        "task_type": counts(row["task_type"] for row in targets), "output": args.output,
    }, indent=2))


def source_valid(unit: dict, validation: dict | None) -> bool:
    return bool(validation and validation.get("target_sha256") == unit.get("target_sha256")
                and validation.get("syntax") == "pass" and validation.get("symbol") == "pass"
                and validation.get("behavior") != "fail")


def build_targets(units: list[dict], limit: int) -> list[dict]:
    by_file: dict[tuple[str, str], list[dict]] = defaultdict(list)
    by_repo: dict[str, list[dict]] = defaultdict(list)
    for unit in units:
        by_file[(unit["repository"], unit["source_path"])].append(unit)
        by_repo[unit["repository"]].append(unit)

    raw: list[tuple[str, list[dict]]] = [("D1", [unit]) for unit in units]
    for group in by_file.values():
        ordered = sorted(group, key=lambda row: (row["source_lines"], row["symbol"]))
        raw.extend(("D2", ordered[index:index + 2]) for index in range(max(0, len(ordered) - 1)))
    for group in by_repo.values():
        ordered = sorted(group, key=lambda row: (row["source_path"], row["source_lines"]))
        for index in range(max(0, len(ordered) - 2)):
            window = ordered[index:index + 3]
            if len({row["source_path"] for row in window}) >= 2:
                raw.append(("D3", window))
        for index in range(0, max(0, len(ordered) - 4), 2):
            window = ordered[index:index + 5]
            if len({row["source_path"] for row in window}) >= 3:
                raw.append(("D4", window))

    result, seen = [], set()
    for difficulty, group in raw:
        files = combine_files(group)
        if sum(len(file["content"]) for file in files) > 4500:
            continue
        digest = artifact_hash(files)
        key = (difficulty, digest)
        if key in seen:
            continue
        seen.add(key)
        first = group[0]
        target_id = f"v3-{difficulty.lower()}-{digest[:16]}"
        task_type = stable_choice(target_id, TASK_TYPES)
        if difficulty == "D4" and len(files) < 3:
            continue
        if difficulty == "D3" and len(files) < 2:
            continue
        if difficulty == "D2" and len(group) < 2:
            continue
        result.append({
            "schema_version": "3.0", "target_id": target_id,
            "repository": first["repository"], "repository_family_id": first["repository_family_id"],
            "commit": first["commit"], "license": first["license"], "category": first["category"],
            "difficulty": difficulty, "task_type": task_type,
            "source_units": [row["unit_id"] for row in group],
            "target_files": files, "target_symbols": [row["symbol"] for row in group],
            "provided_symbols": sorted({symbol for row in group for symbol in row.get("provided_symbols", [])}),
            "target_sha256": digest,
            "source_behavior_validation": [row["unit_id"] for row in group],
        })
    order = {value: index for index, value in enumerate(DIFFICULTIES)}
    result.sort(key=lambda row: (order[row["difficulty"]], row["target_id"]))
    quotas = {"D1": int(limit * 0.35), "D2": int(limit * 0.30), "D3": int(limit * 0.25)}
    quotas["D4"] = limit - sum(quotas.values())
    selected: list[dict] = []
    for difficulty in DIFFICULTIES:
        selected.extend([row for row in result if row["difficulty"] == difficulty][:quotas[difficulty]])
    selected_ids = {row["target_id"] for row in selected}
    for row in result:
        if len(selected) >= limit:
            break
        if row["target_id"] not in selected_ids:
            selected.append(row); selected_ids.add(row["target_id"])
    return selected


def combine_files(group: list[dict]) -> list[dict[str, str]]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for unit in group:
        grouped[unit["source_path"]].append(unit["target"].strip())
    return [{"path": path, "content": "\n\n".join(parts) + "\n"} for path, parts in sorted(grouped.items())]


def artifact_hash(files: list[dict[str, str]]) -> str:
    canonical = json.dumps(files, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def counts(values) -> dict[str, int]:
    result: dict[str, int] = {}
    for value in values:
        result[value] = result.get(value, 0) + 1
    return dict(sorted(result.items()))


if __name__ == "__main__":
    main()

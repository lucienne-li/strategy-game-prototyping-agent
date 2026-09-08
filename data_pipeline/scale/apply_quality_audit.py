from __future__ import annotations

import argparse
import json
from pathlib import Path


ALIGNMENT_FAILURES = {10, 18, 27, 33, 40, 42}
GRANULARITY_FAILURES = {1, 2, 5, 7, 14, 22, 24, 38, 39, 47, 48}
TRUNCATED_FAILURES = {4, 9, 11, 12, 13, 15, 17, 20, 25, 28, 29, 32, 35, 41, 43, 44, 45}


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply the recorded manual M8 stratified audit decisions.")
    parser.add_argument("--input", default="data_pipeline/scale/quality-audit-sample.jsonl")
    parser.add_argument("--output", default="data_pipeline/scale/quality-audit-reviewed.jsonl")
    args = parser.parse_args()
    rows = read_jsonl(Path(args.input))
    if len(rows) != 48:
        raise ValueError(f"expected frozen 48-sample audit, got {len(rows)}")
    reviewed = []
    for index, row in enumerate(rows, start=1):
        if index in ALIGNMENT_FAILURES:
            review = result("ALIGNMENT", "Instruction requests behavior or API not implemented by the target code.")
        elif index in GRANULARITY_FAILURES:
            review = result("GRANULARITY_OR_SOLVABILITY", "Instruction is too vague or omits rules required to reproduce this target.")
        elif index in TRUNCATED_FAILURES:
            review = result("TRUNCATED", "Instruction ends mid-sentence or mid-list and is not a complete task.")
        else:
            review = {
                "alignment": "pass",
                "granularity_match": "pass",
                "obvious_quality": "pass",
                "decision": "accept",
                "primary_issue": "NONE",
                "notes": "No obvious alignment, granularity or completeness defect found in manual review.",
            }
        reviewed.append({**row, "review": review})
    write_jsonl(Path(args.output), reviewed)
    print(json.dumps({
        "reviewed": len(reviewed),
        "accepted": sum(row["review"]["decision"] == "accept" for row in reviewed),
        "rejected": sum(row["review"]["decision"] == "reject" for row in reviewed),
    }))


def result(issue: str, notes: str) -> dict:
    return {
        "alignment": "fail" if issue == "ALIGNMENT" else "not_assessable" if issue == "TRUNCATED" else "pass",
        "granularity_match": "fail" if issue == "GRANULARITY_OR_SOLVABILITY" else "not_assessable" if issue == "TRUNCATED" else "pass",
        "obvious_quality": "fail",
        "decision": "reject",
        "primary_issue": issue,
        "notes": notes,
    }


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")


if __name__ == "__main__":
    main()

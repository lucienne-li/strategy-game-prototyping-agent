from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from quality_checks import deterministic_reasons


def main() -> None:
    parser = argparse.ArgumentParser(description="Finalize the quality-v2 dataset; missing or failed evidence rejects closed.")
    parser.add_argument("--units", default="data_pipeline/scale/units.jsonl")
    parser.add_argument("--instructions", default="data_pipeline/scale/instructions-v2.jsonl")
    parser.add_argument("--reviews", default="data_pipeline/scale/reviews-v2.jsonl")
    parser.add_argument("--target-validation", default="data_pipeline/scale/target-validation-v2.jsonl")
    parser.add_argument("--accepted", default="data_pipeline/scale/accepted.jsonl")
    parser.add_argument("--rejected", default="data_pipeline/scale/rejected.jsonl")
    parser.add_argument("--max-per-family", type=int, default=36)
    parser.add_argument("--target-near-threshold", type=float, default=0.88)
    parser.add_argument("--instruction-near-threshold", type=float, default=0.92)
    args = parser.parse_args()
    units = read_jsonl(Path(args.units))
    instructions = {item["unit_id"]: item for item in read_jsonl(Path(args.instructions))}
    reviews = {item["unit_id"]: item for item in read_jsonl(Path(args.reviews))}
    validations = {item["unit_id"]: item for item in read_jsonl(Path(args.target_validation))}
    accepted, rejected = [], []
    family_counts: Counter[str] = Counter()
    accepted_targets: list[tuple[str, set[str]]] = []
    accepted_instructions: list[tuple[str, set[str]]] = []

    for unit in units:
        record = instructions.get(unit["unit_id"])
        review = reviews.get(unit["unit_id"])
        validation = validations.get(unit["unit_id"])
        reasons = ["GENERATION_FAILED"] if record is None else deterministic_reasons(record, validation)
        if review is None:
            reasons.append("STRONG_REVIEW_MISSING")
        elif review.get("target_sha256") != unit["target_sha256"] or review.get("review_version") != "strong-review-v2":
            reasons.append("STRONG_REVIEW_INVALID")
        elif review.get("decision") != "pass":
            if review.get("deterministic_reasons"):
                reasons.extend(review["deterministic_reasons"])
            else:
                reasons.append(f"STRONG_REVIEW_{str(review.get('failed_check', 'other')).upper()}")
        elif review.get("reviewer") == "deterministic-quality-v2":
            reasons.append("STRONG_REVIEW_MISSING")

        instruction = record.get("instruction", "") if record else ""
        target_tokens = tokens(normalize_code(unit["target"]))
        instruction_tokens = tokens(instruction)
        target_neighbor, target_score = nearest(target_tokens, accepted_targets)
        instruction_neighbor, instruction_score = nearest(instruction_tokens, accepted_instructions)
        if target_score >= args.target_near_threshold:
            reasons.append("TARGET_NEAR_DUPLICATE")
        if instruction and instruction_score >= args.instruction_near_threshold:
            reasons.append("INSTRUCTION_NEAR_DUPLICATE")
        if family_counts[unit["repository_family_id"]] >= args.max_per_family:
            reasons.append("FAMILY_SAMPLE_CAP")

        metadata = {
            "source_repo": unit["repository"], "source_commit": unit["commit"], "source_path": unit["source_path"],
            "source_lines": unit["source_lines"], "repository_family_id": unit["repository_family_id"],
            "license": unit["license"], "category": unit["category"], "granularity": unit["granularity"],
            "symbol": unit["symbol"], "target_sha256": unit["target_sha256"],
            "generation": record.get("generation") if record else None,
            "scope": record.get("scope") if record else None,
            "target_validation": validation,
            "strong_review": review,
            "quality": {
                "pipeline_version": "quality-v2", "behavior_consistency": "pass" if not reasons else "fail",
                "granularity_match": "pass" if not reasons else "fail", "missing_context": "pass" if not reasons else "fail",
                "target_nearest": target_neighbor, "target_jaccard": round(target_score, 4),
                "instruction_nearest": instruction_neighbor, "instruction_jaccard": round(instruction_score, 4),
            },
        }
        sample = {
            "schema_version": "2.0", "sample_id": unit["unit_id"],
            "messages": [{"role": "user", "content": instruction}, {"role": "assistant", "content": unit["target"]}],
            "context": {"language": "TypeScript", "provided_symbols": unit["provided_symbols"]}, "metadata": metadata,
        }
        reasons = sorted(set(reasons))
        if reasons:
            metadata["status"] = "rejected"
            metadata["rejection_reasons"] = reasons
            rejected.append(sample)
        else:
            metadata["status"] = "accepted"
            accepted.append(sample)
            family_counts[unit["repository_family_id"]] += 1
            accepted_targets.append((unit["unit_id"], target_tokens))
            accepted_instructions.append((unit["unit_id"], instruction_tokens))

    write_jsonl(Path(args.accepted), accepted)
    write_jsonl(Path(args.rejected), rejected)
    summary = {
        "code_units": len(units), "accepted": len(accepted), "rejected": len(rejected), "families": len(family_counts),
        "rejection_reasons": dict(sorted(Counter(reason for item in rejected for reason in item["metadata"]["rejection_reasons"]).items())),
    }
    print(json.dumps(summary, indent=2))


def nearest(current: set[str], previous: list[tuple[str, set[str]]]) -> tuple[str | None, float]:
    best_id, best_score = None, 0.0
    for sample_id, other in previous:
        union = current | other
        score = len(current & other) / len(union) if union else 1.0
        if score > best_score:
            best_id, best_score = sample_id, score
    return best_id, best_score


def normalize_code(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"//.*|/\*[\s\S]*?\*/", "", value)).strip()


def tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z_$][a-z0-9_$]*|\d+", value.lower()))


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")
    temporary.replace(path)


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply independent review and duplicate gates to v2 candidates.")
    parser.add_argument("--candidates", default="data_pipeline/samples/candidates-v2.jsonl")
    parser.add_argument("--reviews", default="data_pipeline/reviews/independent-v2.jsonl")
    parser.add_argument("--accepted", default="data_pipeline/samples/accepted-v2.jsonl")
    parser.add_argument("--rejected", default="data_pipeline/samples/rejected-v2.jsonl")
    parser.add_argument("--near-duplicate-threshold", type=float, default=0.8)
    args = parser.parse_args()

    candidates = read_jsonl(Path(args.candidates))
    reviews = {item["sample_id"]: item for item in read_jsonl(Path(args.reviews))}
    accepted: list[dict] = []
    rejected: list[dict] = []
    hashes: set[str] = set()
    token_sets: list[tuple[str, set[str]]] = []

    for original in candidates:
        record = copy.deepcopy(original)
        review = reviews.get(record["sample_id"])
        reasons = []
        if review is None or not review.get("parse_valid"):
            reasons.append("INDEPENDENT_REVIEW_INVALID")
        elif review.get("target_sha256") != record["target"]["content_sha256"]:
            reasons.append("INDEPENDENT_REVIEW_TARGET_MISMATCH")
        elif any(review.get(key) != "pass" for key in ("alignment", "granularity_match", "solvability")):
            reasons.append("INDEPENDENT_REVIEW_FAILED")

        target = record["messages"][1]["content"].strip()
        digest = hashlib.sha256(target.encode()).hexdigest()
        if digest in hashes:
            reasons.append("EXACT_DUPLICATE_TARGET")
        tokens = set(re.findall(r"[A-Za-z_$][A-Za-z0-9_$]*|\d+", target.lower()))
        nearest_id, nearest_score = nearest(tokens, token_sets)
        if nearest_score >= args.near_duplicate_threshold:
            reasons.append("NEAR_DUPLICATE_TARGET")

        record["schema_version"] = "0.2"
        metadata = record["metadata"]
        metadata["repository_family_id"] = metadata.get("repository_family_id", f"github:{metadata['source_repo']}")
        metadata["duplicate_status"] = "unique_v2" if not any("DUPLICATE" in reason for reason in reasons) else "rejected"
        metadata["nearest_target"] = {"sample_id": nearest_id, "token_jaccard": round(nearest_score, 4)}
        metadata["independent_review"] = {
            "reviewer": review.get("reviewer") if review else None,
            "review_type": review.get("review_type") if review else None,
            "parse_mode": review.get("parse_mode") if review else None,
            "alignment": review.get("alignment") if review else None,
            "granularity_match": review.get("granularity_match") if review else None,
            "solvability": review.get("solvability") if review else None,
        }
        if reasons:
            metadata["status"] = "rejected"
            metadata["rejection_reasons"] = reasons
            rejected.append(record)
        else:
            metadata["quality"] = {
                "alignment": "pass",
                "granularity_match": "pass",
                "solvability": "pass",
                "review_method": "separate_local_model_static_review",
            }
            accepted.append(record)
            hashes.add(digest)
            token_sets.append((record["sample_id"], tokens))

    write_jsonl(Path(args.accepted), accepted)
    write_jsonl(Path(args.rejected), rejected)
    print(json.dumps({
        "candidates": len(candidates),
        "accepted": len(accepted),
        "rejected": len(rejected),
        "families": len({item["metadata"]["repository_family_id"] for item in accepted}),
        "near_duplicate_threshold": args.near_duplicate_threshold,
    }))


def nearest(tokens: set[str], prior: list[tuple[str, set[str]]]) -> tuple[str | None, float]:
    nearest_id = None
    best = 0.0
    for sample_id, other in prior:
        union = tokens | other
        score = len(tokens & other) / len(union) if union else 1.0
        if score > best:
            nearest_id, best = sample_id, score
    return nearest_id, best


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n" for record in records), encoding="utf-8")


if __name__ == "__main__":
    main()

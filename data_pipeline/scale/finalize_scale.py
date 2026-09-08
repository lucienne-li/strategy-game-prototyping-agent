from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path


FORBIDDEN = ("source code", "provided code", "repository", "above implementation", "given implementation")
UNDERSPECIFIED_PATTERN = re.compile(
    r"following (?:the )?(?:provided )?guidelines|"
    r"(?:provided|specified) (?:signature|rules|instructions)|"
    r"adheres? to (?:the )?(?:provided|specified)|"
    r"g[12] code unit guidelines",
    re.IGNORECASE,
)
def main() -> None:
    parser = argparse.ArgumentParser(description="Apply deterministic scale-up quality, family and duplicate gates.")
    parser.add_argument("--input", default="data_pipeline/scale/instructions.jsonl")
    parser.add_argument("--reviews", default="data_pipeline/scale/reviews.jsonl")
    parser.add_argument("--audit", default="data_pipeline/scale/quality-audit-reviewed.jsonl")
    parser.add_argument("--accepted", default="data_pipeline/scale/accepted.jsonl")
    parser.add_argument("--rejected", default="data_pipeline/scale/rejected.jsonl")
    parser.add_argument("--max-per-family", type=int, default=36)
    parser.add_argument("--target-near-threshold", type=float, default=0.88)
    parser.add_argument("--instruction-near-threshold", type=float, default=0.92)
    args = parser.parse_args()
    records = read_jsonl(Path(args.input))
    reviews = {item["unit_id"]: item for item in read_jsonl(Path(args.reviews))}
    audit_path = Path(args.audit)
    audits = {item["sample_id"]: item for item in read_jsonl(audit_path)} if audit_path.exists() else {}
    accepted: list[dict] = []
    rejected: list[dict] = []
    family_counts: Counter[str] = Counter()
    targets: list[tuple[str, set[str]]] = []
    instructions: list[tuple[str, set[str]]] = []

    for record in records:
        reasons = validate(record)
        review = reviews.get(record["unit_id"])
        if review is None or not review.get("parse_valid") or review.get("target_sha256") != record["target_sha256"]:
            reasons.append("INDEPENDENT_REVIEW_INVALID")
        elif review.get("label") != "PASS":
            reasons.append(f"INDEPENDENT_{review['label']}")
        audit = audits.get(record["unit_id"])
        if audit and audit.get("review", {}).get("decision") != "accept":
            reasons.append(f"STRATIFIED_AUDIT_{audit['review']['primary_issue']}")
        family = record["repository_family_id"]
        target_tokens = tokens(normalize_code(record["target"]))
        instruction_tokens = tokens(record.get("instruction") or "")
        target_neighbor, target_score = nearest(target_tokens, targets)
        instruction_neighbor, instruction_score = nearest(instruction_tokens, instructions)
        if target_score >= args.target_near_threshold:
            reasons.append("TARGET_NEAR_DUPLICATE")
        if instruction_score >= args.instruction_near_threshold:
            reasons.append("INSTRUCTION_NEAR_DUPLICATE")
        if family_counts[family] >= args.max_per_family:
            reasons.append("FAMILY_SAMPLE_CAP")

        metadata = {
            "source_repo": record["repository"],
            "source_commit": record["commit"],
            "source_path": record["source_path"],
            "source_lines": record["source_lines"],
            "repository_family_id": family,
            "license": record["license"],
            "category": record["category"],
            "granularity": record["granularity"],
            "symbol": record["symbol"],
            "target_sha256": record["target_sha256"],
            "generation": record["generation"],
            "independent_review": review,
            "stratified_audit": audit,
            "quality": {
                "method": "deterministic_contract_and_similarity_gates",
                "alignment": "pass" if review and review.get("label") == "PASS" else "fail",
                "granularity_match": "pass" if review and review.get("label") == "PASS" else "fail",
                "solvability": "pass" if review and review.get("label") == "PASS" else "fail",
                "target_nearest": target_neighbor,
                "target_jaccard": round(target_score, 4),
                "instruction_nearest": instruction_neighbor,
                "instruction_jaccard": round(instruction_score, 4),
            },
        }
        sample = {
            "schema_version": "1.0",
            "sample_id": record["unit_id"],
            "messages": [
                {"role": "user", "content": record.get("instruction")},
                {"role": "assistant", "content": record["target"]},
            ],
            "context": {"language": "TypeScript", "provided_symbols": record["provided_symbols"]},
            "metadata": metadata,
        }
        if reasons:
            metadata["status"] = "rejected"
            metadata["rejection_reasons"] = sorted(set(reasons))
            rejected.append(sample)
        else:
            metadata["status"] = "accepted"
            accepted.append(sample)
            family_counts[family] += 1
            targets.append((record["unit_id"], target_tokens))
            instructions.append((record["unit_id"], instruction_tokens))

    write_jsonl(Path(args.accepted), accepted)
    write_jsonl(Path(args.rejected), rejected)
    print(json.dumps({
        "candidates": len(records),
        "accepted": len(accepted),
        "rejected": len(rejected),
        "families": len(family_counts),
        "by_family": family_counts,
        "rejection_reasons": Counter(reason for item in rejected for reason in item["metadata"]["rejection_reasons"]),
    }, default=dict, indent=2))


def validate(record: dict) -> list[str]:
    reasons = []
    instruction = record.get("instruction")
    if not record.get("generation", {}).get("parse_valid") or not isinstance(instruction, str):
        return ["INSTRUCTION_PARSE_INVALID"]
    word_count = len(re.findall(r"\b[\w'-]+\b", instruction))
    if word_count < 10 or word_count > 110:
        reasons.append("INSTRUCTION_LENGTH")
    if record["symbol"].lower() not in instruction.lower():
        reasons.append("SYMBOL_NOT_NAMED")
    if any(phrase in instruction.lower() for phrase in FORBIDDEN):
        reasons.append("SOURCE_LEAKAGE_LANGUAGE")
    if UNDERSPECIFIED_PATTERN.search(instruction):
        reasons.append("UNDERSPECIFIED_REFERENCE")
    if instruction.rstrip()[-1] not in ".!?`)]":
        reasons.append("INSTRUCTION_TRUNCATED")
    code_hash = hashlib.sha256(record["target"].strip().encode()).hexdigest()
    if code_hash != record["target_sha256"]:
        reasons.append("TARGET_HASH_MISMATCH")
    if record["granularity"] not in {"G1", "G2"}:
        reasons.append("GRANULARITY_INVALID")
    if record["kind"] == "function" and not re.search(r"\bfunction\b|=>", record["target"]):
        reasons.append("TARGET_STRUCTURE_INVALID")
    if record["kind"] == "class" and not re.search(rf"\bclass\s+{re.escape(record['symbol'])}\b", record["target"]):
        reasons.append("TARGET_STRUCTURE_INVALID")
    return reasons


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
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n" for record in records), encoding="utf-8")


if __name__ == "__main__":
    main()

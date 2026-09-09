from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

from data_pipeline.scale.openai_json import request_json
from .common import DIFFICULTIES, ROOT, TASK_TYPES, read_jsonl, sha256_bytes, write_json, write_jsonl


REVIEW_VERSION = "strong-review-v3"
REVIEW_SCHEMA = {"type": "object", "properties": {
    "decision": {"type": "string", "enum": ["pass", "fail"]}, "reason": {"type": "string"},
    "failed_check": {"type": "string", "enum": ["none", "behavior_consistency", "granularity_match", "missing_context", "task_type", "seed_quality", "other"]}},
    "required": ["decision", "reason", "failed_check"], "additionalProperties": False}


def main() -> None:
    parser = argparse.ArgumentParser(description="Fail-closed v3 deterministic and strong-review finalizer.")
    parser.add_argument("--input", default="data_pipeline/v3/generated.jsonl")
    parser.add_argument("--reviews", default="data_pipeline/v3/reviews.jsonl")
    parser.add_argument("--review-failures", default="data_pipeline/v3/review-failures.jsonl")
    parser.add_argument("--accepted", default="data_pipeline/v3/accepted.jsonl")
    parser.add_argument("--rejected", default="data_pipeline/v3/rejected.jsonl")
    parser.add_argument("--summary", default="data_pipeline/v3/summary.json")
    parser.add_argument("--manifest", default="data_pipeline/v3/candidate-manifest.json")
    parser.add_argument("--model", default=os.environ.get("DATA_REVIEWER_MODEL", "gpt-5.6"))
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    rows = read_jsonl(ROOT / args.input)
    review_path, failure_path = ROOT / args.reviews, ROOT / args.review_failures
    reviews = {row["target_id"]: row for row in read_jsonl(review_path) if row.get("review_version") == REVIEW_VERSION and not row.get("request_failed")}
    failures = {row["target_id"]: row for row in read_jsonl(failure_path)}
    deterministic = {row["target_id"]: deterministic_reasons(row) for row in rows}
    pending = [row for row in rows if not deterministic[row["target_id"]] and row["target_id"] not in reviews]
    if pending and not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError(f"OPENAI_API_KEY is required to review {len(pending)} deterministic-pass samples")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(review_one, row, args.model): row for row in pending}
        for index, future in enumerate(as_completed(futures), start=1):
            row = futures[future]
            try:
                reviews[row["target_id"]] = future.result()
                failures.pop(row["target_id"], None)
            except Exception as error:
                failures[row["target_id"]] = {"target_id": row["target_id"], "reason": "REVIEW_REQUEST_FAILED", "error": str(error)[:2000]}
            write_jsonl(review_path, (reviews[key] for key in sorted(reviews)))
            write_jsonl(failure_path, (failures[key] for key in sorted(failures)))
            print(f"[{index}/{len(pending)}] reviewed={len(reviews)} request_failures={len(failures)}", flush=True)
    if failures:
        raise RuntimeError(f"{len(failures)} review requests remain unresolved; rerun the same command to resume")
    accepted, rejected, target_seen, instruction_seen = [], [], [], []
    family_counts: Counter[str] = Counter()
    for row in rows:
        reasons = list(deterministic[row["target_id"]])
        review = reviews.get(row["target_id"])
        if not reasons:
            if not review:
                reasons.append("STRONG_REVIEW_MISSING")
            elif review.get("target_sha256") != row.get("target_sha256"):
                reasons.append("STRONG_REVIEW_STALE")
            elif review["decision"] != "pass":
                reasons.append(f"STRONG_REVIEW_{review['failed_check'].upper()}")
        target_tokens = tokens(json.dumps(row["target_files"], sort_keys=True))
        instruction_tokens = tokens(row["instruction"])
        if nearest(target_tokens, target_seen) >= 0.90:
            reasons.append("TARGET_NEAR_DUPLICATE")
        if nearest(instruction_tokens, instruction_seen) >= 0.92:
            reasons.append("INSTRUCTION_NEAR_DUPLICATE")
        artifact = json.dumps({"files": row["target_files"]}, ensure_ascii=False, separators=(",", ":"))
        user = render_user(row)
        quality = {"pipeline_version": "data-v3-quality-v2", "behavior_consistency": "pass" if not reasons else "fail",
                   "granularity_match": "pass" if not reasons else "fail", "missing_context": "pass" if not reasons else "fail",
                   "task_type_match": "pass" if not reasons else "fail", "strong_review": review}
        sample = {"schema_version": "3.0", "sample_id": row["target_id"],
                  "messages": [{"role": "user", "content": user}, {"role": "assistant", "content": artifact}],
                  "metadata": {key: row[key] for key in ("repository", "repository_family_id", "commit", "license", "category", "difficulty", "task_type", "target_symbols", "target_sha256")},
                  "quality": quality}
        sample["metadata"]["target_files"] = [item["path"] for item in row["target_files"]]
        sample["metadata"]["source_units"] = row["source_units"]
        sample["metadata"]["generation"] = row["generation"]
        reasons = sorted(set(reasons))
        if reasons:
            sample["quality"]["rejection_reasons"] = reasons
            rejected.append(sample)
        else:
            accepted.append(sample); target_seen.append(target_tokens); instruction_seen.append(instruction_tokens)
            family_counts[row["repository_family_id"]] += 1
    write_jsonl(ROOT / args.accepted, accepted); write_jsonl(ROOT / args.rejected, rejected)
    summary = {"repositories": len({row["repository"] for row in rows}),
               "accepted_repositories": len({sample["metadata"]["repository"] for sample in accepted}),
               "families": len({row["repository_family_id"] for row in rows}),
               "accepted_families": len(family_counts),
               "code_units": len({unit for row in rows for unit in row["source_units"]}),
               "generated": len(rows), "accepted": len(accepted), "rejected": len(rejected),
               "difficulty": counts(sample["metadata"]["difficulty"] for sample in accepted),
               "task_type": counts(sample["metadata"]["task_type"] for sample in accepted),
               "category": counts(sample["metadata"]["category"] for sample in accepted),
               "reject_reasons": dict(sorted(Counter(reason for sample in rejected for reason in sample["quality"]["rejection_reasons"]).items())),
               "request_failures": 0}
    write_json(ROOT / args.summary, summary)
    accepted_bytes = (ROOT / args.accepted).read_bytes()
    write_json(ROOT / args.manifest, {"status": "candidate-not-frozen", "pipeline": "data-v3-quality-v2", "accepted_path": args.accepted,
                                     "accepted_sha256": sha256_bytes(accepted_bytes), **summary})
    print(json.dumps(summary, indent=2))


def deterministic_reasons(row: dict) -> list[str]:
    reasons = []
    instruction = row.get("instruction", "")
    words = re.findall(r"\b[\w'-]+\b", instruction)
    if not 45 <= len(words) <= 180 or not instruction.rstrip().endswith((".", "!", "?")):
        reasons.append("INSTRUCTION_LENGTH_OR_INCOMPLETE")
    if row.get("difficulty") not in DIFFICULTIES or row.get("task_type") not in TASK_TYPES:
        reasons.append("LABEL_INVALID")
    files, seeds = row.get("target_files", []), row.get("seed_files", [])
    paths = {item.get("path") for item in files if isinstance(item, dict)}
    if not paths or not all(path and path in instruction for path in paths):
        reasons.append("TARGET_FILE_SCOPE_MISMATCH")
    if not all(str(symbol).lower() in instruction.lower() for symbol in row.get("target_symbols", [])):
        reasons.append("TARGET_SYMBOL_SCOPE_MISMATCH")
    required_files = {"D1": 1, "D2": 1, "D3": 2, "D4": 3}.get(row.get("difficulty"), 99)
    if len(paths) < required_files or (row.get("difficulty") == "D1" and len(row.get("target_symbols", [])) != 1):
        reasons.append("GRANULARITY_MISMATCH")
    if row.get("difficulty") == "D2" and len(row.get("target_symbols", [])) < 2:
        reasons.append("GRANULARITY_MISMATCH")
    if row.get("task_type") == "generation" and seeds:
        reasons.append("UNEXPECTED_SEED")
    if row.get("task_type") != "generation":
        seed_paths = {item.get("path") for item in seeds if isinstance(item, dict)}
        seed_contents_valid = all(isinstance(item, dict) and isinstance(item.get("content"), str) and item["content"].strip() for item in seeds)
        if seed_paths != paths or len(seed_paths) != len(seeds) or not seed_contents_valid or json.dumps(seeds, sort_keys=True) == json.dumps(files, sort_keys=True):
            reasons.append("SEED_INVALID")
    if not row.get("expected_behavior") or not row.get("constraints"):
        reasons.append("SCOPE_MISSING")
    elif coverage(row["expected_behavior"], instruction) < 0.35:
        reasons.append("EXPECTED_BEHAVIOR_NOT_IN_INSTRUCTION")
    elif coverage(row["constraints"], instruction) < 0.20:
        reasons.append("CONSTRAINTS_NOT_IN_INSTRUCTION")
    required_context = row.get("required_context")
    if not isinstance(required_context, list) or not set(required_context).issubset(set(row.get("provided_symbols", []))):
        reasons.append("MISSING_CONTEXT")
    forbidden = ("provided code", "source code", "hidden source", "repository")
    if any(term in instruction.lower() for term in forbidden):
        reasons.append("SOURCE_LEAKAGE_LANGUAGE")
    return sorted(set(reasons))


def review_one(row: dict, model: str) -> dict:
    value, metadata = request_json(model=model, prompt=review_prompt(row), schema_name="strategy_game_sft_v3_review",
                                   schema=REVIEW_SCHEMA, max_output_tokens=384)
    return {"target_id": row["target_id"], "target_sha256": row["target_sha256"], "review_version": REVIEW_VERSION,
            "reviewer": model, **value, "response": metadata}


def review_prompt(row: dict) -> str:
    return """Fail closed when reviewing this SFT pair. Pass only if: the instruction exactly matches behavior in the target; its D1-D4 scope reflects actual file/system complexity; all needed context is present; the task type is genuine rather than paraphrase; and non-generation seed files contain a meaningful defect/gap that the target resolves.\n\n""" + json.dumps(row, ensure_ascii=False)


def render_user(row: dict) -> str:
    if not row["seed_files"]:
        return row["instruction"]
    seeds = "\n\n".join(f"Existing `{item['path']}`:\n```typescript\n{item['content']}\n```" for item in row["seed_files"])
    return f"{row['instruction']}\n\n{seeds}"


def tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z_$][a-z0-9_$]*|\d+", value.lower()))


def coverage(parts: list[str], instruction: str) -> float:
    expected = tokens(" ".join(parts)); actual = tokens(instruction)
    return len(expected & actual) / len(expected) if expected else 0.0


def nearest(current: set[str], previous: list[set[str]]) -> float:
    return max((len(current & other) / len(current | other) if current | other else 1.0 for other in previous), default=0.0)


def counts(values) -> dict[str, int]:
    return dict(sorted(Counter(values).items()))


if __name__ == "__main__":
    main()

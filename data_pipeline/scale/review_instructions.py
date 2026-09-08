from __future__ import annotations

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openai_json import request_json
from quality_checks import deterministic_reasons


REVIEW_VERSION = "strong-review-v2"
SCHEMA = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["pass", "fail"]},
        "reason": {"type": "string"},
        "failed_check": {"type": "string", "enum": ["none", "behavior_consistency", "granularity_match", "missing_context", "other"]},
    },
    "required": ["decision", "reason", "failed_check"],
    "additionalProperties": False,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply deterministic gates, then a resumable strong-model final review.")
    parser.add_argument("--input", default="data_pipeline/scale/instructions-v2.jsonl")
    parser.add_argument("--target-validation", default="data_pipeline/scale/target-validation-v2.jsonl")
    parser.add_argument("--output", default="data_pipeline/scale/reviews-v2.jsonl")
    parser.add_argument("--model", default=os.environ.get("DATA_REVIEWER_MODEL", "gpt-5.6"))
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    records = read_jsonl(Path(args.input))
    validations = {item["unit_id"]: item for item in read_jsonl(Path(args.target_validation))}
    output = Path(args.output)
    completed = {
        item["unit_id"]: item for item in read_jsonl(output)
        if item.get("review_version") == REVIEW_VERSION and item.get("reviewer") in {args.model, "deterministic-quality-v2"}
        and not str(item.get("reason", "")).startswith("REVIEW_REQUEST_FAILED")
    }
    pending_model: list[dict] = []
    for record in records:
        if record["unit_id"] in completed:
            continue
        reasons = deterministic_reasons(record, validations.get(record["unit_id"]))
        if reasons:
            completed[record["unit_id"]] = review_record(record, "deterministic-quality-v2", "fail", reasons[0], reasons[0], reasons)
        else:
            pending_model.append(record)
    write_ordered(output, records, completed)
    if pending_model and not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError(f"OPENAI_API_KEY is required to review {len(pending_model)} deterministic-pass candidates")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(review_one, item, args.model): item for item in pending_model}
        for index, future in enumerate(as_completed(futures), start=1):
            item = futures[future]
            try:
                completed[item["unit_id"]] = future.result()
            except Exception as error:
                completed[item["unit_id"]] = review_record(item, args.model, "fail", "other", f"REVIEW_REQUEST_FAILED: {error}", [])
            write_ordered(output, records, completed)
            print(f"[{index}/{len(pending_model)}] reviewed={len(completed)}", flush=True)
    request_failures = [item for item in completed.values() if str(item.get("reason", "")).startswith("REVIEW_REQUEST_FAILED")]
    if request_failures:
        raise RuntimeError(f"{len(request_failures)} review requests failed; rerun to resume instead of finalizing them as data rejects")


def review_one(item: dict, model: str) -> dict:
    value, metadata = request_json(
        model=model,
        prompt=prompt(item),
        schema_name="instruction_code_review",
        schema=SCHEMA,
        max_output_tokens=256,
    )
    return {
        **review_record(item, model, value["decision"], value["failed_check"], value["reason"], []),
        "response": metadata,
    }


def review_record(item: dict, reviewer: str, decision: str, failed_check: str, reason: str, deterministic: list[str]) -> dict:
    return {
        "unit_id": item["unit_id"],
        "target_sha256": item["target_sha256"],
        "review_version": REVIEW_VERSION,
        "reviewer": reviewer,
        "decision": decision,
        "failed_check": failed_check,
        "reason": reason[:1000],
        "deterministic_reasons": deterministic,
    }


def prompt(item: dict) -> str:
    return f"""Act as the final independent quality gate for one TypeScript SFT pair. Fail closed.

Return pass only when all three conditions hold:
1. behavior_consistency: every requested behavior is implemented by the target, with no contradiction or invented behavior;
2. granularity_match: the task is exactly one {item['granularity']} unit and its requested scope matches the supplied target;
3. missing_context: the task is solvable using the instruction, signature and declared context; no undeclared API or rule is required.

Scope contract:
{json.dumps(item['scope'], ensure_ascii=False, indent=2)}

Signature: {item['signature']}
Instruction:
{item['instruction']}

Target:
```typescript
{item['target']}
```"""


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_ordered(path: Path, records: list[dict], completed: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [completed[item["unit_id"]] for item in records if item["unit_id"] in completed]
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")
    temporary.replace(path)


if __name__ == "__main__":
    main()

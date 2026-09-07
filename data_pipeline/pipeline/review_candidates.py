from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


DEFAULT_REVIEWER = "Qwen/Qwen2.5-Coder-0.5B-Instruct"
ALLOWED = {"pass", "fail"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a separate local-model review pass over SFT candidates.")
    parser.add_argument("--input", default="data_pipeline/samples/candidates-v2.jsonl")
    parser.add_argument("--output", default="data_pipeline/reviews/independent-v2.jsonl")
    parser.add_argument("--model", default=DEFAULT_REVIEWER)
    parser.add_argument("--max-new-tokens", type=int, default=72)
    args = parser.parse_args()

    records = read_jsonl(Path(args.input))
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.float32)
    model.eval()
    model.generation_config.temperature = None
    model.generation_config.top_p = None
    model.generation_config.top_k = None
    reviews = []

    for index, record in enumerate(records, start=1):
        prompt = build_prompt(record)
        chat = tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True
        )
        inputs = tokenizer(chat, return_tensors="pt", truncation=True, max_length=1536)
        started = time.perf_counter()
        with torch.inference_mode():
            output = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        raw = tokenizer.decode(output[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True).strip()
        parsed = parse_review(raw)
        reviews.append({
            "sample_id": record["sample_id"],
            "target_sha256": record["target"]["content_sha256"],
            "reviewer": args.model,
            "review_type": "independent_local_model_static_review",
            "alignment": parsed.get("alignment", "invalid"),
            "granularity_match": parsed.get("granularity_match", "invalid"),
            "solvability": parsed.get("solvability", "invalid"),
            "reason": parsed.get("reason", ""),
            "parse_valid": all(parsed.get(key) in ALLOWED for key in ("alignment", "granularity_match", "solvability")),
            "parse_mode": parsed.get("parse_mode", "invalid"),
            "raw_output": raw,
            "duration_seconds": round(time.perf_counter() - started, 3),
        })
        print(f"[{index}/{len(records)}] {record['sample_id']}: {reviews[-1]['alignment']}/{reviews[-1]['granularity_match']}/{reviews[-1]['solvability']}", flush=True)

    write_jsonl(Path(args.output), reviews)
    summary = {
        "reviewed": len(reviews),
        "parse_valid": sum(review["parse_valid"] for review in reviews),
        "all_pass": sum(
            review["parse_valid"]
            and review["alignment"] == review["granularity_match"] == review["solvability"] == "pass"
            for review in reviews
        ),
        "output": args.output,
    }
    print(json.dumps(summary))


def build_prompt(record: dict) -> str:
    return f"""You are a second-pass dataset reviewer. Evaluate only the supplied TypeScript target and instruction.

Return exactly one JSON object with these keys. Keep reason under eight words:
{{"alignment":"pass|fail","granularity_match":"pass|fail","solvability":"pass|fail","reason":"short reason"}}

Definitions:
- alignment: the target implements every behavior requested by the instruction without contradiction.
- granularity_match: the instruction scope matches this G1/G2 target rather than requesting a whole project or omitting its central behavior.
- solvability: the instruction plus listed provided symbols gives enough context to implement the target.

Instruction:
{record['messages'][0]['content']}

Declared granularity: {record['metadata']['granularity']}
Provided symbols: {json.dumps(record.get('context', {}).get('provided_symbols', []))}

Target:
```typescript
{record['messages'][1]['content']}
```
"""


def parse_review(raw: str) -> dict:
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    value = None
    if match:
        try:
            value = json.loads(match.group(0))
        except json.JSONDecodeError:
            value = None
    if not isinstance(value, dict):
        # Small reviewers may hit the generation limit while explaining after
        # already emitting all three labels. Recover only those explicit labels
        # and retain the truncated raw output for audit.
        value = {}
        for key in ("alignment", "granularity_match", "solvability"):
            label = re.search(rf'"{key}"\s*:\s*"(pass|fail)"', raw, flags=re.IGNORECASE)
            if label:
                value[key] = label.group(1).lower()
        if len(value) == 3:
            value["reason"] = "reviewer output truncated after explicit labels"
            value["parse_mode"] = "recovered_explicit_labels"
            return value
        return {}
    for key in ("alignment", "granularity_match", "solvability"):
        if isinstance(value.get(key), str):
            value[key] = value[key].lower()
    value["parse_mode"] = "json"
    return value


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n" for record in records), encoding="utf-8")


if __name__ == "__main__":
    main()

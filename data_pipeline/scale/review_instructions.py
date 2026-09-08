from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


LABELS = {"PASS", "ALIGNMENT_FAIL", "GRANULARITY_FAIL", "SOLVABILITY_FAIL"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a resumable static review pass over generated instructions.")
    parser.add_argument("--input", default="data_pipeline/scale/instructions.jsonl")
    parser.add_argument("--output", default="data_pipeline/scale/reviews.jsonl")
    parser.add_argument("--model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--batch-size", type=int, default=12)
    args = parser.parse_args()
    records = read_jsonl(Path(args.input))
    output = Path(args.output)
    completed = {item["unit_id"]: item for item in read_jsonl(output)} if output.exists() else {}
    pending = [item for item in records if item["unit_id"] not in completed]
    if not pending:
        print(f"[resume] all {len(records)} reviews already complete", flush=True)
        return
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.float32)
    model.eval()
    model.generation_config.temperature = None
    model.generation_config.top_p = None
    model.generation_config.top_k = None

    for offset in range(0, len(pending), args.batch_size):
        batch = pending[offset : offset + args.batch_size]
        chats = [tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt(item)}],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        ) for item in batch]
        encoded = tokenizer(chats, return_tensors="pt", padding=True, truncation=True, max_length=1536)
        started = time.perf_counter()
        with torch.inference_mode():
            generated = model.generate(**encoded, max_new_tokens=12, do_sample=False, pad_token_id=tokenizer.eos_token_id)
        elapsed = time.perf_counter() - started
        prompt_length = encoded["input_ids"].shape[1]
        for item, tokens in zip(batch, generated):
            raw = tokenizer.decode(tokens[prompt_length:], skip_special_tokens=True).strip()
            label = parse_label(raw)
            completed[item["unit_id"]] = {
                "unit_id": item["unit_id"],
                "target_sha256": item["target_sha256"],
                "reviewer": args.model,
                "label": label,
                "parse_valid": label in LABELS,
                "raw_output": raw,
                "batch_seconds": round(elapsed, 3),
            }
        write_jsonl(output, [completed[item["unit_id"]] for item in records if item["unit_id"] in completed])
        print(f"[{min(offset + len(batch), len(pending))}/{len(pending)}] checkpoint={output}", flush=True)


def prompt(item: dict) -> str:
    return f"""Review whether one instruction is a faithful, solvable G1/G2 task for its TypeScript target.
Return exactly one label: PASS, ALIGNMENT_FAIL, GRANULARITY_FAIL, or SOLVABILITY_FAIL.
PASS only if all requested behavior is implemented, scope matches one function/class, and provided names make the task answerable.

Instruction: {item.get('instruction')}
Granularity: {item['granularity']}
Provided symbols: {json.dumps(item['provided_symbols'])}
Target:
{item['target']}"""


def parse_label(raw: str) -> str:
    upper = raw.upper()
    for label in ("ALIGNMENT_FAIL", "GRANULARITY_FAIL", "SOLVABILITY_FAIL", "PASS"):
        if re.search(rf"\b{label}\b", upper):
            return label
    return "INVALID"


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text("".join(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n" for record in records), encoding="utf-8")
    temporary.replace(path)


if __name__ == "__main__":
    main()

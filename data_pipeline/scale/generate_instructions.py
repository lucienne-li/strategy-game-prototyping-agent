from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate inverse instructions for extracted TypeScript units with checkpoint resume.")
    parser.add_argument("--input", default="data_pipeline/scale/units.jsonl")
    parser.add_argument("--output", default="data_pipeline/scale/instructions.jsonl")
    parser.add_argument("--model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--max-new-tokens", type=int, default=96)
    args = parser.parse_args()
    torch.set_num_threads(min(8, torch.get_num_threads()))
    units = read_jsonl(Path(args.input))
    output = Path(args.output)
    prior = {item["unit_id"]: item for item in read_jsonl(output)} if output.exists() else {}
    completed = {
        item["unit_id"]: {**item, "instruction": prior[item["unit_id"]].get("instruction"), "generation": prior[item["unit_id"]].get("generation")}
        for item in units
        if item["unit_id"] in prior
    }
    pending = [item for item in units if item["unit_id"] not in completed]
    if not pending:
        write_jsonl(output, [completed[item["unit_id"]] for item in units])
        print(f"[resume] all {len(units)} instructions already complete", flush=True)
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
        prompts = [render_prompt(item) for item in batch]
        chats = [tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        ) for prompt in prompts]
        encoded = tokenizer(chats, return_tensors="pt", padding=True, truncation=True, max_length=1536)
        started = time.perf_counter()
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        elapsed = time.perf_counter() - started
        prompt_length = encoded["input_ids"].shape[1]
        for item, tokens in zip(batch, generated):
            raw = tokenizer.decode(tokens[prompt_length:], skip_special_tokens=True).strip()
            instruction = parse_instruction(raw)
            completed[item["unit_id"]] = {
                **item,
                "instruction": instruction,
                "generation": {
                    "model": args.model,
                    "method": "code_to_instruction",
                    "decode": "greedy",
                    "parse_valid": instruction is not None,
                    "raw_output": raw,
                    "batch_seconds": round(elapsed, 3),
                },
            }
        write_jsonl(output, [completed[item["unit_id"]] for item in units if item["unit_id"] in completed])
        done = min(offset + len(batch), len(pending))
        print(f"[{done}/{len(pending)}] checkpoint={output}", flush=True)


def render_prompt(item: dict) -> str:
    return f"""Infer a precise coding instruction from this real TypeScript game code.
Return exactly JSON: {{"instruction":"..."}}
The instruction must:
- explicitly name `{item['symbol']}` and preserve its public signature;
- describe observable inputs, outputs, state changes, filtering, and edge cases actually present;
- fit one {item['granularity']} code unit, not request a whole game;
- not mention this repository, source code, or hidden implementation details;
- use 35-75 English words.

Game category: {item['category']}
Signature: {item['signature']}
Potential provided symbols: {json.dumps(item['provided_symbols'])}
Code:
```typescript
{item['target']}
```"""


def parse_instruction(raw: str) -> str | None:
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if match:
        try:
            value = json.loads(match.group(0)).get("instruction")
            if isinstance(value, str) and value.strip():
                return value.strip()
        except json.JSONDecodeError:
            pass
    fallback = re.search(r'"instruction"\s*:\s*"((?:\\.|[^"\\])*)', raw, flags=re.DOTALL)
    if fallback:
        try:
            return json.loads(f'"{fallback.group(1)}"').strip()
        except json.JSONDecodeError:
            return None
    return None


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

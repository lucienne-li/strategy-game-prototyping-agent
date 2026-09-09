from __future__ import annotations

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openai_json import request_json


PIPELINE_VERSION = "quality-v2"
SCHEMA = {
    "type": "object",
    "properties": {
        "target_file": {"type": "string"},
        "target_symbol": {"type": "string"},
        "expected_behavior": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 8},
        "constraints": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 6},
        "required_context": {"type": "array", "items": {"type": "string"}, "maxItems": 16},
        "instruction": {"type": "string"},
    },
    "required": ["target_file", "target_symbol", "expected_behavior", "constraints", "required_context", "instruction"],
    "additionalProperties": False,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate scoped inverse instructions without accepting truncated output.")
    parser.add_argument("--input", default="data_pipeline/scale/units.jsonl")
    parser.add_argument("--output", default="data_pipeline/scale/instructions-v2.jsonl")
    parser.add_argument("--failures", default="data_pipeline/scale/generation-failures-v2.jsonl")
    parser.add_argument("--model", default=os.environ.get("DATA_GENERATOR_MODEL", "gpt-5.6"))
    parser.add_argument("--max-output-tokens", type=int, default=1024)
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required; quality-v2 never falls back to the old generator")
    units = read_jsonl(Path(args.input))
    output, failures = Path(args.output), Path(args.failures)
    completed = {
        item["unit_id"]: item for item in read_jsonl(output)
        if item.get("generation", {}).get("pipeline_version") == PIPELINE_VERSION
    }
    failed = {item["unit_id"]: item for item in read_jsonl(failures)}
    pending = [item for item in units if item["unit_id"] not in completed]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(generate_one, item, args.model, args.max_output_tokens): item for item in pending}
        for index, future in enumerate(as_completed(futures), start=1):
            item = futures[future]
            try:
                completed[item["unit_id"]] = future.result()
                failed.pop(item["unit_id"], None)
            except Exception as error:
                failed[item["unit_id"]] = {"unit_id": item["unit_id"], "reason": "GENERATION_FAILED", "error": str(error)[:1000]}
            write_jsonl(output, [completed[item["unit_id"]] for item in units if item["unit_id"] in completed])
            write_jsonl(failures, [failed[key] for key in sorted(failed)])
            print(f"[{index}/{len(pending)}] generated={len(completed)} failed={len(failed)}", flush=True)


def generate_one(item: dict, model: str, max_output_tokens: int) -> dict:
    value, metadata = request_json(
        model=model,
        prompt=render_prompt(item),
        schema_name="inverse_instruction",
        schema=SCHEMA,
        max_output_tokens=max_output_tokens,
    )
    return {
        **item,
        "scope": {
            "target_file": value["target_file"],
            "target_symbol": value["target_symbol"],
            "expected_behavior": value["expected_behavior"],
            "constraints": value["constraints"],
            "required_context": value["required_context"],
        },
        "instruction": value["instruction"].strip(),
        "generation": {
            "pipeline_version": PIPELINE_VERSION,
            "model": model,
            "method": "structured_code_to_instruction",
            "decode": "structured_json",
            "max_output_tokens": max_output_tokens,
            "response_completed": metadata["status"] == "completed",
            **metadata,
        },
    }


def render_prompt(item: dict) -> str:
    return f"""Create one precise implementation task for this real TypeScript game code.

The JSON fields target_file and target_symbol MUST exactly equal the supplied values. Describe only behavior visible in the target. Do not invent APIs, types, edge cases, or project requirements. expected_behavior must state observable inputs, outputs, errors, and state changes that the target actually implements. constraints must define the implementation boundary. required_context must contain only external symbols needed to solve the task and must be selected from Potential provided symbols.

The instruction must be a complete 45-140 word English task. It must explicitly include the target file, target symbol, expected behavior, and necessary constraints. Do not mention a repository, hidden source, or unspecified/provided guidelines. Never end mid-sentence.

Target file: {item['source_path']}
Target symbol: {item['symbol']}
Granularity: {item['granularity']}
Signature: {item['signature']}
Potential provided symbols: {json.dumps(item['provided_symbols'])}
Target:
```typescript
{item['target']}
```"""


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

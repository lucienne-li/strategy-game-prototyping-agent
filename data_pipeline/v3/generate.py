from __future__ import annotations

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from data_pipeline.scale.openai_json import request_json
from .common import ROOT, read_jsonl, write_jsonl


PIPELINE_VERSION = "data-v3-quality-v2"
SCHEMA = {
    "type": "object",
    "properties": {
        "instruction": {"type": "string"},
        "expected_behavior": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 10},
        "constraints": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 8},
        "required_context": {"type": "array", "items": {"type": "string"}, "maxItems": 12},
        "seed_files": {"type": "array", "items": {"type": "object", "properties": {
            "path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"],
            "additionalProperties": False}, "maxItems": 8},
    },
    "required": ["instruction", "expected_behavior", "constraints", "required_context", "seed_files"],
    "additionalProperties": False,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate resumable, scoped v3 inverse instructions.")
    parser.add_argument("--input", default="data_pipeline/v3/targets.jsonl")
    parser.add_argument("--output", default="data_pipeline/v3/generated.jsonl")
    parser.add_argument("--failures", default="data_pipeline/v3/generation-failures.jsonl")
    parser.add_argument("--model", default=os.environ.get("DATA_GENERATOR_MODEL", "gpt-5.6"))
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--max-output-tokens", type=int, default=2048)
    args = parser.parse_args()
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required; v3 has no fallback generator")
    targets = read_jsonl(ROOT / args.input)
    output, failures = ROOT / args.output, ROOT / args.failures
    completed = {row["target_id"]: row for row in read_jsonl(output) if row.get("pipeline_version") == PIPELINE_VERSION}
    failed = {row["target_id"]: row for row in read_jsonl(failures)}
    pending = [row for row in targets if row["target_id"] not in completed]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(generate_one, row, args.model, args.max_output_tokens): row for row in pending}
        for index, future in enumerate(as_completed(futures), start=1):
            row = futures[future]
            try:
                completed[row["target_id"]] = future.result()
                failed.pop(row["target_id"], None)
            except Exception as error:
                failed[row["target_id"]] = {"target_id": row["target_id"], "reason": "GENERATION_REQUEST_FAILED", "error": str(error)[:2000]}
            write_jsonl(output, (completed[row["target_id"]] for row in targets if row["target_id"] in completed))
            write_jsonl(failures, (failed[key] for key in sorted(failed)))
            print(f"[{index}/{len(pending)}] generated={len(completed)} request_failures={len(failed)}", flush=True)
    if failed:
        raise RuntimeError(f"{len(failed)} generation requests remain unresolved; rerun the same command to resume")


def generate_one(target: dict, model: str, max_output_tokens: int) -> dict:
    value, metadata = request_json(model=model, prompt=prompt(target), schema_name="strategy_game_sft_v3",
                                   schema=SCHEMA, max_output_tokens=max_output_tokens)
    return {**target, **value, "pipeline_version": PIPELINE_VERSION,
            "generation": {"model": model, "max_output_tokens": max_output_tokens, **metadata}}


def prompt(target: dict) -> str:
    non_generation = target["task_type"] != "generation"
    return f"""Create one grounded SFT task from a real, licensed Browser/TypeScript strategy-game target.

Fixed labels: difficulty={target['difficulty']}; task_type={target['task_type']}.
Difficulty is structural: D1 is one mechanism, D2 is a local subsystem, D3 spans interacting systems/files, and D4 is a multi-file project slice. Do not simplify it or inflate it. The task must require every supplied target file/symbol and no behavior absent from the target. Explicitly name target files, target symbols, observable behavior, and constraints. Write a complete 45-180 word instruction.

required_context may contain only names from Potential context symbols. Use an empty list when none are necessary.

For generation, seed_files must be empty. For {target['task_type']}, create a realistic but incomplete/incorrect earlier version in seed_files at the same paths, so implementing the instruction yields the exact target. The seed must materially differ; never merely rename variables or rephrase comments. Do not include tests, repository names, hidden-source wording, or implementation outside the target.

Task-type semantics are fixed: modification changes existing behavior; bug_fixing corrects an observable defect; constraint_addition adds an explicit edge-case/invariant; extension adds a new capability; refactor preserves observable behavior while changing structure. The instruction and seed must demonstrate the selected semantic difference.

Category: {target['category']}
Target symbols: {json.dumps(target['target_symbols'])}
Potential context symbols: {json.dumps(target['provided_symbols'])}
Target files:
{json.dumps(target['target_files'], ensure_ascii=False)}
Non-generation seed required: {str(non_generation).lower()}"""


if __name__ == "__main__":
    main()

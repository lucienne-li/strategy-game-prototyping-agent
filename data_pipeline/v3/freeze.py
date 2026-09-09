from __future__ import annotations

import argparse
import json
from collections import Counter

from .common import ROOT, read_jsonl, sha256_file, write_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Freeze a user-confirmed Data Pipeline v3 candidate dataset.")
    parser.add_argument("--confirm", action="store_true", help="Required acknowledgement after manually inspecting summary and rejects.")
    parser.add_argument("--minimum", type=int, default=2500)
    parser.add_argument("--maximum", type=int, default=3500)
    args = parser.parse_args()
    if not args.confirm:
        raise RuntimeError("dataset freeze requires --confirm after reviewing candidate-manifest.json and summary.json")
    accepted = ROOT / "data_pipeline/v3/accepted.jsonl"
    rejected = ROOT / "data_pipeline/v3/rejected.jsonl"
    summary = ROOT / "data_pipeline/v3/summary.json"
    request_failures = [ROOT / "data_pipeline/v3/generation-failures.jsonl", ROOT / "data_pipeline/v3/review-failures.jsonl"]
    samples = read_jsonl(accepted)
    summary_value = json.loads(summary.read_text(encoding="utf-8"))
    unresolved = sum(len(read_jsonl(path)) for path in request_failures)
    if unresolved:
        raise RuntimeError(f"cannot freeze with {unresolved} unresolved API request failures; resume generation first")
    if not args.minimum <= len(samples) <= args.maximum:
        raise RuntimeError(f"accepted sample count {len(samples)} is outside [{args.minimum}, {args.maximum}]")
    required = {"behavior_consistency", "granularity_match", "missing_context", "task_type_match"}
    bad = [row["sample_id"] for row in samples if any(row.get("quality", {}).get(key) != "pass" for key in required)]
    if bad:
        raise RuntimeError(f"{len(bad)} accepted samples fail the quality-v2 contract")
    benchmark = json.loads((ROOT / "evals/agent_benchmark_v1/freeze-manifest.json").read_text(encoding="utf-8"))
    training_families = {row["metadata"]["repository_family_id"] for row in samples}
    benchmark_namespace = benchmark["family_isolation"]["namespace"].removesuffix("*")
    if any(family.startswith(benchmark_namespace) for family in training_families):
        raise RuntimeError("training/evaluation repository-family leakage detected")
    manifest = {
        "schema_version": "3.0", "freeze_name": "final-sft-data-v3", "status": "frozen",
        "dataset": {"path": "data_pipeline/v3/accepted.jsonl", "sha256": sha256_file(accepted), "samples": len(samples),
                    "families": len(training_families),
                    "difficulty": dict(sorted(Counter(row["metadata"]["difficulty"] for row in samples).items())),
                    "task_type": dict(sorted(Counter(row["metadata"]["task_type"] for row in samples).items())),
                    "category": dict(sorted(Counter(row["metadata"]["category"] for row in samples).items()))},
        "source": {"repositories": summary_value["repositories"], "accepted_repositories": summary_value["accepted_repositories"],
                   "families": summary_value["families"], "accepted_families": summary_value["accepted_families"],
                   "code_units": summary_value["code_units"], "reject_reasons": summary_value["reject_reasons"]},
        "rejected": {"path": "data_pipeline/v3/rejected.jsonl", "sha256": sha256_file(rejected)},
        "summary": {"path": "data_pipeline/v3/summary.json", "sha256": sha256_file(summary)},
        "quality": {"pipeline": "data-v3-quality-v2", "fail_closed": True, "unresolved_request_failures": 0},
        "benchmark": {"freeze_name": benchmark["freeze_name"], "manifest_sha256": sha256_file(ROOT / "evals/agent_benchmark_v1/freeze-manifest.json"), "family_overlap": 0},
        "training": {"base_model": "Qwen/Qwen3-4B", "method": "QLoRA", "epochs": 1, "max_length": 2048,
                     "learning_rate": 0.0002, "gradient_accumulation": 8, "lora_rank": 8, "lora_alpha": 16,
                     "lora_dropout": 0.05, "assistant_response_only_loss": True, "seed": 42},
    }
    write_json(ROOT / "data_pipeline/v3/freeze-manifest.json", manifest)
    (ROOT / "data_pipeline/v3/freeze-manifest.sha256").write_text(
        f"{sha256_file(ROOT / 'data_pipeline/v3/freeze-manifest.json')}  freeze-manifest.json\n", encoding="utf-8")
    print(json.dumps({"status": "frozen", "samples": len(samples), "sha256": manifest["dataset"]["sha256"]}, indent=2))


if __name__ == "__main__":
    main()

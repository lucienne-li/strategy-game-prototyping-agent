from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCALE = ROOT / "data_pipeline" / "scale"
sys.path.insert(0, str(SCALE))
from quality_checks import deterministic_reasons  # noqa: E402


def record() -> dict:
    instruction = (
        "In `src/game/strike.ts`, implement `strike` with its existing signature. Reduce the enemy health by six and "
        "consume one player energy when at least one energy remains; otherwise leave both values unchanged. Return the "
        "updated immutable state. Limit the change to this function, use the declared GameState context, preserve all "
        "unrelated fields, and do not add project-level features."
    )
    return {
        "unit_id": "u1", "source_path": "src/game/strike.ts", "symbol": "strike", "granularity": "G1",
        "provided_symbols": ["GameState"], "target_sha256": "hash",
        "instruction": instruction,
        "scope": {
            "target_file": "src/game/strike.ts", "target_symbol": "strike",
            "expected_behavior": ["Reduce enemy health by six", "consume one player energy", "otherwise leave both values unchanged", "Return the updated immutable state"],
            "constraints": ["Limit the change to this function", "use the declared GameState context", "preserve all unrelated fields"],
            "required_context": ["GameState"],
        },
        "generation": {"pipeline_version": "quality-v2", "response_completed": True},
    }


def validation() -> dict:
    return {"unit_id": "u1", "target_sha256": "hash", "syntax": "pass", "symbol": "pass", "behavior": "not_eligible"}


class DataQualityPipelineTests(unittest.TestCase):
    def test_complete_scoped_record_passes_deterministic_gate(self) -> None:
        self.assertEqual(deterministic_reasons(record(), validation()), [])

    def test_truncated_generation_is_rejected_not_recovered(self) -> None:
        candidate = record()
        candidate["generation"]["response_completed"] = False
        candidate["instruction"] = candidate["instruction"].removesuffix(".")
        reasons = deterministic_reasons(candidate, validation())
        self.assertIn("GENERATION_INCOMPLETE", reasons)
        self.assertIn("INSTRUCTION_INCOMPLETE", reasons)

    def test_scope_and_missing_context_fail_closed(self) -> None:
        candidate = record()
        candidate["scope"]["target_file"] = "src/other.ts"
        candidate["scope"]["required_context"] = ["UnknownApi"]
        reasons = deterministic_reasons(candidate, validation())
        self.assertIn("TARGET_FILE_SCOPE_MISMATCH", reasons)
        self.assertIn("MISSING_CONTEXT", reasons)

    def test_target_validation_covers_all_fixed_units(self) -> None:
        subprocess.run(["node", str(SCALE / "validate-targets.mjs")], cwd=ROOT, check=True, capture_output=True, text=True)
        rows = [json.loads(line) for line in (SCALE / "target-validation-v2.jsonl").read_text(encoding="utf-8").splitlines() if line]
        self.assertEqual(len(rows), 440)
        self.assertEqual(len({item["unit_id"] for item in rows}), 440)
        self.assertTrue(all(item["behavior"] in {"pass", "fail", "not_eligible"} for item in rows))

    def test_generator_never_falls_back_without_strong_model_credentials(self) -> None:
        environment = dict(os.environ)
        environment.pop("OPENAI_API_KEY", None)
        completed = subprocess.run(
            [sys.executable, str(SCALE / "generate_instructions.py")], cwd=ROOT, env=environment,
            capture_output=True, text=True,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("never falls back to the old generator", completed.stderr)

    def test_finalizer_requires_strong_review(self) -> None:
        unit = {
            "unit_id": "u1", "repository": "owner/repo", "commit": "abc", "source_path": "src/game/strike.ts",
            "source_lines": "1-4", "repository_family_id": "github:owner/repo", "license": "MIT", "category": "card",
            "granularity": "G1", "symbol": "strike", "target_sha256": "hash", "target": "export function strike() { return true; }\n",
            "provided_symbols": [],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, rows in (("units", [unit]), ("instructions", [{**unit, **record()}]), ("validations", [validation()]), ("reviews", [])):
                (root / f"{name}.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            subprocess.run([
                sys.executable, str(SCALE / "finalize_scale.py"), "--units", str(root / "units.jsonl"),
                "--instructions", str(root / "instructions.jsonl"), "--reviews", str(root / "reviews.jsonl"),
                "--target-validation", str(root / "validations.jsonl"), "--accepted", str(root / "accepted.jsonl"),
                "--rejected", str(root / "rejected.jsonl"),
            ], cwd=ROOT, check=True, capture_output=True, text=True)
            self.assertEqual((root / "accepted.jsonl").read_text(), "")
            rejected = json.loads((root / "rejected.jsonl").read_text())
            self.assertIn("STRONG_REVIEW_MISSING", rejected["metadata"]["rejection_reasons"])


if __name__ == "__main__":
    unittest.main()

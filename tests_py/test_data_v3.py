from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from data_pipeline.v3.build_targets import build_targets
from data_pipeline.v3.finalize import deterministic_reasons


ROOT = Path(__file__).resolve().parents[1]


def unit(index: int, file: str) -> dict:
    code = f"export function action{index}(state: number) {{ return state + {index}; }}\n"
    return {"unit_id": f"u{index}", "repository": "owner/game", "repository_family_id": "github-family:owner/game",
            "commit": "abc", "license": "MIT", "category": "card", "source_path": file,
            "source_lines": f"{index}-{index + 1}", "symbol": f"action{index}", "target": code}


class DataV3Tests(unittest.TestCase):
    def test_target_builder_uses_structural_difficulty_not_paraphrases(self) -> None:
        rows = [unit(1, "src/a.ts"), unit(2, "src/a.ts"), unit(3, "src/b.ts"), unit(4, "src/c.ts"), unit(5, "src/d.ts")]
        targets = build_targets(rows, 100)
        by_difficulty = {difficulty: [row for row in targets if row["difficulty"] == difficulty] for difficulty in ("D1", "D2", "D3", "D4")}
        self.assertTrue(by_difficulty["D1"])
        self.assertTrue(all(len(row["target_symbols"]) == 1 for row in by_difficulty["D1"]))
        self.assertTrue(by_difficulty["D2"])
        self.assertTrue(all(len(row["target_symbols"]) >= 2 for row in by_difficulty["D2"]))
        self.assertTrue(all(len(row["target_files"]) >= 2 for row in by_difficulty["D3"]))
        self.assertTrue(all(len(row["target_files"]) >= 3 for row in by_difficulty["D4"]))
        self.assertEqual(len({row["target_sha256"] + row["difficulty"] for row in targets}), len(targets))

    def test_quality_gate_rejects_fake_difficulty_and_unchanged_seed(self) -> None:
        target = build_targets([unit(1, "src/a.ts")], 10)[0]
        target.update({"difficulty": "D4", "task_type": "bug_fixing", "instruction":
            "In src/a.ts, fix action1 so it returns the state plus one while preserving its signature and avoiding mutation. Keep the implementation limited to action1, introduce no dependencies, retain the numeric input and output contract, and do not add unrelated game systems or files.",
            "expected_behavior": ["return state plus one"], "constraints": ["preserve signature"], "required_context": [],
            "seed_files": target["target_files"]})
        reasons = deterministic_reasons(target)
        self.assertIn("GRANULARITY_MISMATCH", reasons)
        self.assertIn("SEED_INVALID", reasons)

    def test_freeze_requires_explicit_confirmation(self) -> None:
        result = subprocess.run([sys.executable, "-m", "data_pipeline.v3.freeze"], cwd=ROOT, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires --confirm", result.stderr)

    def test_v3_loader_accepts_only_all_pass_quality(self) -> None:
        from training.sft_smoke.data import load_chat_samples
        record = {"sample_id": "v3", "messages": [{"role": "user", "content": "task"}, {"role": "assistant", "content": "{\"files\":[]}"}],
                  "quality": {"pipeline_version": "data-v3-quality-v2", "behavior_consistency": "pass",
                              "granularity_match": "pass", "missing_context": "pass", "task_type_match": "pass"}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data.jsonl"; path.write_text(json.dumps(record) + "\n", encoding="utf-8")
            self.assertEqual(len(load_chat_samples(path)), 1)
            record["quality"]["task_type_match"] = "fail"; path.write_text(json.dumps(record) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "task_type_match"):
                load_chat_samples(path)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCALE = ROOT / "data_pipeline" / "scale"


def load_batch_module():
    spec = importlib.util.spec_from_file_location("batch_repositories", SCALE / "batch_repositories.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rows(name: str) -> list[dict]:
    path = SCALE / name
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class ScaleDatasetTests(unittest.TestCase):
    def test_license_detector_only_recognizes_allowed_full_text_patterns(self) -> None:
        detect = load_batch_module().detect_license
        self.assertEqual(detect("Apache License Version 2.0, January 2004"), "Apache-2.0")
        self.assertEqual(detect('Permission is hereby granted, free of charge. THE SOFTWARE IS PROVIDED "AS IS"'), "MIT")
        self.assertEqual(detect("Redistribution and use in source and binary forms"), "BSD-2-Clause")
        self.assertEqual(detect("GNU GENERAL PUBLIC LICENSE Version 3"), "UNKNOWN")

    def test_repository_funnel_is_reproducible_and_conservative(self) -> None:
        repositories = rows("repositories.jsonl")
        self.assertEqual(len(repositories), 28)
        accepted = [item for item in repositories if item["status"] == "accepted"]
        self.assertEqual(len(accepted), 17)
        self.assertTrue(all(item["license"]["spdx_id"] in {"MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0"} for item in accepted))
        self.assertTrue(all(item["build"]["exit_code"] == 0 for item in accepted))
        self.assertEqual(len({item["family_id"] for item in accepted}), 17)
        reasons = Counter(item["reason"] for item in repositories if item["status"] == "rejected")
        self.assertEqual(sum(reasons.values()), 11)

    def test_extracted_units_are_unique_and_family_bound(self) -> None:
        repositories = rows("repositories.jsonl")
        allowed = {item["family_id"] for item in repositories if item["status"] == "accepted"}
        units = rows("units.jsonl")
        self.assertEqual(len(units), 440)
        self.assertEqual(len({item["target_sha256"] for item in units}), len(units))
        self.assertTrue(all(item["repository_family_id"] in allowed for item in units))
        self.assertTrue(all(item["granularity"] in {"G1", "G2"} for item in units))

    def test_final_dataset_is_training_ready_and_reproducible(self) -> None:
        accepted = rows("accepted.jsonl")
        self.assertEqual(len(accepted), 186)
        self.assertTrue(all(not item["metadata"]["repository_family_id"].startswith("benchmark:") for item in accepted))
        for item in accepted:
            quality = item["metadata"]["quality"]
            self.assertEqual((quality["alignment"], quality["granularity_match"], quality["solvability"]), ("pass", "pass", "pass"))

        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            subprocess.run([
                sys.executable,
                str(SCALE / "finalize_scale.py"),
                "--accepted", str(output / "accepted.jsonl"),
                "--rejected", str(output / "rejected.jsonl"),
            ], cwd=ROOT, check=True, capture_output=True, text=True)
            self.assertEqual((output / "accepted.jsonl").read_bytes(), (SCALE / "accepted.jsonl").read_bytes())
            self.assertEqual((output / "rejected.jsonl").read_bytes(), (SCALE / "rejected.jsonl").read_bytes())

    def test_stratified_audit_and_freeze_are_complete(self) -> None:
        audit = rows("quality-audit-reviewed.jsonl")
        self.assertEqual(len(audit), 48)
        self.assertEqual(Counter((item["category"], item["granularity"]) for item in audit), Counter({
            ("card", "G1"): 8,
            ("card", "G2"): 8,
            ("tactics", "G1"): 8,
            ("tactics", "G2"): 8,
            ("tower-defense", "G1"): 8,
            ("tower-defense", "G2"): 8,
        }))
        self.assertEqual(len({item["repository_family_id"] for item in audit}), 15)
        self.assertEqual(sum(item["review"]["decision"] == "reject" for item in audit), 34)
        completed = subprocess.run(
            [sys.executable, str(SCALE / "verify_freeze.py")],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertIn('"status": "verified"', completed.stdout)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ACCEPTED = ROOT / "data_pipeline/samples/accepted-v2.jsonl"
REJECTED = ROOT / "data_pipeline/samples/rejected-v2.jsonl"
REVIEWS = ROOT / "data_pipeline/reviews/independent-v2.jsonl"
ALLOWED_LICENSES = {"MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0"}
TRAIN_FAMILIES = {
    "github:aod/zhithead",
    "github:Veatec22/Pazaak",
    "github:excaliburjs/sample-tactics",
    "github:rjct/react-isometric-game",
    "github:thilo-behnke/phaser3-tower-defense",
}


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class DataExpansionTest(unittest.TestCase):
    def test_v2_dataset_has_reviewed_unique_family_isolated_records(self) -> None:
        accepted = load_jsonl(ACCEPTED)
        rejected = load_jsonl(REJECTED)
        reviews = {record["sample_id"]: record for record in load_jsonl(REVIEWS)}

        self.assertEqual(len(accepted), 24)
        self.assertEqual(len(rejected), 1)
        self.assertEqual({record["metadata"]["repository_family_id"] for record in accepted}, TRAIN_FAMILIES)
        self.assertTrue(all(record["metadata"]["license"] in ALLOWED_LICENSES for record in accepted))
        self.assertTrue(all(record["metadata"]["granularity"] in {"G1", "G2"} for record in accepted))

        ids = [record["sample_id"] for record in accepted]
        targets = [record["messages"][1]["content"].strip() for record in accepted]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(targets), len({hashlib.sha256(value.encode()).hexdigest() for value in targets}))
        for record in accepted:
            review = reviews[record["sample_id"]]
            self.assertTrue(review["parse_valid"])
            self.assertEqual(
                (review["alignment"], review["granularity_match"], review["solvability"]),
                ("pass", "pass", "pass"),
            )

        self.assertEqual(rejected[0]["sample_id"], "exp-pazaak-pools-017")
        self.assertIn("INDEPENDENT_REVIEW_INVALID", rejected[0]["metadata"]["rejection_reasons"])

    def test_finalize_stage_reproduces_committed_dataset(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            accepted = Path(directory) / "accepted.jsonl"
            rejected = Path(directory) / "rejected.jsonl"
            subprocess.run(
                [
                    sys.executable,
                    "data_pipeline/pipeline/finalize_dataset.py",
                    "--accepted",
                    str(accepted),
                    "--rejected",
                    str(rejected),
                ],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(load_jsonl(accepted), load_jsonl(ACCEPTED))
            self.assertEqual(load_jsonl(rejected), load_jsonl(REJECTED))


if __name__ == "__main__":
    unittest.main()

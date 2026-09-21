from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from data_pipeline.scale.extract_units import extract_units, run
from data_pipeline.scale.validate_targets import delimiter_errors, validate


class PythonDataToolTests(unittest.TestCase):
    def test_extracts_exported_game_function(self):
        source = """export function strike(state: GameState): GameState {
  if (state.energy < 1) return state;
  return {...state, energy: state.energy - 1, enemyHealth: state.enemyHealth - 6};
}
"""
        units = extract_units(source)
        self.assertEqual([(unit["name"], unit["kind"]) for unit in units], [("strike", "function")])

    def test_batch_extractor_keeps_repository_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); checkout = root / "checkout/repo/src"; checkout.mkdir(parents=True)
            checkout.joinpath("game.ts").write_text("""export function drawCard(state: GameState): GameState {
  const card = state.deck[0];
  return {...state, deck: state.deck.slice(1), hand: [...state.hand, card]};
}
""")
            manifest = root / "repos.jsonl"
            manifest.write_text('{"status":"accepted","checkout":"repo","repo":"owner/repo","family_id":"github:owner/repo","category":"card","commit":"abc","license":{"spdx_id":"MIT"}}\n')
            output = root / "units.jsonl"
            summary = run(root / "checkout", manifest, output, 10, 10)
            self.assertEqual(summary["selected"], 1)
            self.assertIn('"repository_family_id":"github:owner/repo"', output.read_text())

    def test_target_validator_rejects_unbalanced_source(self):
        self.assertEqual(delimiter_errors("function x() { return 1;"), ["unclosed delimiter"])
        row = validate({"unit_id": "x", "target_sha256": "h", "symbol": "x", "target": "function x() { return 1;"})
        self.assertEqual(row["syntax"], "fail")


if __name__ == "__main__": unittest.main()

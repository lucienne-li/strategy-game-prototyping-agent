import json
import tempfile
import unittest
from pathlib import Path

from training.sft_smoke.data import load_chat_samples, render_chat_samples


class FakeTokenizer:
    def apply_chat_template(self, messages, *, tokenize, add_generation_prompt):
        self.assertion = (tokenize, add_generation_prompt)
        return "\n".join(f"<{message['role']}>{message['content']}" for message in messages)


class SftDataTest(unittest.TestCase):
    def test_loads_all_pilot_samples_and_renders_chat_template(self):
        samples = load_chat_samples("data_pipeline/samples/accepted.jsonl")
        self.assertEqual(7, len(samples))
        tokenizer = FakeTokenizer()
        rendered = render_chat_samples(samples, tokenizer)
        self.assertEqual(7, len(rendered))
        self.assertIn("<user>", rendered[0]["text"])
        self.assertIn("<assistant>", rendered[0]["text"])
        self.assertEqual((False, False), tokenizer.assertion)

    def test_rejects_non_chat_and_failed_quality_records(self):
        record = {
            "sample_id": "bad",
            "messages": [{"role": "user", "content": "x"}, {"role": "assistant", "content": "y"}],
            "metadata": {"quality": {"alignment": "fail", "granularity_match": "pass", "solvability": "pass"}},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.jsonl"
            path.write_text(json.dumps(record) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "failed alignment"):
                load_chat_samples(path)


if __name__ == "__main__":
    unittest.main()

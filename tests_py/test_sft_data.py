import json
import tempfile
import unittest
from pathlib import Path

from training.sft_smoke.data import encode_response_only, load_chat_samples, render_chat_samples


class FakeTokenizer:
    def apply_chat_template(self, messages, *, tokenize, add_generation_prompt):
        self.assertion = (tokenize, add_generation_prompt)
        return "\n".join(f"<{message['role']}>{message['content']}" for message in messages)


class FakeTokenizingChatTokenizer:
    def apply_chat_template(self, messages, *, tokenize, add_generation_prompt):
        if len(messages) == 1 and add_generation_prompt:
            return [10, 11, 12]
        if len(messages) == 2 and not add_generation_prompt:
            return [10, 11, 12, 20, 21]
        raise AssertionError("unexpected template call")


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

    def test_response_only_encoding_masks_prompt_tokens(self):
        sample = load_chat_samples("data_pipeline/samples/accepted.jsonl")[0]
        encoded = encode_response_only(sample, FakeTokenizingChatTokenizer(), max_length=8)
        self.assertEqual([10, 11, 12, 20, 21], encoded["input_ids"])
        self.assertEqual([-100, -100, -100, 20, 21], encoded["labels"])


if __name__ == "__main__":
    unittest.main()

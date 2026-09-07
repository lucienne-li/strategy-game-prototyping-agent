from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class ChatSample:
    sample_id: str
    messages: tuple[dict[str, str], ...]


def load_chat_samples(path: str | Path) -> list[ChatSample]:
    source = Path(path)
    samples: list[ChatSample] = []
    seen_ids: set[str] = set()

    with source.open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            if not raw_line.strip():
                continue
            try:
                record = json.loads(raw_line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{source}:{line_number}: invalid JSON: {error.msg}") from error

            sample_id = record.get("sample_id")
            if not isinstance(sample_id, str) or not sample_id:
                raise ValueError(f"{source}:{line_number}: missing sample_id")
            if sample_id in seen_ids:
                raise ValueError(f"{source}:{line_number}: duplicate sample_id {sample_id}")

            messages = _validate_messages(record.get("messages"), source, line_number)
            quality = record.get("metadata", {}).get("quality", {})
            for gate in ("alignment", "granularity_match", "solvability"):
                if quality.get(gate) != "pass":
                    raise ValueError(f"{source}:{line_number}: accepted sample failed {gate}")

            samples.append(ChatSample(sample_id=sample_id, messages=messages))
            seen_ids.add(sample_id)

    if not samples:
        raise ValueError(f"{source}: no training samples")
    return samples


def render_chat_samples(samples: Iterable[ChatSample], tokenizer: Any) -> list[dict[str, str]]:
    rendered: list[dict[str, str]] = []
    for sample in samples:
        text = tokenizer.apply_chat_template(
            list(sample.messages),
            tokenize=False,
            add_generation_prompt=False,
        )
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"chat template returned empty text for {sample.sample_id}")
        rendered.append({"sample_id": sample.sample_id, "text": text})
    return rendered


def _validate_messages(value: object, source: Path, line_number: int) -> tuple[dict[str, str], ...]:
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError(f"{source}:{line_number}: expected exactly user and assistant messages")

    messages: list[dict[str, str]] = []
    for index, expected_role in enumerate(("user", "assistant")):
        message = value[index]
        if not isinstance(message, dict) or message.get("role") != expected_role:
            raise ValueError(f"{source}:{line_number}: message {index} must have role {expected_role}")
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError(f"{source}:{line_number}: message {index} has empty content")
        messages.append({"role": expected_role, "content": content})
    return tuple(messages)

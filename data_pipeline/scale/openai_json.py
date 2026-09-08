from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request


RESPONSES_URL = "https://api.openai.com/v1/responses"


def request_json(*, model: str, prompt: str, schema_name: str, schema: dict, max_output_tokens: int, retries: int = 3) -> tuple[dict, dict]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for data generation and strong review")
    body = {
        "model": model,
        "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
        "text": {"format": {"type": "json_schema", "name": schema_name, "strict": True, "schema": schema}},
        "max_output_tokens": max_output_tokens,
    }
    for attempt in range(retries + 1):
        started = time.perf_counter()
        request = urllib.request.Request(
            RESPONSES_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("status") != "completed":
                raise RuntimeError(f"model response was not completed: {payload.get('status')}")
            value = json.loads(output_text(payload))
            return value, {
                "response_id": payload.get("id"),
                "status": payload.get("status"),
                "duration_seconds": round(time.perf_counter() - started, 3),
                "usage": payload.get("usage"),
            }
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as error:
            if attempt >= retries:
                raise RuntimeError(f"OpenAI JSON request failed after {attempt + 1} attempts: {error}") from error
            time.sleep(min(2 ** attempt, 8))
    raise AssertionError("unreachable")


def output_text(payload: dict) -> str:
    parts = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                parts.append(content["text"])
    if not parts:
        raise RuntimeError("model response contained no output_text")
    return "\n".join(parts)

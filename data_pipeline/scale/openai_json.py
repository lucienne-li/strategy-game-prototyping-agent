from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request


RESPONSES_URL = "https://api.openai.com/v1/responses"
MAX_ERROR_BODY_CHARS = 2000


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
                details = payload.get("incomplete_details") or {}
                reason = details.get("reason") if isinstance(details, dict) else None
                suffix = f" (incomplete_details.reason={reason})" if reason else ""
                raise RuntimeError(f"model response was not completed: {payload.get('status')}{suffix}")
            value = json.loads(output_text(payload))
            return value, {
                "response_id": payload.get("id"),
                "status": payload.get("status"),
                "duration_seconds": round(time.perf_counter() - started, 3),
                "usage": payload.get("usage"),
            }
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")[:MAX_ERROR_BODY_CHARS]
            error_code = http_error_code(body)
            retry_after = error.headers.get("Retry-After") if error.headers else None
            detail = f"HTTP Error {error.code}: {error.reason}"
            if error_code:
                detail += f"; error_code={error_code}"
            if retry_after:
                detail += f"; retry_after={retry_after}"
            if body:
                detail += f"; response_body={body}"
            if attempt >= retries:
                raise RuntimeError(f"OpenAI JSON request failed after {attempt + 1} attempts: {detail}") from error
            time.sleep(min(2 ** attempt, 8))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as error:
            if attempt >= retries:
                raise RuntimeError(f"OpenAI JSON request failed after {attempt + 1} attempts: {error}") from error
            time.sleep(min(2 ** attempt, 8))
    raise AssertionError("unreachable")


def http_error_code(body: str) -> str | None:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return None
    error = payload.get("error")
    if not isinstance(error, dict):
        return None
    code = error.get("code")
    return str(code) if code is not None else None


def output_text(payload: dict) -> str:
    parts = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                parts.append(content["text"])
    if not parts:
        raise RuntimeError("model response contained no output_text")
    return "\n".join(parts)

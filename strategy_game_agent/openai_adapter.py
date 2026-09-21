from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from .models import ModelContext, ModelOutput


RESPONSES_URL = "https://api.openai.com/v1/responses"
TOOLS = [
    {"type": "function", "name": "read_file", "description": "Read a UTF-8 text file inside the task workspace.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"], "additionalProperties": False}, "strict": True},
    {"type": "function", "name": "write_file", "description": "Create or replace a UTF-8 text file inside the task workspace.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"], "additionalProperties": False}, "strict": True},
    {"type": "function", "name": "run_command", "description": "Run an allowlisted executable in the task workspace without a shell.", "parameters": {"type": "object", "properties": {"command": {"type": "string"}, "args": {"type": "array", "items": {"type": "string"}}}, "required": ["command", "args"], "additionalProperties": False}, "strict": True},
]
INSTRUCTIONS = " ".join([
    "You are a minimal coding agent operating in a temporary task workspace.",
    "Use only the supplied tools; up to 8 calls in one response execute in order.",
    "All paths are workspace-relative and the only executable is node.",
    "Inspect observations before success. Final text must start with SUCCESS: or FAILURE:.",
])


class OpenAIResponsesModel:
    def __init__(
        self,
        api_key: str,
        model_name: str = "gpt-5.6",
        timeout_seconds: float = 60,
        max_output_tokens: int | None = None,
        transport: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required")
        if timeout_seconds <= 0:
            raise ValueError("model timeout must be positive")
        if max_output_tokens is not None and max_output_tokens < 1:
            raise ValueError("max_output_tokens must be positive")
        self.api_key = api_key
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self.max_output_tokens = max_output_tokens
        self.transport = transport

    @classmethod
    def from_env(cls, **kwargs: Any) -> "OpenAIResponsesModel":
        return cls(
            api_key=os.environ.get("OPENAI_API_KEY", ""),
            model_name=os.environ.get("OPENAI_MODEL", "").strip() or "gpt-5.6",
            **kwargs,
        )

    def next(self, context: ModelContext) -> ModelOutput:
        body: dict[str, Any] = {
            "model": self.model_name,
            "instructions": INSTRUCTIONS,
            "input": [{"role": "user", "content": [{"type": "input_text", "text": json.dumps({"user_request": context.request, "iteration": context.iteration, "event_history": [event.model_dump(by_alias=True, exclude_none=True) for event in context.events]}, indent=2)}]}],
            "tools": TOOLS,
            "tool_choice": "auto",
        }
        if self.max_output_tokens is not None:
            body["max_output_tokens"] = self.max_output_tokens
        payload = self.transport(body) if self.transport else self._request(body)
        output = payload.get("output")
        if not isinstance(output, list):
            raise ValueError("OpenAI response is missing the output array")
        calls = [self._parse_call(item) for item in output if isinstance(item, dict) and item.get("type") == "function_call"]
        if len(calls) == 1:
            return ModelOutput.tool_call(calls[0])
        if calls:
            return ModelOutput.tool_calls(calls)
        parts = [content.get("text") for item in output if isinstance(item, dict) for content in item.get("content", []) if isinstance(content, dict) and content.get("type") == "output_text" and isinstance(content.get("text"), str)]
        text = "\n".join(parts).strip()
        if text.startswith("SUCCESS:"):
            return ModelOutput.final("success", text[8:].strip())
        if text.startswith("FAILURE:"):
            return ModelOutput.final("failure", text[8:].strip())
        if not text:
            raise ValueError("OpenAI response contained neither a tool call nor final text")
        raise ValueError("final model response must begin with SUCCESS: or FAILURE:")

    def _request(self, body: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            RESPONSES_URL, data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            details = error.read().decode(errors="replace").replace(self.api_key, "[REDACTED]")
            raise RuntimeError(f"OpenAI API returned {error.code}: {' '.join(details.split())[:500]}") from error

    @staticmethod
    def _parse_call(item: dict[str, Any]) -> dict[str, Any]:
        name = item.get("name")
        if name not in {"read_file", "write_file", "run_command"}:
            raise ValueError(f"model requested unsupported tool: {name}")
        raw = item.get("arguments")
        if not isinstance(raw, str):
            raise ValueError("model tool arguments must be a JSON string")
        try:
            arguments = json.loads(raw)
        except json.JSONDecodeError as error:
            raise ValueError("model returned invalid JSON tool arguments") from error
        if not isinstance(arguments, dict):
            raise ValueError("model tool arguments must decode to an object")
        return {"tool": name, **arguments}

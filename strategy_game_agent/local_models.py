from __future__ import annotations

import json
import re
import subprocess
import threading
from pathlib import Path
from typing import Any, Protocol

from .models import ModelContext, ModelOutput


class JsonLineWorker:
    def __init__(self, python: str, script: str, model: str, adapter: str | None = None, max_new_tokens: int = 512, device: str | None = None) -> None:
        args = [python, script, "--model", model, "--max-new-tokens", str(max_new_tokens)]
        if adapter:
            args += ["--adapter", adapter]
        if device:
            args += ["--device", device]
        self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        self.next_id = 1
        self.lock = threading.Lock()

    def request(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            request_id = self.next_id
            self.next_id += 1
            assert self.process.stdin and self.process.stdout
            self.process.stdin.write(json.dumps({"id": request_id, **payload}) + "\n")
            self.process.stdin.flush()
            while line := self.process.stdout.readline():
                response = json.loads(line)
                if response.get("id") == request_id:
                    if not response.get("ok"):
                        raise RuntimeError(response.get("error", "local model worker failed"))
                    return response
            stderr = self.process.stderr.read() if self.process.stderr else ""
            raise RuntimeError(f"local model worker exited: {stderr[-2000:]}")

    def close(self) -> None:
        if self.process.stdin:
            self.process.stdin.close()
        self.process.wait(timeout=30)


class ArtifactGenerator(Protocol):
    def generate(self, request: str, existing_files: list[dict[str, str]]) -> dict[str, Any]: ...


class LocalQwenArtifactWorker:
    def __init__(self, **options: Any) -> None:
        self.worker = JsonLineWorker(options["python"], options["script"], options["model"], options.get("adapter"), options.get("max_new_tokens", 4096), options.get("device"))

    def generate(self, request: str, existing_files: list[dict[str, str]]) -> dict[str, Any]:
        response = self.worker.request({"request": request, "existing_files": existing_files})
        artifact = response.get("artifact")
        if not isinstance(artifact, dict):
            raise RuntimeError("worker returned no artifact")
        return artifact

    def close(self) -> None:
        self.worker.close()


class ScaffoldedArtifactAgentModel:
    def __init__(self, worker: ArtifactGenerator) -> None:
        self.worker = worker
        self.paths: list[str] = []
        self.generated_for_request: str | None = None

    def next(self, context: ModelContext) -> ModelOutput:
        repair = "evaluator-guided repair" in context.request
        if not context.events:
            if not repair:
                self.paths = []
            self.generated_for_request = None
            if repair and self.paths:
                return ModelOutput.tool_calls([{"tool": "read_file", "path": path} for path in self.paths])
            reads = list(dict.fromkeys(re.findall(r"\bRead\s+`?([A-Za-z0-9_./-]+\.(?:ts|js|html|mjs))`?", context.request, re.I)))[:8]
            if reads:
                self.paths = reads
                return ModelOutput.tool_calls([{"tool": "read_file", "path": path} for path in reads])
            return self._writes(context.request, [])
        results = [event.result for event in context.events if event.type == "tool_result" and event.result]
        last = results[-1] if results else None
        if last and last.tool == "read_file" and not self.generated_for_request:
            return self._writes(context.request, self._read_pairs(context))
        if last and last.tool == "write_file":
            if "project.mjs" in self.paths:
                return ModelOutput.tool_call({"tool": "run_command", "command": "node", "args": ["project.mjs", "build"], "timeoutMs": 10_000})
            return ModelOutput.final("success", "Generated artifact files.")
        if last and last.tool == "run_command":
            return ModelOutput.final("success" if last.ok else "failure", "Generated and built artifact." if last.ok else "Artifact build failed.")
        return ModelOutput.final("failure", "Unexpected artifact adapter state.")

    def _writes(self, request: str, existing: list[dict[str, str]]) -> ModelOutput:
        artifact = self.worker.generate(request, existing)
        files = artifact.get("files")
        if not isinstance(files, list) or not 1 <= len(files) <= 8:
            raise ValueError("artifact must contain 1-8 files")
        self.paths = [item["path"] for item in files]
        self.generated_for_request = request
        return ModelOutput.tool_calls([{"tool": "write_file", "path": item["path"], "content": item["content"]} for item in files])

    @staticmethod
    def _read_pairs(context: ModelContext) -> list[dict[str, str]]:
        files = []
        for call, result in zip(context.events, context.events[1:]):
            if call.type == "tool_call" and call.call and call.call.tool == "read_file" and result.type == "tool_result" and result.result and result.result.ok:
                files.append({"path": call.call.path, "content": result.result.content or ""})
        return files

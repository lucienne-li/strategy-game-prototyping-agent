from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Iterable

from pydantic import ValidationError

from .models import ReadFileCall, RunCommandCall, TOOL_CALL_ADAPTER, ToolCall, ToolResult, WriteFileCall


MAX_FILE_BYTES = 1_000_000
MAX_OUTPUT_BYTES = 1_000_000
FORBIDDEN_NODE_PERMISSION_ARGS = (
    "--permission", "--no-permission", "--allow-fs-read", "--allow-fs-write",
    "--allow-child-process", "--allow-worker",
)


def validate_tool_call(value: Any) -> ToolCall:
    try:
        return TOOL_CALL_ADAPTER.validate_python(value)
    except ValidationError as error:
        raise ValueError(f"invalid tool call: {error.errors(include_url=False)}") from error


def resolve_workspace_file(workspace: Path, requested_path: str) -> Path:
    root = workspace.resolve(strict=True)
    requested = Path(requested_path)
    if requested.is_absolute():
        raise ValueError("absolute paths are not allowed")
    target = (root / requested).resolve(strict=False)
    try:
        relative = target.relative_to(root)
    except ValueError as error:
        raise ValueError("path must resolve to a file inside the workspace") from error
    if not relative.parts:
        raise ValueError("path must resolve to a file inside the workspace")
    current = root
    for part in relative.parts:
        current /= part
        if current.is_symlink():
            raise ValueError("symbolic links are not allowed in workspace file paths")
    return target


class ToolExecutor:
    def __init__(
        self,
        workspace: str | Path,
        allowed_commands: Iterable[str] = ("node",),
        node_fs_access: str = "read-write",
    ) -> None:
        self.workspace = Path(workspace).resolve(strict=True)
        self.allowed_commands = set(allowed_commands)
        if node_fs_access not in {"read-only", "read-write"}:
            raise ValueError("node_fs_access must be read-only or read-write")
        self.node_fs_access = node_fs_access

    def execute(self, raw_call: Any) -> tuple[ToolCall | None, ToolResult]:
        try:
            call = validate_tool_call(raw_call)
        except ValueError as error:
            return None, ToolResult(tool="unknown", ok=False, error=str(error))
        try:
            if isinstance(call, ReadFileCall):
                return call, self._read_file(call.path)
            if isinstance(call, WriteFileCall):
                return call, self._write_file(call.path, call.content)
            return call, self._run_command(call)
        except Exception as error:
            return call, ToolResult(tool=call.tool, ok=False, error=str(error))

    def _read_file(self, requested_path: str) -> ToolResult:
        path = resolve_workspace_file(self.workspace, requested_path)
        content = path.read_text(encoding="utf-8")
        if len(content.encode()) > MAX_FILE_BYTES:
            raise ValueError(f"file exceeds {MAX_FILE_BYTES} byte limit")
        return ToolResult(tool="read_file", ok=True, content=content)

    def _write_file(self, requested_path: str, content: str) -> ToolResult:
        if len(content.encode()) > MAX_FILE_BYTES:
            raise ValueError(f"content exceeds {MAX_FILE_BYTES} byte limit")
        path = resolve_workspace_file(self.workspace, requested_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return ToolResult(tool="write_file", ok=True, content=f"wrote {requested_path}")

    def _run_command(self, call: RunCommandCall) -> ToolResult:
        if call.command not in self.allowed_commands:
            raise ValueError(f"command is not allowed: {call.command}")
        args = list(call.args)
        if call.command == "node":
            for arg in args:
                if any(arg == flag or arg.startswith(f"{flag}=") for flag in FORBIDDEN_NODE_PERMISSION_ARGS):
                    raise ValueError(f"node permission override is not allowed: {arg}")
            permissions = ["--permission", f"--allow-fs-read={self.workspace}"]
            if self.node_fs_access == "read-write":
                permissions.append(f"--allow-fs-write={self.workspace}")
            args = permissions + args
        executable = shutil.which(call.command)
        if executable is None:
            raise ValueError(f"allowed command is not installed: {call.command}")
        try:
            completed = subprocess.run(
                [executable, *args], cwd=self.workspace, shell=False, text=True,
                capture_output=True, timeout=call.timeout_ms / 1000,
                env={"PATH": os.environ.get("PATH", "")}, check=False,
            )
            stdout, stderr = completed.stdout, completed.stderr
            if len(stdout.encode()) > MAX_OUTPUT_BYTES or len(stderr.encode()) > MAX_OUTPUT_BYTES:
                return ToolResult(tool="run_command", ok=False, stdout=stdout[:MAX_OUTPUT_BYTES], stderr=stderr[:MAX_OUTPUT_BYTES], error=f"command output exceeds {MAX_OUTPUT_BYTES} byte limit")
            return ToolResult(tool="run_command", ok=completed.returncode == 0, stdout=stdout, stderr=stderr, exitCode=completed.returncode)
        except subprocess.TimeoutExpired as error:
            return ToolResult(
                tool="run_command", ok=False,
                stdout=(error.stdout or "") if isinstance(error.stdout, str) else "",
                stderr=(error.stderr or "") if isinstance(error.stderr, str) else "",
                error=f"command timed out after {call.timeout_ms} ms",
            )

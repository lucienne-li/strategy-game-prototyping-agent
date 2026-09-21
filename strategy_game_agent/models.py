from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ReadFileCall(StrictModel):
    tool: Literal["read_file"]
    path: str = Field(min_length=1)


class WriteFileCall(StrictModel):
    tool: Literal["write_file"]
    path: str = Field(min_length=1)
    content: str


class RunCommandCall(StrictModel):
    tool: Literal["run_command"]
    command: str = Field(min_length=1)
    args: list[str]
    timeout_ms: int = Field(default=10_000, ge=1, le=30_000, alias="timeoutMs")


ToolCall = Annotated[Union[ReadFileCall, WriteFileCall, RunCommandCall], Field(discriminator="tool")]
TOOL_CALL_ADAPTER = TypeAdapter(ToolCall)


class ToolResult(StrictModel):
    tool: Literal["read_file", "write_file", "run_command", "unknown"]
    ok: bool
    content: str | None = None
    stdout: str | None = None
    stderr: str | None = None
    exit_code: int | None = Field(default=None, alias="exitCode")
    error: str | None = None


class AgentEvent(StrictModel):
    type: Literal["tool_call", "tool_result"]
    call: ToolCall | None = None
    result: ToolResult | None = None


class ModelContext(StrictModel):
    request: str
    iteration: int
    events: list[AgentEvent]


class ModelOutput(StrictModel):
    type: Literal["tool_call", "tool_calls", "final"]
    call: dict[str, Any] | None = None
    calls: list[dict[str, Any]] | None = None
    status: Literal["success", "failure"] | None = None
    message: str | None = None

    @classmethod
    def tool_call(cls, call: dict[str, Any]) -> "ModelOutput":
        return cls(type="tool_call", call=call)

    @classmethod
    def tool_calls(cls, calls: list[dict[str, Any]]) -> "ModelOutput":
        return cls(type="tool_calls", calls=calls)

    @classmethod
    def final(cls, status: Literal["success", "failure"], message: str) -> "ModelOutput":
        return cls(type="final", status=status, message=message)


class AgentRunResult(StrictModel):
    status: Literal["success", "failure", "max_iterations"]
    message: str
    iterations: int
    events: list[AgentEvent]

from __future__ import annotations

from typing import Protocol

from .models import AgentEvent, AgentRunResult, ModelContext, ModelOutput
from .runtime import ToolExecutor


class AgentModel(Protocol):
    def next(self, context: ModelContext) -> ModelOutput: ...


def run_agent(
    request: str,
    *,
    model: AgentModel,
    executor: ToolExecutor,
    max_iterations: int = 6,
    max_tool_calls_per_iteration: int = 8,
) -> AgentRunResult:
    if not isinstance(max_iterations, int) or max_iterations < 1:
        raise ValueError("max_iterations must be a positive integer")
    if not isinstance(max_tool_calls_per_iteration, int) or max_tool_calls_per_iteration < 1:
        raise ValueError("max_tool_calls_per_iteration must be a positive integer")
    events: list[AgentEvent] = []
    for iteration in range(1, max_iterations + 1):
        try:
            output = model.next(ModelContext(request=request, iteration=iteration, events=events))
        except Exception as error:
            return AgentRunResult(status="failure", message=f"model error: {error}", iterations=iteration, events=events)
        if output.type == "final":
            return AgentRunResult(status=output.status or "failure", message=output.message or "", iterations=iteration, events=events)
        calls = output.calls if output.type == "tool_calls" else [output.call]
        calls = [call for call in (calls or []) if call is not None]
        if not calls:
            events.append(AgentEvent(type="tool_result", result={"tool": "unknown", "ok": False, "error": "model returned an empty tool call batch"}))
            continue
        if len(calls) > max_tool_calls_per_iteration:
            events.append(AgentEvent(type="tool_result", result={"tool": "unknown", "ok": False, "error": f"model returned {len(calls)} tool calls; limit is {max_tool_calls_per_iteration} per iteration"}))
            continue
        for raw_call in calls:
            call, result = executor.execute(raw_call)
            if call is not None:
                events.append(AgentEvent(type="tool_call", call=call))
            events.append(AgentEvent(type="tool_result", result=result))
    return AgentRunResult(status="max_iterations", message=f"agent stopped after reaching the {max_iterations} iteration limit", iterations=max_iterations, events=events)


class FakeHelloAgentModel:
    def next(self, context: ModelContext) -> ModelOutput:
        results = [event.result for event in context.events if event.type == "tool_result" and event.result]
        if not results:
            return ModelOutput.tool_call({"tool": "write_file", "path": "hello-agent.js", "content": 'console.log("hello agent");\n'})
        if len(results) == 1:
            if not results[0].ok:
                return ModelOutput.final("failure", f"write failed: {results[0].error}")
            return ModelOutput.tool_call({"tool": "run_command", "command": "node", "args": ["hello-agent.js"]})
        last = results[-1]
        if last.ok and (last.stdout or "").strip() == "hello agent":
            return ModelOutput.final("success", "Created and verified hello-agent.js.")
        return ModelOutput.final("failure", f"verification failed: {last.error or last.stderr or 'unexpected output'}")

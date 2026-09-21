from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Generic, TypeVar

from .agent import AgentModel, run_agent
from .models import AgentRunResult
from .runtime import ToolExecutor


Evaluation = TypeVar("Evaluation", bound=dict[str, Any])


@dataclass
class RepairAttempt(Generic[Evaluation]):
    attempt: int
    phase: str
    request: str
    agent_result: AgentRunResult
    evaluation: Evaluation


@dataclass
class RepairRunResult(Generic[Evaluation]):
    status: str
    repairs_used: int
    attempts: list[RepairAttempt[Evaluation]]
    final_evaluation: Evaluation


def run_with_evaluator_repair(
    original_request: str,
    *,
    model: AgentModel,
    executor: ToolExecutor,
    evaluator: Callable[[], Evaluation],
    initial_request: str | None = None,
    max_repairs: int = 2,
    max_iterations_per_agent_run: int = 6,
    max_tool_calls_per_iteration: int = 8,
) -> RepairRunResult[Evaluation]:
    if not isinstance(max_repairs, int) or max_repairs < 0:
        raise ValueError("max_repairs must be a non-negative integer")
    request = initial_request or original_request
    attempts: list[RepairAttempt[Evaluation]] = []
    for index in range(max_repairs + 1):
        agent_result = run_agent(
            request, model=model, executor=executor,
            max_iterations=max_iterations_per_agent_run,
            max_tool_calls_per_iteration=max_tool_calls_per_iteration,
        )
        evaluation = evaluator()
        attempts.append(RepairAttempt(index + 1, "initial" if index == 0 else "repair", request, agent_result, evaluation))
        if evaluation.get("passed") is True:
            return RepairRunResult("success", index, attempts, evaluation)
        if index < max_repairs:
            request = "\n\n".join([
                "Continue working in the existing task workspace.",
                f"This is evaluator-guided repair {index + 1} of at most {max_repairs}.",
                "Inspect the existing files and fix the implementation so the original request passes.",
                "Do not modify or replace the external evaluator; it is outside your workspace.",
                "Original request:", original_request,
                "External evaluator result:", json.dumps(evaluation, indent=2),
                "Run the relevant allowed build or test command and inspect its Observation before finishing.",
            ])
    return RepairRunResult("repair_limit_reached", max_repairs, attempts, attempts[-1].evaluation)

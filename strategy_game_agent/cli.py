from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from .agent import FakeHelloAgentModel, run_agent
from .benchmark import MODEL_SETTINGS, TASKS, evaluate_task, prepare_workspace, run_benchmark
from .openai_adapter import OpenAIResponsesModel
from .repair import run_with_evaluator_repair
from .runtime import ToolExecutor


def main() -> None:
    parser = argparse.ArgumentParser(description="Python-first strategy game coding agent")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("demo")
    real = sub.add_parser("real-task"); real.add_argument("task_id")
    benchmark = sub.add_parser("benchmark"); benchmark.add_argument("--report", default="artifacts/agent-benchmark-v2/gpt-5.6.json")
    args = parser.parse_args()
    if args.command == "demo":
        workspace = Path(tempfile.mkdtemp(prefix="python-agent-demo-"))
        result = run_agent("Create hello-agent.js", model=FakeHelloAgentModel(), executor=ToolExecutor(workspace))
        print(result.model_dump_json(by_alias=True, indent=2)); return
    model = OpenAIResponsesModel.from_env(max_output_tokens=4096)
    if args.command == "benchmark":
        print(json.dumps(run_benchmark(model, model.model_name, report_path=args.report, model_settings=MODEL_SETTINGS["gpt"]), indent=2)); return
    task = next((item for item in TASKS if item.id == args.task_id), None)
    if task is None:
        raise SystemExit(f"unknown task: {args.task_id}")
    workspace = Path(tempfile.mkdtemp(prefix=f"python-agent-{task.id.lower()}-")); prepare_workspace(workspace, task)
    result = run_with_evaluator_repair(task.target_request, model=model, executor=ToolExecutor(workspace), evaluator=lambda: evaluate_task(workspace, task), initial_request=task.initial_request, max_repairs=1)
    print(json.dumps({"model": model.model_name, "workspace": str(workspace), "status": result.status, "repairsUsed": result.repairs_used, "finalEvaluation": result.final_evaluation, "attempts": [{"phase": item.phase, "agent": item.agent_result.model_dump(by_alias=True)} for item in result.attempts]}, indent=2))


if __name__ == "__main__":
    main()

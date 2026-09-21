from __future__ import annotations

import tempfile
import hashlib
import json
import unittest
from pathlib import Path

from strategy_game_agent.agent import FakeHelloAgentModel, run_agent
from strategy_game_agent.benchmark import TASKS
from strategy_game_agent.models import ModelContext, ModelOutput
from strategy_game_agent.openai_adapter import OpenAIResponsesModel
from strategy_game_agent.repair import run_with_evaluator_repair
from strategy_game_agent.runtime import ToolExecutor, resolve_workspace_file, validate_tool_call


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)

    def tearDown(self): self.temp.cleanup()

    def test_fake_model_end_to_end(self):
        result = run_agent("hello", model=FakeHelloAgentModel(), executor=ToolExecutor(self.root))
        self.assertEqual(result.status, "success"); self.assertEqual((self.root / "hello-agent.js").read_text(), 'console.log("hello agent");\n')

    def test_workspace_rejects_escape_and_symlink(self):
        with self.assertRaises(ValueError): resolve_workspace_file(self.root, "../outside")
        outside = Path(self.temp.name).parent / "outside-python-agent"; outside.mkdir(exist_ok=True)
        (self.root / "link").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError): resolve_workspace_file(self.root, "link/file")

    def test_pydantic_rejects_extra_and_bad_timeout(self):
        with self.assertRaises(ValueError): validate_tool_call({"tool":"read_file","path":"x","extra":1})
        with self.assertRaises(ValueError): validate_tool_call({"tool":"run_command","command":"node","args":[],"timeoutMs":30_001})

    def test_multiple_calls_are_ordered_and_failure_preserved(self):
        class Model:
            def next(self, context):
                if not context.events: return ModelOutput.tool_calls([{"tool":"write_file","path":"a.js","content":"console.log('a')"},{"tool":"run_command","command":"bad","args":[]}])
                return ModelOutput.final("success","done")
        result=run_agent("x",model=Model(),executor=ToolExecutor(self.root))
        tool_results=[e.result for e in result.events if e.result]
        self.assertTrue(tool_results[0].ok);self.assertFalse(tool_results[1].ok);self.assertIn("not allowed",tool_results[1].error)

    def test_tool_batch_limit(self):
        class Model:
            def next(self, context): return ModelOutput.tool_calls([{"tool":"read_file","path":"x"}]*9)
        result=run_agent("x",model=Model(),executor=ToolExecutor(self.root),max_iterations=1)
        self.assertEqual(result.status,"max_iterations");self.assertIn("limit is 8",result.events[0].result.error)

    def test_repair_feedback(self):
        class Model:
            def next(self, context):
                if not context.events: return ModelOutput.tool_call({"tool":"write_file","path":"x","content":"fixed" if "evaluator-guided" in context.request else "bad"})
                return ModelOutput.final("success","done")
        result=run_with_evaluator_repair("fix",model=Model(),executor=ToolExecutor(self.root),evaluator=lambda:{"passed":(self.root/"x").read_text()=="fixed"},max_repairs=1)
        self.assertEqual(result.status,"success");self.assertEqual(result.repairs_used,1)


class AdapterAndBenchmarkTests(unittest.TestCase):
    def test_openai_tool_call_parsing(self):
        model=OpenAIResponsesModel("test",transport=lambda body:{"output":[{"type":"function_call","name":"write_file","arguments":"{\"path\":\"x\",\"content\":\"y\"}"}]})
        output=model.next(ModelContext(request="x",iteration=1,events=[]))
        self.assertEqual(output.call["tool"],"write_file")

    def test_benchmark_contract(self):
        from collections import Counter
        self.assertEqual(len(TASKS),30)
        self.assertEqual(Counter(t.category for t in TASKS),{"game-logic":14,"project-browser-game":5,"code-generation":4,"code-modification":4,"repair-self-correction":3})
        self.assertEqual(Counter(t.difficulty for t in TASKS),{"D2":12,"D1":10,"D4":6,"D3":2})
        self.assertEqual(len({t.family_id for t in TASKS}),30)

    def test_python_benchmark_freeze_matches_catalog(self):
        root = Path(__file__).resolve().parents[1]
        manifest = json.loads((root / "evals/agent_benchmark_v2/freeze-manifest.json").read_text())
        catalog = root / "evals/agent_benchmark_v2/tasks.json"
        self.assertEqual(manifest["taskCount"], 30)
        self.assertEqual(manifest["tasksSha256"], hashlib.sha256(catalog.read_bytes()).hexdigest())


if __name__ == "__main__": unittest.main()

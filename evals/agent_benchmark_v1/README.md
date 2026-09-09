# Agent Benchmark v1

This directory freezes the final 30-task Agent Benchmark v1. The executable task requests and hidden checks live in `src/evaluation/agent-benchmark-v1.ts`; `tasks.json` is the reviewable catalog, `freeze-manifest.json` binds the catalog and evaluator/runtime source by SHA-256, and `freeze-manifest.sha256` identifies the complete manifest.

The Agent receives only the task request and a fresh temporary workspace. Evaluator code remains in the repository process, outside that workspace, and runs only after the Agent returns. All tasks use the same three tools (`read_file`, `write_file`, `run_command`), six iterations per Agent run, eight tool calls per iteration, and one evaluator-guided repair. Five D4 project tasks additionally use an external Playwright/Chromium visual evaluator.

Run the GPT-5.6 baseline only when API credit is available:

```bash
npm run eval:install-browser
OPENAI_MODEL=gpt-5.6 npm run eval:agent:v1:gpt
```

The report is written to `artifacts/agent-benchmark-v1/gpt-5.6-run.json`. Task failures are benchmark results, not runner failures; the command exits non-zero only when the benchmark itself cannot complete.

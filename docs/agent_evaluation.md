# Agent Evaluation — Benchmark v1

## 1. Evaluation goal

`Agent Benchmark v1` is the fixed end-to-end evaluation for the GPT-5.6 Agent, Qwen3-4B Base Agent, and Qwen3-4B SFT Agent. It measures whether the same Agent Runtime can turn a frozen request into externally verified code under the same execution and repair budgets. It does not use code similarity as a success criterion.

The benchmark contains 25 tasks:

| Category | Tasks | What it tests |
|---|---:|---|
| Code Generation | 4 | New single-file code, exports, exact output and boundary cases |
| Code Modification | 4 | Reading and correcting a seeded implementation without changing the contract |
| Game Logic | 12 | Card, tactics and tower-defense state transitions and invariants |
| Project-Level Browser Game | 2 | Multi-file Browser + TypeScript project, build artifact, DOM interaction and HTTP launch |
| Repair / Self-correction | 3 | Controlled first-attempt defect, evaluator JSON feedback and one correction attempt |

## 2. Execution boundary

Each task runs in a new temporary workspace. The Agent can access that workspace only through the existing `read_file`, `write_file`, and `run_command` tools. `ToolExecutor` canonicalizes paths, denies traversal outside the workspace, restricts commands to `node`, and applies the Node permission model.

Evaluator source, hidden assertions and benchmark definitions remain in the repository process outside the temporary workspace. They are never copied into the Agent workspace. The Agent receives the public task request, tool observations and—only after a failed attempt—the structured evaluator result. It cannot read or overwrite evaluator code.

## 3. Automatic acceptance

- **Single-file generation:** require a regular target file, successful Node import/execution, exact stdout where specified, and hidden functional assertions.
- **Modification:** place a deterministic failing seed in the workspace, then apply the same build and hidden behavior checks. Tests verify every frozen seed fails before modification.
- **Game logic:** import exported functions and test normal behavior, boundary cases, immutability and state transitions.
- **Browser projects:** require `index.html`, `src/game.ts`, `project.mjs`, and `dist/game.js`; require the build artifact to match source; import and test game logic; simulate DOM events; start the generated HTTP server with write permission limited to the task's `dist`; fetch the page and module.
- **Repair:** use a controlled initial request that creates a known evaluator-visible defect. After failure, pass the evaluator JSON to the same model in the existing workspace and allow one repair.

## 4. Frozen runtime budget

| Setting | Value |
|---|---:|
| Agent iterations per attempt | 6 |
| Tool calls per model turn | 8 |
| Derived maximum tool calls per attempt | 48 |
| Evaluator-guided repairs | 1 |
| Command timeout | 10 seconds |
| Allowed command | `node` |

The same task inputs, evaluator contracts, Agent Runtime, budgets and report schema must be used for GPT-5.6, Qwen3-4B Base and Qwen3-4B SFT. Base and SFT must additionally use identical Qwen decoding: greedy (`do_sample=false`), thinking disabled, and `max_new_tokens=4096`. GPT-5.6 uses provider-managed sampling, automatic tool choice and `max_output_tokens=4096`; this provider-specific setting is reported rather than falsely equated with local greedy decoding.

## 5. Metrics

All rates are macro counts over the 25 fixed tasks unless stated otherwise.

- **Task success rate:** final evaluator passes / all tasks.
- **First-pass success rate:** evaluator passes after the initial Agent attempt / all tasks.
- **Build pass rate:** final target imports/builds; project tasks also require source/build-artifact agreement / all tasks.
- **Functional pass rate:** final hidden behavior checks pass; browser tasks also require DOM and HTTP launch / all tasks.
- **Repair success rate:** tasks that pass after evaluator feedback / tasks that entered a repair attempt. If no task enters repair, report `null`.
- **Average repairs used:** total repair attempts consumed / all tasks.
- **Average Agent iterations:** total model iterations across initial and repair attempts / all tasks.
- **Tool-call failure rate:** failed validation/execution observations / all tool-result observations.

Per-task output also records category, family, evaluator ID, attempt phase, Agent status, tool order, evaluator result, repairs used and whether the repair limit was reached.

The report includes both the overall summary and the same metrics by category. The three Repair/Self-correction tasks intentionally request a controlled first-attempt defect, so their first-pass rate is expected to be low by construction and must not be interpreted without the category breakdown.

## 6. Family isolation and freeze

Every benchmark task has a unique synthetic family under `agent-benchmark-v1:*`. Regression tests compare these families against all repository families in the fixed 440-unit data pool and require zero overlap. Benchmark task code is authored independently and is not generated from a training repository.

`evals/agent_benchmark_v1/freeze-manifest.json` records all task IDs, category counts, evaluator version, the Agent Runtime commit, model settings, budgets and SHA-256 hashes of executable task/evaluator sources. Any contract change requires a new benchmark version rather than silently editing v1 results.

## 7. Running and interpreting the GPT baseline

```bash
OPENAI_MODEL=gpt-5.6 npm run eval:agent:v1:gpt
```

The full report is saved under `artifacts/agent-benchmark-v1/`. Task failures remain in the report and do not make the process fail; a non-zero exit means the benchmark runner itself could not complete.

Historical real-model runs exist for the equivalent B1, B2, B3, B4 and B4-REPAIR contracts, and all five passed (B4-REPAIR used one repair). They cover 5 of the 25 v1 contracts, but they are not reported as a formal v1 baseline because they were executed separately before this freeze. A complete GPT-5.6 run is still required for the baseline; no result is fabricated when API access or credit is unavailable.

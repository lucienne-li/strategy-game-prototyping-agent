# Agent Evaluation — Benchmark v1

## 1. Evaluation goal

`Agent Benchmark v1` is the fixed end-to-end evaluation for the GPT-5.6 Agent, Qwen3-4B Base Agent, and Qwen3-4B SFT Agent. It measures whether the same Agent Runtime can turn a frozen request into externally verified code under the same execution and repair budgets. It does not use code similarity as a success criterion.

The final v1 freeze contains 30 tasks:

| Category | Tasks | What it tests |
|---|---:|---|
| Code Generation | 4 | New single-file code, exports, exact output and boundary cases |
| Code Modification | 4 | Reading and correcting a seeded implementation without changing the contract |
| Game Logic | 14 | Card, tactics and tower-defense state transitions, including two genuine multi-system tasks |
| Project-Level Browser Game | 5 | Multi-file Browser + TypeScript project, build, logic, DOM, HTTP launch and real browser interaction |
| Repair / Self-correction | 3 | Controlled first-attempt defect, evaluator JSON feedback and one correction attempt |

## 2. Execution boundary

Each task runs in a new temporary workspace. The Agent can access that workspace only through the existing `read_file`, `write_file`, and `run_command` tools. `ToolExecutor` canonicalizes paths, denies traversal outside the workspace, restricts commands to `node`, and applies the Node permission model.

Evaluator source, hidden assertions and benchmark definitions remain in the repository process outside the temporary workspace. They are never copied into the Agent workspace. The Agent receives the public task request, tool observations and—only after a failed attempt—the structured evaluator result. It cannot read or overwrite evaluator code.

## 3. Automatic acceptance

- **Single-file generation:** require a regular target file, successful Node import/execution, exact stdout where specified, and hidden functional assertions.
- **Modification:** place a deterministic failing seed in the workspace, then apply the same build and hidden behavior checks. Tests verify every frozen seed fails before modification.
- **Game logic:** import exported functions and test normal behavior, boundary cases, immutability and state transitions.
- **Browser projects:** require `index.html`, `src/game.ts`, `project.mjs`, and `dist/game.js`; require the build artifact to match source; import and test game logic; simulate DOM events; start the generated HTTP server with write permission limited to the task's `dist`; fetch the page and module; then use headless Chromium through Playwright for visual and interaction checks.
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

All rates are macro counts over the 30 fixed tasks unless stated otherwise.

- **Task success rate:** final evaluator passes / all tasks.
- **First-pass success rate:** evaluator passes after the initial Agent attempt / all tasks.
- **Build pass rate:** final target imports/builds; project tasks also require source/build-artifact agreement / all tasks.
- **Functional pass rate:** final hidden behavior checks pass; browser tasks also require DOM and HTTP launch / all tasks.
- **Visual pass rate:** Playwright render and interaction checks pass / tasks with a visual contract. It is `null` when a slice contains no visual task.
- **Repair success rate:** tasks that pass after evaluator feedback / tasks that entered a repair attempt. If no task enters repair, report `null`.
- **Average repairs used:** total repair attempts consumed / all tasks.
- **Average Agent iterations:** total model iterations across initial and repair attempts / all tasks.
- **Tool-call failure rate:** failed validation/execution observations / all tool-result observations.

Per-task output also records category, family, evaluator ID, attempt phase, Agent status, tool order, evaluator result, repairs used and whether the repair limit was reached.

The report includes the overall summary and the same metrics by category and difficulty. The three Repair/Self-correction tasks intentionally request a controlled first-attempt defect, so their first-pass rate is expected to be low by construction and must not be interpreted without the category breakdown.

## 6. Difficulty and project contracts

Difficulty reflects implementation dependencies, not file length or a desired quota:

| Difficulty | Definition | Frozen count |
|---|---|---:|
| D1 | One isolated mechanism or correction | 10 |
| D2 | A local subsystem with guards/state invariants | 12 |
| D3 | Multiple interacting gameplay systems | 2 |
| D4 | A multi-file runnable project, including the project-level repair case | 6 |

The five Project-Level tasks are Card Combat, Turn-based Tactics, Tower Defense, Deckbuilder Draw, and Resource Management. Each starts from a natural-language request and must create a multi-file project, build it, serve it, pass hidden functional checks, render in Chromium, expose its required HUD/control elements within a 1280×720 viewport, avoid horizontal/key-element overflow, and update frozen UI state after one click.

The visual evaluator records a screenshot SHA-256 as execution evidence, but does not use pixel matching or a VLM judge. “Non-blank” is determined from rendered visible content and required elements, not source-text presence alone. Install the pinned browser once with `npm run eval:install-browser`.

## 7. Family isolation and freeze

Every benchmark task has a unique synthetic family under `agent-benchmark-v1:*`. Regression tests compare these families against all repository families in the fixed 440-unit data pool and require zero overlap. Benchmark task code is authored independently and is not generated from a training repository.

`evals/agent_benchmark_v1/freeze-manifest.json` records all task IDs, category/difficulty counts, evaluator version, the Agent Runtime commit, model settings, budgets and SHA-256 hashes of executable task/evaluator sources. `freeze-manifest.sha256` is the identity of this final v1 freeze. From this point, any task, request, evaluator or budget change requires a new benchmark version rather than silently editing v1 results.

## 8. Running and interpreting the GPT baseline

```bash
npm run eval:install-browser
OPENAI_MODEL=gpt-5.6 npm run eval:agent:v1:gpt
```

The full report is saved under `artifacts/agent-benchmark-v1/`. Task failures remain in the report and do not make the process fail; a non-zero exit means the benchmark runner itself could not complete.

Historical real-model runs exist for the equivalent B1, B2, B3, B4 and B4-REPAIR contracts, and all five passed (B4-REPAIR used one repair). They cover 5 of the 30 final contracts, but predate the final Playwright requirement and are not a formal v1 baseline. A complete GPT-5.6 run is still required; no result is fabricated when API access, browser installation or credit is unavailable.

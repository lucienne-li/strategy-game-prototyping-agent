# M4 B4 Real-Model Run

## First live run

- **Evidence source:** repository owner local run
- **Model:** `gpt-5.6`
- **Agent status:** `failure`
- **Agent iterations:** `2`
- **Primary error:** `model returned multiple tool calls; M2 supports one call per iteration`
- **External evaluator:** failed later with `ENOENT src/game.ts`

This is classified as an Agent Runtime protocol failure. The model returned a valid batch-shaped action for a multi-file project, but the M2 Adapter rejected more than one Tool Call before the Agent could execute the batch. The missing `src/game.ts` was a downstream consequence of that early termination, not an independent game-code result.

## Runtime fix

- `ModelOutput` now supports either one Tool Call or an ordered Tool Call batch;
- the OpenAI Adapter preserves the order of function calls returned by the model;
- the Agent Loop executes accepted calls sequentially and records a Tool Call event and Observation for every valid call;
- a failed call retains its real error and does not silently skip the remaining accepted calls;
- the default limit is 8 Tool Calls per model iteration;
- an over-limit batch is not partially executed; the model receives a failure Observation and may respond on the next iteration;
- the existing maximum of 6 model iterations remains unchanged.

## Second live run

- **Evidence source:** repository owner local run
- **Model:** not repeated in the reported rerun summary; the preceding run used `gpt-5.6`
- **Agent status:** `success`
- **Agent iterations:** `3`
- **Tool Calls:** `write_file` → `write_file` → `write_file` → `run_command`
- **Files valid:** `true`
- **Build artifact matches:** `true`
- **Logic passed:** `true`
- **UI passed:** `true`
- **Launch passed:** `false`
- **Launch error:** `ERR_ACCESS_DENIED`, `FileSystemWrite`, resource under the task workspace's `dist/`

This run validates the ordered multi-Tool Runtime fix and the generated project through build, logic, and UI evaluation. Launch failed because the generated `project.mjs serve` rebuilds its existing `dist/` output before starting, while the launch subprocess had read-only workspace permission. This is classified as evaluator infrastructure failure, not an Agent or game-logic failure.

## Launch permission fix

- the behavior evaluator remains read-only;
- B1–B3 evaluator permissions are unchanged;
- the B4 launch subprocess may read only the current canonical task workspace;
- it may write only the existing canonical `<workspace>/dist/` directory;
- `dist/` must be a real directory directly under the workspace, not a symlink;
- writes to the workspace root, parent directory, Repository, or evaluator files remain denied.

## Status after launch fix

The deterministic B4 contract, multi-Tool Runtime support, minimally writable launch evaluator, and real-model CLI are implemented.

## Final successful live run

- **Evidence source:** repository owner local run
- **Model:** not repeated in the reported final-run summary
- **Agent status:** `success`
- **Agent iterations:** `3`
- **Tool Calls:** `write_file` → `write_file` → `write_file` → `run_command`
- **External evaluation:** `passed = true`
- **Files valid:** `true`
- **Build artifact matches:** `true`
- **Logic passed:** `true`
- **UI passed:** `true`
- **Launch passed:** `true`
- **Evaluator exit code:** `0`

This run completes M4 acceptance. Success is based on the independent external evaluator, not the Agent's final text.

## Run

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6" # optional; this is the current default
npm run b4:real
```

The command retains the generated temporary workspace and prints its path in `workspace`. If `evaluation.passed` is true, run the generated project with:

```bash
cd "<workspace from the JSON output>"
node project.mjs serve
```

Then open `http://127.0.0.1:4173` and click **Strike**.

## Recorded evidence fields

- model;
- Agent status and iterations;
- ordered Tool Calls;
- external evaluator fields for files, build artifact, logic, UI, and launch;
- final workspace path;
- any stderr or failure message.

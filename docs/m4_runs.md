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

## Status after fix

The deterministic B4 contract, multi-Tool Runtime support, and real-model CLI are implemented. The first live run failed for the Runtime reason above; a post-fix live rerun has not yet been claimed.

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

## Record after the live run

- model;
- Agent status and iterations;
- ordered Tool Calls;
- external evaluator fields for files, build artifact, logic, UI, and launch;
- final workspace path;
- any stderr or failure message.

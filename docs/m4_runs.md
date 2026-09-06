# M4 B4 Real-Model Run

## Status

The deterministic B4 contract and real-model CLI are implemented. A live model result has not been claimed in this branch because the current execution environment was not assumed to contain the user's API key.

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

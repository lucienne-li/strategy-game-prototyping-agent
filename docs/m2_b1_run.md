# M2 B1 Real-Model Run

## Current status

- **Status:** BLOCKED — live API request not executed
- **Adapter:** OpenAI Responses API
- **Configured default model:** `gpt-5.6`
- **Attempt date:** 2026-08-29
- **Error:** `OPENAI_API_KEY is required`

The current execution environment does not expose `OPENAI_API_KEY`. No model request was sent, so this is not reported as a real-model B1 result.

## Deterministic contract evidence

The mocked HTTP contract test exercises the same Adapter, Agent Loop, ToolExecutor and external evaluator:

- Agent iterations: 3
- Tool Call order: `write_file` → `run_command`
- External B1 evaluation: passed
- Expected stdout: `hello agent`
- Expected stderr: empty
- Expected exit code: 0

This evidence validates the local integration but does not substitute for the required live model run.

## Live run command

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6"
npm run b1:real
```

After a live run, replace the blocked status with the exact model returned/configured, Agent iterations, ordered Tool Calls, final external evaluation and any error output.

# M2 B1 Real-Model Run

## Current status

- **Status:** PASSED — live API run completed locally
- **Adapter:** OpenAI Responses API
- **Model:** `gpt-5.6`
- **Reported date:** 2026-09-06
- **Agent status:** `success`
- **Agent iterations:** 3
- **Tool Call order:** `write_file` → `run_command`
- **External evaluator:** `passed = true`

The live run was executed by the repository owner in a local environment with `OPENAI_API_KEY` configured. No API Key or raw environment data was committed.

## Live evaluation result

- Generated file: `hello-agent.ts`
- stdout: `hello agent`
- stderr: empty
- exit code: 0
- External evaluation: passed

This satisfies the M2 B1 acceptance contract. The final result comes from the independent evaluator rather than the model's own success message.

## Deterministic contract evidence

The mocked HTTP contract test exercises the same Adapter, Agent Loop, ToolExecutor and external evaluator:

- Agent iterations: 3
- Tool Call order: `write_file` → `run_command`
- External B1 evaluation: passed
- Expected stdout: `hello agent`
- Expected stderr: empty
- Expected exit code: 0

This deterministic evidence remains as a regression test for the live path.

## Live run command

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6"
npm run b1:real
```

Future repeated runs should record the same fields and preserve failures rather than replacing them with model-reported success.

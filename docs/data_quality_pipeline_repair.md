# Data Quality Pipeline Repair

## Status

`IMPLEMENTED / STRONG-MODEL RUN PENDING`

Qwen3-4B formal training is paused. This repair does not add repositories or code units; it reprocesses the fixed 440-unit pool. The current execution environment does not expose `OPENAI_API_KEY`, so no strong-model output, accepted count, or rejection distribution is fabricated in this record.

## Changes

| Failure mode | quality-v2 control |
|---|---|
| 80-token truncation | Strict JSON response, 512 output tokens, completion required, retry then `GENERATION_FAILED` |
| Missing or vague scope | Exact target file/symbol plus behavior, constraints and required-context arrays |
| Instruction/code mismatch | Deterministic pre-gates followed by independent `gpt-5.6` pass/fail review |
| Granularity mismatch | G1/G2 scope checks and strong-review criterion |
| Missing context | Required context must be a subset of declared provided symbols; reviewer checks semantic solvability |
| Reviewer false acceptance | Old 0.5B labels are ignored; only quality-v2 reviewer records bound to target SHA-256 are valid |
| Build-only evidence | Unit behavior is separately marked `pass`, `fail`, or `not_eligible`; build success is not called a behavior pass |

Target validation has been executed for all 440 units: 438 pass the conservative structural check, two fail due to unclosed delimiters, and one safe/self-contained unit passes the narrow deterministic behavior harness. The remaining 439 are `not_eligible` for local execution and must rely on deterministic scope gates plus strong semantic review.

## Real run

From a checkout containing the committed fixed-unit artifacts:

```bash
export OPENAI_API_KEY="..."
export DATA_GENERATOR_MODEL="gpt-5.6"
export DATA_REVIEWER_MODEL="gpt-5.6"
npm run data:scale:quality-repair
```

The stages checkpoint to:

- `instructions-v2.jsonl`
- `generation-failures-v2.jsonl`
- `target-validation-v2.jsonl`
- `reviews-v2.jsonl`
- `accepted.jsonl`
- `rejected.jsonl`

After completion, rerun the Python and Node suites, inspect the machine-produced rejection summary, create a quality-v2 freeze manifest, and only then re-enable formal training.

# Small-Scale SFT Evaluation Run

## Scope

This run checks for an initial direction of change only. Twenty-four samples and six holdout tasks are too small for statistical significance or a general model-quality claim.

## Training

| Field | Value |
|---|---|
| Base model | `Qwen/Qwen2.5-Coder-0.5B-Instruct` |
| Device | CPU, PyTorch `2.8.0+cpu` |
| Accepted samples | 24 across 5 repository families |
| Epochs / steps | 2 / 48 |
| Context length | 512 |
| Learning rate | `2e-4` |
| Seed | 42 |
| Loss masking | Assistant response only |
| LoRA | r=4, alpha=8, dropout=0, `q_proj` + `v_proj` |
| Trainable parameters | 270,336 |
| Epoch mean loss | 0.9432 → 0.8163 |
| First / last step loss | 1.2834 → 0.4712 |
| Training / total time | 139.0 s / 153.7 s |
| Checkpoint reload | Passed; deterministic generation returned non-empty text |

The checkpoint is written to ignored local path `artifacts/sft-evaluation/checkpoint-final`; model weights are not committed.

## Holdout contract

Six project-authored tasks cover exact stdout, modifying an existing function, card state transition, orthogonal grid neighbors, tower target selection, and circular turn order. Their `benchmark:original:*` family IDs have zero overlap with all five training repository family IDs. Both variants used:

- the same `runAgent`, `ToolExecutor`, three tools, hidden external evaluators, and evaluator-feedback loop;
- maximum 4 model iterations per Agent run;
- maximum 1 evaluator repair;
- greedy generation with 512 new-token limit;
- one deterministic run per task.

The local-model adapter uses a deterministic read/write/run scaffold and asks Base or SFT only for the complete TypeScript file. This keeps tool policy identical and isolates code generation, but it is not equivalent to evaluating each model's native tool-calling skill.

## Base vs SFT result

| Metric | Base | SFT |
|---|---:|---:|
| Final task success | 2/6 (33.3%) | 3/6 (50.0%) |
| Build pass | 6/6 (100%) | 6/6 (100%) |
| Functional pass | 2/6 (33.3%) | 3/6 (50.0%) |
| First-pass success | 2/6 (33.3%) | 3/6 (50.0%) |
| Tasks using a repair | 4/6 | 3/6 |
| Failed after repair limit | 4/6 | 3/6 |

Per-task final result:

| Task | Base | SFT |
|---|---|---|
| H1 exact `hello agent` output | Pass | Pass |
| H2 repair existing `add` | Pass | Pass |
| H3 immutable card Strike | Fail | Fail |
| H4 orthogonal grid neighbors | Fail | Pass |
| H5 nearest eligible tower target | Fail | Fail |
| H6 circular turn/round update | Fail | Fail |

The observed difference is +1/6 tasks for SFT, caused by H4 passing on the first attempt. This is an initial positive signal, not evidence that SFT broadly improves the model. Failures also show the 0.5B model often emits executable but contract-incomplete code; one repair did not reliably correct missing exports or semantic errors.

## Reproduction

```bash
.venv/bin/python -m training.sft_evaluation.train
npm run sft:evaluate
```

The training and full comparison reports are written under ignored `artifacts/sft-evaluation/`. Repeating the comparison can vary if software/model artifacts change; this recorded run used greedy decoding but only a single run per task.

## Scale readiness

The current pipeline is adequate for another curated 20–50 sample iteration. It is not yet ready for 500, 2,000, or 20,000 accepted samples without the following gates:

1. automated repository discovery, commit pinning, license evidence, dependency/build sandboxing, and failure queues;
2. AST/symbol-based code-unit extraction instead of hand-authored line ranges;
3. a stronger inverse-instruction generator plus calibrated independent review and sampled human double review;
4. scalable clone/fork/repository-family and code near-duplicate detection before splitting;
5. immutable dataset versions, cost/token/time telemetry, resumable jobs, and benchmark contamination checks.

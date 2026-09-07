# SFT Smoke Test Run

## Scope

This run verifies only the local training chain: accepted JSONL loading, Qwen chat-template rendering, LoRA optimization, adapter checkpoint saving, reload and generation. It is not evidence that SFT improves game-code generation.

## Environment and configuration

| Field | Value |
|---|---|
| Base model | `Qwen/Qwen2.5-Coder-0.5B-Instruct` |
| Model license | Apache-2.0 |
| Base parameters | 494,032,768 |
| Device | CPU; no GPU available |
| PyTorch | `2.8.0+cpu` |
| Loaded accepted samples | 7 |
| Optimization sample | `pilot-pazaak-hand-003` repeated for the smoke test |
| Steps | 3 |
| Sequence limit | 256 tokens |
| Optimizer | AdamW |
| Learning rate | `5e-4` |
| Seed | 42 |
| LoRA | r=4, alpha=8, dropout=0; `q_proj`, `v_proj` |
| Trainable parameters | 270,336 |

All seven records were parsed, quality-gate checked and rendered through the model's chat template. To make an optimization signal observable with only three CPU steps, the shortest record was deliberately repeated. Loss applies to the full rendered sequence; response-only masking is deferred until a real training experiment.

## Actual result

| Check | Result |
|---|---|
| Loss | `2.7908306 → 2.7337983 → 2.6705830` |
| Loss finite and decreased | Yes |
| Optimization time | 9.77 seconds |
| End-to-end time | 27.50 seconds |
| Adapter checkpoint | `artifacts/sft-smoke/checkpoint-final` |
| Checkpoint reload | Succeeded |
| Generation after reload | Succeeded |
| Generated prefix | `Certainly! Below is a simple TypeScript function named add` |

The ignored checkpoint directory is approximately 17 MiB including adapter and tokenizer files. The LoRA adapter weights are approximately 1.1 MiB. Generated model files are not committed.

## Reproduction

Follow `training/README.md`, then run:

```bash
.venv/bin/python -m unittest discover -s tests_py -p 'test_*.py'
.venv/bin/python -m training.sft_smoke.train
```

The machine-readable result is written to ignored `artifacts/sft-smoke/run.json`.

## Interpretation

The technical chain passed. The decreasing loss is expected overfitting on one repeated sample and must not be reported as model-quality improvement. Before a formal Base-vs-SFT comparison, expand to 20–50 independently reviewed samples, define repository-family train/evaluation separation, and train over the full selected set.

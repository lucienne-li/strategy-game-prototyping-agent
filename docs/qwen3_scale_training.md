# Qwen3-4B Scale Training and Evaluation

## Frozen contract

- Base model: `Qwen/Qwen3-4B`
- Training method: QLoRA by default (LoRA is available by omitting `--qlora`)
- Dataset: `data_pipeline/scale/accepted.jsonl`
- Samples: 334
- Epochs: 1
- Maximum sequence length: 1,024
- Learning rate: 2e-4
- Gradient accumulation: 8
- LoRA: rank 8, alpha 16, dropout 0.05
- Loss: assistant-response-only; user and template prompt tokens are masked
- Holdout: 24 project-authored tasks with repository families disjoint from training
- Evaluation budget: 4 Agent iterations, 1 repair, 8 tools per iteration, greedy 512-token generation

## Cloud GPU commands

```bash
uv venv .venv
uv pip install --python .venv/bin/python -r training/requirements-scale.txt
npm install
npm test
npm run sft:scale:train
npm run sft:scale:evaluate
```

Training writes the adapter and reload check to `artifacts/sft-scale/checkpoint-final` and `artifacts/sft-scale/train-run.json`. Evaluation writes per-task Base/SFT traces and aggregate inputs to `artifacts/sft-scale/comparison-run.json`.

## Actual status

Not run in this workspace: CUDA is unavailable (`cuda_available=false`, zero devices). Consequently loss, training duration, checkpoint reload and Base-vs-SFT metrics are pending. This is an explicit infrastructure boundary, not a failed model experiment; no result has been fabricated.

Before accepting a future result, verify that Base and SFT records name the same `Qwen/Qwen3-4B` base, contain all 24 task IDs, use identical budgets, and report success, build pass, functional pass, first-pass success and repairs used for every task.

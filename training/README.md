# Minimal SFT Smoke Test

This isolated Python path verifies JSONL loading, Qwen chat-template rendering, CPU LoRA optimization, adapter checkpoint saving, reload and one generation. It is not connected to the Online Agent Runtime and is not an effectiveness experiment.

Create an ignored virtual environment and install CPU PyTorch plus the two pinned training dependencies:

```bash
uv venv .venv
uv pip install --python .venv/bin/python 'torch==2.8.0+cpu' --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv/bin/python -r training/requirements-smoke.txt
```

Run loader tests and the smoke test:

```bash
.venv/bin/python -m unittest discover -s tests_py -p 'test_*.py'
.venv/bin/python -m training.sft_smoke.train
```

The default base is `Qwen/Qwen2.5-Coder-0.5B-Instruct`. Generated checkpoints and `run.json` are written under ignored `artifacts/sft-smoke/`; do not commit model weights.

## Small-scale comparison

The follow-up experiment consumes all accepted v2 records, masks user/prompt tokens from loss, trains two CPU LoRA epochs, reloads the adapter, then compares Base and SFT under the same six external-evaluator tasks:

```bash
.venv/bin/python -m training.sft_evaluation.train
npm run sft:evaluate
```

Outputs are written to ignored `artifacts/sft-evaluation/`. The comparison uses the existing Agent loop, restricted Executor and evaluator repair wrapper. A deterministic adapter scaffold handles read/write/run sequencing while the local Qwen worker supplies only the TypeScript contents; this experiment therefore measures code generation under the Runtime, not native local-model tool calling.

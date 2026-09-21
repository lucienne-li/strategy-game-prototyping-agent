# Final experiment runbook

## Local Mac: generate Data Pipeline v3

```bash
git switch feature/final-sft
python3 -m venv .venv
.venv/bin/python -m pip install -e .
export OPENAI_API_KEY="..."
export V3_CHECKOUT_ROOT="$PWD/.data-v3-checkouts"
export V3_WORKERS=1
.venv/bin/python -m data_pipeline.v3.run
```

The command resumes completed generation/review records and keeps API failures separate from quality rejects. Inspect `data_pipeline/v3/summary.json`, `rejected.jsonl`, and `candidate-manifest.json`; rerun the same command after 429/incomplete failures.

## Freeze after confirming the candidate result

```bash
.venv/bin/python -m data_pipeline.v3.freeze --confirm
.venv/bin/python -m data_pipeline.v3.verify_freeze
git add data_pipeline/v3/accepted.jsonl data_pipeline/v3/rejected.jsonl data_pipeline/v3/summary.json \
  data_pipeline/v3/candidate-manifest.json data_pipeline/v3/freeze-manifest.json data_pipeline/v3/freeze-manifest.sha256
git commit -m "data: freeze final SFT dataset v3"
git push origin feature/final-sft
```

Freeze fails unless there are 2,500–3,500 accepted samples, no unresolved API failures, every quality-v2 gate passes, and Agent Benchmark v1 families remain isolated.

## RunPod setup

Use a 24 GB or larger NVIDIA GPU, at least 40 GB free disk, and a PyTorch CUDA image.

```bash
git clone https://github.com/lucienne-li/strategy-game-prototyping-agent.git
cd strategy-game-prototyping-agent
git switch feature/final-sft
python -m venv --system-site-packages .venv
.venv/bin/pip install -r training/requirements-scale.txt
.venv/bin/python -m pip install -e '.[browser]'
.venv/bin/python -m playwright install --with-deps chromium
export HF_TOKEN="..."  # only if Hugging Face requires authentication
```

## Train and evaluate

```bash
.venv/bin/python -m data_pipeline.v3.verify_freeze
.venv/bin/python -m training.final.train
.venv/bin/python -m strategy_game_agent.final_evaluation
```

Training writes config, loss, reload verification and checkpoint under `artifacts/final-sft/`. Python evaluation uses Agent Benchmark v2 and writes to `artifacts/final-sft/base-vs-sft.json`; historical v1 scores are not reused. Node 24+ is still needed to execute generated browser projects, not to run the Agent itself. Complete Python baseline and real-browser validation before treating the comparison as a formal result.

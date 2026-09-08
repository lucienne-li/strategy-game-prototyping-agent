#!/usr/bin/env bash
set -euo pipefail

if [[ ! -x .venv/bin/python ]]; then
  echo "missing .venv; install training/requirements-scale.txt first" >&2
  exit 2
fi

.venv/bin/python - <<'PY'
import torch
if not torch.cuda.is_available():
    raise SystemExit("CUDA GPU is required for the frozen Qwen3-4B experiment")
print({"gpu": torch.cuda.get_device_name(0), "bf16": torch.cuda.is_bf16_supported()})
PY

npm ci
npm test
.venv/bin/python -m unittest discover -s tests_py -p 'test_*.py'
npm run sft:scale:verify
npm run sft:scale:train
npm run sft:scale:evaluate

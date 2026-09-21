# Python training entry points

训练、模型 worker 和评测编排均使用 Python。训练答案中的 TypeScript 是游戏代码数据，浏览器产物仍由 Node/Chromium 执行。

## CPU smoke test

```bash
python3 -m venv .venv
.venv/bin/python -m pip install torch -r training/requirements-smoke.txt
.venv/bin/python -m training.sft_smoke.train
```

基座为 `Qwen/Qwen2.5-Coder-0.5B-Instruct`，输出在 `artifacts/sft-smoke/`。这是 loader、LoRA、保存和重载检查，不是正式效果实验。

## Qwen3-4B 正式实验（待真实运行）

环境与完整命令见 [运行说明](../docs/final_experiment_runbook.md)。仅在确认并冻结数据后运行：

```bash
.venv/bin/python -m training.final.train
.venv/bin/python -m strategy_game_agent.final_evaluation
```

使用同一个 Python Agent Runtime 和 Benchmark v2 比较 Base 与 SFT。结果保存在 `artifacts/final-sft/`，不提交模型权重。没有真实 loss、checkpoint 重载和逐题结果时，不声称训练或对比已完成。

## 历史实验

`sft_evaluation/` 与 `sft_scale/` 保留早期训练逻辑；对应历史报告见 `docs/sft_evaluation_run.md`。旧 TypeScript Runtime 的六题或二十四题评测入口已移除，不能将当前三十题 Python 评测结果记成旧实验结果。

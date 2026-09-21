# Strategy Game Prototyping Agent

这是一个 Python-first 的策略游戏原型 Coding Agent。用户给出自然语言玩法规则，Agent 通过模型、受限工具和外部评测器生成、运行并修复可编辑的浏览器游戏项目。

项目核心实现使用 Python：Agent Loop、Pydantic Tool Schema、OpenAI/本地模型适配、工作区隔离、External Evaluator、Repair Loop、Benchmark 编排、数据处理和训练入口。Node 与 JavaScript 只出现在浏览器交付物的运行边界；训练数据可保留真实开源仓库中的 TypeScript 目标代码。

## 当前状态

- Python Runtime 支持 `read_file`、`write_file`、`run_command`，每轮顺序执行最多 8 个 Tool Calls；
- 文件路径限制在独立任务工作区，命令不经过 shell，Node 子进程启用 permission model；
- OpenAI Responses Adapter、Fake Model、本地 Qwen worker 与 evaluator-feedback repair loop 已迁移到 Python；
- Python External Evaluator 覆盖单文件行为、项目 build/launch、DOM 合约和 Playwright 视觉交互；
- 原 Agent Benchmark v1 保留为 TypeScript Runtime 的历史冻结版本；Python Runtime 使用 30-task Benchmark v2；
- 数据抽取、target validation、quality pipeline、SFT/QLoRA 脚本均由 Python 编排；
- 已有实验结果不因代码迁移自动继承，Benchmark v2 需要重新跑模型 baseline。

## 安装

需要 Python 3.11+。Node 24+ 只用于执行 Agent 生成的 JavaScript 项目和 evaluator；浏览器评测还需要 Chromium。

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-runtime.txt
.venv/bin/python -m playwright install chromium
```

## 运行

```bash
.venv/bin/python -m strategy_game_agent.cli demo
.venv/bin/python -m unittest discover -s tests_py -p 'test_*.py'

export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6"  # 可选
.venv/bin/python -m strategy_game_agent.cli real-task ABV2-CG-01
.venv/bin/python -m strategy_game_agent.cli benchmark
```

兼容原工作流的 `npm run demo`、`npm test`、`npm run b1:real` 等别名仍保留，但它们现在只调用 Python 模块，不再编译 TypeScript Agent 源码。

## 主要目录

- `strategy_game_agent/`：Python Agent Runtime、模型、工具、repair 和 evaluator；
- `tests_py/`：Python 单元与集成测试；
- `evals/agent_benchmark_v1/`：历史冻结 Benchmark；
- `evals/agent_benchmark_v2/`：Python-first Benchmark freeze；
- `data_pipeline/`：开源代码筛选、抽取、反向 instruction 与质量检查；
- `training/`：小模型 smoke、LoRA/QLoRA 和本地模型 worker；
- `experiments/runtime-selection/`：早期 Godot 与 Browser 技术栈实验。

架构边界见 [ARCHITECTURE.md](ARCHITECTURE.md)，完整项目复盘见 [docs/project_summary.md](docs/project_summary.md)，当前任务见 [TASKS.md](TASKS.md)。

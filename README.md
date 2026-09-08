# Strategy Game Prototyping Agent

一个面向独立游戏开发者、游戏设计师、游戏开发学生和 Game Jam 团队的策略游戏快速原型 Coding Agent。

本项目希望缩短以下路径：

> 自然语言玩法规则 → 结构化规格 → 开发计划 → 可运行原型 → 自动测试 → 迭代修复 → 可编辑源码项目

本项目不承诺通过一句话生成可商业发布的完整游戏。第一阶段关注可运行、可测试、可继续修改的玩法原型。

## 当前状态

项目处于 **M8.1：修复 Data Quality Pipeline；Qwen3-4B 正式训练暂停**。

- 已用确定性 Fake Model 跑通 Model → Tool Call → Executor → Observation 闭环；
- 已实现 OpenAI Responses API Adapter 和独立 B1 验收器；
- B1、B2、B3 已完成真实模型与独立 evaluator 验收；
- B4 已完成真实模型验收，覆盖构建、状态逻辑、Strike 点击和 HTTP 启动；
- 已实现外层 evaluator-feedback repair loop，默认最多修复 2 次并保留每次 Agent 与评测轨迹；
- M5 已完成 `gpt-5.6` 真实 repair 验收：一次 repair 后通过 logic、UI 和 launch evaluator；
- 已完成 5 个公开仓库的保守许可证与构建检查，提取 8 个 G1/G2 单元并保留 7 条 SFT JSONL；
- 已使用 Qwen2.5-Coder-0.5B-Instruct + CPU LoRA 跑通 3-step SFT、checkpoint 保存、重载和生成；
- 已将数据扩至 25 个候选，经独立模型复核后保留 24 个 G1/G2 样本；
- 已用全部 24 条样本执行 response-only loss 的 2-epoch LoRA，并在 6 个 family 隔离 holdout 上完成同 Runtime Base-vs-SFT：最终功能通过 2/6 vs 3/6；
- MVP 技术栈已通过最小实验暂定为 Browser + TypeScript；
- 真实 API 运行需要通过环境变量提供 `OPENAI_API_KEY`；
- 已对 28 个候选仓库运行可恢复的 license/install/build 批处理：17 个通过，抽取 440 个 G1/G2 候选；初筛 334 条，经 48 条分层人工抽检和全量明显缺陷 gate 后冻结 186 条训练样本；
- 已冻结 24 个 repository-family 隔离 holdout，并准备 `Qwen/Qwen3-4B` QLoRA 与同预算 Base-vs-SFT 入口；当前工作区无 CUDA，正式训练和对比尚未运行；
- 已将 80-token 生成路径替换为 strict scoped JSON + 512-token 完整响应，并增加确定性 consistency gate、窄行为执行和 `gpt-5.6` 最终 reviewer；旧 186 条 freeze 只保留为历史基线，quality-v2 全量 review 前训练入口会拒绝启动；
- 当前文档中的状态标签为 `CONFIRMED`、`WORKING ASSUMPTION` 和 `TBD`。

## 文档导航

- [ARCHITECTURE.md](ARCHITECTURE.md)：在线 Agent、离线数据系统与模块边界
- [TASKS.md](TASKS.md)：Roadmap、Milestone 与当前进度
- [DECISIONS.md](DECISIONS.md)：产品、架构和技术决策记录
- [AGENTS.md](AGENTS.md)：后续 Coding Agent 的仓库工作规则
- [docs/product_spec.md](docs/product_spec.md)：产品目标、用户、范围与假设
- [docs/evaluation_spec.md](docs/evaluation_spec.md)：评测任务、指标、基线和验收规则
- [docs/data_spec.md](docs/data_spec.md)：离线数据来源、清洗、反向指令与 SFT 格式

## 安装与运行

需要 Node.js 24+。Node 子进程使用 permission model 限制任务工作区外的文件访问。

```bash
npm install
npm test
npm run demo -- ./agent-workspace "创建一个 TypeScript 文件并验证输出 hello agent"
```

Demo 会在指定工作目录创建 `hello-agent.ts`，以无 shell 的 `node` 子进程执行，并输出完整 Agent 事件记录。当前工具范围为 `read_file`、`write_file` 和 `run_command`。模型单轮可以返回有序 Tool Call 批次；Runtime 默认每轮最多接受 8 个，并为每个调用分别校验、执行和记录 Observation。

真实模型 B1 运行：

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6" # 可选
npm run b1:real
```

B2/B3 使用同一个 Key 和 Model 配置：

```bash
npm run b2:real
npm run b3:real
```

`b2:real` 会把带有减法缺陷的 `math.ts` 复制到新的临时工作目录，让 Agent 修改；`b3:real` 从空临时目录创建 `card-game.ts`。两者都会在 Agent 结束后调用工作目录外的独立 evaluator，并以 JSON 输出模型、iterations、Tool Call 顺序和验收证据。

M4 可玩浏览器原型使用相同配置：

```bash
npm run b4:real
```

`b4:real` 要求 Agent 生成 `index.html`、`src/game.ts` 和 `project.mjs`，再构建 `dist/game.js`。运行结果会保留临时工作目录并输出其绝对路径。验收通过后，可进入该目录运行 `node project.mjs serve`，再打开 `http://127.0.0.1:4173`。

M5 真实模型 repair 验收使用一个受控首轮缺陷：首轮要求真实模型生成 Strike Damage=5 的完整候选，external evaluator 失败后，repair request 改以标准 B4 的 Damage=6 为目标并附上完整失败 JSON：

```bash
npm run b4:repair:real
```

命令会保留临时 workspace，并输出模型、每轮 Agent iterations、每轮 Tool Call 顺序、完整 evaluator 结果、`repairsUsed` 和是否达到 repair limit。退出码 `0` 表示最终通过；退出码 `1` 表示达到上限或运行异常。

Key 只从环境变量读取；不要写入 `.env.example`、源码、日志或 commit。每次 B1 运行创建独立临时工作目录，结束后由仓库外部的验收逻辑检查目标文件和真实执行结果。

技术栈选择实验见 [experiments/runtime-selection/RESULTS.md](experiments/runtime-selection/RESULTS.md)。

Data Pilot 制品可用以下命令检查：

```bash
npm run data:pilot:validate
```

结果与限制见 [data_pipeline/reports/pilot-report.md](data_pipeline/reports/pilot-report.md) 和 [data_pipeline/reports/expansion-v2-report.md](data_pipeline/reports/expansion-v2-report.md)。当前训练集位于 [data_pipeline/samples/accepted-v2.jsonl](data_pipeline/samples/accepted-v2.jsonl)。

小规模训练和 Base-vs-SFT 对比：

```bash
.venv/bin/python -m training.sft_evaluation.train
npm run sft:evaluate
```

实际运行记录见 [docs/sft_evaluation_run.md](docs/sft_evaluation_run.md)。Checkpoint 和机器可读运行报告写入 ignored `artifacts/sft-evaluation/`。

只重处理固定 440 code units 的 quality-v2 流程：

```bash
export OPENAI_API_KEY="..."
npm run data:scale:quality-repair
```

批量数据流程与正式 Qwen3-4B 实验：

```bash
export SCALE_CHECKOUT_ROOT="$(mktemp -d)"
npm run data:scale:run
npm run sft:scale:train
npm run sft:scale:evaluate
```

数据漏斗与限制见 [docs/data_scale_run.md](docs/data_scale_run.md)，冻结训练/评测配置见 [docs/qwen3_scale_training.md](docs/qwen3_scale_training.md)。正式训练需要 CUDA；没有真实 `train-run.json` 和 `comparison-run.json` 时不得声称已有 Qwen3-4B 结果。

## 下一步

下一步是先在配置 `OPENAI_API_KEY` 的环境完成固定 440 units 的 quality-v2 生成与强 review，记录最终 accepted/reject reasons 并重新冻结。之后才在 16 GB 最低、24 GB 推荐的云 GPU 上运行 Qwen3-4B QLoRA；本轮不新增仓库或样本来源。

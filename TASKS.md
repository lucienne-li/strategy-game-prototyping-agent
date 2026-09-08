# Tasks and Milestones

## 状态

- `[x]` 完成
- `[ ]` 未开始
- `[~]` 进行中
- `[!]` 阻塞

## 当前阶段

**Phase 8：Data Scale-up + Qwen3-4B Evaluation（进行中）**

## Milestone Roadmap

### M0 — Scope and Evaluation Contract

**Objective**

冻结足以开始 MVP 的产品边界、技术栈、首批 Benchmark Tasks、输入/输出契约和成功条件。

**Modules / Files**

- `docs/product_spec.md`
- `docs/evaluation_spec.md`
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `benchmarks/`（确认格式后创建）

**Acceptance Criteria**

- [x] 技术栈被明确选择并记录理由；
- [x] 定义 3 个代表性 Benchmark Tasks；
- [x] 每个任务具有可自动验证的验收条件；
- [x] 定义 MVP Tool schema、预算和终止规则；
- [x] 区分自动、人工和暂缓指标。

**Tests**

- 文档一致性检查；
- 对每个 Benchmark Task 进行“是否可判定”评审；
- 至少手工构建一个 gold/reference 原型以证明测试设计可执行。

**Dependencies**

- 需要确认技术栈；
- 不依赖 Agent 实现或训练数据。

### M1 — Runtime Skeleton with Stub Model

**Objective**

用确定性 Stub Model 跑通 Request → Tool Call → Validation → Executor → Observation → Termination。

**Modules / Files**

- `src/agent/`
- `src/runtime/`
- `tests/unit/`
- `tests/integration/`

**Acceptance Criteria**

- [x] 可在受限工作目录创建/修改允许文件；
- [x] 非法路径和命令被拒绝；
- [x] stdout、stderr、exit code、timeout 被结构化返回；
- [x] 达到最大轮次时可靠停止。

**Tests**

- Action schema 单元测试；
- 路径越界和命令策略测试；
- Stub 端到端循环集成测试。

**Dependencies**

- M0 的 Tool 和状态契约。

### M2 — First Real-Model Vertical Slice

**Objective**

接入一个强基础模型，对一个最小 Benchmark Task 生成并构建可运行原型。

**Modules / Files**

- `src/agent/`
- Model adapter（仅一个）
- `benchmarks/`
- `examples/`

**Acceptance Criteria**

- [x] 保留既有 `AgentModel` 和 Agent Loop，新增单一真实 Model Adapter；
- [x] API Key 只从环境变量读取；
- [x] B1 使用 Agent 无法修改的独立 fixture 和 evaluator；
- [x] 每次任务使用临时工作区，并限制命令、超时和 Node 文件权限；
- [x] 模型调用、工具顺序和外部验收结果可由 CLI 输出；
- [x] 使用 `gpt-5.6` 真实 API 完成一次 B1，并记录 iterations、Tool Calls 和外部验收结果。

**Tests**

- 固定任务 smoke test；
- Model adapter contract test；
- 一次完整运行记录复现检查。

**Dependencies**

- M1；模型访问配置；已确认技术栈。

### M3 — Code Modification and Game Logic Vertical Slice

**Objective**

复用现有真实 Model Adapter 和 Runtime，分别完成修改已有代码的 B2 与最小卡牌逻辑 B3，并由 Agent 不可修改的外部 evaluator 判定结果。

**Modules / Files**

- `benchmarks/b2/`, `benchmarks/b3/`
- `src/evaluation/b2-evaluator.ts`, `src/evaluation/b3-evaluator.ts`
- `src/b2-real-model-cli.ts`, `src/b3-real-model-cli.ts`
- Adapter contract 和 evaluator tests

**Acceptance Criteria**

- [x] B2 从确定性 seed 创建临时工作区，并要求 Agent 修改已有 `math.ts`；
- [x] B2 evaluator 使用 Agent 不可修改的隐藏用例验证加法行为；
- [x] B3 从空临时工作区创建 `card-game.ts`；
- [x] B3 evaluator 验证初始状态和 Strike 后状态；
- [x] 两个入口复用现有 Model、Loop、三种 Tool、权限和 6 次循环上限；
- [x] 使用真实模型分别执行 B2/B3 并保存结果；权限修复后两个 external evaluator 均通过。

**Tests**

- B2 seed 在修改前必须失败，正确修改后必须通过；
- B3 缺少产物时必须失败，正确状态转换必须通过；
- 使用 mocked Responses API 跑通 B2/B3 的完整 Adapter → Runtime → evaluator 契约；
- 全量 M1/M2 回归测试继续通过。

**Dependencies**

- M2。

完整的 evaluator-feedback 自动修复循环、一次成功率与修复提升统计暂未实现。B2/B3 已在现有循环内通过，没有证据支持此时增加新修复架构。

### M4 — Playable Browser Card Prototype

**Objective**

复用现有真实 Model Adapter、Agent Loop 和三种 Tool，从空工作区生成第一个可构建、可启动、可点击的浏览器卡牌项目，并由 Agent 不可修改的 evaluator 验收。

**Modules / Files**

- `benchmarks/b4/`
- `src/evaluation/b4-evaluator.ts`
- `src/b4-real-model-cli.ts`
- B4 evaluator 和 Adapter contract tests

**Acceptance Criteria**

- [x] Agent 任务只使用现有 `read_file`、`write_file`、`run_command` 和 6 次循环上限；
- [x] 目标项目包含入口页、TypeScript 源码、build/serve 脚本和 build 产物；
- [x] 独立 evaluator 验证文件、构建一致性、初始状态和 Strike 状态转换；
- [x] evaluator 触发按钮 click listener 并验证 DOM 数值更新；
- [x] evaluator 以 workspace 只读、仅 `dist/` 可写的最小权限启动生成服务器并验证 HTTP 入口与模块；
- [x] 确定性 Adapter → Runtime → evaluator 集成测试通过；
- [x] 使用真实模型执行 B4：3 iterations，三个 `write_file` 后执行 `run_command`，external evaluator 全部通过。

**Tests**

- 缺少项目文件必须失败；
- 伪造或过期 build 产物必须失败；
- 逻辑正确但生成服务器无法启动必须失败；
- reference project 的逻辑、UI 和 HTTP launch 必须通过；
- 全量 M1—M3 回归测试继续通过。

**Dependencies**

- M3。

M4 不加入真实浏览器自动化、视觉评分、evaluator-feedback repair loop 或新的 Agent 层；这些能力只有在当前验证暴露具体缺口后再评估。

### M5 — Evaluator-Feedback Repair Loop

**Objective**

在现有 Agent Runtime 外围增加最小自动修复编排：执行 Agent、运行 external evaluator，在失败且预算允许时把结构化评测结果反馈给模型，并在同一 workspace 继续修改。

**Modules / Files**

- `src/repair/evaluator-repair-loop.ts`
- `benchmarks/b4-repair/task.json`
- `tests/evaluator-repair-loop.test.ts`
- `docs/m5_repair_run.md`

**Acceptance Criteria**

- [x] 复用现有 Model Adapter、`runAgent`、`ToolExecutor` 和三种 Tool；
- [x] 默认最多 2 次 repair，不计第一次 Agent 执行；
- [x] 每次 Agent 结果、evaluation、请求、阶段和顺序均保存在 trace；
- [x] evaluator 仍在 Agent workspace 外，只反馈结构化结果而不暴露或复制 evaluator；
- [x] evaluator 通过后立即结束；达到 repair 上限后返回明确的 `repair_limit_reached`；
- [x] 故意错误的 B4 变体在一次 evaluator-guided repair 后通过完整 B4 evaluator。
- [x] 准备 `npm run b4:repair:real` 真实模型验收入口和可复现的首轮故障注入；
- [x] 使用本地 API Key 完成真实模型 B4-REPAIR 验收：`gpt-5.6` 在 1 次 repair 后通过全部 evaluator，未达到 repair limit；
- [ ] 非阻塞优化：两轮 Agent 均使用 6 iterations；补充区分正常第 6 轮结束与 `max_iterations`，并在更多真实任务上统计 iterations。

**Tests**

- 首次候选将 Strike 伤害错误设为 5，evaluator 必须失败并观察到 Enemy HP 15；
- repair Agent 必须读取现有源码、改为 6 点伤害并重新 build；
- 第二次 evaluator 必须通过 logic、UI 和 launch；
- 不修复的模型必须在上限处停止并保留全部失败轨迹；
- 非法 `maxRepairs` 必须被拒绝。

**Dependencies**

- M4。

M5 没有增加 Planner、Memory、RAG、Multi-Agent，也没有修改 Agent Loop；repair orchestration 只是复用现有 Agent 与 evaluator 的外层确定性循环。

### M6 — Offline Data Pilot

**Objective**

用小规模仓库样本验证 license、构建、拆解和 provenance 流程，不直接扩展到 2 万条。

**Modules / Files**

- `data_pipeline/`
- `docs/data_spec.md`
- 数据清单与处理日志

**Acceptance Criteria**

- [x] 按用户确认缩小并冻结方案：5 个手工策展候选、8 个 G1/G2 单元；
- [x] 创建 `data_pipeline/manifests`、`samples`、`reports` 的最小目录契约；
- [x] 确认保守许可证政策并录入 5 个固定 commit 的候选 manifest；
- [x] 对候选执行 license、build、duplicate 和 code-quality 检查；
- [x] 提取 8 个代码单元并各生成 1 个 inverse instruction；
- [x] 完成 alignment/granularity 静态复核：7 条保留、1 条拒绝；
- [x] 输出 SFT chat JSONL、拒绝审计记录、第三方 notices 和 Pilot 报告；
- [x] 增加离线制品校验器和回归测试，全量测试 40/40 通过；
- [ ] 非阻塞优化：独立复核、生成 token/API 成本和人工分钟数尚未完成计量；
- 处理一批小型、许可证明确的仓库；
- 每个派生样本可追溯到 commit 和代码范围；
- repository family 去重/隔离可执行；
- 统计构建通过率、筛除原因和可提取粒度。

**Tests**

- [x] License allowlist 和 manifest provenance 校验；
- [x] fork/family/exact-target duplicate 校验；
- [x] target content hash、G1/G2 和 quality gate 校验；
- [x] 5 个固定 commit 的实际构建检查。

**Dependencies**

- M0 数据政策；M4 的项目级执行评测能力可复用。

### M6.1 — SFT Technical Smoke Test

**Objective**

不评价模型效果，只验证 accepted JSONL → chat template → CPU LoRA → checkpoint → reload/generation 技术链路。

**Acceptance Criteria**

- [x] 确定性 loader 读取并验证 7 条 accepted samples；
- [x] 使用基座原生 chat template 转换 user/assistant messages；
- [x] `Qwen/Qwen2.5-Coder-0.5B-Instruct` 在 CPU 上完成 3 个 LoRA steps；
- [x] 产生有限 loss，且固定样本上的 loss 从 2.7908 降至 2.6706；
- [x] 保存 adapter checkpoint，重新加载后完成一次生成；
- [x] checkpoint 保持在 ignored `artifacts/`，不提交模型权重。

**Tests**

- [x] loader 对实际 7 条数据和 chat-template 调用的单元测试；
- [x] 失败 quality gate 样本拒绝测试；
- [x] 真实 CPU 训练、checkpoint reload 和 generation smoke run。

**Limit**

训练只重复一个最短样本以观测三步优化信号，不构成效果实验；完整数据训练、response-only masking、独立复核和 Base-vs-SFT 对比留待扩大样本后进行。

### M7 — Small-scale Data Expansion and SFT Evaluation

**Objective**

将 Pilot 扩至约 20—30 条合格 G1/G2 样本，以相同 Runtime 和预算完成最小 Base-vs-SFT 对比，同时把数据步骤整理为可继续批量化的半自动 Pipeline。

**Modules / Files**

- `data_pipeline/pipeline/`, `data_pipeline/reviews/`, `data_pipeline/samples/`
- `training/sft_evaluation/`
- `src/model/local-qwen-code-model.ts`, `src/evaluation/sft-holdout.ts`
- `docs/sft_evaluation_run.md`

**Acceptance Criteria**

- [x] 从 5 个已通过 license/build 的固定仓库形成 25 个候选；
- [x] 独立本地模型复核 alignment、G1/G2 granularity 和 solvability，并 fail-closed；
- [x] 精确去重与 0.80 token-Jaccard 探索性过滤后保留 24 条、拒绝 1 条；
- [x] 使用全部 24 条样本、assistant-response-only loss、2 epochs 的 Qwen2.5-Coder-0.5B LoRA；
- [x] 6 个 holdout task 与训练 repository family 零重叠；
- [x] Base 与 SFT 使用相同 Agent Runtime、4 iterations 和 1 repair；
- [x] 真实对比记录 success、build、functional、first-pass 和 repairs；Base 2/6，SFT 3/6；
- [x] 明确结论仅为初步趋势，不声称统计显著或普遍提升。

**Tests**

- [x] v2 committed artifact 和 finalization 可复现回归测试；
- [x] assistant-only label masking 单元测试；
- [x] local-model Adapter scaffold 单元测试；
- [x] holdout repository-family 泄漏运行时检查；
- [x] 44 个 Node 测试与 5 个 Python 测试通过；
- [ ] 后续规模化前：使用强 reviewer 并完成抽样人工双标一致性试验。

**Dependencies**

- M6 与 M6.1。

### M8 — Batch Data Scale-up and Qwen3-4B Evaluation

**Objective**

把已验证的离线流程扩成可恢复批处理，对 300–500 条初筛 G1/G2 样本执行正式训练前质量抽检，冻结训练集和 20–30 个 family-isolated holdout，再以同一 `Qwen/Qwen3-4B` 基座完成 Base-vs-SFT 对比。

**Modules / Files**

- `data_pipeline/scale/`
- `training/sft_scale/`
- `src/evaluation/scale-holdout.ts`
- `src/scale-evaluation-cli.ts`
- `tests_py/test_data_scale.py`

**Acceptance Criteria**

- [x] 28 个候选仓库支持 resumable clone/license/install/build 批处理；
- [x] 仅接受明确 MIT/BSD-2-Clause/BSD-3-Clause/Apache-2.0 根 LICENSE；
- [x] 17 个构建通过仓库完成跨仓 family 检查；
- [x] 自动提取 440 个唯一 G1/G2 候选代码单元；
- [x] 为全部候选生成反向 instruction，并将生成元数据绑定 target hash；
- [x] 全部 440 个 instruction 完成独立 target-bound review 与最终 quality/duplicate gate；
- [x] 初筛保留 334 条；48 条分层抽检发现 34 条明显问题，全量收紧 gate 后冻结 186 条训练样本；
- [x] 用 SHA-256 manifest 冻结训练集、48 条审计记录、24 个 holdout、Runtime/repair contract、decoding 和预算；
- [x] 冻结 24 个与训练 repository family 隔离的 external-evaluator tasks；
- [x] 准备 Qwen3-4B QLoRA、checkpoint reload 与同预算 Base-vs-SFT 入口；
- [x] 准备单命令云 GPU fail-fast 入口 `npm run sft:scale:cloud`，并支持 BF16/FP16 CUDA；
- [!] 在 CUDA 云 GPU 上真实训练并运行 24-task Base-vs-SFT；当前工作区无 CUDA，尚无真实 loss/checkpoint/comparison 产物。

**Tests**

- [x] 46/46 Node Runtime、Agent 和 24-task evaluator tests 通过；
- [x] scale repository/unit/final JSONL Python regression tests；
- [ ] Qwen3-4B checkpoint reload 与真实 Base-vs-SFT run report。

**Dependencies**

- M7；可访问公开 GitHub 仓库；正式实验需要能够运行 Qwen3-4B QLoRA 的 CUDA 环境。

### M9 — Ablations and Final Evaluation

**Objective**

验证研究假设中各因素的真实贡献。

**Acceptance Criteria**

- 至少比较 Base、Agent-only、SFT-only（若可运行）与 SFT+Agent；
- 对 execution filtering、multi-granularity、difficulty evolution 做可行的消融；
- 报告质量、成功率、延迟和成本；
- 明确外部效度与限制。

**Tests**

- 冻结任务、固定 Runtime 和预算下重复评测；
- 置信区间或适当的重复采样报告。

**Dependencies**

- M8。

### M8.1 — Data Quality Pipeline Repair

**Objective**

暂停 Qwen3-4B 正式训练，针对 440 个既有 code units 修复反向 instruction 生成与放行机制，不增加仓库或依赖重复人工抽检。

**Acceptance Criteria**

- [x] 移除 80-token 输出路径；结构化生成使用 512-token 上限，未完成响应重试后仍失败则 reject；
- [x] 每条候选强制记录 target file、target symbol、expected behavior、constraints 和 required context；
- [x] 确定性 gate 对 scope、完整句、上下文、粒度、target 结构和重复执行 fail-closed 检查；
- [x] 对安全可独立执行的极窄代码单元运行 deterministic behavior harness，其余明确标记 `not_eligible`；
- [x] 最终 reviewer 默认使用 `gpt-5.6`，只返回 pass/fail、失败类别和 reason；
- [x] 生成、review 和 finalize 均支持 JSONL checkpoint/resume；
- [x] 将本地 quality-repair 与 CUDA/QLoRA requirements 解耦；quality 环境无第三方 Python 依赖；
- [!] 对固定 440 units 完成强模型全量重跑并替换 `accepted.jsonl`；当前执行环境没有 `OPENAI_API_KEY`，不得伪造结果或沿用旧 reviewer；
- [ ] 生成新的 quality-v2 freeze manifest 后解除正式训练暂停。

**Tests**

- [x] 截断、scope mismatch、missing context 和缺少强 review 均有 fail-closed 回归测试；
- [x] 440 个 target 均生成结构/执行资格记录；其中 438 个结构通过、2 个结构失败、1 个通过极窄 deterministic behavior test；
- [ ] 记录全量 accepted 数与 reject reason 分布。

## 已完成

- [x] 初始化 Git Repository。
- [x] 完成项目理解与假设审查初稿。
- [x] 定义在线/离线系统边界。
- [x] 设计最小 MVP 架构和模块责任线。
- [x] 建立核心项目文档。
- [x] 使用同一最小卡牌任务比较 Browser + TypeScript 与 Godot 4 + GDScript。
- [x] 验证两个实验的逻辑测试和运行 smoke test。
- [x] 为 MVP 选择 Browser + TypeScript，并记录取舍与复议条件。
- [x] 冻结 M0 的 3 个最小 Benchmark Task 和自动验收条件。
- [x] 实现 `read_file`、`write_file`、`run_command` schema 与执行器。
- [x] 实现 6 轮上限的单模型 Agent Loop 和基本错误处理。
- [x] 用 Fake Model 真实创建并执行 `hello-agent.ts`。
- [x] 通过 8 个 Runtime 单元/端到端测试。
- [x] 复审 M1 并 fast-forward 合并到 `main`。
- [x] 新增 OpenAI Responses API Adapter，不修改现有 Agent Loop。
- [x] 将 B1 固定为 Agent 工作区外的独立 fixture 和 evaluator。
- [x] 使用 Node permission model 阻止子进程越界读写并拒绝权限覆盖参数。
- [x] 通过 14 个确定性与 Adapter contract 测试。
- [x] 使用 `gpt-5.6` 完成真实 B1：3 iterations，`write_file` → `run_command`，外部 evaluator 通过。
- [x] 合并 `feature/real-model-adapter` 到 `main`。
- [x] 创建 `feature/game-vertical-slice`。
- [x] 实现 B2 seed、真实模型入口和独立隐藏用例 evaluator。
- [x] 实现 B3 真实模型入口和独立状态转换 evaluator。
- [x] 通过 22 个测试，包括 B2/B3 contract、Adapter、evaluator、canonical workspace 和 evaluator 只读权限测试。
- [x] 定位 B2/B3 首次真实验收失败为 evaluator Node 权限路径问题，而非模型任务失败。
- [x] 将 Executor 工作目录规范化为 canonical real path，并增加路径别名回归测试。
- [x] 将 B1/B2/B3 evaluator Node 权限限制为 benchmark 工作区只读；Agent 仍只对同一工作区读写。
- [x] 使用真实模型重新执行 B2：Agent `success`，Tool Calls 为 `read_file` → `write_file` → `run_command`，外部 evaluator 通过。
- [x] 使用真实模型重新执行 B3：Agent `success`，Tool Calls 为 `write_file` → `run_command`，外部 evaluator 通过。
- [x] 完成 M3，证明现有 Agent Loop 可以完成修改任务和最小卡牌逻辑任务。
- [x] 新增 B4 完整浏览器项目契约、真实模型运行入口和独立 evaluator。
- [x] B4 evaluator 验证 build、确定性卡牌逻辑、DOM 点击更新和生成服务器 HTTP 启动。
- [x] 保持既有 Agent 架构与三种 Tool，通过 28 个全量测试。
- [x] 记录首次真实 B4 失败：`gpt-5.6` 在 iteration 2 返回多个 Tool Calls，旧 Adapter 提前终止。
- [x] 扩展现有 ModelOutput 和 Agent Loop，支持每轮最多 8 个有序 Tool Calls，并保留逐项 Observation。
- [x] 增加单调用、多调用、中间失败、数量超限和 B4 多调用端到端回归测试；全量 33 项通过。
- [x] 记录第二次真实 B4：Agent `success`，3 iterations，三个 `write_file` 后执行 `run_command`；除 launch 外均通过。
- [x] 将 B4 launch 写权限限制为 canonical `<workspace>/dist/`，保持其他路径只读并拒绝 symlink 目录。
- [x] 增加启动时重建 dist 成功及越界写拒绝回归测试；全量 34 项通过。
- [x] 完成最终真实 B4 验收：`evaluation.passed`、files、build、logic、UI、launch 均为 `true`，exit code 为 0。
- [x] 完成 M4，证明真实模型可通过现有 Runtime 生成、构建并启动最小可玩浏览器卡牌项目。
- [x] 实现最多 2 次 repair 的 evaluator-feedback 外层循环，并保留逐次 Agent/evaluator trace。
- [x] 用 B4 伤害错误变体证明首次失败后可 `read_file` → `write_file` → `run_command` 修复并通过。
- [x] 验证 repair 上限终止、失败轨迹保留和参数校验；全量 38 项测试通过。

## 下一步任务

- [x] 完成 M5 确定性与单次 `gpt-5.6` 真实修复验收；单次成功不作为模型修复率统计。
- [x] 完成 M6 首轮 5-repository Data Pilot、manifest schema、7 条 accepted JSONL 和 1 条拒绝审计记录。
- [x] 完成 M6.1 CPU LoRA SFT smoke test，checkpoint 保存、重载和生成均通过。
- [x] 扩充到 25 个候选，独立模型复核后形成 24 条 accepted v2 和 1 条 rejected v2。
- [x] 用 24 条完整样本、assistant-only masking 完成 2-epoch CPU LoRA；epoch loss 0.9432 → 0.8163，checkpoint 可重载。
- [x] 在 6 个 family 隔离 holdout 上完成相同 Runtime/预算 Base-vs-SFT：2/6 vs 3/6，观察到单任务正向差异但不足以下效果结论。
- [x] 将 extraction、review、filter/finalize 整理为可复现的半自动 Pipeline，并增加制品回归测试。
- [ ] 在扩到约 100—500 条前，实现 AST/符号提取、强 reviewer + 人工双标校准、跨仓 family/near-duplicate 分组和成本遥测。
- [ ] 扩张后冻结更大的 repository-family holdout，增加重复采样并重新验证趋势。
- [ ] M4 后续仍可评估真实浏览器自动化或容器级沙箱；当前 DOM double 与 Node permission model 不是生产级安全边界。

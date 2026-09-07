# Tasks and Milestones

## 状态

- `[x]` 完成
- `[ ]` 未开始
- `[~]` 进行中
- `[!]` 阻塞

## 当前阶段

**Phase 4 / M4：Playable Browser Card Prototype（完成）**

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

### M5 — Offline Data Pilot

**Objective**

用小规模仓库样本验证 license、构建、拆解和 provenance 流程，不直接扩展到 2 万条。

**Modules / Files**

- `data_pipeline/`
- `docs/data_spec.md`
- 数据清单与处理日志

**Acceptance Criteria**

- 处理一批小型、许可证明确的仓库；
- 每个派生样本可追溯到 commit 和代码范围；
- repository family 去重/隔离可执行；
- 统计构建通过率、筛除原因和可提取粒度。

**Tests**

- License 规则测试；
- provenance 完整性测试；
- fork/近重复样例测试；
- 可复现构建抽查。

**Dependencies**

- M0 数据政策；M4 的项目级执行评测能力可复用。

### M6 — Inverse Instruction and Difficulty Pilot

**Objective**

生成、评测少量多粒度反向 Instruction，验证难度体系后再规模化。

**Modules / Files**

- `data_pipeline/`
- 数据评测脚本
- `docs/data_spec.md`

**Acceptance Criteria**

- Instruction 与目标代码范围匹配；
- 具有结构化类别、粒度和难度证据；
- 自动过滤结合人工抽检；
- 明确通过率、主要失败类型和成本。

**Tests**

- 双人标注一致性试验；
- 代码—Instruction 一致性抽检；
- 难度排序 pairwise 检查；
- 数据泄漏检查。

**Dependencies**

- M5。

### M7 — Dataset Scale-up and SFT

**Objective**

冻结数据版本，训练候选模型并与基础模型比较。

**Modules / Files**

- 数据版本清单
- 训练配置
- 训练与评测报告

**Acceptance Criteria**

- 训练/验证/测试按 repository family 隔离；
- 训练可复现，模型与数据版本可追踪；
- 同一 Agent Runtime 下完成 Base vs SFT 对比；
- 报告提升、退化、成本和统计不确定性。

**Tests**

- 数据泄漏与去重审计；
- 训练 smoke test；
- 冻结 Benchmark 评测。

**Dependencies**

- M6 证明数据方法有效；训练资源。

### M8 — Ablations and Final Evaluation

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

- M7。

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

## 下一步任务

- [ ] M5：在现有 Runtime 外围实现 evaluator-feedback 自动修复循环，并保留逐轮轨迹。
- [ ] 用故意首次失败的 B4 变体验证修复成功与最大修复次数终止。
- [ ] 保持 evaluator 隔离，不增加 Planner、Memory、RAG 或 Multi-Agent。
- [ ] M4 后续仍可评估真实浏览器自动化或容器级沙箱；当前 DOM double 与 Node permission model 不是生产级安全边界。

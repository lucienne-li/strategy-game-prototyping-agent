# Tasks and Milestones

## 状态

- `[x]` 完成
- `[ ]` 未开始
- `[~]` 进行中
- `[!]` 阻塞

## 当前阶段

**Phase 0 / M0：范围与评测契约冻结**

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
- 定义 3—5 个代表性 Benchmark Tasks；
- 每个任务具有可自动验证的验收条件；
- 定义 MVP Tool schema、预算和终止规则；
- 区分自动、人工和暂缓指标。

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

- 可在隔离工作区创建/修改允许文件；
- 非法路径和命令被拒绝；
- stdout、stderr、exit code、timeout 被结构化返回；
- 达到最大轮次/时间预算时可靠停止。

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

- 单个请求可以产生 GameSpec、计划和文件操作；
- 项目能够通过真实构建/启动检查；
- 全部模型调用、工具调用和结果可追踪；
- 失败时返回明确诊断，不伪装成功。

**Tests**

- 固定任务 smoke test；
- Model adapter contract test；
- 一次完整运行记录复现检查。

**Dependencies**

- M1；模型访问配置；已确认技术栈。

### M3 — Evaluation and Repair Loop

**Objective**

实现确定性构建/功能评测和有限次数自动修复。

**Modules / Files**

- `src/evaluation/`
- `src/agent/termination`
- Benchmark tests

**Acceptance Criteria**

- Build 与 Functional 失败可被区分；
- EvaluationReport 可作为下一轮模型输入；
- 修复循环遵守轮次、时间和成本预算；
- 报告一次成功率与修复后成功率。

**Tests**

- 注入已知构建错误和功能错误；
- 修复成功、修复失败、预算耗尽三条路径；
- 回归测试保证修复不破坏已通过功能。

**Dependencies**

- M2。

### M4 — Offline Data Pilot

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

- M0 数据政策；M3 的部分执行评测能力可复用。

### M5 — Inverse Instruction and Difficulty Pilot

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

- M4。

### M6 — Dataset Scale-up and SFT

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

- M5 证明数据方法有效；训练资源。

### M7 — Ablations and Final Evaluation

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

- M6。

## 已完成

- [x] 初始化 Git Repository。
- [x] 完成项目理解与假设审查初稿。
- [x] 定义在线/离线系统边界。
- [x] 设计最小 MVP 架构和模块责任线。
- [x] 建立核心项目文档。
- [x] 使用同一最小卡牌任务比较 Browser + TypeScript 与 Godot 4 + GDScript。
- [x] 验证两个实验的逻辑测试和运行 smoke test。
- [x] 为 MVP 选择 Browser + TypeScript，并记录取舍与复议条件。

## 下一步任务

- [ ] 起草 3—5 个 Benchmark Task。
- [ ] 为每个任务定义可自动验证的状态与行为。
- [ ] 定义 Tool schema、终止预算与交付清单 v0。

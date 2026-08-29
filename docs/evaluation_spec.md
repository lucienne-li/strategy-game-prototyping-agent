# Evaluation Specification

## 1. Evaluation-First Strategy

评测分两次冻结：

1. **MVP Contract Freeze（M0）**：冻结少量任务、工具契约和最小成功条件，用来驱动 Runtime。
2. **Research Benchmark Freeze（SFT 前）**：在数据方法确定后冻结正式测试集；此后不得使用测试项目生成训练数据或据结果修改任务。

这样既避免“做完后挑指标”，又允许早期原型暴露不可执行的评测设计。

## 2. Evaluation Units

必须区分：

- **Sample-level**：一条 Instruction 与目标代码；
- **Project-level**：完整项目的构建、运行与行为；
- **Run-level**：一次 Agent 执行，包括所有修复轮次和成本；
- **Task-level**：同一 Benchmark Task 的一次或多次采样聚合。

所有比例指标必须报告分母和失败分类，不能只给一个总分。

## 3. Dataset Quality Evaluation

| 维度 | 指标/检查 | 方法 | 当前状态 |
|---|---|---|---|
| Provenance | commit、文件范围、处理版本完整率 | 确定性校验 | REQUIRED |
| License | 允许/拒绝/人工复核比例 | 规则 + 人工复核 | POLICY TBD |
| Buildability | 原始项目构建通过率 | 隔离构建 | REQUIRED |
| Executability | 可启动/基础运行比例 | headless/运行检查 | REQUIRED where applicable |
| Deduplication | exact、fork-family、near-duplicate 比例 | hash + family + 相似度 | REQUIRED |
| Instruction-Code Alignment | 需求是否由目标代码充分实现 | rubric + 人工抽检/LLM辅助 | REQUIRED |
| Granularity Match | 指令范围与答案范围是否一致 | rubric | REQUIRED |
| Solvability | 指令信息是否足以完成任务 | 人工抽检 | REQUIRED |
| Difficulty Validity | 标签能否由可观察证据支持 | 特征规则 + pairwise 标注 | PILOT REQUIRED |
| Diversity | 类型、机制、粒度、技术栈/文件跨度分布 | 统计报告 | REQUIRED |
| Leakage | 与验证/测试 repository family 重叠 | 确定性检查 | ZERO TOLERANCE |

### 人工评测质量

- 建立标注 rubric；
- 小样本双人独立标注；
- 报告一致率或 Cohen's kappa（若标签适用）；
- 分歧由第三方或讨论仲裁；
- LLM-as-judge 不能成为唯一质量依据，必须先用人工样本校准。

## 4. Model Capability Evaluation

模型评测在固定 Runtime、相同工具、相同预算和相同任务下进行。

### 4.1 Gate Metrics

按顺序计算，防止后续指标掩盖前置失败：

1. **Artifact Validity Rate**：输出是否包含预期入口、清单和必要文件；
2. **Dependency Resolution Rate**：依赖是否可安装/解析；
3. **Build Pass Rate**：构建命令 exit code 为 0；
4. **Launch Pass Rate**：在超时内成功启动且无致命错误；
5. **Functional Pass Rate**：确定性功能测试通过比例；
6. **Playability Pass Rate**：具备输入响应、状态推进和可达到的终止条件。

### 4.2 Quality Metrics

- **Requirement Coverage**：通过测试或可审计证据满足的原子需求数 / 总原子需求数；
- **Project Completeness**：入口、依赖、资源引用、运行说明、测试与必要文件的加权完整度；
- **Regression-free Repair Rate**：修复目标失败且不破坏已通过测试的比例；
- **Unsupported Claim Rate**：报告声称实现/通过，但测试证据不支持的比例；
- **Code Maintainability（次要）**：仅在功能通过后评审结构、命名和可编辑性。

### 4.3 Repairability 的重新定义

不使用模糊的单一 `Repairability` 分数，改为：

- 给定标准错误反馈和固定修复预算后的恢复率；
- 按错误类型（build、runtime、functional、regression）分层；
- 报告首次通过轮次和累计 token/tool 成本。

## 5. Agent End-to-End Evaluation

| 指标 | 定义 |
|---|---|
| One-shot Success Rate | 第一次候选项目通过全部 gate 和核心功能测试的任务比例 |
| Final Success Rate | 预算内经修复后通过的任务比例 |
| Repair Lift | Final Success Rate − One-shot Success Rate |
| Iterations to Success | 成功任务达到通过所需修复轮数分布 |
| Executable Delivery Rate | 可按说明复现构建并启动的交付比例 |
| Requirement Coverage | 最终通过的原子需求比例 |
| Regression Rate | 修复后已通过测试转为失败的比例 |
| Graceful Failure Rate | 未成功时是否提供真实错误、产物和限制，而非虚假成功 |
| Latency | 端到端 wall-clock；同时拆分模型/工具/构建时间 |
| Model Cost | token 与 API 成本，按 run/task 报告 |
| Tool Cost | 调用次数、执行时间、超时和失败率；不强行货币化本地调用 |

“Tool 调用成本”不应与“模型调用成本”简单相加成一个无解释总数；分别报告更可诊断。

## 6. Benchmark Task Design

### MVP 建议任务结构（TBD，待 M0 冻结）

建议先有 3—5 个任务，覆盖而不追求数量：

1. D1 单机制：抽牌/弃牌或能量消费；
2. D2 子系统：玩家—敌人回合与伤害结算；
3. D2/D3 状态效果：护甲、中毒及回合触发；
4. D3 系统交互：卡牌、敌人意图、胜负和奖励；
5. D4 小型完整原型：多场战斗与轻量卡组构筑。

每个任务包含：

- 用户需求；
- 原子需求列表；
- 技术约束；
- 允许的占位素材；
- 确定性测试；
- 启动/交互轨迹；
- 成功阈值；
- 最大预算；
- 禁止条件。

## 7. Difficulty Model

D1—D4 仅作为面向人的分桶标签，底层难度由以下可观察特征记录：

- `mechanism_count`：独立机制数量；
- `dependency_depth`：机制依赖链深度；
- `file_span`：涉及文件数量；
- `component_span`：涉及子系统数量；
- `state_transition_count`：需验证的状态转换；
- `interaction_steps`：验收轨迹长度；
- `asset_dependency`：无/占位/外部资产；
- `runtime_dependency`：仅逻辑/引擎场景/外部服务；
- `change_type`：生成、补全、修改、修复。

### 暂定解释

- **D1 单机制**：一个主要机制、局部范围、短验证轨迹；
- **D2 局部子系统**：多个紧密相关机制，通常跨类/文件；
- **D3 多系统交互**：至少两个子系统和多个状态依赖；
- **D4 小型完整项目**：从空工作区交付可运行原型，包含完整游戏循环。

等级阈值必须通过数据分布和人工 pairwise 难度判断校准，目前为 `TBD`。

## 8. Baselines and Ablations

### Baselines

- 基础模型直接生成（受相同输出/预算约束）；
- 基础模型 + Agent Runtime；
- SFT 模型直接生成（若接口允许）；
- SFT 模型 + 同一 Agent Runtime。

### Ablations

- 无 execution filtering；
- 无 multi-granularity；
- 无 difficulty evolution；
- 无 repair loop；
- 若后续加入检索，再比较 no-RAG vs RAG。

不要在 MVP 阶段为了表格完整而实现所有消融；只在对应组件存在后比较。

## 9. Acceptance Criteria Status

### CONFIRMED

- 构建/运行结果必须来自真实 Runtime；
- 测试通过才能声称成功；
- 在线 Agent 与离线模型评测使用可比较契约；
- 测试数据不得进入训练数据；
- 报告失败类型、成本和限制。

### TBD / M0 BLOCKERS

- 首批 Benchmark 具体内容；
- MVP 成功阈值；
- 最大修复轮次、时间和成本；
- Playability 首版采用状态测试、GUI replay 还是二者结合；
- 多次采样次数和统计报告方式。

### Confirmed MVP runtime commands

- Build: `npm run build`
- Logic tests: `npm test`
- Combined check: `npm run check`
- Runtime smoke test: serve the built project over HTTP and verify the entry page and compiled module load successfully.

The first reference task and runtime comparison are recorded in `experiments/runtime-selection/`.

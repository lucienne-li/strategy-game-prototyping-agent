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

### MVP Benchmark Tasks v0

| ID | 任务需求 | 自动验收条件 |
|---|---|---|
| B1 单文件创建 | 在空工作目录创建一个 TypeScript 文件，运行后输出 `hello agent`。 | 目标文件存在；`node <file>` exit code 为 0；trim 后 stdout 精确等于 `hello agent`；stderr 为空。 |
| B2 修改已有代码 | 给定保持既有导出接口的 TypeScript 加法函数，其中实现错误地执行减法；修改实现使给定用例通过。 | 原文件被修改且导出名不变；预置测试 exit code 为 0；至少覆盖正数与负数用例。 |
| B3 最小卡牌逻辑 | 实现无 UI 的确定性回合逻辑：玩家 20 HP、敌人 18 HP、每回合 3 能量；Strike 消耗 1 并造成 6 伤害，Defend 消耗 1 并增加 5 护甲，结束回合后敌人造成 4 伤害且护甲优先吸收。 | TypeScript 构建通过；预置测试验证能量消耗、伤害、护甲吸收、非法能量操作不改变状态及胜负状态；全部测试 exit code 为 0。 |

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

B1 已在 M1 通过 Fake Model 端到端执行。B2、B3 在 M2 转为不可被 Agent 修改的外部验收 fixture；当前只冻结需求和可判定条件。

### M1 Runtime Contract

- Tool 范围：`read_file`、`write_file`、`run_command`；
- 默认最大 Agent Loop：6；
- 默认单命令 timeout：10 秒，参数允许范围 1—30 秒；
- 文件与单次命令输出上限：各 1 MB；
- MVP 成功标准：任务的自动验收命令通过，模型自述不计为成功；
- M1 E2E 额外检查：真实写入文件、真实启动 Node 子进程、Observation 包含 stdout/stderr/exit code、最终状态为 success。

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

### TBD / M2+ ITEMS

- Playability 首版采用状态测试、GUI replay 还是二者结合；
- 多次采样次数和统计报告方式。
- 真实模型运行的 token/cost 上限；
- M3 自动修复轮数是否与总 Agent Loop 分开统计；
- 浏览器 GUI 功能验收工具与隔离方式。

### Confirmed MVP runtime commands

- Build: `npm run build`
- Logic tests: `npm test`
- Combined check: `npm run check`
- Runtime smoke test: serve the built project over HTTP and verify the entry page and compiled module load successfully.

The first reference task and runtime comparison are recorded in `experiments/runtime-selection/`.

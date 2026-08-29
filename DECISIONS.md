# Decision Log

记录已做出的重要决策及理由。`Proposed` 不代表已确认；只有 `Accepted` 才是当前有效决定。

## D-001 — 在线与离线系统严格分离

- **Status:** Accepted / CONFIRMED
- **Decision:** GitHub 收集、数据构建和 SFT 只属于离线流程；真实用户请求只调用已部署模型与本地 Runtime。
- **Why:** 避免在线延迟、许可风险、不可复现训练和概念混淆。
- **Affected:** `ARCHITECTURE.md`, `docs/data_spec.md`

## D-002 — MVP 使用单模型显式循环

- **Status:** Accepted for MVP / WORKING ASSUMPTION
- **Decision:** Requirement、GameSpec、计划、Action 选择和修复先由一个模型会话承担。
- **Why:** 这是能验证生成—执行—评测—修复闭环的最小架构，易观察故障并控制成本。
- **Revisit when:** 实测表明计划、生成或修复角色互相干扰且无法通过提示与状态契约解决。
- **Affected:** `ARCHITECTURE.md`

## D-003 — MVP 不使用 RAG、Memory、Multi-Agent、MCP 或复杂工作流框架

- **Status:** Accepted for MVP / WORKING ASSUMPTION
- **Decision:** 不在首个垂直切片中加入上述组件。
- **Why:** 当前没有可测需求证明其必要性；它们会增加故障面并妨碍判断基础闭环是否有效。
- **Revisit when:** 出现可重复、可量化的具体失败模式。
- **Affected:** `ARCHITECTURE.md`, `AGENTS.md`

## D-004 — 先做 Agent MVP，再做数据规模化和 SFT

- **Status:** Accepted / CONFIRMED
- **Decision:** 先建立评测契约和可运行 Runtime，再进行小规模数据试点，之后才允许规模化与训练。
- **Why:** Runtime 与评测可复用于数据验证；先证明任务可执行，避免昂贵地生产无法评价的数据。
- **Affected:** `TASKS.md`

## D-005 — 技术栈选择

- **Status:** Accepted for MVP
- **Decision:** 第一版使用 Browser + TypeScript。Godot 4 + GDScript 保留为后续专业引擎扩展。
- **Evidence:** 两个实现均通过同一最小卡牌任务的逻辑测试和运行 smoke test。Browser 方案所需引擎概念和环境准备更少，TypeScript 编译、Node 测试和 HTTP 验证更直接，普通文本代码也更便于 Agent 修改。
- **Trade-off:** Godot 的项目结构更接近专业游戏开发，项目级数据语义可能更一致；Browser 数据候选更多，但需更强的游戏项目筛选和去噪。
- **Why:** MVP 首要目标是验证 Agent 的生成—执行—评测—修复闭环，暂不让场景绑定、资源导入和引擎安装成为主要故障来源。
- **Revisit when:** Browser MVP 闭环稳定后需要验证专业引擎迁移，或离线数据试点表明 Browser 游戏数据质量不足。
- **Experiment:** `experiments/runtime-selection/RESULTS.md`

## D-006 — 首版游戏类型与表现形式

- **Status:** Proposed / WORKING ASSUMPTION
- **Decision:** 单人、2D、回合制、卡牌策略/轻量 Deckbuilder；不要求商业级美术。
- **Why:** 规则结构化程度高、可确定性验证、项目规模可控，且有较好的开源数据候选。
- **Risk:** 过窄可能降低外部效度；`card-game` 仓库不等同于可用 Deckbuilder 项目。
- **Revisit when:** 数据试点或用户验证显示样本不足、目标用户需求不同，或评测无法覆盖核心价值。

## D-007 — 3D、联网、RTS、4X 暂不进入 MVP

- **Status:** Proposed / WORKING ASSUMPTION
- **Decision:** 首版不支持这些能力，但不将其永久排除。
- **Why:** 它们分别引入资源/场景、分布式状态、实时 AI 和大型系统复杂度，会混淆当前反向数据与可执行代码生成研究变量。
- **Revisit when:** 2D单人原型闭环稳定，且新增范围对应明确用户需求与独立评测。

## D-008 — 难度不只使用 D1—D4 单标签

- **Status:** Proposed / WORKING ASSUMPTION
- **Decision:** 保留 D1—D4 作为展示层级，但底层记录机制数、依赖跨度、文件跨度、状态交互和验证轨迹等可观察特征。
- **Why:** 单一“难度”容易主观；相同代码行数可能具有完全不同的推理和工程复杂度。
- **Affected:** `docs/data_spec.md`, `docs/evaluation_spec.md`

## D-009 — Git Repository 是项目事实来源

- **Status:** Accepted / CONFIRMED
- **Decision:** 范围、架构、任务、决策、评测和数据规则均在版本控制文档中维护。
- **Why:** 保证变更可追踪，避免对话中的临时假设被误当成正式需求。

## D-010 — M1 使用显式循环和 Fake Model

- **Status:** Accepted for M1
- **Decision:** 使用一个无工作流框架的 `for` 循环驱动 Model → Tool → Observation；先接确定性 Fake Model。
- **Why:** 可在没有 API、网络波动和提示词变量的情况下验证 Runtime 契约、终止行为和真实工具执行。
- **Limit:** Fake Model 只证明 Runtime 闭环成立，不代表模型具备理解或生成游戏的能力。

## D-011 — MVP 工具范围与执行策略

- **Status:** Accepted for MVP
- **Decision:** 当前只开放 `read_file`、`write_file`、`run_command`。命令采用 `command + args[]`，`shell: false`，并要求命令白名单；文件路径限制在单次运行工作目录内。
- **Why:** 三种工具足以验证最小 Coding Agent 闭环；避免 shell 字符串带来的注入和不必要工具面。
- **Limit:** 路径守卫和白名单不是 OS 级沙箱。接入不可信模型或开放包管理器前必须增加独立进程/容器隔离。

## D-012 — M1 循环上限与成功标准

- **Status:** Accepted for MVP
- **Decision:** 默认最大 Agent Loop 为 6 次；MVP 成功必须由自动测试或精确运行结果证明，模型的文字声明不作为证据。
- **Why:** 最小验收通常需要写入、执行、可能一次修复和最终响应，6 次提供小幅余量且能快速终止失控循环。
- **Revisit when:** M2/M3 的运行记录显示正常任务经常需要更多迭代；届时同时加入 wall-clock 和调用成本预算，而不是只放大轮次。

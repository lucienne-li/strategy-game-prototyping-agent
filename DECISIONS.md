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

- **Status:** Open / TBD / BLOCKER for M1
- **Candidates:** Godot 4 + GDScript；浏览器 TypeScript 技术栈；其他需给出证据。
- **Decision method:** 使用同一最小卡牌任务比较自动化程度、项目文本可编辑性、headless 测试、数据可得性、依赖复杂度和交付体验。
- **Why not decide now:** 当前产品范围仍是工作假设，尚未做最小验证。

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

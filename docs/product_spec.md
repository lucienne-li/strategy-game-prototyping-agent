# Product Specification

## 1. Product Goal

### CONFIRMED

构建一个策略游戏快速原型 Coding Agent，帮助目标用户将自然语言玩法规则转化为可运行、可测试、可继续编辑的源码项目，缩短从玩法创意到首个可玩原型的时间。

目标不是通过一句话生成可商业发布的完整游戏。

### Target Users — CONFIRMED

- 独立游戏开发者；
- 游戏设计师；
- 游戏开发相关学生；
- Game Jam 团队。

### Core User Job

> 当我有一套策略玩法想法时，我希望快速得到一个规则基本正确、能够运行和测试、且源码可继续修改的原型，以判断创意是否值得进一步开发。

## 2. Research Goal

### WORKING ASSUMPTION

验证以下假设：

> 相比未经领域适配的基础代码模型，使用经过许可证与执行验证的真实游戏代码，反向构造粒度匹配、多粒度、难度可控的 SFT 数据，可能提升模型在项目级游戏代码生成、功能正确性和可执行交付方面的能力。

该假设需拆成可归因的子问题：

1. SFT 是否优于同一基础模型？
2. execution-verified 数据是否优于未验证数据？
3. multi-granularity 是否改善局部与项目级任务？
4. difficulty evolution 是否带来额外收益？
5. Agent repair loop 与模型训练的收益是否独立或互补？

“反向生成 Instruction”已有相关先例，因此项目不应仅凭该概念宣称方法原创。潜在贡献在游戏领域适配、粒度对齐、执行验证、难度控制和端到端评测。

## 3. Core Use Case

### WORKING ASSUMPTION

用户描述一个小型单人回合制卡牌策略玩法，例如卡牌、能量、状态效果、敌方意图和胜负条件。Agent：

1. 识别缺失但影响实现的约束；
2. 形成结构化 GameSpec；
3. 生成技术方案与任务顺序；
4. 创建或修改项目文件；
5. 构建并启动原型；
6. 执行确定性规则测试；
7. 根据失败反馈有限次修复；
8. 输出源码、说明、功能覆盖、评测结果和限制。

## 4. Scope Status

| 项目 | 状态 | 说明 |
|---|---|---|
| 快速玩法原型，而非商业成品 | CONFIRMED | 核心边界 |
| 可运行、可测试、可编辑源码 | CONFIRMED | 最终价值要求 |
| 在线/离线系统分离 | CONFIRMED | 用户请求不触发训练 |
| 单人 | WORKING ASSUMPTION | 降低同步与测试复杂度 |
| 2D | WORKING ASSUMPTION | 降低素材与场景复杂度 |
| 回合制 | WORKING ASSUMPTION | 便于确定性测试 |
| 卡牌策略 / 轻量 Deckbuilder | WORKING ASSUMPTION | 数据和规则结构较适合 |
| 固定技术栈 | WORKING ASSUMPTION | 支持可复现构建与评测 |
| 不要求商业级美术 | WORKING ASSUMPTION | 聚焦玩法代码 |
| GameSpec 具体 schema | TBD | 用 benchmark 驱动定义 |
| CLI、Web 或 IDE 界面 | TBD | MVP 可先 CLI，但未确认 |
| Godot 或浏览器技术栈 | TBD / M0 BLOCKER | 影响 Runtime 与测试 |

## 5. Out of Scope for MVP

以下均为 `WORKING ASSUMPTION`，不是永久排除：

- 3D场景和资产生成；
- 多人联网和服务端部署；
- RTS实时战略；
- 大型4X系统；
- 商业级生产部署；
- 商业级美术、音频和动画生成；
- 在线抓取GitHub并即时训练；
- 自动发布到游戏商店。

## 6. User-visible Inputs and Outputs

### Input — v0

- 自然语言玩法描述；
- 可选约束：技术栈、交互方式、视觉占位风格、功能优先级；
- 可选预算：最大迭代次数/时间。

### Output — v0

应逐步交付以下内容，但具体打包格式为 `TBD`：

- 完整源码；
- 依赖和版本信息；
- 可复现运行说明；
- 已实现需求清单；
- 自动评测结果和证据；
- 已知限制与未满足需求。

`GameSpec` 和开发计划可以作为中间/附加产物，但尚未确认是否必须始终面向用户展示。

## 7. Product Success Criteria

### MVP 成功不是“生成一个看起来像游戏的界面”

MVP 至少需要证明：

1. 一个真实模型能通过受控 Tool Call 创建完整项目；
2. Runtime 能真实构建/启动项目并捕获错误；
3. 至少一个核心玩法任务有自动化功能测试；
4. 测试失败能触发有限修复；
5. 最终报告不把失败包装成成功。

具体阈值在 `docs/evaluation_spec.md` 的 M0 中冻结。

## 8. Assumption Audit

### CONFIRMED

- 目标用户与快速原型价值；
- 非商业成品定位；
- 增量开发和最小架构原则；
- Evaluation-First；
- 在线与离线流程分离；
- Git 仓库作为事实来源；
- 先验证 Agent 闭环，再建设数据 Pipeline 和 SFT。

### WORKING ASSUMPTIONS

- 首版为单人、2D、回合制卡牌策略；
- 固定单一技术栈；
- 单模型会话足以承担理解、计划、生成和修复；
- 确定性状态测试可以覆盖首版核心玩法；
- GitHub 候选数据经过筛选后足以支持数据试点；
- 交付 GameSpec、计划、源码、测试和限制报告具有用户价值。

### TBD / NEEDS VALIDATION

- Godot 4 + GDScript 还是浏览器 TypeScript 技术栈；
- 目标基础模型、SFT 模型规模和训练资源；
- 第一版 Benchmark 的任务数量和复杂度；
- `2万条` 是否为目标最终样本量，以及预算是否支持；
- 允许的开源许可证集合与派生代码发布政策；
- 是否需要 GUI 自动试玩，还是首版以 headless 状态测试为主；
- 用户是否需要在生成前确认 GameSpec；
- 单次运行最大轮次、时间和成本；
- 项目级输出采用完整生成、diff 还是混合格式；
- 目标用户对该原型工作流的真实需求强度。

## 9. Contradictions and Scope Risks

1. **Evaluation-First 与 MVP 顺序并不矛盾，但需分层。** M0 先冻结小型评测契约；MVP 后用失败证据改进评测；在 SFT 对比前冻结正式 Benchmark。
2. **“完整项目生成”与 2 万条数据存在成本风险。** 不能假设每条都是完整仓库；需要多粒度样本和数据试点估算产率。
3. **Playability 不能完全由 Build Pass 替代。** 构建通过只是前置条件，至少需要规则/状态功能测试；视觉可用性可在后续引入。
4. **Repairability 不是单一模型质量指标。** 它依赖错误类型、反馈质量和修复预算，应报告条件化结果。
5. **GitHub topic 数量不等于合法可训练数据。** License、可构建性、重复、资源缺失和技术栈会大幅减少可用量。
6. **卡牌策略可能过窄。** 对 MVP 有利，但研究结论只能外推到相近规则驱动游戏，不应宣称覆盖所有策略游戏。

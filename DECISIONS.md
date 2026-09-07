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

## D-013 — M2 使用 OpenAI Responses API Adapter

- **Status:** Accepted for M2
- **Decision:** 新增一个直接调用 Responses API 的 Adapter，继续实现既有 `AgentModel.next(context)`；不引入 SDK 或工作流框架。Key 只读取 `OPENAI_API_KEY`，模型由 `OPENAI_MODEL` 配置，当前默认 `gpt-5.6`。
- **Why:** Responses API 原生提供函数工具调用；使用 Node 内置 `fetch` 可避免仅为一次 HTTP 调用增加 Dependency，并让 Provider 边界保持在一个文件内。
- **Protocol at M2:** 最初每轮最多一个 Tool Call；该限制已被 D-017 基于 B4 真实失败证据替代。最终文本仍必须以 `SUCCESS:` 或 `FAILURE:` 开头，且模型状态不是最终验收证据。
- **Reference:** [OpenAI function calling guide](https://platform.openai.com/docs/guides/function-calling)
- **Revisit when:** 需要流式输出、重试策略、供应商切换或 API SDK 提供了已测的维护收益。

## D-014 — B1 验收与最小进程隔离

- **Status:** Accepted for M2
- **Decision:** 每次 B1 创建独立临时工作目录；Agent 只能访问该目录。Repository 中的 fixture/evaluator 在 Agent 完成后独立运行。Node 命令使用白名单、timeout、`shell: false` 和 permission model 工作区授权。
- **Why:** 防止 Agent 通过修改测试宣告成功，并对生成程序本身的工作区外文件读取提供实际限制。
- **Limit:** Node permission model 不是针对恶意代码的完整安全边界，也不替代容器、资源配额或网络隔离。
- **Implementation note:** Permission allowlist 必须使用临时工作目录的 canonical real path。macOS 可能把 `/var/...` 解析为 `/private/var/...`；若直接授权未规范化路径，合法 benchmark 文件会触发 `ERR_ACCESS_DENIED`。
- **Least privilege:** Agent Node 子进程获得单一任务目录的读写权限；外部 evaluator Node 子进程只获得该目录的读取权限。

## D-015 — M3 使用任务专用外部 Evaluator

- **Status:** Accepted for M3
- **Decision:** B2/B3 各自保留显式 fixture、临时工作区准备逻辑和任务专用 evaluator；暂不抽象通用 Benchmark Framework，也不增加 Planner、Reflection 或 evaluator-feedback Agent。
- **Why:** 当前只有三个小任务，显式实现更容易确认隐藏测试边界和失败来源。先收集真实模型轨迹，再判断哪些重复逻辑值得抽象、是否确实需要自动修复轮。
- **Scope:** B2 只验证已有 `add(a,b)` 的修改；B3 只验证一次 Strike 的最小状态转换，不扩展 UI、牌库、回合、护甲或敌人 AI。

## D-016 — M4 使用无依赖 Browser + TypeScript 项目契约

- **Status:** Accepted for M4
- **Decision:** B4 从空工作区生成 `index.html`、`src/game.ts` 和 `project.mjs`，由 `node project.mjs build` 生成 `dist/game.js`；不新增包管理器权限、第三方前端框架或 Agent 工具。
- **Why:** 这是从单逻辑文件到完整可玩项目的最小增量，现有 `write_file` 和白名单 `node` 已足够验证生成、构建、DOM 交互和 HTTP 启动。
- **Evaluation boundary:** evaluator 位于 Repository；行为检查只读访问任务工作区，生成服务器按 D-018 仅可写其中的 `dist/`。模型自述不计为通过，也不把 evaluator 失败反馈给模型。
- **Trade-off:** `src/game.ts` 暂用浏览器兼容的 TypeScript 子集并采用确定性复制构建；它不是对复杂 TypeScript bundler、CSS 视觉质量或真实浏览器兼容性的完整验证。
- **Roadmap note:** 原计划的 Offline Data Pilot 顺延为 M5；M4 优先补齐真实可玩项目垂直切片，使后续数据研究拥有项目级执行契约。

## D-017 — Agent Loop 支持有界、有序的多 Tool Call 批次

- **Status:** Accepted for M4
- **Evidence:** 首次真实 B4 使用 `gpt-5.6`，在第 2 次 iteration 返回多个 Tool Calls；M2 Adapter 直接报错并终止，随后 evaluator 因缺少 `src/game.ts` 连锁失败。
- **Decision:** 保留单 Tool Call 输出，并新增有序 `tool_calls` 批次。Agent Loop 默认每轮最多执行 8 项，逐项复用既有 schema、安全、路径和命令校验。
- **Failure semantics:** 合法批次严格串行；中间项失败时保留真实 Observation 并继续后续项。超限批次整体不执行，只记录明确失败 Observation，避免不可预测的部分副作用。
- **Why:** 多文件项目自然会让支持函数调用的模型在同一响应中创建多个文件。批次执行解决已观察到的协议不兼容，不需要 Planner、Memory、RAG、Multi-Agent 或独立 repair loop。
- **Limits:** 仍保留 6 次 Model iteration 上限；默认上限使理论最大执行量为 48 个 Tool Calls，但每项继续受独立 timeout、文件大小、输出大小和工作区边界限制。

## D-018 — B4 launch 仅允许写入任务 workspace 的 dist

- **Status:** Accepted for M4
- **Evidence:** 多 Tool 修复后的真实 B4 已通过 files、build、logic 和 UI，但生成的 `project.mjs serve` 会在启动前重建 `dist/`，只读 launch 子进程因此触发 `ERR_ACCESS_DENIED FileSystemWrite`。
- **Decision:** B4 行为 evaluator 继续只读；仅 launch 子进程增加 `<canonical workspace>/dist/` 写权限。`dist/` 必须已经存在、是 workspace 根下的真实目录且不是 symlink。
- **Why:** 允许常见的 build-before-serve 行为，同时避免将写权限扩大到整个 workspace、Repository 或 evaluator 所在区域。
- **Verification:** reference serve 在启动时重建 `dist/game.js` 后通过 HTTP 检查；尝试写 `../outside.txt` 的 serve 被拒绝且没有创建外部文件。
- **Scope:** 不修改 Agent Model、Loop、Tool、Planner 或修复策略；B1–B3 权限不变。

## D-019 — M5 使用外层 evaluator-feedback repair orchestration

- **Status:** Accepted for M5
- **Decision:** 新增 `runWithEvaluatorRepair`，顺序执行现有 `runAgent` 与 external evaluator。默认最多 2 次 repair；第一次执行不计入 repair 数。
- **Feedback contract:** evaluator 失败时，将完整结构化 evaluation 与原始需求组成下一次请求；同一 workspace 保留产物，但每次 Agent run 使用新的会话事件列表。
- **Trace:** 保存每次 request、phase、`AgentRunResult` 和 evaluation；通过立即结束，耗尽返回 `repair_limit_reached`。
- **Why:** B4 已证明生成与 evaluator 可独立工作，M5 只补齐用户目标中的最小“评测失败—修改—重测”闭环，不需要 Planner、Memory、RAG 或 Multi-Agent。
- **Isolation:** evaluator 作为 Runtime callback 保留在 Agent workspace 外。Agent 只获得结果文本，不获得 evaluator 文件路径或源码。
- **Evidence:** 确定性 B4 变体第一次错误造成 5 点伤害、Enemy HP=15；收到 evaluator 失败后读取源码、改为 6、重新 build，第二次完整 evaluator 通过。真实 `gpt-5.6` 验收也在一次 repair 后通过 logic、UI 和 launch，未达到 repair limit；两次 Agent run 均使用 6 iterations，作为非阻塞效率优化项保留。

## D-020 — M6 先做人工策展的小规模数据试点

- **Status:** Accepted for M6 design / WORKING ASSUMPTION for counts
- **Decision:** 第一轮只建立 10 个 Browser/TypeScript 候选仓库的人工 manifest，期望从至少 4 个 build-passed 仓库提取约 12 个 G1/G2 单元，并获得至少 8 条通过质量检查的样本。
- **Why:** 该规模足以暴露 license、构建、重复、代码拆分、instruction 对齐和成本问题，同时避免在未知有效产率前构建 crawler 或承诺 2 万条数据。
- **Selection:** 优先许可证明确、固定 commit、Node 可构建的小型卡牌、回合制网格和轻量资源管理项目；同一 repository family 最多一个，排除 fork、教程副本、纯模板、生成产物和权利不明素材。
- **Boundary:** M6 设计阶段不抓取仓库、不运行 inverse generation、不开始 SFT；Online Agent Runtime 不读取 Data Pilot 目录。
- **Revisit when:** 第一批漏斗与成本报告完成后，基于实际通过率调整仓库数、粒度和自动化程度。

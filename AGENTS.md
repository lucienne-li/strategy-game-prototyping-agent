# Repository Instructions for Coding Agents

本文件约束所有在此仓库工作的 Coding Agent。若与用户当前明确指令冲突，以用户指令为准，并在 `DECISIONS.md` 记录重要变更。

## 1. 核心原则

1. 优先完成最小可运行垂直切片，避免过早抽象。
2. 在线 Agent Runtime 与离线数据/训练 Pipeline 必须保持独立。
3. 明确区分 LLM 决策与确定性 Runtime 行为。
4. 未实际运行的功能不得描述为“已经工作”。
5. 不隐藏错误、失败测试、降级路径或已知限制。
6. 每个 Implementation Milestone 必须有 Acceptance Criteria 和 Test。
7. 每完成一个 Milestone，更新 `TASKS.md`；重要决策更新 `DECISIONS.md`。

## 2. 状态标签

需求和设计陈述必须尽可能标记为：

- `CONFIRMED`：用户已明确确认，或已由通过的测试证明；
- `WORKING ASSUMPTION`：为继续推进而暂时采用，允许修改；
- `TBD`：尚未决定，但当前不一定阻塞开发；
- `BLOCKER`：不解决就无法安全或正确推进当前 Milestone。

不得把 `WORKING ASSUMPTION` 或 `TBD` 静默升级为 `CONFIRMED`。

## 3. 代码变更规则

- 只修改当前任务相关文件，保留用户的未提交更改。
- 引入 Dependency 前说明用途、替代方案和退出成本。
- 优先使用标准库和所选技术栈的内置能力。
- 不提前添加 Long-term Memory、Vector Database、RAG、Multi-Agent、MCP、复杂工作流框架或独立 Reflection/Planner Agent。
- 只有实际失败模式证明其必要性后，才提出新增组件，并记录证据。
- 所有 Tool/Action 必须有结构校验、工作区边界和明确超时。
- 禁止默认执行任意宿主机命令；Executor 必须使用隔离工作区和允许策略。
- 日志不得写入密钥、完整环境变量或用户敏感内容。

## 4. 测试规则

- 单元测试：Action 校验、终止条件、结果解析等确定性逻辑。
- 集成测试：Model Stub → Tool Call → Executor → Observation 的完整循环。
- 端到端测试：固定 Benchmark Task 生成项目、构建、运行和功能验收。
- LLM 非确定性测试应固定输入、记录模型版本与参数，并区分多次采样结果。
- 测试失败必须保留可诊断输出；不得通过删除断言或吞掉异常“修复”。

## 5. 文档同步要求

发生以下变化时同步文档：

| 变化 | 必须更新 |
|---|---|
| 产品范围或用户场景 | `docs/product_spec.md`, `DECISIONS.md` |
| 在线/离线架构 | `ARCHITECTURE.md`, `DECISIONS.md` |
| 指标或验收标准 | `docs/evaluation_spec.md` |
| 数据格式或筛选规则 | `docs/data_spec.md` |
| Milestone 状态 | `TASKS.md` |
| 安装、运行命令 | `README.md` |

## 6. 当前禁止事项

在相应 Milestone 获得确认前，不得：

- 批量抓取 GitHub；
- 下载来源或许可证不清晰的训练数据；
- 启动 SFT；
- 构建完整产品 UI；
- 实现 3D、多人联网、RTS 或 4X 支持；
- 声称评测集已被冻结；
- 将生成代码直接部署到生产环境。

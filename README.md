# Strategy Game Prototyping Agent

一个面向独立游戏开发者、游戏设计师、游戏开发学生和 Game Jam 团队的策略游戏快速原型 Coding Agent。

本项目希望缩短以下路径：

> 自然语言玩法规则 → 结构化规格 → 开发计划 → 可运行原型 → 自动测试 → 迭代修复 → 可编辑源码项目

本项目不承诺通过一句话生成可商业发布的完整游戏。第一阶段关注可运行、可测试、可继续修改的玩法原型。

## 当前状态

项目处于 **Phase 0：需求、架构与评测定义**。

- 尚未实现 Agent；
- MVP 技术栈已通过最小实验暂定为 Browser + TypeScript；
- 尚未选择模型供应商或模型；
- 尚未开始 GitHub 数据收集或 SFT；
- 当前文档中的状态标签为 `CONFIRMED`、`WORKING ASSUMPTION` 和 `TBD`。

## 文档导航

- [ARCHITECTURE.md](ARCHITECTURE.md)：在线 Agent、离线数据系统与模块边界
- [TASKS.md](TASKS.md)：Roadmap、Milestone 与当前进度
- [DECISIONS.md](DECISIONS.md)：产品、架构和技术决策记录
- [AGENTS.md](AGENTS.md)：后续 Coding Agent 的仓库工作规则
- [docs/product_spec.md](docs/product_spec.md)：产品目标、用户、范围与假设
- [docs/evaluation_spec.md](docs/evaluation_spec.md)：评测任务、指标、基线和验收规则
- [docs/data_spec.md](docs/data_spec.md)：离线数据来源、清洗、反向指令与 SFT 格式

## 安装与运行

Agent 尚未实现。仓库包含一个已验证的技术栈选择实验，运行方式见 [experiments/runtime-selection/RESULTS.md](experiments/runtime-selection/RESULTS.md)。

## 下一步

继续执行 **M0：范围与评测契约冻结**，定义 MVP 输入/输出契约、首批 Benchmark Tasks 和成功条件。详见 [TASKS.md](TASKS.md)。

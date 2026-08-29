# Strategy Game Prototyping Agent

一个面向独立游戏开发者、游戏设计师、游戏开发学生和 Game Jam 团队的策略游戏快速原型 Coding Agent。

本项目希望缩短以下路径：

> 自然语言玩法规则 → 结构化规格 → 开发计划 → 可运行原型 → 自动测试 → 迭代修复 → 可编辑源码项目

本项目不承诺通过一句话生成可商业发布的完整游戏。第一阶段关注可运行、可测试、可继续修改的玩法原型。

## 当前状态

项目处于 **M2：真实 Model Adapter 垂直切片**。

- 已用确定性 Fake Model 跑通 Model → Tool Call → Executor → Observation 闭环；
- 已实现 OpenAI Responses API Adapter 和独立 B1 验收器；
- MVP 技术栈已通过最小实验暂定为 Browser + TypeScript；
- 真实 API 运行需要通过环境变量提供 `OPENAI_API_KEY`；
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

需要 Node.js 24+。Node 子进程使用 permission model 限制任务工作区外的文件访问。

```bash
npm install
npm test
npm run demo -- ./agent-workspace "创建一个 TypeScript 文件并验证输出 hello agent"
```

Demo 会在指定工作目录创建 `hello-agent.ts`，以无 shell 的 `node` 子进程执行，并输出完整 Agent 事件记录。当前工具范围为 `read_file`、`write_file` 和 `run_command`。

真实模型 B1 运行：

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6" # 可选
npm run b1:real
```

Key 只从环境变量读取；不要写入 `.env.example`、源码、日志或 commit。每次 B1 运行创建独立临时工作目录，结束后由仓库外部的验收逻辑检查目标文件和真实执行结果。

技术栈选择实验见 [experiments/runtime-selection/RESULTS.md](experiments/runtime-selection/RESULTS.md)。

## 下一步

下一步是在配置 API Key 后完成一次真实 B1 运行并记录结果；通过后再评审 M2 分支。详见 [TASKS.md](TASKS.md)。

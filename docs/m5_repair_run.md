# M5 Evaluator-Feedback Repair Run

## Test task

`benchmarks/b4-repair/task.json` 定义一个可重复的 B4 变体。第一次候选项目完整且可 build，但 `strike` 错误地造成 5 点而不是 6 点伤害。

## Deterministic execution trace

### Attempt 1 — Initial

- Agent result: `success`（模型认为初始候选已完成）
- Project files: generated and built
- External evaluator: `passed = false`
- Observed behavior: Strike 后 Enemy HP 为 15，预期为 14

这个结果同时说明 Agent 的成功文本不等于任务成功，是否进入修复只由 external evaluator 决定。

### Attempt 2 — Repair

修复请求包含原始任务和第一次完整 evaluation。Agent 在同一 workspace 执行：

1. `read_file src/game.ts`；
2. 将 Strike Damage 从 5 修改为 6；
3. `run_command node project.mjs build`。

第二次 external evaluator 结果：

- `passed = true`；
- `logicPassed = true`；
- `uiPassed = true`；
- `launchPassed = true`。

最终状态为 `success`，`repairsUsed = 1`，两次 attempt 的 request、Agent events 和 evaluation 均保留在返回 trace 中。

## Repair-limit test

另一个确定性模型收到反馈后不修改文件。在 `maxRepairs = 1` 时，Runtime 保存 initial 和 repair 两次失败记录，并以 `repair_limit_reached` 停止，不虚报成功。

## Deterministic test scope

上述确定性测试只证明 repair orchestration、反馈传递、Evaluator 隔离和终止预算能够工作；真实模型证据记录如下。

## Real-model acceptance

运行 `npm run b4:repair:real`。该入口让真实模型在首轮明确生成 Strike Damage=5 的完整项目，以稳定触发 B4 evaluator；repair round 则收到完整失败 JSON，并以标准 B4 的 Damage=6 需求为修复目标。

2026-09-07 的本地真实运行结果：

- model: `gpt-5.6`；
- final status: `success`；
- repairs used: `1`；
- reached repair limit: `false`；
- initial Agent iterations: `6`；
- initial Tool Call sequence: 本次上报摘要未包含，保留为 `TBD`，不推测补写；
- initial evaluator: `passed = false`, `logicPassed = false`；
- initial failure: Strike 后 Enemy HP 实际为 15，预期为 14；
- repair Agent iterations: `6`；
- repair Tool Call sequence: 本次上报摘要未包含，保留为 `TBD`，不推测补写；
- final evaluator: `passed = true`, `logicPassed = true`, `uiPassed = true`, `launchPassed = true`。

结论：真实模型成功接收 evaluator 失败反馈并在一次 repair 内修复项目，M5 验收通过。两轮 Agent 都达到当前单次运行上限 6 iterations，但最终 evaluator 已通过，因此这是效率和终止行为的后续优化项，而不是 M5 blocker。后续应区分“第 6 轮正常返回 final”与“达到 `max_iterations`”，并观察真实任务上的平均 iterations，再决定是否调整提示或预算。

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

## Scope

这是确定性集成测试，不是 `gpt-5.6` 的真实 repair 成功率实验。当前结论只证明 repair orchestration、反馈传递、Evaluator 隔离和终止预算能够工作。

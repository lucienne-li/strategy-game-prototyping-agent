# Data Pilot Workspace

该目录只承载 M6 小规模离线数据试点，与 `src/` 中的 Online Agent Runtime 分离。

```text
data_pipeline/
├── README.md
├── manifests/     # 人工策展的仓库候选与固定 commit
├── samples/       # 提取后的代码单元与 instruction 候选元数据
└── reports/       # license/build/duplicate/quality/cost 汇总
```

首轮实际试点已经完成：5 个固定仓库全部通过许可证与构建检查，提取 8 个 G1/G2 单元，保留 7 条样本并拒绝 1 条。第二轮在同一批固定仓库上形成 25 个候选，经独立本地模型复核、精确去重和探索性近重复检查后保留 24 条、拒绝 1 条。结果分别见 `reports/pilot-report.md` 与 `reports/expansion-v2-report.md`。

第二轮最小流水线为：

```text
fixed manifests + curated extraction spec
→ build_expansion.py
→ review_candidates.py
→ finalize_dataset.py
→ accepted-v2.jsonl / rejected-v2.jsonl
```

它已经把阶段输入输出整理成可批处理文件，但代码单元选择仍是人工策展，reviewer 也尚未用人工双标校准，因此不能描述为可无人值守的大规模数据平台。

## M8 batch scale-up

`scale/` 将影响规模扩张的最小能力固化为可恢复批处理：

```text
candidates.json
→ batch_repositories.py
→ group_families.py
→ extract-units.mjs
→ validate-targets.mjs
→ generate_instructions.py (strict scoped JSON, 512-token budget)
→ deterministic quality gates
→ review_instructions.py (strong pass/fail reviewer)
→ finalize_scale.py
→ accepted.jsonl / rejected.jsonl
```

使用一个临时 checkout 根目录运行完整流程：

```bash
export SCALE_CHECKOUT_ROOT="$(mktemp -d)"
npm run data:scale:run
```

各阶段以 JSONL 原子写入 checkpoint；重新运行时跳过已绑定 commit/hash 的完成项。`repositories.jsonl` 保留 license、install、build 与拒绝证据，`reviews.jsonl` 将复核结果绑定到 target SHA-256，最终筛选同时执行 family cap、target 与 instruction 近重复 gate。该流程不包含自动 GitHub discovery、分布式队列或数据库。

旧流程的 48 条抽检和 186 条 freeze 保留为 v1 历史证据，但不再作为正式训练输入。quality-v2 只重处理已有 440 units，运行入口如下；需要 `OPENAI_API_KEY`，生成器和 reviewer 模型可分别由参数或 `DATA_GENERATOR_MODEL` / `DATA_REVIEWER_MODEL` 配置，默认均为 `gpt-5.6`：

```bash
npm run data:scale:quality-repair
```

命令按 target validation、结构化生成、确定性预检、强模型 review 和 finalization 顺序执行并可断点恢复。没有 strong review 的候选一律 reject；全量完成并生成新的 quality-v2 freeze 前，Qwen3-4B 正式训练保持暂停。

约束：

- 不提交第三方 Repository checkout、`node_modules`、构建产物或权利不明确的素材；
- manifest 必须先固定 source commit，再进行构建或提取；
- rejected candidate 仍保留元数据和 reason code，但不保存无权再分发的代码；
- 原始模型输出与最终通过人工检查的样本必须分开。
- 试点只提交获许可的代码片段及 attribution，不提交完整第三方 checkout、依赖、素材或构建产物。

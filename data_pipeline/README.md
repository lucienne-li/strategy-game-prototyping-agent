# Data Pilot Workspace

该目录只承载 M6 小规模离线数据试点，与 `src/` 中的 Online Agent Runtime 分离。

```text
data_pipeline/
├── README.md
├── manifests/     # 人工策展的仓库候选与固定 commit
├── samples/       # 提取后的代码单元与 instruction 候选元数据
└── reports/       # license/build/duplicate/quality/cost 汇总
```

首轮实际试点已经完成：5 个固定仓库全部通过许可证与构建检查，提取 8 个 G1/G2 单元，保留 7 条样本并拒绝 1 条。运行 `npm run data:pilot:validate` 可验证 manifest 和 JSONL 制品；结果见 `reports/pilot-report.md`。

约束：

- 不提交第三方 Repository checkout、`node_modules`、构建产物或权利不明确的素材；
- manifest 必须先固定 source commit，再进行构建或提取；
- rejected candidate 仍保留元数据和 reason code，但不保存无权再分发的代码；
- 原始模型输出与最终通过人工检查的样本必须分开。
- 试点只提交获许可的代码片段及 attribution，不提交完整第三方 checkout、依赖、素材或构建产物。

# Data Pilot Workspace

该目录只承载 M6 小规模离线数据试点，与 `src/` 中的 Online Agent Runtime 分离。

```text
data_pipeline/
├── README.md
├── manifests/     # 人工策展的仓库候选与固定 commit
├── samples/       # 提取后的代码单元与 instruction 候选元数据
└── reports/       # license/build/duplicate/quality/cost 汇总
```

当前仅建立目录契约，尚未收集仓库或实现 Pipeline。完整试点方案见 `docs/data_pilot_plan.md`，长期数据规范见 `docs/data_spec.md`。

约束：

- 不提交第三方 Repository checkout、`node_modules`、构建产物或权利不明确的素材；
- manifest 必须先固定 source commit，再进行构建或提取；
- rejected candidate 仍保留元数据和 reason code，但不保存无权再分发的代码；
- 原始模型输出与最终通过人工检查的样本必须分开。

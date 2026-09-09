# Offline Data Specification

## 1. Purpose and Boundary

本文件描述离线研究/训练 Pipeline。它不属于真实用户请求时的在线 Agent 流程。

研究目标是构造可追溯、许可明确、执行验证、粒度匹配、多粒度且难度可解释的 `(instruction, target)` 数据，用于 SFT 和对照实验。

首轮 M6 Pilot 已产出 5 个仓库 manifest、8 个提取单元和 7 条 accepted JSONL；这不代表大规模数据已收集或训练效果已验证。

## 2. Proposed Pipeline

```text
Repository discovery
→ provenance capture
→ license policy
→ repository family grouping
→ cleaning and deduplication
→ reproducible build/run verification
→ project/code segmentation
→ inverse instruction generation
→ taxonomy and difficulty features
→ alignment/granularity/solvability evaluation
→ human audit
→ versioned splits
→ SFT formatting
```

## 3. Repository Discovery

### WORKING ASSUMPTION

候选来源以 GitHub 上公开的、与卡牌/回合制策略和目标技术栈相关的仓库为主，也可包含许可证明确的 Game Jam 项目。

Topic 搜索结果只能作为候选入口，不能作为可训练数据量。必须记录：

- repository URL / stable ID；
- owner/name；
- commit SHA；
- fork/parent 信息；
- 抓取时间；
- license 文件和检测结果；
- 目标技术栈与版本；
- 是否包含外部素材或子模块。

目标“2万条”为 `TBD`。在数据试点得到 repository→usable sample 的真实产率和单样本成本前，不制定规模承诺。

## 4. License and Provenance

### CONFIRMED POLICY

只接收具有明确 `LICENSE` 文件的 MIT、BSD-2-Clause、BSD-3-Clause 和 Apache-2.0 项目。GPL、AGPL、无许可证与许可证不明确的项目不进入当前试点。不能仅依赖仓库页面的自动标签；应保存许可证文件位置、文本哈希、检测结果和人工复核状态。

每条样本至少保留：

- source repository and commit；
- source file paths and line/function identifiers where possible；
- license identifier and notice requirements；
- transformation history；
- generator/evaluator model versions；
- pipeline version；
- build verification result；
- dataset split and family ID。

许可证不明确、来源不可追溯或资源权利混杂的样本默认拒绝或进入人工复核队列。

## 5. Cleaning and Repository Validation

### Repository-level filters

- 排除空仓库、仅文档、仅素材、仅网站或无游戏代码项目；
- 排除无法解析依赖且无法合理修复的项目；
- 将 fork、模板复刻和镜像归入同一 repository family；
- 识别生成代码、vendor、build output 和第三方依赖，避免作为目标答案；
- 扫描密钥、恶意脚本和异常大文件；
- 在隔离环境、固定依赖和超时下构建。

### Verification states

- `DISCOVERED`
- `LICENSE_ACCEPTED`
- `CLEANED`
- `BUILD_PASSED`
- `LAUNCH_PASSED`
- `SEGMENTED`
- `REJECTED`（必须有 reason code）

不是所有函数级样本都要求完整项目启动，但必须记录其验证层级，不能把静态解析伪装成运行验证。

## 6. Granularity and Target Types

| Granularity | Instruction 范围 | Target 形式 | 适用任务 |
|---|---|---|---|
| G1 Mechanism | 单一函数/类/规则 | function/class/file snippet with context | 生成、补全、修复 |
| G2 Subsystem | 一组紧密相关机制 | one or several files / patch | 功能添加、局部实现 |
| G3 Cross-system | 多子系统交互 | multi-file patch / selected project files | 集成、修改、修复 |
| G4 Project | 完整小型原型 | project tree or structured actions | 从零生成 |

目标答案格式尚未确定，可为完整文件、unified diff 或结构化文件动作。选择时必须保证：

- 上下文足够；
- target 可应用/可运行；
- 指令不要求 target 范围外的隐藏信息；
- 小指令不配大型无关 Repository；
- 项目级答案排除缓存、构建产物和无权分发素材。

## 7. Inverse Instruction Generation

给定经过验证的代码 `y`，生成一个或多个候选 Instruction `q`，再经过质量评测形成 `(q, y)`。

生成器应获得与目标粒度匹配的上下文，例如：

- 目标代码；
- 必要相邻接口；
- 可观察行为或测试；
- 项目技术栈；
- 禁止泄漏答案实现细节的规则。

候选 Instruction 必须：

- 描述代码真实实现的行为；
- 不引用不存在的功能；
- 包含完成任务所需约束；
- 不逐行复述答案；
- 与 G1—G4 粒度匹配；
- 能产生明确验收条件。

同一 target 可以对应多个语言风格或复杂度的 Instruction，但语义近重复需要控制权重，不能用简单改写虚增数据量。

## 8. Taxonomy

每条样本建议记录：

- game subtype；
- mechanism tags（抽牌、能量、伤害、护甲、状态、AI、奖励等）；
- task type（generate/add/modify/fix/complete）；
- granularity G1—G4；
- target format；
- difficulty evidence；
- verification type；
- file/component span；
- external asset dependency；
- language/engine version。

具体标签集合需通过数据试点归纳，当前为 `TBD`，不提前设计封闭的大型本体。

## 9. Difficulty

D1—D4 是从底层特征派生的展示标签，而不是生成模型凭感觉直接标注。

底层特征参见 `docs/evaluation_spec.md`，至少包括机制数、依赖深度、文件/组件跨度、状态转换和验证轨迹。

### Difficulty evolution

难度演化必须改变真实任务，而非只增加文字：

- 增加新机制；
- 增加跨机制约束；
- 扩展单文件到多文件；
- 引入状态持久性或回合顺序；
- 添加错误处理与回归要求；
- 从局部实现扩展到完整游戏循环。

演化后的 Instruction 只有在存在对应、可验证 target 时才能进入 SFT。不得将原代码未实现的新要求配给旧 target。

## 10. Quality Gates

候选样本依次通过：

1. schema/provenance 完整；
2. license policy；
3. exact/family/near duplicate；
4. target 可解析/可应用；
5. 适用时 build/run/test；
6. Instruction-code alignment；
7. granularity match；
8. solvability and ambiguity；
9. difficulty evidence；
10. 人工抽检与数据分布审查。

任何自动 Judge 都必须保存 rubric、模型版本、原始输出和阈值，并用人工标注样本校准。

## 11. Split and Leakage Policy

- 先按 repository family 分组，再划分 train/validation/test；
- fork、模板、镜像和高相似项目不得跨 split；
- Benchmark 项目及其家族不得生成训练样本；
- 测试任务冻结后，不根据模型错误修改测试答案来提高分数；
- 记录模型预训练污染无法完全排除的限制；
- 对公开知名项目单独报告敏感性分析。

## 12. Proposed SFT Record

```json
{
  "sample_id": "stable-id",
  "instruction": "Implement ...",
  "context": {
    "engine": "TBD",
    "language": "TBD",
    "provided_files": []
  },
  "target": {
    "format": "files|diff|actions",
    "content": "..."
  },
  "metadata": {
    "source_repo": "...",
    "source_commit": "...",
    "source_paths": [],
    "license": "TBD",
    "repository_family_id": "...",
    "granularity": "G1|G2|G3|G4",
    "difficulty": "D1|D2|D3|D4",
    "difficulty_features": {},
    "mechanisms": [],
    "verification": {}
  }
}
```

这是概念格式，不是冻结 schema。

## 13. Pilot before Scale

在批量构建前先做小规模 Pilot，回答：

- 目标技术栈实际可发现多少候选项目？
- 许可证通过率是多少？
- 可复现构建/运行通过率是多少？
- 每个 Repository 能产生多少高质量、非重复样本？
- 各粒度样本的人工接受率是多少？
- 单条合格样本的模型、运行和人工成本是多少？
- 现有难度特征能否获得合理标注一致性？

只有 Pilot 结果支持后，才决定是否扩展到约 2 万条或调整目标规模。

M6 的实际结果见 `data_pipeline/reports/pilot-report.md`：5 个手工策展仓库均通过保守许可证政策和构建检查，8 个 G1/G2 单元中保留 7 条、拒绝 1 条。该规模仅允许验证格式和流程，不能证明 SFT 有效性。

## 14. M7 Small Expansion Result

M7 继续使用上述 5 个固定 commit，没有引入未重新验证 license/build 的来源。`pipeline/expansion-units.json` 定义 18 个新增代码范围；与 7 个 Pilot accepted records 合并后形成 25 个候选。

确定性阶段与制品：

1. `build_expansion.py`：从固定 checkout 提取指定范围，绑定 repo/commit/path/lines/license/family/hash；
2. `review_candidates.py`：使用独立本地模型检查 alignment、granularity match、solvability，保存原始输出和耗时；
3. `finalize_dataset.py`：校验 review 与 target hash，拒绝无效/失败 review，执行精确 hash 和 token Jaccard 近重复检查；
4. `accepted-v2.jsonl`：24 条 G1/G2 chat records；`rejected-v2.jsonl`：1 条 fail-closed 审计记录。

当前 24 条 accepted records 分布为 13 G1 / 11 G2、20 MIT / 4 BSD-2-Clause、5 个 repository families。训练与 6 个 project-authored holdout family 的交集为零。

### Scale assessment

Pipeline 的阶段边界、schema、provenance、review 和 rejection audit 已可复现，适合继续做小规模策展。以下能力仍是扩到 500 条前的缺口：

- 自动 discovery、clone/commit pin、license evidence 与 sandboxed build queue；
- TypeScript AST/符号和依赖上下文提取，替代手工行号范围；
- 更强的 inverse-instruction generator 与 reviewer，并用人工双标样本校准；
- 跨仓库 clone/fork/family 和语义近重复检测；
- dataset version/split manifest、可恢复任务状态、token/时间/人工成本遥测；
- benchmark contamination 自动阻断。

因此当前结论是“半自动 Pipeline 结构可扩展”，不是“已可直接自动生产 2 万条”。

## 15. M8 Batch Scale-up Result

M8 使用 28 个手工发现的 Browser/TypeScript 候选，并把之后的 clone、固定 commit、license/install/build、family、提取、反向 instruction、独立复核和最终筛选实现为可恢复批处理。仓库漏斗为 28 → 17；拒绝 11 个的原因包括 build 4、install 3，以及缺少 build script、缺少 package manifest、license 不明确/不允许和 timeout 各 1。

17 个通过仓库中，规范化 TypeScript 文件 hash 没有发现满足“至少 3 个共享文件且 Jaccard ≥ 0.30”的跨仓合并证据，因此保留 17 个 family。两个通过仓库没有可提取单元；其余 15 个 family 贡献了 440 个唯一 target，经独立复核和确定性 gate 后保留 334 条（G1 191 / G2 143），拒绝 106 条。最终 gate 明确拒绝引用未提供“guidelines/constraints”的欠规格 instruction，没有为达到上限而放宽条件。

机器可读制品位于 `data_pipeline/scale/`：

- `repositories.jsonl`：固定 commit、许可证、安装、构建和拒绝证据；
- `units.jsonl`：符号范围、上下文、family 和 target hash；
- `instructions.jsonl` / `reviews.jsonl`：生成与独立复核原始结果；
- `accepted.jsonl` / `rejected.jsonl`：训练输入与 fail-closed 审计。

本轮初筛达到 300–500 条实验规模，但正式训练前的 48 条分层抽检仅接受 14 条，暴露出 instruction 截断、欠规格和直接行为错配。全量应用明显缺陷 gate 并保留抽检决定后，正式冻结集为 186 条，而不是继续将 334 条都视为合格。候选 discovery、语义 family 检测和更强 reviewer 校准仍是未来扩张的主要缺口；本阶段按用户要求不再扩大数据。

此外，当前 install 使用 `--ignore-scripts`，但随后执行的仓库 build 仍是第三方代码，临时目录不等于安全沙箱。扩到无人值守批量处理前必须加入一次性容器、网络/CPU/内存/磁盘限制；这属于离线构建安全边界，不应通过放宽 Online Agent Runtime 权限解决。

## 16. Quality-v2 Repair Pipeline

正式训练已暂停。quality-v2 只重处理既有 440 个 code units，不发现或下载新仓库：

```text
units.jsonl
→ target structure / narrow behavior validation
→ scoped structured instruction generation
→ deterministic consistency gates
→ gpt-5.6 pass/fail review
→ duplicate/family gates
→ accepted.jsonl + rejected.jsonl
```

生成输出必须包含 `target_file`、`target_symbol`、`expected_behavior`、`constraints`、`required_context` 和完整 `instruction`。Responses API 使用严格 JSON schema 与 512-token 输出预算；未完成响应会重试，最终失败记为 `GENERATION_FAILED`，不会从半截 JSON 或文本恢复。

确定性 gate 检查完整句、45–140 words、精确文件与 symbol scope、behavior/constraint 在 instruction 中的覆盖、required context 是否属于已声明上下文、G1/G2 范围、target delimiter/symbol 结构以及 duplicate/family cap。任何一项失败均在调用强 reviewer 前直接 reject。通过者再由 `gpt-5.6` 独立判断 behavior consistency、granularity match 和 missing context，只有明确 `pass` 才可进入最终集。

行为验证采取保守策略：仅对无参数、返回安全 literal/object 且可在 Node permission model 中独立执行的代码运行 deterministic harness；其余标为 `not_eligible`，不以 repository build 冒充 unit-level functional pass。当前静态重检发现 438/440 结构通过、2 条不完整 target 失败，1 条满足并通过窄行为执行条件。

### Dependency boundary

quality-v2 的 Python 阶段只使用标准库，依赖文件为 `data_pipeline/requirements-quality.txt`；Node target validation 复用仓库已有 devDependencies。本地质量处理不得安装 `training/requirements-scale.txt`，其中的 PyTorch、Accelerate 和 bitsandbytes 只属于云 GPU QLoRA 训练。

## 17. Data Pipeline v3 candidate and freeze contract

`data_pipeline/v3/` 复用既有 license/build/family 与 quality-v2 fail-closed 边界，将通过结构验证的单元组合为 D1 单机制、D2 同文件多符号子系统、D3 跨文件多系统和 D4 至少三文件项目切片。每个不同 target 只分配一个 task type；非 generation 样本必须包含路径一致、实质不同的 seed。模型请求失败单独 checkpoint，不能计为质量 reject。

生成阶段只产生 candidate manifest。只有用户检查 summary/rejects 后显式运行 freeze，且 accepted 为 2,500–3,500、零未解决请求失败、全部自动与强 review 门禁通过时，才写入 dataset SHA-256 freeze manifest。

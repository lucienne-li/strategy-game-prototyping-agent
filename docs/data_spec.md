# Offline Data Specification

## 1. Purpose and Boundary

本文件描述离线研究/训练 Pipeline。它不属于真实用户请求时的在线 Agent 流程。

研究目标是构造可追溯、许可明确、执行验证、粒度匹配、多粒度且难度可解释的 `(instruction, target)` 数据，用于 SFT 和对照实验。

当前阶段只定义规范；不得据此假定数据已收集、已获许可或已验证。

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

### POLICY TBD / BLOCKER before collection scale-up

需要由项目负责人确认允许许可证集合和派生代码发布方式。不能仅依赖仓库页面的自动标签；应保存许可证文本、检测结果和人工复核状态。

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

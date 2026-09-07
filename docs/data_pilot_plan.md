# M6 Data Pilot Plan

## 1. Goal and boundary

M6 用小规模、人工策展的 Browser/TypeScript 游戏代码验证离线数据链路是否可行，并估算一条合格 `(instruction, code target)` 样本的构建成本。

本阶段不做批量 GitHub 抓取、不训练模型、不承诺 2 万条数据、不建立向量数据库，也不把离线数据接入 Online Agent。

## 2. Pilot size

### WORKING ASSUMPTION

- 候选仓库：10 个；
- 期望 license 与 build 检查后保留：至少 4 个；
- 候选代码单元：约 12 个，每个通过仓库最多提取 3 个；
- 每个代码单元生成：1—2 个候选 instruction；
- 最终目标：至少 8 条通过一致性和粒度检查的样本。

这个规模用于发现流程问题和估算产率，不用于判断最终训练效果。若少于 4 个仓库能够构建，优先分析失败原因，不补抓大量仓库来掩盖失败率。

## 3. First-batch selection

第一批使用人工建立的候选清单，不实现 crawler。每个候选必须固定到 commit SHA，并满足：

- GitHub 公开仓库，主要游戏逻辑为 TypeScript，能在浏览器运行；
- 优先轻量卡牌、回合制网格或资源管理原型；
- 许可证文件完整且可识别；在正式政策确认前，试点优先考察 MIT、BSD-2-Clause、BSD-3-Clause 或 Apache-2.0，许可证结论仍需人工复核；
- 有明确 build 命令，Node.js 环境即可构建，不依赖外部账号、私有服务或商业 SDK；
- 排除 fork、教程逐字副本、纯模板、仅素材仓库、压缩产物和主要由生成文件组成的仓库；
- 优先小型项目，便于理解机制边界和复现构建；
- 代码和素材权利分开记录，只提取许可证允许且来源清楚的代码范围。

为减少单一模板偏差，候选清单建议覆盖：

| 维度 | 配额建议 |
|---|---:|
| 卡牌 / Deckbuilder | 4 |
| 回合制网格 / Tactics | 3 |
| 轻量资源管理或塔防机制 | 3 |
| Vanilla TypeScript / Vite | 至少 6 |
| Phaser + TypeScript | 最多 4 |

这些配额是发现阶段目标，不是最终数据分布承诺。同一 repository family 最多保留一个候选。

## 4. Minimal flow

1. **Candidate manifest**：人工录入 URL、commit、license 声明、技术栈、发现时间和预期 build 命令。
2. **License check**：保存 SPDX 检测、LICENSE 文件位置和人工复核状态；不明确则拒绝。
3. **Build check**：在隔离临时目录按固定 commit 安装并构建，记录命令、Node 版本、timeout、stdout/stderr 和 exit code。
4. **Duplicate check**：先按 repository family、commit 和规范化内容 hash 去重；近重复只生成报告并进入人工判断。
5. **Code-unit extraction**：第一轮只做 G1 单机制和 G2 局部子系统，连同必要接口、调用上下文和测试一起保存。
6. **Inverse generation**：使用固定 prompt/model 从 code target 生成 1—2 个 instruction，记录原始响应、tokens、latency 和模型版本。
7. **Quality check**：规则检查 schema/provenance，再由人工 rubric 检查行为一致性、上下文充分性、可解性和粒度匹配。
8. **Cost report**：统计候选到合格样本的漏斗、API 成本、构建时间、人工复核分钟数和失败原因。

## 5. Minimal records

### Repository manifest

- `repository_id`, `url`, `commit_sha`, `family_id`；
- `discovered_at`, `language`, `framework`；
- `license_declared`, `license_file`, `license_review_status`；
- `build_command`, `node_version`, `build_status`；
- `rejection_reason` and raw evidence paths。

### Extracted sample

- `sample_id`, source repository/commit/paths；
- `granularity` (`G1` or `G2`) and mechanism tags；
- provided context and exact target；
- generated instruction and generation metadata；
- exact/family/near-duplicate evidence；
- build/test verification；
- alignment, granularity, solvability and human-review results。

### Cost row

- discovery/review/build/generation timestamps；
- model input/output tokens and reported API cost；
- build duration and retry count；
- human review minutes；
- accepted/rejected and reason。

单条可用样本成本分别报告 API 美元、计算时间和人工分钟数；在人工时薪未确定时，不强行合并成一个美元数字。

## 6. Acceptance criteria

- 10 个候选均有固定 commit 和 provenance；
- 每个候选都有明确 license/build/duplicate 结果或 rejection reason；
- 至少 4 个仓库完成可复现 build，或形成可解释的低通过率报告；
- 约 12 个 G1/G2 单元均能追溯到具体源文件和上下文；
- 至少 8 条样本通过 instruction-code alignment 与 granularity review；
- 输出真实漏斗和单位成本，不用候选 instruction 数冒充合格样本数。

## 7. Open decisions

- `BLOCKER before code redistribution`：最终允许的许可证集合与 NOTICE/attribution 方式；
- `TBD`：候选仓库具体名单；
- `TBD`：inverse-instruction 使用的模型和温度；
- `TBD`：近重复阈值；试点先保留相似度证据，不自动删除边界样本；
- `TBD`：人工复核人力成本的换算单价。

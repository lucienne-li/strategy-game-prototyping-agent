# Pilot Samples

存放派生样本的元数据和经确认可保存的 G1/G2 target。第三方完整仓库、依赖目录、构建产物和权利不明确素材不得复制到这里。

候选 instruction 与通过 quality gate 的 accepted sample 必须使用不同状态，避免把未经检查的生成结果计入有效数据量。

首轮产物为 `accepted.jsonl`（7 条 SFT chat records）和 `rejected.jsonl`（1 条带 reason code 的审计记录）。运行 `npm run data:pilot:validate` 检查来源、哈希、许可证、粒度与质量状态。

# M8 Final Quality Audit and Experiment Freeze

## Audit design

The audit uses seed `m8-freeze-audit-v1` and selects 48 records from the 334-record pre-freeze dataset. Each of the six category/granularity strata contributes eight records. Family round-robin selection covers all 15 repository families that produced accepted candidates.

| Stratum | Reviewed |
|---|---:|
| Card G1 | 8 |
| Card G2 | 8 |
| Tactics G1 | 8 |
| Tactics G2 | 8 |
| Tower-defense G1 | 8 |
| Tower-defense G2 | 8 |

## Findings

| Decision | Count |
|---|---:|
| Accepted in manual audit | 14 |
| Rejected in manual audit | 34 |
| Truncated instruction | 17 |
| Underspecified or granularity mismatch | 11 |
| Direct instruction-code mismatch | 6 |

The dominant failure was generation truncation caused by the pilot's short output budget. Other obvious cases asked for APIs absent from the target, described different numerical behavior, or referred to unspecified “provided” rules. The reviewed records and notes are preserved in `data_pipeline/scale/quality-audit-reviewed.jsonl`.

## Minimal correction

No new samples, reviewer service or regeneration system was added. The finalizer now rejects incomplete terminal text and a small explicit set of references to missing rules/signatures. The 34 audited failures remain explicit rejection evidence. Re-running finalization reduced the trainable set from 334 to 186 rather than silently training on known bad records.

## Frozen experiment

- Dataset: 186 samples, 15 repository families, SHA-256 bound in `freeze-manifest.json`.
- Distribution: G1 128, G2 58; card 43, tactics 75, tower-defense 68.
- Holdout: 24 fixed tasks with zero training-family overlap.
- Model comparison: Base `Qwen/Qwen3-4B` vs the same base plus 186-sample QLoRA.
- Fixed execution: greedy, thinking disabled, 512 new tokens; 4 Agent iterations; 8 Tool Calls per iteration; 1 repair.
- Status: frozen and locally verified; not trained in the CPU-only workspace.

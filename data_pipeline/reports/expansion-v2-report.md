# Small Data Expansion v2

## Result

The M6 pilot was expanded from 7 to 25 candidates without adding new repository families. A separate local Qwen2.5-Coder-0.5B-Instruct review pass evaluated instruction-code alignment, G1/G2 granularity match, and solvability. Deterministic target hashing and token-set Jaccard filtering then produced 24 accepted records and 1 rejected record.

| Stage | Count |
|---|---:|
| Fixed, license/build-approved repositories | 5 |
| Pilot records carried forward | 7 |
| New curated code units | 18 |
| Review candidates | 25 |
| Valid independent-review outputs | 24 |
| Accepted SFT records | 24 |
| Rejected records | 1 |

Accepted distribution:

- 13 G1 and 11 G2 records;
- 20 MIT and 4 BSD-2-Clause records;
- 7 `zhithead`, 6 `Pazaak`, 4 `sample-tactics`, 4 `react-isometric-game`, and 3 `phaser3-tower-defense` records;
- no exact duplicate target; maximum accepted token-set Jaccard similarity was 0.50, below the exploratory 0.80 rejection threshold.

The recorded local review pass took 252.8 seconds total (5.1–17.4 seconds per candidate) on this CPU environment. Instruction authoring and human work minutes were not instrumented, and local compute is not converted to a dollar cost, so this is not yet a full per-accepted-sample cost estimate.

`exp-pazaak-pools-017` was rejected with `INDEPENDENT_REVIEW_INVALID`: the small reviewer emitted the literal schema alternatives rather than an actual decision. Invalid or unparseable reviews fail closed and are never silently accepted.

## Reproduction

The extraction stage requires the five repositories checked out at the commits pinned in `manifests/pilot-repositories.jsonl`:

```bash
python data_pipeline/pipeline/build_expansion.py --checkout-root /path/to/fixed-checkouts
.venv/bin/python data_pipeline/pipeline/review_candidates.py
python data_pipeline/pipeline/finalize_dataset.py
.venv/bin/python -m unittest tests_py.test_data_expansion -v
```

`expansion-units.json` is currently a curated extraction specification, not an AST extractor. `review_candidates.py` is a separate model pass, but it uses a small local reviewer and has not been calibrated against double human annotation. The pipeline is therefore reproducible and batch-shaped, but only semi-automated and not yet suitable for an unattended 500+ sample run.

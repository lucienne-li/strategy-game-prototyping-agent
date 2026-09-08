# M8 Data Scale-up Run

## Scope

This run scales the Browser + TypeScript G1/G2 pilot without adding a crawler, database or distributed platform. Repository discovery was manually curated; all downstream stages are batchable and resumable.

## Repository funnel

| Stage | Result |
|---|---:|
| Candidate repositories | 28 |
| License/build accepted | 17 |
| Rejected repositories | 11 |
| Detected accepted families | 17 |
| Accepted categories | 3 card, 8 tactics, 6 tower-defense |
| Accepted licenses | 16 MIT, 1 BSD-2-Clause |

Repository rejection reasons: 4 build failures, 3 install failures, and one each for missing build script, missing package manifest, ambiguous/disallowed license and timeout. A passed repository has a fixed commit, root license evidence, successful dependency install, successful declared build and eligible TypeScript source.

## Sample funnel

| Stage | Result |
|---|---:|
| Unique extracted units | 440 |
| G1 / G2 candidates | 287 / 153 |
| Generated instructions | 440 |
| Independently reviewed targets | 440 |
| Pre-audit accepted | 334 |
| Pre-audit rejected | 106 |
| Pre-audit G1 / G2 | 191 / 143 |
| Pre-audit card / tactics / tower-defense | 71 / 138 / 125 |

Final rejection flags are fail-closed and may overlap: 61 referred to unspecified “provided guidelines/constraints”, 35 omitted the required target symbol, 6 failed generation parsing, 3 failed length bounds, 2 used source-leakage language, 1 target was a near duplicate and 1 exceeded the repository-family cap.

## Pre-experiment stratified audit and freeze

Before training, a deterministic seed selected 48 records: eight from every card/tactics/tower-defense × G1/G2 stratum, spanning all 15 contributing repository families. Manual instruction-to-code inspection accepted 14 and rejected 34 obvious problems: 17 truncated tasks, 11 underspecified/granularity failures and 6 direct alignment failures.

The audit exposed a systematic 80-token generation cutoff. The finalizer was therefore tightened across the complete candidate set to reject unfinished instructions and references to absent rules/signatures, while retaining the explicit 48-record decisions. The frozen training set contains 186 records: 128 G1 / 58 G2 and 43 card / 75 tactics / 68 tower-defense records across 15 families. No replacement data was added.

`freeze-manifest.json` binds the dataset, audit, 24 holdout IDs, evaluator sources, Agent/repair contracts, Qwen3-4B configuration and decoding/budget settings by SHA-256. `verify_freeze.py` fails before training if any bound input changes.

## Processing and cost record

- Repository clone/install/build wall time recorded by manifests: 977.982 seconds total.
- Batched inverse-instruction model time: 1,532.873 seconds.
- Batched independent-review model time: 773.475 seconds.
- Recorded automated pipeline compute totals approximately 3,284 seconds, or 17.7 seconds per frozen sample, excluding manual repository discovery, the 48-record audit and documentation.
- Generator and reviewer: `Qwen/Qwen2.5-Coder-0.5B-Instruct`, local greedy inference. This model is a data-processing component, not the formal SFT base.
- Third-party checkouts, dependencies and build artifacts remained outside Git. Accepted records bind repository, commit, path, source lines, license and target SHA-256.

## Quality and limitations

The deterministic finalizer enforces schema, target hash, G1/G2 structure, symbol naming, source-leakage language, family cap and target/instruction similarity gates. A separate model pass checks alignment, granularity and solvability while bound to the target hash.

The 334 pre-audit records were sufficient to conduct the requested quality investigation, but the stratified audit showed they were not all suitable for training. The frozen experiment therefore uses 186 records. The local 0.5B reviewer accepted every parseable reviewed candidate, confirming that stronger-reviewer calibration remains a major future risk. Repository discovery coverage and semantic family detection are also incomplete.

The batch builder uses isolated temporary checkout directories and `npm --ignore-scripts` during dependency installation, but the repository-defined build command is not an OS/container security boundary. Before unattended processing of hundreds of unknown repositories, build jobs need disposable containers, network/resource limits and artifact quotas; this is a safety prerequisite, not an Agent feature.

## Training status

The Qwen3-4B QLoRA and 24-task comparison entry points are implemented and tested at the code/evaluator level. This workspace reports `torch.cuda.is_available() == false`; therefore no Qwen3-4B loss, checkpoint or Base-vs-SFT result is claimed here. See `docs/qwen3_scale_training.md` for the exact cloud-GPU commands and result contract.

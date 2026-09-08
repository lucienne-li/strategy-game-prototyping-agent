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
| Final accepted | 334 |
| Final rejected | 106 |
| Accepted G1 / G2 | 191 / 143 |
| Accepted card / tactics / tower-defense | 71 / 138 / 125 |

Final rejection flags are fail-closed and may overlap: 61 referred to unspecified “provided guidelines/constraints”, 35 omitted the required target symbol, 6 failed generation parsing, 3 failed length bounds, 2 used source-leakage language, 1 target was a near duplicate and 1 exceeded the repository-family cap.

## Processing and cost record

- Repository clone/install/build wall time recorded by manifests: 977.982 seconds total.
- Batched inverse-instruction model time: 1,532.873 seconds.
- Batched independent-review model time: 773.475 seconds.
- Recorded pipeline compute totals approximately 3,284 seconds, or 9.8 seconds per final accepted sample, excluding manual repository discovery and documentation.
- Generator and reviewer: `Qwen/Qwen2.5-Coder-0.5B-Instruct`, local greedy inference. This model is a data-processing component, not the formal SFT base.
- Third-party checkouts, dependencies and build artifacts remained outside Git. Accepted records bind repository, commit, path, source lines, license and target SHA-256.

## Quality and limitations

The deterministic finalizer enforces schema, target hash, G1/G2 structure, symbol naming, source-leakage language, family cap and target/instruction similarity gates. A separate model pass checks alignment, granularity and solvability while bound to the target hash.

The 334 records are suitable for the requested scale experiment, but are not a production-quality 20,000-sample corpus. The local 0.5B reviewer accepted every parseable reviewed candidate, so sampled human double-labeling and calibration against a stronger reviewer remain the main quality risk. Repository discovery coverage and semantic family detection are also incomplete.

The batch builder uses isolated temporary checkout directories and `npm --ignore-scripts` during dependency installation, but the repository-defined build command is not an OS/container security boundary. Before unattended processing of hundreds of unknown repositories, build jobs need disposable containers, network/resource limits and artifact quotas; this is a safety prerequisite, not an Agent feature.

## Training status

The Qwen3-4B QLoRA and 24-task comparison entry points are implemented and tested at the code/evaluator level. This workspace reports `torch.cuda.is_available() == false`; therefore no Qwen3-4B loss, checkpoint or Base-vs-SFT result is claimed here. See `docs/qwen3_scale_training.md` for the exact cloud-GPU commands and result contract.

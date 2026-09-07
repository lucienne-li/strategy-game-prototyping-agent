# M6 Data Pilot Report

## Result

The first pilot fixed five public Browser/TypeScript repositories at exact commits. All five had an explicit whitelisted license and produced a successful production build. Four built directly from their lockfile; one legacy Webpack project required Node's OpenSSL compatibility flag.

| Category | Repository | Commit | License | Build |
|---|---|---|---|---|
| Card | `aod/zhithead` | `a450052` | MIT | Passed |
| Card | `Veatec22/Pazaak` | `d5fb5d6` | MIT | Passed with Bun 1.3.3 |
| Tactics | `excaliburjs/sample-tactics` | `bfe18ba` | BSD-2-Clause | Passed |
| Tactics | `rjct/react-isometric-game` | `54135db` | MIT | Passed with warnings |
| Tower defense | `thilo-behnke/phaser3-tower-defense` | `ae45287` | MIT | Passed after `--openssl-legacy-provider` retry |

License texts were inspected from explicit `LICENSE` files and hashed in the repository manifest. No GPL, AGPL, missing-license, ambiguous-license, fork, or duplicate-family candidate entered extraction.

## Funnel

| Stage | Count | Result |
|---|---:|---|
| Fixed repositories | 5 | 2 card, 2 tactics, 1 tower defense |
| License accepted | 5 | 4 MIT, 1 BSD-2-Clause |
| Build accepted | 5 | 4 direct, 1 compatibility retry |
| G1/G2 units extracted | 8 | Exact source commit/path/range recorded |
| SFT samples accepted | 7 | Alignment, granularity and solvability passed |
| Samples rejected | 1 | Source behavior contradicted generated instruction |

The eight target hashes were all distinct. A pilot-only token-set Jaccard check found a maximum similarity of 0.20; none reached the exploratory 0.80 near-duplicate threshold. This heuristic and threshold are not frozen for a larger dataset.

## Extracted units

| Sample | Repo | Granularity | Mechanism | Outcome |
|---|---|---|---|---|
| `pilot-zhithead-bot-001` | zhithead | G1 | legal-card bot choice | Accepted |
| `pilot-zhithead-rules-002` | zhithead | G1 | card play rules | Accepted |
| `pilot-pazaak-hand-003` | Pazaak | G1 | unique hand dealing | Accepted |
| `pilot-pazaak-ai-deck-004` | Pazaak | G1 | tiered AI deck | Accepted |
| `pilot-tactics-targeting-005` | sample-tactics | G2 | AI target and movement | Accepted |
| `pilot-isometric-coordinates-006` | react-isometric-game | G1 | isometric transforms | Accepted |
| `pilot-tower-targeting-007` | phaser3-tower-defense | G2 | predictive targeting and fire | Accepted |
| `pilot-tactics-pathfinding-008` | sample-tactics | G1 | Manhattan heuristic | Rejected |

The rejected source computes its vertical term as `end.pos.y - end.pos.y`, which is always zero. It therefore cannot satisfy the instruction asking for Manhattan distance. The record remains in `rejected.jsonl` with `CODE_BEHAVIOR_MISMATCH` and must not enter training.

## Cost and limitations

- Measured repository validation/build wall time: approximately 337.7 seconds total, or 48.2 seconds amortized per accepted sample.
- The tower-defense repository consumed two build attempts; other repositories consumed one.
- API token and billing cost are unavailable because instruction generation occurred in the current Codex work session and billing telemetry was not exposed.
- Human-review minutes were not instrumented, so no combined dollar cost is claimed.
- Instruction-code review was a manual static review performed in the same work session, not an independent annotator agreement study.
- Build success applies to the fixed repository commits and commands in the manifests. The pilot did not retain full checkouts, dependencies, assets, or build outputs.

The next pilot must meter discovery/review time and generation tokens, add an independent reviewer sample, and define repository-family splits before results are used to claim training effectiveness.

## Reproduction

Run `npm run data:pilot:validate` to validate counts, provenance links, license policy, build states, chat records, content hashes, duplicate targets and quality gates. `npm test` includes the same check as a regression test.

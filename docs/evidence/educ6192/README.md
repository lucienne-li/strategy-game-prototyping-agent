# Application version evidence

Captured on 2026-09-22 using local HTTP servers and Chromium 153.0.8010.0.

- V1 is the unchanged web branch commit `4522c1a1c67fc43ed47734694410c4e1fd3740cc`, reproduced locally. `v1-home.png` and `v1-preview.png` are fresh captures of that revision, not historical user screenshots. Its automatic check consumes one energy before learner interaction.
- V2 is this revision: `v2-home.png`, `v2-complete.png`, and `v2-mobile.png`. Complete means technical checks completed; it does not imply course submission or learning mastery.
- Same representative activity: player HP 20, energy 3, enemy HP 20, Strike costs 1 energy and deals 6 damage. Start the activity and inspect the initial values. V1 shows energy 2 after its automatic check; V2 preserves energy 3 and enemy HP 20. V2 then allows three learner strikes and explains why 2 enemy HP remains.
- Additional V2 checks: blank/wrong/correct prediction, exhaustion boundary, restart, keyboard prediction submission, ZIP download, no page errors and no horizontal overflow at 390px. The server and deterministic tests also check out-of-range and fractional predictions, invalid requests, archive contents and preview-path traversal.
- Browser checks use no live model. They do not replace instructor review, assistive-technology testing, a learner study, or JeepyTA feedback.
- Reproduce V2 with `npm run build`, `node --test dist/tests/web-product.test.js`, and `CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node tests/web-learning.browser.mjs`.

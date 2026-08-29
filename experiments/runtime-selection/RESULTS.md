# Runtime Selection Experiment Results

## Conclusion

Select **Browser + TypeScript** for the first Agent MVP.

Godot remains a later engine-grounded extension. The choice can be revisited if the offline data pilot shows that browser-game repositories are too noisy or insufficiently project-like.

## Experiment

Both implementations use the same rules in [task.md](task.md) and contain a clickable UI, isolated game-state logic, and deterministic tests.

Environment used for this experiment:

- Node.js 24.19.0
- TypeScript 7.0.2
- Godot 4.7.2
- Linux x86_64

## Verified results

| Check | Browser + TypeScript | Godot 4 + GDScript |
|---|---:|---:|
| Relevant implementation lines | 166 | 177 |
| Experiment files excluding generated/cache files | 8 | 9 |
| Logic tests | 3 passed | 3 scenarios passed |
| Build/import | TypeScript compilation passed | Headless editor import passed |
| Runtime smoke test | HTTP load passed | Headless project launch passed |
| Repeated logic-test command | ~795 ms including TypeScript build | ~153 ms after import |
| First environment setup observed | Small npm dependency install | ~74 MB download, ~146 MB executable, ~5 s first import |

Timing is descriptive for this environment, not a general performance benchmark.

## Comparison

| Criterion | Browser + TypeScript | Godot 4 + GDScript |
|---|---|---|
| Development complexity | Standard HTML/DOM/TypeScript; fewer engine concepts | Requires project, scene, script and engine lifecycle knowledge |
| Automated run/test | Native compiler, Node tests and simple HTTP smoke test | Good headless support, but requires Godot binary and import step |
| Agent code modification | Mostly ordinary text files with low coupling | Text-based and editable, but scene/resource relationships add constraints |
| Data/SFT path | Large TypeScript/JavaScript code supply, though game-repository filtering may be noisy | More consistent engine projects but a smaller GDScript/Godot pool |
| Research value | Faster path to validating Agent loop and evaluation | Stronger professional-engine grounding, but more runtime complexity |

## Decision rationale

The first milestone is intended to validate the Agent execution and repair loop, not professional-engine integration. Browser + TypeScript minimizes setup, keeps tests deterministic, and is easier for an Agent to edit safely. Choosing it now isolates Agent/runtime failures from engine import, scene binding and resource problems.

Godot should be reconsidered after the Browser MVP works or if project-level data quality becomes the dominant concern.

## Reproduction

Browser:

```bash
cd experiments/runtime-selection/browser
npm install
npm run check
python3 -m http.server 8000
```

Godot:

```bash
cd experiments/runtime-selection/godot
godot --headless --path . --editor --quit
godot --headless --path . --script tests/test_game_state.gd
godot --headless --path . --quit-after 2
```

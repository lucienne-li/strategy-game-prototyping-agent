import type { AgentModel } from "../agent/types.js";

export const DEMO_REQUEST = "Create a playable card combat prototype with Player HP 20, Energy 3, Enemy HP 20, and a Strike action that costs 1 Energy and deals 6 damage.";

export const DEMO_INDEX = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ember Tactics · Energy budget activity</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #f8fafc; font-family: Inter, ui-sans-serif, system-ui; background: radial-gradient(circle at 50% 15%, #3b2769, #171327 55%, #0c0a14); }
    .game { width: min(760px, calc(100vw - 32px)); padding: 32px; border: 1px solid #6d5b8d; border-radius: 24px; background: linear-gradient(145deg, rgba(39,32,59,.96), rgba(20,17,32,.98)); box-shadow: 0 30px 80px #08060db3; }
    .eyebrow { color: #c4b5fd; letter-spacing: .16em; text-transform: uppercase; font-size: 12px; }
    h1 { margin: 8px 0 28px; font-size: 34px; }
    .arena { display: grid; grid-template-columns: 1fr 92px 1fr; gap: 18px; align-items: center; }
    .fighter { padding: 22px; border-radius: 18px; background: #171321; border: 1px solid #443857; }
    .fighter.enemy { text-align: right; }
    .portrait { font-size: 48px; margin-bottom: 12px; }
    .label { color: #a9a2b8; font-size: 13px; }
    .value { font-size: 30px; font-weight: 750; font-variant-numeric: tabular-nums; }
    .versus { text-align: center; color: #887a9d; font-weight: 800; }
    .energy { margin: 24px 0 16px; display: flex; justify-content: space-between; color: #d8ccff; }
    button { width: 100%; border: 0; border-radius: 14px; padding: 16px; color: white; font: inherit; font-weight: 750; cursor: pointer; background: linear-gradient(135deg, #7c3aed, #ef4444); box-shadow: 0 12px 28px #7c3aed4d; transition: transform .15s, filter .15s; }
    button:hover { transform: translateY(-1px); filter: brightness(1.1); }
    button:disabled { cursor: not-allowed; filter: grayscale(.8); opacity: .5; }
    label { display:block; margin:12px 0 6px; }
    input,textarea { width:100%; background:#171321; color:#fff; border:1px solid #a99bc0; border-radius:6px; padding:10px; font:inherit; }
    p { line-height:1.5; }
    .practice { border-top:1px solid #6d5b8d; margin-top:20px; padding-top:12px; }
    .practice button { margin-top:12px; }
    button:focus-visible,input:focus-visible,textarea:focus-visible { outline:3px solid #b8ff59; outline-offset:3px; }
    #prediction-feedback { color:#e1d8fb; min-height:24px; }
    @media(max-width:520px) { .game { padding:16px; } .arena { grid-template-columns:1fr 28px 1fr; gap:8px; } .fighter { padding:12px; } .portrait { font-size:28px; } h1 { font-size:27px; } }
    @media(prefers-reduced-motion:reduce) { button { transition:none; } }
    #battle-log { min-height: 22px; margin: 16px 0 0; text-align: center; color: #fda4af; font-size: 14px; }
  </style>
</head>
<body>
  <main class="game">
    <div class="eyebrow">Guided practice · Resource limits</div>
    <h1>Ember Tactics</h1><p>One-round exercise: each Strike uses 1 energy and deals 6 damage. You have 3 energy. Predict the remaining enemy HP, then play to test your reasoning. There are no enemy turns or energy refills.</p>
    <section class="arena">
      <article class="fighter"><div class="portrait">🛡️</div><div class="label">Player HP</div><div class="value" id="player-hp"></div></article>
      <div class="versus">VS</div>
      <article class="fighter enemy"><div class="portrait">🐉</div><div class="label">Enemy HP</div><div class="value" id="enemy-hp"></div></article>
    </section>
    <div class="energy"><span>Energy</span><strong id="player-energy"></strong></div>
    <button id="strike-button">⚔ Strike · 1 Energy · 6 Damage</button>
    <p id="battle-log" role="status" aria-live="polite">Choose your action.</p>
    <button id="restart-button" type="button">Restart round</button>
    <section class="practice" aria-label="Prediction and reflection">
      <label for="prediction">Predict the enemy HP after all three strikes</label>
      <input id="prediction" type="number" min="0" max="20" step="1" inputmode="numeric" aria-describedby="prediction-feedback" />
      <button id="check-prediction" type="button">Check prediction</button>
      <p id="prediction-feedback" role="status" aria-live="polite"></p>
      <label for="reflection">Reflect: what would need to change to defeat the enemy in one round?</label>
      <textarea id="reflection" rows="2" maxlength="1000" aria-describedby="reflection-note"></textarea>
      <p id="reflection-note">Compare the energy budget, cost per action, and damage per action. This response is for your own reflection, is not automatically graded, and is cleared on restart. Do not enter personal information.</p>
    </section>
  </main>
  <script type="module" src="./dist/game.js"></script>
</body>
</html>`;

export const DEMO_GAME = `export function createInitialState() {
  return { playerHp: 20, playerEnergy: 3, enemyHp: 20 };
}

export function strike(state) {
  if (state.playerEnergy < 1 || state.enemyHp <= 0) return { ...state };
  return { ...state, playerEnergy: state.playerEnergy - 1, enemyHp: Math.max(0, state.enemyHp - 6) };
}

export function mountGame(documentRef) {
  let state = createInitialState();
  const playerHp = documentRef.getElementById('player-hp');
  const energy = documentRef.getElementById('player-energy');
  const enemyHp = documentRef.getElementById('enemy-hp');
  const button = documentRef.getElementById('strike-button');
  const log = documentRef.getElementById('battle-log');
  const render = () => {
    playerHp.textContent = String(state.playerHp);
    energy.textContent = String(state.playerEnergy);
    enemyHp.textContent = String(state.enemyHp);
    button.disabled = state.playerEnergy < 1 || state.enemyHp <= 0;
  };
  button.addEventListener('click', () => {
    const previous = state.enemyHp;
    state = strike(state);
    if (log) log.textContent = state.playerEnergy === 0 ? 'Round complete: 3 strikes cost 3 energy and deal 18 damage. The enemy has 2 HP left. A valid action does not guarantee enough resources to reach the goal. Restart to try again.' : state.enemyHp < previous ? 'Strike deals 6 damage and uses 1 energy. Compare the new values with your prediction.' : 'Not enough energy.';
    render();
  });
  documentRef.getElementById('restart-button')?.addEventListener('click', () => {
    state = createInitialState();
    if (log) log.textContent = 'New round. Predict, then use Strike to test the rules.';
    const prediction = documentRef.getElementById('prediction');
    if (prediction) { prediction.value = ''; prediction.removeAttribute('aria-invalid'); }
    const feedback = documentRef.getElementById('prediction-feedback');
    if (feedback) feedback.textContent = '';
    const reflection = documentRef.getElementById('reflection');
    if (reflection) reflection.value = '';
    render();
    button.focus();
  });
  documentRef.getElementById('check-prediction')?.addEventListener('click', () => {
    const input = documentRef.getElementById('prediction');
    const feedback = documentRef.getElementById('prediction-feedback');
    if (!input || !feedback) return;
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isInteger(value) || value < 0 || value > 20) {
      feedback.textContent = 'Enter a whole number from 0 to 20, then check again.';
      input.setAttribute('aria-invalid', 'true'); input.focus(); return;
    }
    input.removeAttribute('aria-invalid');
    feedback.textContent = (value === 2 ? 'Correct. ' : 'Not quite. ') + '3 energy / 1 per Strike allows 3 strikes. 3 x 6 = 18 damage, so 20 - 18 = 2 HP remains. To win within the round, you would need more energy or greater damage per energy.';
  });
  render();
}

if (typeof document !== 'undefined') mountGame(document);`;

export const DEMO_PROJECT = `import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const mode = process.argv[2];
if (mode === 'build') {
  await mkdir('dist', { recursive: true });
  await copyFile('src/game.ts', 'dist/game.js');
  console.log('build complete');
} else if (mode === 'serve') {
  await mkdir('dist', { recursive: true });
  await copyFile('src/game.ts', 'dist/game.js');
  const server = createServer(async (request, response) => {
    const file = request.url === '/dist/game.js' ? 'dist/game.js' : 'index.html';
    response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(await readFile(file));
  });
  server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1');
} else {
  throw new Error('expected build or serve');
}`;

export function createDemoModel(): AgentModel {
  return {
    async next(context) {
      if (context.events.length === 0) {
        return {
          type: "tool_calls",
          calls: [
            { tool: "write_file", path: "index.html", content: DEMO_INDEX },
            { tool: "write_file", path: "src/game.ts", content: DEMO_GAME },
            { tool: "write_file", path: "project.mjs", content: DEMO_PROJECT },
            { tool: "run_command", command: "node", args: ["project.mjs", "build"] }
          ]
        };
      }
      return { type: "final", status: "success", message: "SUCCESS: Fixed learning activity created and built. Predict, play, and reflect in the preview; no live AI generation was used." };
    }
  };
}

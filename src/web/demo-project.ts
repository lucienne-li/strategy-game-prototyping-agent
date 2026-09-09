import type { AgentModel } from "../agent/types.js";

export const DEMO_REQUEST = "Create a playable card combat prototype with Player HP 20, Energy 3, Enemy HP 20, and a Strike action that costs 1 Energy and deals 6 damage.";

export const DEMO_INDEX = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ember Tactics</title>
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
    #battle-log { min-height: 22px; margin: 16px 0 0; text-align: center; color: #fda4af; font-size: 14px; }
  </style>
</head>
<body>
  <main class="game">
    <div class="eyebrow">Playable strategy prototype</div>
    <h1>Ember Tactics</h1>
    <section class="arena">
      <article class="fighter"><div class="portrait">🛡️</div><div class="label">Player HP</div><div class="value" id="player-hp"></div></article>
      <div class="versus">VS</div>
      <article class="fighter enemy"><div class="portrait">🐉</div><div class="label">Enemy HP</div><div class="value" id="enemy-hp"></div></article>
    </section>
    <div class="energy"><span>Energy</span><strong id="player-energy"></strong></div>
    <button id="strike-button">⚔ Strike · 1 Energy · 6 Damage</button>
    <p id="battle-log">Choose your action.</p>
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
    if (log) log.textContent = state.enemyHp < previous ? 'Strike lands for 6 damage.' : 'Not enough energy.';
    render();
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
      return { type: "final", status: "success", message: "SUCCESS: Card Combat demo created, built, and ready for evaluation." };
    }
  };
}

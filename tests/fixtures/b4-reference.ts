import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ToolExecutor } from "../../src/runtime/tool-executor.js";

export const referenceIndex = `<!doctype html>
<html><body>
  <p>Player HP: <span id="player-hp"></span></p>
  <p>Energy: <span id="player-energy"></span></p>
  <p>Enemy HP: <span id="enemy-hp"></span></p>
  <button id="strike-button">Strike</button>
  <script type="module" src="./dist/game.js"></script>
</body></html>
`;

export const referenceGame = `export function createInitialState() {
  return { playerHp: 20, playerEnergy: 3, enemyHp: 20 };
}

export function strike(state) {
  return { ...state, playerEnergy: state.playerEnergy - 1, enemyHp: state.enemyHp - 6 };
}

export function mountGame(documentRef) {
  let state = createInitialState();
  const playerHp = documentRef.getElementById('player-hp');
  const energy = documentRef.getElementById('player-energy');
  const enemyHp = documentRef.getElementById('enemy-hp');
  const button = documentRef.getElementById('strike-button');
  const render = () => {
    playerHp.textContent = String(state.playerHp);
    energy.textContent = String(state.playerEnergy);
    enemyHp.textContent = String(state.enemyHp);
  };
  button.addEventListener('click', () => { state = strike(state); render(); });
  render();
}

if (typeof document !== 'undefined') mountGame(document);
`;

export const referenceProjectScript = `import { copyFile, mkdir, readFile } from 'node:fs/promises';
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
    response.end(await readFile(file));
  });
  server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1');
} else {
  throw new Error('expected build or serve');
}
`;

export async function writeReferenceProject(workspace: string): Promise<void> {
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await Promise.all([
    writeFile(path.join(workspace, "index.html"), referenceIndex, "utf8"),
    writeFile(path.join(workspace, "src/game.ts"), referenceGame, "utf8"),
    writeFile(path.join(workspace, "project.mjs"), referenceProjectScript, "utf8")
  ]);
  const build = await new ToolExecutor({ workspace }).execute({
    tool: "run_command",
    command: "node",
    args: ["project.mjs", "build"]
  });
  assert.equal(build.result.ok, true);
}

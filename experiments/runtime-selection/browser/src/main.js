import {CardGameState} from "./game.js";

const game = new CardGameState();
const status = document.querySelector("#status");

function render() {
  if (!status) throw new Error("Missing #status element");
  const state = game.snapshot();
  status.textContent = `Turn: ${state.turn}\nPlayer HP: ${state.playerHealth} | Energy: ${state.energy} | Block: ${state.block}\nEnemy HP: ${state.enemyHealth}`;
}

document.querySelector("#strike")?.addEventListener("click", () => { game.strike(); render(); });
document.querySelector("#defend")?.addEventListener("click", () => { game.defend(); render(); });
document.querySelector("#end-turn")?.addEventListener("click", () => { game.endTurn(); render(); });
render();

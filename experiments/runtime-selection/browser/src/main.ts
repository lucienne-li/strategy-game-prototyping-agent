import { CardGameState } from "./game.js";

const game = new CardGameState();
const status = document.querySelector<HTMLDivElement>("#status");

function render(): void {
  if (!status) throw new Error("Missing #status element");
  const state = game.snapshot();
  status.textContent = [
    `Turn: ${state.turn}`,
    `Player HP: ${state.playerHealth} | Energy: ${state.energy} | Block: ${state.block}`,
    `Enemy HP: ${state.enemyHealth}`
  ].join("\n");
}

document.querySelector("#strike")?.addEventListener("click", () => {
  game.strike();
  render();
});

document.querySelector("#defend")?.addEventListener("click", () => {
  game.defend();
  render();
});

document.querySelector("#end-turn")?.addEventListener("click", () => {
  game.endTurn();
  render();
});

render();

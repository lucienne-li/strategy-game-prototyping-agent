import assert from "node:assert/strict";
import test from "node:test";
import { CardGameState } from "../src/game.ts";

test("strike consumes energy and damages the enemy", () => {
  const game = new CardGameState();
  assert.equal(game.strike(), true);
  assert.deepEqual(game.snapshot(), {
    playerHealth: 20,
    enemyHealth: 12,
    energy: 2,
    block: 0,
    turn: 1
  });
});

test("block absorbs the enemy attack and the next turn resets energy", () => {
  const game = new CardGameState();
  assert.equal(game.defend(), true);
  game.endTurn();
  assert.deepEqual(game.snapshot(), {
    playerHealth: 20,
    enemyHealth: 18,
    energy: 3,
    block: 1,
    turn: 2
  });
});

test("actions are rejected when energy is exhausted", () => {
  const game = new CardGameState();
  game.strike();
  game.strike();
  game.strike();
  assert.equal(game.strike(), false);
  assert.equal(game.snapshot().enemyHealth, 0);
});

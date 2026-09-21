import assert from "node:assert/strict";
import test from "node:test";
import {CardGameState} from "../src/game.js";

test("strike consumes energy and damages the enemy", () => {
  const game = new CardGameState(); game.strike();
  assert.deepEqual(game.snapshot(), {playerHealth: 20, enemyHealth: 12, energy: 2, block: 0, turn: 1});
});

test("block absorbs damage and the next turn resets energy", () => {
  const game = new CardGameState(); game.defend(); game.endTurn();
  assert.deepEqual(game.snapshot(), {playerHealth: 20, enemyHealth: 18, energy: 3, block: 1, turn: 2});
});

test("actions stop after energy or enemy health reaches zero", () => {
  const game = new CardGameState(); game.strike(); game.strike(); game.strike();
  assert.equal(game.strike(), false); assert.equal(game.snapshot().enemyHealth, 0);
});

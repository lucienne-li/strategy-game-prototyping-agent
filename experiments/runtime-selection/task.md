# Shared Minimal Card Task

Implement the same deterministic single-player card combat rule in both runtimes:

- Player starts with 20 health, 3 energy, and 0 block.
- Enemy starts with 18 health.
- `Strike` costs 1 energy and deals 6 damage.
- `Defend` costs 1 energy and grants 5 block.
- `End Turn` makes the enemy attack for 4 damage; block absorbs damage first.
- After the enemy action, player energy resets to 3 and the turn increases.

The experiment must provide:

1. A minimal clickable interface.
2. A deterministic game-state module separated from the UI.
3. An automated test for damage, energy, block, and turn transitions.
4. A documented command to run the prototype and the test.

export class CardGameState {
  #playerHealth = 20;
  #enemyHealth = 18;
  #energy = 3;
  #block = 0;
  #turn = 1;

  strike() {
    if (this.#energy < 1 || this.#enemyHealth <= 0) return false;
    this.#energy -= 1;
    this.#enemyHealth = Math.max(0, this.#enemyHealth - 6);
    return true;
  }

  defend() {
    if (this.#energy < 1 || this.#playerHealth <= 0) return false;
    this.#energy -= 1;
    this.#block += 5;
    return true;
  }

  endTurn() {
    if (this.#playerHealth <= 0 || this.#enemyHealth <= 0) return;
    const enemyDamage = 4;
    this.#playerHealth = Math.max(0, this.#playerHealth - Math.max(0, enemyDamage - this.#block));
    this.#block = Math.max(0, this.#block - enemyDamage);
    this.#energy = 3;
    this.#turn += 1;
  }

  snapshot() {
    return {playerHealth: this.#playerHealth, enemyHealth: this.#enemyHealth, energy: this.#energy, block: this.#block, turn: this.#turn};
  }
}

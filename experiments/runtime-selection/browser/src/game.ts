export interface GameSnapshot {
  playerHealth: number;
  enemyHealth: number;
  energy: number;
  block: number;
  turn: number;
}

export class CardGameState {
  private playerHealth = 20;
  private enemyHealth = 18;
  private energy = 3;
  private block = 0;
  private turn = 1;

  strike(): boolean {
    if (this.energy < 1 || this.enemyHealth <= 0) return false;
    this.energy -= 1;
    this.enemyHealth = Math.max(0, this.enemyHealth - 6);
    return true;
  }

  defend(): boolean {
    if (this.energy < 1 || this.playerHealth <= 0) return false;
    this.energy -= 1;
    this.block += 5;
    return true;
  }

  endTurn(): void {
    if (this.playerHealth <= 0 || this.enemyHealth <= 0) return;
    const enemyDamage = 4;
    const healthDamage = Math.max(0, enemyDamage - this.block);
    this.block = Math.max(0, this.block - enemyDamage);
    this.playerHealth = Math.max(0, this.playerHealth - healthDamage);
    this.energy = 3;
    this.turn += 1;
  }

  snapshot(): Readonly<GameSnapshot> {
    return {
      playerHealth: this.playerHealth,
      enemyHealth: this.enemyHealth,
      energy: this.energy,
      block: this.block,
      turn: this.turn
    };
  }
}

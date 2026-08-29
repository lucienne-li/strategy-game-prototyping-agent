class_name CardGameState
extends RefCounted

var player_health: int = 20
var enemy_health: int = 18
var energy: int = 3
var block: int = 0
var turn: int = 1


func strike() -> bool:
	if energy < 1 or enemy_health <= 0:
		return false
	energy -= 1
	enemy_health = max(0, enemy_health - 6)
	return true


func defend() -> bool:
	if energy < 1 or player_health <= 0:
		return false
	energy -= 1
	block += 5
	return true


func end_turn() -> void:
	if player_health <= 0 or enemy_health <= 0:
		return
	var enemy_damage := 4
	var health_damage: int = max(0, enemy_damage - block)
	block = max(0, block - enemy_damage)
	player_health = max(0, player_health - health_damage)
	energy = 3
	turn += 1


func snapshot() -> Dictionary:
	return {
		"player_health": player_health,
		"enemy_health": enemy_health,
		"energy": energy,
		"block": block,
		"turn": turn,
	}

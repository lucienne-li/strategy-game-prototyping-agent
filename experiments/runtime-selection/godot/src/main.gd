extends Control

const CardGameStateScript = preload("res://src/game_state.gd")

var game = CardGameStateScript.new()
var status_label: Label


func _ready() -> void:
	var layout := VBoxContainer.new()
	layout.position = Vector2(80, 60)
	layout.custom_minimum_size = Vector2(480, 240)
	add_child(layout)

	var title := Label.new()
	title.text = "Minimal Card Battle"
	title.add_theme_font_size_override("font_size", 28)
	layout.add_child(title)

	status_label = Label.new()
	status_label.custom_minimum_size = Vector2(480, 100)
	layout.add_child(status_label)

	var actions := HBoxContainer.new()
	layout.add_child(actions)
	_add_button(actions, "Strike (1 energy)", _on_strike)
	_add_button(actions, "Defend (1 energy)", _on_defend)
	_add_button(actions, "End Turn", _on_end_turn)
	_render()


func _add_button(parent: Container, text: String, callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.pressed.connect(callback)
	parent.add_child(button)


func _on_strike() -> void:
	game.strike()
	_render()


func _on_defend() -> void:
	game.defend()
	_render()


func _on_end_turn() -> void:
	game.end_turn()
	_render()


func _render() -> void:
	var state: Dictionary = game.snapshot()
	status_label.text = "Turn: %d\nPlayer HP: %d | Energy: %d | Block: %d\nEnemy HP: %d" % [
		state.turn,
		state.player_health,
		state.energy,
		state.block,
		state.enemy_health,
	]

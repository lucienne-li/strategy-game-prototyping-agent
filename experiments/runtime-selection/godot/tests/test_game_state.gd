extends SceneTree

var failures: int = 0


func _init() -> void:
	var state_script = load("res://src/game_state.gd")
	_test_strike(state_script.new())
	_test_defend_and_end_turn(state_script.new())
	_test_exhausted_energy(state_script.new())
	if failures == 0:
		print("All Godot card-state tests passed.")
	quit(failures)


func _test_strike(game) -> void:
	_assert_equal(game.strike(), true, "strike accepted")
	_assert_equal(game.enemy_health, 12, "strike damage")
	_assert_equal(game.energy, 2, "strike energy")


func _test_defend_and_end_turn(game) -> void:
	_assert_equal(game.defend(), true, "defend accepted")
	game.end_turn()
	_assert_equal(game.player_health, 20, "block absorbs attack")
	_assert_equal(game.block, 1, "remaining block")
	_assert_equal(game.energy, 3, "energy reset")
	_assert_equal(game.turn, 2, "turn advances")


func _test_exhausted_energy(game) -> void:
	game.strike()
	game.strike()
	game.strike()
	_assert_equal(game.strike(), false, "reject action without energy")
	_assert_equal(game.enemy_health, 0, "enemy health floor")


func _assert_equal(actual, expected, label: String) -> void:
	if actual != expected:
		failures += 1
		push_error("%s: expected %s, got %s" % [label, expected, actual])

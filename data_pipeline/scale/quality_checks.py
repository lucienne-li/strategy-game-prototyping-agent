from __future__ import annotations

import re


FORBIDDEN = ("source code", "provided code", "repository", "above implementation", "given implementation")
VAGUE = re.compile(r"provided guidelines|specified requirements|g[12] code unit guidelines|as described above", re.IGNORECASE)
WHOLE_PROJECT = re.compile(r"whole|entire|complete (?:game|project)|all files|full application", re.IGNORECASE)


def deterministic_reasons(record: dict, target_validation: dict | None = None) -> list[str]:
    reasons: list[str] = []
    instruction = record.get("instruction")
    scope = record.get("scope")
    generation = record.get("generation", {})
    if generation.get("pipeline_version") != "quality-v2" or not generation.get("response_completed"):
        reasons.append("GENERATION_INCOMPLETE")
    if not isinstance(instruction, str):
        return sorted(set([*reasons, "INSTRUCTION_INVALID"]))
    if not isinstance(scope, dict):
        return sorted(set([*reasons, "SCOPE_MISSING"]))

    words = re.findall(r"\b[\w'-]+\b", instruction)
    if len(words) < 45 or len(words) > 140:
        reasons.append("INSTRUCTION_LENGTH")
    if not instruction.rstrip().endswith((".", "!", "?")):
        reasons.append("INSTRUCTION_INCOMPLETE")
    if scope.get("target_file") != record.get("source_path") or record.get("source_path") not in instruction:
        reasons.append("TARGET_FILE_SCOPE_MISMATCH")
    if scope.get("target_symbol") != record.get("symbol") or record.get("symbol", "").lower() not in instruction.lower():
        reasons.append("TARGET_SYMBOL_SCOPE_MISMATCH")

    behaviors = scope.get("expected_behavior")
    constraints = scope.get("constraints")
    required_context = scope.get("required_context")
    if not valid_strings(behaviors, 1, 8):
        reasons.append("EXPECTED_BEHAVIOR_MISSING")
    elif coverage(behaviors, instruction) < 0.35:
        reasons.append("EXPECTED_BEHAVIOR_NOT_IN_INSTRUCTION")
    if not valid_strings(constraints, 1, 6):
        reasons.append("CONSTRAINTS_MISSING")
    elif coverage(constraints, instruction) < 0.20:
        reasons.append("CONSTRAINTS_NOT_IN_INSTRUCTION")
    if not isinstance(required_context, list) or any(not isinstance(item, str) for item in required_context):
        reasons.append("REQUIRED_CONTEXT_INVALID")
    elif not set(required_context).issubset(set(record.get("provided_symbols", []))):
        reasons.append("MISSING_CONTEXT")
    if any(phrase in instruction.lower() for phrase in FORBIDDEN):
        reasons.append("SOURCE_LEAKAGE_LANGUAGE")
    if VAGUE.search(instruction):
        reasons.append("UNDERSPECIFIED_REFERENCE")
    if WHOLE_PROJECT.search(instruction) or (record.get("granularity") == "G1" and len(behaviors or []) > 6):
        reasons.append("GRANULARITY_MISMATCH")

    if target_validation is None or target_validation.get("target_sha256") != record.get("target_sha256"):
        reasons.append("TARGET_VALIDATION_MISSING")
    else:
        if target_validation.get("syntax") != "pass":
            reasons.append("TARGET_SYNTAX_INVALID")
        if target_validation.get("symbol") != "pass":
            reasons.append("TARGET_SYMBOL_INVALID")
        if target_validation.get("behavior") == "fail":
            reasons.append("DETERMINISTIC_BEHAVIOR_FAILED")
    return sorted(set(reasons))


def valid_strings(value: object, minimum: int, maximum: int) -> bool:
    return isinstance(value, list) and minimum <= len(value) <= maximum and all(isinstance(item, str) and item.strip() for item in value)


def coverage(parts: list[str], instruction: str) -> float:
    expected = tokens(" ".join(parts))
    actual = tokens(instruction)
    return len(expected & actual) / len(expected) if expected else 0.0


def tokens(value: str) -> set[str]:
    stop = {"the", "a", "an", "and", "or", "to", "of", "in", "for", "with", "that", "this", "must", "should"}
    return {token for token in re.findall(r"[a-z_$][a-z0-9_$]*|\d+", value.lower()) if token not in stop}

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .extract_units import read_jsonl, write_jsonl


def delimiter_errors(source: str) -> list[str]:
    stack: list[str] = []
    pairs = {")": "(", "]": "[", "}": "{"}
    quote: str | None = None
    line_comment = block_comment = False
    index = 0
    while index < len(source):
        char = source[index]
        following = source[index + 1] if index + 1 < len(source) else ""
        if line_comment:
            if char == "\n": line_comment = False
        elif block_comment:
            if char == "*" and following == "/": block_comment = False; index += 1
        elif quote:
            if char == "\\": index += 1
            elif char == quote: quote = None
        elif char == "/" and following == "/": line_comment = True; index += 1
        elif char == "/" and following == "*": block_comment = True; index += 1
        elif char in "'\"`": quote = char
        elif char in "([{": stack.append(char)
        elif char in ")]}" and (not stack or stack.pop() != pairs[char]): return [f"unbalanced delimiter {char}"]
        index += 1
    if stack: return ["unclosed delimiter"]
    if quote: return ["unclosed string"]
    if block_comment: return ["unclosed comment"]
    return []


def safe_literal(expression: str) -> bool:
    return not re.search(r"[();`]|\b(?:new|this|function|class|await|yield|global|process|require|import)\b|[A-Za-z_$][\w$]*\s*\(", expression)


def validate(unit: dict[str, Any]) -> dict[str, Any]:
    errors = delimiter_errors(unit["target"])
    declaration = bool(re.search(rf"\b(?:function|class)\s+{re.escape(unit['symbol'])}\b", unit["target"]))
    result: dict[str, Any] = {
        "unit_id": unit["unit_id"], "target_sha256": unit["target_sha256"],
        "validator": "balanced-syntax-and-narrow-execution-v2-python-driver",
        "syntax": "pass" if not errors else "fail", "symbol": "pass" if declaration else "fail",
        "behavior": "not_eligible", "reasons": [f"syntax: {error}" for error in errors] + ([] if declaration else ["declared target symbol not found"]),
    }
    if errors or not declaration:
        return result
    literal = re.search(r"\bfunction\s+\w+\s*\(\s*\)[^{]*\{\s*return\s+([\s\S]*?)\s*;?\s*\}\s*$", unit["target"])
    if not literal:
        return result
    expression = re.sub(r";\s*$", "", literal.group(1)).strip()
    if not safe_literal(expression):
        return result
    node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not node:
        result["reasons"].append("deterministic behavior harness unavailable: node executable not found")
        return result
    expected = subprocess.run([node, "--permission", "-e", f"console.log(JSON.stringify({expression}))"], capture_output=True, text=True, timeout=1, env={})
    source = re.sub(r"^\s*export\s+", "", unit["target"])
    actual = subprocess.run([node, "--permission", "-e", f"{source}\nconsole.log(JSON.stringify({unit['symbol']}()))"], capture_output=True, text=True, timeout=1, env={})
    if expected.returncode == actual.returncode == 0 and not expected.stderr and not actual.stderr and expected.stdout == actual.stdout:
        result["behavior"] = "pass"
        result["behavior_test"] = {"kind": "zero_argument_literal_or_object_return", "expected_json": json.loads(expected.stdout)}
    else:
        result["behavior"] = "fail"
        result["reasons"].append(f"deterministic behavior harness failed: {actual.stderr.strip()}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("data_pipeline/scale/units.jsonl"))
    parser.add_argument("--output", type=Path, default=Path("data_pipeline/scale/target-validation-v2.jsonl"))
    args = parser.parse_args()
    results = [validate(unit) for unit in read_jsonl(args.input)]
    write_jsonl(args.output, results)
    print(json.dumps({"units": len(results), "syntaxPassed": sum(row["syntax"] == "pass" for row in results),
                      "symbolPassed": sum(row["symbol"] == "pass" for row in results),
                      "behaviorPassed": sum(row["behavior"] == "pass" for row in results),
                      "behaviorNotEligible": sum(row["behavior"] == "not_eligible" for row in results)}, indent=2))


if __name__ == "__main__":
    main()

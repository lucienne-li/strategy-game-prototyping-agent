from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable


SKIP_DIRECTORIES = {"node_modules", ".git", "dist", "build", "coverage", "vendor", "generated"}
COMMON = ("game", "player", "enemy", "turn", "round", "damage", "health", "score", "move", "position", "target", "attack", "action", "state", "random")
CATEGORY_WORDS = {
    "card": ("card", "deck", "hand", "draw", "discard", "shuffle", "mana", "energy"),
    "tactics": ("grid", "tile", "path", "unit", "range", "distance", "neighbor", "battle", "combat"),
    "tower": ("tower", "wave", "projectile", "creep", "spawn", "cooldown", "upgrade", "defense"),
}
DECLARATION = re.compile(
    r"(?:^|\n)([ \t]*(?:(?:export|default|declare|abstract)\s+)*(?:(?:async)\s+)?"
    r"(?:function\s+([A-Za-z_$][\w$]*)\s*[^;{]*|class\s+([A-Za-z_$][\w$]*)[^;{]*)\{)",
    re.MULTILINE,
)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")


def matching_brace(text: str, opening: int) -> int:
    depth = 0
    quote: str | None = None
    line_comment = block_comment = False
    index = opening
    while index < len(text):
        char = text[index]
        following = text[index + 1] if index + 1 < len(text) else ""
        if line_comment:
            if char == "\n":
                line_comment = False
        elif block_comment:
            if char == "*" and following == "/":
                block_comment = False
                index += 1
        elif quote:
            if char == "\\":
                index += 1
            elif char == quote:
                quote = None
        elif char == "/" and following == "/":
            line_comment = True
            index += 1
        elif char == "/" and following == "*":
            block_comment = True
            index += 1
        elif char in "'\"`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return -1


def extract_units(source: str) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for match in DECLARATION.finditer(source):
        declaration, function_name, class_name = match.group(1), match.group(2), match.group(3)
        name = function_name or class_name
        kind = "function" if function_name else "class"
        start = match.start(1)
        opening = start + declaration.rfind("{")
        closing = matching_brace(source, opening)
        if closing < 0:
            continue
        code = source[start : closing + 1].strip()
        lines = code.count("\n") + 1
        if not (100 <= len(code) <= 3000 and 4 <= lines <= 100):
            continue
        if re.search(r"\b(TODO|FIXME|throw new Error\([\"']not implemented)", code, re.IGNORECASE):
            continue
        units.append({
            "name": name,
            "kind": kind,
            "signature": re.sub(r"\s+", " ", declaration[: declaration.rfind("{")]).strip()[:500],
            "code": code,
            "start_offset": start,
            "end_offset": closing,
        })
    return units


def normalize(code: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"//.*|/\*[\s\S]*?\*/", "", code)).strip()


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def relevance_score(text: str, category: str) -> int:
    lowered = text.lower()
    return sum(word in lowered for word in COMMON) + 2 * sum(word in lowered for word in CATEGORY_WORDS.get(category, CATEGORY_WORDS["tower"]))


def referenced_symbols(code: str, own_name: str) -> list[str]:
    ignored = {own_name, "Math", "Array", "Object", "String", "Number", "Set", "Map", "Promise"}
    return list(dict.fromkeys(value for value in re.findall(r"[A-Za-z_$][A-Za-z0-9_$]*", code) if value[:1].isupper() and value not in ignored))[:12]


def source_files(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*.ts")
        if not any(part in SKIP_DIRECTORIES for part in path.parts)
        and not path.name.endswith(".d.ts")
        and not re.search(r"\.(test|spec)\.ts$", path.name)
        and "config" not in path.name.lower()
    )


def run(checkout_root: Path, repositories_path: Path, output: Path, limit_per_repo: int, target: int) -> dict[str, Any]:
    repositories = [row for row in read_jsonl(repositories_path) if row.get("status") == "accepted"]
    all_units: list[dict[str, Any]] = []
    seen: set[str] = set()
    for repository in repositories:
        root = checkout_root / repository["checkout"]
        candidates: list[dict[str, Any]] = []
        for filename in source_files(root):
            source = filename.read_text(encoding="utf-8", errors="replace")
            relative = filename.relative_to(root).as_posix()
            for unit in extract_units(source):
                score = relevance_score(f"{relative} {unit['name']} {unit['code']}", repository["category"])
                digest = sha256(normalize(unit["code"]))
                if score < 2 or digest in seen:
                    continue
                unit.update(relative=relative, score=score, digest=digest,
                            start=source.count("\n", 0, unit["start_offset"]) + 1,
                            end=source.count("\n", 0, unit["end_offset"]) + 1)
                candidates.append(unit)
        candidates.sort(key=lambda item: (-item["score"], len(item["code"]), item["relative"]))
        for unit in candidates[:limit_per_repo]:
            seen.add(unit["digest"])
            all_units.append({
                "schema_version": "1.0",
                "unit_id": f"scale-{re.sub(r'(^-|-$)', '', re.sub(r'[^a-z0-9]+', '-', repository['repo'].lower()))}-{len(all_units)+1:04d}",
                "repository": repository["repo"], "repository_family_id": repository["family_id"],
                "category": repository["category"], "commit": repository["commit"],
                "license": repository["license"]["spdx_id"], "source_path": unit["relative"],
                "source_lines": f"{unit['start']}-{unit['end']}", "symbol": unit["name"], "kind": unit["kind"],
                "granularity": "G2" if unit["kind"] == "class" else "G1", "signature": unit["signature"],
                "provided_symbols": referenced_symbols(unit["code"], unit["name"]), "relevance_score": unit["score"],
                "target_sha256": sha256(unit["code"].strip()), "target": unit["code"].strip() + "\n",
            })
    selected = sorted(all_units, key=lambda item: (-item["relevance_score"], item["unit_id"]))[:target]
    write_jsonl(output, selected)
    return {"accepted_repositories": len(repositories), "extracted": len(all_units), "selected": len(selected),
            "by_repo": {repo["repo"]: sum(unit["repository"] == repo["repo"] for unit in selected) for repo in repositories},
            "output": str(output)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout-root", type=Path, required=True)
    parser.add_argument("--repositories", type=Path, default=Path("data_pipeline/scale/repositories.jsonl"))
    parser.add_argument("--output", type=Path, default=Path("data_pipeline/scale/units.jsonl"))
    parser.add_argument("--limit-per-repo", type=int, default=36)
    parser.add_argument("--target", type=int, default=500)
    args = parser.parse_args()
    print(json.dumps(run(args.checkout_root.resolve(), args.repositories.resolve(), args.output.resolve(), args.limit_per_repo, args.target), indent=2))


if __name__ == "__main__":
    main()

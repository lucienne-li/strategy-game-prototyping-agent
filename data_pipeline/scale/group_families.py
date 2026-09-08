from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Group accepted repositories by shared normalized TypeScript files.")
    parser.add_argument("--repositories", default="data_pipeline/scale/repositories.jsonl")
    parser.add_argument("--checkout-root", required=True)
    parser.add_argument("--threshold", type=float, default=0.30)
    args = parser.parse_args()
    path = Path(args.repositories)
    rows = read_jsonl(path)
    accepted = [row for row in rows if row["status"] == "accepted"]
    root = Path(args.checkout_root).resolve()
    fingerprints = {row["repo"]: source_hashes(root / row["checkout"]) for row in accepted}
    parent = {row["repo"]: row["repo"] for row in accepted}
    evidence = []

    def find(item: str) -> str:
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    def union(left: str, right: str) -> None:
        a, b = find(left), find(right)
        if a != b:
            parent[max(a, b)] = min(a, b)

    for index, left in enumerate(accepted):
        for right in accepted[index + 1:]:
            a, b = fingerprints[left["repo"]], fingerprints[right["repo"]]
            shared = len(a & b)
            score = shared / len(a | b) if a or b else 0.0
            if shared >= 3 and score >= args.threshold:
                union(left["repo"], right["repo"])
                evidence.append({"left": left["repo"], "right": right["repo"], "shared_files": shared, "jaccard": round(score, 4)})

    for row in accepted:
        canonical = find(row["repo"])
        row["family_id"] = f"github-family:{canonical}"
        row["family_check"] = {"method": "normalized_typescript_file_jaccard", "threshold": args.threshold, "source_files": len(fingerprints[row["repo"]])}
    write_jsonl(path, rows)
    print(json.dumps({"accepted_repositories": len(accepted), "families": len({find(row['repo']) for row in accepted}), "grouped_pairs": evidence}, indent=2))


def source_hashes(root: Path) -> set[str]:
    result = set()
    for item in root.rglob("*.ts"):
        if any(part in {"node_modules", ".git", "dist", "build", "coverage", "vendor"} for part in item.parts):
            continue
        if item.name.endswith((".d.ts", ".test.ts", ".spec.ts")):
            continue
        text = item.read_text(encoding="utf-8", errors="replace")
        normalized = re.sub(r"\s+", " ", re.sub(r"//.*|/\*[\s\S]*?\*/", "", text)).strip()
        if normalized:
            result.add(hashlib.sha256(normalized.encode()).hexdigest())
    return result


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")
    temporary.replace(path)


if __name__ == "__main__":
    main()

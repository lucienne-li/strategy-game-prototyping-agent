from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ALLOWED_LICENSES = {"MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0"}
IGNORED_SCRIPTS = {"test", "lint", "format", "dev", "serve", "start", "preview"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Clone and validate a small batch of TypeScript game repositories.")
    parser.add_argument("--candidates", default="data_pipeline/scale/candidates.json")
    parser.add_argument("--checkout-root", required=True)
    parser.add_argument("--output", default="data_pipeline/scale/repositories.jsonl")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=240)
    args = parser.parse_args()
    candidates = json.loads(Path(args.candidates).read_text(encoding="utf-8"))
    root = Path(args.checkout_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    output = Path(args.output)
    prior = {row["repo"]: row for row in read_jsonl(output)} if output.exists() else {}
    pending = [
        {**item, "expected_commit": prior.get(item["repo"], {}).get("commit")}
        for item in candidates
        if item["repo"] not in prior
        or not (root / item["repo"].replace("/", "__") / ".git").exists()
    ]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_repository, item, root, args.timeout): item for item in pending}
        for future in as_completed(futures):
            row = future.result()
            prior[row["repo"]] = row
            write_jsonl(output, [prior[item["repo"]] for item in candidates if item["repo"] in prior])
            print(json.dumps({"repo": row["repo"], "status": row["status"], "reason": row.get("reason")}), flush=True)

    rows = [prior[item["repo"]] for item in candidates]
    print(json.dumps({
        "candidates": len(rows),
        "accepted": sum(row["status"] == "accepted" for row in rows),
        "rejected": sum(row["status"] != "accepted" for row in rows),
        "output": str(output),
    }))


def process_repository(item: dict, root: Path, timeout: int) -> dict:
    repo = item["repo"]
    destination = root / repo.replace("/", "__")
    started = time.perf_counter()
    row = {"schema_version": "1.0", "repo": repo, "category": item["category"], "family_id": f"github:{repo}", "checkout": destination.name}
    try:
        if not (destination / ".git").exists():
            run(["git", "clone", "--depth", "1", f"https://github.com/{repo}.git", str(destination)], root, timeout)
        if item.get("expected_commit"):
            run(["git", "fetch", "--depth", "1", "origin", item["expected_commit"]], destination, timeout)
            run(["git", "checkout", "--detach", item["expected_commit"]], destination, 30)
        row["commit"] = run(["git", "rev-parse", "HEAD"], destination, 30)["stdout"].strip()
        row["remote"] = f"https://github.com/{repo}"
        license_path = find_license(destination)
        if license_path is None:
            return reject(row, "LICENSE_MISSING", started)
        license_text = license_path.read_text(encoding="utf-8", errors="replace")
        spdx = detect_license(license_text)
        row["license"] = {"spdx_id": spdx, "path": str(license_path.relative_to(destination)), "sha256": sha256(license_text)}
        if spdx not in ALLOWED_LICENSES:
            return reject(row, "LICENSE_NOT_ALLOWED_OR_AMBIGUOUS", started)
        package_path = destination / "package.json"
        if not package_path.is_file():
            return reject(row, "PACKAGE_JSON_MISSING", started)
        package = json.loads(package_path.read_text(encoding="utf-8"))
        scripts = package.get("scripts") if isinstance(package.get("scripts"), dict) else {}
        build_script = choose_build_script(scripts)
        if build_script is None:
            return reject(row, "BUILD_SCRIPT_MISSING", started)
        install = ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"] if (destination / "package-lock.json").exists() else ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"]
        install_result = run(install, destination, timeout, check=False)
        row["install"] = summarize(install_result)
        if install_result["exit_code"] != 0:
            return reject(row, "INSTALL_FAILED", started)
        build_result = run(
            ["npm", "run", build_script],
            destination,
            timeout,
            check=False,
            env={
                "NODE_OPTIONS": "--openssl-legacy-provider",
                "NEXT_TELEMETRY_DISABLED": "1",
                "TURBO_TELEMETRY_DISABLED": "1",
                "DO_NOT_TRACK": "1",
            },
        )
        row["build"] = {"script": build_script, **summarize(build_result)}
        if build_result["exit_code"] != 0:
            return reject(row, "BUILD_FAILED", started)
        ts_files = eligible_ts_files(destination)
        row["typescript"] = {"eligible_files": len(ts_files), "source_bytes": sum(path.stat().st_size for path in ts_files)}
        if len(ts_files) < 2:
            return reject(row, "INSUFFICIENT_TYPESCRIPT_GAME_CODE", started)
        row["status"] = "accepted"
        row["duration_seconds"] = round(time.perf_counter() - started, 3)
        return row
    except subprocess.TimeoutExpired:
        return reject(row, "TIMEOUT", started)
    except Exception as error:
        row["error"] = str(error)[:500]
        return reject(row, "PROCESSING_ERROR", started)


def run(command: list[str], cwd: Path, timeout: int, check: bool = True, env: dict[str, str] | None = None) -> dict:
    completed = subprocess.run(
        command,
        cwd=cwd,
        text=True,
        capture_output=True,
        timeout=timeout,
        env={**os.environ, **(env or {})},
    )
    result = {"exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr}
    if check and completed.returncode != 0:
        raise RuntimeError(f"{' '.join(command)} failed: {completed.stderr[-300:]}")
    return result


def find_license(root: Path) -> Path | None:
    for name in ("LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md", "COPYING"):
        path = root / name
        if path.is_file():
            return path
    return None


def detect_license(text: str) -> str:
    normalized = " ".join(text.lower().split())
    if "apache license" in normalized and "version 2.0" in normalized:
        return "Apache-2.0"
    if "redistribution and use in source and binary forms" in normalized:
        clause = "neither the name" in normalized or "names of its contributors" in normalized
        return "BSD-3-Clause" if clause else "BSD-2-Clause"
    if "permission is hereby granted, free of charge" in normalized and "the software is provided \"as is\"" in normalized:
        return "MIT"
    return "UNKNOWN"


def choose_build_script(scripts: dict) -> str | None:
    for name in ("build", "build:prod", "compile", "bundle"):
        if isinstance(scripts.get(name), str):
            return name
    candidates = [name for name, value in scripts.items() if isinstance(value, str) and name not in IGNORED_SCRIPTS and "build" in name]
    return sorted(candidates)[0] if candidates else None


def eligible_ts_files(root: Path) -> list[Path]:
    files = []
    for path in root.rglob("*.ts"):
        relative = path.relative_to(root).as_posix()
        if any(part in {"node_modules", "dist", "build", ".git", "coverage", "vendor"} for part in path.parts):
            continue
        if path.name.endswith((".d.ts", ".test.ts", ".spec.ts")) or "config" in path.name.lower():
            continue
        if re.search(r"(^|/)(test|tests|__tests__|generated)(/|$)", relative):
            continue
        files.append(path)
    return files


def summarize(result: dict) -> dict:
    return {"exit_code": result["exit_code"], "stdout_tail": result["stdout"][-1000:], "stderr_tail": result["stderr"][-1000:]}


def reject(row: dict, reason: str, started: float) -> dict:
    row["status"] = "rejected"
    row["reason"] = reason
    row["duration_seconds"] = round(time.perf_counter() - started, 3)
    return row


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")
    temporary.replace(path)


if __name__ == "__main__":
    main()

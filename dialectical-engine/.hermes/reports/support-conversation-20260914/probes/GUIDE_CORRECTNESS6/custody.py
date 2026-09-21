#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import subprocess
from pathlib import Path

SOURCE = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine")
DETACHED = SOURCE / ".worktrees/support-cp1-p3-correctness/dialectical-engine"
PRIMARY = SOURCE / ".worktrees/support-conversation-cp1/dialectical-engine"
REVISION = "5731eb6faac25f9712f04aea029a021f6eee9352"
BASE = "f3be0af81f1691db6c23494f9e286bb6b10f13bf"
INPUTS = SOURCE / ".hermes/reports/support-conversation-20260914/evidence/GUIDE_CORRECTNESS6-inputs.json"
GATE = SOURCE / ".hermes/reports/support-conversation-20260914/evidence/GATE_GUIDE_FINAL5-manifest.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git(cwd: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()


def verify_entries(entries: list[dict], root_key: str | None = None, root: Path | None = None) -> tuple[int, list[str]]:
    failures: list[str] = []
    for entry in entries:
        path = Path(entry["path"]) if root_key is None else (root / entry[root_key])
        if not path.is_file():
            failures.append(f"missing:{path}")
            continue
        actual_bytes = path.stat().st_size
        actual_hash = sha256(path)
        if actual_bytes != entry["bytes"] or actual_hash != entry["sha256"]:
            failures.append(
                f"mismatch:{path}:bytes={actual_bytes}/{entry['bytes']}:sha256={actual_hash}/{entry['sha256']}"
            )
    return len(entries), failures


inputs = json.loads(INPUTS.read_text())
gate = json.loads(GATE.read_text())
input_count, input_failures = verify_entries(inputs["inputs"])
detached_count, detached_failures = verify_entries(
    gate["productFiles"], "laneRelative", DETACHED
)
primary_count, primary_failures = verify_entries(
    gate["productFiles"], "laneRelative", PRIMARY
)

expected_changed = sorted(gate["changedPaths"])
actual_changed = sorted(
    line.removeprefix("dialectical-engine/")
    for line in git(DETACHED, "diff", "--name-only", f"{BASE}..{REVISION}").splitlines()
    if line
)
detached_head = git(DETACHED, "rev-parse", "HEAD")
primary_head = git(PRIMARY, "rev-parse", "HEAD")
detached_dirty = len(git(DETACHED, "status", "--porcelain=v1", "--untracked-files=all").splitlines())
primary_dirty = len(git(PRIMARY, "status", "--porcelain=v1", "--untracked-files=all").splitlines())

result = {
    "revision": REVISION,
    "inputManifestRevision": inputs["revision"],
    "gateRevision": gate["revision"],
    "gateBase": gate["base"],
    "inputs": {"checked": input_count, "failures": input_failures},
    "detachedProduct": {"checked": detached_count, "failures": detached_failures},
    "primaryProduct": {"checked": primary_count, "failures": primary_failures},
    "changedPaths": {"expected": expected_changed, "actual": actual_changed},
    "detached": {"head": detached_head, "dirty": detached_dirty},
    "primary": {"head": primary_head, "dirty": primary_dirty},
}
print(json.dumps(result, indent=2))

failed = any((
    input_failures,
    detached_failures,
    primary_failures,
    inputs["revision"] != REVISION,
    gate["revision"] != REVISION,
    gate["base"] != BASE,
    actual_changed != expected_changed,
    detached_head != REVISION,
    primary_head != REVISION,
    detached_dirty != 0,
    primary_dirty != 0,
))
raise SystemExit(1 if failed else 0)

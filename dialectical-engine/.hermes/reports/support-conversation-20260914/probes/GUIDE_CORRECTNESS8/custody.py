#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import subprocess
from pathlib import Path

SOURCE = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine")
DETACHED = SOURCE / ".worktrees/support-cp1-p3-correctness/dialectical-engine"
PRIMARY = SOURCE / ".worktrees/support-conversation-cp1/dialectical-engine"
REVISION = "78988fc2e5e24595bd9cd6ec0a3965c6039dc718"
BASE = "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13"
INPUTS = SOURCE / ".hermes/reports/support-conversation-20260914/evidence/GUIDE_CORRECTNESS8-inputs.json"
GATE = SOURCE / ".hermes/reports/support-conversation-20260914/evidence/GATE_GUIDE_FINAL7-manifest.json"

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def git(cwd: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()

def verify_entries(entries: list[dict], key: str | None = None, root: Path | None = None):
    failures: list[str] = []
    for entry in entries:
        path = Path(entry["path"]) if key is None else root / entry[key]
        if not path.is_file():
            failures.append(f"missing:{path}")
            continue
        if path.stat().st_size != entry["bytes"] or sha256(path) != entry["sha256"]:
            failures.append(f"mismatch:{path}")
    return len(entries), failures

inputs = json.loads(INPUTS.read_text())
gate = json.loads(GATE.read_text())
input_count, input_failures = verify_entries(inputs["inputs"])
detached_count, detached_failures = verify_entries(gate["productFiles"], "laneRelative", DETACHED)
primary_count, primary_failures = verify_entries(gate["productFiles"], "laneRelative", PRIMARY)
actual_changed = sorted(
    line.removeprefix("dialectical-engine/")
    for line in git(DETACHED, "diff", "--name-only", f"{BASE}..{REVISION}").splitlines()
    if line
)
expected_changed = sorted(inputs["changedProductPaths"])
result = {
    "revision": REVISION,
    "base": BASE,
    "inputManifestRevision": inputs["revision"],
    "gateRevision": gate["revision"],
    "inputs": {"checked": input_count, "failures": input_failures},
    "detachedProduct": {"checked": detached_count, "failures": detached_failures},
    "primaryProduct": {"checked": primary_count, "failures": primary_failures},
    "changedPaths": {"expected": expected_changed, "actual": actual_changed},
    "detached": {
        "head": git(DETACHED, "rev-parse", "HEAD"),
        "dirty": len(git(DETACHED, "status", "--porcelain=v1", "--untracked-files=all").splitlines()),
    },
    "primary": {
        "head": git(PRIMARY, "rev-parse", "HEAD"),
        "dirty": len(git(PRIMARY, "status", "--porcelain=v1", "--untracked-files=all").splitlines()),
    },
}
print(json.dumps(result, indent=2))
failed = any((
    input_failures, detached_failures, primary_failures,
    inputs["revision"] != REVISION, gate["revision"] != REVISION,
    actual_changed != expected_changed,
    result["detached"]["head"] != REVISION, result["detached"]["dirty"] != 0,
    result["primary"]["head"] != REVISION, result["primary"]["dirty"] != 0,
))
raise SystemExit(1 if failed else 0)

import hashlib
import json
import subprocess
from pathlib import Path

MISSION = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine")
DETACHED = MISSION / ".worktrees/support-cp1-p3-correctness/dialectical-engine"
PRIMARY = MISSION / ".worktrees/support-conversation-cp1/dialectical-engine"
REVISION = "2ccb57fa061f74a81c8f2ef42bd33c768f00d4e0"


def digest(path: Path) -> tuple[str, int]:
    data = path.read_bytes()
    return hashlib.sha256(data).hexdigest(), len(data)


def git(directory: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(directory), *args], text=True).strip()


inputs_path = MISSION / ".hermes/reports/support-conversation-20260914/evidence/GUIDE_CORRECTNESS2-inputs.json"
gate_path = MISSION / ".hermes/reports/support-conversation-20260914/evidence/GATE_GUIDE_FINAL-manifest.json"
freeze_path = MISSION / ".hermes/reports/support-conversation-20260914/evidence/FREEZE-GUIDE-FINAL-REVIEWS2.json"

inputs = json.loads(inputs_path.read_text())
input_entries = inputs.get("files", inputs.get("inputs", []))
gate = json.loads(gate_path.read_text())
freeze = json.loads(freeze_path.read_text())

print(f"freeze_sha256={digest(freeze_path)[0]}")
print(f"freeze_commit={freeze['commit']}")
print(f"source_head={git(MISSION, 'rev-parse', 'HEAD')}")
for label, lane in (("detached", DETACHED), ("primary", PRIMARY)):
    print(f"{label}_head={git(lane, 'rev-parse', 'HEAD')}")
    dirty = git(lane, "status", "--porcelain=v1")
    print(f"{label}_dirty={0 if dirty == '' else len(dirty.splitlines())}")

input_mismatches = []
for item in input_entries:
    path = Path(item["path"])
    actual_hash, actual_bytes = digest(path)
    if actual_hash != item["sha256"] or actual_bytes != item["bytes"]:
        input_mismatches.append((str(path), actual_hash, actual_bytes))
print(f"indexed_inputs_checked={len(input_entries)}")
print(f"indexed_inputs_mismatches={len(input_mismatches)}")
for mismatch in input_mismatches:
    print("INPUT_MISMATCH\t" + "\t".join(map(str, mismatch)))

for label, lane in (("detached", DETACHED), ("primary", PRIMARY)):
    mismatches = []
    for item in gate["productFiles"]:
        path = lane / item["laneRelative"]
        actual_hash, actual_bytes = digest(path)
        if actual_hash != item["sha256"] or actual_bytes != item["bytes"]:
            mismatches.append((item["laneRelative"], actual_hash, actual_bytes))
    print(f"{label}_gate_files_checked={len(gate['productFiles'])}")
    print(f"{label}_gate_mismatches={len(mismatches)}")
    for mismatch in mismatches:
        print(f"{label.upper()}_GATE_MISMATCH\t" + "\t".join(map(str, mismatch)))

changed = git(DETACHED, "diff", "--name-only", "c34c64d4e643e404cefe96dfaf167536ae364a94.." + REVISION).splitlines()
expected_changed = sorted("dialectical-engine/" + path for path in gate["changedPaths"])
print(f"changed_paths={len(changed)}")
print(f"changed_paths_exact={sorted(changed) == expected_changed}")
for path in changed:
    print(f"CHANGED\t{path}")

if freeze["commit"] != "b9901446b0d4e6a9e000156bb181bc4d7fe4b087":
    raise SystemExit(1)
if digest(freeze_path)[0] != "5a8923f9a876d6216b761ce8302ce2f01621862954e4647e464d4a11c06cd0a0":
    raise SystemExit(1)
if any((input_mismatches,)) or any(
    digest(lane / item["laneRelative"]) != (item["sha256"], item["bytes"])
    for lane in (DETACHED, PRIMARY) for item in gate["productFiles"]
):
    raise SystemExit(1)
if git(DETACHED, "rev-parse", "HEAD") != REVISION or git(PRIMARY, "rev-parse", "HEAD") != REVISION:
    raise SystemExit(1)
if git(DETACHED, "status", "--porcelain=v1") or git(PRIMARY, "status", "--porcelain=v1"):
    raise SystemExit(1)
if sorted(changed) != expected_changed:
    raise SystemExit(1)

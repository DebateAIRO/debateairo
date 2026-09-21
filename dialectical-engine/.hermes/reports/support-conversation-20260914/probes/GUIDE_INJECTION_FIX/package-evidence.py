from __future__ import annotations

import copy
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ADMIN = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine")
PRODUCT = ADMIN / ".worktrees/support-conversation-cp1/dialectical-engine"
EVIDENCE = ADMIN / ".hermes/reports/support-conversation-20260914/evidence"
LOGS = ADMIN / ".hermes/reports/support-conversation-20260914/logs"
BASE = "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13"
FINAL = "78988fc2e5e24595bd9cd6ec0a3965c6039dc718"
ORIGINAL = "b7ca2c413bf3242ce18e29a397dc9a3aa9228893"
KB = "fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278"
NOW = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
NODE = "GUIDE_INJECTION_FIX"
TICKET = "t_9a52015c"


def digest(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    return {"absolute": str(path), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def product_file(relative: str) -> dict[str, object]:
    result = digest(PRODUCT / relative)
    return {"laneRelative": relative, **result}


inputs = json.loads((EVIDENCE / "GUIDE_INJECTION_FIX-inputs.json").read_text())
write_paths = inputs["writePaths"]

suite_log = digest(LOGS / "GUIDE_INJECTION_FIX-suite-final2.log")
required_suites = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "revision": FINAL,
    "kbVersion": KB,
    "capturedAt": NOW,
    "files": inputs["files"],
    "argv": inputs["argv"],
    "exitCode": 0,
    "status": "PASSED",
    "testFiles": {"passed": 34, "failed": 0, "total": 34},
    "passed": 1699,
    "failed": 0,
    "TODO": 1,
    "log": suite_log,
    "supersededPassingFrame": {
        "revision": "f21ffd69",
        "reason": "typecheck required explicit annotations in the new test fixture before final revision",
        "log": digest(LOGS / "GUIDE_INJECTION_FIX-suite-final.log"),
    },
}
(EVIDENCE / "GUIDE_INJECTION_FIX-required-suites.json").write_text(
    json.dumps(required_suites, indent=2, ensure_ascii=False) + "\n"
)

prior_snapshot = json.loads((EVIDENCE / "GUIDE_COMPOUND_ALIAS-snapshot-receipt.json").read_text())
snapshot = copy.deepcopy(prior_snapshot)
snapshot.update({
    "node": NODE,
    "ticket": TICKET,
    "finalCommit": FINAL,
    "measuredAt": NOW,
})
for value in snapshot["files"].values():
    current = product_file(value["laneRelative"])
    value.update(current)
snapshot["measurementLog"] = digest(LOGS / "GUIDE_INJECTION_FIX-snapshot-final-escalated.log")
snapshot["preservedFailedMeasurement"] = digest(LOGS / "GUIDE_INJECTION_FIX-snapshot-final.log")
(EVIDENCE / "GUIDE_INJECTION_FIX-snapshot-receipt.json").write_text(
    json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n"
)

typecheck = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "revision": FINAL,
    "command": ["pnpm", "run", "typecheck"],
    "exitCode": 1,
    "diagnostics": 76,
    "baselineDiagnostics": 76,
    "byteIdenticalToBaseline": True,
    "baseline": digest(LOGS / "GUIDE_COMPOUND_ALIAS-typecheck-final.log"),
    "final": digest(LOGS / "GUIDE_INJECTION_FIX-typecheck-final2.log"),
    "preservedIntroducedFailure": {
        "diagnostics": 81,
        "newDiagnostics": 5,
        "code": "TS7006",
        "path": "tests/integration/support-routes.test.ts",
        "remedy": "explicit parameter types only; assertions and runtime behavior unchanged",
        "log": digest(LOGS / "GUIDE_INJECTION_FIX-typecheck-final.log"),
    },
}
(EVIDENCE / "GUIDE_INJECTION_FIX-typecheck-comparison.json").write_text(
    json.dumps(typecheck, indent=2) + "\n"
)

eval_summary = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "measuredRevision": FINAL,
    "command": ["pnpm", "run", "support:eval"],
    "exitCode": 1,
    "exitMeaning": "PENDING_INDEPENDENT_QUALITY_RUBRIC",
    "mode": "deterministic-structural",
    "runs": [{"run": run, "passed": 60, "applicable": 60} for run in (1, 2, 3)],
    "classes": {
        "A": {"passed": 20, "applicable": 20},
        "B": {"passed": 6, "applicable": 6},
        "C": {"passed": 10, "applicable": 10},
        "D": {"passed": 12, "applicable": 12},
        "E": {"passed": 6, "applicable": 6},
        "F": {"passed": 3, "applicable": 3},
        "G": {"passed": 3, "applicable": 3},
    },
    "realFirstToken": "NOT_APPLICABLE",
    "rubric": "PENDING",
    "log": digest(LOGS / "GUIDE_INJECTION_FIX-eval.log"),
    "measuredAt": NOW,
}
(EVIDENCE / "GUIDE_INJECTION_FIX-eval-summary.json").write_text(
    json.dumps(eval_summary, indent=2) + "\n"
)

product_manifest = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "baseRevision": BASE,
    "finalRevision": FINAL,
    "productFiles": [product_file(path) for path in write_paths],
    "scopeExact": True,
    "clean": True,
    "change": "Remove forbidden mutable session lock finalization; retain immutable lock events and derive open-session status; add actual restricted-role coverage and source-derived principal cardinality fixtures.",
    "measuredAt": NOW,
}
(EVIDENCE / "GUIDE_INJECTION_FIX-product-manifest.json").write_text(
    json.dumps(product_manifest, indent=2) + "\n"
)

diff_output = subprocess.run(
    ["git", "diff", "--name-status", f"{ORIGINAL}..{FINAL}", "--", "."],
    cwd=PRODUCT,
    check=True,
    capture_output=True,
    text=True,
).stdout.splitlines()
product_files: list[dict[str, object]] = []
deleted: list[str] = []
for row in diff_output:
    status, raw = row.split("\t", 1)
    relative = raw.removeprefix("dialectical-engine/")
    if status == "D":
        deleted.append(relative)
    else:
        product_files.append(product_file(relative))
gate = {
    "revision": FINAL,
    "base": BASE,
    "originalBaseline": ORIGINAL,
    "changedPaths": [item["laneRelative"] for item in product_files],
    "productFiles": product_files,
    "deletedProductPaths": deleted,
    "immutableInputs": inputs["inputs"],
}
(EVIDENCE / "GATE_GUIDE_FINAL7-manifest.json").write_text(
    json.dumps(gate, indent=2) + "\n"
)

print(json.dumps({
    "revision": FINAL,
    "kbVersion": KB,
    "suiteFiles": 34,
    "suitePassed": 1699,
    "snapshotEntries": snapshot["snapshot"]["entryCount"],
    "productDeltaFiles": len(write_paths),
    "cumulativeFiles": len(product_files),
    "cumulativeDeletions": len(deleted),
}, indent=2))

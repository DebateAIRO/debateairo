#!/usr/bin/env python3
"""Seal GUIDE_ACTION_COMPOSE evidence from already captured measurements."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ADMIN = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine")
PRODUCT = ADMIN / ".worktrees/support-conversation-cp1/dialectical-engine"
REPORT = ADMIN / ".hermes/reports/support-conversation-20260914"
EVIDENCE = REPORT / "evidence"
LOGS = REPORT / "logs"
PROBE = REPORT / "probes/GUIDE_ACTION_COMPOSE/package_evidence.py"
SELF_REPORT = REPORT / "agent-reports/GUIDE_ACTION_COMPOSE.md"
NODE = "GUIDE_ACTION_COMPOSE"
TICKET = "t_3ffab684"
BASE = "b0b91a01cf161d17eef75577cbae94c629b7bc49"
FINAL = "c8784902f78ed4ba1d637d122e1f32f598415f4e"
KB = "fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278"
HARNESS = "f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917"
NOW = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def digest(path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    return {"absolute": str(path), "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}


def product_digest(relative: str, *, absolute: bool = False) -> dict[str, object]:
    item = digest(PRODUCT / relative)
    out: dict[str, object] = {"laneRelative": relative}
    if absolute:
        out["absolute"] = item["absolute"]
    out["sha256"] = item["sha256"]
    out["bytes"] = item["bytes"]
    return out


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


prior_snapshot = json.loads((EVIDENCE / "GUIDE_GUARDFIX2-snapshot-receipt.json").read_text())
logical_records = prior_snapshot["logicalRecords"]
assert len(logical_records) == 44
for record in logical_records:
    article = record["article"]
    current = product_digest(article["laneRelative"], absolute=True)
    assert current["sha256"] == article["sha256"], record["logicalKey"]
    assert current["bytes"] == article["bytes"], record["logicalKey"]
    review = record["review"]
    if not review["ratifiedBy"]:
        assert review["ratifiedOn"] == "", record["logicalKey"]

snapshot_files = {
    "component": "packages/support-kb/recovery/components.json",
    "review": "packages/support-kb/reviews/manifest.json",
    "catalogSource": "packages/support-kb/src/catalog.ts",
    "loaderSource": "packages/support-kb/src/index.ts",
    "rankingSource": "packages/support-kb/src/context.ts",
    "productionApiSource": "apps/api/src/main.ts",
}
snapshot = {
    "schemaVersion": 1,
    "status": "MEASURED STRICT REVIEWED RECOVERY SNAPSHOT; NO OWNER ACCEPTANCE",
    "node": NODE,
    "ticket": TICKET,
    "finalCommit": FINAL,
    "measuredAt": NOW,
    "files": {key: product_digest(path, absolute=True) for key, path in snapshot_files.items()},
    "snapshot": prior_snapshot["snapshot"],
    "logicalRecords": logical_records,
    "authority": "measurement-only",
}
assert snapshot["snapshot"]["kbVersion"] == KB
assert snapshot["snapshot"]["entryCount"] == 44
write_json(EVIDENCE / f"{NODE}-snapshot-receipt.json", snapshot)

inputs = json.loads((EVIDENCE / f"{NODE}-inputs.json").read_text())
assert len(inputs["files"]) == 33
required_suites = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "revision": FINAL,
    "kbVersion": KB,
    "capturedBeforeExecutionAt": "2026-09-17T18:55:44+03:00",
    "files": inputs["files"],
    "argv": inputs["argv"],
    "completedAt": NOW,
    "exitCode": 0,
    "status": "PASSED",
    "testFiles": {"passed": 33, "failed": 0, "total": 33},
    "passed": 1633,
    "failed": 0,
    "TODO": 1,
    "log": digest(LOGS / f"{NODE}-suite-final2.log"),
}
write_json(EVIDENCE / f"{NODE}-required-suites.json", required_suites)

baseline = LOGS / "ATTEST_P2-typecheck-final2.log"
final_typecheck = LOGS / f"{NODE}-typecheck-final2.log"
initial_typecheck = LOGS / f"{NODE}-typecheck-final.log"
baseline_d = digest(baseline)
final_d = digest(final_typecheck)
initial_d = digest(initial_typecheck)
assert baseline_d["sha256"] == final_d["sha256"] == "06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0"
assert sum(": error TS" in line for line in baseline.read_text().splitlines()) == 76
assert sum(": error TS" in line for line in final_typecheck.read_text().splitlines()) == 76
assert sum(": error TS" in line for line in initial_typecheck.read_text().splitlines()) == 78
typecheck = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "revision": FINAL,
    "command": ["pnpm", "run", "typecheck"],
    "exitCode": 1,
    "exitMeaning": "ATTRIBUTED_BASELINE_ONLY",
    "baseline": {**baseline_d, "diagnostics": 76},
    "current": {**final_d, "diagnostics": 76},
    "byteIdentical": True,
    "missionAddedDiagnostics": 0,
    "preservedPrefinalRed": {
        **initial_d,
        "revision": BASE,
        "diagnostics": 78,
        "missionAddedDiagnostics": 2,
        "added": [
            "tests/unit/support-answer-context.test.ts(194,20): TS2532",
            "tests/unit/support-answer-context.test.ts(194,45): TS2493",
        ],
    },
    "measuredAt": NOW,
}
write_json(EVIDENCE / f"{NODE}-typecheck-comparison.json", typecheck)

runtime_paths = [
    "packages/support-kb/src/context.ts",
    "apps/api/src/support/answer.ts",
    "tests/support-eval/run.ts",
]
eval_summary = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "measuredRevision": BASE,
    "retainedForRevision": FINAL,
    "retentionBasis": "The only commit between measuredRevision and retainedForRevision changes test mock typing in tests/unit/support-answer-context.test.ts; runtime and evaluation-defining bytes are unchanged.",
    "unchangedRuntimeAndEvalFiles": [product_digest(path) for path in runtime_paths],
    "command": ["pnpm", "run", "support:eval"],
    "exitCode": 1,
    "exitMeaning": "PENDING_INDEPENDENT_QUALITY_RUBRIC",
    "mode": "deterministic-structural",
    "runs": [{"run": n, "passed": 60, "applicable": 60} for n in (1, 2, 3)],
    "classes": {key: {"passed": count, "applicable": count} for key, count in {"A": 20, "B": 6, "C": 10, "D": 12, "E": 6, "F": 3, "G": 3}.items()},
    "realFirstToken": "NOT_APPLICABLE",
    "rubric": "PENDING",
    "executedLog": digest(LOGS / f"{NODE}-eval-escalated.log"),
    "preservedSandboxFailure": {
        **digest(LOGS / f"{NODE}-eval.log"),
        "exitMeaning": "TSX_IPC_LISTENER_EPERM_BEFORE_EVALUATION",
    },
    "measuredAt": NOW,
}
write_json(EVIDENCE / f"{NODE}-eval-summary.json", eval_summary)

harness_summary = {
    "schemaVersion": 2,
    "node": NODE,
    "ticket": TICKET,
    "revision": FINAL,
    "kbVersion": KB,
    "result": "PASS",
    "controls": 62,
    "passed": 62,
    "harnessSha256": HARNESS,
    "log": digest(LOGS / f"{NODE}-harness-controls-final.log"),
    "measuredAt": NOW,
}
write_json(EVIDENCE / f"{NODE}-harness-summary.json", harness_summary)

product_files = [product_digest("tests/unit/support-answer-context.test.ts")]
product_manifest = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "baseRevision": BASE,
    "finalRevision": FINAL,
    "productFiles": product_files,
    "scopeExact": True,
    "clean": True,
    "change": "Test-only SupportModelPort completion mock typing; assertions and runtime are unchanged.",
    "measuredAt": NOW,
}
write_json(EVIDENCE / f"{NODE}-product-manifest.json", product_manifest)

evidence_md = "# GUIDE_ACTION_COMPOSE evidence\n\n"
evidence_md += f"- Verdict: `COMPOSED_MEASURED_PENDING_SEPARATE_REVIEWS_AND_LIVE2`\n"
evidence_md += f"- Product revision: `{FINAL}` (clean), from `{BASE}` by one test-only commit.\n"
evidence_md += "- Exact required union: 33/33 files passed; 1,633 tests passed and 1 TODO.\n"
evidence_md += "- Typecheck: exit 1 with exactly the attributed 76-diagnostic intake baseline; the final output is byte-identical to the indexed baseline and adds zero diagnostics. The preserved pre-fix output had two additional mock tuple diagnostics.\n"
evidence_md += "- Controlled structural evaluation: measured once at the base revision, three runs of 60/60; rubric remains `PENDING`, real first token is `NOT_APPLICABLE`. It is retained rather than relabeled because the only later change is test mock typing.\n"
evidence_md += f"- Strict snapshot: 44 records, KB `{KB}`, reviewed recovery owner fields remain blank.\n"
evidence_md += f"- Frozen FIX2 harness: schema 2, 62/62 controls, final revision and unchanged harness `{HARNESS}`.\n"
evidence_md += "- Preserved failure: the first eval attempt could not create the TSX IPC listener in the sandbox; the executable run is separately captured.\n"
evidence_md += "- Limits: no live model, browser, HTTP, database, preview, or row-proof adapter execution occurred. LIVE2 still owns fresh-runtime all-54 action proof. Forgot-password destination remains unresolved and actionless. No owner acceptance or checkpoint readiness is claimed.\n"
(EVIDENCE / f"{NODE}.md").write_text(evidence_md, encoding="utf-8")

self_report_md = f"""# GUIDE_ACTION_COMPOSE self-report\n\n## Handoff\n\n- Node/ticket/session: `{NODE}` / `{TICKET}` / `/root/requirements`.\n- Base/final: `{BASE}` -> `{FINAL}`.\n- Exact product scope: one test file, typed with the production `SupportModelPort` completion contract; assertions and runtime bytes are unchanged.\n- Final evidence: exact33 1,633 passed + 1 TODO; typecheck equals the attributed 76-diagnostic baseline; strict44 snapshot; frozen FIX2 62/62.\n- Retained evidence: controlled structural eval ran at the base revision with 3x60/60 and rubric `PENDING`; no duplicate eval was run after the test-only correction.\n- Custody: product is clean and both heavy/Git leases were released. Separate reviews and LIVE2 remain required.\n\n## Requested retrospective\n\n> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.\n\nThe evidence trail shows four recurring costs. First, runtime suites passed before the test mock's tuple type was checked. The generated verification contract should typecheck affected tests before the broad union and commit, so a two-line mock correction does not force a second 33-file run. Second, receipt generation remains manual and revision-sensitive. One mission command should capture the revision, immutable suite argv, KB digest, snapshot hashes, test counts, and lease state, while distinguishing evidence executed at the final revision from evidence retained across a byte-proven test-only change. Third, the sandbox TSX IPC restriction caused an uninformative first eval attempt. A preflight should select the supported execution environment before starting the one allowed evaluation. Fourth, fresh-runtime product proofs and inert harness controls are different gates; the orchestration prompt should schedule them explicitly and never imply that inert controls establish live action behavior.\n\nThe strongest one-prompt workflow would compile a typed verification manifest before work starts: allowed product files, exact test union, expected baseline diagnostics, immutable harness digest, required snapshot schema, commands with environment requirements, and downstream gates. It would fail early on unsupported flags or IPC constraints, run the cheapest affected/type checks before broad suites, create receipts from command results, and require every claim to name its measured revision. That would preserve the current rigor while removing repeated file discovery, manual hash bookkeeping, and ambiguous retained-versus-fresh evidence.\n"""
SELF_REPORT.write_text(self_report_md, encoding="utf-8")

artifact_paths = [
    EVIDENCE / f"{NODE}.md",
    EVIDENCE / f"{NODE}-snapshot-receipt.json",
    EVIDENCE / f"{NODE}-required-suites.json",
    EVIDENCE / f"{NODE}-typecheck-comparison.json",
    EVIDENCE / f"{NODE}-eval-summary.json",
    EVIDENCE / f"{NODE}-harness-summary.json",
    EVIDENCE / f"{NODE}-product-manifest.json",
    SELF_REPORT,
    LOGS / f"{NODE}-suite-final.log",
    LOGS / f"{NODE}-typecheck-final.log",
    LOGS / f"{NODE}-eval.log",
    LOGS / f"{NODE}-eval-escalated.log",
    LOGS / f"{NODE}-suite-final2.log",
    LOGS / f"{NODE}-typecheck-final2.log",
    LOGS / f"{NODE}-harness-controls-final.log",
    PROBE,
]
receipt = {
    "schemaVersion": 1,
    "node": NODE,
    "ticket": TICKET,
    "session": "/root/requirements",
    "baseRevision": BASE,
    "productRevision": FINAL,
    "kbVersion": KB,
    "verdict": "COMPOSED_MEASURED_PENDING_SEPARATE_REVIEWS_AND_LIVE2",
    "productFiles": product_files,
    "verification": {
        "exact33": {"exitCode": 0, "testFiles": 33, "passed": 1633, "failed": 0, "todo": 1, "revision": FINAL},
        "typecheck": {"exitCode": 1, "exitMeaning": "ATTRIBUTED_BASELINE_ONLY", "baselineDiagnostics": 76, "currentDiagnostics": 76, "missionAddedDiagnostics": 0, "byteIdentical": True, "revision": FINAL},
        "supportEval": {"exitCode": 1, "exitMeaning": "PENDING_INDEPENDENT_QUALITY_RUBRIC", "runs": 3, "passedPerRun": 60, "failedPerRun": 0, "rubric": "PENDING", "measuredRevision": BASE, "retainedForRevision": FINAL},
        "frozenHarness": {"schemaVersion": 2, "exitCode": 0, "result": "PASS", "controls": 62, "passed": 62, "harnessSha256": HARNESS, "revision": FINAL},
        "snapshot": {"entryCount": 44, "kbVersion": KB, "ownerRecoveryFieldsBlank": True, "revision": FINAL},
    },
    "preservedPartialFailures": [
        {"kind": "TYPECHECK_PREFINAL", "revision": BASE, "exitCode": 1, "diagnostics": 78, "missionAddedDiagnostics": 2, "log": initial_d},
        {"kind": "EVAL_SANDBOX_SETUP", "revision": BASE, "exitCode": 1, "exitMeaning": "TSX_IPC_LISTENER_EPERM_BEFORE_EVALUATION", "log": digest(LOGS / f"{NODE}-eval.log")},
    ],
    "supersededMeasurements": [
        {"kind": "EXACT33", "revision": BASE, "exitCode": 0, "testFiles": 33, "passed": 1633, "todo": 1, "log": digest(LOGS / f"{NODE}-suite-final.log")}
    ],
    "artifacts": [digest(path) for path in artifact_paths],
    "leasesReleased": {"heavy": True, "git": True},
    "cleanProduct": True,
    "limits": [
        "No live model, browser, HTTP, database, preview, or row-proof adapter execution.",
        "LIVE2 owns fresh-runtime all-54 product action proof.",
        "Forgot-password destination remains unresolved and actionless.",
        "No owner acceptance, checkpoint readiness, or live-model quality claim.",
    ],
    "measuredAt": NOW,
}
write_json(EVIDENCE / f"{NODE}-receipt.json", receipt)
print(json.dumps({"receipt": digest(EVIDENCE / f"{NODE}-receipt.json"), "revision": FINAL}, indent=2))

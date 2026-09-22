#!/usr/bin/env python3
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
PROBES = REPORT / "probes/GUIDE_ACTIONFIX2"
SELF_REPORT = REPORT / "agent-reports/GUIDE_ACTIONFIX2.md"
NODE = "GUIDE_ACTIONFIX2"
TICKET = "t_f60a1644"
BASE = "c8784902f78ed4ba1d637d122e1f32f598415f4e"
FINAL = "f3be0af81f1691db6c23494f9e286bb6b10f13bf"
KB = "fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278"
HARNESS = "f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917"
NOW = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def digest(path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    return {"absolute": str(path), "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}


def product_digest(relative: str, *, absolute: bool = False) -> dict[str, object]:
    item = digest(PRODUCT / relative)
    result: dict[str, object] = {"laneRelative": relative}
    if absolute:
        result["absolute"] = item["absolute"]
    result["sha256"] = item["sha256"]
    result["bytes"] = item["bytes"]
    return result


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


product_paths = [
    "packages/support-kb/src/catalog.ts",
    "packages/support-kb/src/context.ts",
    "tests/architecture/support-catalog-coverage.test.ts",
    "tests/unit/support-answer-context.test.ts",
    "tests/unit/support-context.test.ts",
]
product_files = [product_digest(path) for path in product_paths]

prior_snapshot = json.loads((EVIDENCE / "GUIDE_ACTION_COMPOSE-snapshot-receipt.json").read_text())
logical_records = prior_snapshot["logicalRecords"]
assert len(logical_records) == 44
for record in logical_records:
    current = product_digest(record["article"]["laneRelative"], absolute=True)
    assert current["sha256"] == record["article"]["sha256"]
    assert not record["review"]["ratifiedBy"] and not record["review"]["ratifiedOn"]

snapshot_measurement = json.loads((LOGS / f"{NODE}-snapshot-final.log").read_text())
assert snapshot_measurement["result"] == "PASS"
assert snapshot_measurement["revision"] == FINAL
assert snapshot_measurement["kbVersion"] == KB
assert snapshot_measurement["entryCount"] == 44
snapshot_files = {
    "component":"packages/support-kb/recovery/components.json",
    "review":"packages/support-kb/reviews/manifest.json",
    "catalogSource":"packages/support-kb/src/catalog.ts",
    "loaderSource":"packages/support-kb/src/index.ts",
    "rankingSource":"packages/support-kb/src/context.ts",
    "productionApiSource":"apps/api/src/main.ts",
}
snapshot = {
    "schemaVersion":1,"status":"MEASURED STRICT REVIEWED RECOVERY SNAPSHOT; NO OWNER ACCEPTANCE",
    "node":NODE,"ticket":TICKET,"finalCommit":FINAL,"measuredAt":NOW,
    "files":{key:product_digest(path,absolute=True) for key,path in snapshot_files.items()},
    "snapshot":{
        "kbVersion":KB,"entryCount":44,
        "logicalPairCount":snapshot_measurement["logicalPairCount"],
        "ignoredCount":snapshot_measurement["ignoredCount"],
        "previewReviewedCount":snapshot_measurement["previewReviewedCount"],
        "ownerRatifiedCount":snapshot_measurement["ownerRatifiedCount"],
        "recoveryReviewedCount":snapshot_measurement["recoveryReviewedCount"],
        "recoveryOwnerRatifiedCount":snapshot_measurement["recoveryOwnerRatifiedCount"],
    },
    "immutableChecks":{
        "corpus":snapshot_measurement["immutable"],
        "exactVersionLookup":snapshot_measurement["exactVersionLookup"],
        "unknownVersionRejected":snapshot_measurement["unknownVersionRejected"],
    },
    "measurementLog":digest(LOGS / f"{NODE}-snapshot-final.log"),
    "logicalRecords":logical_records,"authority":"measurement-only",
}
write_json(EVIDENCE / f"{NODE}-snapshot-receipt.json", snapshot)

inputs = json.loads((EVIDENCE / f"{NODE}-inputs.json").read_text())
assert len(inputs["files"]) == 33 and "--minWorkers" not in inputs["argv"]
required_suites = {
    "schemaVersion":1,"node":NODE,"ticket":TICKET,"revision":FINAL,"kbVersion":KB,
    "capturedAt":NOW,"files":inputs["files"],"argv":inputs["argv"],
    "exitCode":0,"status":"PASSED","testFiles":{"passed":33,"failed":0,"total":33},
    "passed":1661,"failed":0,"TODO":1,"log":digest(LOGS / f"{NODE}-suite-final.log"),
}
write_json(EVIDENCE / f"{NODE}-required-suites.json", required_suites)

baseline = LOGS / "ATTEST_P2-typecheck-final2.log"
current_typecheck = LOGS / f"{NODE}-typecheck-final.log"
baseline_d = digest(baseline)
current_d = digest(current_typecheck)
assert baseline_d["sha256"] == current_d["sha256"] == "06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0"
assert sum(": error TS" in line for line in current_typecheck.read_text().splitlines()) == 76
typecheck = {
    "schemaVersion":1,"node":NODE,"ticket":TICKET,"revision":FINAL,
    "command":["pnpm","run","typecheck"],"exitCode":1,
    "exitMeaning":"ATTRIBUTED_BASELINE_ONLY","baseline":{**baseline_d,"diagnostics":76},
    "current":{**current_d,"diagnostics":76},"byteIdentical":True,
    "missionAddedDiagnostics":0,"measuredAt":NOW,
}
write_json(EVIDENCE / f"{NODE}-typecheck-comparison.json", typecheck)

eval_summary = {
    "schemaVersion":1,"node":NODE,"ticket":TICKET,"measuredRevision":FINAL,
    "command":["pnpm","run","support:eval"],"exitCode":1,
    "exitMeaning":"PENDING_INDEPENDENT_QUALITY_RUBRIC","mode":"deterministic-structural",
    "runs":[{"run":run,"passed":60,"applicable":60} for run in (1,2,3)],
    "classes":{key:{"passed":count,"applicable":count} for key,count in {
        "A":20,"B":6,"C":10,"D":12,"E":6,"F":3,"G":3}.items()},
    "realFirstToken":"NOT_APPLICABLE","rubric":"PENDING",
    "log":digest(LOGS / f"{NODE}-eval.log"),"measuredAt":NOW,
}
write_json(EVIDENCE / f"{NODE}-eval-summary.json", eval_summary)

harness_proof = json.loads((LOGS / f"{NODE}-harness-controls-final.log").read_text())
assert harness_proof["schemaVersion"] == 2 and harness_proof["result"] == "PASS"
assert harness_proof["revision"] == FINAL and harness_proof["kbVersion"] == KB
assert harness_proof["harnessSha256"] == HARNESS
assert harness_proof["controls"] == harness_proof["passed"] == 62
harness_summary = {**harness_proof,"node":NODE,"ticket":TICKET,
    "log":digest(LOGS / f"{NODE}-harness-controls-final.log"),"measuredAt":NOW}
write_json(EVIDENCE / f"{NODE}-harness-summary.json", harness_summary)

product_manifest = {
    "schemaVersion":1,"node":NODE,"ticket":TICKET,"baseRevision":BASE,
    "finalRevision":FINAL,"productFiles":product_files,"scopeExact":True,"clean":True,
    "change":"Closed EN/RO guide labels now provide bounded source and action evidence with affirmative-clause, availability, and child-destination constraints.",
    "measuredAt":NOW,
}
write_json(EVIDENCE / f"{NODE}-product-manifest.json", product_manifest)

(EVIDENCE / f"{NODE}.md").write_text(f"""# GUIDE_ACTIONFIX2 evidence

- Verdict: `FOCUSED_AND_COMPOSED_GREEN_PENDING_SEPARATE_RECHECKS_AND_LIVE2`.
- Revision: `{FINAL}` from `{BASE}`; exact five-file product scope is clean.
- Preserved RED: 21 failures in the initial 139-case context frame reproduced missing/misdirected closed labels, negated unrelated actions, and the Romanian Fir source gap.
- Focused GREEN: 6 files, 391/391 tests. Exact guide labels bind to reviewed content and available actions; specific section anchors suppress only their broad parent; negated unrelated labels are absent from both the model action contract and returned action sink.
- Final union: 33/33 files, 1,661 passed and 1 TODO.
- Typecheck: rc1 with exactly the attributed 76 diagnostics; output is byte-identical to the indexed baseline and adds zero diagnostics.
- Controlled evaluation: three structural runs of 60/60; rubric remains `PENDING`, real first token is `NOT_APPLICABLE`.
- Strict snapshot: 44 entries, KB `{KB}`, immutable exact-version lookup, owner recovery fields blank.
- Frozen FIX2 harness: 62/62 controls, schema 2, final revision bound, unchanged harness `{HARNESS}`.
- Limits: no all-54 adapter, browser, preview, live model, live HTTP, or readiness claim. Forgot-password destination remains unresolved and actionless. Separate original correctness/security rechecks and LIVE2 remain required.
""",encoding="utf-8")

SELF_REPORT.write_text(f"""# GUIDE_ACTIONFIX2 self-report

## Handoff

- Node/ticket/session: `{NODE}` / `{TICKET}` / `/root/requirements`.
- Base/final: `{BASE}` -> `{FINAL}`.
- Finding disposition: all sealed correctness and security label families are corrected as closed catalog behavior; the initial 21 failures became a 139/139 context frame and the six-file affected frame passed 391/391.
- Final evidence: exact33 1,661 passed + 1 TODO; typecheck matches the attributed 76-diagnostic baseline byte-for-byte; strict44 snapshot; structural eval 3x60/60 with rubric `PENDING`; frozen FIX2 62/62.
- SKILLS LOADED: `superpowers:using-superpowers`, mission heartbeat protocol/worker, `superpowers:receiving-code-review`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion`; their prior native BODY reads remain the mission evidence floor.
- Custody: exact five product files committed cleanly; heavy and Git leases released. Separate rechecks and LIVE2 remain required.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The repeated cost was fragmented semantic authority. Actions, menu labels, article evidence, and UI destinations had separate vocabularies, so each review exposed another language or wording gap. A single generated public-guide catalog should bind each visible EN/RO label to one reviewed article, optional action, availability, and parent/child destination. Context selection should consume that typed catalog and derive polarity and specificity once. Generated property tests should cover every catalog row in both languages, plus affirmative, explanatory, negated-unrelated, and parent/child variants, before the broad suite.

The execution workflow also spent time rediscovering stable commands and hand-building receipts. One typed mission manifest should contain allowed paths, exact suite argv, baseline diagnostic digest, snapshot schema, harness digest, and downstream gates. A single runner can capture RED/GREEN, compare typecheck bytes, execute the controlled evaluation, bind the immutable snapshot, and produce revision-stamped receipts. This would preserve the same evidence while removing repeated command reconstruction, hash bookkeeping, and confusion between inert harness proof and future live behavior.
""",encoding="utf-8")

artifact_paths = [
    EVIDENCE / f"{NODE}.md",EVIDENCE / f"{NODE}-snapshot-receipt.json",
    EVIDENCE / f"{NODE}-required-suites.json",EVIDENCE / f"{NODE}-typecheck-comparison.json",
    EVIDENCE / f"{NODE}-eval-summary.json",EVIDENCE / f"{NODE}-harness-summary.json",
    EVIDENCE / f"{NODE}-product-manifest.json",SELF_REPORT,
    LOGS / f"{NODE}-context-red.log",LOGS / f"{NODE}-context-green1.log",
    LOGS / f"{NODE}-context-green2.log",LOGS / f"{NODE}-context-green3.log",
    LOGS / f"{NODE}-context-green4.log",LOGS / f"{NODE}-context-green5.log",
    LOGS / f"{NODE}-context-green6.log",LOGS / f"{NODE}-context-green7.log",
    LOGS / f"{NODE}-focused-green.log",LOGS / f"{NODE}-focused-green-escalated.log",
    LOGS / f"{NODE}-focused-green2.log",LOGS / f"{NODE}-suite-final.log",
    LOGS / f"{NODE}-typecheck-final.log",LOGS / f"{NODE}-eval.log",
    LOGS / f"{NODE}-snapshot-final.log",LOGS / f"{NODE}-harness-controls-final.log",
    PROBES / "capture-snapshot.mts",PROBES / "package-evidence.py",
]
receipt = {
    "schemaVersion":1,"node":NODE,"ticket":TICKET,"session":"/root/requirements",
    "baseRevision":BASE,"productRevision":FINAL,"kbVersion":KB,
    "verdict":"FOCUSED_AND_COMPOSED_GREEN_PENDING_SEPARATE_RECHECKS_AND_LIVE2",
    "productFiles":product_files,
    "verification":{
        "focused":{"exitCode":0,"testFiles":6,"passed":391,"failed":0,"revision":FINAL},
        "exact33":{"exitCode":0,"testFiles":33,"passed":1661,"failed":0,"todo":1,"revision":FINAL},
        "typecheck":{"exitCode":1,"exitMeaning":"ATTRIBUTED_BASELINE_ONLY","baselineDiagnostics":76,"currentDiagnostics":76,"missionAddedDiagnostics":0,"byteIdentical":True,"revision":FINAL},
        "supportEval":{"exitCode":1,"exitMeaning":"PENDING_INDEPENDENT_QUALITY_RUBRIC","runs":3,"passedPerRun":60,"failedPerRun":0,"rubric":"PENDING","revision":FINAL},
        "frozenHarness":{"schemaVersion":2,"exitCode":0,"result":"PASS","controls":62,"passed":62,"harnessSha256":HARNESS,"revision":FINAL},
        "snapshot":{"entryCount":44,"kbVersion":KB,"ownerRecoveryFieldsBlank":True,"revision":FINAL},
    },
    "preservedFailures":[
        {"kind":"CONTEXT_RED","failures":21,"log":digest(LOGS / f"{NODE}-context-red.log")},
        {"kind":"CATALOG_CANONICAL_DEAD_END","log":digest(LOGS / f"{NODE}-context-green1.log")},
        {"kind":"FOCUSED_SANDBOX_LISTENER","log":digest(LOGS / f"{NODE}-focused-green.log")},
    ],
    "artifacts":[digest(path) for path in artifact_paths],
    "leasesReleased":{"heavy":True,"git":True},"cleanProduct":True,
    "limits":[
        "No all-54 adapter, browser, preview, live model, or live HTTP execution.",
        "LIVE2 owns fresh-runtime product action proof.",
        "Forgot-password destination remains unresolved and actionless.",
        "No owner acceptance or checkpoint readiness claim.",
    ],
    "measuredAt":NOW,
}
write_json(EVIDENCE / f"{NODE}-receipt.json", receipt)
print(json.dumps({"receipt":digest(EVIDENCE / f"{NODE}-receipt.json"),"revision":FINAL},indent=2))

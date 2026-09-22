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
PROBES = REPORT / "probes/GUIDE_COMPOUND_ALIAS"
SELF_REPORT = REPORT / "agent-reports/GUIDE_COMPOUND_ALIAS.md"
NODE = "GUIDE_COMPOUND_ALIAS"
TICKET = "t_3d63ca7e"
BASE = "5731eb6faac25f9712f04aea029a021f6eee9352"
FINAL = "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13"
KB = "fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278"
TYPECHECK_SHA = "06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0"
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
    "packages/support-kb/src/context.ts",
    "tests/unit/support-answer-context.test.ts",
    "tests/unit/support-context.test.ts",
    "tests/unit/support-public-guide-boundary.test.ts",
]
product_files = [product_digest(path) for path in product_paths]

prior_snapshot = json.loads((EVIDENCE / "GUIDE_FALLBACK_BINDING-snapshot-receipt.json").read_text())
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
    "passed":1682,"failed":0,"TODO":1,"log":digest(LOGS / f"{NODE}-suite-final.log"),
}
write_json(EVIDENCE / f"{NODE}-required-suites.json", required_suites)

baseline = LOGS / "ATTEST_P2-typecheck-final2.log"
current_typecheck = LOGS / f"{NODE}-typecheck-final.log"
baseline_d = digest(baseline)
current_d = digest(current_typecheck)
assert baseline_d["sha256"] == current_d["sha256"] == TYPECHECK_SHA
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

product_manifest = {
    "schemaVersion":1,"node":NODE,"ticket":TICKET,"baseRevision":BASE,
    "finalRevision":FINAL,"productFiles":product_files,"scopeExact":True,"clean":True,
    "change":"Romanian affirmative navigation inflections now admit the same declared compound source policy without changing its required, allowed, or recovery sets.",
    "measuredAt":NOW,
}
write_json(EVIDENCE / f"{NODE}-product-manifest.json", product_manifest)

prior_inventory = json.loads((EVIDENCE / "GATE_GUIDE_FINAL5-manifest.json").read_text())
inventory_by_path = {item["laneRelative"]:item for item in prior_inventory["productFiles"]}
for item in product_files:
    inventory_by_path[item["laneRelative"]] = item
final_inventory = {
    "revision":FINAL,"base":BASE,"originalBaseline":prior_inventory["originalBaseline"],
    "changedPaths":product_paths,
    "productFiles":[inventory_by_path[key] for key in sorted(inventory_by_path)],
    "deletedProductPaths":prior_inventory["deletedProductPaths"],
    "immutableInputs":inputs["inputs"],
}
write_json(EVIDENCE / "GATE_GUIDE_FINAL6-manifest.json", final_inventory)

(EVIDENCE / f"{NODE}.md").write_text(f"""# GUIDE_COMPOUND_ALIAS evidence

- Verdict: `SCOPED_IMPLEMENTATION_GREEN_PENDING_SEPARATE_REVIEWS_AND_FIX6_LIVE_BINDING`.
- Revision: `{FINAL}` from `{BASE}`; exact four-file product scope is clean.
- Preserved RED: 241 passed / 2 failed across three files, proving the Romanian imperative omitted the compound policy and selected browse-only recovery.
- Focused GREEN: four files, 255/255 tests. The bounded Romanian deschid/deschizi/deschide/deschidem/deschideți family activates the unchanged compound policy; exact and reversed-label forms require `app-navigation`, and the answer recovers only from that reviewed source.
- Shared contract retained unchanged: `SUPPORT_SOURCE_POLICIES`, `SupportKnowledgeContext.sourcePolicy`, `supportSourceIdsSatisfyPolicy`, and `selectSupportRecoveryEntry`.
- Final union: 33/33 files, 1,682 passed and 1 TODO.
- Typecheck: rc1 with exactly the attributed 76 diagnostics; output is byte-identical to the indexed baseline and adds zero diagnostics.
- Controlled evaluation: three structural runs of 60/60; rubric remains `PENDING`, real first token is `NOT_APPLICABLE`.
- Strict snapshot: 44 entries, KB `{KB}`, immutable exact-version lookup, owner recovery fields blank.
- Limits: no browser, preview, live model, live HTTP, or runtime request. The sealed LIVE3 failure cause remains unknown because its final response fields were not persisted. FIX6 and separate correctness/security/harness reviews remain required.
""",encoding="utf-8")

SELF_REPORT.write_text(f"""# GUIDE_COMPOUND_ALIAS self-report

- Node/ticket/session: `{NODE}` / `{TICKET}` / `/root/requirements`.
- Base/final: `{BASE}` -> `{FINAL}`.
- Product correction: the navigation-intent producer recognizes a bounded Romanian open-verb inflection family after normalization, so the existing action-triggered required/allowed/recovery policy activates for the reviewed compound request and label-order neighbor.
- Verification: meaningful RED 241/2; focused GREEN 255/255; exact33 1,682 + 1 TODO; typecheck byte-identical to the 76-diagnostic baseline; strict44 unchanged KB; structural eval 3x60/60 with rubric `PENDING`.
- SKILLS LOADED: `superpowers:using-superpowers`, mission heartbeat protocol/worker, `superpowers:receiving-code-review`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion`; prior native BODY reads remain the mission evidence floor.
- Custody: exact four product files committed cleanly. No content, review manifest, UI, model, private guard, active harness, or runtime changes. No checkpoint acceptance claim.
""",encoding="utf-8")

artifact_paths = [
    EVIDENCE / f"{NODE}.md",EVIDENCE / f"{NODE}-snapshot-receipt.json",
    EVIDENCE / f"{NODE}-required-suites.json",EVIDENCE / f"{NODE}-typecheck-comparison.json",
    EVIDENCE / f"{NODE}-eval-summary.json",EVIDENCE / f"{NODE}-product-manifest.json",
    EVIDENCE / "GATE_GUIDE_FINAL6-manifest.json",SELF_REPORT,
    LOGS / f"{NODE}-red.log",LOGS / f"{NODE}-focused-green-final.log",
    LOGS / f"{NODE}-context-family-green.log",LOGS / f"{NODE}-suite-final.log",
    LOGS / f"{NODE}-typecheck-final.log",LOGS / f"{NODE}-eval.log",
    LOGS / f"{NODE}-snapshot-final.log",
    PROBES / "capture-snapshot.mts",PROBES / "package-evidence.py",
]
receipt = {
    "schemaVersion":1,"node":NODE,"ticket":TICKET,"session":"/root/requirements",
    "baseRevision":BASE,"revision":FINAL,"finalRevision":FINAL,"productRevision":FINAL,
    "kbVersion":KB,"verdict":"SCOPED_IMPLEMENTATION_GREEN_PENDING_SEPARATE_REVIEWS_AND_FIX6_LIVE_BINDING",
    "productFiles":product_files,
    "sourcePolicyContract":{
        "id":"your-and-public-debates",
        "trigger":{"allAffirmativeGuideActionIds":["your-debates","public-catalog"],"romanianNavigationVerbFamily":["deschid","deschizi","deschide","deschidem","deschideți"]},
        "requiredSourceIds":["app-navigation"],
        "allowedSourceIds":["app-navigation","browse-public-debates"],
        "recoverySourceIds":["app-navigation"],
        "exports":["SUPPORT_SOURCE_POLICIES","SupportKnowledgeContext.sourcePolicy",
                   "supportSourceIdsSatisfyPolicy","selectSupportRecoveryEntry"],
    },
    "verification":{
        "red":{"testFiles":3,"passed":241,"failed":2},
        "focused":{"exitCode":0,"testFiles":4,"passed":255,"failed":0},
        "exact33":{"exitCode":0,"testFiles":33,"passed":1682,"failed":0,"todo":1,"revision":FINAL},
        "typecheck":{"exitCode":1,"exitMeaning":"ATTRIBUTED_BASELINE_ONLY","baselineDiagnostics":76,"currentDiagnostics":76,"missionAddedDiagnostics":0,"byteIdentical":True,"sha256":TYPECHECK_SHA,"revision":FINAL},
        "supportEval":{"exitCode":1,"exitMeaning":"PENDING_INDEPENDENT_QUALITY_RUBRIC","runs":3,"passedPerRun":60,"failedPerRun":0,"rubric":"PENDING","revision":FINAL},
        "snapshot":{"entryCount":44,"kbVersion":KB,"ownerRecoveryFieldsBlank":True,"revision":FINAL},
    },
    "preservedFailures":[
        {"kind":"MEANINGFUL_RED","log":digest(LOGS / f"{NODE}-red.log")},
        {"kind":"RO_NORMALIZATION_NEIGHBOR_RED","log":digest(LOGS / f"{NODE}-context-family-green.log")},
    ],
    "artifacts":[digest(path) for path in artifact_paths],
    "leasesReleased":{"heavy":True,"git":True},"cleanProduct":True,
    "limits":[
        "No browser, preview, live model, live HTTP, or runtime request execution.",
        "The actual LIVE3 sequence-7 rejection predicate and response fields remain unavailable; this correction addresses only the separately reproduced static Romanian alias gap.",
        "FIX6 owns safe diagnostic persistence and verifier binding at the final revision.",
        "Separate correctness, security, and harness reviews remain required.",
        "No owner acceptance or checkpoint readiness claim.",
    ],
    "measuredAt":NOW,
}
write_json(EVIDENCE / f"{NODE}-receipt.json", receipt)
print(json.dumps({"receipt":digest(EVIDENCE / f"{NODE}-receipt.json"),"revision":FINAL},indent=2))

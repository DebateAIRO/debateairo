import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine")
WT = ROOT / ".worktrees/support-conversation-cp1/dialectical-engine"
E = ROOT / ".hermes/reports/support-conversation-20260914/evidence"
BASE = "152eed4da1cd3e66b74d8301159ba76427552409"
REV = "6cbe0e7ad18b20eca35876f4a91478cfbba82307"

changed = [
    "apps/api/src/support/answer.ts",
    "apps/api/src/support/response-policy.ts",
    "apps/ui/components/support/Assistant.tsx",
    "packages/support-kb/content/debate-workspace-menus.en.md",
    "packages/support-kb/content/debate-workspace-menus.ro.md",
    "packages/support-kb/content/support-cases.en.md",
    "packages/support-kb/content/support-cases.ro.md",
    "tests/render/support-assistant-scroll.test.tsx",
    "tests/unit/support-answer-context.test.ts",
    "tests/unit/support-kb.test.ts",
    "tests/unit/support-response-policy.test.ts",
]

def digest(path: Path):
    data = path.read_bytes()
    return {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}

def product(path: str):
    absolute = WT / path
    return {"laneRelative": path, "absolute": str(absolute), **digest(absolute)}

product_files = [product(path) for path in changed]
(E / "GUIDE_QUALITY_FIX-product-manifest.json").write_text(json.dumps({
    "node": "GUIDE_QUALITY_FIX",
    "ticket": "t_989a1061",
    "baseRevision": BASE,
    "revision": REV,
    "verdict": "NEEDS_EDITORIAL_ATTESTATION",
    "productFiles": product_files,
    "deletedProductPaths": [],
}, indent=2, ensure_ascii=False) + "\n")

prior = json.loads((E / "GATE_GUIDE_FINAL9-manifest.json").read_text())
current = {row["laneRelative"]: row for row in prior["productFiles"]}
for row in product_files:
    current[row["laneRelative"]] = row
all_changed = sorted(set(prior["changedPaths"]) | set(changed))
(E / "GATE_GUIDE_FINAL10-manifest.json").write_text(json.dumps({
    "base": prior["base"],
    "originalBaseline": prior["originalBaseline"],
    "revision": REV,
    "changedPaths": all_changed,
    "deletedProductPaths": prior["deletedProductPaths"],
    "productFiles": [current[key] for key in sorted(current)],
    "immutableInputs": prior["immutableInputs"],
    "stage": "NEEDS_EDITORIAL_ATTESTATION",
}, indent=2, ensure_ascii=False) + "\n")

proposals = [
    {
        "id": "debate-workspace-menus", "lang": "en",
        "modelProjection": "When a debate has a tree, Thread shows a sequence, Split compares branches, Tree shows hierarchy, and Map shows relationships. Scoring appears only when available. Its public diagnostics can show availability, load and refresh status; provider and model with checked or generated timestamps; cache or staleness; current, scored, skipped and truncated claim counts and score-aware filters; unresolved holes and fatal flags; and recommended investigations. A category or value can be absent when scoring data is unavailable. Support can explain these public categories but cannot read a visitor's debate or its scoring values. Replay, Workspace, Honesty, Export, and How it works act on the debate already open; public debates expose a smaller read-only set.",
        "fallback": "Scoring diagnostics can show availability, load and refresh status; provider and model timestamps; cache or staleness; claim counts and filters; unresolved holes, fatal flags, and recommended investigations when scoring data is available. Support can explain these categories but cannot read a visitor's debate or scoring values."
    },
    {
        "id": "debate-workspace-menus", "lang": "ro",
        "modelProjection": "Când dezbaterea are un arbore, Thread arată o succesiune, Split compară ramurile, Tree arată ierarhia, iar Map arată relațiile. Evaluarea apare numai când este disponibilă. Diagnosticul public poate arăta disponibilitatea, starea încărcării și a reîmprospătării; furnizorul și modelul cu momentele verificării sau generării; cache sau învechire; numărul afirmațiilor curente, evaluate, omise și trunchiate și filtrele bazate pe scor; golurile nerezolvate și marcajele fatale; și investigațiile recomandate. O categorie sau o valoare poate lipsi când datele de evaluare nu sunt disponibile. Asistența poate explica aceste categorii publice, dar nu poate citi dezbaterea sau valorile ei. Replay, Workspace, Honesty, Export și How it works acționează asupra dezbaterii deja deschise; dezbaterile publice oferă un set mai mic, numai pentru citire.",
        "fallback": "Diagnosticul de evaluare poate arăta disponibilitatea, starea încărcării și a reîmprospătării; furnizorul și modelul; cache sau învechire; numărul afirmațiilor și filtrele; golurile nerezolvate, marcajele fatale și investigațiile recomandate când datele sunt disponibile. Asistența poate explica aceste categorii, dar nu poate citi dezbaterea sau valorile ei."
    },
    {
        "id": "support-cases", "lang": "en",
        "modelProjection": "Talk to a human or Escalate to a human creates an asynchronous Support case, not a telephone call. Email support is a separate mail workflow and does not create this API case or receive its receipt, response target, or private case link. The server receipt gives a response target of forty-eight hours, while another panel currently says one working day on weekdays. Rely on the receipt until the wording is aligned. Keep it private because it controls case access. Support does not verify inbox delivery.",
        "fallback": "Choose Talk to a human or Escalate to a human to create an asynchronous case; it is not a telephone call. Email support is a separate mail workflow and does not create that case or receive its receipt, response target, or private link. Rely on the server receipt's forty-eight-hour target while another panel still says one working day on weekdays, and keep the receipt private."
    },
    {
        "id": "support-cases", "lang": "ro",
        "modelProjection": "Talk to a human sau Escalate to a human creează un caz asincron de Asistență, nu un apel telefonic. Emailul de asistență este un flux separat de mail și nu creează acest caz API și nu primește confirmarea, termenul de răspuns sau legătura privată. Confirmarea serverului oferă un termen țintă de patruzeci și opt de ore, iar alt panou spune în prezent o zi lucrătoare în zilele lucrătoare. Bazează-te pe confirmare până la alinierea textelor. Păstreaz-o privată deoarece controlează accesul la caz. Asistența nu verifică livrarea în inbox.",
        "fallback": "Alege Talk to a human sau Escalate to a human pentru a crea un caz asincron; nu este un apel telefonic. Emailul de asistență este un flux separat și nu creează acel caz și nu primește confirmarea, termenul sau legătura privată. Bazează-te pe termenul de patruzeci și opt de ore din confirmarea serverului cât timp alt panou spune o zi lucrătoare și păstrează confirmarea privată."
    },
]
for row in proposals:
    article = WT / f"packages/support-kb/content/{row['id']}.{row['lang']}.md"
    row.update({
        "article": str(article),
        "articleSha256": digest(article)["sha256"],
        "articleBytes": digest(article)["bytes"],
        "modelProjectionSha256": hashlib.sha256(row["modelProjection"].encode()).hexdigest(),
        "fallbackSha256": hashlib.sha256(row["fallback"].encode()).hexdigest(),
        "reviewedBy": "", "reviewerSession": "", "reviewedOn": "", "evidence": "",
        "ratifiedBy": "", "ratifiedOn": "",
    })
(E / "GUIDE_QUALITY_FIX-editorial-input.json").write_text(json.dumps({
    "schemaVersion": 1,
    "baseRevision": BASE,
    "productRevision": REV,
    "records": proposals,
    "attestationWritePaths": [
        "packages/support-kb/recovery/components.json",
        "packages/support-kb/reviews/manifest.json",
    ],
}, indent=2, ensure_ascii=False) + "\n")

(E / "GUIDE_QUALITY_FIX-required-suites.json").write_text(json.dumps({
    "revision": REV,
    "stage": "NEEDS_EDITORIAL_ATTESTATION",
    "completed": [
        {"log": str(ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-focused-final.log"), "files": ["tests/unit/support-response-policy.test.ts","tests/unit/support-answer-context.test.ts","tests/render/support-assistant-scroll.test.tsx"], "result": {"passed":246,"failed":0}},
        {"log": str(ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-content-green.log"), "files": ["tests/unit/support-kb.test.ts"], "filter": "keeps paired public scoring and human-case draft facts aligned", "result": {"passed":1,"failed":0,"skipped":35}},
        {"log": str(ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-manifest-transition.log"), "files": ["tests/unit/support-kb.test.ts"], "result": {"passed":34,"failed":2}, "disposition": "EXPECTED_UNRESOLVED_UNTIL_SEPARATE_EDITORIAL_ATTESTATION"},
    ],
    "typecheck": {"log": str(ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-typecheck.log"), "diagnostics":76, "sha256":"06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0", "baselineIdentical":True},
    "afterAttestation": ["tests/unit/support-kb.test.ts","tests/unit/support-recovery-components.test.ts","tests/unit/support-recovery-attestation.test.ts","tests/unit/support-context.test.ts","tests/unit/support-answer-context.test.ts","tests/unit/support-response-policy.test.ts","tests/render/support-assistant-scroll.test.tsx","tests/render/sup-01-help.test.tsx","strict44 snapshot","controlled structural evaluation","affected composed suite"],
}, indent=2) + "\n")

(E / "GUIDE_QUALITY_FIX-live-applicability.json").write_text(json.dumps({
    "revision": REV,
    "historicalReceipt": "GUIDE_LIVE_GUIDE16-actual-receipt.json",
    "intentionallyInvalidatedRows": [2,15,35,39],
    "projectionChangedRows": [19,23],
    "unchangedModelInputRows": [1,7,11,27,31],
    "unchangedDeterministicRows": [41,43,47,51],
    "behaviorRerunRequired": [2,15,19,23,27,31,35,39],
    "screenshotRerunRequired": [1,2,7,11,15,19,23,27,31,35,39,41,43,47,51],
    "notes": [
        "Rows 19 and 23 include debate-workspace-menus, whose proposed model projection changes.",
        "Rows 27 and 31 retain exact settings-help-menus input, but the central answer authority binder now executes for their drafts.",
        "Rows 1, 7, and 11 retain exact source/projection inputs; row 1 and 7 were reviewed fallbacks.",
        "Deterministic refusal/recovery rows bypass the model-answer binder, but their screenshots must be recaptured after the pane-follow change.",
    ],
}, indent=2) + "\n")

artifact_paths = [
    E / "GUIDE_QUALITY_FIX.md",
    E / "GUIDE_QUALITY_FIX-product-manifest.json",
    E / "GUIDE_QUALITY_FIX-editorial-input.json",
    E / "GUIDE_QUALITY_FIX-required-suites.json",
    E / "GUIDE_QUALITY_FIX-live-applicability.json",
    E / "GUIDE_QUALITY_FIX-typecheck-comparison.json",
    E / "GATE_GUIDE_FINAL10-manifest.json",
    ROOT / ".hermes/reports/support-conversation-20260914/agent-reports/GUIDE_QUALITY_FIX.md",
    ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-red.log",
    ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-green1.log",
    ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-focused-green.log",
    ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-content-green.log",
    ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-answer-exact-green.log",
    ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-focused-final.log",
    ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-manifest-transition.log",
    ROOT / ".hermes/reports/support-conversation-20260914/logs/GUIDE_QUALITY_FIX-typecheck.log",
    ROOT / ".hermes/reports/support-conversation-20260914/probes/GUIDE_QUALITY_FIX/package-intermediate.py",
]
for path in artifact_paths:
    if not path.is_file():
        raise SystemExit(f"missing artifact: {path}")
status = subprocess.check_output(["git","status","--porcelain"],cwd=WT,text=True)
head = subprocess.check_output(["git","rev-parse","HEAD"],cwd=WT,text=True).strip()
if status != "" or head != REV:
    raise SystemExit(f"product custody mismatch: head={head} dirty={status!r}")
receipt = {
    "node": "GUIDE_QUALITY_FIX",
    "ticket": "t_989a1061",
    "baseRevision": BASE,
    "revision": REV,
    "verdict": "NEEDS_EDITORIAL_ATTESTATION",
    "artifacts": [{"absolute":str(path),**digest(path)} for path in artifact_paths],
    "productFiles": product_files,
    "deletedProductPaths": [],
    "clean": True,
    "heavyLeaseReleased": True,
    "gitLeaseReleased": True,
}
(E / "GUIDE_QUALITY_FIX-receipt.json").write_text(
    json.dumps(receipt,indent=2,ensure_ascii=False) + "\n"
)

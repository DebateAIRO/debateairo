#!/usr/bin/env python3
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess

ROOT = Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine')
REPORT = ROOT / '.hermes/reports/support-conversation-20260914'
PRODUCT = ROOT / '.worktrees/support-conversation-cp1/dialectical-engine'
E = REPORT / 'evidence'
L = REPORT / 'logs'
A = REPORT / 'agent-reports'
NODE = 'GUIDE_ACTIONFIX'
TICKET = 't_dbd462b8'
BASE = '91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69'
FINAL = 'b0b91a01cf161d17eef75577cbae94c629b7bc49'
NOW = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')

def digest(path: Path):
    data = path.read_bytes()
    return {'absolute':str(path),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}

def write(path: Path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')

assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=PRODUCT,text=True).strip() == FINAL
assert subprocess.check_output(['git','status','--porcelain'],cwd=PRODUCT,text=True) == ''
changed = [p.removeprefix('dialectical-engine/') for p in subprocess.check_output(
    ['git','diff','--name-only',BASE+'..'+FINAL],cwd=PRODUCT,text=True).splitlines()]
expected = sorted([
    'packages/support-kb/src/context.ts',
    'tests/unit/support-answer-context.test.ts',
    'tests/unit/support-context.test.ts',
])
assert sorted(changed) == expected
product_files=[]
for rel in expected:
    b=digest(PRODUCT/rel)
    product_files.append({'laneRelative':rel,'sha256':b['sha256'],'bytes':b['bytes']})

manifest_path=E/f'{NODE}-product-manifest.json'
write(manifest_path,{
    'schemaVersion':1,'node':NODE,'ticket':TICKET,'baseRevision':BASE,'finalRevision':FINAL,
    'productFiles':product_files,'scopeExact':True,'clean':True,'measuredAt':NOW
})

evidence_path=E/f'{NODE}.md'
evidence_path.write_text(f'''# {NODE} author evidence\n\n- Ticket: `{TICKET}`\n- Base: `{BASE}`\n- Focused commit: `{FINAL}`\n- Verdict: **AUTHOR_FOCUSED_GREEN_PENDING_COMPOSED_VERIFICATION**\n\n## Cause and correction\n\nAction selection inherited the strongest shared-article capability score. `app-navigation` therefore grounded valid Pricing prose while also attaching Help, status, and Home actions that the query never requested. The correction keeps article relevance for source selection and independently requires ordered EN/RO evidence for a closed action target. Informational rows remain useful and actionless; genuine Method, Transcripts, Help, Settings, library, and status requests keep their relevant server-owned actions.\n\n## Verification\n\n- RED at the base: 38 of 40 bilingual public-guide family members failed the new exact action oracle.\n- Context GREEN: 114/114.\n- Context plus actual answer-service GREEN: 149/149.\n- Final focused six-file frame: 363/363. The initial sandbox run is retained separately: five files passed and the integration file could not open its isolated loopback listener (`EPERM`). The identical normally permitted command passed.\n\n## Limits\n\nThis node intentionally did not run the exact33 union, typecheck, structural eval, snapshot/attestation binding, row-proof adapter, preview, browser, or live request. ACTION_COMPOSE and LIVE2 own those later stages. Forgot-password remains unresolved and actionless. No checkpoint readiness or acceptance is claimed.\n''')

report_path=A/f'{NODE}.md'
report_path.write_text(f'''# {NODE} self-report\n\n## Result\n\nCommit `{FINAL}` separates source relevance from action relevance in three authorized files. Forty bilingual guide-family controls cover the relevant frozen public-guide surface, and four service controls prove both prose-only and positive navigation behavior at the answer boundary.\n\n## Case report\n\n> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.\n\nThe defect came from conflating two questions: which reviewed article can answer the visitor, and which navigation target the visitor actually requested. Because several capabilities share `app-navigation`, article score was a lossy proxy for action intent. That proxy repeatedly forced reviewers and live gates to rediscover unrelated action leakage after otherwise correct source selection.\n\nThe upgrade is to keep two explicit evidence channels: source relevance and action-target relevance. The action channel is closed, bilingual, ordered, and route-independent. This avoids a chain of prompt exceptions and prevents a valid shared article from authorizing every capability that cites it.\n\nFor a stronger one-prompt workflow, the frozen guide matrix should generate focused product tests directly and require source policy and action policy as separate fields. The author packet can then run one generated RED, implement against the semantic contract, run one focused GREEN, and hand the exact final revision to composition. The sandbox listener preflight should also be automatic so an environmental EPERM does not consume an extra diagnostic cycle.\n\n## Skills retained\n\n`superpowers:using-superpowers`, mission `heartbeat-protocol`, mission `heartbeat-worker`, `superpowers:receiving-code-review`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` were retained from the same author session.\n''')

artifact_paths=[
    evidence_path,manifest_path,report_path,
    L/f'{NODE}-context-red.log',L/f'{NODE}-context-green4.log',
    L/f'{NODE}-service-green2.log',L/f'{NODE}-focused-green.log',
    L/f'{NODE}-focused-green-escalated.log',Path(__file__),
]
for path in artifact_paths: assert path.exists(),path
receipt={
    'schemaVersion':1,'node':NODE,'ticket':TICKET,'session':'/root/requirements',
    'baseRevision':BASE,'productRevision':FINAL,
    'verdict':'AUTHOR_FOCUSED_GREEN_PENDING_COMPOSED_VERIFICATION',
    'productFiles':product_files,
    'verification':{
        'red':{'testFile':'tests/unit/support-context.test.ts','failed':38,'passed':76,'total':114},
        'contextGreen':{'exitCode':0,'testFiles':1,'passed':114,'failed':0},
        'serviceGreen':{'exitCode':0,'testFiles':2,'passed':149,'failed':0},
        'focusedSandbox':{'exitCode':1,'testFilesPassed':5,'integrationExecuted':False,'cause':'LOOPBACK_LISTENER_EPERM'},
        'focusedPermitted':{'exitCode':0,'testFiles':6,'passed':363,'failed':0},
        'composedVerification':'PENDING_ACTION_COMPOSE',
    },
    'artifacts':[digest(path) for path in artifact_paths],
    'receiptExcludesSelf':True,
    'leasesReleased':{'heavy':True,'scopedGit':True},
    'measuredAt':NOW,
}
receipt_path=E/f'{NODE}-receipt.json'
write(receipt_path,receipt)
print(json.dumps(digest(receipt_path),indent=2))

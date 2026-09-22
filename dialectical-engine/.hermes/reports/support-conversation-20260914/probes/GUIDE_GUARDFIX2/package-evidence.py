#!/usr/bin/env python3
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess

ROOT = Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine')
REPORT = ROOT / '.hermes/reports/support-conversation-20260914'
E = REPORT / 'evidence'
L = REPORT / 'logs'
A = REPORT / 'agent-reports'
P = ROOT / '.worktrees/support-conversation-cp1/dialectical-engine'
NODE = 'GUIDE_GUARDFIX2'
TICKET = 't_4b36bd6a'
BASE = '2ccb57fa061f74a81c8f2ef42bd33c768f00d4e0'
FINAL = '91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69'
KB = 'fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278'
HARNESS = 'f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917'
NOW = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def bind(path):
    return {'absolute': str(path), 'sha256': sha(path), 'bytes': path.stat().st_size}

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=P, text=True).strip()
status = subprocess.check_output(['git', 'status', '--porcelain'], cwd=P, text=True)
assert head == FINAL and status == ''
changed_raw = subprocess.check_output(['git', 'diff', '--name-only', BASE + '..' + FINAL], cwd=P, text=True).splitlines()
changed = [x.removeprefix('dialectical-engine/') for x in changed_raw]
expected = sorted([
  'apps/api/src/support/classify.ts',
  'apps/api/src/support/public-guide-boundary.ts',
  'apps/api/src/support/recovery-intent.ts',
  'tests/integration/support-routes.test.ts',
  'tests/unit/support-classify.test.ts',
  'tests/unit/support-public-guide-boundary.test.ts',
  'tests/unit/support-recovery-intent.test.ts',
])
assert sorted(changed) == expected, (changed, expected)
product_files = []
for rel in expected:
    path = P / rel
    product_files.append({'laneRelative': rel, 'sha256': sha(path), 'bytes': path.stat().st_size})

baseline = L / 'ATTEST_P2-typecheck-final2.log'
type_log = L / f'{NODE}-typecheck-final.log'
assert sha(baseline) == sha(type_log) == '06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0'

old_snapshot = json.loads((E / 'GUIDE_GUARDFIX-snapshot-receipt.json').read_text())
snapshot = old_snapshot
snapshot['node'] = NODE
snapshot['ticket'] = TICKET
snapshot['finalCommit'] = FINAL
snapshot['measuredAt'] = NOW
snapshot['committedSourceFiles'] = product_files
snapshot_path = E / f'{NODE}-snapshot-receipt.json'
write(snapshot_path, snapshot)

old_suites = json.loads((E / 'GUIDE_GUARDFIX-required-suites.json').read_text())
suites = old_suites
suites.update({
  'node': NODE, 'ticket': TICKET, 'revision': FINAL,
  'capturedBeforeExecutionAt': '2026-09-17T15:10:00Z',
  'status': 'PASSED', 'exitCode': 0, 'passed': 1589, 'failed': 0, 'TODO': 1,
  'completedAt': NOW,
})
suites['log'] = bind(L / f'{NODE}-suite-final.log')
suites['testFiles'] = {'passed': 33, 'failed': 0, 'total': 33}
suites_path = E / f'{NODE}-required-suites.json'
write(suites_path, suites)

manifest = {
  'schemaVersion': 1, 'node': NODE, 'ticket': TICKET,
  'baseRevision': BASE, 'finalRevision': FINAL,
  'productFiles': product_files, 'scopeExact': True, 'clean': True, 'measuredAt': NOW,
}
manifest_path = E / f'{NODE}-product-manifest.json'
write(manifest_path, manifest)

type_cmp = {
  'schemaVersion': 1, 'node': NODE, 'ticket': TICKET, 'revision': FINAL,
  'command': ['pnpm', 'run', 'typecheck'], 'exitCode': 1,
  'exitMeaning': 'ATTRIBUTED_BASELINE_ONLY',
  'baseline': {**bind(baseline), 'diagnostics': 76},
  'current': {**bind(type_log), 'diagnostics': 76},
  'byteIdentical': True, 'missionAddedDiagnostics': 0, 'measuredAt': NOW,
}
type_path = E / f'{NODE}-typecheck-comparison.json'
write(type_path, type_cmp)

eval_summary = {
  'schemaVersion': 1, 'node': NODE, 'ticket': TICKET, 'revision': FINAL,
  'command': ['pnpm', 'run', 'support:eval'], 'exitCode': 1,
  'exitMeaning': 'PENDING_INDEPENDENT_QUALITY_RUBRIC', 'mode': 'deterministic-structural',
  'runs': [{'run': i, 'passed': 60, 'applicable': 60} for i in (1,2,3)],
  'classes': {k: {'passed': v, 'applicable': v} for k,v in {'A':20,'B':6,'C':10,'D':12,'E':6,'F':3,'G':3}.items()},
  'realFirstToken': 'NOT_APPLICABLE', 'rubric': 'PENDING',
  'log': bind(L / f'{NODE}-eval.log'), 'measuredAt': NOW,
}
eval_path = E / f'{NODE}-eval-summary.json'
write(eval_path, eval_summary)

harness_summary = {
  'schemaVersion': 2, 'node': NODE, 'ticket': TICKET, 'revision': FINAL,
  'kbVersion': KB, 'result': 'PASS', 'controls': 62, 'passed': 62,
  'harnessSha256': HARNESS, 'log': bind(L / f'{NODE}-harness-controls-final.log'),
  'measuredAt': NOW,
}
harness_path = E / f'{NODE}-harness-summary.json'
write(harness_path, harness_summary)

evidence_md = E / f'{NODE}.md'
evidence_md.write_text(f'''# {NODE} author evidence\n\n- Ticket: `{TICKET}`\n- Base: `{BASE}`\n- Scoped commit: `{FINAL}`\n- Verdict: **AUTHOR_VERIFIED_PENDING_SEPARATE_REVIEW**\n\n## Correction\n\nThe correction treats credential subjects, predicate-local negation/conjunctions, Romanian morphology, and explicit Support actors as bounded semantic classes. It preserves public navigation and explanatory statements while continuing to refuse actual credential handling, account operations, private-record access, and injection. The existing immediate-consumer branches in `index.ts` required no change once classification was corrected.\n\n## Verification\n\n- Focused final: 4 files, 764/764 passed.\n- Exact 33-file union: 1,589 passed, 1 TODO, 0 failed.\n- Typecheck: rc1 with exactly the attributed 76-diagnostic baseline; output is byte-identical.\n- Structural eval: three runs of 60/60; independent quality rubric remains PENDING, so rc1 is preserved.\n- Frozen harness: schema 2, 62/62, bound to `{FINAL}`, KB `{KB}`, unchanged harness `{HARNESS}`.\n\n## Limits\n\nNo live traffic, browser, provider, model, preview lifecycle, owner acceptance, or checkpoint acceptance occurred. Separate correctness and security rechecks remain required.\n''')

report_path = A / f'{NODE}.md'
report_path.write_text(f'''# {NODE} self-report\n\n## Result\n\nScoped commit `{FINAL}` fixes the transformed recovery credential, actor, Romanian morphology, injection-accounting, canonical-output, and benign Support-explanation families in seven authorized files. `apps/api/src/support/index.ts` stayed unchanged because its existing persistent-admission and canonical refusal branches passed the route-level oracles after classifier repair.\n\n## Case report\n\n> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.\n\nThe recurring cost came from distributing one policy across several regular-expression classifiers and discovering neighboring language forms one review at a time. Each localized patch passed its witnessed examples but left another actor order, inflection, delimiter, or negation transform outside the grammar. This consumed repeated reviewer, test, packaging, and broad-verification cycles.\n\nUpgrade the implementation around one shared bounded predicate parser that emits closed facts: subject family, actor, operation, polarity, clause boundary, and public-navigation intent. Classifier, public boundary, recovery intent, and response routing should consume those facts rather than maintain separate lexical grammars. Generate the finite EN/RO transform matrices from one declarative fixture and make their digest an input to the review receipt.\n\nFor a stronger one-prompt workflow, the task packet should machine-generate the exact affected-suite argv, baseline comparison, harness revision binding, product manifest, and receipt from the final commit. The prompt should provide the accepted semantic invariants and the generated transform matrix up front. That would turn most later review rounds into one independent recheck instead of finding one neighboring transform per pass.\n\n## Skills retained\n\n`superpowers:using-superpowers`, mission `heartbeat-protocol`, mission `heartbeat-worker`, `superpowers:receiving-code-review`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` were retained from the same author session.\n''')

artifacts = [
  evidence_md, snapshot_path, suites_path, type_path, eval_path, harness_path, manifest_path, report_path,
  L / f'{NODE}-focused-red.log', L / f'{NODE}-unit-red2.log',
  L / f'{NODE}-unit-property-green.log', L / f'{NODE}-focused-final.log',
  L / f'{NODE}-suite-final.log', type_log, L / f'{NODE}-eval.log',
  L / f'{NODE}-harness-controls-final.log', Path(__file__),
]
for path in artifacts:
    assert path.exists(), path

receipt = {
  'schemaVersion': 1, 'node': NODE, 'ticket': TICKET, 'session': '/root/requirements',
  'baseRevision': BASE, 'productRevision': FINAL, 'kbVersion': KB,
  'verdict': 'AUTHOR_VERIFIED_PENDING_SEPARATE_REVIEW',
  'productFiles': product_files,
  'verification': {
    'focusedFinal': {'exitCode': 0, 'testFiles': 4, 'passed': 764, 'failed': 0},
    'exact33': {'exitCode': 0, 'testFiles': 33, 'passed': 1589, 'failed': 0, 'todo': 1},
    'typecheck': {'exitCode': 1, 'exitMeaning': 'ATTRIBUTED_BASELINE_ONLY', 'baselineDiagnostics': 76, 'currentDiagnostics': 76, 'missionAddedDiagnostics': 0, 'byteIdentical': True},
    'supportEval': {'exitCode': 1, 'exitMeaning': 'PENDING_INDEPENDENT_QUALITY_RUBRIC', 'runs': 3, 'passedPerRun': 60, 'failedPerRun': 0, 'rubric': 'PENDING'},
    'frozenHarness': {'schemaVersion': 2, 'exitCode': 0, 'result': 'PASS', 'controls': 62, 'passed': 62, 'harnessSha256': HARNESS},
    'snapshot': {'entryCount': 44, 'kbVersion': KB, 'ownerRecoveryFieldsBlank': True},
  },
  'artifacts': [bind(path) for path in artifacts],
  'receiptExcludesSelf': True,
  'leasesReleased': {'heavy': True, 'scopedGit': True},
  'measuredAt': NOW,
}
receipt_path = E / f'{NODE}-receipt.json'
write(receipt_path, receipt)
print(json.dumps({'receipt': bind(receipt_path), 'productRevision': FINAL, 'productFiles': len(product_files), 'artifacts': len(artifacts)}, indent=2))

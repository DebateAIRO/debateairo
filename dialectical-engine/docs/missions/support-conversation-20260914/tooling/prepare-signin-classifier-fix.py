"""Fix the concrete public sign-in classification failure exposed by full-path proof."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_SIGNIN_CLASSIFIER_FIX';seat='/root/requirements';revision='5d6e028ae5defc24e0690219d6128949e73b750d';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL11-manifest.json']
for parent in ['GUIDE_HARNESS_BIND18','GUIDE_QUALITY_FIX2','GUIDE_QUALITY_REVIEW2']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_HARNESS_BIND18':assert r['verdict']=='REWORK_PRODUCT_SIGNIN_CLASSIFIER'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
write_paths=['apps/api/src/support/public-guide-boundary.ts','apps/api/src/support/classify.ts','tests/unit/support-public-guide-boundary.test.ts','tests/unit/support-classify.test.ts','tests/integration/support-routes.test.ts']
assert all((L/p).is_file() for p in write_paths);files=list(dict.fromkeys(files));ticket=create(node,'allow reviewed public sign-in navigation through real classifier path','GUIDE_HARNESS_BIND18',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'sourceCustody':custody(),'originalFiles':[rec(L/p) for p in write_paths]})
packet=f'''# PACKET {node} — public sign-in classification correction

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY, debugging, TDD and verification skills. Root claim proxy; no repeated board failures, floor reload or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed product writes: {', '.join(str(L/p) for p in write_paths)}.
- allowed evidence: {E}/{node}.md (new); {E}/{node}- (new); {E}/GATE_GUIDE_FINAL12-manifest.json (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/probes/{node}/ (new, bounded offline evidence only).
- forbidden: other product, KB, frontend or harness edits; prior evidence mutation; runtime, browser, HTTP, status, capacity, DB or model activity; private data/logs; quota changes, guessed Forgot destination; broad retrieval rewrite or lower safety boundaries; user questions/acceptance.
- verification: sole heavy for affected boundary, classifier and real route regressions; scoped Git for the five allowed files. Preserve final44 corpus and earlier reviewed code. No administrative freeze during author Git lease.

## 3. Work
Full58 offline proof exposed the actual ingress path omitted by earlier lower answer/context tests. Exact row57 `Where can I sign in?` has PUBLIC_GUIDE boundary but classifySupportMessage returns REFUSE_ZONE with /login; server returns refusal prose/link before reviewed account-access and canonical sign-in action. The prepared public account-location predicate includes sessions and account deletion but omits sign-in navigation. This is a product defect; the accepted exact owner prompt, required authority and fixed31 plan remain unchanged.

Confirm that causal chain from the sealed failure. Add meaningful failing regressions at the actual boundary/classifier and real POST support-message route before fixing. Normal public sign-in location questions in EN and RO must reach the existing reviewed account-access path and canonical request-local sign-in action. Include the exact owner prompt and representative ordinary wording, and ensure the test traverses the ingress classifier before the answer service, opaque-reference translation and response checks. A helper test calling the answer service directly is insufficient. Scope the implementation to public navigation intent; retain credential submission/operation, private account access, injection, unrelated auth-sensitive intents, unresolved password recovery and trusted-debate protections. Do not hardcode one literal prompt or globally exempt all login mentions. Reuse the existing closed canonical targets and reviewed KB.

Run the affected boundary/classifier/route suites and any genuinely affected security regressions. Preserve RED then GREEN and all failed attempt logs. Explicitly prove row57 now has the admitted model path, product context with account-access and allowed sign-in; retain row58 account-creation and the exact two Engine prompts as previously passing regressions. No paid model calls. The final complete58 harness proof will be rerun by original preview using the corrected revision; do not edit its oracle or claim that future proof passed. No broad513-suite repetition or unchanged editorial audit. Run a final typecheck comparison if needed by repository requirements; distinguish the inherited76 baseline from new errors.

Seal one clean scoped product commit and nonempty FINAL12 cumulative inventory with final code hashes, preserving FINAL11 and all old evidence. The strict44 corpus must remain exactly7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af with unchanged attestation bytes. Inherit already verified unchanged KB snapshot and state that inheritance explicitly. Return IMPLEMENTED_REVIEW_REQUIRED with base/final revision, exact changed paths, affected tests, causal proof and remaining limits. No readiness or owner acceptance. Release both leases promptly after seal.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, exact minimal correction, tests and limits. Strict receipt node/ticket/baseRevision/revision/verdict/productFiles/artifacts absolute/sha256/bytes excluding itself. Forgot unresolved/actionless; full CP1 incomplete and CP2 gated. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,git_scope=write_paths,heavy_scope='finite ingress sign-in classification RED/GREEN, real-route regressions and clean scoped commit; no runtime/model traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; base='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; sole heavy and exact five-path scoped Git.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

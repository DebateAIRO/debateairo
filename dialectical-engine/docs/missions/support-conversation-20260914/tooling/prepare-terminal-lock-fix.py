"""Freeze the delegated correction for the consumed technical review union."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_LOCK_HANDOFF_FIX';seat='/root/requirements';revision='78988fc2e5e24595bd9cd6ec0a3965c6039dc718';ticket=read(D/'board-ids.json')['tickets'][node]
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL7-manifest.json']
for parent in ['GUIDE_INJECTION_FIX','GUIDE_CORRECTNESS8','GUIDE_SECURITY8']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt);files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));write_paths=['packages/db/src/support.ts','apps/api/src/support/index.ts','tests/integration/support-routes.test.ts','tests/integration/support-cases.test.ts'];prior=read(E/'GUIDE_INJECTION_FIX-inputs.json')
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'writePathsAtBase':[rec(L/p) for p in write_paths],'argv':prior['argv'],'files':prior['files'],'sourceCustody':custody(),'findings':['GS8-1','GS8-2'],'union':'REWORK; correctness8 counted tests do not override the concrete security counterexamples'})
packet=f'''# PACKET {node} — terminal event lock across every affected consumer

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; actual retained worker BODY floor plus receiving-code-review, systematic-debugging, test-driven-development, verification-before-completion. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: exact four product writePaths in {inp}; {E}/{node}.md (new); {E}/{node}- (new); {E}/GATE_GUIDE_FINAL8-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new); scoped local commit of those product paths.
- forbidden: other product, KB, UI, harness, model or configuration edits; migrations, privileges, role grants, privileged helpers or physical session-state lock updates; real preview, Support, model, status, capacity or lifecycle calls; private records/logs; owner questions/acceptance. Preserve original dirty source, owned runtime20420, prior receipts and actual GUIDE9 partials.
- verification: sole heavy plus scoped Git on dispatch. Only isolated synthetic embedded DB activity. Meaningful RED for both sealed findings before producer edits; minimal GREEN and affected route/case/metrics/principal/architecture controls; declared final34 at final clean commit, inherited76 typecheck comparison, strict44 snapshot and cumulative FINAL8. Structural evaluation only when defining bytes change, keep rubric PENDING. Release both leases before packaging; no live sample.

## 3. Work
The consumed {D}/reviews/GUIDE_SECURITY8.md governs exact GS8-1 and GS8-2. The initial injection fix removed the forbidden mutable lock update but left event-locked physical-OPEN sessions admissible to manual escalation, human-rating escalation and both case repository producers. Read/admission also ignore an existingLOCK after current threshold rises. CORRECTNESS8 reported191 passing tests, but its unchanged-case/threshold-completeness disposition is superseded by these concrete counterexamples; do not treat it as approval of the affected behavior.

Make an existing immutable LOCK authoritative for session read, admission, rating and both case creation paths, independent of later configuration. Threshold controls firstLOCK creation, not reopening an existing lock. Safely refuse manual escalation and human-rating case creation for locked sessions without a generic500 or any case row. Cover the invariant at the repository producer boundary as well as HTTP routes, so a future adapter cannot bypass it. Preserve threshold refusal storage: the admitted injection that createsLOCK must still store its encrypted user/assistant messages. Preserve serialized/concurrent/configured admission, no-model refusals, hashed abuse evidence, cooldown, status counts, existing ordinary feedback and human handoff for open sessions, public-only authority, quota and privacy. No privilege widening or physical-state substitute.

Before implementation capture RED for both actual route surfaces after threshold lock, both direct case entry points with physicalOPEN+LOCK, and thresholdN→N+1 keeping GET/read locked and subsequent benign message denied before model transit. Include open-session positive controls and retained configured/concurrent threshold behavior. Use synthetic embedded test databases and actual implicated repositories, including retained restricted-role regression; never the healthy preview database. If any needed path lies outside the four, request exact expansion before editing. Sweep the finite lock consumer class from the review member-by-member, including rateMessage; do not repeat a whole-app audit or assume that every HTTP route calls admitMessage.

Run focused checks and resolve new fixture typing issues before committing; then run the exact final34 once at final commit, with byte/hash-based typecheck comparison and defined structural evaluation. Preserve every failure. Seal conventional {node}-snapshot-receipt.json and {node}-required-suites.json, final44KB version, cumulative FINAL8 current product inventory/deletions, source custody, exact delta, test/eval provenance and all hashes. Any additional final repeat needs a concrete subsequent change/failure and must be reported. Separate original correctness/security review and actual54 still follow. Do not edit frozen harness or bind an old capture to this revision.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Include why the earlier physical case-guard census missed routes that bypass admitMessage and why current-threshold recomputation was insufficient. Return SKILLS LOADED, ticket/session/base/final revision/verdict, exact finite class sweep, RED/GREEN/counts, preserved failures and limits. Receipt node/ticket/baseRevision/revision/verdict/artifacts absolute/sha256/bytes excluding itself, productFiles and clean state. Release heavy/Git; no self-close, readiness or acceptance. Forgot unresolved/actionless, CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,git_scope=write_paths,heavy_scope='isolated synthetic terminal-lock RED/GREEN and declared final suites/typecheck/structural evaluation only; no preview or live traffic')
c=read(E/'COORDINATOR-CURRENT.json');c.update({'at':now(),'active':[node],'seat':[seat],'ticket':[ticket],'adminFreeze':commit,'heavyLease':node,'gitLease':node,'activeAuthorOutputsSealed':False,'nextConsumer':'Consume four-path terminal-lock fix; technical9 separate review; new bounded harness binding after fix, then review10/runtime6/LIVE7.'});c['keyCompleted']['CORRECTNESS8']=sha(E/'GUIDE_CORRECTNESS8-consumption.json');c['keyCompleted']['SECURITY8_REWORK']=sha(E/'GUIDE_SECURITY8-consumption.json');write(E/'COORDINATOR-CURRENT.json',c)

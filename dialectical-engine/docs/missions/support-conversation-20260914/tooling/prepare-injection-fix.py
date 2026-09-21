"""Prepare the delegated product fix from the consumed static diagnosis."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_INJECTION_FIX';seat='/root/requirements';ticket=read(D/'board-ids.json')['tickets'][node]
diag=read(E/'GUIDE_INJECTION_SERVER_DIAG-receipt.json');assert read(E/'GUIDE_INJECTION_SERVER_DIAG-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_INJECTION_SERVER_DIAG-receipt.json')
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL6-manifest.json']
for name in ['GUIDE_INJECTION_SERVER_DIAG','GUIDE_COMPOUND_ALIAS']:
 receipt=E/(name+'-receipt.json');files.extend([receipt,E/(name+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));old=read(E/'GUIDE_COMPOUND_ALIAS-inputs.json');argv=old['argv'];argv=argv[:-1]+['tests/integration/dev-database-principals.test.ts']+argv[-1:]
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':REV,'inputs':[rec(p) for p in files],'writePaths':diag['minimumWritePaths'],'writePathsAtBase':[rec(L/p) for p in diag['minimumWritePaths']],'argv':argv,'files':argv[4:-1],'sourceCustody':custody(),'regressionCommand':diag['regressionCommand']})
packet=f'''# PACKET {node} — actual restricted-role refusal correction

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; worker role and retained BODY skills including systematic-debugging, test-driven-development, verification-before-completion. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean base revision: {REV}; inputs: {inp}.
- self-report: {O/'agent-reports'}/{node}.md (new).

## 2. Contract
- allowed: exact nine product writePaths in {inp}; {E}/{node}.md (new); {E}/{node}- (new); {E}/GATE_GUIDE_FINAL7-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new); one scoped local commit of allowed product paths.
- forbidden: other product/KB/catalog/UI/harness/migration/privilege/model/config changes; preview/runtime/Support/model/status/capacity calls; private logs/records; real credentials; owner questions or acceptance. Preserve original dirty source, active PID20420 and immutable actual GUIDE9 partials.
- verification: sole heavy plus scoped Git from dispatch. Only isolated synthetic embedded-test DB activity is allowed. Use repository capture runner; real supported restricted-role RED, minimal correction, exact four-file GREEN, then final input argv34 and typecheck against inherited76. Strict44 snapshot and cumulative FINAL7 inventory at final clean commit. Controlled structural evaluation only if defining evaluation bytes changed; otherwise retain by hash, with rubric PENDING. No live-model quality claim. Release heavy/Git before sealing.

## 3. Work
The consumed {E}/GUIDE_INJECTION_SERVER_DIAG.md is the correction contract. Every admitted deterministic injection unconditionally reaches forbidden UPDATE(session.state), including below threshold. LIVE6 actualHTTP500 is proved; its first exception remains unobserved. Remove the mutable finalizer from route/session port/main/repository/eval binding. Preserve immutable INJECTION/LOCK events, derived read and admission locks, configured/concurrent threshold, encrypted message persistence, hashed abuse accounting, IP cooldown, no-model transit and existing physical message/case lifecycle guards. Status openSessions must exclude immutable LOCK events. Do not grant a privilege, introduce privileged substitute or bypass attestation.

Before implementation, add meaningful route regression using the existing isolated startTestDatabase/migrate/provisionDevelopmentDatabasePrincipals/createPool bootstrap and actual restricted support pool. Capture the intended HTTP200 assertion failing with currentHTTP500. Then prove first safe refusal stores both messages andINJECTION with zero model calls; at threshold oneLOCK and derivedLOCKED; following message429. Keep the existing test rejecting UPDATE(state) grants. Preserve first refusal/concurrent/configured threshold tests and add event-based status metric coverage plus architecture prohibition. Do not edit production before RED. Report exact additional path need before crossing write scope.

Run the diagnosis's exact four-file command and declared final34 once at final commit. Tests must use synthetic isolated databases, never the healthy preview database. Keep every failed invocation/log. Run typecheck with explicit comparison; inherited diagnostics may move lines but no new categories may be hidden. Seal conventional {node}-snapshot-receipt.json and {node}-required-suites.json, final44 snapshot version, final cumulative inventory/deletions, exact product delta, clean revision, test/eval provenance and all artifact hashes. Separate original correctness/security reviewers and full actual54 capture remain required. No checkup or favorable retries.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/base/final revision/verdict, exact correction, RED/GREEN and suite counts, preserved failures, source/delta custody and receipt with artifacts absolute/sha256/bytes excluding itself. No self-close, readiness or acceptance. Forgot unresolved/actionless; CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
paths=[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__),P/(node+'.md'),inp,O/'LEDGER.md']+files
commit=freeze(node,paths)
dispatch(node,seat,commit,True,git_scope=diag['minimumWritePaths'],heavy_scope='isolated synthetic embedded DB and declared RED/GREEN/final suites/typecheck/structural eval; no preview/Support/model traffic')
c=read(E/'COORDINATOR-CURRENT.json');c.update({'at':now(),'active':[node],'seat':[seat],'ticket':[ticket],'adminFreeze':commit,'activeAuthorOutputsSealed':False,'heavyLease':node,'gitLease':node,'nextConsumer':'Consume final clean product fix and minimal authorized delta; separate original correctness/security review, then rebind harness/runtime at exact new commit.'});c['keyCompleted']['INJECTION_SERVER_DIAG']=sha(E/'GUIDE_INJECTION_SERVER_DIAG-consumption.json');write(E/'COORDINATOR-CURRENT.json',c)

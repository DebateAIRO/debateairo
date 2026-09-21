"""Route a bounded evidence-based diagnosis of the failed live compact transition."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_COMPACT_DIAG';seat='/root/requirements';revision='152eed4da1cd3e66b74d8301159ba76427552409'
assert read(E/'GUIDE_LIVE7-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_LIVE7-receipt.json')
ticket=create(node,'diagnose exact compact composer transition failure','GUIDE_LIVE7',seat)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_HARNESS_BIND12','GUIDE_HARNESS_REVIEW11','GUIDE_RUNTIME6','GUIDE_LIVE7']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — exact failed compact transition diagnosis

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained investigation BODY skills and systematic debugging. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new, minimal inert diagnostic only); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/harness/prior evidence mutation; actual runtime/browser/lifecycle/HTTP/DB/Support/model/status/capacity traffic; private logs/records/credentials; quota changes/retries; owner questions/acceptance.
- verification: sole heavy only for a bounded inert discriminator if static evidence cannot resolve the producer contract. No broad suites/typecheck/eval. No product/Git lease; clean before/after. Preserve any probe failures and distinguish mocked/inert behavior from live observation.

## 3. Work
Diagnose the exact sealed LIVE7 failure:15 completed rows (the final receipt corrects a stale14-row progress snapshot), compact composer did not become visible at openMode before the next row, child Node TimeoutError masked by tee shell exit0. Last completed was canonical43 full/RO prompt-injection; next canonical3 compact/RO pricing was never attempted or sent. Total actual sendMessage15/createSession2. The broader failed UI state was not captured. Use actual receipt/screens and safe capture diagnostics to establish the last completed canonical row, failed next row, session/language/mode transition and exact request stage. Do not assume a server failure or equate this with prior LIVE6's HTTP500. Missing failure DOM/exception details stay unknown; no private-log reconstruction.

Trace the finite path from the sealed capture openMode implementation through current SupportWidget/Assistant view and session lifecycle. Determine whether this is a product defect, harness transition/precondition defect, or remains unresolved. Inspect exact preceding actions/navigation, compact toggle targeting, visibility readiness, session lock/empty state and route remount only as warranted by evidence. Do not repeat the whole app audit or KB review. When static evidence leaves competing causes, implement the smallest inert diagnostic through actual exported/rendered producer behavior under allowed new probe paths, no live traffic. Pin source anchors and discriminate hypotheses; no speculative edits or favorable retry. If a missing live-only discriminator is unavoidable, report the exact bounded safe observation needed and stop for root routing.

Return source-conclusive findings only where established, exact minimal correction scope and meaningful regression proof needed. Preserve all prior safety/oracle/54row/rate/session contracts. A changed harness must retain its safeguards and have a new reviewed namespace; a product change needs separate correctness/security verification. Do not author either correction in this diagnosis ticket. Healthy owned runtime must remain untouched. Forgot unresolved/actionless; no CP1 readiness/acceptance or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, finite observations versus inference, findings/limits, exact next scope and strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='bounded inert compact-view diagnostic only if needed; zero live/browser/HTTP/DB/Support/capacity traffic')

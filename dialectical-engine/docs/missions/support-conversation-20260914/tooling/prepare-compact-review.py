"""Separate static review of guarded UI transitions and the no-chat preflight."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_REVIEW12';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_COMPACT_DIAG','GUIDE_HARNESS_BIND12','GUIDE_HARNESS_REVIEW11','GUIDE_HARNESS_BIND13','GUIDE_LIVE7']:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent=='GUIDE_HARNESS_BIND13':assert r['verdict'].startswith('PASS') and receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded compact precondition and probe review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}-receipt.json (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/harness/prior evidence mutation; heavy commands, runtime, browser, HTTP, DB, Support, model, status or capacity traffic; private logs/records; peer technical reports; owner questions/acceptance.
- verification: static finite review and sealed evidence rehash only; no broad rerun.

## 3. Work
Review BIND12→BIND13 exact diff against sealed GUIDE_COMPACT_DIAG. The proved issue is the compact hydration precondition and missing transition diagnostics; LIVE7 exact cause stays unknown and no product defect is proved. Confirm actual guarded opening waits for stable current-page hydration before one toggle interaction, then checks expanded/panel/composer state. No blind delay, repeated click, weakened predicate, favorable retry or duplicated weaker helper may substitute for the real producer contract.

Check meaningful regression/control discrimination and fixed safe pre/post phase, visibility and expanded-state projections, preserving unknown states without raw DOM/headers/private data/arbitrary response or exception content. Confirm child process failures cannot be masked by tee in the documented later invocation. Preserve prior116 purposes, complete current FINAL9 binding, exact34 suites, matrix54 bytes and composed row proof, adapter CLI/negative controls, source/outcome/action/API-DOM rules, credential/private boundaries and all session/pacing/capacity/navigation guards. Recompute ordered-eight digest and exact proof membership. No actual GUIDE13 output may exist yet.

Review the prepared real-UI preflight as a separate operational next step: same corrected helper; fullEN/fullRO/compactRO/fullEN/compactEN sequence; compact390x844; fresh isolated public browser state; actual application behavior; exactly zero Support createSession/sendMessage/status/model/capacity requests reaching runtime; report any blocked browser attempts separately and never label them zero attempts. Any interception may only prevent traffic, never supply synthetic successful Support data. Require public fixed-enum observations, sessions0/messages0, one-click expansion and visible composer, finite stop on failure, no retries or application/private storage changes. Report exact executable path/argv and prerequisites for root's later probe packet; do not run it here.

Return bounded PASS/REWORK, separating retained controls, new proof and unperformed real UI/actual54 work. Product bytes and technical9 dispositions are unchanged; no product-suite repeat or runtime restart needed. Forgot unresolved/actionless; no CP1 readiness/acceptance or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, finite findings/checks/limits and strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

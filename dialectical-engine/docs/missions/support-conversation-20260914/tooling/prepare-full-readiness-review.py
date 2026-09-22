"""Separate bounded review of the actual full-view readiness/classifier correction."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_REVIEW13';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json',D/'decisions/GUIDE_HARNESS_BIND14-scope-clarification.md']
for parent in ['GUIDE_HARNESS_BIND13','GUIDE_HARNESS_REVIEW12','GUIDE_COMPACT_UI_PROBE','GUIDE_HARNESS_BIND14']:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent=='GUIDE_HARNESS_BIND14':assert r['verdict'].startswith('PASS') and receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — exact full-view readiness and no-traffic probe correction review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}-receipt.json (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/harness/prior evidence mutation; heavy commands, actual runtime/browser/HTTP/DB/Support/model/status/capacity traffic; private records/logs; peer technical reports; owner questions/acceptance.
- verification: static finite review with exact sealed hash checks only; no broad test repeat.

## 3. Work
Review the exact BIND13→BIND14 source and probe contract against the sealed failed no-traffic preflight. Three transitions passed, route-remount fullEN failed the EN language-button own React onClick predicate with a visible composer; compactEN never ran. Check author diagnosis against actual current product controls and intended transition state. Accept only a proved harness predicate/setup correction, not a speculative product claim or deletion of readiness safeguards. Review any new fixed full-readiness subpredicates and meaningful regression discrimination. Preserve the prior compact hydration-before-one-click contract and fixed observations. Public readiness interactions must not silently reset an existing session/transcript or increase the exact five-session capture plan. Verify actual setLocale semantics and every capture call site; a validated empty-state precondition must reject a nonempty conversation before interacting, with a meaningful negative regression. Do not accept an empty-fixture-only assumption or saving/restoring capabilities.

Resolve the observed blocked otherSupport3 accounting: the scope clarification permits exact GET /api/v1/support/cases to be counted as known blocked pageCaseListRead from the OwnCaseLookup source. It is a Support API operation, not public data. Verify the source and method/token/unknown-path negatives preserve blocking of every Support runtime request before transmission; the old aggregate alone cannot attribute its three historical requests. No broad tolerance of unknown requests or synthetic Support responses. Keep blocked browser attempts distinct from forwarded requests and created sessions/messages; unknown HTTP401/console origins remain qualified unless established. Probe must still exercise all five transitions, actual browser behavior and composer usability in both languages/modes, with zero Support runtime requests and fresh isolated public state.

Retain all120 prior control purposes plus justified discriminators, unchanged product/FINAL9 and exact34 suites, matrix54/row proof, adapter CLI/negatives, source/outcome/action/API-DOM oracles, privacy/credential restrictions, session/pacing/capacity/navigation guards and numeric child failure status. Recompute exact ordered-eight digest and verify producer/helper imports are covered by the sealed binding. New actual GUIDE14 and UI_PROBE2 outputs remain absent. Require the same corrected helper in capture and probe, and verify exact future UI_PROBE2 argv and no-traffic prerequisites. No actual probe execution in this review.

Return finite PASS/REWORK with exact retained/new dispositions and limitations. Historical LIVE7 cause remains unproved unless new evidence specifically establishes it; passing inert controls alone cannot establish real UI or model quality. No product changes or broad technical re-review needed if bytes unchanged. Forgot unresolved/actionless; no CP1 readiness/acceptance or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, findings/checks/probe contract/limits and strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

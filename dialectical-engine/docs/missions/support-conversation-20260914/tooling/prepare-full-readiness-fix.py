"""Route bounded diagnosis and correction of the zero-traffic full-view preflight failure."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND14';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409'
assert read(E/'GUIDE_COMPACT_UI_PROBE-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_COMPACT_UI_PROBE-receipt.json')
ticket=create(node,'diagnose and correct exact full-view readiness mismatch','GUIDE_COMPACT_UI_PROBE',seat)
review=create('GUIDE_HARNESS_REVIEW13','review bounded full-view readiness and traffic classifier correction',node,'/root/baseline')
probe=create('GUIDE_COMPACT_UI_PROBE2','verify corrected five-transition browser opening without Support traffic','GUIDE_HARNESS_REVIEW13',seat)
ids=read(D/'board-ids.json');board('link',probe,ids['tickets']['GUIDE_LIVE8']);ids['edges'].append(['GUIDE_COMPACT_UI_PROBE2','GUIDE_LIVE8']);write(D/'board-ids.json',ids)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_COMPACT_DIAG','GUIDE_HARNESS_BIND13','GUIDE_HARNESS_REVIEW12','GUIDE_COMPACT_UI_PROBE']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded full-readiness diagnosis and correction

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained debugging/worker/verification BODY skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/GUIDE_HARNESS_BIND14/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND14/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/prior harness/evidence mutation; actual browser/runtime/lifecycle/HTTP/DB/Support/model/status/capacity activity; private records/logs/credentials; actual GUIDE14 output; owner questions/acceptance.
- verification: sole heavy for bounded inert diagnosis/regressions and retained controls/row proofs only. No broad product suites or product/Git lease. Separate reviewer follows; no live probe here.

## 3. Work
Diagnose the exact sealed no-traffic probe failure before changing implementation: fullEN, fullRO and compactRO passed; route-remount fullEN had one visible composer at HELP but hydrationReady NOT_READY and GUIDE_HARNESS_FULL_HYDRATION_TIMEOUT. Support forwarded0; blocked status3 and otherSupport3, create/send0. The unmet full predicate was the first visible EN language button having an own __reactProps$-prefixed property with callable onClick. Use the current actual UI producer and guarded-helper predicate to establish which condition mismatches the usable view or intended probe state. Do not infer a product defect from this test failure. When static evidence is insufficient, use the smallest inert discriminator under new allowed paths, no runtime traffic. If correction requires product changes or an unavailable live-only observation, return the exact bounded blocker rather than speculate.

For a proved harness mismatch, copy BIND13/adapter to BIND14 and correct only that contract/setup defect. Keep stable hydration-before-one-click compact behavior, valid full-view readiness, five required transitions, current FINAL9, exact34 suites, all prior120 control purposes, matrix54/row proof, sources/outcomes/actions/API-DOM, privacy/credential and session/pacing/capacity/navigation rules. Do not remove the failing check without proving the correct user-interaction precondition against the real producer. Add discriminating inert regression and fixed full-readiness subpredicates if needed so a future failure identifies the unmet condition rather than only NOT_READY. Keep fields enum/bool/count only, no raw DOM/capabilities/headers/private content or arbitrary exception strings.

Account for the observed otherSupport3 blocked attempts before finalizing the probe: determine whether the current classifier includes known public page/static prefetches or actual Support API operations using bounded source evidence. Preserve zero forwarded Support runtime API operations and never supply a synthetic response. Any classifier refinement must be an exact proved public-route distinction with negatives preserving the API boundary; do not blindly tolerate unexpected operations. Keep unresolved HTTP401/other-console origins qualified unless needed for the specific failure; no broad telemetry investigation.

Retain the real-UI probe interface and five-transition contract where valid, rebind unused actual GUIDE_LIVE_GUIDE14 namespace and new probe output naming for later GUIDE_COMPACT_UI_PROBE2. No actual GUIDE13 output exists; its failed UI preflight artifacts remain immutable. Seal exact control count, ordered-eight digest, same54 final branches and adapter negatives. Preserve direct-redirection numeric child status. Report the minimal actual-bound predicate/classifier diff and exact next probe argv. Root will route separate REVIEW13 and one later zero-Support real browser probe before actual54. Existing BIND13 natural-capacity plan remains a calculation only; no new quota read in this node.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, observations versus established cause, exact correction/inert proof/limits, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close/readiness/acceptance. Forgot unresolved/actionless; CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='bounded inert full-readiness/classifier diagnosis and correction controls only; zero actual runtime traffic')

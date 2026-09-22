"""Review only the new observed interaction diagnosis and resulting harness delta."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_REVIEW15';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json',D/'decisions/GUIDE_HARNESS_BIND14-scope-clarification.md',P/'GUIDE_HARNESS_BIND15.md']
for parent in ['GUIDE_HARNESS_BIND14','GUIDE_HARNESS_REVIEW13','GUIDE_HARNESS_REVIEW14','GUIDE_COMPACT_UI_PROBE3','GUIDE_HARNESS_BIND15']:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent=='GUIDE_HARNESS_BIND15':assert r['verdict'].startswith('PASS') and receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — review actual interaction cause and minimal correction

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, KB, Git, harness or prior evidence mutation; heavy commands, actual browser/runtime/HTTP/Support/model/status/capacity/DB activity; private data/logs; owner questions/acceptance.
- verification: finite static review and sealed hash verification; inert argument-predicate check only if needed, no broad reruns.

## 3. Work
Review BIND15 against its exact author packet and PROBE3 first-fullEN failure. Distinguish original aggregate observations from the newly instrumented exact step, evidence-supported cause and the single permitted discriminating action. Confirm no repeated favorable sample, forced click, arbitrary timeout extension, hidden private content or unrecorded mutation. Historical LIVE7 cause remains unknown unless specifically proved. Diagnose harness behavior rather than infer product fault from a generic timeout. If author did not establish cause, return a precise evidence gap.

Verify the correction is minimal and fixes the observed producer-to-browser interaction contract. Review actual product selector/state/event semantics and both probe/capture adapters, not only inert mocks. Cookie visibility or hydration presence alone is not causal proof. Full readiness must establish actual usable public interaction without silently resetting a session/transcript; compact must retain exactly one expansion after readiness. Preserve nonempty same-locale state and exact five-group session/reset plan. Check step-specific errors retain the real failing stage rather than collapse unrelated failures. Confirm controls discriminate the observed defect and do not merely mirror implementation.

All prior127 control purposes, FINAL9 product inventory, exact34 suite proof, matrix54 and adapter negatives, ordered-eight binding, API/DOM/source/action/outcome/privacy/credential/pacing/capacity/navigation invariants must remain intact. Exact GET case-list attempts remain blocked and counted separately; no Support API may pass or receive synthetic success. Retained unchanged evidence needs no broad repeat. New actual GUIDE15 and future PROBE4 outputs must remain absent. Confirm corrected opening logic is shared/bound in both actual capture and probe.

Independently validate the EXACT future PROBE4 command against the unchanged or explicitly changed extracted executable guard and all argv positions: valid final revision, absolute evidence root, output GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE4.json, no extras, installed pinned executable, unique absent output/log. Require positive plus rejected old-name/wrong-root/extra/malformed-revision controls. Review every packaged future-output field and README so no contract mismatch survives. Existing REVIEW14 supplemental correction remains historical; BIND15 must be internally coherent.

Return finite PASS or precise REWORK with source anchors, new and retained dispositions, and limits. The author's diagnostic is not the independent five-transition probe or live model proof. A later separate PROBE4 must PASS before full54. Forgot unresolved/actionless; CP1 incomplete, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact findings or retained evidence and strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

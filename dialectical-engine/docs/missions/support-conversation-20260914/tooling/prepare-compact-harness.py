"""Route the proved harness precondition correction without asserting the missing live cause."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND13';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409'
assert read(E/'GUIDE_COMPACT_DIAG-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_COMPACT_DIAG-receipt.json')
ticket=create(node,'guard compact hydration before opening and preserve fixed diagnostics','GUIDE_COMPACT_DIAG',seat)
review=create('GUIDE_HARNESS_REVIEW12','review exact compact hydration precondition repair',node,'/root/baseline')
probe=create('GUIDE_COMPACT_UI_PROBE','verify real compact opening with zero Support traffic','GUIDE_HARNESS_REVIEW12',seat)
live=create('GUIDE_LIVE8','single complete actual run after compact guard verification','GUIDE_COMPACT_UI_PROBE',seat)
ids=read(D/'board-ids.json')
for parent,child in [('GUIDE_HARNESS_REVIEW12','GUIDE_LIVE8'),('GUIDE_CORRECTNESS9','GUIDE_LIVE8'),('GUIDE_SECURITY9','GUIDE_LIVE8'),('GUIDE_LIVE8','GUIDE_PRODUCT')]:
 board('link',ids['tickets'][parent],ids['tickets'][child]);ids['edges'].append([parent,child])
write(D/'board-ids.json',ids)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_COMPACT_DIAG','GUIDE_HARNESS_BIND12','GUIDE_HARNESS_REVIEW11','GUIDE_LIVE7']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — exact compact precondition repair

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained worker/debugging/verification BODY skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/GUIDE_HARNESS_BIND13/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND13/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/prior harness/evidence mutation; actual browser/runtime/lifecycle/HTTP/DB/Support/model/status/capacity traffic; private logs/records; actual GUIDE13 output; owner questions/acceptance.
- verification: sole heavy for bounded inert precondition/diagnostic regression and retained controls/row proof only; no product/Git lease or broad product suites.

## 3. Work
Implement only the sealed GUIDE_COMPACT_DIAG proved harness precondition/observability correction. LIVE7 exact cause stays unresolved; no product defect is inferred. Copy reviewed BIND12 into allowed BIND13 plus new row-proof adapter namespace, binding unchanged FINAL9/current152eed4 and unused actual GUIDE_LIVE_GUIDE13 namespace. Keep all prior116 purposes, exact34 suites, matrix54 bytes/row proof, actual source/outcome/action/API-DOM oracles, model, private-data and credential boundaries, pacing/session/capacity/navigation rules.

Ensure the real hydration precondition is established before the compact toggle interaction, then verify its expanded state/panel/composer readiness. Use actual current producer semantics and the diagnosis anchors. Do not use blind sleeps, extra clicks to obtain a favorable result, weakened selectors, synthetic success or retry loops. Add meaningful inert regressions proving hydration must precede click and failed transitions produce a fixed safe phase/visibility/expanded-state projection sufficient to distinguish the competing causes. Retain missing state as unknown. Do not export DOM, raw response bodies, capability values, headers, private logs or arbitrary exception text. The capture must retain any failure instead of timing out without the bounded discriminator.

Provide an exact bounded zero-Support-request real-UI probe for the later separately reviewed operational ticket. It must exercise the same corrected opening helper through the diagnosed full EN, full RO, compact RO, full EN, compact EN transition sequence, including compact390x844, and measure fixed enums only; fresh isolated browser state, actual application behavior, no synthetic Support responses and no createSession/sendMessage/status/model/capacity requests. Explain any request interception strictly as a no-traffic guard, not response substitution, and define positive and failure assertions. Do not execute this live probe in the author node.

Preserve the one-shot capture's actual child exit status in documented future invocation: avoid a tee pipeline that masks Node failure, use direct bounded log redirection or explicitly capture pipefail/child status. No reattempt or replacing failed GUIDE12 output. Rebind ordered-eight digest/control proof and adapter as needed for exact guarded-helper change, preserve old116 controls as exact purposes and report additional count. Fresh inert exact54 branch proof and adapter negatives only; no real conversation traffic. Return exact allowed diff and verified probe procedure for separate review. Root will then route zero-Support real-UI verification, wait for natural capacity and authorize one new full actual run.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact diff/control/proof/digest/new probe and strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close/readiness/acceptance. Forgot unresolved/actionless; CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='bounded inert compact precondition/diagnostic correction controls and row proof only; zero live traffic')

"""Review the finite source correction and explicit complete-group retention plan."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_REVIEW17';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
rp=E/'GUIDE_HARNESS_BIND17-receipt.json';assert read(E/'GUIDE_HARNESS_BIND17-consumption.json')['receipt']['sha256']==sha(rp)
assert read(rp)['verdict'].startswith('PASS') and receipt_revision(read(rp))==revision
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-AFFECTED-LIVE-VERIFICATION-20260920.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL9-manifest.json',P/'GUIDE_HARNESS_BIND17.md']
for parent in ['GUIDE_SOURCE_DIAG','GUIDE_ORACLE_REVIEW17','GUIDE_HARNESS_BIND16','GUIDE_HARNESS_REVIEW16','GUIDE_COMPACT_UI_PROBE6','GUIDE_LIVE8','GUIDE_HARNESS_BIND17']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — source alternatives and exact15 retained plus39 fresh review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Assigned ticket/comments before work; root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, KB, Git, harness or prior evidence edits; heavy tests; browser, runtime, HTTP, Support, model, status, capacity or DB activity; private data/logs; owner questions/acceptance.
- verification: bounded source/delta/retention and sealed-control review. Request an exact inert discriminator only if a concrete gap cannot be resolved statically; no broad rerun.

## 3. Work
Review the implemented oracle correction against your consumed GUIDE_ORACLE_REVIEW17 semantic findings. Both broad guide rows may use app-navigation only with real proof membership and useful supported public guidance. Generic library Compact Help must not be confused with the named debate-local How-it-works control. Explicit already-open-debate EN/RO controls still need guide-how-it-works or debate-workspace-menus and reject generic navigation or unrelated authority. Verify actual old-oracle RED and imported new-verifier positives/negatives, empty/duplicate/proof-external source rejection, generic non-answer behavior and all prior source/action/API-DOM/privacy controls. No product/KB/model changes; LIVE8 remains a failed partial run.

The new root decision {D}/decisions/GUIDE-AFFECTED-LIVE-VERIFICATION-20260920.md supersedes mission-authored single54 execution assumptions, including prior review packets, under the owner's rerun-affected-checks instruction. This is not authority to waive any case or accept invalid evidence. Independently prove the exact15 retained rows are ONLY complete LIVE8 groups1+2, with current revision/KB/model/canonical input/locale/surface/oracle equality and complete actual public API/DOM/diagnostic/screenshot provenance. The five partial third-group rows do not count toward retention. Both affected broad guide rows must be among the39 fresh rows. Trace model-context and session-state dependencies across the boundary; reject retention if a relevant changed input or necessary conversation state is missing. PROBE6 can provide unchanged browser-transition evidence, not fabricated continuity between two capture segments.

Verify the new execution plan is CLOSED to whole groups3,4,5 (13+12+14 requests,3 new sessions), canonical order and original injection placement. No arbitrary skip/resume/retry path. All54 logical rows are still preflight-proved, with explicit15 retained and39 fresh provenance; no single fresh54 claim. Check exact39 daily request accounting and measured session/model/relay/queue limits, stale gate failure, normal pacing, session reset, language transitions, public navigation and cleanup. A39 request requirement for39 actual sends is accurate capacity accounting; unchanged application quotas must not be mutated. Confirm controls reject dropped/duplicated/cross-boundary cases, changed retained evidence, stale product/source bindings, incorrect plan counts and insufficient capacity.

Inspect exact BIND16-to17 browser helper/import binding. Hydration, mode settling, compact one-click, scoped locale selectors, checkpoint/stage capture, no-private-controls and guard behavior must be unchanged except necessary namespace relocation. Retain actual PROBE6 only if defining behavior is equal. No new browser preflight is required solely for source-oracle changes; if scheduling introduced a new unsupported UI transition, report the precise missing discriminator rather than rerunning everything. Confirm136 existing control purposes retain exact order with focused additions, actual composed counts/digest/imports, canonical matrix54, adapter3 negatives, FINAL9/strict44/34-suite bindings and exact18-key gate shape. Verify GUIDE17 output paths are unique/absent and README/receipt/manifest/driver/adapter agree.

Return PASS for the exact reviewed implementation and plan or precise REWORK. Explicitly state retained rows, fresh rows/groups, expected requests/sessions, capacity requirements, allowed future command contract and limits. Full54 after natural capacity is the fallback if retention cannot be proved. A passing inert review is not actual39 execution, final product quality, manual availability or owner acceptance.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, finite findings/dispositions and actual planned counts/provenance, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close, readiness, acceptance or CP2. Forgot unresolved/actionless.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

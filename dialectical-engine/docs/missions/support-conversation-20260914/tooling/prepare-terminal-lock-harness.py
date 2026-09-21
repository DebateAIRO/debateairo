"""Stage a bounded harness rebinding after the product author is consumed."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND11';seat='/root/preview';r=read(E/'GUIDE_LOCK_HANDOFF_FIX-receipt.json');revision=receipt_revision(r);assert read(E/'GUIDE_LOCK_HANDOFF_FIX-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_LOCK_HANDOFF_FIX-receipt.json');ticket=read(D/'board-ids.json')['tickets'][node]
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL8-manifest.json']
for parent in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_HARNESS_FIX9','GUIDE_HARNESS_REVIEW9','GUIDE_HARNESS_BIND10','GUIDE_LIVE6']:
 receipt=E/(parent+'-receipt.json');files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — reviewed harness binding at corrected product

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained worker/verification BODY skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/GUIDE_HARNESS_BIND11/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND11/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/prior harness or evidence edits; actual capture/runtime/lifecycle/HTTP/DB/Support/model/status/capacity calls; private logs/records; owner questions/acceptance. No actual GUIDE11 outputs in this node. Do not read or export private ongoing stack log.
- verification: no heavy initially. Read/copy/bind first; request sole heavy for exact syntax and retained inert controls plus final row proofs. No heavy before root transfer. No product/Git lease. Clean primary before/after, strict sealed receipts.

## 3. Work
Copy the separately reviewed FIX9 harness and row-proof adapter into allowed new namespace, reusing the sealed but unexecuted BIND10 preparation only as a transparent mechanical diff. BIND10 has no passing proof. Retain its exact34 suite-membership correction (all33 prior members plus dev-database-principals). Bind them to final product {revision}, author FINAL8/snapshot/required-suite receipts, retained44KB and same reviewed semantics; choose unused actual GUIDE_LIVE_GUIDE11 namespace. Old FIX9 bytes and GUIDE9 partials remain immutable. Inspect all path/revision/receipt/expected-suite bindings; change only those required by this exact product correction and namespace. Preserve all112 control purposes, adapter3, fixed API_RECEIVED stage/field enums/parse-null semantics, strict context/source/branch/API-DOM equality, actual-navigation/session isolation/pacing/capacity checks, matrix54 bytes, expected outcomes and sources. No new generic rewrite or favorable oracle changes.

Only mechanical rebinding is authorized. If the changed product port requires a harness fixture binding adjustment, report exact producer and required change before implementation. Do not retain assertions against a removed production symbol or invent substitute. Build/seal an exact final control proof and ordered-eight digest at new revision; retain111+parse boundary112/112 and all54 row proof. Validate new evidence path absence without writing actual output. Reuse invocation lesson: node --import tsx with actual adapter arguments gatePath,expectedRevision,outputPath; capture takes gatePath. Write the exact fully resolved commands in README, no guessed CLI. Actual later gate will be root's16keys plus fresh2capacity keys; no freshness or runtime assertion in this inert node.

Return exact allowed diff from FIX9, new paths/digest/proof and retained controls. Root will route separate original baseline review then supported owned runtime reload and one actual54 capture under later tickets. No actual GUIDE11 attempt, no quota read and no testability claim here.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact binding diff, controls/counts, preserved failures, proof/digest and receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy if held. No self-close, readiness or acceptance. Forgot unresolved/actionless; CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

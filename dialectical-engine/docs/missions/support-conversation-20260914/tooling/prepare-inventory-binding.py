"""Route sealed GH10-R1 artifact correction, without changing product code."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND12';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409'
ticket=create(node,'repair exact final inventory and bind actual-input control','GUIDE_HARNESS_REVIEW10',seat)
review=create('GUIDE_HARNESS_REVIEW11','review repaired final inventory and exact bound control',node,'/root/baseline')
ids=read(D/'board-ids.json');board('link',review,ids['tickets']['GUIDE_LIVE7']);ids['edges'].append(['GUIDE_HARNESS_REVIEW11','GUIDE_LIVE7']);write(D/'board-ids.json',ids)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL7-manifest.json',E/'GATE_GUIDE_FINAL8-manifest.json']
for parent in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_HARNESS_BIND11','GUIDE_HARNESS_REVIEW10']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — repair GH10-R1 without product mutation

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain worker/verification BODY skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/GUIDE_HARNESS_BIND12/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND12/ (new); {E}/GATE_GUIDE_FINAL9-manifest.json (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, KB, Git, prior harness/evidence edits; runtime/lifecycle/browser/HTTP/DB/Support/model/status/capacity activity; private logs/records; actual GUIDE12 output; owner questions/acceptance.
- verification: sole heavy only for exact inert syntax, retained controls plus bound-input regression and final row proofs. No product/Git lease. Clean exact primary before/after.

## 3. Work
Resolve separately reviewed GH10-R1. FINAL8 falsely has empty productFiles despite full changedPaths. Preserve it and all BIND11 evidence unchanged. Produce new cumulative FINAL9 inventory from exact clean current152eed4 bytes, prior complete FINAL7 membership and actual cumulative Git delta. Rehash all present product files, verify expected cumulative members and deleted paths, and include every attested file. Do not merely copy stale hashes. Document why the previous packaging emitted an empty list and the corrected producer invariant. No product implementation or new product commit is authorized.

Copy reviewed BIND11 harness/adapter to BIND12, bind new FINAL9 and unused actual GUIDE_LIVE_GUIDE12 namespace; all semantics, matrix54, prior112 control purposes, exact34 suites, fixed diagnostic projection, API/DOM equality, source/outcome/action/navigation/session/pacing/capacity rules remain unchanged. Add a bounded actual-bound-input control/assertion that invokes the real inventory membership/pre-request static binding against this producer artifact and demonstrates nonempty exact hashes and all attested files present. Preserve negative controls for empty/missing/stale-hash membership; no synthetic nonempty substitute for the actual new inventory. Report exact new control count and explain any proof inventory/count binding change required solely by this added regression. No oracle relaxation or broad generic rewrite.

Demonstrate the old empty inventory rejects and the new complete inventory passes the actual bound path without runtime/capacity/Support traffic. Seal final controls, exact54 composed row proofs, adapter3, ordered-eight digest and all authoritative producer bindings. Exact command documentation must use node --import tsx; adapter argv gatePath,expectedRevision,outputPath. No actual capture/gate freshness claim. Root will route separate original baseline review; existing healthy RUNTIME6 requires no restart for artifact correction. No full suite/typecheck/eval rerun, since product unchanged.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact inventory/diff/controls/proof/digest and strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close/readiness/acceptance. Forgot unresolved/actionless; CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='inert inventory membership regression, retained controls and exact row proofs only; zero runtime or capacity traffic')

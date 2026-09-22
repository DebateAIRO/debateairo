"""Freeze separate static review of corrected producer inventory and bound-input regression."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_REVIEW11';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL7-manifest.json',E/'GATE_GUIDE_FINAL8-manifest.json',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_HARNESS_BIND11','GUIDE_HARNESS_REVIEW10','GUIDE_HARNESS_BIND12']:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent=='GUIDE_HARNESS_BIND12':assert r['verdict'].startswith('PASS') and receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — exact GH10-R1 correction review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}-receipt.json (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, KB, Git, harness or predecessor edits; heavy commands/runtime/browser/HTTP/DB/Support/model/capacity traffic; private logs/records; peer technical review reports; owner questions/acceptance.
- verification: static exact producer-artifact and binding review. Rehash sealed controls/row proof, no broad rerun.

## 3. Work
Resolve your sealed GH10-R1 against new FINAL9 and BIND12. Check the cumulative inventory enumerates every required present current product file with exact bytes/hashes and the actual deleted paths, including all attested members. Compare actual clean product and cumulative Git membership, not only the manifest revision field. Confirm FINAL8/BIND11 remain immutable and author explains the empty-list producer error.

Review exact BIND11→BIND12 diff. Allow only corrected FINAL9 binding, new paths/unused actual GUIDE12 namespace, and bounded actual-bound-input regression/proof count binding. Confirm real membership/static pre-request code checks the producer artifact, old empty inventory rejects, missing/stale hashes reject, and all required members pass. A synthetic nonempty substitute does not close GH10-R1. Retain all prior112 purposes, exact34 suites, matrix54 bytes/row proofs, adapter3 and loader argv, diagnostic projection, sources/outcomes/actions/navigation/session/pacing/capacity rules. No relaxed oracle or runtime claims.

Return finite PASS/REWORK and exact disposition. This artifact-only correction must not require rerunning unchanged product suites or restarting the healthy runtime. No actual capture or readiness evidence exists yet. Forgot remains unresolved/actionless; CP1 incomplete; CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, finite reviewed checks and strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

"""Review only the append-only corrected checkpoint probe and its execution contract."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PROBE_CHECKPOINT_REVIEW';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json',P/'GUIDE_PROBE_CHECKPOINT_FIX.md']
for parent in ['GUIDE_HARNESS_BIND15','GUIDE_HARNESS_REVIEW15','GUIDE_COMPACT_UI_PROBE4','GUIDE_PROBE_CHECKPOINT_FIX']:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent=='GUIDE_PROBE_CHECKPOINT_FIX':assert r['verdict'].startswith('PASS') and receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — minimal checkpoint correction review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/harness or prior evidence edits; heavy commands or actual browser/runtime/HTTP/Support/model/status/capacity/DB activity; private data/logs; owner questions/acceptance.
- verification: finite source delta and sealed evidence review, no broad tests or controls repeat.

## 3. Work
Review only the checkpoint regression and new append-only probe variant. PROBE4 first checkpoint referenced undefined EVIDENCE_ROOT; catch repeated the failure, output absent. Transition and blocked-attempt counts are unrecorded and cannot be asserted zero. Installed abort logic is distinct from per-request recorded evidence. Qualify REVIEW15's runtime completeness: its earlier syntax and argument checks did not execute checkpoint persistence.

Compare actual new variant against immutable BIND15 probe. Require only missing checkpoint dependency repair and necessary relative import relocation, no readiness/traffic/transition/cleanup/oracle behavior changes. Verify it imports byte-identical BIND15 controls and all eight actual capture files,130 controls,matrix54,adapter and actual GUIDE15 namespace remain unchanged. A whole-harness rebind is unnecessary and out of scope.

Review the actual-source lexical checkpoint regression: original undefined-binding failure reproduced, then initial exclusive write, subsequent update and fixed failure-state checkpoint succeed with stubbed filesystem. It must execute the real source and dependency context, not a copied fake function or syntax-only check. Require no actual browser or Support activity. Verify exact new PROBE5 argument positive and four negatives against the real guard, syntax, unique output/log absence and supplemental contract hash binding. New filename must match the executable guard and command/script/cwd/revision/output/log fields must agree. Inspect free identifiers and resource cleanup dependencies in the relocated probe so the same class of omission is not knowingly carried forward.

The supplemental contract supersedes only future probe script/destination/prerequisite; prior BIND15 behavior reviews remain scoped to unchanged code. Require later independent PROBE5 five-transition PASS before LIVE8; no actual or product testability claim from inert checkpoint success. Return finite PASS or precise REWORK. Forgot unresolved/actionless, CP1 incomplete, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, minimal delta/checkpoint regression/unchanged bindings/limits, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

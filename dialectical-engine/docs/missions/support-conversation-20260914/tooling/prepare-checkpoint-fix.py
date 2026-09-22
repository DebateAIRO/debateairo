"""Route only the probe checkpoint regression; retain the reviewed live harness."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PROBE_CHECKPOINT_FIX';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409'
assert read(E/'GUIDE_COMPACT_UI_PROBE4-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_COMPACT_UI_PROBE4-receipt.json')
ticket=create(node,'correct undefined probe checkpoint constant without live-harness rebind','GUIDE_COMPACT_UI_PROBE4',seat)
review=create('GUIDE_PROBE_CHECKPOINT_REVIEW','review minimal probe checkpoint correction',node,'/root/baseline')
probe=create('GUIDE_COMPACT_UI_PROBE5','execute reviewed corrected checkpoint probe','GUIDE_PROBE_CHECKPOINT_REVIEW',seat)
ids=read(D/'board-ids.json');board('link',probe,ids['tickets']['GUIDE_LIVE8']);ids['edges'].append(['GUIDE_COMPACT_UI_PROBE5','GUIDE_LIVE8']);write(D/'board-ids.json',ids)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_HARNESS_BIND15','GUIDE_HARNESS_REVIEW15','GUIDE_COMPACT_UI_PROBE4']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — minimal probe checkpoint repair

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained author/debugging/verification BODY skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/prior harness or evidence mutation; actual browser/runtime/HTTP/Support/model/status/capacity/DB activity; private records/logs; new live capture namespace or full harness rebind; owner questions/acceptance.
- verification: sole heavy only for bounded inert regression against the actual probe checkpoint; no broad control/product reruns.

## 3. Work
PROBE4 failed before any checkpoint could persist because BIND15 probe checkpoint() references EVIDENCE_ROOT after the argument-guard extraction removed that module constant. Its catch calls the same broken checkpoint, then exits1. Actual transition progress and blocked-attempt counts are unavailable; do not claim they were zero or reconstruct them. The fixed route guard was installed, but static no-forwarding logic is not recorded per-attempt evidence. No product result follows.

Preserve failed source/output absence and create only a minimal new probe variant at {O}/probes/{node}/probe-zero-request-ui.mjs (new). Restore the missing validated evidence-root dependency or equivalent minimal checkpoint correction. Import unchanged reviewed BIND15 controls via the necessary relative-path adjustment; keep all readiness, transition, traffic, console, cleanup, fixed-observation and five-transition behavior byte-equivalent except the checkpoint repair and required import relocation. Do not copy/rebind the whole harness, change the eight capture files, reset namespace, remove checks or invent a product fix. Retain BIND15 digest b6162d665b60a1a35d882e41fa5b0da3259e9cb86bae32ca5d5056d320ad99d4,130controls,matrix54,adapter3 and actual GUIDE_LIVE_GUIDE15 namespace unchanged.

Add a meaningful inert regression that executes the ACTUAL checkpoint source with its ACTUAL lexical dependencies using stubbed filesystem I/O, not a rewritten mirror. It must reproduce the original missing-binding failure, then prove the new variant writes the expected validated destination with initial exclusive-create semantics, updates a subsequent checkpoint, and persists a fixed failure checkpoint. No browser import/launch or runtime traffic, no arbitrary private data. Exercise the path that node --check missed. Preserve exact child statuses. Also rerun only the exact new probe argv validation positive and prior four negatives against the unchanged actual guard, syntax-check the new variant, and verify shared controls/capture/adapter hashes unchanged. No broad130-control repeat is needed for unchanged executable bytes.

Publish a strict supplemental probe-contract.json in the new allowed directory with node,revision,script,cwd,argv,outputPath,logPath,childStatusPreservedBy,argumentGuardControls,executed=false and actual script hash/bytes. Exact future command must use new variant, final revision, {E}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE5.json (new), direct log {O}/logs/GUIDE_UI_TRANSITION_PROBE5-LIVE8.log (new). Assert new output/log absent. This supplement supersedes only BIND15's future probe script/destination/prerequisite; retained actual capture/control/adapter bindings are unchanged. A separate review and one later PROBE5 five-transition run are mandatory. Do not run either here.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact minimal diff, checkpoint regression and unchanged hashes, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close/readiness/acceptance. Forgot unresolved/actionless; CP1 incomplete; CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='minimal inert checkpoint regression and new probe variant only; no actual browser/runtime/Support or product/Git')

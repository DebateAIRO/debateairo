"""Independently review two operation-contract corrections and exact successor."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_REVIEW21';seat='/root/baseline';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json',E/'GUIDE_LIVE8-runtime-capacity.json']
for parent in ['GUIDE_HARNESS_BIND21','GUIDE_LIVE20','GUIDE_HARNESS_BIND20','GUIDE_HARNESS_REVIEW20','GUIDE_RUNTIME7','GUIDE_QUALITY_REVIEW2']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_HARNESS_BIND21':assert r['verdict']=='PASS_CORRECTED_OPERATION_CONTRACT'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_HARNESS_BIND21-manifest.json')['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review actual UI producer and deferred session-reserve corrections','GUIDE_HARNESS_BIND21',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — independent bounded correction review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean read-only revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, harness or prior evidence edits; runtime/browser/HTTP/status/capacity/DB/Support/model activity; private data/logs; owner questions or acceptance.
- verification: static review only of two actual contract defects and necessary successor bindings. Retain unchanged completed reviews/full58/screenshot proof; no broad rerun or heavy lease.

## 3. Work
Previous REVIEW20 PASS missed two real operation contract bugs, preserved by LIVE20 zero-traffic failure. Review the correction using the actual producer output and immutable measured5-session app limit, not only matching synthetic expectations. The old preflight must reject the real passed:true producer while the corrected consumer admits it and still rejects false/missing private controls or forwarded traffic. The old capacity validator must reject a valid5-slot frame while corrected capture validation requires5slots now and two distinct naturally available owner slots later. Keep31+6 daily messages,27+6 daily calls, exact freshness/skew and all other admission bounds. App limits must remain unchanged. A used slot must prevent five-session capture; stale/current-KB mismatch and inadequate daily reserves must still fail.

Confirm the exact bounded source diff contains only these two fixes and necessary namespace/digest updates. All31 cases, five groups, canonical58 assertions, API/DOM current-answer equality, screenshot successor bytes and pacing remain unchanged. Retained full58 proof is valid current-product evidence and must not be labeled rerun. Old151 purposes and newly executed focused controls remain distinct. Independently verify nested manifest artifacts and literal seven-phase argv/cwd/output/log contracts, loader, fresh LIVE21/LIVE_GUIDE21 outputs and existing Runtime7 custody. Runtime7 private stack log is already present and excluded, not an output collision. No fresh runtime reload is needed.

Inspect the touched producer/consumer fields and exact positive/negative regression paths rather than relying solely on pass counts. Preserve LIVE20's actual five-transition PASS alongside its failed wrapper, zero Support/model/capacity traffic, and the earlier erroneous PASS review conclusion. The new review must state what evidence closes each error without claiming a successful live run.

Review the prepared later owner-capacity command for one supported status read plus one identifier-free counts aggregate, exact current KB/model,≥2 naturally available sessions and≥6 messages/model calls under unchanged limits. It must not reuse the capture requirement of5sessions, leak a connection string, overwrite an old output, or read a private log. Record the exact prepared command and its prerequisites. It remains future execution after actual answer review and natural expiry.

Return PASS_CORRECTED_FINAL_BINDING or finite REWORK, with exact successor command contract and any final prerequisites. No additional product/editorial/full-app audit. Runtime health is retained from Runtime7; fresh31 actual quality and owner availability are still pending. Forgot remains unresolved/actionless. No CP1 ready/complete/accepted or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, focused findings and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; narrow independent correction review.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

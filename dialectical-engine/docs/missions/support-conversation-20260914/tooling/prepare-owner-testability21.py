"""One deferred owner-capacity frame after actual answer review and natural expiry."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_OWNER_TESTABILITY21';seat='/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_ACTUAL_REVIEW21','GUIDE_LIVE21','GUIDE_HARNESS_BIND21','GUIDE_HARNESS_REVIEW21','GUIDE_RUNTIME7']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert r['verdict'].startswith('PASS'),(parent,r['verdict']);assert receipt_revision(r)==revision
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
contract_path=E/'GUIDE_HARNESS_BIND21-owner-capacity-contract.json';contract=read(contract_path)
assert sha(contract_path)=='f64080fb0b77455edcc2de30c39795acfd7eaff958b33b25c0140780071be106'
assert contract['cwd']==str(L) and contract['requirements']=={'maxMessages':6,'maxSessions':2,'modelCallCeiling':6}
assert not Path(contract['argv'][-1]).exists()
files.extend([contract_path,Path(contract['argv'][1]),E/'GUIDE_LIVE21-owner-testability.json']);files=list(dict.fromkeys(files))
ticket=create(node,'verify immediate capacity for the reviewed owner walkthrough','GUIDE_ACTUAL_REVIEW21',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — one naturally available owner walkthrough frame

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; command: {contract_path}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new, mechanical read-only command adapter only); {E}/GUIDE_LIVE21-owner-capacity.json (new, exact reviewed command output); {O}/agent-reports/{node}.md (new); read-only owned lifecycle metadata.
- forbidden: product, Git, KB, harness or prior evidence edits; Support sessions/messages or model requests; private records/credentials/logs; configuration or quota changes; runtime restart/kill or unrelated services; repeated capacity reads, favorable retry, owner questions or acceptance.
- verification: sole heavy for one read-only supported owner capacity frame and ordinary TLS/current owned lifecycle check. No long wait while holding heavy, no product tests or browser run.

## 3. Work
Consume PASS_ACTUAL31_PUBLIC_GUIDE for exact current code and the reviewed exposed-UI walkthrough. Verify it fits at most6 messages and2 sessions including locale changes, with no invented reset, DevTools or hidden identity. Inspect the actual capture timestamps and measured limits before any status or counter read. The first two of five capture sessions must have naturally aged out of the hourly window, and the short message window must leave space for the whole walkthrough. If the conservative natural time has not arrived, release heavy and report the exact earliest time without an exploratory read. Calculated availability alone is not a PASS.

After natural time, validate exact clean product, current Runtime7 supported detached identity/cwd/group/listener ownership and preserved unrelated services. Never trust PID12272 alone. Check ordinary system TLS https://localhost:3100/help HTTP200 without a Support request or credential action. Do not read or hash private GUIDE_LIVE20 stack log. Execute once from contract cwd the exact reviewed command:

{' '.join(contract['argv'])}

Supply only the supported GUIDE_COUNTS_ONLY_DATABASE_URL environment variable without exposing its value. The command performs one supported status read and one identifier-free aggregate. Verify exact final API KB/model/configuration,2 currently available sessions,6-message/model headroom, short-window limits, no cooldown or waiter and available relay. This is a separate owner requirement; never demand five new capture sessions here. Record a numeric exit status and finite direct log without masking child failure. No repeat frame or resampling if it fails.

Bind the fresh measured artifact and exact approved walkthrough hash, current TLS/lifecycle evidence and observation time into PASS_OWNER_WALKTHROUGH_AVAILABLE or a precise finite blocker. Leave the preview healthy and release heavy. Do not send the walkthrough messages yourself or spend its reserved capacity. Root combines this with independent actual review for WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED. Forgot remains unresolved/actionless; no full CP1 readiness/completion/acceptance or CP2. Preserve inherited custody and typecheck qualifications.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, measured counts/timing and exact script, finite evidence and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and ongoing logs. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='one deferred counts-only owner walkthrough frame and ordinary TLS/custody; no Support/model requests')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; one deferred owner availability frame.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

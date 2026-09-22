"""One deferred owner-capacity frame after actual answer review and natural expiry."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_OWNER_TESTABILITY22';seat='/root/preview';revision=receipt_revision(read(E/'GUIDE_FINANCIAL_FALLBACK_FIX2-receipt.json'));clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_ACTUAL_REVIEW22','GUIDE_LIVE30','GUIDE_RUNTIME_BIND36','GUIDE_RUNTIME_REVIEW36','GUIDE_FINANCIAL_FALLBACK_REVIEW2']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert r['verdict'].startswith('PASS'),(parent,r['verdict']);assert receipt_revision(r)==revision
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
binding=read(E/'GUIDE_RUNTIME_BIND36-command-contract.json')
contract_path=Path(binding['ownerCapacity']['contractPath']);assert sha(contract_path)==binding['ownerCapacity']['contractSha256'];contract=read(contract_path)
bound=verify(read(E/'GUIDE_RUNTIME_BIND36-manifest.json')['artifacts'])
assert any(a['path']==str(contract_path) and a['sha256']==sha(contract_path) for a in bound)
assert contract['cwd']==str(L) and contract['requirements']=={'maxMessages':6,'maxSessions':2,'modelCallCeiling':6}
assert not Path(contract['argv'][-1]).exists()
files.extend([contract_path,Path(contract['argv'][1]),E/'GUIDE_LIVE25-owner-testability.json']);files=list(dict.fromkeys(files))
ticket=create(node,'verify immediate capacity for the reviewed owner walkthrough','GUIDE_ACTUAL_REVIEW22',seat)
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
- verification: sole heavy for one read-only supported owner capacity frame using exec_command sandbox_permissions=require_escalated for local process ownership inspection and ordinary TLS/current owned lifecycle check. No long wait while holding heavy, no product tests or browser run.

## 3. Work
Consume PASS_ACTUAL31_PUBLIC_GUIDE for exact current code and the reviewed exposed-UI walkthrough. Verify it fits at most6 messages and2 sessions including locale changes, with no invented reset, DevTools or hidden identity. Inspect the actual capture timestamps and measured limits before any status or counter read. The first two of five capture sessions must have naturally aged out of the hourly window, and the short message window must leave space for the whole walkthrough. If the conservative natural time has not arrived, release heavy and report the exact earliest time without an exploratory read. Calculated availability alone is not a PASS.

After natural time, validate exact clean product, current Runtime9 supported detached identity/cwd/group/listener ownership and preserved unrelated services. Validate actual identity from sealed new custody; never trust PID alone. Check ordinary system TLS https://localhost:3100/help HTTP200 without a Support request or credential action. Do not read or hash private GUIDE_RUNTIME9 stack log. Execute once from contract cwd the exact reviewed command:

{' '.join(contract['argv'])}

Before the one read, privately populate GUIDE_COUNTS_ONLY_DATABASE_URL from the proven existing SUPPORT_DATABASE_URL key in product .local/dev-auth/api.env using the validated narrow private parser and Support-principal shape from LIVE24. Do not assume prior tool environments persist, use generic DATABASE_URL, invoke broad provider-panel validation, or display/hash/persist a connection value. Reuse only the connection-preparation logic, never execute the actual-capture adapter again. Public source anchors are supportPool/supportRelayLeasePool, debateai_dev_support and SUPPORT_KEY. Assert the actual child environment is ready before the only invocation. The command performs one supported status read and one identifier-free aggregate. Verify exact final API KB/model/configuration,2 currently available sessions,6-message/model headroom, short-window limits, no cooldown or waiter and available relay. This is a separate owner requirement; never demand five new capture sessions here. Record a numeric exit status and finite direct log without masking child failure. No repeat frame or resampling if it fails.

Bind the fresh measured artifact and exact approved walkthrough hash, current TLS/lifecycle evidence and observation time into PASS_OWNER_WALKTHROUGH_AVAILABLE or a precise finite blocker. Leave the preview healthy and release heavy. Do not send the walkthrough messages yourself or spend its reserved capacity. Root combines this with independent actual review for WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED. Forgot remains unresolved/actionless; no full CP1 readiness/completion/acceptance or CP2. Preserve inherited custody and typecheck qualifications.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, measured counts/timing and exact script, finite evidence and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and ongoing logs. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='one deferred counts-only owner walkthrough frame and ordinary TLS/custody; no Support/model requests')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; one deferred owner availability frame.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Fix operational readiness's predecessor schema and bind one fresh attempt."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_RUNTIME_BIND36';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE29','GUIDE_OPERATOR_FIX35','GUIDE_OPERATOR_REVIEW35','GUIDE_PREVIEW_RECOVER34']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_LIVE29' or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREVIEW_RECOVER34-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'bind readiness to authenticated current runtime schema and fresh run','GUIDE_LIVE29',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — real operational runtime binding

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY skills. Root persisted claim proxy. No floor reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite control logs); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB or existing sealed evidence edits; live runtime, HTTP, browser, status, capacity, DB, Support or model traffic; private logs, credentials or environment values; runtime restarts, quota or identity changes; owner questions and acceptance.
- verification: sole heavy for bounded offline operational-wrapper controls with intercepted I/O only. No product suites or unchanged screenshot rerun.

## 3. Work
LIVE29 preflight passed5 public UI transitions with0 forwarded Support, then readiness failed before process or TLS I/O. No capacity frame, logical run, actual question or session occurred. The real BIND21 phase-readiness hardcodes GUIDE_RUNTIME7 and ports ui3100 api8787 relay8894, ignoring the final bound Runtime9 schema with authoritative api8890 and full profile ports. Metadata review had missed this executable guard; preserve that failed evidence.

Your static sweep of all7 phase scripts and their transitive validators identified readiness as the sole direct predecessor runtime assumption. Idle consumes readiness output; other six phases bind relevant data dynamically. Seal that exact finite source inventory with paths, hashes and anchors so reviewer can verify the real operational chain, not historical generation helpers.

Create append-only phase-readiness under this node. Replace predecessor node and port expectations with the existing bound runtimeCustodyContractPath and runtimeCustodyContractSha256 from the final command contract. Authenticate schema bytes, enforce its exact11 keys and required values, current revision, positive PID and PGID plus specified identity relation, current log binding, valid timestamp, detached flag, complete ports and ordinary-TLS facts. Keep existing current Git cleanliness, process identity and ordinary TLS success checks and output shape. Do not merely hardcode Runtime9 in place of Runtime7, skip the guard, or weaken it to accept arbitrary runtime metadata. Use the retained shared readFinalContract implementation through a correct immutable import. Preserve all unchanged phase behavior.

Prove the actual final readiness source with a current Runtime9 fixture taken from sealed public evidence. Controlled I/O must allow the corrected source to complete its public git/process/TLS checks and emit its exact READINESS output without spawning real processes, HTTP, private preparation or writing future operational paths. Preserve a genuine RED using old readiness source with current custody. Negative controls must reject predecessor identity, wrong API port, invalid schema hash, missing or extra custody key and invalid PID before operational I/O. Feed the corrected output to real retained phase-idle under controlled process/TLS I/O and prove its output compatibility. Static-check all other six literal phase scripts plus imported validators for the same predecessor runtime/schema dependency; do not assert complete live behavior from offline controls. Scope is exact runtime contract binding and downstream consumption, not general product audit.

Bind a fresh LIVE30 operational attempt under {E}/{node}-command-contract.json (new) and {E}/{node}-operator-contract.json (new). Retain actualGUIDE22 screenshot namespace because actual capture never began; all its paths remain absent. Use fresh LIVE30 operator, preflight, readiness, capacity, gate, rowProof, capture and idle output/log paths, GUIDE_ROW_PROOF-run-LIVE30.json and GUIDE_UI_TRANSITION_PROBE-run-LIVE30.json, with a fresh temporary browser profile. Preserve the exact31 cases, five sessions,14EN and17RO,max27modelcalls,31sec pacing, all20 families and separate54canonical+4owner logical proof. Retain Runtime9 custody and its schema and owner-capacity contract unchanged from RECOVER34; no runtime action needed. Owner6messages and2sessions plus GUIDE_LIVE21-owner-capacity.json remain deferred and absent.

Update all7 literal argv selfpaths to this final command contract and only necessary output dependencies. Use the FIX35 operator, computing its embedded final command hash from the finalized actual contract bytes, then seal new script hash and operator metadata. Include its real non-inert old-hash rejection and correct-hash controlled first-phase boundary proof, so the prior embedded-hash failure cannot recur. Also verify final literal readiness command actually selects the corrected new source, not the old BIND21 wrapper. Verify complete future absence set123 including rowProof.result and owner walkthrough, unique phase and operator log ownership, absolute Node --import tsx, exact cwd and require_escalated tool-captured execution without redirection. Preserve narrow memory-only Support principal preparation, gate freshness, fresh58 proof consumed before capture, stop-first and no-retry behavior.

Retain current full58 from BIND32 and byte-identical FIX30 screenshot helper824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29. No duplicate product proof or image controls. Include final inputs, command/operator contracts, retained runtime/owner records, source inventory and all new controlled-I/O proofs in manifest. No actual run here. Return PASS_RUNTIME_SCHEMA_BOUND_REVIEW_REQUIRED and release heavy; original independent review follows before LIVE30. LIVE29 used0sessions, so it does not create a new hourly wait. Forgot unresolved; no CP1 ready, complete or accepted, no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, exact finite controls and limitations. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. Release heavy; no self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='offline real readiness and idle source controls with intercepted I/O; final literal runtime binding only; zero live traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; actual runtime-schema guard correction, no traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

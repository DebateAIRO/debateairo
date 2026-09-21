"""Fix operational readiness's predecessor schema and bind one fresh attempt."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PROCESS_BIND37';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_RUNTIME_REVIEW36','GUIDE_RUNTIME_BIND36','GUIDE_PREVIEW_RECOVER34']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_RUNTIME_REVIEW36' or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREVIEW_RECOVER34-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'verify exact owned process identity in readiness and idle','GUIDE_RUNTIME_REVIEW36',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — exact process identity in final operational checks

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
Consumed REVIEW36 found a bounded process-identity defect after retaining the schema correction: readiness checks only ps.includes(commandMarker), so its controlled positive row123/1/123 passed against actual custody9800. Retained idle has the same weak process-name predicate. Fix this exact defect class in both executable paths, with no actual run or runtime action.

Create append-only readiness and idle successors under this node, sharing a small pure process-row validator if appropriate. Parse exactly one ps row into numeric PID, PPID, PGID and command. Require returned PID to equal the bound custody PID in readiness or the verified readiness PID in idle; returned PGID must equal its expected PGID; PPID must be1 for this detached owned supervisor. Preserve the existing command marker check, current schema authentication and all current Git/TLS/output checks. Reject empty, malformed or multiple rows. Expected process identities come from validated custody or readiness evidence, never a hardcoded9800. Preserve READINESS and IDLE output shapes. Bind any new imported helper through final artifact hashes.

Use the sealed public Runtime9 values for a truthful positive controlled-I/O fixture. Preserve old-source RED with a mismatched process row. Exercise real corrected readiness AND idle with wrong PID, wrong PGID, wrong PPID, empty or malformed row and multiple rows; each must reject before emitting success output. Positive actual-value fixtures must complete both phases with intercepted I/O and zero process, HTTP, private preparation or future operational writes. Retain the18 schema and runtime controls from BIND36 where defining code is unchanged; re-exercise affected schema/identity guard paths, without duplicating product/full58/screenshots. No operator behavior change beyond mechanically necessary final binding.

Create final command and operator contracts under this node for the still-unused LIVE30 attempt. Preserve every LIVE30 output, phase log, profile, gate, row proof and actualGUIDE22 path because no LIVE30 invocation occurred. Keep all123 future paths unique and absent. Change only readiness/idle sources and necessary imported helper hashes, all7 final argv selfpaths, embedded actual command-contract hash and new operator metadata. Retain exact Runtime9 custody and schema, owner-capacity contract, product0d34, FINAL18, KB7ef and all44 entries. No full-stack restart or new startup handshake. Fixed31 plan, five sessions,14EN and17RO,max27modelcalls,31sec pacing, fresh58 consumed before capture and separate owner6messages/2sessions remain.

Seal real non-inert operator stale/current-hash controls and final literal readiness/idle source selection so metadata cannot conceal old executable guards. Preserve Node --import tsx, exact cwd, require_escalated execution, tool-captured output and separate operator/wrapper log ownership. Preserve narrow memory-only Support principal preparation and all screenshot safeguards with byte-identical FIX30 helper. No actual31, capacity or other operational phase here. Include final inputs, contracts, imported source custody, finite proofs and retained provenance in manifest. Return PASS_PROCESS_IDENTITY_BOUND_REVIEW_REQUIRED and release heavy. Original independent review follows. Forgot unresolved; no CP1 ready, complete or accepted; no CP2.

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
dispatch(node,seat,commit,True,revision,heavy_scope='offline real readiness and idle process-identity controls; final literal binding only; zero live traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; exact process identity correction, no traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

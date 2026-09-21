"""Prepare final harness review or owned runtime reload only from consumed predecessors."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_HARNESS_REVIEW10','GUIDE_RUNTIME6']
revision=receipt_revision(read(E/'GUIDE_LOCK_HANDOFF_FIX-receipt.json'));seat='/root/baseline' if node=='GUIDE_HARNESS_REVIEW10' else '/root/preview';ticket=read(D/'board-ids.json')['tickets'][node]
parents=['GUIDE_LOCK_HANDOFF_FIX','GUIDE_HARNESS_FIX9','GUIDE_HARNESS_REVIEW9','GUIDE_HARNESS_BIND10','GUIDE_HARNESS_BIND11']
if node=='GUIDE_RUNTIME6':parents+=['GUIDE_CORRECTNESS9','GUIDE_SECURITY9','GUIDE_RUNTIME5','GUIDE_LIVE6']
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL8-manifest.json']
for parent in parents:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent in ['GUIDE_HARNESS_BIND11','GUIDE_HARNESS_REVIEW10','GUIDE_CORRECTNESS9','GUIDE_SECURITY9']:assert r['verdict'].startswith('PASS'),(parent,r['verdict'])
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
if node=='GUIDE_HARNESS_REVIEW10':
 allowed=f'{D}/reviews/{node}.md (new); {E}/{node}-receipt.json (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)'
 forbidden='product, KB, Git, harness or predecessor edits; heavy commands, runtime, browser, HTTP, DB, Support, model or capacity calls; private logs/records, peer technical reports, owner questions or acceptance'
 verify_text='Static exact binding review only; no heavy or Git. Rehash sealed112 proof and final row proofs, no broad rerun.'
 work=f'''Review exact BIND11 differences from separately reviewed FIX9 and sealed unexecuted BIND10. BIND10 has no passing proof. Accept only required final revision, path, receipt and unused actual GUIDE11 namespace bindings plus the exact33→34 suite addition of dev-database-principals. Retain every prior33 member, duplicate/argv/flag guards and all112 control purposes. Confirm matrix54 unchanged, fixed API_RECEIVED and parse-null handling retained, no outcome/source/oracle relaxation and no actual traffic in binding preparation. Verify the final control proof and ordered-eight digest bind {revision}, strict44KB, FINAL8, exact34 required suite receipt and every composed final row proof. Ensure exact loader commands use node --import tsx and adapter arguments gatePath,expectedRevision,outputPath, while capture takes gatePath. Check any changed fixture binding reaches actual producer APIs. Return finite PASS/REWORK; a preparation proof is not an actual capture or readiness claim. Prior GUIDE9 partials remain immutable and failed. Do not read peer technical review reports; they separately gate actual capture.'''
else:
 allowed=f'{O}/probes/{node}/ (new, minimal detached supported lifecycle wrappers); {O}/logs/{node}- (new); {O}/logs/GUIDE_LIVE7-stack.log (new, private ongoing runtime log); {E}/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); own supported preview lifecycle files only'
 forbidden='product, KB, Git, harness or predecessor edits; installs; provider/model/configuration changes; unrelated service changes; real private records or credentials; Support sessions/messages, models, status or capacity queries; counter/quota/database reset; owner questions/acceptance'
 verify_text='Sole heavy for supported owned reload and ordinary TLS readiness only. No suites, eval, Support smoke prompt or actual capture. Leave healthy detached stack running and release heavy.'
 work=f'''The last sealed owned supervisor is PID=PGID20420/PPID1, launched at0b9320 with private GUIDE_LIVE5-stack.log. Revalidate its CURRENT identity, cwd, command, ownership and listener descendants before any stop; PID alone is insufficient. Preserve an exact current unrelated listener baseline. Required preview ports3100,3101,55433,7177,8988,8890–8896 must remain exclusively owned by this preview. Never kill a reused PID or unknown listener; report an actual ownership discrepancy before touching it.

Reload only this owned preview through the repository-supported full lifecycle so the process is bound to exact clean {revision}. Use the established support-preview profile with pnpm dev:auth:up, a new detached owned supervisor and private GUIDE_LIVE7-stack.log. Derive stop/start details from the current supported lifecycle and indexed prior own wrappers; no bare server, partial stack, visible window or substitute service. Do not reset database data, counters or quotas. Preserve old private log without reading/exporting/hashing its raw content. The new ongoing log must also never be frozen/exported/hashed as a finite artifact.

Verify all required stages, PID/PPID/PGID and owned listeners, unrelated service preservation, ordinary system-TLS https://localhost:3100/help HTTP200 and health after short idle. No TLS bypass. No Support, model or capacity traffic. Leave healthy stack running and bind exact new runtime identity/private log path in the sealed receipt. The later LIVE7 packet performs one fresh capacity read and one reviewed actual54 run; this node proves runtime readiness only, not answer quality, owner quota or testability.'''
packet=f'''# PACKET {node} — bounded {'harness binding review' if node=='GUIDE_HARNESS_REVIEW10' else 'owned corrected runtime reload'}

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}, retained role BODY skills and applicable verification library. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: {forbidden}.
- verification: {verify_text}

## 3. Work
{work}

Forgot remains unresolved/actionless, no full CP1 readiness or acceptance; CP2 gated. No retrospective success claim for prior partial actual runs or attribution of LIVE6's missing first exception.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, precise new/retained dispositions or exact runtime identity, checks/custody/limits. Receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and ongoing private logs. Release heavy if held; no self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,node=='GUIDE_RUNTIME6',revision,heavy_scope='supported owned runtime reload plus ordinary TLS health only; zero Support/model/status/capacity traffic')

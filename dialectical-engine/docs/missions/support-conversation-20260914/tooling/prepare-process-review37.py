"""Review only the final literal-hash correction; retain other REVIEW34 dispositions."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PROCESS_REVIEW37';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_PROCESS_BIND37','GUIDE_RUNTIME_REVIEW36','GUIDE_RUNTIME_BIND36','GUIDE_PREVIEW_RECOVER34']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_RUNTIME_REVIEW36' or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PROCESS_BIND37-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review real readiness and idle process identity plus final binding','GUIDE_PROCESS_BIND37',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — actual readiness and final runtime binding review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static actual readiness, downstream consumption and final-chain runtime binding review; retain unrelated completed evidence.

## 3. Work
Your consumed REVIEW36 identified a bounded process-identity gap: actual readiness accepted only a command marker, and its positive fixture returned PID/PGID123 against custody9800. Review the exact new readiness and idle process-row validation. It must parse a single row, require expected PID and PGID plus PPID1 for this detached supervisor, preserve the command marker and reject malformed, empty or multiple rows. Expected identity must come from validated custody/readiness, not hardcoded runtime values. Inspect all real imports and their bound hashes.

Inspect old-source RED and real corrected readiness AND idle controlled-I/O positive and wrong-PID/PGID/PPID/malformed/multiple-row negatives. A positive fixture must reflect actual sealed public Runtime9 values. Verify failures precede success output and controls did not launch actual commands, HTTP or private preparation. Retain the authenticated schema/ports/revision/log/timestamp guards and READINESS/IDLE output shapes. Check shared validator changes have not weakened those paths.

Review mechanical final bindings: exact literal seven argv select final PROCESS_BIND37 contract; readiness and idle select corrected sources; actual finalized contract digest is embedded in new operator; metadata script hash agrees; non-inert operator proof retains stale rejection/current controlled boundary. All123 unused LIVE30/actualGUIDE22 paths must remain absent and unchanged except necessary binding records. Preserve Runtime9, owner command, Support principal handling, fixed31 plan, fresh58 dependency, Node --import tsx, exact cwd, require_escalated and log ownership.

Retain your other REVIEW36 dispositions and previously valid product, full58 and screenshot evidence. No repeated whole-chain, product, editorial or image audit; scope is actual process identity and consequences of final source binding. No operational or paid traffic. Return PASS_FINAL_PROCESS_RUNTIME_OPERATOR_BINDING or exact finite REWORK. Actual31 and current capacity remain unproven. Forgot unresolved; no CP1 ready, complete or accepted and no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, finite dispositions. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,False,revision)
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static real process identity and final binding review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

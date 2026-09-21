"""Review corrected footer capture and its changed bindings only."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_REVIEW38';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_CAPTURE_FIX38','GUIDE_FOOTER_DIAG38','GUIDE_PROCESS_REVIEW37']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_FOOTER_DIAG38' or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_CAPTURE_FIX38-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review contained footer correction and fresh LIVE31 binding','GUIDE_CAPTURE_FIX38',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — footer correction and final capture binding review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static corrected helper, saved inert screenshots and final LIVE31 binding review; retain unrelated completed evidence.

## 3. Work
Review only the consumed DIAG38 footer findings and the corresponding append-only author correction. Row23 original pane already painted both current footer labels; old helper moved a contained footer backward toward the strict bottom edge. Historical post-scroll geometry is unavailable. Verify corrected helper preserves already-contained current footer position and uses bounded settled scrolling when reveal is actually required, without changing product styles or pane size for original top/footer captures. Actual fully painted containment, current target identity and source/action equality must remain strict. Expanded complete image remains separate; no prior article substitution, clipped footer acceptance or permissive tolerance.

Inspect the saved four-Romanian-turn production markup and CSS fixture with actual current row23 two-source labels. Review old-helper RED, contained no-scroll PASS, genuine below-pane reveal, impossible containment rejection, safe diagnostic persistence before throw and exact restoration on exceptions. Inspect resulting images themselves, including current top/footer and expanded complete, not only dimensions or file existence. Retain unchanged FIX30 full/compact EN/RO and stale-target evidence and ensure changed paths preserve those guarantees. Missing historical geometry stays explicitly unavailable. Product files and KB must be unchanged. No operational reproduction or new tests under this static review.

Review only necessary new executable and metadata bindings for fresh LIVE31 and actualGUIDE23. Complete future absence must cover every potential new output and diagnostic, rowProof.result and unchanged unused owner paths. All7 literal argv select the finalized command contract; operator embeds the actual final digest and metadata hashes the same executable; non-inert stale/current guard controls exercise the real boundary. Screenshot source selection and imported hashes must choose the corrected helper. Retained PROCESS_BIND37 readiness/idle/shared validator, RECOVER34 runtime schema/owner command, narrow Support-principal parser, exact cwd, Node --import tsx, require_escalated and separate log ownership must remain unchanged and correctly bound. Do not repeat their already passed behavioral audits.

Fixed31, five sessions,14EN17RO,max27modelcalls,31000ms pacing and fresh58 gate dependency remain. LIVE30's five actual rows are immutable failed-attempt evidence, never carried into the new31. Full-five natural not-before2026-09-21T09:51:12.590Z is not a current capacity PASS. Runtime9 last known ready at LIVE30; postfailure custody remains unproven until the next operational readiness. No startup allowance remains under the latest two-request approval.

Return PASS_FINAL_FOOTER_CAPTURE_BINDING or an exact bounded REWORK. Retain completed product, logical58, process, schema and operator dispositions where unchanged; no broad code or editorial reaudits. Actual31 and owner availability remain unproven. Forgot unresolved; no CP1 ready, complete or accepted and no CP2.

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
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static footer correction and final capture binding review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

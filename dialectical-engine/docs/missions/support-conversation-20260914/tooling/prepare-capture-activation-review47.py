"""Review the actual compact capture activation correction and successor bindings."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_ACTIVATION_REVIEW47';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_CAPTURE_ACTIVATION_FIX47','GUIDE_PHASE_IMPORT_REVIEW46','GUIDE_LIVE35']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_LIVE35' and r['verdict']=='FAILED_CAPTURE_COMPACT_COOKIE_ORDER_ZERO_ANSWERS') or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_CAPTURE_ACTIVATION_FIX47-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review real capture activation order and final operator binding','GUIDE_CAPTURE_ACTIVATION_FIX47',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — final same-product continuation binding review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static final continuation sources and actual-UI intercepted proof only; retain already reviewed helper images and product dispositions.

## 3. Work
Review only FIX47 against LIVE35's exact compact activation failure. Retain all unrelated REVIEW46 and ancestor PASS. No new execution, browser or operational traffic.

Verify the source delta settles exposed cookie consent BEFORE compact activation in the real capture openMode function. The original negative control must reproduce the recorded collapsed state with visible consent. The corrected positive must exercise the same real function and reach visible READY/composer state; the already-settled case must remain valid. Check that the real executable function is bound to final capture producer bytes rather than a duplicated stand-in. All dynamic, private and external requests must be intercepted before navigation, with only public same-origin assets forwarded and forwardedDynamic=0. No live Support session/message/model/status/capacity/DB activity. State assertions, pointer hit testing, language handling and real Help navigation must remain intact.

Inspect directly affected source and final command/gate/operator closure only. All seven literal argv select FIX47 final contract; operator embeds the final digest; metadata binds executable and retains operatorOwned. Fresh LIVE36 operational and composed paths, actualGUIDE25 paths, and UNUSED owner21 capacity/owner25 walkthrough paths must be consistent. Failed LIVE35 and actualGUIDE24 evidence stays immutable. Future operational paths remain absent. Preserve real phase import graph, UI writer/lifecycle, completion state, producer/composer, exact schedule/capacity bounds, private parser and runtime checks. No repeated ancestor audit or unrelated control requirement.

Retain all ten LIVE31 answers with their failed-attempt provenance and row47 exception; only the fixed remaining21 may be sent later. Failed zero-answer attempts contribute none. Return PASS_FINAL_CAPTURE_ACTIVATION_BINDING or a concrete bounded REWORK. Actual remaining21/all31 review and fresh owner availability are still required. Forgot unresolved; no CP1 acceptance or CP2.

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
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static final same-product continuation binding review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

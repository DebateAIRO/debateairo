"""Review corrected footer capture and its changed bindings only."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_COMPLETION_REVIEW42';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_COMPLETION_FIX42','GUIDE_SESSION_TIMES_REVIEW41']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_SESSION_TIMES_REVIEW41' and r['verdict'].startswith('REWORK')) or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_COMPLETION_FIX42-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review bounded timestamp producer and final operator binding','GUIDE_COMPLETION_FIX42',seat)
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
Review only FIX42 against your sealed REVIEW41 remaining completion-boundary finding. Retain all other REVIEW41 and REVIEW40 passing dispositions, including corrected producer/composer, actual UI, capacity, screenshot helper, process/schema and product evidence. No repeat source audit, controls or browser execution.

Confirm the actual capture success predicate validates exactly three valid ordered identifier-free timestamps/ordinals and no accumulated sessionVersionFailure BEFORE result.completed=true and success checkpoint. Missing or failed timestamp recording must never produce a completed receipt. Review controls using this real production predicate, demonstrating valid completed21/three-session state reaches success and missing, malformed, extra, out-of-order and accumulated failure states cannot mark complete/write success. Reject tests of an unused stand-in or source-search-only assertions. The producer, composer, requests, groups, pacing, navigation and all other behavior must remain unchanged.

Check only the necessary successor imports and final command/gate/operator bindings, including all seven exact argv, embedded final digest, executable metadata and operatorOwned paths. Retain the unchanged runtime/parser and phase source proofs. Stale/current controls exercise the real established boundary without I/O. LIVE32 and actualGUIDE24 outputs, composition manifest and retained owner paths remain absent. No actual remaining21 or owner availability is claimed.

Return PASS_FINAL_COMPLETION_BINDING or the precise remaining bounded defect. Preserve all ten LIVE31 answers and failed provenance, fixed remaining21, no resampling, and final31 across two disclosed segments. Forgot unresolved; no CP1 ready/complete/accepted or CP2.

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

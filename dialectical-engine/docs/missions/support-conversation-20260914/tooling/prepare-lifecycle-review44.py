"""Review corrected footer capture and its changed bindings only."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PREFLIGHT_LIFECYCLE_REVIEW44';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_PREFLIGHT_LIFECYCLE_FIX44','GUIDE_INITIAL_STATE_REVIEW43','GUIDE_LIVE32']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_LIVE32' and r['verdict']=='FAILED_PREFLIGHT_SELF_COLLISION_ZERO_TRAFFIC') or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREFLIGHT_LIFECYCLE_FIX44-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review bounded timestamp producer and final operator binding','GUIDE_PREFLIGHT_LIFECYCLE_FIX44',seat)
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
Review only FIX44 against the exact zero-traffic LIVE32 self-collision failure. Retain your REVIEW43 initialization/completion PASS and every other unchanged producer/composer, UI, capacity, helper, process/schema and product disposition. No rerun, browser, runtime or traffic.

Trace the actual operator-to-preflight artifact lifecycle through the shared production stage validator. Every future output must be absent before the invocation. At actual preflight only exact legitimate prerequisite and operator/phase log artifacts created by this invocation may already exist, with correct ownership and binding. Verify all such files, not only the first previously reported collision. No blanket exemption, stale artifact acceptance, forged prerequisite, overwrite or weakened filesystem checks. Inspect controls exercising real production lifecycle code: clean initial absence then expected own-file creation passes the real preflight boundary; stale/forged/unexpected files reject at the appropriate stage. Reject a stubbed first phase or source-search-only test that skips the former failure.

Check directly affected final guard imports and bindings and complete fresh LIVE33 namespace. All seven exact argv select final FIX44 contract, operator embeds actual final digest, metadata hashes executable and retains operatorOwned. Future absence covers phase/prerequisite/stop/proof/UI/profile/log/image/actual/composed/owner paths consistently. LIVE32 failure artifacts remain immutable; actualGUIDE24 stays unused; composition now GUIDE_LIVE33-composed31-manifest.json, owner capacity/walkthrough retain LIVE21 and LIVE25 paths. Controls must create no operational future output. Preserve private preparation, unchanged runtime custody/schema/process and per-phase log ownership.

Original ten LIVE31 replies stay retained, with failed provenance and row47 exception; LIVE32 contributes zero answers. Exactly the same remaining21 in three sessions and18 model branches, all pacing/source/action/session constraints unchanged. No resampling or new test cases. Return PASS_FINAL_PREFLIGHT_LIFECYCLE_BINDING or precise bounded REWORK. Actual remaining21/all31 review and fresh owner availability remain unproved. Forgot unresolved; no CP1 ready/complete/accepted or CP2.

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

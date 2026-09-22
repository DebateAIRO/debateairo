"""Review corrected footer capture and its changed bindings only."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_SESSION_TIMES_REVIEW41';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_SESSION_TIMES_FIX41','GUIDE_CONTINUATION_REVIEW40']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_CONTINUATION_REVIEW40' and r['verdict'].startswith('REWORK')) or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_SESSION_TIMES_FIX41-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review bounded timestamp producer and final operator binding','GUIDE_SESSION_TIMES_FIX41',seat)
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
Review only FIX41 against your sealed REVIEW40 findings. Retain every REVIEW40 passing disposition, helper39 images, BIND40 actual compiled UI and capacity proof, and prior product/process/schema reviews. No full-chain re-review or browser/control execution.

Inspect actual timestamp producer and actual createComposedManifest. Exactly three identifier-free remaining session creation timestamps with correct ordinals must compose with the immutable original two into all five in natural order. Review the same real producer exercised by synthetic completed21 fixtures: three valid timestamps PASS; two, four, malformed and out-of-order cases reject. No artificial receipt may be passed off as actual traffic; no private identifiers or capabilities persisted or hashed. The changed source must remove the concrete two-timestamp truncation without changing capture membership, groups, consent, pacing, transition, sends or model limits. Resolve any other concrete bounded REVIEW40 findings, preserving all prior passing dispositions.

Review directly affected imported hashes, capture/composer, command/gate and operator contract bindings. All seven exact phase argv must select final FIX41 contract; final operator embeds its actual digest; metadata hashes the executable and retains exact operatorOwned outputs/logs. Stale/current controls must reach the real existing boundary without operational I/O. Preserve byte-identical prior phase/runtime/parser guards and source references where unaffected. No premature composed result or owner availability claim. Check future LIVE32, actualGUIDE24, composition output, unused retained LIVE21 owner capacity and LIVE25 walkthrough paths remain absent.

The actual remaining21 plan and all31 across two segments remain unchanged; all ten LIVE31 responses including row47 must be retained, with LIVE31 still failed. No resampling. Return PASS_FINAL_SESSION_TIMES_BINDING or precise remaining bounded REWORK. Remaining21 live, all31 answer/image quality and fresh owner availability are still unproved. Forgot unresolved; no CP1 ready/complete/accepted or CP2.

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

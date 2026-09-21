"""Review corrected footer capture and its changed bindings only."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_FOOTERLESS_REVIEW39';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_FOOTERLESS_FIX39','GUIDE_CONTINUATION_REVIEW39','GUIDE_CAPTURE_REVIEW38']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_FOOTERLESS_FIX39-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review footerless helper and actual saved inert images','GUIDE_FOOTERLESS_FIX39',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — footerless helper review before continuation binding

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static footerless helper, call contract and saved inert images only; final continuation binding is reviewed separately.

## 3. Work
Review only FIX39's unbound footerless helper and explicit validated call contract against your consumed REVIEW39 row47 diagnosis. Legitimate footer absence must require exact validated empty API and DOM source/action sets and absence of a footer. Missing expected source/action controls must stay closed; no arbitrary selector failure may downgrade evidence. Preserve exact current article identity and stale/previous target rejection.

Visually inspect actual-size full/compact EN/RO short footerless start/end and expanded images, and the long-body images with all60 lines. Prove whole short current text and long current body end are painted in the normal pane, while expanded complete evidence remains distinct. Body-end is not a source footer and must be labeled accordingly. Inspect actual helper code and adapter, including strict paint/containment, bounded movement, safe geometry before failure and observed finally restoration. Retain valid FIX38 contained-footer/source-footer behavior and safeguards; do not rerun unchanged fixtures or product audits.

Review all9 affected controls and preserved two fixture failures: strict Node error-message equality and the synthetic important-height clipping issue discovered by visual QA. Inspect the final rendered images themselves; dimensions or file existence alone are insufficient. No actual browser or other test execution in this static review.

The helper is intentionally unbound. Original preview is independently implementing the adopted remaining21 controller and final binding under GUIDE_CONTINUATION_BIND40 in a disjoint append-only namespace. Do not review incomplete files or wait for that node here. Return PASS_FOOTERLESS_HELPER_CALL_CONTRACT or exact bounded REWORK promptly, with concrete source/image evidence. Final binding review will consume your disposition without repeating it. Actual row47 already has sufficient original short-answer evidence and must not be recaptured. No product change, operational traffic or acceptance. Forgot unresolved; no CP1 ready/complete/accepted or CP2.

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
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static footerless helper review before continuation binding only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

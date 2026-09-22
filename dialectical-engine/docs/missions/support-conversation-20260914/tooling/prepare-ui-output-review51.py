"""Review the bounded real UI-child output-path correction."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_UI_OUTPUT_REVIEW51';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921.md',D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_UI_OUTPUT_FIX51','GUIDE_CAPTURE_PANE_REVIEW48','GUIDE_PREFLIGHT_SCHEMA_REVIEW49','GUIDE_OPERATOR_CWD_REVIEW50','GUIDE_LIVE38']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_LIVE38' and r['verdict']=='FAILED_PREFLIGHT_UI_OUTPUT_PATH_BINDING_ZERO_TRAFFIC') or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_UI_OUTPUT_FIX51-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review actual UI-child output binding and final namespace','GUIDE_UI_OUTPUT_FIX51',seat)
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
- verification: static real-child source and finite offline validation evidence only; retain already reviewed helper images and product dispositions.

## 3. Work
Review only FIX51 against LIVE38's pre-browser output-path failure. Retain your REVIEW48, REVIEW49, REVIEW50 and earlier unaffected PASS. No image re-review, product audit or execution.

Verify the final selected REAL UI child obtains its closed operational output AND profile from the reviewed selected contract or authenticated caller binding. It must not rely on another hard-coded predecessor run suffix or accept arbitrary filesystem paths. Keep control paths separately closed and preserve exclusive writer/lifecycle checks. Trace exact selected phase to child argv to actual startup validator, including the planned fresh LIVE39 output/profile. Verify offline evidence executes those real child validation bytes with that exact binding before exiting prior to custody/process/browser/private preparation. Predecessor should fail the selected path, corrected child should accept, and mismatched/unselected output/profile or contract should reject before effects. A caller-only interception, stand-in validator or import check does not prove the real child path. Check the offline branch cannot bypass the validator the operational child uses. The compiled UI behavior and interception below it remain unchanged; retain their prior evidence.

Check directly necessary final bindings: fresh LIVE39 phase/prerequisite/stop/proof/UI/profile/log/composed paths; unused actualGUIDE26 and owner21 capacity/owner25 walkthrough; all seven literal argv selecting the final contract; operator final digest and operatorOwned paths; exact absolute Node --import tsx; metadata and actual cwd {L}; full reachable module closure; all future outputs absent. Flag a concrete same-cause caller-child path or profile mismatch, without broadening the audit.

Keep product0d34/KB7ef, schema2, retained11/remaining20, three-segment composition and all six timestamps. Exact20 questions,3 new sessions,17 model ceiling,31sec spacing,3/26/23 capacity with6 owner reserve, fresh58 proof and same-session54-to43 navigation unchanged. Retain ten LIVE31 plus LIVE36 row10, both failed attempt provenances, accepted row47 single image and distinct non-actual row10 replay/missing live end and expanded images. LIVE38 contributes zero actual answers. No resampling or runtime activity.

Return PASS_FINAL_REAL_UI_OUTPUT_BINDING or precise bounded REWORK. Remaining20 actual run is still unexecuted, and its authorization must respect the explicitly approved run's stop/no-retry limits. No live attempt is authorized by this review. Final actual-content review and one owner availability frame remain after that. Forgot unresolved; no CP1 completion/acceptance or CP2.

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

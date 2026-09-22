"""Review compact scroll selection and the qualified three-segment continuation."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_PANE_REVIEW48';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921.md',D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_CAPTURE_PANE_FIX48','GUIDE_CONTINUATION_FEASIBILITY48','GUIDE_CAPTURE_ACTIVATION_REVIEW47','GUIDE_LIVE36']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_LIVE36' and r['verdict']=='FAILED_CAPTURE_ROW10_NO_RETRY') or r['verdict'].startswith('PASS') or (parent=='GUIDE_CONTINUATION_FEASIBILITY48' and r['verdict']=='FEASIBLE_WITH_DISTINCT_REPLAY_EVIDENCE')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_CAPTURE_PANE_FIX48-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review compact pane correction and qualified remaining20 binding','GUIDE_CAPTURE_PANE_FIX48',seat)
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
Review only FIX48 against LIVE36's actual compact-scroll failure and the adopted row10 continuation decision, including original requirements feasibility conditions. Retain unrelated REVIEW47 and ancestor PASS; no new execution, browser or operational traffic.

Verify compact capture selects the real .supportWidgetPanel scroll viewport while full mode remains unchanged. Inspect exact public row10 replay through the REAL screenshot helper and compiled component, original-selector failure, corrected footer visibility/normal scrolling/paint/clipping and restoration at390x844, plus the bounded long compact control. Every dynamic, private and external request must be intercepted before page creation, forwardedDynamic=0, actualSupport/model/status/capacity/DB=0. Replay images must be explicitly synthetic-response replay, never relabeled actual LIVE36. Preserve original live row10 accepted content/API-DOM equality/start PNG and missing end/expanded image failure; decide whether the original requirements agent's layered-evidence conditions are met. Do not waive footer reachability or let expanded-only images stand for real pane usability.

Inspect affected final producer/composer/schedule/gate/command/operator closure. Exactly20 outstanding: compactRO18,26,34,56,58,54 then keyboard Help to fullRO43 same session; fullEN5,13,21,25,29,37,45,53; compactEN8,12,42,55,57. Exactly3 new sessions,17 model branches,31sec spacing; budget3/26/23 includes6owner reserve,2/25/22 fails. Full58 logical matrix unchanged. Composition must retain all10 LIVE31+1 LIVE36+20 new unique IDs across THREE actual answer segments with all SIX identifier-free timestamps, original row47 exception, distinct row10 replay qualification, both failed-attempt provenances and no completed-case resend. Controls must reject missing/duplicate/extra/wrong revision and replay relabeling.

Fresh LIVE37 phases/prerequisites/stop/proof/UI/profile/log/composed paths and actualGUIDE26 must be consistent; unused owner21 capacity/owner25 walkthrough preserved. All seven argv select FIX48 final contract, operator embeds its final digest, metadata binds executable and operatorOwned, exact reachable source closure bound, future outputs absent. All actual20 new replies still require normal current-target original-pane start/end and separately expanded evidence. No new audit family or repeated ancestor checks.

Return PASS_FINAL_COMPACT_PANE_CONTINUATION_BINDING or precise bounded REWORK. State explicitly whether row10's qualified layered evidence is accepted for a later working-preview report and retain its limitations. Actual remaining20/all31 content review and fresh owner availability still required. No product change, guessed Forgot URL, CP1 acceptance or CP2.

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

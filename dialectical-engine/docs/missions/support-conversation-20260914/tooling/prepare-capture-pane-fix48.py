"""Repair compact scroll-container selection and bind a qualified remaining20 continuation."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_PANE_FIX48';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921-DRAFT.md',D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE36','GUIDE_CAPTURE_ACTIVATION_FIX47','GUIDE_CAPTURE_ACTIVATION_REVIEW47']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 assert r['verdict']=='FAILED_CAPTURE_ROW10_NO_RETRY' if parent=='GUIDE_LIVE36' else r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_CAPTURE_ACTIVATION_FIX47-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'select the real compact scroll container and bind remaining20','GUIDE_LIVE36',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded actual compact scroll-container repair

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY, debugging and verification skills. Root persisted claim proxy. No reload, new agents or delegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for finite intercepted compiled-UI controls, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, canonical prompts, decisions or prior evidence edits; live Support sessions/messages/model requests, status/capacity/DB reads, private data or logs; future LIVE37 or actualGUIDE26 outputs; startup or restart; owner questions or acceptance.
- verification: the real changed screenshot helper against the compiled UI with every dynamic, private and external request intercepted before page creation; only ordinary same-origin public assets may be forwarded. No product test rerun or unrelated control family.

## 3. Work
Consume LIVE36 FAILED_CAPTURE_ROW10_NO_RETRY and retained REVIEW47 PASS. Row10 actual accepted response and partial actual start image stay immutable. No live resend, discarded unfavorable sample, missing-image claim or product change. The actual screenshot controller selects .supportAssistantCompact (client/scrollHeight882,maxScroll0,bottom1118 on390x844), while .supportWidgetPanel is the actual max-height70vh/overflow:auto controlling parent. Correct compact-mode pane selection to the actual scrolling viewport. Preserve full-mode pane selection and all strict current-target, text/source/action equality, footer/body-end, paint/clipping, bounded reveal and finally restoration assertions.

Exercise the REAL changed helper and real compiled component with all dynamic, private and external requests intercepted before page creation; only same-origin public assets may be forwarded. Replay the exact public LIVE36 row10 response without credentials, actual session/capability values, network Support requests or favorable model resampling. Prove original selector failure, corrected selector exposing the complete footer through normal scrolling, and restoration at390x844. Retain actual start PNG separately and label ALL replay images as synthetic-response replay, never actual LIVE36. One bounded long compact reply control must also prove original-pane start/end, separately expanded full answer, reachable controls and restoration with the actual parent selection. Do not alter viewport to make an original-pane assertion pass. Do not rerun unrelated product, full-mode, module/lifecycle or earlier UI tests.

Implement the DRAFT same-product remaining20 continuation binding, subject to separate independent feasibility and final review before any live run. Retain ALL10 LIVE31 plus LIVE36 row10. Remaining20 compactRO18,26,34,56,58,54 then real keyboard Help navigation to fullRO43 same session; fullEN5,13,21,25,29,37,45,53; compactEN8,12,42,55,57. Exactly3 new sessions,17 model-branch ceiling,31sec start spacing. Fresh gate must require3 sessions,20 messages/17 model branches plus6 owner-message/model reserve: accept3/26/23, reject2/25/22 and retain every other quota/runtime/corpus/freshness guard. No obsolete21-send/18-model assertion. Fresh58 logical matrix stays intact.

Fresh LIVE37 phase/prerequisite/stop/proof/UI/profile/finite logs; actualGUIDE26; composed GUIDE_LIVE37-composed31-manifest.json. Preserve unused GUIDE_LIVE21-owner-capacity.json and GUIDE_LIVE25-owner-testability.json. Compose exactly31 unique identities across THREE actual answer segments and all SIX identifier-free session times, retaining both failed-attempt provenance and missing-image qualifications. All20 new actual rows retain normal complete screenshot requirements; row10 replay evidence must stay distinct. No live execution until root adopts a supported continuation decision and original reviewer passes both its disposition and the final source/bindings. If a truthful composer cannot express this qualification, report a finite blocker rather than inventing images.

Update all directly affected producer/composer/schedule/gate expectations and final closure/command/operator hashes. Finite actual-path composition and capacity controls must reject missing, duplicate, extra, wrong-revision or relabeled replay evidence. All future operational paths must remain absent. Do not edit prior evidence. Retain all unrelated PASS and startup allowance exhausted. Seal PASS_COMPACT_PANE_CONTINUATION_BOUND_REVIEW_REQUIRED or precise blocker, disclose every failed control, release heavy. Forgot unresolved; no CP1 ready, complete, accepted or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, finite dispositions. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L);git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='finite intercepted real compact pane and remaining20 composition controls; zero live operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded actual compact-pane correction and remaining20 binding; no live Support traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

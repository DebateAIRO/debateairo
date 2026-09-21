"""Correct and independently review the real gated58 importer path."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_CAPTURE_FIX30','GUIDE_CAPTURE_REVIEW30'];review=node.endswith('REVIEW30');seat='/root/baseline' if review else '/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_CAPTURE_FIX29','GUIDE_CAPTURE_REVIEW29','GUIDE_LIVE28','GUIDE_OPERATOR_FIX28','GUIDE_OPERATOR_REVIEW28','GUIDE_RUNTIME7']+(['GUIDE_CAPTURE_FIX30'] if review else []):
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_CAPTURE_FIX30':assert r['verdict']=='PASS_COMPLETE_FULL_ANSWER_CAPTURE'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/('GUIDE_CAPTURE_FIX30-manifest.json' if review else 'GUIDE_CAPTURE_FIX29-manifest.json'))['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review complete full-mode long-answer image capture' if review else 'remove and restore full-mode screenshot clipping ancestors','GUIDE_CAPTURE_FIX30' if review else 'GUIDE_CAPTURE_REVIEW29',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)' if review else f'{O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new)'
work="""GUIDE_CAPTURE_REVIEW29 visually found that full-ro-long-complete.png does not contain the complete long answer or source/action footer: screenshotCompleteArticle expands only .supportChatScroll while real .supportDesk retains fixed height and overflow:hidden, leaving clipped content and blank remainder. Top/footer original-pane images separately prove reachability, but the expanded-complete proof only checked PNG existence and falsely claimed completeness. Preserve this exact failed image/proof and review. Correct source-label projection, current/stale target guards, and bounded short-contained equal-scroll behavior are already PASS and must remain intact.

Limit implementation to the expanded-complete screenshot helper and mechanically necessary capture/import/command/gate/snapshot/operator bindings. In full mode remove and later restore every real clipping ancestor necessary for the selected current article, at least the full root and pane; bind the actual public selector/ancestor structure. Preserve original pane top/footer evidence before expansion. Restore exact original styles, viewport and scroll state affected by the helper, including exception paths. Do not modify product/UI design or weaken target identity and stale/previous-reply guards.

Prove the complete screenshot itself includes painted target top and footer/source/action content, not merely nonzero dimensions or file existence. Use the actual long full-mode markup fixture; retain old clipped image as a discriminating RED and add a control that the old behavior fails. Visually inspect the corrected complete image and ensure its source/action footer is present. Keep short contained behavior, compact/full EN/RO and prior current/stale guards valid; rerun only affected local fixtures. Inert local browser fixtures are allowed with required execution permissions; no live app/runtime/HTTP/status/capacity/DB/Support/model traffic or private data.

Publish append-only GUIDE_CAPTURE_FIX30-command-contract.json, GUIDE_CAPTURE_FIX30-gate-template.json, GUIDE_CAPTURE_FIX30-operator-contract.json and GUIDE_CAPTURE_FIX30-manifest.json as mechanically required by changed helper/capture hashes. All7 argv[2] self-bind the exact final command contract. KEEP every still-unused LIVE29 phase/capacity/gate/rowProof/UI/profile/operator path, actual GUIDE_LIVE_GUIDE22 response/screenshot namespace and GUIDE22 provenance. Do not invent another operational namespace. Keep exact fixed31 groups/5sessions/14EN17RO/max27calls/31000ms pacing and full58 context proof. Retain identifier-free first/second session observation timestamps, complete invocation-time future absence set, distinct descriptor ownership, numeric stop-first, narrow SUPPORT_DATABASE_URL preparation, node --import tsx, and no outer redirection. Later LIVE29 executes the exact sealed operator using require_escalated.

Retain Runtime7/product456/KB7ef/private LIVE20 log and all immutable prior attempts; no Git/product/runtime changes. Retain FIX22 owner-capacity command exact df5580ba... and unused output, plus unused GUIDE_LIVE25-owner-testability.json in the real future absence set. Natural next5-session NOT_BEFORE remains exactly2026-09-21T03:21:15.789581Z (consumed LIVE28 upper bound+hour+5s), planning-only and not capacity PASS. No early frame, quota/identity/model/config changes or partial actual-row carry.

Finish finite logs before hashing. Retain current product/context proofs instead of broad reruns. Return exact tested helper, image/paint evidence, complete literal operator bindings and qualifications. Forgot unresolved; no CP1 complete/accepted or CP2.
"""
work += ("Independently review the actual corrected full-long expanded image, top/footer/source/action inclusion, discriminating old-fails control, restoration and unchanged identity guards, then mechanically necessary final bindings. Return PASS_COMPLETE_FULL_ANSWER_CAPTURE_FINAL_BINDING or precise finite REWORK. No traffic or broad product audit." if review else "Correct and verify only the proven full-mode clipping defect plus its actual-image completeness assertion. Return PASS_COMPLETE_FULL_ANSWER_CAPTURE or finite failure; release sole heavy. Original baseline review follows.")

packet=f'''# PACKET {node} — complete full-mode long-answer capture

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB, canonical question/oracle or prior evidence edits; live runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private values/logs; quota/configuration/role changes; owner questions/acceptance.
- verification: {'static bounded independent review only; no heavy lease' if review else 'sole heavy for inert complete full-mode screenshot and restoration controls'}; no broad product/screenshot reruns.

## 3. Work
{work}

Forgot remains unresolved/actionless; no CP1 readiness/completion/acceptance or CP2. Preserve source-custody/typecheck limitations and all prior failed attempts.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, painted complete-answer image and restoration evidence. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='inert clipping correction and necessary final binding; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; full-mode clipping and complete-image proof only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

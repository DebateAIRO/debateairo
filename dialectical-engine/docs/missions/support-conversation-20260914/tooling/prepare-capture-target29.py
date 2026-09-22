"""Correct and independently review the real gated58 importer path."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_CAPTURE_FIX29','GUIDE_CAPTURE_REVIEW29'];review=node.endswith('REVIEW29');seat='/root/baseline' if review else '/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_LIVE28','GUIDE_OPERATOR_FIX28','GUIDE_OPERATOR_REVIEW28','GUIDE_HARNESS_FIX26','GUIDE_HARNESS_REVIEW26','GUIDE_CAPTURE_CONTROLS18','GUIDE_RUNTIME7']+(['GUIDE_CAPTURE_FIX29'] if review else []):
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_CAPTURE_FIX29':assert r['verdict']=='PASS_REAL_MESSAGE_SCREENSHOT_TARGET'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/('GUIDE_CAPTURE_FIX29-manifest.json' if review else 'GUIDE_OPERATOR_FIX28-manifest.json'))['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review real-message screenshot target correction and fresh binding' if review else 'diagnose and correct accepted-message screenshot target mismatch','GUIDE_CAPTURE_FIX29' if review else 'GUIDE_LIVE28',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)' if review else f'{O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new)'
work="""LIVE28 reached the real app. Preflight/readiness/capacity/gate/all58 proof passed, then canonical1 Pricing/full/EN returned HTTP200 ANSWER_GROUNDED MODEL_ACCEPTED_DRAFT with app-navigation source, no action, and exact API/DOM text/source/action equality. Capture then raised GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH at POST_ACCEPTED_RESPONSE_SCREENSHOT_TARGET before any screenshot. One real session/message was consumed; profile cleaned. Preserve this entire measured attempt and partial actualGUIDE21 evidence. Do not count it toward a future fresh31 run.

First identify the exact source of the mismatch from sealed finite failure/actual evidence, final capture callsite, screenshot helper696dc176... and the real current public UI component. Do not infer a product defect from the assertion alone. Reproduce using the actual accepted row1 content and real public reply markup/selector structure in a clearly inert browser fixture. The earlier generic798px synthetic fixture did not cover this actual target identity. No additional live app/browser/status/DB/Support/model request is authorized during correction; inert browser with intercepted or local-only fixture is permitted. Do not read private ongoing logs or customer data. If this requires a product change, stop with exact smallest write paths and evidence; do not edit product without a Git-scoped author packet.

Fix only the screenshot target selection/identity mismatch proven by that fixture. Preserve safeguards against stale/previous reply screenshots, exact current article/API/DOM/source/action/outcome equality, original-pane top/footer reachability and separately labeled expanded-complete evidence. Do not suppress or relax identity checks just to pass. Focused controls must include the actual short row1 message, real long guide reply markup, full/compact EN/RO where selection differs, and stale/previous/wrong-target negatives. Reuse unchanged product and context58 proof; no broad corpus rerun or paid sample.

Because LIVE28 used the LIVE25 phase/capacity/gate/rowProof outputs and actualGUIDE21 receipt, publish one fresh fully bound successor: GUIDE_CAPTURE_FIX29-command-contract.json, GUIDE_CAPTURE_FIX29-gate-template.json, GUIDE_CAPTURE_FIX29-operator-contract.json and GUIDE_CAPTURE_FIX29-manifest.json. Use fresh LIVE29 phase/capacity/gate/rowProof/UI/profile/operator outputs and fresh actual GUIDE_LIVE_GUIDE22 response/screenshot namespace with correct GUIDE22 provenance. Keep the approved fixed31 cases/groups, 5sessions,14EN/17RO, <=27model calls,31000ms pacing, all20menus/8affected/4owner/2Help-navigation/4boundaries exactly. Full58 logical proof remains separate from31actual. Keep Runtime7/current product456/KB7ef and private LIVE20 log unchanged; do not restart healthy stack.

Prepare the complete reusable operator and exact argv/cwd, retaining proven node --import tsx, narrow SUPPORT_DATABASE_URL preparation, all future paths in real invocation-time absence/collision set, distinct operator/wrapper path ownership, numeric stop-first status, and fresh proof→capture dependency. All7 command argv[2] self-bind the exact new command contract; public operator contract records actual source/hash/argv. Retain FIX22 deferred-owner command by exact df5580ba... hash and existing unused output. Keep existing unused GUIDE_LIVE25-owner-testability.json walkthrough path and ensure it is in the real absence set. Execute only focused inert screenshot and mechanically necessary final literal/binding controls; use actual shared parsers and launcher boundaries. No new operator wrapper at live dispatch.

Record a conservative NOT_BEFORE time for future5-session capacity using sealed LIVE28 completion/receipt or root consumption time as an upper bound for its one consumed session, plus the full hourly window and5s margin. Never invent an exact session creation timestamp: it was not recorded. This is timing evidence, not a fresh capacity PASS. Do not measure capacity or run actual capture in this node. Root will wait for natural availability before the next one-shot fresh frame; no quota/identity/model/configuration changes. Later owner2sessions/6messages still require their own natural availability.

Finish finite logs before hashing; publish exact new and retained artifacts/source custody. Product456 and all review qualifications stay intact. Forgot remains unresolved/actionless; no acceptance, completion or CP2.
"""
work += ("Independently review the proven actual-message target cause/correction, real-markup positive and stale-target negatives, complete fresh successor namespace/literal operator/capture binding, and conservative natural-time bound. Return PASS_REAL_MESSAGE_SCREENSHOT_TARGET_FINAL_BINDING or precise finite REWORK. No new traffic or broad product audit." if review else "Diagnose and implement only the evidenced screenshot target correction, then bind the complete fresh successor once. Return PASS_REAL_MESSAGE_SCREENSHOT_TARGET or exact finite failure. Release sole heavy; separate original baseline review follows.")

packet=f'''# PACKET {node} — real accepted-message screenshot target and fresh successor

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB, canonical question/oracle or prior evidence edits; live runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private values/logs; quota/configuration/role changes; owner questions/acceptance.
- verification: {'static bounded independent review only; no heavy lease' if review else 'sole heavy for inert real-message screenshot controls and final successor binding'}; no broad product/screenshot reruns.

## 3. Work
{work}

Forgot remains unresolved/actionless; no CP1 readiness/completion/acceptance or CP2. Preserve source-custody/typecheck limitations and all prior failed attempts.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, actual-message screenshot target evidence and focused findings. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='inert screenshot target correction and successor binding; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; evidenced real-message screenshot target and required fresh successor binding only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

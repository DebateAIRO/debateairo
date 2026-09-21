"""Dispatch bounded product corrections and disjoint capture preparation."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
revision='152eed4da1cd3e66b74d8301159ba76427552409'
clean(revision)
assert read(E/'GUIDE_PRODUCT_PREFLIGHT-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_PRODUCT_PREFLIGHT-receipt.json')
assert read(E/'GUIDE_LIVE9-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_LIVE9-receipt.json')
common=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',D/'decisions/GUIDE-AFFECTED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_PRODUCT_PREFLIGHT','GUIDE_LIVE9','GUIDE_HARNESS_BIND17','GUIDE_HARNESS_REVIEW17']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 common.extend([rp,E/(parent+'-consumption.json')]);common.extend(Path(a['path']) for a in verify(r['artifacts']))
common=list(dict.fromkeys(common))
write_paths=['apps/api/src/support/answer.ts','apps/api/src/support/response-policy.ts','packages/support-kb/src/context.ts','packages/support-kb/src/index.ts','apps/ui/components/support/Assistant.tsx','tests/unit/support-answer-context.test.ts','tests/unit/support-response-policy.test.ts','tests/unit/support-context.test.ts','tests/unit/support-kb.test.ts','tests/unit/support-public-guide-boundary.test.ts','tests/render/sup-01-help.test.tsx','tests/render/support-assistant-scroll.test.tsx']
for article in ['debate-workspace-menus','support-cases','settings-help-menus','app-navigation','support-status-limits']:
 for language in ['en','ro']:write_paths.append('packages/support-kb/content/'+article+'.'+language+'.md')
configs=[('GUIDE_QUALITY_FIX','/root/requirements','correct four grounded-answer findings and investigate reply visibility','GUIDE_PRODUCT_PREFLIGHT'),('GUIDE_CAPTURE_FIX18','/root/preview','prepare exact-answer capture and absolute helper invocation','GUIDE_PRODUCT_PREFLIGHT')]
prepared=[]
for node,seat,title,parent in configs:
 ticket=read(D/'board-ids.json')['tickets'].get(node) or create(node,title,parent,seat)
 files=list(common)
 if node=='GUIDE_QUALITY_FIX':
  for prior in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_CORRECTNESS9','GUIDE_SECURITY9']:
   rp=E/(prior+'-receipt.json');files.extend([rp,E/(prior+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
 files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json')
 index={'revision':revision,'inputs':[rec(p) for p in files]}
 if node=='GUIDE_QUALITY_FIX':index.update({'writePaths':write_paths,'writePathsAtBase':[rec(L/p) for p in write_paths if (L/p).exists()],'sourceCustody':custody(),'findings':['GPP-R1','GPP-R2','GPP-R3','GPP-R4','GPP-R5 visibility investigation only']})
 if inp.exists():
  retained=read(inp);verify(retained['inputs']);assert retained['revision']==revision
 else:write(inp,index)
 if node=='GUIDE_QUALITY_FIX':
  contract=f'''- allowed: exact product writePaths in {inp}; {E}/{node}.md (new); {E}/{node}- (new); {E}/GATE_GUIDE_FINAL10-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new); scoped local commit of changed product paths.
- forbidden: all other product edits, model configuration changes, history work, new privileges, quota resets, private data, runtime or live traffic, old evidence edits, owner re-question or acceptance. No current stack-log reads, hashes or freezes.
- verification: sole heavy and scoped Git; bounded offline tests and synthetic fixtures only. No administrative freeze while this Git lease is held. Preserve healthy owned runtime77769 and unrelated services. Release both leases before handoff.

## 3. Work
Implement the smallest justified correction for GPP-R1 through R4 in the consumed product preflight. Read the exact four public cases, their supplied context, source anchors and report. Do not rerun a model hoping for a different answer, widen every citation indiscriminately, relax the quality oracle, or repeat the whole app audit. Diagnose and fix in this same author node. Send a concise implementation choice and expected verification duration early; do not wait for root approval for changes within the exact scope.

R1: sequence2's detailed Account claims rely on settings-help-menus already supplied to the model but omitted from visible citations. Ensure material detailed claims have their supporting visible source, or prevent claims absent from the displayed authority. Distinguish context retrieval from returned citation completeness.
R2: sequence15 has insufficient public scoring knowledge. Verify the concrete public UI categories at DebatePageClient anchors from the report, then add useful paired EN/RO guidance with availability limits. Explain field categories only; do not read or expose any visitor's scoring/debate values. Keep provenance reviewable and do not claim owner ratification of new text.
R3: sequence35 inaccurately assigns server case creation, confirmation, time target and private-link behavior to a separate support-email workflow. Keep Talk/Escalate case behavior distinct from email using reviewed EN/RO content and the necessary response contract; preserve both supported workflows.
R4: sequence39 contains destination facts beyond the three supplied entries, with no requested or allowed actions. Keep destination guidance within supplied source and closed-action authority. Existing global capability metadata alone is not row-specific grounding. Fix the Romanian typo in the governed behavior if it comes from checked-in content. Do not pretend arbitrary model spelling can be eliminated by a corpus edit if it cannot.

For GPP-R5 inspect actual Assistant message append and nested pane behavior. Old screenshots show earlier content, but alone do not prove a product autoscroll defect. Use a minimal synthetic component/browser-free discriminator if needed. If the existing UI does not keep an appended reply reachable and visible according to its intended behavior, make a small accessible fix within Assistant and its meaningful render regression. Coordinate the exact article/pane semantics with original preview, who is preparing capture correction separately. Do not redesign Help, alter consent, force-scroll a reader away from old content, or assume capture correction proves product behavior.

Before changing producer code, preserve meaningful RED discriminators that replay the exact public defective answers against actual implicated validation/context code, plus paired source/knowledge assertions for newly documented categories. Generalize only across the finite same-cause class, with safe positive controls and negative source/action mismatches. Preserve free conversation, existing runtime model, current-message-only isolation, deterministic private/injection/credential refusals, recovery actionlessness, ownership, encryption, shredding, spend/rate/degraded/human contracts. If a required path is outside the exact list, report that path and reason before editing it.

Run focused affected suites once after fixes, resolve new failures, then verify the final clean commit. Retain the prior34-suite1701pass evidence only for unchanged defining bytes; give a reasoned affected-suite set for changed central answer/context/UI paths. Do not automatically repeat a whole-repository suite or the old76 inherited type errors; compare new diagnostics against the sealed baseline when typecheck is needed. Strict44 corpus snapshot and structural evaluation must run if their defining bytes change, preserving rubric PENDING. Produce complete cumulative FINAL10 inventory, changed/deleted files, new44 KB version and exact product delta, test counts and failure provenance. Do not create an empty inventory. Identify exactly which prior live rows/reviews remain applicable and which must be rerun after these changes; root owns final coverage planning and independent review.

The previous retained15 plus fresh39 proposal is ON HOLD because four retained answers need rework and13 screenshots are insufficient. Neither LIVE8 nor LIVE9 becomes a successful run after this fix. No new live request in this node. Forgot remains unresolved and actionless, CP1 incomplete, CP2 gated.'''
 else:
  contract=f'''- allowed: {O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/Git edits, old harness or evidence mutations, heavy suites/controls, browser, runtime, HTTP, Support, model, capacity, status or DB activity; private data/logs; user questions or acceptance.
- verification: static preparation and lightweight syntax checks only. GUIDE_QUALITY_FIX owns sole heavy and Git. Do not wait on product code to prepare the generic capture/path fix. No administrative freeze or final-revision binding yet.

## 3. Work
Prepare the smallest reusable successor of the reviewed BIND17 capture for GPP-R5 and the sealed zero-traffic LIVE9 path failure. Do not rework source oracles, row grouping, capacity limits, checkpointing, locale or hydration mechanisms that already passed. Preserve all151 previous composite controls and identify the finite new discriminators, but do not run heavy controls under this node. Root will grant a bounded control/rebinding lease after the product author's Git lease ends.

For screenshots, the actual new answer locator is already read but full-page screenshot records an earlier nested supportChatScroll viewport. Bring that exact answer into view and prove visibility, or capture that exact element in a way that preserves relevant locale/mode/source/action layout. Add explicit case identity/visibility metadata so stale repeated screenshots cannot count as current-row proof. Handle long answers without silently clipping their useful part. A mere different PNG hash is insufficient. Preserve existing API/DOM equality and read the exact new article. Provide a negative fixture representing the stale viewport and a positive target-visible fixture; do not manufacture actual-browser proof. Product autoscroll and evidence capture are separate obligations. Share the concrete article/pane semantics with original requirements; do not edit Assistant yourself.

For invocation, LIVE9 stopped before any capacity read because the capacity materializer was invoked relative to product cwd while stored in the source repository. Prepare an exact operational command-contract generator that validates absolute existing script paths for EVERY helper, including capacity materializer, row proof and capture, with exact cwd, outputs/logs, argument types and hashes. Include a zero-traffic negative for wrong relative cwd/path that fails before helper execution, plus the valid absolute path. Validate the declared operator invocation itself, not only later row/capture commands. No status or DB call in these probes.

Bind preparation to current base152 but expressly mark it NOT an actual-ready final binding: product correction is concurrent, finalrevision/KB/affected-row plan must be provided later. The GUIDE17 actual namespace remains unused after zero-trafficLIVE9; do not overwrite prior outputs or choose a live retry on your own. Preserve prior missing packaging-log limitation. Return source-anchored changes, prepared control files and explicit next binding inputs, with syntax evidence only. No preview, readiness or completion claim.'''
 packet=f'''# PACKET {node} — bounded quality correction

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY and debugging/review/TDD/verification skills. Assigned ticket comments before work; root persisted claim proxy; no subdelegation or repeated floor audit.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; base revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
{contract}

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/base/final revision/verdict, concrete findings, changes, checks and limits. Strict receipt node/ticket/baseRevision/revision/verdict/artifacts absolute/sha256/bytes excluding itself; product author also supplies productFiles, clean final commit and source custody. No self-close or owner acceptance. Root proxies restricted board writes. Keep active-author partial outputs unsealed until explicitly final.
'''
 (P/(node+'.md')).write_text(packet)
 run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
 commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
 prepared.append((node,seat,ticket,commit))
# Both freezes precede the product Git lease. Dispatch the disjoint light worker first.
for node,seat,ticket,commit in reversed(prepared):
 product=node=='GUIDE_QUALITY_FIX'
 dispatch(node,seat,commit,product,revision,git_scope=write_paths if product else None,heavy_scope='bounded synthetic answer/context/UI regression and affected final verification; no live traffic' if product else None)
 board('claim',ticket,'--ttl','10800')
 marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; base='+revision+'; exact scoped packet, no user acceptance.'
 board('comment',ticket,marker,'--author','Astra')
 t=read(D/'board-ids.json')['tickets'][node];shown=__import__('json').loads(board('show',t,'--json'));assert shown['task']['status']=='running';assert any(c['body']==marker for c in shown['comments'])
c=read(E/'COORDINATOR-CURRENT.json');c.update({'at':now(),'active':[p[0] for p in prepared],'seat':[p[1] for p in prepared],'ticket':[p[2] for p in prepared],'heavyLease':'GUIDE_QUALITY_FIX','gitLease':'GUIDE_QUALITY_FIX','activeAuthorOutputsSealed':False,'next':['consume product quality fix and disjoint capture preparation','separate Sol review of product delta','grant capture controls and final binding using reviewed affected coverage','real preview verification and owner walkthrough']});write(E/'COORDINATOR-CURRENT.json',c)
print(__import__('json').dumps({'prepared':[dict(node=n,seat=s,ticket=t,freeze=f) for n,s,t,f in prepared]}))

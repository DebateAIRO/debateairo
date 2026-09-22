"""Two compatible read-only original-session investigations; no live continuation."""
import runpy,json,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
mode=sys.argv[1];assert mode in ['review','feasibility']
node='GUIDE_CONTINUATION_REVIEW39' if mode=='review' else 'GUIDE_CONTINUATION_FEASIBILITY39'
seat='/root/baseline' if mode=='review' else '/root/requirements'
revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
decision=D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921-DRAFT.md'
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',decision,E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE31','GUIDE_CAPTURE_FIX38','GUIDE_CAPTURE_REVIEW38']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(L/p for p in ['apps/ui/components/support/Assistant.tsx','apps/ui/components/support/SupportWidget.tsx','apps/ui/components/support/http.ts','apps/ui/app/help/page.tsx','apps/ui/app/globals.css'])
files.extend(sorted((L/'apps/api/src/support').glob('*.ts')))
files=list(dict.fromkeys(files));ticket=create(node,'review bounded same-product proof continuation' if mode=='review' else 'check existing UI session continuity for remaining fixed cases','GUIDE_LIVE31',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
work_review='''Diagnose only LIVE31 row47's footerless screenshot failure. Visually inspect its actual top PNG against the exact current API text and safe diagnostic geometry. Determine whether the entire current short refusal is demonstrably painted in the original pane, with no expected sources/actions, and whether the original focused plan's short-answer screenshot requirement is met despite the helper failure. Do not invent missing footer or expanded images, dismiss a real UI defect, or infer visibility from API200. Preserve nine fully captured prior rows and the tenth actual response without selective omission. Product0d34 and KB7ef match across them.

Review the root draft as an evidence-preserving affected-scope continuation, not a passing live run. The failed attempt stays failed; all ten current-product responses must enter the final independent quality review and no old-product or LIVE30 samples may enter. Decide whether the single actual row47 image is sufficient, or a disclosed deterministic-only recapture is required. No new model sample for any completed case. Confirm the remaining fixed21 membership, exact surfaces/languages and all20 menu families plus owner regressions are preserved. Assess the proposed terminal full-RO43 placement after compact-RO54 and Help navigation at the contract level; original requirements is independently investigating actual UI/session feasibility.

Specify the smallest footerless correction and meaningful inert controls: absence is valid only when API expectations have no sources/actions; missing expected controls remains a failure; current body end must be painted in the normal pane; long replies still need real top/end plus separately labeled complete evidence; failure geometry and restoration remain strict. Review the amended capacity accounting and honest two-segment final claims. Do not implement, run browser or repeat completed product/code audits. Return PASS_AFFECTED_SCOPE_CONTINUATION_PLAN or bounded REWORK, plus explicit row47 evidence disposition and exact remaining validation obligations. A PASS is not operational authorization; final source feasibility, implementation, separate review and fresh gate remain required.'''
work_feasibility='''Investigate only the proposed remaining three-session grouping in the root draft, using current production UI/http code and the existing capture/controller source. Do not inspect any browser profile or private state. LIVE31 context was closed and its profile removed by the reviewed finally; do not claim its old sessions are recoverable.

Determine whether compact Romanian cases10,18,26,34,56,58,54 followed by the existing real Help navigation can reach full Romanian43 in the SAME newly created session, with the injection case terminal and no extra createSession. If row47 needs a deterministic-only recapture, determine whether full47 immediately before43 uses that same session. Trace actual storage-key lifecycle, language scope, mounted full/compact components, navigation event handler, consent state, route transitions and server session acceptance through source. Identify only public code anchors, never credential or capability values. Verify no test-only product change or hidden profile manipulation is needed. Two independent remaining English groups stay as originally planned.

Return a precise implementable controller transition and the smallest zero-forwarded-Support control that proves it with actual UI behavior, or a concrete reason it is impossible. If static source alone is insufficient, qualify that gap and specify the finite intercepted-I/O control needed; do not execute it. Calculate planning-only remaining request/model/session requirements from immutable measured counters and the fixed case list, preserving6 owner messages and2 naturally available sessions. No new status or capacity read. Do not audit unrelated code or redesign the product. Return FEASIBLE_PENDING_INERT_TRANSITION_PROOF or exact finite blocker/alternative. This investigation does not authorize continuation or accept the checkpoint.'''
packet=f'''# PACKET {node} — bounded continuation evidence and session feasibility

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and relevant review/debugging skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; proposal: {decision}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness, decision draft or old evidence edits; heavy execution; browser, HTTP, process, runtime, status, capacity, DB, Support or model traffic; private values/logs/profile contents; owner questions and acceptance.
- verification: static current source and sealed public evidence only; no operational continuation.

## 3. Work
{work_review if mode=='review' else work_feasibility}

Coordinate only through root. Scope ownership is disjoint from the other original Sol reviewer. Runtime9 current custody is unproven after failure. Startup allowance exhausted. No CP1 ready, complete or accepted; Forgot unresolved; no CP2. Preserve failed-attempt provenance and missing evidence honestly.

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
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; read-only continuation '+mode+' only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision,'seat':seat}))

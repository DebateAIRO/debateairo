"""Prepare independent review only after a sealed successful final actual capture."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')))
globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_ACTUAL_REVIEW24';seat='/root/baseline';revision=receipt_revision(read(E/'GUIDE_FINANCIAL_FALLBACK_FIX2-receipt.json'));clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md']
for parent in ['GUIDE_LIVE31','GUIDE_CONTINUATION_REVIEW39','GUIDE_FOOTERLESS_REVIEW39','GUIDE_LIVE34','GUIDE_UI_WRITER_FIX45','GUIDE_UI_WRITER_REVIEW45','GUIDE_FINANCIAL_FALLBACK_REVIEW2','GUIDE_ACCOUNT_RANKING_REVIEW','GUIDE_SIGNIN_CLASSIFIER_REVIEW','GUIDE_QUALITY_REVIEW2','GUIDE_CORRECTNESS9','GUIDE_SECURITY9']:
 rp=E/(parent+'-receipt.json');r=read(rp)
 assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_LIVE31' or r['verdict'].startswith('PASS'),(parent,r['verdict'])
 if parent in ['GUIDE_LIVE34','GUIDE_UI_WRITER_FIX45','GUIDE_UI_WRITER_REVIEW45','GUIDE_FINANCIAL_FALLBACK_REVIEW2']:assert receipt_revision(r)==revision
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
for name in ['GUIDE_LIVE_GUIDE23-actual-receipt.json','GUIDE_LIVE_GUIDE24-actual-receipt.json','GUIDE_LIVE34-composed31-manifest.json','GUIDE_LIVE25-owner-testability.json']:
 p=E/name;assert p.is_file();files.append(p)
files=list(dict.fromkeys(files));ticket=create(node,'review all31 same-product actual cases across two disclosed segments','GUIDE_LIVE34',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — independent final actual answer review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no repeated board failures or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean read-only revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, harness or prior evidence edits; runtime or browser activity, HTTP, status, capacity, DB, Support or model traffic; private data or logs; owner questions or acceptance.
- verification: static independent review of composed31 actual evidence and current public KB only. No heavy lease, broad rerun or repeated product audit.

## 3. Work
Review all31 preselected unique actual cases under the adopted same-revision continuation decision: ALL10 immutable LIVE31 replies plus exactly21 new LIVE34 replies. Verify exact receipt/artifact/revision/KB bindings and canonical membership in the composed manifest. No LIVE30 or older-product sample, omitted unfavorable response or completed-case resampling. LIVE31 remains FAILED_CAPTURE_ROW47_NO_RETRY. Your REVIEW39 accepted its row47 actual complete short footerless top image; retain that disposition without pretending missing images exist. Other original and new screenshots must meet their reviewed contracts. Report31 requests across two segments, not a single successful continuous31 run. Fresh58 logical proof is separate from actual traffic; no live54/58 claim.

Assess useful, truthful and understandable public guidance for all20 menu families and the exact four owner prompts, both broad-guide rows, all8 affected cases and both actual Help navigation outcomes. Explain whether users can freely type and find reviewed app menus, real prerequisites, actions and limitations, including Dialectical-Engine and account access. Distinguish public guidance from private data access. Compare actual content with the reviewed menu inventory and public KB; identify a concrete omission without reopening unchanged technical or editorial audits. Accepted model drafts, reviewed fallback replies and deterministic outcomes need distinct counts and quality conclusions.

Inspect the actual original-pane start/end and separately labeled expanded complete images for each answer as required by its body/footer contract, retaining your accepted single-image row47 exception. Distinguish BODY_END from SOURCE_ACTION_FOOTER. Confirm each shows the current reply, legible text, reachable controls/citations and preserved full/compact EN/RO design. Expanded evidence alone cannot prove the real pane is usable. The old long-reply fixture remains historical supporting evidence only. Check private-data and injection refusals, recovery behavior, and real pointer/keyboard navigation using actual final artifacts. Forgot remains unresolved/actionless: no guessed link or recovery success claim.

Retain prior consumed correctness/security and final code/metadata/classifier/ranking review where defining bytes are unchanged. Distinguish the composed34-suite provenance and affected passing frames from a fresh monolithic run. Keep the inherited76 type diagnostics and structural rubric PENDING qualified. No extra model sample or favorable retry. If a material defect appears, return precise source/case evidence and the smallest correction, preserving current failed evidence.

Review the finite GUIDE_LIVE25 owner-testability artifact as an exposed-UI walkthrough: at most6 messages across2 naturally available sessions, including language/session changes. It must be usable from the owner's existing Help tab without DevTools, hidden profiles, storage manipulation, capability values or an invented reset control. Assess exact prompts and steps using observed evidence. Later single fresh owner-capacity verification remains required; historical help200 or calculated expiry does not establish current availability.

Return PASS_COMPOSED31_PUBLIC_GUIDE or finite REWORK with31 per-case dispositions, image/navigation evidence, outcome counts and the exact approved short walkthrough. Strongest later handoff is WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED. No CP1 ready, complete, accepted or CP2. Preserve the initial source-custody gap and historical failures.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, exact actual scope/counts, case dispositions and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,False,revision)
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; independent composed31 two-segment review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

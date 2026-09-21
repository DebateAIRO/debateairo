"""Review the shared full/compact language-selector correction against actual producers."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_REVIEW16';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json',P/'GUIDE_HARNESS_BIND16.md']
for parent in ['GUIDE_HARNESS_BIND15','GUIDE_HARNESS_REVIEW15','GUIDE_PROBE_CHECKPOINT_FIX','GUIDE_PROBE_CHECKPOINT_REVIEW','GUIDE_COMPACT_UI_PROBE5','GUIDE_HARNESS_BIND16']:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent=='GUIDE_HARNESS_BIND16':assert r['verdict'].startswith('PASS') and receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — actual full/compact language selection review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/harness or prior evidence edits; heavy commands or browser/runtime/HTTP/Support/model/status/capacity/DB activity; private data/logs; owner questions/acceptance.
- verification: finite source/producer/delta and sealed evidence review, no broad rerun.

## 3. Work
Review the shared selector flaw and BIND16 correction. PROBE5 recorded fullEN/fullRO PASS, compactRO READY then an unclassified outer failure; exact lost exception is unavailable. READY checkpoint precedes selectLanguage and return to the caller's private-control check, so private-assert entry is unproved. Both BIND15 probe/capture used full-only language-control scope for compact. Confirm actual current JSX hierarchy and every call site establish the flaw and correction; do not claim retrospective runtime exception proof from static code alone.

Verify the minimal shared adapter correctly scopes full and compact locale controls, preserves already-selected state, changes once at planned boundaries and verifies resulting locale. Cover all five ordered transitions with actual producer-bound fixtures exercising the real imported adapter, including old-selector failure on compact, full remount, missing/duplicate/wrong-locale negatives. Reject a copied selector mirror or inert assumptions that disagree with actual DOM. Check the live capture uses exactly the corrected shared implementation. Mode handler readiness, transition-idle restore, compact one-click expansion, no silent session/transcript reset, no-Support abort guard and private-control checks must remain intact.

Review fixed post-READY stage records for cookie settling, locale selection, private-control assertion and transition completion. Later failures must retain surface/language/stage without raw DOM or arbitrary exception export. Preserve the real checkpoint writer/initial exclusivity/update/failure persistence and its regression, inspect lexical/import dependencies and cleanup in the final probe, and ensure relocation did not revive the missing constant error.

Confirm prior130 controls are an exact retained prefix plus meaningful new cases, correct derived counts and actual new ordered-eight/import binding, matrix54/adapter3, FINAL9/strict44/exact34 suites/current152 unchanged, all API-DOM/source/action/outcome/privacy/credential/pacing/capacity/navigation/session invariants retained. BIND16/GUIDE16 output binding must be internally coherent with gate/README/receipt/manifest and future outputs absent. No broad technical/product re-review for unchanged product bytes.

Independently check every exact PROBE6 argv field against actual guard and producer contract, positive plus stale-name/wrong-root/extra/malformed negatives, installed pinned executable, validated evidence destination and unique absent output/log. New capture and probe share behavior, and the checkpoint is executable rather than syntax-only. A later independent one-shot PROBE6 and fresh-capacity full54 remain mandatory; inert PASS is not live quality or testability. Return finite PASS or precise source-anchored REWORK. Forgot unresolved/actionless; CP1 incomplete; CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, minimal delta/actual-producer proof/new binding/limits, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

"""Route the post-ready language-selector contract, retaining the live harness."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND16';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409'
assert read(E/'GUIDE_COMPACT_UI_PROBE5-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_COMPACT_UI_PROBE5-receipt.json')
ticket=create(node,'correct source-proved compact language scope in both harness adapters','GUIDE_COMPACT_UI_PROBE5',seat)
review=create('GUIDE_HARNESS_REVIEW16','review shared producer-bound full and compact language selection',node,'/root/baseline')
probe=create('GUIDE_COMPACT_UI_PROBE6','verify corrected probe across all five actual transitions','GUIDE_HARNESS_REVIEW16',seat)
ids=read(D/'board-ids.json');board('link',probe,ids['tickets']['GUIDE_LIVE8']);ids['edges'].append(['GUIDE_COMPACT_UI_PROBE6','GUIDE_LIVE8']);write(D/'board-ids.json',ids)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_HARNESS_BIND15','GUIDE_HARNESS_REVIEW15','GUIDE_PROBE_CHECKPOINT_FIX','GUIDE_PROBE_CHECKPOINT_REVIEW','GUIDE_COMPACT_UI_PROBE5']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — exact compact language-selector contract

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained author/debugging/verification BODY skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND16/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git or prior harness/evidence mutation; browser/runtime/HTTP/Support/model/status/capacity/DB activity; private data/logs; unrelated harness changes or unplanned namespace changes; owner questions/acceptance.
- verification: sole heavy for bounded source diagnosis, selector regressions and one composed retained130-plus-new control proof; no broad product tests/evaluation.

## 3. Work
PROBE5 persisted fullEN and fullRO PASS, then compactRO BEFORE/AFTER/READY with visible composer and expanded panel. No compact private-control completion/transition result was persisted; outer failure is UNCLASSIFIED. The precise lost exception is unavailable. The shared opening helper calls selectLanguage AFTER checkpoint READY and BEFORE returning to assertNoPrivateControls, so the latter cannot be assumed entered. Probe setLanguage currently scopes active/button lookup to `.supportDesk .supportLanguage` even when surface=compact. Establish the actual compact producer hierarchy and intended locale/session semantics from current product sources and compare the live capture adapter. Distinguish a source-proved selector flaw from retrospective attribution of the unavailable runtime exception.

Source inspection also shows the actual BIND15 capture setLanguage and waitForLanguage use the same full-only scope (capture lines136–166, callsite276). This makes both adapters part of the bounded correction. Establish the actual producer mismatch, then copy BIND15 harness and row-proof adapter into new BIND16/ROW_PROOF_BIND16 namespaces and apply the smallest shared full/compact locale-selection correction in both probe and capture. Port the separately reviewed CHECKPOINT_FIX writer into the new probe without regressing its runtime dependencies. Scope locale controls to the intended root, preserve an already-selected locale without unnecessary action and verify the requested locale after a planned change. Check every five-transition call site against actual producer hierarchy, including full remount and both compact languages. Preserve exact session/reset boundaries and no-Support guard. Do not edit product or prior harness/evidence.

Add fixed post-ready stage discrimination for cookie settling, locale selection, private-control check and transition completion so a later failure does not lose surface/language/stage. Keep phase/error/count/enum projection only; no raw DOM, private content or arbitrary exception export. Preserve all checkpoint semantics, guards, readiness, public mode toggles, compact single expansion, cleanup, oracles and existing code behavior outside the proved selector/setup issue.

Exercise the ACTUAL shared locale-selection adapter with actual-product-bound full/compact DOM fixtures or an equivalent meaningful bounded inert test. Prove the old full-only selector fails the compact case; fixed fullEN/fullRO/compactRO/fullEN-remount/compactEN branches succeed and same-locale state is untouched. A duplicate mirror of the new selector is not sufficient. Include negatives for absent/duplicate/wrong-locale controls and fixed post-ready failure-stage recording; preserve the actual checkpoint regression. Verify exact future PROBE6 argv plus four invalid cases and syntax. Retain all130 control purposes as an exact prefix, matrix54 and adapter3 negatives, current FINAL9/strict44/exact34 suite receipts, unchanged product/KB, API-DOM/source/action/outcome/privacy/credential/pacing/capacity/navigation/session rules. Generate one new composed control proof with meaningful new cases, exact ordered-eight digest, producer/helper import binding and correctly derived control counts; do not repeat the copied count/order mistakes. Rebind only unused actual GUIDE_LIVE_GUIDE16 namespace and new ROW_PROOF_BIND16 adapter, with all future outputs absent. No browser diagnostic or actual five-transition/full54 run in this author node. Root will use standard BIND16 control-proof/receipt bindings for LIVE8.

Publish probe-contract.json in the new directory, with the same structure as CHECKPOINT_FIX contract, binding actual script path/hash/bytes, cwd, argv, final revision, {E}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE6.json (new), direct log {O}/logs/GUIDE_UI_TRANSITION_PROBE6-LIVE8.log (new), exact argument-guard results and executed=false. Verify output/log absent. Bind the BIND16 probe script and corrected shared adapter consistently in the new README, gate/control proof, receipt and future-output manifest. Independent review and one later PROBE6 are required before LIVE8. Preserve all prior failures and unavailable historical causes.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, proved scope versus unknown historical exception, minimal shared delta/producer-bound regression/exact new bindings, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close/readiness/acceptance. Forgot unresolved/actionless; CP1 incomplete, CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='bounded actual producer/adapter language-scope correction and composed inert controls; no runtime or product/Git')

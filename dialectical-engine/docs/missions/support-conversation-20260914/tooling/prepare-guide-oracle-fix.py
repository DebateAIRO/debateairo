"""Route only a separately justified broad-guide oracle correction."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND17';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409'
rp=E/'GUIDE_ORACLE_REVIEW17-receipt.json'
assert read(E/'GUIDE_ORACLE_REVIEW17-consumption.json')['receipt']['sha256']==sha(rp)
assert read(rp)['verdict']=='PASS_JUSTIFIED_BOUNDED_ORACLE_CORRECTION'
ticket=create(node,'correct broad-guide oracle and bind affected whole-group verification','GUIDE_ORACLE_REVIEW17',seat)
create('GUIDE_HARNESS_REVIEW17','review oracle correction and exact retained15 plus fresh39 coverage',node,'/root/baseline')
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-AFFECTED-LIVE-VERIFICATION-20260920.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_SOURCE_DIAG','GUIDE_ORACLE_REVIEW17','GUIDE_HARNESS_BIND16','GUIDE_HARNESS_REVIEW16','GUIDE_COMPACT_UI_PROBE6','GUIDE_LIVE8']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — guide source alternatives and affected whole-group verification

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained author/debugging/verification BODY skills. Assigned ticket/comments before work; root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND17/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, KB, Git or prior harness/evidence edits; browser, runtime, HTTP, Support, model, status, capacity or DB activity; private data/logs; unrelated harness changes or generic skip/retry features; owner questions/acceptance.
- verification: sole heavy for focused real-oracle regression and one composed retained136-plus-new inert control proof. No product suites, evaluation or browser re-probe for unchanged code.

## 3. Work
The consumed independent GUIDE_SOURCE_DIAG and GUIDE_ORACLE_REVIEW17 determine the exact source-oracle correction scope. Read both before implementation; do not exceed the review's allowed source scope. The separate root decision {D}/decisions/GUIDE-AFFECTED-LIVE-VERIFICATION-20260920.md supersedes prior mission-authored requirements for a single new54 run, including the review packet's future-run assumption, ONLY if complete unchanged groups can be independently retained. This is an execution-plan adjustment under the owner's instruction to rerun affected checks, not a change to product or acceptance criteria. LIVE8 remains a failed20-of54 capture with21 sends, not retrospectively successful. No product defect or product edit is established.

Create append-only BIND17 and ROW_PROOF_BIND17 from sealed BIND16. For BOTH existing bilingual broad guide rows, allow the separately justified source alternatives app-navigation, guide-how-it-works and debate-workspace-menus. Preserve all54 canonical prompts, identifiers/order, surfaces/locales, canonical groups1/14/13/12/14 and42 model-call ceiling. Do not add a favorable actual prompt or remove difficult cases. Add meaningful inert narrower already-open-debate How-it-works controls, grounded in actual product context, that require appropriate Guide/workspace authority and reject app-navigation and unrelated sources. Preserve empty/duplicate/proof-external source, unsafe action, generic/unhelpful answer, API-DOM equality and privacy controls. Distinguish generic Compact Help, which exists on the library, from the named debate-local How-it-works control. Do not manufacture a broad new text heuristic to fit the retained public answer; fulfill exact reviewed quality requirements with a discriminating control and report any unsupported requirement before broadening scope.

Before implementing capture changes, prove complete-group retention from sealed LIVE8 evidence. Only groups1 and2 with1+14 completed rows may be retained; the5 partial compactRO rows are NOT retained for completion. Record exact public input, output/source/action/outcome equality, diagnostic and screenshot/hash bindings for each retained row, plus unchanged product/KB/model/oracle/browser/session defining code. Both broad guide rows must be in the fresh set. Prove that the model receives no cross-message history and that fresh group boundaries safely reset the session as originally intended. If a dependency makes retention invalid, stop that path and report the exact reason; do not weaken it. A full54 after natural capacity is the fallback.

If retention is proved, implement one CLOSED fixed plan for fresh groups3 through5 (13+12+14=39 requests,3 sessions) with canonical order and complete per-group behavior. No configurable arbitrary selector, generic resume or favorable retry. Continue to prove all54 logical rows before traffic; the future actual receipt identifies15 retained plus39 fresh with separate provenance, never54 freshly executed. Fresh capture starts new sessions and reruns the entire partial third group. Require measured daily headroom at least39 for the exact39 actual requests and retain all other normal limits, pacing, injection placement, no-private-controls, navigation and cleanup. Bind the fixed plan and retained evidence into the control-proof identity without widening the exact18-key external gate. Add meaningful negatives for omitted/duplicated/cross-boundary rows, altered retained evidence, incorrect fresh39 count, stale revision/source binding and insufficient capacity. Preserve the existing full54 canonical schedule validation. Review must approve the exact set, dependency boundary and accounting before actual execution.

Show RED using the OLD actual oracle on the sealed public broad answer/source projection before changing the new copy. Then exercise the REAL corrected imported verifier for both broad EN/RO alternatives and narrower positives/negatives. A duplicated predicate or preassigned PASS is insufficient. Retain all136 previous control purposes in order as an exact prefix and append focused new cases; derive actual counts correctly. Run the composed proof once after focused controls pass and preserve any failure; a repeat requires a concrete correction. Bind exact ordered-eight digest, actual producer/helper imports, matrix54, adapter3 negatives, FINAL9 inventory, strict44KB and existing34-suite evidence at unchanged152. No rerun of unchanged product suites.

Rebind only the unused GUIDE_LIVE_GUIDE17 actual namespace and new row-proof adapter; all future actual outputs must be absent. GUIDE16 failed outputs are immutable. Keep the proven BIND16 capture/browser helpers behavior unchanged: hydration gate, mode transition settling, compact one-click opening, scoped language controls, fixed stages, checkpoint writer, no-private-controls, session/reset boundaries, navigation, pacing, closed source/action/outcome validation. Mechanically compare defining helper code, allowing only necessary namespace/path binding changes, and retain PROBE6 actual five-transition evidence explicitly. Capture scheduling/accounting changes are limited to the fixed reviewed whole-group plan above. Do not execute a new browser probe or invent a new probe contract solely because oracle binding changed. Existing PROBE6 output is retained evidence, not a future output. Review must confirm this retention before the next actual run.

Preserve exact18-key gate contract and fresh-measurement limits, normal runtime model and data isolation. Seal one coherent new receipt, control proof, README, retention manifest and future-output manifest. Initial70 daily headroom minusLIVE8's21 sends leaves49 conservatively; no fresh availability claim or new read. Later execution requires fresh complete capacity for the exact authorized plan and independent review. Final coverage of all54, product review and naturally available manual capacity remain required. Forgot unresolved/actionless; CP1 incomplete, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact minimal delta, real-oracle RED/GREEN and counts, complete-group retention/fixed-plan proof, retained browser binding/PROBE6 evidence, output absence and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close, readiness or acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='bounded real-oracle and fixed whole-group plan RED/GREEN; one composed retained136-plus-new inert proof; no product/Git/runtime')

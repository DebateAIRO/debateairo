"""Route a fixed-step UI discriminator before any further readiness correction."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND15';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409'
ticket=create(node,'diagnose actual readiness interaction and correct proved harness cause','GUIDE_COMPACT_UI_PROBE3',seat)
review=create('GUIDE_HARNESS_REVIEW15','review evidence-based readiness interaction correction',node,'/root/baseline')
probe=create('GUIDE_COMPACT_UI_PROBE4','verify five browser transitions after interaction correction','GUIDE_HARNESS_REVIEW15',seat)
ids=read(D/'board-ids.json');board('link',probe,ids['tickets']['GUIDE_LIVE8']);ids['edges'].append(['GUIDE_COMPACT_UI_PROBE4','GUIDE_LIVE8']);write(D/'board-ids.json',ids)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json',D/'decisions/GUIDE_HARNESS_BIND14-scope-clarification.md']
for parent in ['GUIDE_HARNESS_BIND14','GUIDE_HARNESS_REVIEW13','GUIDE_HARNESS_REVIEW14','GUIDE_COMPACT_UI_PROBE3','GUIDE_RUNTIME6']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — identify the failed real interaction before correction

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained debugging, author and verification BODY skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/GUIDE_HARNESS_BIND15/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND15/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new); one fresh temporary public diagnostic browser profile.
- forbidden: product, KB, Git or prior evidence/harness mutation; actual Support requests reaching runtime, DB/model/status/capacity reads; private records, logs or capabilities; credentials/account actions; actual GUIDE15 output; service restart/kill/configuration; owner questions/acceptance.
- verification: sole heavy for bounded source diagnosis, at most one instrumented public UI diagnostic with all Support APIs aborted, then inert correction controls. No Git or product lease, no broad suites, no full54 or repeated five-transition probe.

## 3. Work
PROBE3 has a valid executable argv, but its first fullEN transition failed GUIDE_HARNESS_FULL_LANGUAGE_INTERACTION_TIMEOUT, child1, zero completed transitions. Public fixed observation: one visible composer, two visible language controls/EN active, one visible mode toggle/TERRACOTTA, HELP, cookie region VISIBLE. Guard status1/pageCaseListRead1, other/create/send0, forwarded0. Current shared catch maps activation, mode wait/restore and language errors to the same code; the exact failing step and cause remain unknown. Do not declare a product bug, cookie interception or hydration race from this aggregate.

Read actual control producer and both browser adapters. Establish the minimal discriminator for the exact interaction chain and preserve meaningful distinctions: preconditions, first mode activation/expected state, restore activation/expected state, optional genuine locale change, final verification. If source alone cannot establish cause, use one new instrumented fresh-browser fullEN opening under the unchanged exact no-Support route guard. Validate current owned RUNTIME6 identity and ordinary TLS first; preserve all unrelated listeners and private log. Instrument fixed phase/boolean/count/enum state and bounded error classification, never arbitrary exception messages, raw DOM/headers/URLs or private values. Public hit-test/actionability and hydration-presence booleans may distinguish obstruction, handler readiness, stale target or state expectation; private React shape is diagnostic only, not sufficient user-facing readiness proof. Keep the original call order until the first failure is observed. Do not force clicks, extend timeouts, ignore failed steps or repeatedly sample for a pass.

After preserving the first exact failure, this same diagnostic browser may perform at most one discriminating reversible PUBLIC UI action against the specific evidence-backed hypothesis (including Essential only cookie choice in this isolated fresh profile if relevant), then observe the targeted condition once. Record both before and after with no overwrite. No questions, sessions or model traffic. This is diagnostic evidence, not the independent five-transition pass. If unavailable evidence or a product defect is needed, return the exact blocker without changing product. Close only this owned diagnostic browser, preserve numeric child status, verify healthy existing stack and release lifecycle use before inert work.

Only after establishing a harness cause, copy unchanged BIND14/adapter to BIND15 and correct that minimal opening/interaction setup contract. Preserve hydration-before-one-click compact behavior, usable full public interaction, nonempty session/transcript preservation, exact five capture groups and session boundaries, all127 control purposes, matrix54/row proof, FINAL9/exact34 suites, source/action/outcome/API-DOM/credential/privacy rules, traffic guard, pacing/capacity/navigation. Add meaningful regressions grounded in the observed failing step, with fixed step-specific failures so any later issue is actionable. The same corrected opening logic must be bound in capture and probe. Preserve original failed artifacts and unknown historical LIVE7 cause.

Bind unused actual GUIDE_LIVE_GUIDE15 namespace and PROBE4 output `{E}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE4.json` (new), direct log `{O}/logs/GUIDE_UI_TRANSITION_PROBE4-LIVE8.log` (new). Test the EXACT documented probe argv against the actual extracted executable guard, including rejected old PROBE2 name, wrong root, extras and malformed revision, without launching a browser. Verify future outputs absent, exact ordered-eight digest, retained/new control counts, matrix54 and adapter3 negatives. Separate REVIEW15 and later one-shot PROBE4 are mandatory before actual capture. Do not execute PROBE4 or actual GUIDE15 here. No quota read; natural-capacity calculation remains historical only.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, observed exact step versus established cause, minimal change and discriminating evidence, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself/private ongoing logs. Release heavy; no self-close/readiness/acceptance. Forgot unresolved/actionless, CP1 incomplete, CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='one bounded fixed-phase public UI diagnostic with all Support blocked then inert correction controls; no product/Git/capacity/model')

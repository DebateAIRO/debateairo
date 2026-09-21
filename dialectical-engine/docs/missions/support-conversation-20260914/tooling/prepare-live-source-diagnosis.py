"""Independent bounded diagnosis of the actual guide answer/source mismatch."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_SOURCE_DIAG';seat='/root/requirements';revision='152eed4da1cd3e66b74d8301159ba76427552409'
assert read(E/'GUIDE_LIVE8-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_LIVE8-receipt.json')
ticket=create(node,'independently diagnose actual guide primary-source mismatch','GUIDE_LIVE8',seat)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_HARNESS_BIND16','GUIDE_HARNESS_REVIEW16','GUIDE_COMPACT_UI_PROBE6','GUIDE_LIVE8']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — independent actual guide-source diagnosis

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained debugging and verification BODY skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new, bounded inert diagnostic only); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/KB/Git/harness/prior evidence edits; browser/runtime/HTTP/Support/model/status/capacity/DB activity; private records/logs/rejected drafts; new actual samples or favorable retries; quota mutations; owner questions/acceptance.
- verification: sole heavy for bounded offline actual-validator/retrieval/oracle discriminator only if needed. No broad test suites or full audit; no implementation fix in this node.

## 3. Work
Actual LIVE8/GUIDE16 stopped on its first failure after21 attempts/20 completed,3 sessions/21 sends. Canonical26 is GUIDE_FAMILY guide compactRO MODEL. Observed HTTP200/ANSWER_GROUNDED with valid shapes and exact API/DOM equality, ACCEPTED_DRAFT, sourceIDs only app-navigation, actionIDs empty; expected primary source missing at DIAGNOSTIC_PROJECTED. The preceding20 passed their row oracles; do not combine them with another run. Browser preflight6 passed all5 transitions. This is a source-contract mismatch, not a transport/hydration failure.

Independently inspect exact canonical question, required-source oracle/spec, accepted public answer if retained, reviewed public KB records, deterministic retrieval/topic resolution, allowed-source/model contract and actual post-model validation. Public accepted answer/evidence is allowed; private content/rejected drafts/ongoing logs are not. If exact accepted text was not retained, state that limitation and do not reconstruct it. Establish whether this is a product retrieval/validation defect, an over-constrained or incorrect oracle, or another proved mismatch. Do not assume the oracle is right, weaken it to fit the sample, or treat generic source membership as sufficient semantic guidance without evidence. User goal is useful free-form app-menu help in both languages, not a passing source-ID check alone.

Use a minimal offline discriminator with actual code and the sealed public question/source metadata if static source cannot decide. No new model call or live request. Compare intended Guide feature/menu knowledge with app-navigation coverage and question intent, required prerequisites and declared navigation behavior. Check neighboring EN/RO forms and any exact source-intent alias gap only as needed to bound scope; avoid broad corpus churn. Distinguish observed accepted-draft behavior, provable code contract, inferred cause and unavailable evidence. Preserve normal model selection, data isolation, injection/credential/account-operation boundaries and all actual traffic/counter evidence.

Return a precise source-anchored diagnosis plus smallest justified correction scope and meaningful regression/verification requirements. If product correction is needed, name exact product files and runtime paths for a separate author/reviewer. If oracle correction is justified, explain the existing reviewed knowledge/spec basis and preserve meaningful source/answer quality requirements, with a discriminating negative. If evidence is insufficient, state the exact missing public discriminator without another sample. No implementation or new capture here.

Initial fresh capacity had70 daily message headroom;21 sends leave a conservative49, below a fresh54. That arithmetic is not a fresh measurement; rolling-history expiry remains unknown unless sealed timestamps establish it. Do not read capacity or propose quota bypass. Root will handle natural-availability planning separately. Forgot unresolved/actionless; CP1 incomplete; CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, observed versus proved findings, exact source anchors/minimal scope/discriminator/limits, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='independent bounded offline actual question/retrieval/validator/oracle diagnosis; no runtime or product/Git')

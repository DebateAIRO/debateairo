"""Independently assess the sealed source-oracle diagnosis before authoring."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_ORACLE_REVIEW17';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409'
assert read(E/'GUIDE_SOURCE_DIAG-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_SOURCE_DIAG-receipt.json')
ticket=create(node,'assess broad guide source requirement before bounded oracle correction','GUIDE_SOURCE_DIAG',seat)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_SOURCE_DIAG','GUIDE_LIVE8','GUIDE_HARNESS_BIND16','GUIDE_HARNESS_REVIEW16','GUIDE_COMPACT_UI_PROBE6']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — semantic source requirement review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Assigned ticket/comments before work; root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, KB, Git, harness or prior evidence edits; heavy tests; browser, runtime, HTTP, Support, model, status, capacity or DB activity; private data/logs; owner questions/acceptance.
- verification: bounded static review of exact public answer, reviewed sources, actual code and sealed discriminator; no broad audit or suite repeat.

## 3. Work
Independently assess GUIDE_SOURCE_DIAG before any test correction. LIVE8 canonical26 asked the broad Romanian question about where to learn how a debate works. Its accepted visible answer cited only app-navigation, which was in actual retrieved model context, while the harness required guide-how-it-works or debate-workspace-menus. The diagnostic attributes this to incomplete primary-source alternatives, not product retrieval or validation. Do not accept that conclusion just because a draft validates or because a new source would make the sample pass.

Read the exact retained public question/answer, bilingual paired row, reviewed public app-navigation projection and Guide/workspace records, menu coverage/spec requirement, real retrieval, source policy and exact harness oracle. Decide whether the guidance is useful and supported for this broad navigation intent, and whether admitting app-navigation is justified for both bilingual rows. Distinguish source membership from answer quality. Check a narrower concrete local-control question still needs its Guide/workspace authority and cannot be satisfied by generic app navigation. Confirm unrelated source, no source and irrelevant answer remain failures through existing or required meaningful controls. No invented new product requirement or superficial exact-text score.

Return PASS_JUSTIFIED_BOUNDED_ORACLE_CORRECTION or precise REWORK. Name exact allowed oracle scope and meaningful regression requirements for the subsequent original preview author. A PASS authorizes only that bounded append-only harness correction, not product edits or retrospective reclassification of LIVE8 as success. Preserve all54 prompts, row count/order,42 model ceiling, actual traffic and failure artifacts, normal model/data/security/credential/rate/spend behavior and unresolved actionless Forgot. Product152 and FINAL9 unchanged. BIND16 browser behavior and PROBE6 can be retained only if their defining bytes/behavior remain unchanged in the later binding; no automatic new browser run for oracle-only changes. A fresh complete actual run and final product/manual evidence remain required.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact source anchors and counterexamples, allowed correction and retained constraints. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close, readiness, acceptance or CP2.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

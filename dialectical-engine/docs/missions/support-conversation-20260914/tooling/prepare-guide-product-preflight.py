"""Review unchanged complete groups while the remaining live verification proceeds."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PRODUCT_PREFLIGHT';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409'
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-AFFECTED-LIVE-VERIFICATION-20260920.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in ['GUIDE_HARNESS_BIND17','GUIDE_HARNESS_REVIEW17','GUIDE_CORRECTNESS9','GUIDE_SECURITY9','GUIDE_LIVE8']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
for parent in ['GUIDE_EDITORIAL','GUIDE_EDITORIAL_RECHECK','GUIDE_ATTEST']:
 rp=E/(parent+'-receipt.json');files.append(rp);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review retained complete public-guide groups while fresh capture proceeds','GUIDE_HARNESS_REVIEW17',seat)
ids=read(D/'board-ids.json');board('link',ticket,ids['tickets']['GUIDE_PRODUCT']);ids['edges'].append([node,'GUIDE_PRODUCT']);write(D/'board-ids.json',ids)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — independent public answer quality for retained15

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain reviewer BODY skills. Assigned ticket/comments before work; root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean read-only revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy commands; browser, runtime, HTTP, Support, model, status, capacity or DB activity; private data/logs; owner questions/acceptance.
- verification: static public answer, screenshot and menu evidence only. LIVE9 holds sole heavy independently. No source audit or suite rerun.

## 3. Work
Your completed REVIEW17 approved the exact15 retained rows and execution boundaries. Do not repeat that harness review. Perform the final product-quality review for those15 complete LIVE8 group1+2 rows now, so the later final review need only evaluate fresh39 and assemble coverage. Retained canonical sequences are1,2,7,11,15,19,23,27,31,35,39,41,47,51,43. LIVE8 stays failed as a run. The five partial group3 rows are outside this node.

For every retained row inspect the actual accepted public API/DOM answer, sources, actions and origin and corresponding screenshot. Assess useful/truthful guidance, correct language, supported menu locations/prerequisites and usable existing full Help design. Compare the relevant reviewed public KB/menu records and actual public UI source only when needed to resolve a concrete claim; do not infer quality from source-ID membership alone. Distinguish accepted drafts, reviewed fallbacks and deterministic private refusal, injection refusal and recovery replies. Review relevant menu inventory mappings and retain editorial/technical dispositions by exact unchanged defining bytes. Do not infer actual private data access from a general explanation of a menu. Check refusal scope and public action safety without a new request.

Write {E}/{node}-case-dispositions.json (new) with exact15 case identities, original evidence/source hashes and finite PASS or concrete REWORK per case. Record screenshot scope, public source anchors and any actual gap. If a blocking answer/layout issue is found, notify root immediately while continuing finite evidence packaging; do not stop another agent or sample another answer. No favorable replacement, model call or whole-app audit. Preserve the initial source-custody gap, inherited76 type errors and eval rubric PENDING as qualified existing limitations.

Return PASS_RETAINED15_PRODUCT_SCOPE or precise REWORK, limited to these15 cases. Fresh39, total54 composition, actual navigation and the final owner script/current capacity are separate later gates. No overall preview readiness or CP1 completion. Forgot remains unresolved/actionless; no recovery-link claim, CP2 or owner acceptance.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact15 dispositions and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close or acceptance; root proxies restricted board writes.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

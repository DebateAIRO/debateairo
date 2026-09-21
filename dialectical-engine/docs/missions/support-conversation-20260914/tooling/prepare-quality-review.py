"""Prepare a bounded independent review only after the product correction is consumed."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_QUALITY_REVIEW';seat='/root/baseline';author='GUIDE_QUALITY_FIX'
rp=E/(author+'-receipt.json');r=read(rp);revision=receipt_revision(r);base=r['baseRevision']
assert r['verdict']=='NEEDS_EDITORIAL_ATTESTATION',r['verdict']
assert read(E/(author+'-consumption.json'))['receipt']['sha256']==sha(rp)
assert not read(O/'logs/agents.json').get('git_slot');clean(revision)
manifest=read(E/'GATE_GUIDE_FINAL10-manifest.json')
# Shape is checked against the actual author artifact in the review; require nonempty bytes here.
assert isinstance(manifest,dict) and manifest
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL9-manifest.json',E/'GATE_GUIDE_FINAL10-manifest.json',E/(author+'-inputs.json')]
for parent in [author,'GUIDE_PRODUCT_PREFLIGHT','GUIDE_CORRECTNESS9','GUIDE_SECURITY9']:
 p=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(p)
 files.extend([p,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(p)['artifacts']))
for parent in ['GUIDE_EDITORIAL','GUIDE_EDITORIAL_RECHECK','GUIDE_ATTEST']:
 p=E/(parent+'-receipt.json');files.append(p);files.extend(Path(a['path']) for a in verify(read(p)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review intermediate code correction and draft bilingual knowledge',author,seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'base':base,'inputs':[rec(p) for p in files],'changedProductPaths':git('diff','--name-only',base,revision,cwd=L).decode().splitlines()})
packet=f'''# PACKET {node} — independent quality and affected-boundary review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded reviewer and verification BODY skills. Assigned ticket comments before work; root claim proxy; no subdelegation or repeated floor audit.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; delta base: {base}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new, only after an exact justified discriminator is agreed).
- forbidden: product, Git, KB or earlier evidence edits; heavy tests initially; browser, runtime, HTTP, model, Support, capacity, status or DB activity; private data/logs; owner questions or acceptance.
- verification: static independent changed-path review, exact author evidence and source anchors. Do not repeat the full34 suites or whole app audit. Request one bounded synthetic discriminator only if it resolves an actual unproved boundary; root assigns the heavy lease separately.

## 3. Work
The author sealed a clean intermediate correction with NEEDS_EDITORIAL_ATTESTATION. The four changed draft article files intentionally leave two corpus/component checks failing until your independent editorial disposition and later mechanical attestation. This is not a final validated publication. Review GPP-R1 through R4 against your original public counterexamples and the actual intermediate delta. Verify the correction addresses the cause rather than merely matching the old answers. Check source/citation completeness for detailed Account guidance, useful public scoring categories with true availability limits, separation of Talk/Escalate case semantics from email, and row-specific source/action authority for destination claims. Preserve valid prose-only explanations and free conversation. Inspect positive and negative paired language cases around the finite same-cause class. Check server enforcement, fallback origin, opaque source/action reference translation and boundaries for credentials, private data, injection, account operations, history and quotas on changed runtime paths. Retain old security/correctness conclusions only where their defining behavior is unchanged; do not infer that a large old test count proves a new validator correct.

Independently editorial-review only the changed EN/RO reviewed knowledge and fallback projections against the concrete public UI/source anchors. Produce {E}/{node}-knowledge-dispositions.json (new) with per-changed-entry source provenance, factual completeness, bilingual parity, limits, and fallback suitability. Retain unchanged editorial entries by defining hashes. This is Sol review, not owner ratification; do not write metadata or mark CP1 accepted. If a separate mechanical attestation publication step is required by actual code, state exact files/hash inputs and do not pretend a review changed runtime publication.

For R5 distinguish the proved product append behavior from the failed screenshot procedure. Review any conditional autoscroll/sentinel change and meaningful render tests: new replies must remain reachable while older-content readers are not forced to the bottom. Capture correction is separate and does not prove UI behavior by itself. Preserve current layout, compact behavior, keyboard access and consent.

Inspect the exact intermediate commit, cumulative nonempty FINAL10 inventory/deletions and affected tests with failure provenance. Explicitly confirm that the two stale-manifest transition failures are limited to awaiting reviewed projection attestation; do not call the new corpus snapshot or structural evaluation passed. Final44-entry snapshot, new KB digest, structural evaluation and final affected tests run after attestation. Name the exact metadata/component paths and reviewed source/projection hashes that may be updated mechanically next. Keep inherited76 type errors and any unchanged eval rubric PENDING qualified. Review the author's proposed retention per case using exact model context/system prompt, source/action policy and relevant outcome defining bytes. Do not retain old live-model evidence merely because an answer was previously safe, and do not demand unrelated repeated samples merely because a whole file changed. The 15-retained39-fresh plan is suspended until affected scope is justified. State which previous actual rows remain useful as historical evidence, which claims can be carried to this final revision, and what new fixed actual and visual coverage is necessary, qualified until final attested corpus inputs exist. Root decides the final execution plan under unchanged owner gates.

Return PASS_CODE_AND_DRAFT_EDITORIAL_PENDING_ATTESTATION or precise REWORK for this intermediate code and draft-knowledge delta and its affected boundary. A PASS authorizes only the specified mechanical source/projection attestation and final verification; it is not final product readiness. No actual preview readiness, full CP1 completion or acceptance. Forgot remains unresolved/actionless, CP2 gated, initial source-custody continuity unverified. Existing failed runs and lost failure evidence remain immutable.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session/ticket/revision/verdict, concrete per-finding and editorial dispositions, evidence/counts and exact unresolved checks. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close or owner acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; static independent review, no heavy.';board('comment',ticket,marker,'--author','Astra')
t=__import__('json').loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(__import__('json').dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

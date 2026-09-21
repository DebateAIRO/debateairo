"""Review the final amended correction and the focused CP1 execution plan."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_QUALITY_REVIEW2';seat='/root/baseline';author='GUIDE_QUALITY_FIX2';rp=E/(author+'-receipt.json');r=read(rp);revision=receipt_revision(r);base=r['baseRevision']
assert read(E/(author+'-consumption.json'))['receipt']['sha256']==sha(rp);assert not read(O/'logs/agents.json').get('git_slot');clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL10-manifest.json',E/'GATE_GUIDE_FINAL11-manifest.json',E/(author+'-inputs.json'),E/(author+'-scope-amendment1.json'),E/(author+'-scope-amendment2.json'),E/'GUIDE_QUALITY_REVIEW-wording-supplement-receipt.json',E/'GUIDE_QUALITY_REVIEW-wording-supplement-consumption.json']
for parent in [author,'GUIDE_QUALITY_REVIEW','GUIDE_CAPTURE_CONTROLS18']:
 p=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(p);files.extend([p,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(p)['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_QUALITY_REVIEW-wording-supplement-receipt.json')['artifacts']));files=list(dict.fromkeys(files));ticket=create(node,'review corrected canonical authority, product identity and final attested knowledge',author,seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'base':base,'inputs':[rec(p) for p in files],'changedProductPaths':git('diff','--name-only',base,revision,cwd=L).decode().splitlines()})
packet=f'''# PACKET {node} — final bounded correction and CP1 execution review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded reviewer and verification BODY skills. Assigned ticket comments before work; root claim proxy; no repeated failed board writes or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; delta base: {base}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new, only a subsequently justified synthetic discriminator).
- forbidden: product, Git, KB, harness or old-evidence changes; heavy commands initially; browser, runtime, HTTP, Support, model, capacity or DB activity; private data/logs; user questions or acceptance.
- verification: static independent delta/evidence review. Preserve completed editorial and unchanged technical work; no whole-app or whole-suite repetition. Request an exact bounded discriminator only for an actual remaining unproved boundary.

## 3. Work
Resolve GQR-R1 and R2 member-by-member. Verify the real closed18-action catalog and admitted source bindings now govern navigation, including canonical Home, Help, account creation and the valid Settings/account-access source alternatives. The actual-service positives must traverse opaque reference translation and return canonical actions; fake helper strings cannot count. Preserve missing-source/action, unresolved Forgot and trusted-debate negatives. Verify safe comma/while and Romanian iar case/email prose is accepted and genuine email-creates-case claims remain rejected. Retain the original GPP counterexamples and passing conditional-scroll disposition only where unchanged.

Review the tightly authorized context amendment discovered by the exact owner questions. Explicit Dialectical-Engine overviews with ordinary app/RO filler words must select existing reviewed product-identity, not support-cases. Ordinary Romanian crea/creează account-creation wording must find account-access and the canonical sign-up action. Inspect exact EN/RO owner prompts, unsupported branded-topic and private-topic negatives and unrelated action controls. Reject broad topic swallowing or relaxed source boundaries. Both test-only expectation amendments must update only the new reviewed corpus/manifest pins while preserving assertions and strict44 behavior.

Mechanically read back the four approved article/projection/fallback records and the exact two support-cases wording substitutions against your prior editorial and wording-supplement hashes. Article and fallback bytes remain unchanged; owner ratification stays blank; the other40 components retain exact approved semantics. Verify components.json and manifest.json bind the actual reviewer/session/date/evidence and the strict44 loaded corpus digest. Do not repeat the completed four-record factual audit. A wrong hash or unapproved textual change is concrete REWORK.

Verify final nonempty FINAL11 inventory, all amended product paths, meaningful RED/GREEN and failure provenance, new strict snapshot, affected final tests, structural evaluation and inherited76 typecheck comparison. Structural/mocked evidence is not live model quality. Preserve initial source-custody and old failed-run limitations.

Review the root focused-live execution decision in the indexed inputs. The proposed31 fresh cases include all20 menu families, both broad-guide rows, all eight behavior-affected prior cases, two exact branded-overview questions, two canonical account-access queries, pointer/keyboard Help navigation and four real privacy/injection/recovery boundaries. All54 canonical rows plus four new owner cases remain required in current offline context/source/action proof; omitted duplicate variants are not claimed as live. Check the exact closed membership/counts, EN/RO and full/compact representation, unchanged safety assertions, and six-message/two-session owner-capacity gate. This replaces the mission-authored paid54 requirement for a bounded CP1 demonstration; owner acceptance and complete release-candidate evaluation remain separate. Return a distinct execution-plan PASS or precise missing requirement; do not treat previous mission-authored repetition counts as an owner requirement. No old sample may be promoted into this fresh actual run.

Return precise final code/knowledge and execution-plan PASS or REWORK. The capture binding and actual31 answer quality have separate later evidence gates. No current preview readiness, full CP1 completion or owner acceptance. Forgot remains unresolved/actionless, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, finite code/metadata/plan dispositions and exact checks/limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; static final code, metadata and focused-plan review, no heavy.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Resume the original author for the sealed canonical-authority rework and approved draft attestation."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_QUALITY_FIX2';seat='/root/requirements';review='GUIDE_QUALITY_REVIEW'
rp=E/(review+'-receipt.json');r=read(rp);revision=receipt_revision(r);assert r['verdict'].startswith('REWORK'),r['verdict']
assert read(E/(review+'-consumption.json'))['receipt']['sha256']==sha(rp)
reg=read(O/'logs/agents.json');assert not reg.get('git_slot') and not reg.get('heavy_lease');clean(revision)
write_paths=['apps/api/src/support/response-policy.ts','apps/api/src/support/answer.ts','tests/unit/support-response-policy.test.ts','tests/unit/support-answer-context.test.ts','packages/support-kb/recovery/components.json','packages/support-kb/reviews/manifest.json']
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL10-manifest.json',E/'GUIDE_QUALITY_FIX-editorial-input.json',E/'GUIDE_QUALITY_FIX-live-applicability.json']
wording=E/'GUIDE_QUALITY_REVIEW-wording-supplement-receipt.json';wr=read(wording);assert wr['verdict'].startswith('PASS'),wr['verdict'];files.append(wording);files.extend(Path(a['path']) for a in verify(wr['artifacts']))
for parent in ['GUIDE_QUALITY_FIX',review]:
 p=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(p)
 files.extend([p,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(p)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'correct canonical navigation authority and finalize reviewed knowledge',review,seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'writePathsAtBase':[rec(L/p) for p in write_paths],'sourceCustody':custody()})
packet=f'''# PACKET {node} — canonical authority correction and reviewed attestation

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded review/debugging/TDD/verification BODY skills. Assigned ticket comments before work; root claim proxy; no subdelegation or repeated audits.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: exact six writePaths in inputs; model-projection wording only as approved by the indexed narrow reviewer supplement, with all article and fallback bytes unchanged; {E}/{node}.md (new); {E}/{node}- (new); {E}/GATE_GUIDE_FINAL11-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new); one scoped local product commit.
- forbidden: unrelated product/KB/catalog/UI changes, new features/history, runtime/Support/model/status/capacity/DB traffic, configuration publication, quota reset, private data/logs, old evidence mutations, owner questions or acceptance. Do not change authority expectations merely to accept a fixture.
- verification: sole heavy and exact scoped Git for meaningful boundary RED/GREEN and final affected code/corpus checks. Root will not freeze while your Git lease is active. Preserve existing running preview and unrelated services. Release both leases before handoff.

## 3. Work
Resolve the complete finite canonical-navigation/source-authority and safe case/email-clause findings in the sealed GUIDE_QUALITY_REVIEW. The first correction passes its old-answer negatives but invents action IDs in a positive fixture and overrestricts supported source alternatives. Use the actual closed catalog and request-local context/action contract throughout. A unit test that passes an invented string directly to a helper is not a valid positive navigation control. Avoid a second parallel vocabulary that can drift from real IDs.

Before producer changes preserve RED through createSupportAnswerService for actual valid Home, Help and account-creation action IDs, valid Settings guidance supported by settings-help-menus, and sign-in/account-creation guidance supported by account-access, as listed by the reviewer. Cover the complete finite mapping census and alternative legitimate source authorities from the review, not only the first Home example. Include actual canonical positive controls plus mismatched/absent request-local source and action negatives. Preserve valid prose-only informational menu descriptions. Retain the original Account citation-completion and unsupported-destination counterexamples. Test normal model reference translation and returned canonical actions at the real service boundary, so a fake direct helper parameter cannot hide an impossible runtime action.

Separate safe contrastive case/email prose from an actual claim that email creates the app's case. Cover the review's comma/while example, the corresponding Romanian forms, explicit negation and punctuation variants, alongside the original unsafe conflation. Do not solve a false positive by removing the real protection or accepting unsupported case guarantees. Preserve credential, private-data and injection boundaries, fallback provenance, the current runtime model, current-message-only context, source/action allowlists and existing accounting/degraded behavior.

The separate review also provides finite editorial dispositions for four changed draft article/model-projection/fallback records. Apply components.json and reviews/manifest.json attestation ONLY to records explicitly approved there, using their exact article/projection/fallback hashes and the real Sol reviewer/session/date/evidence. For the two support-cases model projections use the separately approved plain-language replacement hashes from the indexed wording supplement; all article and fallback bytes remain exactly as originally reviewed. Keep owner ratifiedBy/ratifiedOn empty. Preserve all unchanged records by exact bytes/semantics. No new factual content or article-body edits are authorized. An editorial REWORK must be corrected and separately reviewed by Sol before that record is admitted; do not treat overall code REWORK as editorial approval.

After attestation run the previously expected-failing corpus/component checks and prove a strict complete44-entry corpus with the new digest. Refresh affected structural evaluation, keeping rubric PENDING where applicable. Run the reasoned final affected response/context/recovery-attestation/render suites and exact final clean-commit verification. Preserve failures and compare any necessary typecheck to the sealed76-diagnostic baseline; no whole-repository test repetition or count-only claim. Regenerate cumulative nonempty FINAL11 inventory and retained/new evidence map. Explain exactly which technical/editorial dispositions remain valid and the current per-case live applicability; source projection changes and newly executed binder behavior must not be hidden by a whole-file hash retention shortcut. All15 old screenshot claims still need current visual proof.

Finish with clean final code and attested KB ready for separate final delta review, final harness binding and supported runtime reload. No actual answer, owner quota read or preview readiness in this node. Forgot remains unresolved/actionless, CP1 incomplete, CP2 gated. Preserve initial source-custody limitations and old failed capture receipts.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session/ticket/base/final revision/verdict, finite source/action class census and actual-service RED/GREEN evidence, exact editorial/attestation provenance, corpus/eval/test counts and limits. Strict receipt node/ticket/baseRevision/revision/verdict/artifacts absolute/sha256/bytes excluding itself, productFiles, final cleanliness and source custody. Release heavy/Git; no self-close or owner acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,git_scope=write_paths,heavy_scope='canonical authority and safe-clause actual-service RED/GREEN, approved KB attestation and final affected checks only; no runtime or paid traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; scoped Git and sole heavy.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

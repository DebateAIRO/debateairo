"""Correct and independently review the real gated58 importer path."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_HARNESS_FIX25','GUIDE_HARNESS_REVIEW25'];review=node.endswith('REVIEW25');seat='/root/baseline' if review else '/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_LIVE24','GUIDE_HARNESS_FIX23','GUIDE_HARNESS_REVIEW23','GUIDE_RUNTIME7']+(['GUIDE_HARNESS_FIX25'] if review else []):
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_HARNESS_FIX25':assert r['verdict']=='PASS_REAL_GATED58_CONTRACT'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/('GUIDE_HARNESS_FIX25-manifest.json' if review else 'GUIDE_HARNESS_FIX23-manifest.json'))['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review real gated58 importer and fresh operation binding' if review else 'correct54-only gated importer to exact54plus4 contract','GUIDE_HARNESS_FIX25' if review else 'GUIDE_LIVE24',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)' if review else f'{O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new)'
work='''Independently review only the gated58 importer correction and required fresh artifact/command binding. The real LIVE24 gated path expected54 at replay-row-proofs.mjs line91 despite the reviewed54+4 matrix; earlier unbound58 proof did not exercise this branch. Require exact original canonical54 plus exact four owner rows with all existing source/action/safety assertions, not an arbitrary count relaxation. Verify the actual CLI/phase-rowProof child completed all58 using a clearly labeled inert gate/capacity fixture, and malformed missing/extra/duplicate membership negatives reject. No fixture can count as current runtime capacity or be used operationally.

Check the final command and capture proof path use fresh LIVE25 capacity/gate/row-proof outputs while all actual responses/screens remain unused GUIDE21. All seven argv[2] must bind the actual final FIX25 contract and proof must hash its actual bytes using the real shared parser. The corrected capture must consume the new58 proof and keep exact fixed31, screenshot helper, current article equality, GUIDE21 provenance, pacing and all safety predicates. Existing Runtime7 and unchanged FIX22 deferred-owner command remain bound. Confirm private setup uses the proven SUPPORT_DATABASE_URL connection and no generic API loader, API principal, grants or configuration change.

Retain prior substantive product/UI/capacity/custody proofs where unchanged; do not repeat broad audits or claim unbound proof covered the previously broken gated path. Return PASS_REAL_GATED58_FINAL_BINDING or exact finite REWORK with final contract/gate paths and hashes. Actual31 and later owner capacity remain pending.''' if review else '''LIVE24 successfully measured capacity and bound its gate, then the real row-proof child failed GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH: expected54, actual58. The exact old importer is GUIDE_ROW_PROOF_BIND21/replay-row-proofs.mjs line91; matrix is GUIDE_HARNESS_BIND21/matrix.mjs composing unchanged BIND17 canonical54 plus four reviewed owner rows. Correct only this stale gated-path contract and any corresponding exact membership assertions. Preserve every canonical question, source/action/branch condition, owner prompt and fixed31 selection. Require exact54+4 identity, no missing/extra/duplicate cases or arbitrary-length acceptance.

Reproduce the old failure through the ACTUAL gated CLI/phase-rowProof child using clearly labeled inert capacity/gate fixtures and the same real current product/context code. A fixture may use an explicit fixed clock or fixture timestamp but must never claim runtime availability, overwrite LIVE24 artifacts or be supplied to an operational capture. Show corrected full58 gated completion, exact owner sources/actions and focused missing/extra/duplicate negatives. Do not settle for another unbound proof, copied pass count or mocked importer. No status/DB/browser/Support/model traffic in this correction.

Prepare an append-only corrected importer and only mechanically necessary capture/contract/gate references. Publish GUIDE_HARNESS_FIX25-command-contract.json, GUIDE_HARNESS_FIX25-gate-template.json and GUIDE_HARNESS_FIX25-manifest.json. Use fresh LIVE25 phase/capacity/gate/row-proof result/log/UI/profile paths, because LIVE21 capacity/gate/row-proof-status and failed LIVE24 driver evidence now exist. Keep actual GUIDE_LIVE_GUIDE21 response/screenshot namespace and FRESH_GUIDE21_FIXED31 provenance, as no actual question has been sent. The capture must consume the fresh real gated58 result, not any old unbound or failed file. Runtime7 custody/private LIVE20 log remain unchanged. Retain GUIDE_HARNESS_FIX22-owner-capacity-contract.json and its untouched deferred output by exact hash.

All seven literal phase argv[2] MUST reference this exact final FIX25 command-contract path; generate proof from its actual bytes with the real shared parser. Keep sources reused by reference unless a path constant must change. Retain exact five-session/31-request capacity semantics plus6-owner-message reserve and deferred2sessions, freshness/skew, API KB/model, no-private boundaries and screenshot successor bytes. The operational environment is now proven: narrowly load SUPPORT_DATABASE_URL and validate existing debateai_dev_support principal, never generic DATABASE_URL or whole API-process/provider-panel validation. Do not change DB roles/permissions/configuration or repeat environment investigation.

Run only full real gated58 proof and focused affected importer/binding controls. Record previous unbound58 as retained current-product evidence that did not cover the failed gate branch. Preserve all failures and the successful but expired LIVE24 capacity frame; it is not reusable. Finish finite logs before hashing. Return PASS_REAL_GATED58_CONTRACT or precise failure with exact new and retained proof, final literal commands and prerequisites. Release heavy; independent original baseline review follows.'''
packet=f'''# PACKET {node} — exact54plus4 real gated proof correction

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB, canonical question/oracle or prior evidence edits; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private values/logs; quota/configuration/role changes; owner questions/acceptance.
- verification: {'static bounded independent review only; no heavy lease' if review else 'sole heavy for real gated58 inert fixture and focused affected importer/binding controls'}; no broad product/screenshot reruns.

## 3. Work
{work}

Forgot remains unresolved/actionless; no CP1 readiness/completion/acceptance or CP2. Preserve source-custody/typecheck limitations and all prior failed attempts.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, real gated58 evidence and focused findings. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='real gated58 inert fixture and focused importer/command binding correction; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; exact54plus4 gated proof and required fresh bindings only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

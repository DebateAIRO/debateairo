"""Dispatch bounded observed Pricing claim correction, preserving reviewed screenshot tooling."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PRICING_CLAIM_FIX2';seat='/root/requirements';revision='b103ce27a060c48fcf5613c1bf44be53c7cb2a0c';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL14-manifest.json']
for parent in ['GUIDE_PRICING_CLAIM_FIX','GUIDE_PRICING_CLAIM_REVIEW','GUIDE_PREVIEW_BIND31']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
write_paths=['apps/api/src/support/answer.ts','apps/api/src/support/response-policy.ts','tests/unit/support-response-policy.test.ts','tests/unit/support-answer-context.test.ts','tests/integration/support-routes.test.ts']
assert all((L/p).is_file() for p in write_paths)
files=list(dict.fromkeys(files));ticket=create(node,'bind financial negation to each actual claim','GUIDE_PRICING_CLAIM_REVIEW',seat)
inp=E/(node+'-inputs.json');write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'sourceCustody':custody(),'originalFiles':[rec(L/p) for p in write_paths]})
packet=f"""# PACKET {node} — supported Pricing answers

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY/debugging/TDD/verification skills. No floor reload or subdelegation. Root persisted claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed product: {', '.join(str(L/p) for p in write_paths)}.
- allowed evidence: {E}/{node}- (new); {E}/{node}.md (new); {E}/GATE_GUIDE_FINAL15-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new).
- forbidden: other product or KB edits, prior evidence or canonical oracle changes, harness edits, operational traffic, private values or logs, runtime lifecycle, quota or configuration changes, owner questions, guessed recovery links, acceptance.
- verification: sole heavy for affected offline semantic RED/GREEN and regressions; scoped product Git only. No administrative freeze during this Git lease.

## 3. Work
The consumed first pricing correction proves the exact original bad answer and full44 real answer/POST recovery, but independent review found a finite polarity defect. The preceding96-character negation window and coarse clause splitting let a different negative claim authorize a positive financial statement. Examples: Pricing is not checkout because payment happens in the debate creator after sign in. Romanian: Pricing nu este checkout deoarece plata are loc în creator după autentificare. The guard also rejects a legitimate limitation: Payment may not be available through the debate creator.

Correct this causal property with local claim polarity. Do not merely add the exact two connective words or literal example as an exception. An unrelated negative claim must not license a positive payment/purchase/checkout claim, across causal, comma or coordinated phrasing, in EN/RO. Legitimate modal negatives and supported creation guidance must remain usable. Keep financial capability claims grounded in reviewed public authority; do not claim payments are absent everywhere. Preserve source/action, credential, injection and private-data boundaries and fallback/accounting behavior.

Establish RED for these precise bypass and modal-negative cases in the real validator, then meaningful EN/RO variants proving separation. Retain and run affected suites including the existing full44 real answer and POST recovery. Add only a necessary full-path discriminator if current route fixtures already exercise the same unchanged recovery branch. No broad audit, no paid sample, no unrelated typecheck repetition: unchanged inherited76 diagnostics remain qualified and changed files can be checked if necessary. Keep current support model/context/config and KB7ef unchanged.

Seal a scoped clean commit within the same five-file authority and cumulative FINAL15 inventory, with exact new versus inherited evidence. Return IMPLEMENTED_REVIEW_REQUIRED. Preview BIND31 was stopped before lifecycle/control execution and has no product-dependent outputs to carry. No runtime or harness work here; independent product review must pass before rebinding again. Release heavy and Git promptly. Forgot unresolved/actionless; no CP1 readiness/acceptance, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, baseRevision, revision, finite checks, limits. Strict receipt with productFiles and artifacts absolute/sha256/bytes excluding itself. No self-close or readiness/acceptance.
"""
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,git_scope=write_paths,heavy_scope='bounded unsupported payment claim RED/GREEN and affected offline regressions')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; base='+revision+'; unsupported payment claim correction only; sole heavy and scoped Git; pricing rework round2.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Dispatch bounded observed Pricing claim correction, preserving reviewed screenshot tooling."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_FINANCIAL_FALLBACK_FIX2';seat='/root/requirements';revision='c683a0c752553fe2b4e226bc3f70879ce2460b74';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL17-manifest.json',D/'decisions/GUIDE-FINANCIAL-REVIEWED-FALLBACK-20260921.md']
for parent in ['GUIDE_FINANCIAL_FALLBACK_FIX','GUIDE_FINANCIAL_FALLBACK_REVIEW','GUIDE_PREVIEW_BIND31']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
write_paths=['apps/api/src/support/answer.ts','apps/api/src/support/response-policy.ts','tests/unit/support-response-policy.test.ts','tests/unit/support-answer-context.test.ts','tests/integration/support-routes.test.ts']
assert all((L/p).is_file() for p in write_paths)
files=list(dict.fromkeys(files));ticket=create(node,'complete declared English and Romanian financial family parity','GUIDE_FINANCIAL_FALLBACK_REVIEW',seat)
inp=E/(node+'-inputs.json');write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'sourceCustody':custody(),'originalFiles':[rec(L/p) for p in write_paths]})
packet=f"""# PACKET {node} — supported Pricing answers

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY/debugging/TDD/verification skills. No floor reload or subdelegation. Root persisted claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed product: {', '.join(str(L/p) for p in write_paths)}.
- allowed evidence: {E}/{node}- (new); {E}/{node}.md (new); {E}/GATE_GUIDE_FINAL18-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new).
- forbidden: other product or KB edits, prior evidence or canonical oracle changes, harness edits, operational traffic, private values or logs, runtime lifecycle, quota or configuration changes, owner questions, guessed recovery links, acceptance.
- verification: sole heavy for affected offline semantic RED/GREEN and regressions; scoped product Git only. No administrative freeze during this Git lease.

## 3. Work
Retain the now independently sound deterministic financial fallback architecture and useful full44 service/POST/accounting evidence. Review found a finite EN/RO vocabulary asymmetry: English billing and transaction are guarded while ordinary facturare/facturată, tranzacție/tranzacții and purchase achiziție/achiziționare are not. Close the declared family parity together, not one missing word per review.

Use the finite mapping from the sealed reviewer: payment/pay/paid to Romanian plat/achit forms; purchase/buy/bought to cump/achiz forms; billing to factur forms; transaction to tranzact forms; charge to ordinary debitare/taxare forms. Confirm relevant accented and normalized inflections, including English bought as the ordinary buy past form. Protect platform/platformă and ordinary creation/menu prose, and avoid needlessly broad roots that match nonfinancial terms such as taxonomie. This is finite current-family parity, not an open-ended synonym audit or a new general classifier. Preserve the deterministic policy: no polarity parser is reintroduced; uncertain financial model prose uses reviewed fallback.

First capture RED for the reported Romanian affirmative claims and representative counterparts from the same declared families. Table-drive the finite EN/RO family parity and a small set of meaningful nonfinancial negatives. Retain full44 real context/answer and POST recovery/accounting; add only a needed representative end-to-end Romanian discriminator, not duplicate full paths for every inflection. Final output must remain useful, truthful reviewed app guidance with correct sources and actions. Run the affected policy/answer/route frame once after targeted controls pass. No broad typecheck, new paid sample or canonical oracle changes.

Same five-file authority, current KB7ef and model/config unchanged. Seal scoped clean commit and cumulative FINAL18, truthful new versus inherited evidence, preserved REDs and base-qualified typecheck limitations. Return IMPLEMENTED_REVIEW_REQUIRED and release heavy/Git. Product review must pass before BIND32. Runtime7 untouched, no live operational traffic. Forgot unresolved/actionless; CP1 unaccepted and CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, baseRevision, revision, finite checks, limits. Strict receipt with productFiles and artifacts absolute/sha256/bytes excluding itself. No self-close or readiness/acceptance.
"""
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,git_scope=write_paths,heavy_scope='bounded unsupported payment claim RED/GREEN and affected offline regressions')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; base='+revision+'; unsupported payment claim correction only; sole heavy and scoped Git; reviewed financial fallback decision.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

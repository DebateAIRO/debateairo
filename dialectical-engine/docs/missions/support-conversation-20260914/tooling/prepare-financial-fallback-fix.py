"""Dispatch bounded observed Pricing claim correction, preserving reviewed screenshot tooling."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_FINANCIAL_FALLBACK_FIX';seat='/root/requirements';revision='8cdb75d75055ccb41b6325da23bf233b24e2614b';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL16-manifest.json',D/'decisions/GUIDE-FINANCIAL-REVIEWED-FALLBACK-20260921.md']
for parent in ['GUIDE_PRICING_CLAIM_FIX3','GUIDE_PRICING_CLAIM_REVIEW3','GUIDE_PREVIEW_BIND31']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
write_paths=['apps/api/src/support/answer.ts','apps/api/src/support/response-policy.ts','tests/unit/support-response-policy.test.ts','tests/unit/support-answer-context.test.ts','tests/integration/support-routes.test.ts']
assert all((L/p).is_file() for p in write_paths)
files=list(dict.fromkeys(files));ticket=create(node,'publish financial guidance through reviewed-source fallback','GUIDE_PRICING_CLAIM_REVIEW3',seat)
inp=E/(node+'-inputs.json');write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'sourceCustody':custody(),'originalFiles':[rec(L/p) for p in write_paths]})
packet=f"""# PACKET {node} — supported Pricing answers

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY/debugging/TDD/verification skills. No floor reload or subdelegation. Root persisted claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed product: {', '.join(str(L/p) for p in write_paths)}.
- allowed evidence: {E}/{node}- (new); {E}/{node}.md (new); {E}/GATE_GUIDE_FINAL17-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new).
- forbidden: other product or KB edits, prior evidence or canonical oracle changes, harness edits, operational traffic, private values or logs, runtime lifecycle, quota or configuration changes, owner questions, guessed recovery links, acceptance.
- verification: sole heavy for affected offline semantic RED/GREEN and regressions; scoped product Git only. No administrative freeze during this Git lease.

## 3. Work
Implement the indexed coordinator decision GUIDE-FINANCIAL-REVIEWED-FALLBACK-20260921. Three scoped polarity revisions had different semantic leaks; the last admits not-only, isn't-merely and RO-nu-este-doar positive constructions because it matches an incomplete negative operator. Do not patch those phrases or add another polarity heuristic.

Model prose mentioning payment, purchase, checkout or equivalent financial capabilities must use the existing reviewed-source fallback, regardless of positive/negative polarity. Remove financial negation interpretation. Apply the conservative financial draft boundary using the existing screening/validation architecture; preserve ordinary creation-only and other menu conversation. Recognize relevant ordinary EN/RO financial terms including actual paid/payment forms instead of claiming a narrow spelling pattern covers all finance. Do not add general off-topic restrictions or inspect private data.

Useful final output is the acceptance criterion. A benign financial paraphrase may reject as a model draft, but the real answer must recover to truthful selected reviewed public guidance with citations and authorized actions. It must not become a generic refusal, empty answer, invented universal absence of payment, or default human escalation. Source membership alone must never authorize arbitrary financial prose. Preserve credential, injection and private-data precedence, source selection, accounting, usage, persistence and all current security contracts.

Capture RED for the observed unsupported payment claim and all reviewed forward/reverse/modifier cases under the new admission boundary, then prove benign financial drafts also recover usefully in EN/RO through the full44 real context/answer service and actual POST. Preserve supported creation-only model draft acceptance. Update policy tests intentionally around the documented stricter admission boundary and final output; do not change canonical questions, full58 oracle or fixed31 plan. Run affected policy/answer/route suites only. No broad typecheck or paid sample. Keep KB7ef/model/config unchanged.

Same five-file authority. Seal clean scoped commit and cumulative FINAL17 with exact new and retained evidence; keep inherited typecheck limits qualified. Return IMPLEMENTED_REVIEW_REQUIRED and release heavy/Git. Independent review of this deterministic restriction must pass before BIND32. Runtime7 unchanged, no live/status/capacity/browser/model traffic. Forgot unresolved; no CP1 readiness/acceptance, CP2 gated.

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

"""Dispatch bounded observed Pricing claim correction, preserving reviewed screenshot tooling."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PRICING_CLAIM_FIX';seat='/root/requirements';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_CAPTURE_REVIEW30','GUIDE_ACCOUNT_RANKING_FIX','GUIDE_ACCOUNT_RANKING_REVIEW','GUIDE_LIVE28']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
write_paths=['apps/api/src/support/answer.ts','apps/api/src/support/response-policy.ts','tests/unit/support-response-policy.test.ts','tests/unit/support-answer-context.test.ts','tests/integration/support-routes.test.ts']
assert all((L/p).is_file() for p in write_paths)
files=list(dict.fromkeys(files));ticket=create(node,'reject unsupported payment and checkout capability claims','GUIDE_CAPTURE_REVIEW30',seat)
inp=E/(node+'-inputs.json');write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'sourceCustody':custody(),'originalFiles':[rec(L/p) for p in write_paths]})
packet=f"""# PACKET {node} — supported Pricing answers

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY/debugging/TDD/verification skills. No floor reload or subdelegation. Root persisted claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed product: {', '.join(str(L/p) for p in write_paths)}.
- allowed evidence: {E}/{node}- (new); {E}/{node}.md (new); {E}/GATE_GUIDE_FINAL14-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new).
- forbidden: other product or KB edits, prior evidence or canonical oracle changes, harness edits, operational traffic, private values or logs, runtime lifecycle, quota or configuration changes, owner questions, guessed recovery links, acceptance.
- verification: sole heavy for affected offline semantic RED/GREEN and regressions; scoped product Git only. No administrative freeze during this Git lease.

## 3. Work
Independent REVIEW30 found a real accepted live answer adds an unsupported financial capability. Exact row1 answer in LIVE28 says: Pricing on the site is informational only — it describes plans and costs but is not a checkout flow, so you cannot purchase or change a plan from it. If you have questions about what a plan includes, Support can explain the published information, but creating or paying for a debate happens through the debate creator after you sign in.
The claim that payment happens in the debate creator is unsupported. Reviewed app-navigation supports creation in the signed-in creator only. Budget-tier guidance explicitly disclaims proof of checkout or payment. See sealed REVIEW30 dispositions and report for exact anchors. Screenshot tooling passes separately and must remain unchanged.

Diagnose the smallest general correction to financial capability grounding. Preserve useful supported Pricing and creation explanations, and reject unsupported positive payment or checkout claims on the server rather than rely only on a model prompt. Do not hardcode this exact prompt or add a canned favorable answer. Do not block legitimate negative explanations of payment limitations. Keep public-current-message-only context, all source/action/credential/injection boundaries, refusals, accounting and all existing security precedence. Make no unsupported claim that payment is absent everywhere; say only what public guidance establishes.

First demonstrate the exact observed answer is wrongly accepted with the full real reviewed 44-entry corpus and actual context builder. Add discriminating EN/RO positive and negative semantic regressions, including coordinated creation/payment phrasing, supported creation after sign-in, and Pricing not checkout. Exercise real answer validation and request ingress with retained accounting/fallback behavior. Use affected response-policy, answer-context and route suites; do not run broad unrelated tests or paid samples. Record exact test counts and failures without claiming live quality. If a correction outside the five authorized files is necessary, report that concrete dependency before writing it.

Seal one scoped clean product commit and cumulative FINAL14 inventory. Preserve KB7ef and all44 source attestations unchanged. Return IMPLEMENTED_REVIEW_REQUIRED with exact causal evidence and revision; release heavy and Git promptly. Inherited76 type diagnostics and prior check provenance remain qualified. No live31 carry from partial LIVE28. Forgot remains unresolved and CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, baseRevision, revision, finite checks, limits. Strict receipt with productFiles and artifacts absolute/sha256/bytes excluding itself. No self-close or readiness/acceptance.
"""
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,git_scope=write_paths,heavy_scope='bounded unsupported payment claim RED/GREEN and affected offline regressions')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; base='+revision+'; unsupported payment claim correction only; sole heavy and scoped Git.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

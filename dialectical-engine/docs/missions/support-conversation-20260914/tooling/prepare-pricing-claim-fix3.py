"""Dispatch bounded observed Pricing claim correction, preserving reviewed screenshot tooling."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PRICING_CLAIM_FIX3';seat='/root/requirements';revision='130adf47da2e889005e73c3adb7ebb49fd50b529';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL15-manifest.json']
for parent in ['GUIDE_PRICING_CLAIM_FIX2','GUIDE_PRICING_CLAIM_REVIEW2','GUIDE_PREVIEW_BIND31']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
write_paths=['apps/api/src/support/answer.ts','apps/api/src/support/response-policy.ts','tests/unit/support-response-policy.test.ts','tests/unit/support-answer-context.test.ts','tests/integration/support-routes.test.ts']
assert all((L/p).is_file() for p in write_paths)
files=list(dict.fromkeys(files));ticket=create(node,'anchor financial negation to the current mention','GUIDE_PRICING_CLAIM_REVIEW2',seat)
inp=E/(node+'-inputs.json');write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'sourceCustody':custody(),'originalFiles':[rec(L/p) for p in write_paths]})
packet=f"""# PACKET {node} — supported Pricing answers

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY/debugging/TDD/verification skills. No floor reload or subdelegation. Root persisted claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed product: {', '.join(str(L/p) for p in write_paths)}.
- allowed evidence: {E}/{node}- (new); {E}/{node}.md (new); {E}/GATE_GUIDE_FINAL16-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); {O}/agent-reports/{node}.md (new).
- forbidden: other product or KB edits, prior evidence or canonical oracle changes, harness edits, operational traffic, private values or logs, runtime lifecycle, quota or configuration changes, owner questions, guessed recovery links, acceptance.
- verification: sole heavy for affected offline semantic RED/GREEN and regressions; scoped product Git only. No administrative freeze during this Git lease.

## 3. Work
REVIEW2 established reverse-order scope leakage despite the intervening-financial-token check: Payment is not available, but checkout happens in the debate creator. Romanian: Plata nu este disponibilă, dar checkout are loc în creator. The later financial mention inherits the first subject's negation. Direct negative after-subject forms cannot, can't, does not, doesn't, isn't were also dropped and create false rejections.

Remove arbitrary preceding96-character negation authority entirely. Bind financial negation through tightly anchored local constructions immediately before the current financial mention or after the current financial subject. Do not add another connector list or scan backward to unrelated predicates. Preserve supported direct and modal negatives in EN/RO. Where financial polarity is uncertain, reject the model draft into the existing reviewed fallback rather than accept an unsupported claim. Useful final output can be provided by reviewed fallback; not every harmless paraphrase must count as an accepted model draft. The fix does not need to solve arbitrary natural-language semantics.

First capture RED for reverse-order EN/RO positives and legitimate direct/modal negatives, then prove both ordering directions, causal/comma/coordination including yet/or/sau. Tests must distinguish local negation from negation belonging to another financial mention. Retain the exact original LIVE28 and full44 answer-service/real POST recovery and accounting behavior. Verify useful supported Pricing/creation limitations survive in final user output even when conservative fallback is needed. No response may invent a checkout/payment capability or blanket absence of payment everywhere. Keep source/action, credential, injection and private-data authority unchanged.

Run only the affected policy/answer/route suites once the targeted discriminators pass; preserve failures and avoid redundant typechecks or audits. Same five-file product scope; KB7ef and support model/config remain unchanged. Seal scoped clean commit and cumulative FINAL16 inventory, exact new versus inherited evidence and retained typecheck qualifications. Return IMPLEMENTED_REVIEW_REQUIRED and release heavy/Git. Product review must pass before preview binding. Runtime7 unchanged, no paid traffic. Forgot unresolved/actionless, CP1 unaccepted and CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, baseRevision, revision, finite checks, limits. Strict receipt with productFiles and artifacts absolute/sha256/bytes excluding itself. No self-close or readiness/acceptance.
"""
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,git_scope=write_paths,heavy_scope='bounded unsupported payment claim RED/GREEN and affected offline regressions')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; base='+revision+'; unsupported payment claim correction only; sole heavy and scoped Git; pricing rework round3.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

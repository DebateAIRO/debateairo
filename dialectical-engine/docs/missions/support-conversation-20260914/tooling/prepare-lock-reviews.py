"""Resolve technical review packets only after the exact product fix is consumed."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_CORRECTNESS8','GUIDE_SECURITY8']
role='correctness' if node=='GUIDE_CORRECTNESS8' else 'security';seat='/root/plan_review' if role=='correctness' else '/root/forgot_destination'
r=read(E/'GUIDE_INJECTION_FIX-receipt.json');revision=receipt_revision(r);assert read(E/'GUIDE_INJECTION_FIX-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_INJECTION_FIX-receipt.json')
reg=read(O/'logs/agents.json');assert not reg.get('git_slot');clean(revision)
lane=S/('.worktrees/support-cp1-p3-'+role)/'dialectical-engine';assert not git('status','--porcelain',cwd=lane);old=git('rev-parse','HEAD',cwd=lane).decode().strip();assert old in [REV,revision];git('checkout','--detach',revision,cwd=lane);assert not git('status','--porcelain',cwd=lane)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL7-manifest.json',E/'GUIDE_INJECTION_FIX-inputs.json']
for parent in ['GUIDE_INJECTION_SERVER_DIAG','GUIDE_INJECTION_FIX','GUIDE_'+role.upper()+'7']:
 receipt=E/(parent+'-receipt.json');files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'base':REV,'lane':str(lane),'inputs':[rec(p) for p in files],'changedProductPaths':read(E/'GUIDE_INJECTION_FIX-inputs.json')['writePaths']})
ticket=read(D/'board-ids.json')['tickets'][node]
work='''Review the exact correction and its packet against the proved restricted-role defect. Check every changed producer and immediate consumer. Verify first refusal, threshold refusal persistence, immutableINJECTION/LOCK, derived read/admission, concurrent/configured threshold, later429, openSessions metric and unchanged case/handoff physical lifecycle semantics. Verify the new restricted-role regression actually uses the supported pool for the real repository and would fail on the base. Its synthetic message/model ports must not mask the implicated database operation. Check authored RED/GREEN custody, restricted UPDATE(state) rejection and complete minimal consumer sweep. Run the four affected files once from your exact detached lane under the heavy lease, plus a small independent discriminator only if needed for a concrete untested boundary. Retain prior catalog/navigation/source/fallback correctness by exact defining hashes; no whole-app or language audit, full34/typecheck repetition or model call.''' if role=='correctness' else '''Review the exact correction and its packet for privilege/locking regressions. Check no privilege, migration, privileged helper, bypass or actual capability expansion was introduced. ImmutableINJECTION/LOCK must retain serialized/concurrent/configured threshold admission, no-model refusal, encrypted storage, hashed abuse events and IP cooldown. Confirm status cannot count event-locked sessions as open. Trace unchanged message/case physical lifecycle guards and every downstream LOCKED consumer so removing mutable finalization cannot enable a later request or human-case bypass. Verify the restricted-role regression reaches the real denied operation on base and proves safe fixed behavior without upgrading the role. Retain prior public-only, redacted current message, model, source, action and private data dispositions by exact defining bytes; do not re-audit unchanged navigation. Begin with static review; request only a concrete bounded synthetic test command if a necessary fact is not established by source/author receipts. No speculative probe matrix or full34/typecheck. No real runtime/database/model traffic.'''
links='; '.join(str(lane/p)+' (new)' for p in ['node_modules','apps/api/node_modules','apps/ui/node_modules','apps/runner/node_modules','packages/support-kb/node_modules'])
packet=f'''# PACKET {node} — restricted-role correction {role} review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained actual BODY reviewer/verification skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {lane}; exact clean detached revision: {revision}; delta base: {REV}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}-receipt.json (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); temporary synthetic fixtures and read-only dependency links at {links}; remove before handoff.
- forbidden: lasting product/Git/index/KB/metadata changes, installs, actual preview, Support, model, status, capacity, private data, account or recovery traffic, private runtime logs, peer review reads, owner questions/acceptance.
- verification: {'sole heavy granted for the exact four-file isolated embedded database command and bounded concrete discriminator' if role=='correctness' else 'no heavy initially; static review, request exact justified synthetic command if required'}. No preview DB activity. Preserve failed evidence. Validate dependency equivalence and clean up your links/fixtures before seal. Primary remains frozen.

## 3. Work
{work}

Also assess any mechanically corrected stale principal-count assertions: verify unchanged declared principal membership/cardinality at base and final, retained first failure and no privilege/provisioning change; do not accept a lowered assertion without that evidence.

The four affected files are tests/architecture/sup-01-boundary.test.ts, tests/integration/dev-database-principals.test.ts, tests/integration/support-routes.test.ts, tests/integration/support-metrics.test.ts with TSX_DISABLE_CACHE=1 and --maxWorkers=1. Use repository capture runner. Return PASS/REWORK for exact implemented scope with concrete locations/counterexamples and retained/new dispositions. LIVE6 HTTP500 is retained; its first exception remains unobserved. Prior partial captures remain failures, no retrospective attribution. Full actual54 verification remains required.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, findings/dispositions/check counts, input/dependency/corpus custody and cleanup/limits. Receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy if held. No self-close, readiness or acceptance; Forgot unresolved/actionless, CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,role=='correctness',revision,heavy_scope='exact four affected suites using isolated synthetic embedded database; no preview/Support/model activity')

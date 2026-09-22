"""Resolve technical review packets only after the exact product fix is consumed."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_CORRECTNESS9','GUIDE_SECURITY9']
role='correctness' if node=='GUIDE_CORRECTNESS9' else 'security';seat='/root/plan_review' if role=='correctness' else '/root/forgot_destination'
r=read(E/'GUIDE_LOCK_HANDOFF_FIX-receipt.json');revision=receipt_revision(r);base=r['baseRevision'];assert read(E/'GUIDE_LOCK_HANDOFF_FIX-consumption.json')['receipt']['sha256']==sha(E/'GUIDE_LOCK_HANDOFF_FIX-receipt.json')
reg=read(O/'logs/agents.json');assert not reg.get('git_slot');clean(revision)
lane=S/('.worktrees/support-cp1-p3-'+role)/'dialectical-engine';assert not git('status','--porcelain',cwd=lane);old=git('rev-parse','HEAD',cwd=lane).decode().strip();assert old in [base,revision];git('checkout','--detach',revision,cwd=lane);assert not git('status','--porcelain',cwd=lane)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL8-manifest.json',E/'GUIDE_LOCK_HANDOFF_FIX-inputs.json']
for parent in ['GUIDE_INJECTION_FIX','GUIDE_LOCK_HANDOFF_FIX','GUIDE_CORRECTNESS8','GUIDE_SECURITY8']:
 receipt=E/(parent+'-receipt.json');files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'base':base,'lane':str(lane),'inputs':[rec(p) for p in files],'changedProductPaths':read(E/'GUIDE_LOCK_HANDOFF_FIX-inputs.json')['writePaths']})
ticket=read(D/'board-ids.json')['tickets'][node]
work='''Review GS8-1 and GS8-2 against the complete finite event-lock consumer class. A recorded LOCK must remain terminal for read, default read, admission and rating and both case producers even if the configured threshold later rises. Both manual escalation and human-rating escalation must refuse safely without any case row; both direct repository entry points must enforce the same condition. Preserve the threshold injection's encrypted refusal messages after its admission emits LOCK, ordinary open-session handoff and feedback and existing restricted-role, no-model, accounting, cooldown and status behavior. Verify all meaningful REDs precede producer edits and distinguish positive open controls from locked cases. Run the five affected isolated database and architecture suites once; add only a concrete necessary independent discriminator if the finite boundary is unproven. Prior CORRECTNESS8's unchanged-case and threshold-completeness disposition was contradicted by SECURITY8; explicitly resolve both counterexamples and do not carry that old disposition forward by hash alone. Retain unrelated navigation/public knowledge checks by exact defining bytes; no full34, typecheck or live repetition.''' if role=='correctness' else '''Resolve both GS8-1 and GS8-2 member-by-member. Trace every affected session mutation and case producer to ensure immutable LOCK is authoritative regardless of later threshold and physical OPEN. Check both manual and human-rating routes plus createCaseOnce and createCase direct adapters, rateMessage, read with and without threshold, admitMessage, status and cooldown. Verify locked refusals create no case, emit no model request and do not become generic500; preserve ordinary open-session feedback and handoff, serialized and concurrent threshold semantics and storage of the admitted threshold refusal. Ensure no grant, migration, privileged helper, state update or new data authority appears. Check meaningful RED/GREEN actual repository coverage, exact final inventory and retained privacy, model and source boundaries by defining bytes. Start statically; request only an exact isolated discriminator if necessary. No broad natural-language or whole-app audit, full34 or typecheck or actual traffic.'''
links='; '.join(str(lane/p)+' (new)' for p in ['node_modules','apps/api/node_modules','apps/ui/node_modules','apps/runner/node_modules','packages/support-kb/node_modules'])
packet=f'''# PACKET {node} — restricted-role correction {role} review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained actual BODY reviewer/verification skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {lane}; exact clean detached revision: {revision}; delta base: {base}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}-receipt.json (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new); temporary synthetic fixtures and read-only dependency links at {links}; remove before handoff.
- forbidden: lasting product/Git/index/KB/metadata changes, installs, actual preview, Support, model, status, capacity, private data, account or recovery traffic, private runtime logs, peer review reads, owner questions/acceptance.
- verification: {'sole heavy granted for the exact four-file isolated embedded database command and bounded concrete discriminator' if role=='correctness' else 'no heavy initially; static review, request exact justified synthetic command if required'}. No preview DB activity. Preserve failed evidence. Validate dependency equivalence and clean up your links/fixtures before seal. Primary remains frozen.

## 3. Work
{work}

Retain the previous source-derived principal-count correction only where its source and assertions are unchanged; no renewed fixture cleanup. Preserve the concrete SECURITY8 findings and author failures as evidence, even after their new dispositions.

The five affected files are tests/architecture/sup-01-boundary.test.ts, tests/integration/dev-database-principals.test.ts, tests/integration/support-routes.test.ts, tests/integration/support-metrics.test.ts, tests/integration/support-cases.test.ts with TSX_DISABLE_CACHE=1 and --maxWorkers=1. Use repository capture runner. Return PASS/REWORK for exact implemented scope with concrete locations/counterexamples and retained/new dispositions. LIVE6 HTTP500 is retained; its first exception remains unobserved. Prior partial captures remain failures, no retrospective attribution. Full actual54 verification remains required.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, findings/dispositions/check counts, input/dependency/corpus custody and cleanup/limits. Receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy if held. No self-close, readiness or acceptance; Forgot unresolved/actionless, CP2 gated.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,role=='correctness',revision,heavy_scope='exact five affected suites using isolated synthetic embedded database; no preview/Support/model activity')

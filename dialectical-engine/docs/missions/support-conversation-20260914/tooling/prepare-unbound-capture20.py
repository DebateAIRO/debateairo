"""Freeze disjoint light capture preparation before the next product-author Git lease."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_PREP20';seat='/root/preview';revision='0f4290c290fd38caa0ccfb3b6781fb8c33999a22';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md']
for parent in ['GUIDE_HARNESS_BIND19','GUIDE_HARNESS_BIND18','GUIDE_HARNESS_BIND17','GUIDE_HARNESS_REVIEW17','GUIDE_CAPTURE_FIX18','GUIDE_CAPTURE_CONTROLS18','GUIDE_QUALITY_REVIEW2','GUIDE_SIGNIN_CLASSIFIER_REVIEW']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp);files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'finish unbound fresh31 capture and absolute invocation templates while ranking is corrected','GUIDE_HARNESS_BIND19',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'preparationOnly':True,'finalRevision':None,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — disjoint capture preparation

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY and all completed work; no floor reload or subdelegation. Root claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; preparation base: {revision}; inputs: {inp}; final product is intentionally unbound.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/Git, old harness or evidence edits; behavioral control execution, full58 proof, test suites, browser, runtime, HTTP, status, capacity, DB, Support/model traffic; private data/logs; user questions/acceptance.
- verification: light source preparation plus bounded node --check and JSON syntax only. No heavy lease. Product author will concurrently own four-path Git and sole heavy for ranking correction. Do not inspect evolving product bytes as final or freeze administrative evidence during its Git lease.

## 3. Work
Finish the capture and absolute command-template work already authorized in BIND19, independently of the unresolved full44 source-ranking defect. Reuse sealed BIND18/BIND19 canonical54+4 matrix and exact fixed31 plan; do not rebuild them. The known row58 defect is assigned to original requirements; no further diagnosis or harness-oracle changes here.

Prepare append-only fresh31 capture scheduling from reviewed BIND17 plus prepared FIX18 command contracts and the exact PASS CONTROLS18 screenshot successor. Eliminate old15 retained/39 fresh scheduling while preserving all fixed31 groups, initial language invalidation, terminal injection, normal pacing, request-local actions, source/outcome equality and diagnostic privacy. Use current appended article identity, actual original-pane top/footer reachability and labeled expanded evidence image. Copy the passing screenshot helper only with necessary import/path adaptation and report exact semantic equivalence; do not rerun the proved synthetic browser fixture.

Finish all seven absolute operational invocation templates and operator-facing literal argv: preflight, readiness, one capacity materializer with actual API kb_version assertion, gate materialization, full58 row proof, fresh31 capture and idle checks. Include exact executables, cwd, scripts, tsx/binding arguments, unique output/log paths and planned future namespace. Keep final product revision, inventory and control-proof digest fields explicitly unbound; never fill them with the preparation base as if final. Preserve closed31/5-session/27-model-call/14EN17RO arithmetic, six reserved owner messages and later two naturally available owner sessions. Keep the entire54+4 offline source/branch/action assertions for final binding. No generic skip/retry selector.

Prepare the finite affected control definitions and explain how all prior151 purposes will be retained when final binding runs. Execute only syntax checks now; no behavioral/producer/browser/operational commands. Include a simple clear list of remaining mechanical final-binding substitutions and exact commands to run after corrected clean product is sealed. Existing owner Help tab walkthrough must use exposed UI/reload and supported session invalidation; no DevTools/storage deletion or invented reset control.

Seal PREPARED_UNBOUND_CAPTURE with revision:null, preparationBase:{revision}, exact input/artifact hashes, syntax results and explicit pending full58/composed-control/final-review/runtime/live/manual gates. This special preparation is valid even if product advances concurrently; no cleanliness claim at the old base after author changes. Preserve every old failure and no actual quality claim. No checkpoint readiness, full CP1 completion or acceptance; Forgot unresolved/actionless; CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/verdict/preparationBase, exact reusable code and final-binding work remaining. Strict receipt node/ticket/revision:null/verdict/artifacts absolute/sha256/bytes excluding itself. No heavy or Git to release; no self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision);board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; preparationBase='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; light unbound capture preparation, no heavy/Git.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

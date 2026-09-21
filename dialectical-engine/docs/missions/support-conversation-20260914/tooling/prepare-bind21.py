"""Correct two proven pretraffic harness contract defects; retain product proof."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND21';seat='/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json',E/'GUIDE_LIVE8-runtime-capacity.json']
for parent in ['GUIDE_LIVE20','GUIDE_HARNESS_BIND20','GUIDE_HARNESS_REVIEW20','GUIDE_RUNTIME7','GUIDE_QUALITY_REVIEW2']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_HARNESS_BIND20-manifest.json')['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'correct real UI producer shape and deferred owner session reserve','GUIDE_LIVE20',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — two proven operation-contract corrections

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND21/ (new, mechanical binding only if required); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite logs); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB or prior evidence edits; runtime lifecycle, browser, HTTP, status, capacity, DB, Support or model traffic; private data or logs; configuration or quota changes; new sample or oracle relaxation; owner questions or acceptance.
- verification: sole heavy only for bounded inert regression checks of the proven two harness defects and mechanically necessary successor bindings. Retain unchanged full58 product proof, screenshot successor fixture and product reviews by hash. No repeated product suites, broad audit or browser fixture.

## 3. Work
LIVE20 stopped with zero Support, capacity or model traffic. Its actual five-transition producer returned PASS and five privateControls objects with passed:true. The preflight consumer incorrectly demanded result:'PASS'. Use that exact immutable output as a regression fixture against the real consumer, showing the old failure and corrected pass. Negative fixtures must reject passed:false, missing controls and forwarded Support traffic. Do not rename or falsify the producer evidence.

The BIND20 capacity validator also requires7 simultaneous hourly session slots, but the immutable LIVE8 measured limit is5. The approved decision requires5 capture sessions and2 owner sessions after natural availability. Correct the capture gate to require5 currently available session slots; keep31 capture messages plus6 owner messages and27+6 daily model-call headroom, the exact freshness/skew, measured KB/model/configuration, pacing and all other bounds. Express2 owner sessions as a distinct deferred final availability requirement, never simultaneous capture headroom. Prove this through the real validator using the measured5-session limit and sufficient other capacities: zero used sessions passes, one used fails, insufficient daily-message or model reserve fails, stale/KB mismatch fails. Preserve the measured source artifact; fixture substitutions must be explicit and confined to unrelated necessary current binding fields. The old assertion must fail first. This corrects the harness to the already approved plan and does not alter app limits.

Prepare append-only BIND21 seven-phase command contract, gate template and README. Use fresh GUIDE_LIVE21 operational outputs, GUIDE_LIVE_GUIDE21 actual artifacts and a unique UI output/profile namespace; never overwrite LIVE20 evidence. Retain Runtime7's exact existing custody and private GUIDE_LIVE20 stack log path; no reload is needed because product and KB are unchanged. A current five-transition proof already exists; keep it by hash as actual zero-Support evidence. The successor preflight may execute its sealed producer again if the unchanged seven-phase control flow requires it, but no new browser run here.

Only the two contract defects and mechanically required namespace/digest bindings may change. Keep fixed31 membership, canonical58 sources/actions/branches, screenshot successor bytes, API/DOM identity assertions and31second pacing exact. Retain prior151 historical purposes and full58 proof as historical current-product evidence, distinct from newly executed focused wrapper/capacity regression checks. Add a truthful narrow correction to the previous PASS review conclusion: it missed producer/consumer field and simultaneous-versus-deferred session semantics. Do not relabel the failed LIVE20 attempt successful.

Check literal absolute argv, loader, cwd, output and log contracts and the producer/consumer fields touched by these fixes before sealing. Prepare a supported later owner-capacity invocation using the same reviewed counts-only reader with exact≤6-message/two-session walkthrough requirements; do not execute it or reuse the capture gate's5-session requirement for owner testing. Finish all finite logs before hashing and exclude mutable packaging logs. Return PASS_CORRECTED_OPERATION_CONTRACT or precise finite failure, with exact diff, real fixture results, preserved proof and sealed successor commands. Release heavy; separate original baseline review follows. No runtime/live quality/testability/CP1 completion or acceptance claim. Forgot remains unresolved/actionless; CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, finite changed and retained checks, exact artifacts and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and ongoing logs. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='bounded inert UI-producer and five-session capacity contract regressions; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; two proven harness corrections only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Run the finite screenshot/path discriminators while draft editorial review proceeds."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_CONTROLS18';seat='/root/preview';revision=read(E/'GUIDE_QUALITY_FIX-consumption.json')['revision'];clean(revision)
cp=E/'GUIDE_CAPTURE_FIX18-consumption.json';cr=read(cp);assert cr['receipt']['sha256']==sha(E/'GUIDE_CAPTURE_FIX18-receipt.json')
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',cp,E/'GUIDE_CAPTURE_FIX18-receipt.json',E/'GUIDE_CAPTURE_FIX18-long-reply-supplement-receipt.json',E/'GUIDE_QUALITY_FIX-consumption.json']
for p in [E/'GUIDE_CAPTURE_FIX18-receipt.json',E/'GUIDE_CAPTURE_FIX18-long-reply-supplement-receipt.json']:
 files.extend(Path(a['path']) for a in verify(read(p)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'prove exact-answer screenshot and absolute helper invocation controls','GUIDE_CAPTURE_FIX18',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'preparationBase':'152eed4da1cd3e66b74d8301159ba76427552409','inputs':[rec(p) for p in files],'nodeExecutable':'/Users/vladmihaimiron/.local/bin/node'})
packet=f'''# PACKET {node} — bounded screenshot and invocation controls

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded debugging, TDD and verification BODY skills. Assigned ticket comments before work; root claim proxy, no repeated failed board writes or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; clean intermediate product: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new, minimal successor correction only if a prepared discriminator fails); {E}/{node}.md (new); {E}/{node}- (new); {E}/{node}-screenshots/ (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new); owned temporary synthetic browser processes only.
- forbidden: product/Git, previous harness or evidence edits; runtime lifecycle, app-page navigation, HTTP/status/capacity/DB, Support/model traffic; source/action/oracle or canonical plan relaxation; private data/logs, quota changes, user questions or acceptance.
- verification: sole heavy for the four prepared inert controls and exactly the zero-Support local long-reply browser discriminator, plus affected rerun only after a concrete within-scope correction. Baseline runs disjoint static code/editorial review. No151-control final binding yet; product and KB are still awaiting attestation.

## 3. Work
Run the prepared4-control verifier and long-reply browser fixture from the immutable GUIDE_CAPTURE_FIX18 preparation, preserving direct logs, numeric exit status, every failed output and exact hashes. Use the absolute Node executable in inputs, absolute source-repository script paths, cwd and outputs. First verifier command has no arguments; fixture takes absolute new screenshot directory then absolute new receipt path. The prepared scripts are {O}/probes/GUIDE_CAPTURE_FIX18/verify-prepared-controls.mjs and {O}/probes/GUIDE_CAPTURE_FIX18/long-reply-browser-fixture.mjs. Do not invoke the capacity materializer or any operational phase. Only local setContent fixture markup is permitted; abort all Support requests and prove zero. Inspect and clean up only browser children spawned by this fixture, preserving the running app stack and unrelated processes.

The long article must exceed its240px nested pane and preserve both its top marker and source/action footer in the actual captured pixels. Geometry and a different PNG hash alone do not establish complete current-answer visibility. Inspect the generated PNG and the top/footer pixel-influence results. If the fixture fails because an ancestor overflow clips the article screenshot, diagnose that exact browser mechanism and prepare the smallest corrected successor under this node's new probes directory. Preserve the original failed attempt and immutable FIX18 bytes. You may then run only the affected fixture/controls once for each concrete correction; do not use a paid/live sample to debug screenshot behavior. Report any evidence-only layout expansion or segmented capture honestly; a modified capture presentation cannot prove the user's actual pane layout. Keep an actual original-pane view and show that users can reach the new answer and footer by scrolling. Do not alter the product UI or redesign Help.

The command-contract controls must prove rejection before spawn for the actual relative capacity-helper mistake and acceptance of valid absolute commands, not just JSON shape. Keep unique output/log paths, script hashes, cwd, argument types and all seven operational phase bindings. A fake injected spawn is appropriate here only for the zero-traffic invocation discriminator; it is not a claim that a live operational command ran.

Return PASS_CAPTURE_AND_INVOCATION_CONTROLS or precise REWORK with the finite failure and smallest remaining scope. If a successor was required, provide exact changed helper paths/hashes and source provenance for later independent review. Preserve original151 controls as an unexecuted future retention requirement and the pending final product/KB/affected plan binding. This node does not reload the app, generate answers, check owner quota, or establish preview readiness. Forgot remains unresolved/actionless, CP1 incomplete, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, exact control/fixture counts, all failures and corrections, browser cleanup and zero-traffic evidence. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and any running app log. Release heavy; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='four inert invocation/screenshot controls and local zero-Support long-reply browser fixture; concrete affected corrections only; no runtime or paid traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; bounded synthetic screenshot controls only.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

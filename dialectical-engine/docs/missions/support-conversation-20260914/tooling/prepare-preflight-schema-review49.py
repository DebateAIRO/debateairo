"""Review the actual preflight schema consumer and its affected final bindings."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PREFLIGHT_SCHEMA_REVIEW49';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921.md',D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_PREFLIGHT_SCHEMA_FIX49','GUIDE_CAPTURE_PANE_REVIEW48','GUIDE_LIVE37']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_LIVE37' and r['verdict']=='FAILED_PREFLIGHT_PREDECESSOR_COMPOSITION_VALIDATOR_ZERO_TRAFFIC') or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREFLIGHT_SCHEMA_FIX49-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review actual preflight schema2 consumer and final namespace','GUIDE_PREFLIGHT_SCHEMA_FIX49',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — final same-product continuation binding review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static final continuation sources and actual-UI intercepted proof only; retain already reviewed helper images and product dispositions.

## 3. Work
Review only FIX49 against LIVE37's zero-traffic old-preflight-schema failure. Retain your REVIEW48 compact-pane/compiled-replay/remaining20/composition and all earlier PASS. Do not review images again or repeat unaffected code audits, tests or runtime actions.

Verify the final selected REAL preflight entrypoint imports and calls the correct reviewed schema2 composition validator, preserving strict validation and reporting retained11/remaining20. Trace only direct schema/cardinality consumers in seven selected phase entrypoints/wrappers and the sealed compatibility map. Any legacy10/21 or schema1 assumption in a reachable changed-contract consumer must be resolved; generic unchanged phases stay retained. Check the actual preflight validation path reaches its intercepted UI-child boundary with production-shaped final input. The predecessor must reject schema2, corrected actual path must reach that boundary, and invalid schema/cardinality/binding must still reject. A stand-in entrypoint, source search, syntax test or import-only control cannot prove this. Shared validation is acceptable only if the actual selected executable calls those exact bytes without bypassing checks. Distinguish offline boundary interception from actual UI execution; the unchanged correct actual UI producer must remain selected for the live run, while controls forward zero traffic and perform no private preparation.

Inspect necessary namespace/hash changes only: LIVE38 operational/prerequisite/stop/proof/UI/profile/log/composed paths, still-unused actualGUIDE26, and unchanged unused owner21 capacity/owner25 walkthrough. All seven literal argv must select FIX49 final contract, operator embeds its final digest, metadata binds executable and operatorOwned, full required helper/dependency closure bound, future outputs absent. Preserve lifecycle/writer mode/private parser/runtime custody,20 unsent requests/3 sessions/17 model ceiling/31sec pacing/3-26-23 budget, fresh58 proof, same-session54-to43 Help transition and all strict screenshot checks. Retain ten LIVE31 plus one LIVE36 actual row10 and your accepted distinct replay qualification; LIVE37 adds no answer. Final composed31 remains THREE actual segments/all SIX identifier-free session times, both real-attempt failures and row10 missing actual image qualification intact. No resend or favorable resampling.

Return PASS_FINAL_PREFLIGHT_SCHEMA_BINDING or precise bounded REWORK. Remaining20 live execution, composed31 content review and one fresh owner frame remain. No product change, startup, guessed Forgot link, CP1 acceptance or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, finite dispositions. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,False,revision)
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static final same-product continuation binding review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

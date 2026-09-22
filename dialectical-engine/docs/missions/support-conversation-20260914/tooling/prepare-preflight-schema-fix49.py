"""Repair the real preflight schema consumer while retaining reviewed remaining20 behavior."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PREFLIGHT_SCHEMA_FIX49';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
assert sha(E/'GUIDE_LIVE37-contract-compatibility-scope.json')=='0884cd8c580b9d5be085aced95e71f0541340f5bac502dd4e1d2f6038982f1d0'
files=[E/'GUIDE_LIVE37-contract-compatibility-scope.json',D/'decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921.md',D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE37','GUIDE_CAPTURE_PANE_FIX48','GUIDE_CAPTURE_PANE_REVIEW48']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 assert r['verdict']=='FAILED_PREFLIGHT_PREDECESSOR_COMPOSITION_VALIDATOR_ZERO_TRAFFIC' if parent=='GUIDE_LIVE37' else r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_CAPTURE_PANE_FIX48-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'bind real preflight to the reviewed three-segment schema','GUIDE_LIVE37',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded real preflight schema compatibility repair

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY, debugging and verification skills. Root persisted claim proxy. No reload, new agents or delegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for finite offline real-preflight validation controls, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, canonical prompts, decisions or prior evidence edits; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private data/logs; future LIVE38 or actualGUIDE26 outputs; startup/restart; owner questions/acceptance.
- verification: real changed preflight validation path through an intercepted UI-child execution boundary using offline fixtures only, plus directly affected compatibility/binding guards. No UI, logical58 or product rerun where defining behavior is unchanged.

## 3. Work
Consume LIVE37's exact zero-traffic failure and separately sealed compatibility-scope supplement. The final operator selected GUIDE_UI_WRITER_FIX45/phase-preflight.mjs, whose local ./composition.mjs still validates schema1 and ten retained/twenty-one remaining, while the reviewed final composition is schema2 with eleven retained/twenty remaining across three actual segments. Fix this concrete real-entrypoint compatibility failure. The compact-pane repair, compiled React replay and remaining20 gate/composer PASS remain valid; do not reopen them.

Bind a fresh real preflight entrypoint to the correct unchanged reviewed schema2 composition validator. Correct its actual retained/remaining metadata to11/20. Trace the actual seven selected phase entrypoints and wrappers only for direct consumers of changed composition schema/cardinality; resolve any concrete same-cause stale validator or count assumption together. Use the sealed supplement to retain compatible capacity, row-proof, capture, composer, readiness/gate/idle behavior. Preserve strict validation, phase-owned lifecycle, actual writer mode, private parser, runtime custody and all existing failure guards. No placeholder validator, permissive fallback, schema coercion, changed row selection or dropped check.

Prove the REAL preflight validation path, not merely import linkage, syntax or source searches. Exercise production-shaped final schema2/11-retained/20-remaining input through the real changed entrypoint or a shared validator that this entrypoint actually calls, up to the existing UI-child execution boundary. Intercept that child in the offline control so no browser/runtime/HTTP or private preparation occurs. Use separate FIX49 fixture artifact paths; never create LIVE38 operational outputs or weaken production path/lifecycle checks. The predecessor validator must reject the new schema2 input, the corrected actual path must reach the boundary, and wrong schema/cardinality/binding must still reject before it. Record the precise boundary and show the unchanged actual UI producer remains selected for the later live run. A test-only reimplementation or swapped stand-in preflight cannot be the positive evidence.

Keep ALL ten LIVE31 replies and actual LIVE36 row10 with its separately reviewed replay qualification; LIVE37 contributes zero answers. Exact outstanding20,3 new sessions,17 model branches,31sec pacing,3/26/23 gate including6 owner reserve, fresh58 logical proof and54-to43 real same-session Help transition stay unchanged. Compose31 across THREE actual segments and all SIX timestamps. Keep real and replay images separate, both failed real-attempt provenances, row47 exception and row10 missing actual end/expanded qualification. No question resend or favorable resampling.

Fresh LIVE38 phase/prerequisite/stop/proof/UI/profile/log paths and GUIDE_LIVE38-composed31-manifest.json. ActualGUIDE26 remains unused and selected; owner GUIDE_LIVE21-owner-capacity.json and GUIDE_LIVE25-owner-testability.json stay unused and unchanged. All seven literal argv must use this node final contract; operator embeds the final digest, metadata binds executable and operatorOwned, full reachable helper/dependency closure bound. Future operational outputs remain absent after controls. Update only necessary namespace hashes and directly changed preflight consumers. No rerun of existing compiled React replay, logical58, capacity or broad prior controls unless defining logic actually changes, in which case explain that affected link.

Seal PASS_PREFLIGHT_SCHEMA_BOUND_REVIEW_REQUIRED or exact finite blocker with real preflight boundary controls, source delta, compatibility map and final bindings. Release heavy. Original reviewer checks only this correction and new namespace; remaining20 actual execution/review/owner availability still outstanding. No startup allowance, guessed Forgot URL, CP1 readiness/completion/acceptance or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, finite dispositions. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L);git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='finite offline real-preflight schema validation to intercepted UI-child boundary; zero operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded real preflight schema compatibility repair only; zero operational traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Prepare bounded final harness review or supported owned reload after consumed final-code review."""
import runpy,sys,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_HARNESS_REVIEW19','GUIDE_RUNTIME7'];review=node=='GUIDE_HARNESS_REVIEW19';seat='/root/baseline' if review else '/root/preview';revision=receipt_revision(read(E/'GUIDE_SIGNIN_CLASSIFIER_FIX-receipt.json'));clean(revision)
parents=['GUIDE_SIGNIN_CLASSIFIER_FIX','GUIDE_SIGNIN_CLASSIFIER_REVIEW','GUIDE_QUALITY_FIX2','GUIDE_QUALITY_REVIEW2']+(['GUIDE_HARNESS_BIND19','GUIDE_HARNESS_REVIEW17','GUIDE_CAPTURE_CONTROLS18'] if review else ['GUIDE_RUNTIME6','GUIDE_LIVE9'])
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL12-manifest.json']
for parent in parents:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent in ['GUIDE_QUALITY_REVIEW2','GUIDE_SIGNIN_CLASSIFIER_REVIEW']:assert r['verdict'].startswith('PASS'),r['verdict']
 if parent=='GUIDE_HARNESS_BIND19':assert r['verdict']=='PREPARED_CONTROLS_AND_OFFLINE58_PASS',r['verdict']
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'independently review fixed31 final binding and offline58 proof' if review else 'reload owned preview with final reviewed code and44-entry corpus','GUIDE_HARNESS_BIND19' if review else 'GUIDE_SIGNIN_CLASSIFIER_REVIEW',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'kbVersion':'7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af','inputs':[rec(p) for p in files]})
if review:
 allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)'
 forbidden='product, Git, KB, harness or prior evidence edits; heavy commands, runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private data and logs; owner questions or acceptance'
 verify_text='Static independent final binding review only. Retain completed product, editorial, plan and screenshot-fixture proof. No broad rerun.'
 work='''Review only the final BIND19 delta from reviewed BIND17, prepared FIX18 and PASS CONTROLS18 screenshot successor. Confirm every retained151 control purpose remains intact, any changed assertion follows the separately PASS focused31 plan, and additional controls exercise real changed production harness code. Distinguish raw verifier counts, newly executed composed proof and historical retained proof. Preserve all54 canonical row assertions and four exact owner rows, complete final58 offline context/source/action/branch proof at final KB, fixed31 case membership and five sessions,27 model ceiling,14EN/17RO, all20 families and all8 behavior-affected prior cases. No historical answer or screenshot may count in this fresh actual run. Inspect exact source and action expectations for Engine and account prompts; no generic answer or oracle relaxation.

Verify actual capture maps the currently appended assistant article by row identity, API/DOM text and sources/actions/outcome; the completed original-pane top/footer views and separately labeled expanded image must use the exact PASS successor helper or a mechanically equivalent namespace-only copy. Keep the synthetic long-reply pixel-influence evidence; do not request a redundant browser fixture. UI transition helpers retain the earlier five-transition proof where unchanged, but the actual final runtime still requires a zero-Support current preflight before any paid capture.

Check all seven operational phases against literal absolute command contracts and complete README argv, including capacity helper, tsx, binding path, outputs, logs and cwd. Every future artifact path must be absent and unique; no overwritten failed attempt or existing namespace. The freshness/skew guard and capacity arithmetic must cover31 requests, five sessions and six reserved owner messages. Final two owner sessions must wait for natural availability. Confirm runtime KB proof comes from actual API state, not only a CLI loading checkout files. Return an exact list of operational prerequisites and literal validated invocations suitable for the existing original preview agent.

Return PASS_FINAL_BINDING or precise finite REWORK. This review does not establish runtime health, live answer quality or owner testability. No repeated technical, editorial or full-app audit.'''
else:
 allowed=f'{O}/probes/{node}/ (new, bounded supported lifecycle wrapper only); {O}/logs/{node}- (new); {O}/logs/GUIDE_LIVE18-stack.log (new, private ongoing log excluded from all artifacts and hashes); {E}/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); owned supported preview lifecycle files'
 forbidden='product, Git, KB, harness or old evidence edits; installs; provider, model or configuration changes; unrelated service changes; private records and credentials; Support sessions/messages, models, status or capacity queries; data, counter or quota resets; user questions or acceptance'
 verify_text='Sole heavy for supported owned lifecycle and ordinary TLS readiness only. No test suites, evaluations or Support smoke prompts. Leave detached healthy preview running.'
 work=f'''The last sealed owned stack is PID=PGID77769, PPID1 at old product152eed4d, with private GUIDE_LIVE7-stack.log. Revalidate CURRENT identity, command, cwd, parent/group and listener ancestry before any stop. PID alone is insufficient. Preserve the current unrelated listener baseline. Required owned ports are3100,3101,55433,7177,8988,8890 through8896. Do not kill a reused PID or unknown listener. Report any actual ownership discrepancy and the narrow blocking fact.

Restart only this owned full preview through the established repository-supported DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview pnpm dev:auth:up lifecycle at exact clean{revision}. Use your previously proved detached supervisor approach and new private GUIDE_LIVE18-stack.log, retaining supported service ordering and TLS. No bare or partial substitute service, no data reset, no support-configuration rewrite. The API loads corpus at startup, and final reviewed corpus is7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af. The changed checkout requires this supported reload even if development hot reload exists. CLI support-status digest alone is not runtime KB proof: establish startup/revision provenance now and leave exact API KB confirmation to the later single fresh status/capacity gate if it is not available from ordinary health. Do not add a status/capacity read here.

Never read, hash, export or freeze old or new private ongoing stack logs. Verify finite lifecycle evidence, current PID/PPID/PGID, all required listener ownership, unrelated service preservation, system-trusted TLS https://localhost:3100/help HTTP200 and ordinary health after a short idle. Leave the stack healthy and detached. Return PASS_OWNED_RUNTIME_READY or exact stop with finite evidence and new identity. The actual final browser preflight, one fresh capacity frame, offline gate-bound proof and fresh31 run follow separate final harness review; do not execute them here.'''
packet=f'''# PACKET {node} — final {'harness review' if review else 'owned runtime reload'}

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy, no repeated board failures or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: {forbidden}.
- verification: {verify_text}

## 3. Work
{work}

Strongest future bounded handoff is WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED, only after actual answer and screenshot review plus fresh owner capacity. Forgot remains unresolved/actionless; no full CP1 readiness, completion or acceptance; CP2 gated. Retain inherited source-custody and typecheck limitations and all failed historical evidence.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, finite new and retained checks and limits. Strict receipt with node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and all ongoing private logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='supported owned runtime reload and ordinary TLS health only; no Support/model/status/capacity traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; final bounded '+('static binding review' if review else 'supported owned lifecycle only')+'.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

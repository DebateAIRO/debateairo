"""Dispatch only the independently reviewed final seven-phase local capture."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')))
globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_LIVE38';seat='/root/preview'
revision=receipt_revision(read(E/'GUIDE_FINANCIAL_FALLBACK_FIX2-receipt.json'))
clean(revision)
contract_path=E/'GUIDE_PREFLIGHT_SCHEMA_FIX49-command-contract.json'
bound=verify(read(E/'GUIDE_PREFLIGHT_SCHEMA_FIX49-manifest.json')['artifacts'])
assert any(a['path']==str(E/'GUIDE_PREFLIGHT_SCHEMA_FIX49-inputs.json') and a['sha256']==sha(E/'GUIDE_PREFLIGHT_SCHEMA_FIX49-inputs.json') for a in bound)
bound.extend(verify(read(E/'GUIDE_PREFLIGHT_SCHEMA_FIX49-inputs.json')['inputs']))
bound.extend(verify(read(E/'GUIDE_OPERATOR_CWD_BIND50-receipt.json')['artifacts']))
assert any(a['path']==str(contract_path) and a['sha256']==sha(contract_path) for a in bound)
contract=read(contract_path)
assert contract['revision']==revision and contract['cwd']==str(L)
assert list(contract['phases'])==['preflight','readiness','capacity','gate','rowProof','capture','idle']
owner_contract=read(Path(contract['ownerCapacity']['contractPath']))
assert sha(Path(contract['ownerCapacity']['contractPath']))==contract['ownerCapacity']['contractSha256']
assert contract['ownerCapacity']['output']==owner_contract['argv'][-1]==str(E/'GUIDE_LIVE21-owner-capacity.json')
assert contract['ownerWalkthrough']==str(E/'GUIDE_LIVE25-owner-testability.json')
assert contract['composedManifest']==str(E/'GUIDE_LIVE38-composed31-manifest.json')
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',D/'decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',contract_path]
parents=['GUIDE_LIVE31','GUIDE_LIVE36','GUIDE_PREFLIGHT_SCHEMA_FIX49','GUIDE_PREFLIGHT_SCHEMA_REVIEW49','GUIDE_OPERATOR_CWD_BIND50','GUIDE_OPERATOR_CWD_REVIEW50','GUIDE_FOOTERLESS_REVIEW39','GUIDE_CONTINUATION_REVIEW39','GUIDE_CONTINUATION_FEASIBILITY39','GUIDE_FINANCIAL_FALLBACK_REVIEW2']
for parent in parents:
 rp=E/(parent+'-receipt.json');r=read(rp)
 assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent in ['GUIDE_LIVE31','GUIDE_LIVE36','GUIDE_CONTINUATION_FEASIBILITY39'] or r['verdict'].startswith('PASS'),(parent,r['verdict'])
 if parent in ['GUIDE_PREFLIGHT_SCHEMA_FIX49','GUIDE_PREFLIGHT_SCHEMA_REVIEW49','GUIDE_OPERATOR_CWD_BIND50','GUIDE_OPERATOR_CWD_REVIEW50','GUIDE_FINANCIAL_FALLBACK_REVIEW2']:assert receipt_revision(r)==revision
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREFLIGHT_SCHEMA_FIX49-manifest.json')['artifacts']))
custody_path=Path(contract['runtimeCustodyPath']);runtime=read(custody_path)
schema_path=Path(contract['runtimeCustodyContractPath']);schema=read(schema_path)
assert sha(schema_path)==contract['runtimeCustodyContractSha256']
assert set(runtime)==set(schema['exactKeys'])
assert all(runtime[k]==v for k,v in schema['required'].items())
files.extend([custody_path,schema_path])
for phase in contract['phases'].values():
 assert all(Path(phase[k]).is_absolute() and not Path(phase[k]).exists() for k in ['output','log'])
 assert all(Path(arg).is_absolute() for arg in phase['argv'])
 assert phase['argv'][-1]==str(contract_path)
 if 'ui' in phase:
  assert not Path(phase['ui']['output']).exists() and not Path(phase['ui']['log']).exists()
assert not Path(contract['actualReceipt']).exists() and not Path(contract['browserProfile']).exists()
operator_path=E/'GUIDE_OPERATOR_CWD_BIND50-operator-contract.json';operator=read(operator_path)
assert operator['cwd']==str(L) and operator['argv'] and Path(operator['argv'][0]).is_absolute()
assert any(a['path']==str(operator_path) and a['sha256']==sha(operator_path) for a in bound)
files.append(operator_path)
verify([operator['script'],operator['commandContract']])
assert operator['commandContract']['path']==str(contract_path)
operator_outputs=list(operator['operatorOwned']['outputs'].values())+list(operator['operatorOwned']['logs'].values())
assert all(Path(v).is_absolute() and not Path(v).exists() for v in operator_outputs)
operator_allowed='; '.join(v+' (new, exact sealed operator output)' for v in operator_outputs)
phase_allowed='; '.join(v[k]+' (new, exact reviewed phase path)' for v in contract['phases'].values() for k in ['output','log'])
ui_allowed='; '.join(v['ui'][k]+' (new, exact reviewed public UI proof path)' for v in contract['phases'].values() if 'ui' in v for k in ['output','log'])
files=list(dict.fromkeys(files));ticket=create(node,'execute remaining20 actual requests in three sessions','GUIDE_OPERATOR_CWD_REVIEW50',seat)
inp=E/(node+'-inputs.json');assert not inp.exists()
write(inp,{'revision':revision,'kbVersion':contract['kbVersion'],'inputs':[rec(p) for p in files]})
commands='\n'.join(str(i+1)+'. '+' '.join(p['argv']) for i,p in enumerate(contract['phases'].values()))
packet=f'''# PACKET {node} — reviewed seven phases and remaining20 on the same product

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no repeated board failures or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; contract: {contract_path}; sole heavy, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {operator_allowed}; {phase_allowed}; {ui_allowed}; {E}/GUIDE_LIVE25- (new, reviewed phase outputs and owner walkthrough only); {O}/logs/GUIDE_LIVE25- (new, finite reviewed phase logs only); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite phase and packaging logs only); {O}/probes/{node}/ (new, minimal sealed command orchestration only); {E}/GUIDE_LIVE_GUIDE26- (new); {E}/GUIDE_ROW_PROOF-run-LIVE38.json (new); {contract['browserProfile']} (new, temporary sealed capture profile); {O}/agent-reports/{node}.md (new); read-only owned lifecycle metadata.
- forbidden: product, Git, KB, harness or prior evidence edits; installs; configuration or model changes; unrelated services; private records or credentials; account or recovery actions; private ongoing log reads, hashes or export; headers or capability values; quota resets, identity switching, TLS bypass; owner questions or acceptance.
- verification: exactly the reviewed seven phases. Stop at first failure, preserve numeric status and partial evidence, no retries or favorable resampling. No broad test repetition.

## 3. Work
Consume PASS_FINAL_OPERATOR_CWD_BINDING together with retained PASS_FINAL_PREFLIGHT_SCHEMA_BINDING and the adopted same-revision continuation decision. Retain ALL ten LIVE31 replies unchanged, including complete short row47, with FAILED_CAPTURE_ROW47_NO_RETRY provenance, plus actual LIVE36 row10 with its accepted distinct replay qualification and FAILED_CAPTURE_ROW10_NO_RETRY provenance. No completed response resend, older-product/LIVE30 sample, favorable replacement or generic selection. Fixed remaining20: compactRO18,26,34,56,58,54 then actual keyboard Help navigation and fullRO43 terminal in the SAME session; fullEN5,13,21,25,29,37,45,53; compactEN8,12,42,55,57. Exactly3 new sessions, at most17 model branches; original31sec pacing and all source/action/safety assertions remain.

Execute the exact sealed reusable operator ONCE from its reviewed cwd using exec_command sandbox_permissions=require_escalated, tool-captured stdout/stderr, no shell redirection, new wrapper, preopened artifact, preliminary probe or extra status/capacity query:

{' '.join(operator['argv'])}

The operator owns its narrow memory-only Support-principal environment preparation and seven phase sequence. Preserve SUPPORT_DATABASE_URL to GUIDE_COUNTS_ONLY_DATABASE_URL projection and proven Support principal, strict private-file parser, exact cwd, absolute Node --import tsx, numeric stop-first and separate operator/child log ownership. Never read/hash/export the private Runtime9 log or actual credential/capability values. No startup/restart request is authorized. The literal commands below are composition evidence and must not be invoked separately a second time.

{commands}

Before operational I/O, validate all retained hashes, exact product0d34/KB7ef, closed31 membership, fixed remaining20 and complete future absence using the sealed implementation. Run zero-Support UI preflight and current runtime/ordinary-TLS readiness. One fresh gate must establish3 current session slots,20-message/17-model work plus6 reserved owner messages/model calls, all other rate/relay/queue/configuration/corpus constraints and freshness. Do not request five new slots or31 new messages. The prior67-message planning bound is not a fresh capacity PASS. If the gate fails, stop without sampling again.

Gate, fresh58 logical proof and remaining capture must follow immediately within120seconds, future skew at most5seconds. No discretionary reporting or packaging during that critical start. The capture wrapper must consume the fresh successful58 proof before launching. Preserve exact canonical prompts, modes, language, actions and outcomes; allow only the reviewed54-to43 mode transition. At that transition assert actual full-RO hydration and same session, do not click language/reset, and record memory-only comparison booleans/ordinals without private values/hashes. Enforce exact3-session and20-send counts; stop on any unexpected request.

Each remaining actual reply requires current article/API/DOM/source/action/outcome equality and correct original-pane screenshots. For legitimate source-free replies use the reviewed BODY_END contract; missing expected footer stays a failure. Keep strict paint/clipping, separate expanded evidence, safe geometry and observed restoration. Both actual Help navigation cases must be demonstrated through the real reviewed targets. Send finite phase/count progress at least every60seconds outside the critical start, distinguishing completed API replies from fully completed screenshot rows.

On any failure stop further phases, preserve numeric status and partial evidence, exact attempted/completed request/session counts, safe failure/restoration data and source attribution. No retry or unilateral plan adjustment. On success finish idle custody, then produce the exact new composed31 manifest required by the sealed composition contract. It must reference ALL retained10 LIVE31, retained1 LIVE36 and new20 immutable real responses/images, show each of31 fixed identities exactly once, retain LIVE31 failed-attempt provenance and row47's accepted single short image and row10's distinct replay qualification without invented actual images, bind all three segment revisions/KB and all six identifier-free session creation times. Report31 requests across three segments, never one successful continuous31 run or actual54/58. Logical58 is separate; exact provider-call count remains unavailable unless actually measured.

LIVE36 session time12:41:51.789Z must be retained as the third original timestamp; never relabel synthetic replay as actual live images.

After success write the still-unused GUIDE_LIVE25-owner-testability.json as the reviewed short six-message/two-session owner walkthrough using exposed UI only. It covers Engine, free menu conversation, EN/RO and privacy, with Forgot explicitly unresolved. No DevTools, storage wipe, hidden profile, invented reset or capability in owner steps. Calculate planning-only natural availability from all six session times and actual message timing; the original first two times are09:52:36.856Z and09:53:08.483Z. Planning-only: with LIVE36 plus three new sessions active, only one of five slots may remain; the extra LIVE36 session expires conservatively at13:41:56.789Z, so all SIX timestamps matter. A separate one-frame owner availability check follows independent composed31 review. Do not send owner messages or spend the reserved allowance here.

Finish finite logs before sealing manifest; never hash mutable packaging/runtime logs. Reverify artifacts, release heavy and preserve detached preview/unrelated services. Strongest later handoff remains WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED. No CP1 ready/complete/accepted or CP2; inherited source-custody/typecheck and historical failure qualifications remain.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, exact phase statuses, new20 and composed31 counts/navigation, custody and owner timing. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and all mutable or ongoing private logs. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='reviewed seven phases; one remaining3-session capacity frame, fresh58 and exact20 remaining requests; no retries or completed-case resampling')
board('claim',ticket,'--ttl','10800')
marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; final reviewed seven phases only.'
board('comment',ticket,marker,'--author','Astra')
t=json.loads(board('show',ticket,'--json'))
assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

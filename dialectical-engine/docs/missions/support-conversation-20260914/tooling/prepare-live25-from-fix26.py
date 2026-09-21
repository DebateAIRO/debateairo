"""Dispatch only the independently reviewed final seven-phase local capture."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')))
globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_LIVE25';seat='/root/preview'
revision='456cafb9e56a737de550570b5736ec52d79ddf48'
clean(revision)
contract_path=E/'GUIDE_HARNESS_FIX26-command-contract.json'
bound=verify(read(E/'GUIDE_HARNESS_FIX26-manifest.json')['artifacts'])
assert any(a['path']==str(contract_path) and a['sha256']==sha(contract_path) for a in bound)
contract=read(contract_path)
assert contract['revision']==revision and contract['cwd']==str(L)
assert list(contract['phases'])==['preflight','readiness','capacity','gate','rowProof','capture','idle']
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json',contract_path]
parents=['GUIDE_LIVE24','GUIDE_HARNESS_FIX26','GUIDE_HARNESS_REVIEW26','GUIDE_RUNTIME7','GUIDE_ACCOUNT_RANKING_REVIEW','GUIDE_SIGNIN_CLASSIFIER_REVIEW','GUIDE_QUALITY_REVIEW2','GUIDE_CAPTURE_CONTROLS18']
for parent in parents:
 rp=E/(parent+'-receipt.json');r=read(rp)
 assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_LIVE24' or r['verdict'].startswith('PASS'),(parent,r['verdict'])
 if parent in ['GUIDE_HARNESS_FIX26','GUIDE_HARNESS_REVIEW26','GUIDE_RUNTIME7','GUIDE_ACCOUNT_RANKING_REVIEW']:assert receipt_revision(r)==revision
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_HARNESS_FIX26-manifest.json')['artifacts']))
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
files=list(dict.fromkeys(files));ticket=create(node,'execute final reviewed31 actual browser requests in five sessions','GUIDE_HARNESS_REVIEW26',seat)
inp=E/(node+'-inputs.json');assert not inp.exists()
write(inp,{'revision':revision,'kbVersion':contract['kbVersion'],'inputs':[rec(p) for p in files]})
commands='\n'.join(str(i+1)+'. '+' '.join(p['argv']) for i,p in enumerate(contract['phases'].values()))
packet=f'''# PACKET {node} — final reviewed seven phases and fresh31

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no repeated board failures or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; contract: {contract_path}; sole heavy, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite phase and packaging logs only); {O}/probes/{node}/ (new, minimal sealed command orchestration only); {E}/GUIDE_LIVE_GUIDE21- (new); {E}/GUIDE_ROW_PROOF-run-LIVE25.json (new); {E}/GUIDE_UI_TRANSITION_PROBE-run-LIVE25.json (new); {O}/logs/GUIDE_UI_TRANSITION_PROBE-LIVE25.log (new); {contract['browserProfile']} (new, temporary sealed capture profile); {O}/agent-reports/{node}.md (new); read-only owned lifecycle metadata.
- forbidden: product, Git, KB, harness or prior evidence edits; installs; configuration or model changes; unrelated services; private records or credentials; account or recovery actions; private ongoing log reads, hashes or export; headers or capability values; quota resets, identity switching, TLS bypass; owner questions or acceptance.
- verification: exactly the reviewed seven phases. Stop at first failure, preserve numeric status and partial evidence, no retries or favorable resampling. No broad test repetition.

## 3. Work
Consume current PASS_CAPTURE_PROOF_DEPENDENCY_FINAL_BINDING and PASS_OWNED_RUNTIME_READY; Runtime7 custody and private stack log already exist as expected. All future operational outputs must remain absent. Use current supported runtime identity from custody, never an old PID. Preserve the detached healthy stack and unrelated services. Never read, hash, export or freeze its ongoing private log. No runtime restart for a healthy capture.

Run the following literal reviewed commands in order from exact contract cwd. The sealed wrappers write their direct logs and finite outputs. Do not invent alternative argv, relative paths or output namespaces. Validate prerequisites and output absence before capacity. Preflight must complete its five public UI transitions with zero forwarded Support traffic and private controls passing. Ordinary TLS readiness follows. Before any command, reuse the verified LIVE24 narrow private-file/permission/exact-key preparation to select SUPPORT_DATABASE_URL and the proven debateai_dev_support principal, projecting it only into the actual child GUIDE_COUNTS_ONLY_DATABASE_URL environment. Do not use generic DATABASE_URL, broad API-process/provider-panel validation or assumed inherited tool variables. Do not display/hash/persist private values. Prepare and validate the complete child environment and direct finite logs before preflight, preserving all failed predecessors. The only new capacity phase then binds actual API KB version {contract['kbVersion']} and identifier-free aggregate counters; supply its connection exclusively through GUIDE_COUNTS_ONLY_DATABASE_URL without reading or logging the credential value.

{commands}

After capacity, execute gate, all58 row proof and capture immediately within the same120-second freshness window, future skew at most5seconds. The reviewed capture wrapper must consume and record the fresh successful58 proof before launching its child; never bypass that dependency. No discretionary packaging or messages between these phases. A failed or expired frame stops, with no resampling. Preserve the exact31 requests, five sessions,14EN/17RO, all20 families, all8 affected cases and four owner rows. The approved canonical groups and order are in the sealed contract. Maximum27 model calls; six owner messages remain reserved; two owner sessions require a distinct later natural-availability frame. The capture gate requires five current session slots, not seven. No historical answer or screenshot counts as fresh. The successful but expired LIVE24 capacity/gate and failed54-row proof remain prior-attempt evidence, never a reusable frame. Use only the new operational gate, not the inert correction fixture. All54 canonical plus4 owner logical proof remains separate from31 actual traffic.

Each actual row requires current article identity and API/DOM text, source, action, outcome and diagnostic equality, with original-pane top/footer and separately labeled expanded complete screenshot. Keep source attribution and deterministic/refusal/fallback outcomes explicit. Preserve31,000ms pacing and exact reviewed reset behavior. Both public Help navigation cases must execute the sealed observed targets; never follow an invented recovery destination. Send factual phase progress at least each60seconds while capture is running, without delaying the freshness-critical start.

On any failure stop further phases and seal exact partial evidence, including attempted and completed requests, new sessions, numeric child exit and failure stage. Do not relax assertions, replace cases or reuse favorable rows. On success finish idle custody, record all31 unique actual results with paths and hashes, and write /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE25-owner-testability.json (new) as a short6-message/two-session owner walkthrough using exposed UI only. It must include Engine explanation, free conversation/menu guidance, EN/RO and privacy boundaries, with Forgot explicitly unresolved. No hidden storage reset, DevTools, private profile or capability in the owner's instructions. Record new-session timestamps and conservative natural owner availability; no additional capacity read. Separate independent answer/screenshot review and a later single fresh owner-capacity frame follow.

Finish all finite logs before manifest hashing. Exclude mutable packaging logs as well as ongoing runtime logs. Reverify receipt artifacts before sealing. Release heavy while leaving the preview detached and healthy. Strongest future handoff is WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED after independent actual review and natural owner capacity. No CP1 readiness, completion or acceptance; CP2 gated. Retain source-custody and inherited typecheck limitations and all historical failures.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, exact phase statuses, actual counts/outcomes/navigation, custody and manual capacity timing. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and all mutable or ongoing private logs. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='reviewed seven phases; zero-Support preflight then one capacity frame, offline58 and exactly31 actual requests; no retries')
board('claim',ticket,'--ttl','10800')
marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; final reviewed seven phases only.'
board('comment',ticket,marker,'--author','Astra')
t=json.loads(board('show',ticket,'--json'))
assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Resume only unexecuted phases after a proven zero-read environment failure."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_LIVE24';seat='/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_LIVE23','GUIDE_LIVE22','GUIDE_LIVE21','GUIDE_HARNESS_REVIEW23','GUIDE_HARNESS_FIX23','GUIDE_RUNTIME7']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent not in ['GUIDE_LIVE21','GUIDE_LIVE22','GUIDE_LIVE23']:assert r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_HARNESS_FIX23-manifest.json')['artifacts']))
contract_path=E/'GUIDE_HARNESS_FIX23-command-contract.json';assert sha(contract_path)=='7502ed0d8bb8618e4ba56c2157efd24a5d9af92258b91ebc90d4ef6c82727c9c';contract=read(contract_path)
phases={k:v for k,v in contract['phases'].items() if k in ['capacity','gate','rowProof','capture','idle']}
assert len(phases)==5 and all(v['argv'][-1]==str(contract_path) for v in phases.values())
assert all(not Path(v['output']).exists() for v in phases.values())
assert not Path(contract['actualReceipt']).exists() and not Path(contract['browserProfile']).exists()
files=list(dict.fromkeys(files));ticket=create(node,'supply supported private environment and resume five unexecuted phases','GUIDE_LIVE23',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
commands='\n'.join(str(i+3)+'. '+' '.join(v['argv']) for i,v in enumerate(phases.values()))
packet=f'''# PACKET {node} — existing Support connection selection and remaining live phases

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; literal contract: {contract_path}; sole heavy, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite direct execution logs); {O}/probes/{node}/ (new, minimal environment/command adapter); {E}/GUIDE_LIVE21-capacity.json (new); {E}/GUIDE_LIVE21-gate.json (new); {E}/GUIDE_LIVE21-row-proof-status.json (new); {E}/GUIDE_LIVE21-capture.json (new); {E}/GUIDE_LIVE21-idle.json (new); {E}/GUIDE_ROW_PROOF-run-LIVE21.json (new); {E}/GUIDE_LIVE_GUIDE21- (new); {O}/logs/GUIDE_LIVE21-gate.log (new); {O}/logs/GUIDE_LIVE21-row-proof.log (new); {O}/logs/GUIDE_LIVE21-capture.log (new); {O}/logs/GUIDE_LIVE21-idle.log (new); {contract['browserProfile']} (new, sealed actual profile); {O}/agent-reports/{node}.md (new); existing supported local-development connection source may be parsed privately for the required connection and passed in child environment only.
- forbidden: product, Git, KB, harness source, configuration or prior evidence edits; private records, connection values in outputs/artifacts, private ongoing logs, credentials/account/recovery actions; quota/counter changes, identity switching, unrelated services; extra capacity samples, failed-row retries, oracle changes, owner questions or acceptance.
- verification: retain current LIVE21 phase1 five-transition PASS and phase2 TLS/custody PASS by exact hashes, then execute previously unexecuted phases3–7 once. The prior measured attempt failed on a proven connection-selection error before producing a capacity artifact. This is one corrected-connection frame, not sampling for favorable limits. Preserve cumulative prior1status/1DBquery attempt explicitly.

## 3. Work
LIVE21 and LIVE22 stopped before any read. LIVE23 successfully parsed the private source and performed one status read plus one counts-query attempt, which failed42501 because generic DATABASE_URL lacks support-schema access. Retain that as a measured but incomplete attempt, not zero-read. No complete capacity artifact or Support/model traffic exists. LIVE22 established that the broad API-process environment loader rejects an unrelated provider-panel target set before any reader call. Use readPrivateEnvironment and parseExactEnvironment from apps/runner/src/dev-api-process.ts with DEVELOPMENT_API_ENVIRONMENT_KEYS from apps/runner/src/dev-api-environment.ts, as identified in the handoff. If the helpers are not exported, a minimal local adapter may reproduce their exact bounded file/permission/ordered-key parsing using public source anchors; do not modify product exports, evaluate rewritten modules or invoke unrelated whole-process validators. Use this narrow reader to obtain only SUPPORT_DATABASE_URL, proven by apps/api/src/main.ts supportPool/supportRelayLeasePool, apps/runner/src/dev-database-principals.ts debateai_dev_support and apps/runner/src/support-status-cli-credentials.ts SUPPORT_KEY from product-worktree .local/dev-auth/api.env. Do not select generic DATABASE_URL again, guess a key/credential, change roles or permissions, or use an unproven higher-privilege connection. Preserve file ownership/permission/parser checks and validate the required connection shape. Do not invoke the unrelated API-process/provider-panel validator for this counts-only reader, alter its configuration, or print/hash private contents. Record parser/source names only. Do not presume environment values survive between tool invocations. Loading the existing authorized local development connection privately for this read-only test is permitted; do not print, persist, hash, export or include its value in artifacts. Record source/loader names only. Use the repository-supported environment flow and pass the value directly in child environment; no guessed new credential, process-environment dump, configuration change, private-log read or user question. If the existing source cannot be resolved, stop before any status read with exact missing source fact.

Before any operation, mechanically verify the variable is present with accepted connection shape in the actual child environment, without emitting its value. Prepare the complete sequential invocation and absence checks first. Retain the exact current successful UI/TLS evidence, verify current owned Runtime7 identity and ordinary health without restarting, and confirm all unexecuted outputs, actual screenshots/profile and deferred owner output are absent. Preserve every failed LIVE21 log. In particular use a NEW LIVE24 finite direct log for phase3 stdout/stderr, so its missing-environment failure log is never overwritten. Literal argv and built-in output paths below remain the independently reviewed final contract. Later phase logs remain the still-absent sealed paths. Record this explicit execution-log-only predecessor failure provenance; do not mutate the contract or claim phase1/2 reran.

{commands}

Verify the selected key matches the running Support-store composition and its existing grants in public source without any exploratory DB query. If this cannot be established, stop with the precise source gap. Execute phase3 exactly once with that supported private connection populated, then gate, full58 row proof and capture immediately within the same120-second freshness window, with future skew≤5seconds. No packaging pause between these. Preserve exact31 fresh requests in five sessions,27 model ceiling,14EN/17RO, all20 families, four exact owner prompts, all8 affected cases and two actual Help navigation cases. Five current capture sessions are required; six owner messages remain reserved and two owner sessions are checked only after natural expiry. No old actual answer/screenshot counts as fresh. Each row retains exact API/DOM/source/action/outcome equality and current original-pane top/footer plus labeled expanded image. Keep31second pacing and existing reviewed reset behavior.

On the first failure stop and seal exact partial phase/request/session counts with numeric status; no resampling or retry. On success finish idle custody and prepare GUIDE_LIVE24-owner-testability.json with at most6 messages across2 exposed-UI sessions, exact prompts and natural-availability timestamps. No DevTools, storage manipulation, hidden profiles, capability values or invented reset button in owner steps. Do not execute the deferred owner-capacity command or spend the reserved owner messages here. Separate actual31 review and later fresh owner availability still follow.

Send factual progress each60seconds after the freshness-critical start. Finish finite logs before manifest hashing; exclude mutable packaging and ongoing private runtime logs. Leave the preview healthy/detached and release heavy. Strongest later handoff is WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED. Forgot remains unresolved/actionless; no CP1 readiness/completion/acceptance or CP2. Keep inherited custody/typecheck and failed-attempt qualifications.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, retained phase1/2 and fresh phase3–7 provenance, actual counts/outcomes/navigation, script and natural capacity timing. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. No self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f.is_relative_to(D) or f.is_relative_to(P) or f.is_relative_to(O)],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='private supported environment correction, one corrected supported-connection capacity frame, unexecuted phases3–7 and exact31 actual requests')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; existing Support connection selection and phases3–7 only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

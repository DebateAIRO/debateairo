"""Freeze the reviewed closed39 capture with explicit retained15 provenance."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_LIVE9';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409'
parents=['GUIDE_LOCK_HANDOFF_FIX','GUIDE_CORRECTNESS9','GUIDE_SECURITY9','GUIDE_HARNESS_BIND17','GUIDE_HARNESS_REVIEW17','GUIDE_RUNTIME6','GUIDE_COMPACT_UI_PROBE6','GUIDE_LIVE8']
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-AFFECTED-LIVE-VERIFICATION-20260920.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in parents:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent not in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_LIVE8']:assert r['verdict'].startswith('PASS'),(parent,r['verdict'])
 assert receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
ticket=create(node,'execute reviewed remaining three whole groups with retained15 proof','GUIDE_HARNESS_REVIEW17',seat)
ids=read(D/'board-ids.json');board('link',ticket,ids['tickets']['GUIDE_PRODUCT']);ids['edges'].append([node,'GUIDE_PRODUCT']);write(D/'board-ids.json',ids)
harness=O/'probes/GUIDE_HARNESS_BIND17';adapter=O/'probes/GUIDE_ROW_PROOF_BIND17/replay-row-proofs.mjs';capture=harness/'capture-public-guide.mjs';readme=harness/'README.md'
gate=E/(node+'-gate.json');rowproof=E/'GUIDE_ROW_PROOF-run-LIVE9.json'
review_contract=read(E/'GUIDE_HARNESS_REVIEW17-command-contract.json')
assert review_contract['result']=='PASS_STATIC_ENTRYPOINT_CONTRACT' and review_contract['cwd']==str(L) and review_contract['gatePath']==str(gate)
rowprooflog=Path(review_contract['rowProof']['logPath']);capturelog=Path(review_contract['capture']['logPath'])
assert rowprooflog==O/'logs/GUIDE_ROW_PROOF-LIVE9.log' and capturelog==O/'logs/GUIDE_LIVE9-capture.log'
signature='const [gatePath,expectedRevision,outputPath,...extra]=process.argv.slice(2);';anchors=[i+1 for i,line in enumerate(adapter.read_text().splitlines()) if signature in line];assert len(anchors)==1,anchors
# BIND17 README describes the gate but omits literal argv. The actual adapter
# signature above and the reviewed LIVE9 packet bind the explicit TS loader.
assert readme.is_file() and capture.is_file()
template=read(E/'GUIDE_LIVE8-gate-template.json');template['finalCommit']=revision
for key,path in [('productInventory',E/'GATE_GUIDE_FINAL9-manifest.json'),('attestation',E/'GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json'),('requiredSuiteReceipt',E/'GUIDE_LOCK_HANDOFF_FIX-required-suites.json'),('controlProof',E/'GUIDE_HARNESS_BIND17-control-proof.json')]:template[key+'Path']=str(path);template[key+'Sha256']=sha(path)
assert len(template)==16 and template['expectedEntryCount']==44 and template['forgotConnector']=={'status':'UNRESOLVED_ACTIONLESS'} and template['runtimeLogPath']==str(O/'logs/GUIDE_LIVE7-stack.log')
tpath=E/(node+'-gate-template.json');assert not tpath.exists();write(tpath,template)
contract_path=E/(node+'-command-contract.json');assert not contract_path.exists()
contract={'schemaVersion':1,'revision':revision,'cwd':str(L),'rowProof':{'script':rec(adapter),'argv':['node','--import','tsx',str(adapter),str(gate),revision,str(rowproof)],'output':str(rowproof),'log':str(rowprooflog)},'capture':{'script':rec(capture),'argv':['node','--import','tsx',str(capture),str(gate)],'output':str(E/'GUIDE_LIVE_GUIDE17-actual-receipt.json'),'log':str(capturelog)},'plannedRetainedRows':15,'plannedFreshRows':39,'plannedFreshSessions':3,'executed':False}
for step in ['rowProof','capture']:
 assert contract[step]['argv']==review_contract[step]['argv'] and contract[step]['log']==review_contract[step]['logPath']
 assert not Path(contract[step]['output']).exists() and not Path(contract[step]['log']).exists()
assert contract['capture']['output']==review_contract['capture']['builtInReceipt'] and review_contract['capture']['builtInScreenshotCount']==39
write(contract_path,contract)
files.extend([tpath,contract_path,readme,adapter,capture]);files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — exact39 actual requests and retained15 complete-group provenance

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained worker/verification BODY skills. Assigned ticket/comments before work; root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; frozen16-key template: {tpath}; exact command contract: {contract_path}; sole heavy, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {E}/GUIDE_LIVE_GUIDE17-actual-receipt.json (new); {E}/GUIDE_LIVE_GUIDE17-row- (new,39 fixed screenshots); {rowproof} (new); {rowprooflog} (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new, minimal wrappers for sealed readers/commands); {harness}/browser-profile (new, temporary sealed profile); {O}/agent-reports/{node}.md (new); read-only owned lifecycle metadata.
- forbidden: product, Git, KB, harness or prior evidence edits; installs; configuration/model changes; unrelated services; real credentials/private records/account/reset actions; private ongoing log reads/hashes/export, rejected drafts, headers or capability values; quota/counter changes; TLS bypass; owner questions/acceptance.
- verification: one composed all54 row proof and one exact39 actual capture under the reviewed fixed plan. No broad test repeat, favorable samples, retries or extra capacity read. Stop on first failure and preserve evidence.

## 3. Work
Consume GUIDE_HARNESS_REVIEW17 explicitly approving the15 retained plus39 fresh complete-group plan. If the sealed author/reviewer output instead requires full54 or leaves retention unproved, stop before any runtime/capacity activity; this packet cannot select an alternate plan. The only retained rows are complete LIVE8 groups1+2. Freshly execute all of groups3+4+5 (13,12,14); the five partial third-group rows are rerun, never used to fill the fresh count. LIVE8 remains failed. All54 coverage must have explicit segment provenance; never describe54 freshly executed.

Revalidate clean152, RUNTIME6 current owned supervisor identity/cwd/command/listener ancestry and ordinary system TLS https://localhost:3100/help200. Preserve9 unrelated listeners and the owned12-port stack. Reuse PID/PGID77769 only if ownership evidence still matches; never rely on PID alone. Existing private {O}/logs/GUIDE_LIVE7-stack.log is excluded from reads/hashes/artifacts. Do not restart a healthy stack for capture. Stop and route any lifecycle mismatch.

Prepare wrappers, output-absence checks and syntax BEFORE capacity. Mechanically assert the exact script path/hash/bytes, argv, cwd, output and log against {contract_path}; both sealed READMEs omit literal commands, and the separate review requires this explicit operational binding. Use {rowprooflog} (new) and {capturelog} (new) as direct stdout/stderr destinations, preserving numeric child status. Any mismatch stops before capacity or traffic. Verify all reviewed GUIDE17 future outputs and profile absent; do not delete collisions. Retained original GUIDE16 artifacts remain at their original names/hashes. Invoke the sealed runtime-capacity reader exactly once: one supported statusGET and one counts-only aggregate, no identifiers/raw records/credentials or extra calls. Materialize new {node}-runtime-capacity.json then {gate} by adding only runtimeCapacityPath and runtimeCapacitySha256 to the frozen template; exactly18keys, fresh≤120seconds and future skew≤5seconds.

Require the reviewed exact fixed-plan predicates: capacity for3 actual new sessions,39 actual messages across13/12/14 groups, zero recent10minute messages, at least14 per session,84characters, conservative42 model calls, relay/queue≥1, injection threshold≥2, no cooldown/waiters. Honor any stricter unchanged reviewed predicate. These are measured remaining capacities under unchanged application limits, not overrides. A failed gate stops before traffic without reread. Planning expiry is not a measurement.

Actual adapter signature at {adapter}:{anchors[0]} — `{signature}`. From product cwd, run:

```sh
node --import tsx {adapter} {gate} {revision} {rowproof} # (new)
```

Require all54 logical row proofs plus exact retention/fresh-plan checks. Within the SAME120second capacity freshness window, run once:

```sh
node --import tsx {capture} {gate} # (new)
```

Use direct bounded stdout/stderr capture and record numeric child exit status; no tee masking or missing loader. Fresh39 requests use31,000ms monotonic pacing (at least19m38s between first and last sends), canonical order,3 complete sessions and existing reset rules. Preserve scoped full/compact locales, hydration/mode/compact helpers, no-private-controls, injection, private-data and recovery handling, both pointer/keyboard closed public navigation paths, API/DOM equality and fixed origin diagnostics. Retain PROBE6 actual transition proof only by reviewed unchanged defining behavior; no extra browser probe. No hidden resets, private controls or account operations.

Send factual root progress each60seconds. On failure stop immediately, seal partial fresh evidence and keep retained15 separate; do not convert partial fresh rows into completed groups or retry. On success write {E}/{node}-coverage-manifest.json (new), binding all39 actual rows/screens/navigation and exact15 retained rows into explicit complete54 coverage with no missing/duplicate canonical case. Recheck original hashes; never copy or relabel old screenshots as fresh. Separate accepted model drafts, reviewed fallbacks and deterministic replies.

Prepare a short manual script using observed public rows for Dialectical-Engine, free text/menu help, EN/RO, privacy/injection boundaries and explicit unresolved Forgot. It must work from the owner's Help tab with exposed UI steps only: no invented reset button, hidden profile, DevTools or stored capability. Count exact required sessions and every message, including language changes; keep the script focused enough for actual natural remaining capacity. Write {E}/{node}-owner-testability.json (new) with the exact script and session/message requirements. Record actual new-session times and conservative next availability from measured limits and this39-send run, without another capacity read or claiming current availability from help200. Independent GUIDE_PRODUCT review follows; GUIDE_TESTABILITY5 performs one later fresh manual-capacity frame. Leave owned runtime healthy and release heavy. No CP1 ready/complete/acceptance, no CP2; only the bounded unresolved-Forgot preview handoff may become eligible.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, retained15/fresh39 coverage, actual outcomes/origins/navigation, custody, manual counts and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and ongoing private log. Release heavy; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='one supported fresh capacity frame; exact reviewed39 actual sends with retained15 provenance; no retries/overrides')

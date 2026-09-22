"""Freeze one exact actual capture only after final technical, harness and runtime gates."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_LIVE7';seat='/root/preview';revision=receipt_revision(read(E/'GUIDE_LOCK_HANDOFF_FIX-receipt.json'));ticket=read(D/'board-ids.json')['tickets'][node]
parents=['GUIDE_LOCK_HANDOFF_FIX','GUIDE_CORRECTNESS9','GUIDE_SECURITY9','GUIDE_HARNESS_BIND12','GUIDE_HARNESS_REVIEW11','GUIDE_RUNTIME6','GUIDE_LIVE6']
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in parents:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent not in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_LIVE6']:assert r['verdict'].startswith('PASS'),(parent,r['verdict'])
 if parent!='GUIDE_LIVE6':assert receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
harness=O/'probes/GUIDE_HARNESS_BIND12';adapter=O/'probes/GUIDE_ROW_PROOF_BIND12/replay-row-proofs.mjs'
signature='const [gatePath,expectedRevision,outputPath,...extra]=process.argv.slice(2);';anchors=[i+1 for i,line in enumerate(adapter.read_text().splitlines()) if signature in line];assert len(anchors)==1,anchors
readme=harness/'README.md';assert 'node --import tsx' in readme.read_text()
template=read(E/'GUIDE_LIVE6-gate-template.json');template['finalCommit']=revision
for key,path in [('productInventory',E/'GATE_GUIDE_FINAL9-manifest.json'),('attestation',E/'GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json'),('requiredSuiteReceipt',E/'GUIDE_LOCK_HANDOFF_FIX-required-suites.json'),('controlProof',E/'GUIDE_HARNESS_BIND12-control-proof.json')]:template[key+'Path']=str(path);template[key+'Sha256']=sha(path)
template['runtimeLogPath']=str(O/'logs/GUIDE_LIVE7-stack.log');assert len(template)==16 and template['expectedEntryCount']==44 and template['forgotConnector']=={'status':'UNRESOLVED_ACTIONLESS'}
tpath=E/(node+'-gate-template.json');assert not tpath.exists();write(tpath,template);files.extend([tpath,readme,adapter]);files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
gate=E/(node+'-gate.json');rowproof=E/'GUIDE_ROW_PROOF-run-LIVE7.json';capture=harness/'capture-public-guide.mjs'
packet=f'''# PACKET {node} — one actual54 capture at corrected product

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained actual BODY worker/verification skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; gate template: {tpath}; sole heavy, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {E}/GUIDE_LIVE_GUIDE12-actual-receipt.json (new); {E}/GUIDE_LIVE_GUIDE12-row- (new,54 fixed screenshots); {rowproof} (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, bounded capture logs); {O}/probes/{node}/ (new, minimal wrappers invoking sealed fixed-key reader); {harness}/browser-profile (new, temporary sealed-harness profile); {O}/agent-reports/{node}.md (new); own supported preview lifecycle metadata only.
- forbidden: product, source, Git, harness or prior evidence changes; installs; model/provider/configuration changes; unrelated services; actual credentials/private records/account/reset actions; synthetic Support overrides; TLS bypass; raw private logs, rejected drafts, headers or capability values in artifacts; quota/counter changes; owner questions/acceptance.
- verification: sole heavy for one final composed row proof and one actual finite capture. Existing full-suite/typecheck/eval/inert proofs (retained112 plus actual-bound-input regression) are sealed; do not repeat broadly. No retries or favorable resampling. Stop and preserve any failure. Never mutate the sealed template/harness.

## 3. Work
Consume exact GUIDE_RUNTIME6 identity. Revalidate clean revision, current owned supervisor/listener ancestry and ordinary system TLS help200; preserve unrelated current services. Reuse the healthy detached corrected runtime and existing private GUIDE_LIVE7-stack.log without truncation, raw export or file hash. Do not restart just for capture. A lifecycle/ownership discrepancy stops for routing, never improvised kills or extra startup. Leave the owned stack healthy after browser close and ordinary short idle.

Prepare all wrappers and syntax checks BEFORE the fresh capacity read. Require all fixed GUIDE12 outputs (actual receipt,54screens) and browser-profile absent; do not remove any collision. Prior GUIDE9 partials and BIND10 preparation stay immutable. Invoke the sealed readGuideRuntimeCapacity exactly once using its documented one supported statusGET and one counts-only aggregate on the owned development read connection. No identifiers/raw records/credentials; no extra status or capacity read. Preserve normal5session/hour and all other observed limits. Natural quota expiry calculations from failedLIVE6 are historical; only this fresh read establishes current availability. Do not hold heavy while waiting for natural capacity.

Write new {node}-runtime-capacity.json and materialize new {node}-gate.json by adding exactly runtimeCapacityPath and runtimeCapacitySha256 to the frozen16-key template. Verify all static values unchanged, exactly18keys, fresh≤120seconds and future skew≤5seconds. Require5free sessions, zero recent10minute messages,54daily message headroom, at least14/session,84characters,42model call headroom, relay/queue≥1, injection threshold≥2, no cooldown/waiters; preserve the sealed reader's exact predicates. Stop before traffic on any failure, with no favorable reread or limit change.

Actual adapter signature re-read at {adapter}:{anchors[0]} — `{signature}`. From the product cwd, run the exact loader command and require ALL_ROWS_PASS for all54 at this revision/digest:

```sh
node --import tsx {adapter} {gate} {revision} {rowproof} # (new)
```

Then, within the SAME120second capacity freshness window, run exactly once:

```sh
node --import tsx {capture} {gate} # (new)
```

Use new allowed captured stdout/stderr logs; never omit the TypeScript loader. The pre-request verifier must prove revision, cumulative FINAL9 inventory, strict44 corpus, exact34 suite receipt, reviewed control proof including actual-bound-input regression and every row branch/source/action. Capture all54 canonical rows in the sealed five-session1/14/13/12/14 plan at31,000ms monotonic pacing (at least27m23s). Preserve40menus EN/RO,2private,2injection and10recovery identities, unchanged42MODEL ceiling, all source/outcome/oracle rules, both pointer/keyboard closed public navigation paths, language/session transitions and full/compact UI. Only support conversation storage key may be reset through sealed lifecycle; no private controls, real credentials or account operations. Record actual accepted drafts, reviewed fallback and deterministic origins separately with API/DOM equality and fixed safe diagnostic projection. Missing diagnostics remain unknown; no raw private exception/body export.

Send root factual progress at least each60seconds with completed count/failure, no favourable retries. If a request fails, stop immediately and seal partial actual evidence exactly in place; no overwriting/renaming, no retrospective attribution to old failures.

After successful actual capture prepare a short manual script for product identity, free-text menus, EN/RO and explicit recovery limitation using observed rows, with no unplanned Support requests. Make it usable from the owner's existing Help tab: identify any necessary exposed UI refresh/new-conversation/language step from actual product evidence; do not invent a reset control or require a hidden harness profile, console command or stored capability. Count every required fresh session. Write new {node}-owner-testability.json with script, required fresh sessions and per-language messages, observed limits/counts, actual session creation timestamps and conservative natural-capacity notBeforeUTC. Calculate whether owner can test after this five-session capture; do not claim immediate testability from help200. Do not perform an extra capacity read here or change counters. Root will wait for natural availability and route one fresh final check separately. Leave healthy preview running. Only independent working-preview status may eventually apply; Forgot stays unresolved/actionless and CP1 incomplete, no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, all actual rows/outcomes/origins, pretraffic checks, navigation/lifecycle/idle/manual and limits. Receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and ongoing private log. Release heavy; no self-close, readiness or acceptance.
'''
(P/(node+'.md')).write_text(packet)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='one fresh supported counts-only readiness and one reviewed finite actual54 capture; no retries or overrides')

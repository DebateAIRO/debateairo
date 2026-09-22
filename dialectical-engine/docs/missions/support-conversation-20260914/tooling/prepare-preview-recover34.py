"""Resume the exact paid startup diagnostic after explicit owner approval."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PREVIEW_RECOVER34';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
approval=D/'decisions/GUIDE-OWNER-STARTUP-APPROVAL-20260921.md';assert not approval.exists()
approval.write_text('''# Explicit owner approval — startup provider requests

The assistant asked permission for up to two paid Z.AI/GLM startup requests using existing configured credentials, each containing only: “HERMES-SUPPORT acceptance transport handshake. Reply with the single word: OK”. The first diagnoses the startup failure; only after success and cleanup does starting the full preview send the second. Automatic approval review had rejected this action pending explicit authorization for the payload, destination and paid side effect. No request had been sent.

The user then replied verbatim: “approved”. This authorizes those two bounded startup requests in the current task. It does not authorize provider, model, credential, configuration or quota changes, additional diagnostic retries, or an arbitrary external payload. Preserve the original bounded diagnostic safeguards and report actual attempts honestly. Existing separately authorized Support verification remains its fixed scope after successful recovery and independent binding review.
''')
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',approval,E/'GATE_GUIDE_FINAL18-manifest.json',P/'GUIDE_PREVIEW_RECOVER33.md',P/'GUIDE_PREVIEW_RECOVER33_HANDSHAKE.md']
for parent in ['GUIDE_PREVIEW_RECOVER33','GUIDE_PREVIEW_BIND32','GUIDE_FINANCIAL_FALLBACK_REVIEW2','GUIDE_CAPTURE_FIX30','GUIDE_CAPTURE_REVIEW30']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREVIEW_BIND32-manifest.json')['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'run explicitly approved startup diagnostic and restore reviewed preview','GUIDE_PREVIEW_RECOVER33',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — explicitly approved startup recovery

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills. Root persisted claim proxy. No floor reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite sanitized logs); {O}/logs/GUIDE_RUNTIME9-stack.log (new, PRIVATE ongoing log, excluded from reads, hashes, artifacts and freezes); {O}/agent-reports/{node}.md (new); repository-supported owned lifecycle files.
- forbidden: product, Git, KB, old evidence or old harness edits; private values or raw logs; Support, status, capacity or application DB traffic; account and recovery actions; quota, identity, provider, model or configuration changes; unrelated services; extra diagnostic inference or blind restarts; owner questions and acceptance.
- verification: sole heavy for the two explicitly approved startup handshake attempts at most, necessary changed-binding controls, supported lifecycle and ordinary system TLS. No product Git lease. Existing supported lifecycle data-plane health operations remain allowed; no application-record or quota inspection.

## 3. Work
Owner approval is explicit in {approval}; quote it in any require_escalated justification for the previously rejected action. RECOVER33 was blocked before process creation and consumed with zero new requests. The underlying fixed code remains DEV_AUTH_STACK_SUPPORT_MODEL_FAILED. No Runtime9 exists; Runtime7 is stopped and failed Runtime8 gone. Do not reread private logs, repeat metadata investigation, repeat unchanged product tests or ask permission again.

Use the exact RECOVER33 diagnostic implementation from {O}/probes/GUIDE_PREVIEW_RECOVER33/diagnose-support-model-stage.mjs, copying only to the new node namespace and mechanically changing node, ticket and output path. Keep source imports, exact CLI environment/profile semantics, the supported startSupportModelRelay operation, source-enumerated error allowlist, existing180000ms timeout and private data safeguards unchanged. Verify source and target differ only by these identities. With DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview, run this bounded diagnostic ONCE via absolute Node --import tsx from exact cwd, require_escalated and tool-captured sanitized stdout/stderr. Do not pre-open its output or use shell redirection. The sole external prompt is exactly: HERMES-SUPPORT acceptance transport handshake. Reply with the single word: OK. Destination is the already-configured Z.AI/GLM provider, existing credentials, paid inference. This is authorized request1 of at most2 startup requests. If it fails, stop, send fixed outcome and seal finite evidence. No second diagnostic or alternate paid payload.

On diagnostic success, its returned relay stop must complete and port8894 be verified free. Then run the original packet's ONE full repository-supported Runtime9 start through pnpm dev:auth:up, DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview, exact current checkout, private0600 new log and detached supervisor. This performs the same existing startup handshake, authorized request2. Preserve data, counters, provider, model and configuration. No bare or partial server substitute. Do not stop unrelated processes or reuse a historical PID. If full start fails, retain safe fixed outcome and stop without a third request. Runtime startup handshakes count as model traffic separately from Support-answer traffic; do not call them zero model traffic. Normal supported lifecycle may perform its established local data-plane health checks.

On healthy recovery complete the append-only operator binding originally scoped by RECOVER33, now under this node. Retain BIND32 current-product full58 proof and all FIX30 screenshot controls; do not rerun unchanged product suites or screenshot fixtures. Change only node paths, final runtime identity and mechanically necessary hashes or metadata. Product0d34, FINAL18, KB7ef and44 entries remain unchanged. Authoritative support-preview API port is8890; correct any stale8787 metadata against public source without changing actual configuration. Required listeners3100,3101,55433,7177,8988 and8890 through8896. Verify normal system-TLS https://localhost:3100/help HTTP200 and short-idle detached ownership with unrelated services preserved. Use exact11-key runtime custody schema. Current API KB confirmation remains the later single fresh status and capacity frame.

Produce final command-contract, operator-contract, runtime-custody-contract, actual runtime custody and owner-capacity-contract under this node prefix. Retain unused LIVE29 outputs, phase logs, gate, row-proof, UI, profile and actualGUIDE22 screenshots. Verify full123 future absence set including rowProof.result and owner walkthrough. Retain exact31 ordering, five sessions,14EN and17RO,max27modelcalls,31sec pacing and fresh58 proof-before-capture gate. Keep screenshot helper byte-identical824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29. Run only changed final binding controls. Preserve absolute Node --import tsx, exact cwd, require_escalated execution, all seven literal argv self paths, distinct operator-owned logs after child exit, and narrow memory-only SUPPORT_DATABASE_URL to GUIDE_COUNTS_ONLY_DATABASE_URL with existing debateai_dev_support principal. Rebind deferred owner6messages and2sessions command, retaining GUIDE_LIVE21-owner-capacity.json absent. Final manifest must include exact final inputs and contracts, and retained proof provenance; do not omit dependencies needed for root mechanical preparation.

No actual seven-phase capture here. Independent final operator and runtime review follows before the fixed paid31. Leave successful preview detached and healthy. Return PASS_RECOVERED_BOUND_REVIEW_REQUIRED or concrete failure, exact attempt counts, immutable finite artifacts and released heavy. Forgot remains unresolved; no CP1 readiness, completion or acceptance and no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, exact fixed diagnostic and runtime verdict, changed binding controls and finite receipts. Strict node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding receipt and private or mutable logs. Release heavy; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='explicitly approved diagnostic startup handshake then supported recovery handshake on success; at most2; necessary final binding; no Support or quota traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; user explicitly approved two bounded startup requests.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
s=read(E/'COORDINATOR-CURRENT.json');s.update({'updatedAt':now(),'active':[node],'activeNode':node,'activeAgent':seat,'ticket':ticket,'adminFreeze':commit,'heavyLease':node,'gitLease':None,'next':'Run explicitly approved startup diagnostic, recover preview on success, independent binding review, fresh31 and natural owner capacity.'});s['runtime'].update({'state':'EXPLICIT_APPROVAL_RECEIVED_DIAGNOSTIC_PENDING','recoveryNode':node,'approvalRequested':'APPROVED by user; exact bounded two-request scope recorded in decision.'});write(E/'COORDINATOR-CURRENT.json',s)
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Bounded recovery of the reviewed product's failed owned preview start."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PREVIEW_RECOVER33';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json',P/'GUIDE_PREVIEW_BIND32.md']
for parent in ['GUIDE_PREVIEW_BIND32','GUIDE_FINANCIAL_FALLBACK_REVIEW2','GUIDE_FINANCIAL_FALLBACK_FIX2','GUIDE_CAPTURE_FIX30','GUIDE_CAPTURE_REVIEW30']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_FINANCIAL_FALLBACK_REVIEW2':assert read(rp)['verdict']=='PASS_FINANCIAL_REVIEWED_FALLBACK'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREVIEW_BIND32-manifest.json')['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'diagnose failed owned start and restore reviewed preview','GUIDE_PREVIEW_BIND32',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f"""# PACKET {node} — bounded owned preview recovery

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills. Root persisted claim proxy. No floor reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite sanitized logs); {O}/logs/GUIDE_RUNTIME9-stack.log (new, PRIVATE ongoing log, excluded from all reads, hashes, artifacts and freezes); {O}/agent-reports/{node}.md (new); repository-supported owned preview lifecycle files.
- narrow closed-log exception: {O}/logs/GUIDE_RUNTIME8-stack.log may be locally filtered once as specified below; no raw content, hash or export. All other private logs remain forbidden.
- forbidden: product, Git, KB, old evidence or old harness edits; private credential values in output; raw private log content; status, capacity, DB-query, Support or model traffic; owner walkthrough; quota, identity, configuration, model or provider changes; unrelated services; owner questions or acceptance.
- verification: sole heavy for bounded diagnosis, necessary changed-binding controls, supported corrective owned lifecycle and ordinary system-TLS health only. No product Git lease. Existing supported lifecycle may use its established data-plane startup checks; no application-data inspection or quota queries.

## 3. Work
BIND32 offline17 controls and current-product full58 passed. Product review PASS and FINAL18 stand. Runtime7 was safely stopped; Runtime8 PID82483 exited, all transient ports absent, Docker data plane and unrelated services retained. Do not repeat old Runtime7 stop. No retry has occurred and no paid31 has started. Diagnose this exact failure before any new start.

First inspect current public supported startup code, especially dev-auth-stack-cli.ts, dev-auth-stack.ts and support-preview profile. Build a finite allowlist of literal public DEV_* error codes, including finite generated stage codes only when supported by source. For zero-new-start diagnosis, an explicitly authorized local extractor may open only the exact closed failed Runtime8 log after verifying O_NOFOLLOW regular own-UID0600 nlink1 file, bounded size, failed process gone, and no open writer. Read locally in memory; retain only full error-code chains whose individual tokens appear in that source-derived allowlist. Discard all other bytes; never print, hash, copy, persist or send raw log content to the model. Do not use arbitrary regex matches as an output allowlist. Preserve original file. The only public diagnostic projection is fixed error codes and safe validation booleans. Record truthfully that this one closed log was locally filtered; BIND32's earlier unread claim remains historically correct. Active and other logs remain unread and unhashed.

Use the resulting fixed code and public source to isolate the cause. If no fixed code is available, report a concrete narrowly scoped next diagnostic seam rather than blind retry. A causally justified corrective start may fix invocation or owned lifecycle orchestration only; no product or configuration edits. If product or configuration change is necessary, report the exact dependency and stop. Do not build a replacement server or relax readiness. Use the existing supported DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview pnpm dev:auth:up lifecycle. Preserve data, counters, provider and model choices. Any corrective Runtime9 start must have a new private0600 log and exact owned process custody. Execute process inspection and lifecycle via require_escalated. Do not inspect environment values or command lines that can include secrets. Retain a safe fixed-code projection or numeric child-exit evidence for a failure without raw logs. One causally justified corrective start, no blind repeated restarts.

On successful recovery create an append-only successor of BIND32 final operator and contracts. Change only recovery-node paths, final runtime identity and mechanically necessary binding hashes or metadata. Product0d34, FINAL18, KB7ef and all44 entries unchanged. Verify authoritative public profile uses API8890; correct any inherited8787 metadata against source without changing actual configuration. Required owned listeners3100,3101,55433,7177,8988,8890 through8896. Ordinary system-TLS https://localhost:3100/help must return200, then short-idle ownership. Use exact11-key runtime custody schema. API KB confirmation remains the later single fresh status and capacity frame.

Retain consumed current full58 proof rather than rerun unchanged product tests. Retain all FIX30 screenshot controls and byte-identical helper824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29. Re-run only changed final binding controls. Retain unused LIVE29 phase, output, gate, row-proof, UI and profile paths and actualGUIDE22 screenshot namespace; all123future paths including rowProof.result and owner walkthrough must remain absent. Retain exact31 ordering, five sessions,14EN and17RO,max27modelcalls,31sec pacing and proof-before-capture gate. Operator owns distinct logs after child exit; absolute Node --import tsx, exact cwd, require_escalated, no shell redirection or pre-opened output. Preserve narrow memory-only SUPPORT_DATABASE_URL to GUIDE_COUNTS_ONLY_DATABASE_URL, expected debateai_dev_support principal. Rebind deferred owner command to new runtime, retaining future GUIDE_LIVE21-owner-capacity.json and6messages with2sessions. Verify all seven literal argv self paths. Seal executable exact final command, not a draft to regenerate later.

No actual seven-phase run here. Stop at real failure and preserve finite sanitized evidence. On success leave healthy stack detached, return PASS_RECOVERED_BOUND_REVIEW_REQUIRED with safe diagnosis, supported recovery, final operator and runtime contracts and all exact hashes. Final independent runtime and operator review follows; only then paid31. Natural bound from LIVE28 elapsed but is not capacity PASS. Forgot remains unresolved; no full CP1 readiness, completion or acceptance, no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, exact diagnosis, changed controls and runtime verdict, actual finite receipts. Strict node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding receipt and all private or mutable logs. Release heavy; no self-close or acceptance.
"""
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='closed Runtime8 fixed-code filtering; bounded supported owned recovery; changed binding only; no Support or quota traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded owned preview recovery; no paid traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
state=read(E/'COORDINATOR-CURRENT.json');state.update({'updatedAt':now(),'active':[node],'activeNode':node,'activeAgent':seat,'ticket':ticket,'adminFreeze':commit,'heavyLease':node,'gitLease':None,'revision':revision,'productRevision':revision,'next':'Consume RECOVER33, independent final operator and runtime review, fresh actual31, actual answer review, natural owner capacity.','runtime':{'state':'RUNTIME8_EXITED_TRANSIENT_PORTS_ABSENT','runtime7':'stopped with verified custody','runtime8Pid':82483,'dataPlanePreserved':True,'unrelatedPreserved':True,'recoveryNode':node,'closedFailedLogAuthorization':'source-derived fixed-code local projection only'},'guidePreviewBind32':{'verdict':'FAIL_RUNTIME8_SUPERVISOR_EXITED_REVIEW_REQUIRED','consumptionSha256':sha(E/'GUIDE_PREVIEW_BIND32-consumption.json'),'full58':'PASS','binding17':'PASS'},'latestEta':'Startup unresolved; roughly one hour of final verification after successful recovery due natural session availability.'});write(E/'COORDINATOR-CURRENT.json',state)
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

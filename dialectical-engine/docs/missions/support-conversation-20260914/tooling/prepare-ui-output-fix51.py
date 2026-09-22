"""Prepare the bounded correction for LIVE38's real UI-child path rejection."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_UI_OUTPUT_FIX51';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json',E/'GUIDE_LIVE38-explicit-approval-20260922.json']
for parent in ['GUIDE_LIVE38','GUIDE_PREFLIGHT_SCHEMA_FIX49','GUIDE_PREFLIGHT_SCHEMA_REVIEW49','GUIDE_OPERATOR_CWD_BIND50','GUIDE_OPERATOR_CWD_REVIEW50','GUIDE_CAPTURE_PANE_REVIEW48']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp);assert receipt_revision(r)==revision
 assert r['verdict']=='FAILED_PREFLIGHT_UI_OUTPUT_PATH_BINDING_ZERO_TRAFFIC' if parent=='GUIDE_LIVE38' else r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREFLIGHT_SCHEMA_FIX49-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'bind real UI child paths to selected reviewed contract','GUIDE_LIVE38',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — real UI-child path binding correction

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY, debugging and verification skills. Root persisted claim proxy. No new agents or delegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for finite offline controls, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, prompts, decisions or prior evidence edits; runtime, browser, HTTP, status, capacity, DB, Support or model requests; private logs/credentials; future LIVE39 operational outputs; startup/restart; user questions or acceptance.
- verification: offline execution of the real changed child validation with exact selected caller argv; stop before custody/process/browser/private preparation. No broad product, logical58, UI replay or unrelated control reruns.

## 3. Work
LIVE38 launched once with explicit user approval, then stopped with numeric preflight1 before browser or any operational traffic. The selected FIX48 ui-transition-live-preflight.mjs accepts only hard-coded LIVE37 or old control output paths, while the reviewed caller correctly supplies fresh LIVE38. Its profile selection is tied to the same stale path. Preserve every LIVE38 failure artifact and the separate approval-rejection record. All11 retained replies are unchanged and all20 questions remain unsent. No runtime health assertion can be inferred from this failure.

Correct only the real child output/profile binding and necessary caller/contract plumbing. Derive the closed operational paths from the selected reviewed contract or equivalently authenticated caller binding; do not add another fragile hard-coded run suffix, broadly accept arbitrary paths, or relax exclusive writes and lifecycle checks. Keep a distinct closed control-path mode. The real selected phase, real child argv, actual path/profile validator and final command metadata must agree. Preserve compiled UI behavior, interception, 0600 proof writer, custody, schema2, 11 retained/20 remaining, phase ordering and all unrelated PASS dispositions.

Exercise the REAL child's affected startup validation with the exact planned argv/path binding through a deterministic offline boundary before custody/process/browser operations. Show the predecessor rejects the fresh operational output, the corrected child accepts the selected closed output and profile, and mismatched/unselected output/profile or contract binding rejects before side effects. A stand-in validator, import-only test or caller-boundary interception alone is insufficient. The offline exit must occur only after the same validation the operational child runs. Do not execute the browser or write LIVE39 operational files. Inspect other literal output/profile assumptions only along this directly affected caller-child chain and correct any same-cause mismatch together.

Bind fresh LIVE39 phase/prerequisite/stop/proof/UI/profile/log paths and GUIDE_LIVE39-composed31-manifest.json. Keep actual GUIDE26 unused and selected; owner GUIDE_LIVE21-owner-capacity.json and GUIDE_LIVE25-owner-testability.json unchanged and absent. Final absolute Node --import tsx operator metadata and all children use cwd {L}. All seven argv use the final contract; bind its digest, operator-owned paths, real changed child, and full reachable module closure. Future paths remain absent. Do not run the operator or any live phase here. A later operational attempt requires root disposition of the approved run's stop and consent limits; this packet grants only offline correction.

Unchanged actual scope: compactRO18,26,34,56,58,54 then real keyboard Help navigation to fullRO43 in the SAME session; fullEN5,13,21,25,29,37,45,53; compactEN8,12,42,55,57. Exactly20 sends,3 sessions,at most17 model branches;31sec pacing;3/26/23 gate including6 owner reserve; fresh58 logical proof. Keep all11 retained plus20 new =31 across THREE actual segments/all SIX timestamps, row47 accepted single image and row10 distinct non-actual compiled replay qualification. No completed-question resend or favorable resampling.

Seal PASS_REAL_UI_OUTPUT_BOUND_REVIEW_REQUIRED or a precise finite blocker, with exact source delta, real-child control evidence and final bindings. Release heavy. Original baseline reviews only this fix and changed namespace; no repeat product audit. Forgot unresolved; no CP1 readiness/completion/acceptance or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision and finite dispositions. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L);git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='finite offline real UI-child path-binding controls; zero operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; exact UI-child path fix and offline proof only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

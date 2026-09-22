"""Review a corrected orchestration argv without changing the sealed harness."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_REVIEW14';seat='/root/baseline';revision='152eed4da1cd3e66b74d8301159ba76427552409'
ticket=create(node,'review corrected no-traffic probe output argument','GUIDE_COMPACT_UI_PROBE2',seat)
probe_ticket=create('GUIDE_COMPACT_UI_PROBE3','execute unchanged reviewed probe with corrected unique output',node,'/root/preview')
ids=read(D/'board-ids.json');board('link',probe_ticket,ids['tickets']['GUIDE_LIVE8']);ids['edges'].append(['GUIDE_COMPACT_UI_PROBE3','GUIDE_LIVE8']);write(D/'board-ids.json',ids)
probe=O/'probes/GUIDE_HARNESS_BIND14/probe-zero-request-ui.mjs'
output=E/'GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE3.json';log=O/'logs/GUIDE_UI_TRANSITION_PROBE3-LIVE8.log'
assert not output.exists() and not log.exists()
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json',probe,P/'GUIDE_COMPACT_UI_PROBE2.md']
for parent in ['GUIDE_HARNESS_BIND14','GUIDE_HARNESS_REVIEW13','GUIDE_COMPACT_UI_PROBE2']:
 receipt=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — correct the administrative probe filename contract

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained reviewer BODY skills. Assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, KB, Git, harness or prior evidence mutation; actual browser, runtime, HTTP, Support, model, status, capacity or DB activity; private records/logs; owner questions/acceptance.
- verification: finite static review and inert argument-predicate checks only; no heavy commands, source import or browser launch, no broad test repeat.

## 3. Work
The sealed UI_PROBE2 ran exactly once, rejected its output argument before browser launch, exited1 and created no output or Support request. Its packet and BIND14 packaged execution contract prescribed GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json, but unchanged executable lines16–20 accept GUIDE_UI_TRANSITION_PROBE-run- followed by the bounded suffix. Prior REVIEW13 missed this concrete mismatch; preserve the failed receipt and qualify its argv-review assertion. No product or runtime defect follows from this outcome.

Review the following narrow orchestration correction against the actual unchanged executable and its remaining consumers. It supersedes ONLY the future probe output/log naming and UI_PROBE2 prerequisite in BIND14 package-evidence contract/report/seal and subsequent packets. No executable, controls, helpers, capture, adapter, ordered-eight binding, actual GUIDE14 output namespace, product or final inventory changes are proposed. Require independent confirmation that the output name is only an artifact destination and not a behavior/oracle input; identify any dependency that prevents this correction without harness modification. The future prerequisite is a separately sealed successful GUIDE_COMPACT_UI_PROBE3 at the same revision and unchanged BIND14 executable; failed PROBE2 cannot satisfy it.

Exact next argv, from product cwd, with direct redirection and numeric child status:
```sh
node {probe} {revision} {output} > {log} 2>&1 # (new)
```
Statically validate every argv position, allowed absolute evidence root, basename, revision, no extras, unique absent output/log and pinned installed executable. Use a bounded inert check of the exact extracted argument guard (no module execution/import/browser) that accepts this full argv, rejects the failed PROBE2 name and wrong root, extras and malformed revision. Seal the check and result so command acceptance is established before the expensive operation. Do not weaken the executable guard or rename/overwrite failed outputs. Confirm the existing five-transition no-Support traffic guard and public readiness code bytes remain exactly reviewed; retained127 controls and other technical reviews need no broad rerun.

Return PASS_EXECUTION_ARGUMENT_CORRECTION or precise REWORK. A PASS permits root to freeze the corrected PROBE3 packet using this supplemental review as execution-contract authority. It does not prove browser behavior, model quality, capacity or testability. Forgot unresolved/actionless; CP1 incomplete and CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact argument check and limited supersession, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision)

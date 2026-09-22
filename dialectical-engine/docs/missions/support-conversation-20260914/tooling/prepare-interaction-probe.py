"""Freeze the separately reviewed zero-Support-traffic browser transition preflight."""
import runpy
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_COMPACT_UI_PROBE4';seat='/root/preview';revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
probe=O/'probes/GUIDE_HARNESS_BIND15/probe-zero-request-ui.mjs';output=E/'GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE4.json';log=O/'logs/GUIDE_UI_TRANSITION_PROBE4-LIVE8.log'
contract=read(E/'GUIDE_HARNESS_BIND15-probe-contract.json')
assert contract['revision']==revision and contract['script']==str(probe) and contract['cwd']==str(L)
assert contract['argv']==['node',str(probe),revision,str(output)]
assert contract['outputPath']==str(output) and contract['logPath']==str(log)
assert all(contract['argumentGuardControls'].values()) and not contract['executed']
assert not output.exists() and not log.exists()
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',E/'GATE_GUIDE_FINAL9-manifest.json',probe]
for parent in ['GUIDE_COMPACT_DIAG','GUIDE_HARNESS_BIND15','GUIDE_HARNESS_REVIEW15','GUIDE_COMPACT_UI_PROBE3','GUIDE_RUNTIME6','GUIDE_LIVE7','GUIDE_COMPACT_UI_PROBE']:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 if parent in ['GUIDE_HARNESS_BIND15','GUIDE_HARNESS_REVIEW15','GUIDE_RUNTIME6']:assert r['verdict'].startswith('PASS') and receipt_revision(r)==revision
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — one actual browser opening preflight without Support traffic

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retained operational/verification BODY skills. Read assigned ticket/comments before claim; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {output} (new); {log} (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new); sealed probe's fresh temporary browser profile only.
- forbidden: product/KB/Git/harness/prior evidence changes; installs; actual Support API status/session/message/model/capacity requests reaching runtime; DB or private-data reads; real credentials/account operations; private ongoing log content/hash; service restart/kill/configuration; quota/counter changes; retries or synthetic Support replies; owner questions/acceptance.
- verification: sole heavy for exact current ownership/TLS and this one finite reviewed public UI probe. No suites, evaluation, capacity read or chat questions. Preserve any failure; no retry. Leave existing owned stack healthy.

## 3. Work
Revalidate the current owned RUNTIME6 supervisor (last PID=PGID77769 PPID1, clean152eed4) by identity/cwd/command/listener ancestry and ordinary system TLS https://localhost:3100/help HTTP200. Preserve unrelated current listeners. Never infer ownership from PID alone, restart the runtime or read/export/hash private GUIDE_LIVE7-stack.log. Require exact clean product and all sealed probe bindings. The installed pinned Playwright Chromium must already be available; no installation. Require new output/log absent and preserve collisions rather than deleting.

The separately reviewed BIND15 correction follows the preserved PROBE3 interaction failure. Execute the new unique PROBE4 command exactly; its real five-transition result is independent of the author diagnostic. Preserve all prior failed attempts.

From exact product cwd, run the separately reviewed argv once, with direct redirection and captured numeric child exit status:

```sh
node {probe} {revision} {output} > {log} 2>&1 # (new)
```

The sealed probe uses a fresh temporary browser profile and the same corrected opening helper: fullEN, same-session fullRO, storage-reset compactRO390x844, route-remount fullEN, storage-reset compactEN390x844. Its reviewed route guard counts exact known page-initiated case-list GET attempts separately while aborting all Support API requests before they reach runtime and never supplies a synthetic successful response. Distinguish fixed counts of blocked browser attempts from actual transmitted requests; do not claim zero attempts if any were blocked. Require zero Support API requests reaching runtime and zero sessions/messages created, plus each expected visible composer and exactly one hydrated expansion interaction for compact. No raw DOM, headers, capability values or private data; fixed enums/counts and explicitly bounded public state only.

This proves opening behavior under the no-traffic guard, not Support backend response quality or current quota. Do not read capacity or send a question after a positive result. On failure preserve the fixed discriminator and exit status, then stop without retry or changing the implementation. On success close only this temporary probe browser, verify existing owned runtime and ordinary TLS after brief idle, and leave it running. Send root the exact finite PASS/REWORK and proof path. Root routes one later full54 run only after consumed PASS and natural capacity availability; prior GUIDE12 partial output remains immutable. Forgot unresolved/actionless; no testability, CP1 readiness/acceptance or CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, transition/guard counts, exact child status and current runtime custody, strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and ongoing private logs. Release heavy; no self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='one reviewed fixed public UI transition preflight with Support traffic blocked; ownership and ordinary TLS only, no quota/model requests')

"""Bind the already reviewed operator launch cwd without changing its code or future paths."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_OPERATOR_CWD_BIND50';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GUIDE_OPERATOR_CWD_OBSERVATION50.json',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_PREFLIGHT_SCHEMA_FIX49','GUIDE_PREFLIGHT_SCHEMA_REVIEW49']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert r['verdict'].startswith('PASS') and read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'bind unchanged operator launch to the isolated preview cwd','GUIDE_PREFLIGHT_SCHEMA_REVIEW49',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f"""# PACKET {node} — operator launch cwd metadata only

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY skills, no floor reload, new agent or delegation. Root persisted claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for one inert guard, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, harness source, sealed metadata or previous evidence edits; browser/runtime/HTTP/status/capacity/DB/Support/model requests; private preparation or logs; any LIVE38/actualGUIDE26/owner output; startup/restart; owner questions/acceptance.
- verification: exact existing operator --inert-guard ONCE from L, no broad or previously passed control rerun.

## 3. Work
Root's dispatch assertion stopped before creating a LIVE38 ticket or running anything because FIX49 operator metadata cwd is S, while its command contract, PRODUCT constant and approved launch scope are L. Create {E}/{node}-operator-contract.json (new) as a metadata successor to FIX49 operator-contract.json. Change ONLY cwd to exact L. All argv, source path/hash, command contract path/hash and operatorOwned fields must be byte-equivalent data to the sealed predecessor. Do not copy or edit the operator, phases, final command contract or any existing output. LIVE38 and actualGUIDE26 stay unchanged and unused.

From L execute the same absolute Node --import tsx plus exact sealed FIX49 run-operator.mjs with its EXISTING --inert-guard flag, final FIX49 command-contract path and exact final digest1be2c74d25dbf4fd45f72fb1360f06836547e868b7b19993e17a0f949fcbd7e6. This known guard verifies the contract and exits BEFORE private environment preparation, prerequisite creation and all phase/runtime/UI/status/DB/Support activity. Capture numeric exit0 and PASS_INERT_GUARD in a finite public log. Never execute the bare operational argv or --offline-preflight-lifecycle. No startup. Prove only the one metadata field differs, existing source/contract hashes remain unchanged, and all116 future paths remain absent.

Seal PASS_OPERATOR_CWD_BOUND_REVIEW_REQUIRED or exact finite blocker with successor metadata and guard evidence. Retain all FIX49/REVIEW49 and earlier PASS; no re-review of product or replay or schema. Original reviewer then checks this launch-only correction. No CP1 acceptance; Forgot unresolved and all20 still unsent. Release heavy, no board writes or self-close.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session/ticket/revision/verdict, exact command cwd/argv, public numeric result and bounds. Strict receipt artifacts absolute path/sha256/bytes excluding itself. No readiness or acceptance claim.
"""
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L);git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='one existing inert operator guard from exact preview cwd; no operational activity')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; only new launch cwd metadata and inert guard.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

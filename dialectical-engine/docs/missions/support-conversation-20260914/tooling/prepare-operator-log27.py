"""Correct and independently review the real gated58 importer path."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_OPERATOR_FIX27','GUIDE_OPERATOR_REVIEW27'];review=node.endswith('REVIEW27');seat='/root/baseline' if review else '/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_LIVE26','GUIDE_LIVE25','GUIDE_HARNESS_FIX26','GUIDE_HARNESS_REVIEW26','GUIDE_RUNTIME7']+(['GUIDE_OPERATOR_FIX27'] if review else []):
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_OPERATOR_FIX27':assert r['verdict']=='PASS_OPERATOR_LOG_OWNERSHIP'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/('GUIDE_OPERATOR_FIX27-manifest.json' if review else 'GUIDE_HARNESS_FIX26-manifest.json'))['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review literal operator log ownership and minimal fresh binding' if review else 'correct wrapper and operator log ownership','GUIDE_OPERATOR_FIX27' if review else 'GUIDE_LIVE26',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)' if review else f'{O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new)'
work="""LIVE26 passed the supported TypeScript import prerequisite then stopped at preflight because its thin operator pre-created the wrapper-owned GUIDE_LIVE25-preflight.log for stdout. Preserve the exact failed log and all attempt evidence. Correct only operator versus wrapper log/output ownership and mechanically necessary final command bindings. Do not change product, KB, runtime, actual child, matrix, gates or assertions.

Create an append-only finite operator under this node that uses the proven node --import tsx invocation and the same narrow SUPPORT_DATABASE_URL private preparation. Never pre-create any path owned by the seven phase wrappers or their children. Route wrapper stdout/stderr to distinct operator-only finite logs or inherited descriptors. Explicitly enumerate every phase/child log/output owner, ensure no collision, and preserve numeric child status/stop-first behavior. Any control log must also be distinct. Do not guess another source loader or change the parser/DB principal.

Publish GUIDE_OPERATOR_FIX27-command-contract.json and GUIDE_OPERATOR_FIX27-manifest.json. Rebind only actually occupied operational path(s) from the LIVE26 sealed failure to fresh GUIDE_LIVE27 counterparts. Preserve every other unused LIVE25 phase/capacity/gate/rowProof/UI/profile path, actual GUIDE21 response/screenshot path and provenance, and the untouched GUIDE_LIVE25-owner-testability.json future walkthrough. Preserve all7 argv[2] self-binding to the exact new final contract. Keep FIX26 real wrappers, proof dependency and FIX25 gate template by reference unless a mechanically necessary path changes. Retain FIX22 owner-capacity contract exact bytes and existing deferred output. No runtime/actual namespace churn.

Before operational execution, exercise the exact proposed thin operator against the real preflight wrapper with a clearly inert fixture/child seam. Prove wrapper-owned paths are absent before invocation and that a successful sentinel reaches the expected child instead of failing output absence. Preserve missing-loader/log-collision RED evidence. Focused owner-map collision and nonzero-child controls should prove first-failure behavior; no browser/profile, HTTP/status/DB/Support/model traffic. Reuse already passing real gated58/current proof dependencies unchanged; only rebind final literal command proof to actual final bytes with the actual parser. Do not rerun full corpus or screenshot controls because of a log-path correction.

Review the complete literal operator launch and seven child command composition before sealing, including actual cwd, TS loader, private environment projection, distinct descriptor ownership, output absence, numeric status handling, immediate gate→proof→capture, and final finite-log hashing. No shell value expansion, no private contents/connection values in logs/artifacts. Package reusable operator and exact invocation for later authorized operational node; correction itself stays inert. Keep all five-session/31-request/pacing/6-message-reserve/deferred2-session constraints, current product456/KB7ef, Runtime7/private LIVE20 log and screenshot helper unchanged.
"""
work += ("Independently review only this operator ownership correction and the exact final launch/contract composition, exercising no traffic. Retain prior product/harness PASS evidence. Return PASS_OPERATOR_LOG_OWNERSHIP_FINAL_BINDING or exact bounded REWORK." if review else "Implement and verify only the bounded operator ownership correction. Return PASS_OPERATOR_LOG_OWNERSHIP with exact reusable invocation, new/retained contract paths and focused inert controls. Release sole heavy; original baseline review follows.")

packet=f'''# PACKET {node} — distinct operator and phase log ownership

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB, canonical question/oracle or prior evidence edits; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private values/logs; quota/configuration/role changes; owner questions/acceptance.
- verification: {'static bounded independent review only; no heavy lease' if review else 'sole heavy for inert exact operator-preflight ownership and final binding controls'}; no broad product/screenshot reruns.

## 3. Work
{work}

Forgot remains unresolved/actionless; no CP1 readiness/completion/acceptance or CP2. Preserve source-custody/typecheck limitations and all prior failed attempts.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, actual operator ownership evidence and focused findings. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='inert operator ownership and final binding correction; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; operator log ownership and minimal final bindings only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

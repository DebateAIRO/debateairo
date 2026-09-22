"""Correct and independently review the real gated58 importer path."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_HARNESS_FIX26','GUIDE_HARNESS_REVIEW26'];review=node.endswith('REVIEW26');seat='/root/baseline' if review else '/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_HARNESS_FIX25','GUIDE_HARNESS_REVIEW25','GUIDE_RUNTIME7']+(['GUIDE_HARNESS_FIX26'] if review else []):
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_HARNESS_FIX26':assert r['verdict']=='PASS_CAPTURE_PROOF_DEPENDENCY'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/('GUIDE_HARNESS_FIX26-manifest.json' if review else 'GUIDE_HARNESS_FIX25-manifest.json'))['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review capture dependency and final literal operation contract' if review else 'bind capture to the successful fresh gated58 proof','GUIDE_HARNESS_FIX26' if review else 'GUIDE_HARNESS_REVIEW25',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)' if review else f'{O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new)'
work="""GUIDE_HARNESS_REVIEW25 found one bounded dependency gap: phase-capture can launch without consuming fresh row-proof status/result. Retain all FIX25 passing importer, exact54+4 membership, seven self-binding, prior controls and product evidence. Do not repeat broad audits or fix unrelated issues.

Limit changes to append-only row-proof and capture phase wrappers plus necessary final contract/proof bindings under GUIDE_HARNESS_FIX26. Before opening any browser/profile or spawning the capture child, validate expected fresh row-proof status/result paths, status schema/phase/revision/status0/null signal, result hash and node/current revision/KB/current gate path and hash/exact58 PASS/current matrix-verifier-harness custody/zero traffic. The producer should record the proof hash and relevant current binding; capture must independently check the exact expected evidence and record the consumed hash. Preserve unchanged capture-child behavior and all other real operational sources.

Exercise the actual phase wrappers with a real inert gated58 producer positive and an inert sentinel capture child if required. Missing, nonzero, stale and malformed/tampered proof negatives must prove zero child/browser calls. All fixtures are explicitly inert and cannot count as runtime capacity or operational output. Finish finite logs before hashing. No status/DB/browser/Support/model traffic.

Publish GUIDE_HARNESS_FIX26-command-contract.json and GUIDE_HARNESS_FIX26-manifest.json. All seven argv[2] MUST self-bind this exact final contract; prove actual bytes with the real shared parser. Preserve every still-unused LIVE25 phase/output/log/UI/profile path, GUIDE_ROW_PROOF-run-LIVE25.json, all GUIDE_LIVE_GUIDE21 actual response/screenshot paths and FRESH_GUIDE21_FIXED31 provenance. Keep FIX25 gate template by reference unless this dependency requires a change. Keep current product456, KB7ef, Runtime7, private LIVE20 log, screenshot helper, exact fixed31/five sessions/pacing and current article equality unchanged. Retain FIX22 owner-capacity contract by exact hash and untouched deferred output. Do not invent another LIVE/runtime namespace.

Operational setup remains proven: narrow private SUPPORT_DATABASE_URL loader into GUIDE_COUNTS_ONLY_DATABASE_URL using existing debateai_dev_support principal; no generic DATABASE_URL or broad API loader. No private file values, roles/grants/configuration changes, runtime work or owner questions.
"""
work += ("Independently review the final wrapper dependency, actual positive/negative evidence, retained hashes and complete final command contract. Return PASS_CAPTURE_PROOF_DEPENDENCY_FINAL_BINDING or one exact finite REWORK. No heavy lease; no new implementation or broad audit." if review else "Implement this dependency only, run focused affected checks plus real gated58 as necessary, and return PASS_CAPTURE_PROOF_DEPENDENCY or precise failure. Release sole heavy. Separate original baseline review follows.")

packet=f'''# PACKET {node} — fresh gated58 proof required before capture

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB, canonical question/oracle or prior evidence edits; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private values/logs; quota/configuration/role changes; owner questions/acceptance.
- verification: {'static bounded independent review only; no heavy lease' if review else 'sole heavy for real gated58 inert fixture and focused phase dependency controls'}; no broad product/screenshot reruns.

## 3. Work
{work}

Forgot remains unresolved/actionless; no CP1 readiness/completion/acceptance or CP2. Preserve source-custody/typecheck limitations and all prior failed attempts.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, actual phase dependency evidence and focused findings. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='real gated58 inert fixture and focused phase dependency correction; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; capture dependency and final literal bindings only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

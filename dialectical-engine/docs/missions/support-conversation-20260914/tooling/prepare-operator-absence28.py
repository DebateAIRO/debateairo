"""Correct and independently review the real gated58 importer path."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_OPERATOR_FIX28','GUIDE_OPERATOR_REVIEW28'];review=node.endswith('REVIEW28');seat='/root/baseline' if review else '/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_OPERATOR_FIX27','GUIDE_OPERATOR_REVIEW27','GUIDE_HARNESS_FIX26','GUIDE_HARNESS_REVIEW26','GUIDE_RUNTIME7']+(['GUIDE_OPERATOR_FIX28'] if review else []):
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_OPERATOR_FIX28':assert r['verdict']=='PASS_OPERATOR_COMPLETE_ABSENCE_SET'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/('GUIDE_OPERATOR_FIX28-manifest.json' if review else 'GUIDE_OPERATOR_FIX27-manifest.json'))['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review complete runtime output absence set' if review else 'add two missing operator output absence checks','GUIDE_OPERATOR_FIX28' if review else 'GUIDE_OPERATOR_REVIEW27',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)' if review else f'{O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new)'
work="""GUIDE_OPERATOR_REVIEW27 found exactly two omissions in the real operator invocation-time future absence/collision set: contract.phases.rowProof.result (GUIDE_ROW_PROOF-run-LIVE25.json) and preserved GUIDE_LIVE25-owner-testability.json. The standalone binding verifier checked them, but real operator checked121 instead of123. Fix only these two runtime checks before any phase child/runtime/HTTP/status/DB/browser/Support/model effects, plus mechanically necessary operator script/contract hashes. Retain all other passing operator/preflight/status/binding evidence.

Publish append-only corrected operator source under GUIDE_OPERATOR_FIX28, GUIDE_OPERATOR_FIX28-operator-contract.json and GUIDE_OPERATOR_FIX28-manifest.json. KEEP GUIDE_OPERATOR_FIX27-command-contract.json exact bytes, its seven self-bound argv, all phase wrappers, gate template, current product456/KB7ef, Runtime7/private log, FIX22 deferred-owner contract, and every future LIVE27/LIVE25/actualGUIDE21/profile/screenshot/owner path unchanged. Do not create another command-contract or operational namespace. The only new operational invocation binding is the corrected reusable operator script and its public operator contract/hash.

Add focused inert controls invoking the actual corrected operator: pre-existing rowProof.result alone and pre-existing owner-testability alone must fail before any phase child spawn or runtime/status/DB action. Keep all prior ownership/collision and stop-first conditions. Check the real operator's enumerated future set matches the sealed reviewed complete set (123 if only these two are added), with exact unique paths and counts in its public contract. Do not merely add checks to the separate verifier. A positive inert control should still reach the same real preflight/sentinel; no actual browser/profile or traffic. Reuse prior passing full gated58 and all unchanged product/screenshot checks; do not rerun them.

Use the same proven node --import tsx launcher, narrow in-memory SUPPORT_DATABASE_URL preparation and distinct operator logs. Do not change parser, principal, roles, grants, configuration, quotas, capacity logic, freshness, exact31 groups/pacing, owner reserves or capture behavior. Preserve all previous failures and complete finite logs before hashing. Future LIVE27 will execute the sealed reusable operator verbatim after independent review, never regenerate a thin driver. Return exact operator argv/cwd/script/hash and retained FIX27 command contract hash.
"""
work += ("Independently review only the two-path real runtime absence correction and affected controls/custody. Return PASS_OPERATOR_COMPLETE_ABSENCE_SET_FINAL_BINDING or exact finite REWORK; no traffic or broad audit." if review else "Implement and verify this two-path correction only; return PASS_OPERATOR_COMPLETE_ABSENCE_SET or precise finite failure. Release sole heavy; separate original baseline review follows.")

packet=f'''# PACKET {node} — complete operator output absence set

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB, canonical question/oracle or prior evidence edits; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private values/logs; quota/configuration/role changes; owner questions/acceptance.
- verification: {'static bounded independent review only; no heavy lease' if review else 'sole heavy for inert two-path real operator absence controls'}; no broad product/screenshot reruns.

## 3. Work
{work}

Forgot remains unresolved/actionless; no CP1 readiness/completion/acceptance or CP2. Preserve source-custody/typecheck limitations and all prior failed attempts.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, actual runtime absence evidence and focused findings. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='inert two-path runtime absence correction; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; two-path real runtime absence checks only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

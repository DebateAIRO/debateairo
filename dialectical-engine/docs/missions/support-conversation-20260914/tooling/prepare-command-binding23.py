"""Correct/review only seven final argv references and the proof of actual bytes."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_HARNESS_FIX23','GUIDE_HARNESS_REVIEW23'];review=node.endswith('REVIEW23');seat='/root/baseline' if review else '/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in ['GUIDE_HARNESS_REVIEW22','GUIDE_HARNESS_FIX22','GUIDE_RUNTIME7']+(['GUIDE_HARNESS_FIX23'] if review else []):
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_HARNESS_FIX23':assert r['verdict']=='PASS_LITERAL_COMMAND_BINDING'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/('GUIDE_HARNESS_FIX23-manifest.json' if review else 'GUIDE_HARNESS_FIX22-manifest.json'))['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review final seven argv self-binding' if review else 'bind seven argv to exact final contract bytes','GUIDE_HARNESS_FIX23' if review else 'GUIDE_HARNESS_REVIEW22',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)' if review else f'{O}/probes/{node}/ (new, minimal inert binding proof only); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new)'
work='''Review only the final literal command binding correction from REVIEW22. Independently read actual final contract bytes, require every one of seven argv[2] values to equal that exact final contract path, and verify the proof reports its actual SHA rather than a predecessor hash. Follow the real readFinalContract parser to confirm final phase1 sees ownerCapacity.output and later capture sees the corrected GUIDE21 source. Check the negative old-contract reference fails before spawn. All substantive product/UI/capacity/provenance/owner-reservation findings already passed their bounded review; retain them where defining bytes are unchanged. No new broader audit. Return PASS_FINAL_LITERAL_COMMAND_BINDING or exact remaining defect, naming the final contract and retained deferred-owner command with hashes.''' if review else '''The two requested FIX22 source corrections passed review, but every phase argv[2] still references BIND21 instead of the final FIX22 contract, and the binding proof hashes the predecessor. Correct ONLY this final execution binding. Publish this node's -command-contract.json with all seven phase argv[2] values equal to its exact new absolute path; retain every current script, output/log path, gate, Runtime7 custody and still-unused LIVE21/LIVE_GUIDE21 namespace. Do not create new copies of source scripts or rename operational outputs. Keep the corrected capture source and owner output reservation from FIX22.

Produce a focused proof by reading the actual new contract bytes and real shared readFinalContract parser. Assert all seven exact argv references, actual contract SHA, phase1 ownerCapacity visibility, and corrected capture child binding. A predecessor-path negative must fail before spawn/reader activity. Regenerate only this proof and mechanical manifest bindings; do not reuse a fixed predecessor hash or a fake fixture that bypasses the actual parser. No browser/status/DB/Support/model call.

Retain FIX22-owner-capacity-contract.json unchanged by exact hash and include it in the final manifest; do not invent another owner-command filename. Retain full58 product proof, screenshot helper, actual UI producer and substantive capacity/custody regression evidence by hashes. Publish final -manifest.json with final contract/proof and retained required references. No source code, product or KB edits, no new screenshot fixture or broad test run. Finish finite logs before hashing. Return PASS_LITERAL_COMMAND_BINDING with the seven literal commands, final hash and preserved limitations.'''
packet=f'''# PACKET {node} — exact final command self-binding

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB, harness source or prior evidence edits; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private data/logs; quota/configuration changes; owner questions/acceptance.
- verification: {'static bounded review only; no heavy lease' if review else 'sole heavy for minimal inert real-parser command-binding check only'}; no unchanged suite reruns.

## 3. Work
{work}

Forgot remains unresolved/actionless. No CP1 readiness/completion/acceptance or CP2; actual31 and natural owner capacity remain pending. Preserve prior failures and initial source-custody limitation.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, exact narrow proof and retained evidence. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='minimal inert final seven-command self-binding proof; no source edits or operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; exact final seven-command self-binding only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Bounded append-only correction/review of the last two successor custody defects."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_HARNESS_FIX22','GUIDE_HARNESS_REVIEW22'];review=node.endswith('REVIEW22')
seat='/root/baseline' if review else '/root/preview';revision='456cafb9e56a737de550570b5736ec52d79ddf48';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
parents=['GUIDE_HARNESS_REVIEW21','GUIDE_HARNESS_BIND21','GUIDE_RUNTIME7']+(['GUIDE_HARNESS_FIX22'] if review else [])
for parent in parents:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 if parent=='GUIDE_HARNESS_FIX22':assert r['verdict']=='PASS_SUCCESSOR_CUSTODY_CORRECTED'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
manifest=E/('GUIDE_HARNESS_FIX22-manifest.json' if review else 'GUIDE_HARNESS_BIND21-manifest.json');files.extend(Path(a['path']) for a in verify(read(manifest)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review two final successor custody corrections' if review else 'correct row provenance and reserve owner output before reads', 'GUIDE_HARNESS_FIX22' if review else 'GUIDE_HARNESS_REVIEW21',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new)' if review else f'{O}/probes/{node}/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new)'
work='''Independently assess only the two corrections requested by REVIEW21 and mechanically necessary bindings. Exact fresh row provenance and current composed control labels must say GUIDE21, matching the still-unused LIVE21/LIVE_GUIDE21 namespace. Require a control on the real capture row assembly, not only text replacement or a fixture duplicating expected output. The owner-capacity invocation must reject/reserve its exact absent output before either supported status or aggregate read; verify the existing-output negative makes zero reader calls and the actual successor binding includes owner-output absence. Preserve failure evidence and do not treat an output reserved by the running command as a prior collision at final write.

Retain REVIEW21's passing substantive passed:true and five-slot/deferred-two semantics, full58 current-product proof, unchanged screenshot helper and prior product reviews. Verify only changed and mechanically rebound artifacts plus literal final seven commands and deferred owner command. No new operational namespaces are needed: LIVE21 never ran. Runtime7 custody and private LIVE20 log remain unchanged and excluded. Confirm no existing artifacts were overwritten. Return PASS_FINAL_OPERATION_CONTRACT or precise finite REWORK, with exact final command-contract and owner-contract paths/hashes suitable for immediate dispatch. This remains static, not live quality or owner availability.''' if review else '''Correct exactly the two REVIEW21 successor-custody findings. The final actual capture remains LIVE21/LIVE_GUIDE21 (never executed), so update fresh row provenance to FRESH_GUIDE21_FIXED31 and the two control-proof labels to GUIDE21, with a focused assertion against real capture row construction. No need to invent another actual namespace or change fixed31 membership, product source, KB, safety expectations or screenshot helper.

The owner-capacity command must fail before its first supported-status or DB aggregate read if the exact output already exists. Reserve the output safely before traffic, retain exclusive/no-overwrite behavior, and define how failed reads preserve their finite failure artifact without making another request. Add a negative using the real command's reader boundary that proves existing-output failure invokes zero readers. Include the exact owner output in final binding freshness/absence verification. No operational status/DB/browser call may occur in this node.

Use append-only files under this node's allowed prefix and reuse unchanged sealed BIND21 scripts/proofs by exact hash. Only mechanically necessary imports/contracts/gate hashes may change. Publish the final seven-phase command contract as this node's -command-contract.json, the deferred owner command as -owner-capacity-contract.json, and a -manifest.json covering final artifacts. Keep the actual LIVE21/LIVE_GUIDE21 outputs and existing Runtime7 custody/private LIVE20 stack log paths unchanged. Do not modify sealed BIND21 files or copy historical outputs into new provenance. Minimize namespace churn and retain the separately passing full58/current-product proof and original screenshot helper. Run only the focused row-provenance and owner-output-before-read regressions plus necessary binding checks, distinguishing retained tests from newly run checks. No repeat product tests or broad audit. Return PASS_SUCCESSOR_CUSTODY_CORRECTED or exact finite failure with all source changes, two proofs, final literal argv and preserved limitations. Finish finite logs before hashing; exclude mutable packaging and private logs.'''
packet=f'''# PACKET {node} — two final successor-custody corrections

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills, no floor reload. Root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB or prior evidence edits; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private data/logs; quota/configuration changes; owner questions/acceptance.
- verification: {'static bounded review only; no heavy lease' if review else 'sole heavy for focused inert custody regression checks only'}; retain completed unchanged proof and avoid broad reruns.

## 3. Work
{work}

Forgot remains unresolved/actionless; no CP1 ready/complete/accepted or CP2. Runtime remains detached; actual31 and later owner capacity still pending. Preserve the initial source-custody qualification and prior failed evidence.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, exact changed and retained checks and finite artifacts. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself and private ongoing logs. Release heavy if held; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,not review,revision,heavy_scope='two focused inert successor custody corrections; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; two bounded successor-custody corrections.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

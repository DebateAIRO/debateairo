"""Review only the final literal-hash correction; retain other REVIEW34 dispositions."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_OPERATOR_REVIEW35';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_OPERATOR_FIX35','GUIDE_PREVIEW_REVIEW34','GUIDE_PREVIEW_RECOVER34']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_PREVIEW_REVIEW34' or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_OPERATOR_FIX35-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review corrected literal operator hash and retained final binding','GUIDE_OPERATOR_FIX35',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — finite final operator delta review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static exact operator delta review; retain your prior REVIEW34 dispositions explicitly.

## 3. Work
Your consumed REVIEW34 identified one failure: stale BIND32 command hash embedded in RECOVER34 non-inert operator. Verify FIX35's new operator changes that literal to the exact actual RECOVER34 command contract hash and its new operator metadata points to the new immutable script, with exact argv and cwd. The command contract and all7 phases remain RECOVER34, not renamed to FIX35. Verify original runtime, owner, gate, logs, profile, current product and FINAL18 references remain byte-identical and correctly retained.

Inspect the bounded regression proof of the real non-inert guard: stale bytes reject before operational children and private preparation; matching bytes reach a controlled intercepted first-phase boundary, without actual traffic. A comparison only against external metadata is insufficient. Confirm no alternate code bypass or weakened guard was introduced. Verify exact final script and contract hashes, not fixture-only metadata.

Retain already-PASS runtime9 custody and12listeners, TLSHelp200, startup two-request accounting and corrected diagnostic timestamps, screenshot helper and full58 proof, fresh-proof dependency, narrow Support principal handling and all123 unique future paths. No repeated whole-chain audit, product or image review; current scope is the one operator defect and consequences of changed operator metadata. The fixed31 actual run has not started, and no current capacity is proven. Confirm the final executable command uses absolute Node --import tsx, require_escalated and tool-captured output with no redirection or pre-opened artifacts.

If fixed, return PASS_FINAL_OPERATOR_RUNTIME_BINDING with explicit composition of retained REVIEW34 passes and the new literal-hash correction. Otherwise return a precise finite REWORK. No runtime restart or startup request remains in this node. Forgot unresolved, no CP1 ready, complete or accepted, no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, finite dispositions. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,False,revision)
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static literal operator delta review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Review corrected footer capture and its changed bindings only."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PHASE_IMPORT_REVIEW46';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_PHASE_IMPORT_FIX46','GUIDE_UI_WRITER_REVIEW45','GUIDE_LIVE34']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_LIVE34' and r['verdict']=='FAILED_CAPACITY_MODULE_LINK_ZERO_OPERATIONAL_TRAFFIC') or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PHASE_IMPORT_FIX46-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review bounded timestamp producer and final operator binding','GUIDE_PHASE_IMPORT_FIX46',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — final same-product continuation binding review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static final continuation sources and actual-UI intercepted proof only; retain already reviewed helper images and product dispositions.

## 3. Work
Review only FIX46 against LIVE34's concrete missing phase-contract.mjs failure. Retain every unrelated REVIEW45 and ancestor PASS. No runtime, tests, browser or traffic.

Inspect the actual resolved module graph of all seven phase entrypoints and configured row-proof/capture children. The missing import must bind the correct reviewed contract helper with compatible exports and unchanged validation semantics, not a placeholder or merely a file with matching export names. Trace helper use against the final selected command contract and expected phase behavior. Review real import/export linkage or actual module-load controls stopping before operational I/O at the existing missing-contract/gate boundary. Syntax checks and source searches alone are insufficient. A deliberately missing dependency must reject. Distinguish link-only guarantees from execution; verify no private preparation or operational request occurred. Every required local import in the reachable closure must exist, resolve with actual Node/cwd/tsx semantics and be bound by hashes.

Inspect only directly affected helper/phase imports and final command/gate/operator closure. All seven literal argv select FIX46 final contract; operator embeds actual final digest; metadata hashes executable and retains operatorOwned. Fresh LIVE35 phase/prerequisite/stop/proof/UI/profile/log/composed namespace is consistent; actualGUIDE24 and owner21/25 paths remain unused. All future operational outputs absent after controls. Preserve actual UI writer/lifecycle, initial completion factory, producer/composer, schedule, capacity thresholds, runtime custody/schema/process and private parser requirements.

Same retained ten LIVE31 plus fixed remaining21, with no completed-case resampling; zero-answer failed attempts contribute none. Return PASS_FINAL_PHASE_IMPORT_BINDING or precise bounded REWORK. Actual remaining21/all31 review and fresh owner availability still required. Forgot unresolved; no CP1 ready/complete/accepted or CP2.

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
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static final same-product continuation binding review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

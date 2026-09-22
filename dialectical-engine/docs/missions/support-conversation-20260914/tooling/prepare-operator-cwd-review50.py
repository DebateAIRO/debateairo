"""Review a one-field operator launch metadata correction and inert guard evidence."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_OPERATOR_CWD_REVIEW50';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'decisions/GUIDE-CP1-ROW10-CONTINUATION-20260921.md',D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_OPERATOR_CWD_BIND50','GUIDE_PREFLIGHT_SCHEMA_REVIEW49']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files=list(dict.fromkeys(files))
ticket=create(node,'review operator launch cwd metadata only','GUIDE_OPERATOR_CWD_BIND50',seat)
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
Review ONLY the new BIND50 operator metadata and its one existing inert-guard result from the isolated preview cwd L. Retain all REVIEW49 and earlier dispositions without repeating source, schema, replay, image, budget or product audits. No tool execution, runtime or traffic.

Compare successor metadata to sealed FIX49 operator-contract.json: the ONLY data difference must be cwd changed from S to exact L. Argv must remain absolute Node --import tsx and the same sealed FIX49 run-operator.mjs. Source path/hash, command-contract path/hash1be2c74d25dbf4fd45f72fb1360f06836547e868b7b19993e17a0f949fcbd7e6 and every operatorOwned field must remain identical. Verify the actual recorded guard invocation used L, numeric0 and PASS_INERT_GUARD, and the existing guard exits before private preparation, prerequisite creation, phases and all runtime/browser/status/DB/Support/model activity. Future LIVE38/actualGUIDE26/owner outputs must remain absent. No operational attempt has occurred under LIVE38; all20 remain unsent.

Return PASS_FINAL_OPERATOR_CWD_BINDING or a concrete metadata/invocation defect. This is launch metadata only: do not create a new harness namespace, require old checks again, modify source, or claim product readiness. Forgot unresolved and CP1/CP2 gates stay closed.

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

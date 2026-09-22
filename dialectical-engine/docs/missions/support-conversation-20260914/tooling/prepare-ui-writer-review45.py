"""Review corrected footer capture and its changed bindings only."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_UI_WRITER_REVIEW45';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_UI_WRITER_FIX45','GUIDE_PREFLIGHT_LIFECYCLE_REVIEW44','GUIDE_LIVE33']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert (parent=='GUIDE_LIVE33' and r['verdict']=='FAILED_PREFLIGHT_UI_OUTPUT_MODE_ZERO_SUPPORT') or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_UI_WRITER_FIX45-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review bounded timestamp producer and final operator binding','GUIDE_UI_WRITER_FIX45',seat)
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
Review only FIX45 against LIVE33's exact UI writer mode0644 versus lifecycle0600 failure. Retain REVIEW44 stage lifecycle and all earlier passing completion, producer/composer, UI behavior, budget, screenshot, process/schema and product dispositions. No browser, runtime, tests or traffic.

Inspect the actual UI proof writer's exclusive0600 creation and no-follow/no-overwrite behavior. Verify the affected control uses the REAL compiled-UI script and writer, allows only ordinary-TLS local public assets, intercepts all dynamic requests and invokes the actual lifecycle consumer on the actual resulting output. Inspect observed mode/owner/nlink/binding and successful consumer result, not a fixture-manufactured file. Trace the other preflight-produced files against their existing lifecycle requirements using actual producer code and LIVE33 evidence, without reopening unrelated phases. No weakened lifecycle ownership or blanket exemption. Record exact forwarded traffic categories and retain synthetic-only message/session proof semantics.

Review directly affected writer/script imports and final command/gate/operator bindings. Complete fresh LIVE34 namespace must cover every phase, prerequisite, stop, proof, UI, log and profile; composed result GUIDE_LIVE34-composed31-manifest.json. actualGUIDE24 and retained owner21/25 paths unchanged. All seven argv select final FIX45 contract; operator embeds actual final digest; metadata hashes executable and retains operatorOwned. Future operational outputs remain absent. Preserve prior failed LIVE33 bytes.

Same remaining21 in three sessions/18 model branches and retained ten LIVE31 responses, no resampling; zero-answer LIVE32/33 contribute none. Return PASS_FINAL_UI_WRITER_BINDING or exact bounded REWORK. Actual remaining21/all31 quality and fresh owner availability remain pending. Forgot unresolved; no CP1 ready/complete/accepted or CP2.

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

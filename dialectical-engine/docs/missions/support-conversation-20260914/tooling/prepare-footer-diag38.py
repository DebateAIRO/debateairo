"""Saved-evidence diagnosis only; no operational traffic."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_FOOTER_DIAG38';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE30','GUIDE_PROCESS_BIND37']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend([O/'probes/GUIDE_PREVIEW_RECOVER34/capture-public-guide.mjs',O/'probes/GUIDE_PREVIEW_RECOVER34/screenshot-evidence-successor.mjs'])
files.extend(L/p for p in ['apps/ui/components/support/Assistant.tsx','apps/ui/components/support/SupportWidget.tsx','apps/ui/app/help/page.tsx','apps/ui/app/globals.css'])
files=list(dict.fromkeys(files))
ticket=create(node,'diagnose saved row23 footer failure without live traffic','GUIDE_LIVE30',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — saved footer evidence diagnosis

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and debugging and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; browser, HTTP, process, runtime, status, capacity, DB, Support or model traffic; private values and logs; owner questions and acceptance.
- verification: bounded read-only saved screenshots and static production UI plus active screenshot helper inspection only.

## 3. Work
LIVE30 stopped after five completed replies, two sessions and five measured model-branch rows. Four rows have full screenshots. Fifth canonical row23 is the fourth Romanian turn after rows2,15,19; API200 and API/DOM text, source and action equality passed. Footer capture threw GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE. Row23 has sources export-json and guide-how-it-works, actions empty. Only its original-pane-top PNG exists. Idle did not run. Runtime9 postfailure custody is NOT established. The two paid startup requests approved by the user were used; no additional startup or model request is authorized here.

Visually inspect the saved failing top PNG and useful prior Romanian turn PNGs. Inspect production Assistant layout and globals CSS alongside the exact retained screenshot helper and capture sequence. Explain proven facts separately from hypotheses. Do not label the failure harness-only merely because API200. Determine whether saved evidence proves a real footer usability defect, a helper scroll or restoration defect, or is insufficient. Historical pane and footer rectangles, scrollTop, scrollHeight, clientHeight and restoration state were not persisted before throw; do not reconstruct or invent them.

Return the smallest concrete next diagnostic or correction justified by evidence. If static evidence is insufficient, propose a finite zero-forwarded-Support reproduction using actual production UI and CSS plus intercepted public responses from these four Romanian turns, including exact measurements and failure artifact persistence. It must avoid real Support, status, capacity and model endpoints and must not alter product quotas, private state, existing browser profiles or runtime. Do not execute reproduction here. Identify exact source paths required and whether a product change is proven necessary. Retain valid process, schema, operator, product, full58 and unaffected screenshot evidence; no whole-chain or editorial audit.

LIVE30 partial rows never count toward the next fresh31. ActualGUIDE22 is used; successor is GUIDE23. Full five-session not-before is2026-09-21T09:51:12.590Z from second creation plus1h5s, not a capacity PASS. Forgot unresolved; no CP1 ready, complete or accepted and no CP2. Return finite diagnosis with explicit certainty, not a live retry.

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
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; saved evidence and static source diagnosis only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
state=read(E/'COORDINATOR-CURRENT.json');state.update({'updatedAt':now(),'active':[node],'activeNode':node,'activeAgent':seat,'seat':[seat],'ticket':ticket,'adminFreeze':commit,'heavyLease':None,'gitLease':None,'next':'Await bounded saved screenshot and source diagnosis; no live retry or capacity probe before natural expiry.'})
state['actualNext']={'node':'GUIDE_LIVE30','namespace':'actualGUIDE22','status':'FAILED_CAPTURE_SCREENSHOT_FOOTER_UNREACHABLE_NO_RETRY_CONSUMED','attempted':5,'completed':5,'sessions':2,'rows':[1,2,15,19,23],'providerCallCount':'UNAVAILABLE','historicalGeometry':'UNAVAILABLE_BEFORE_THROW','receipt':'a231aae0f75c7454ab404dceb85ce9f98995b158aba50ddacd6b596339822c55','consumption':'06d4824f77fc7f3f3c025e408f3a17fa8e9509bb20b02b2d4955429cf62b46d3','nextFreshNamespace':'actualGUIDE23','fullFiveSessionNotBeforeUtc':'2026-09-21T09:51:12.590Z'}
state['runtime'].update({'state':'RUNTIME9_LAST_READY_LIVE30_POSTFAILURE_CUSTODY_UNESTABLISHED','lastReadinessUtc':'2026-09-21T08:50:31.809Z','newStartupHandshakeAttempts':2,'nextDiagnostic':'Latest two startup requests approved and exhausted; no new startup request.'})
write(E/'COORDINATOR-CURRENT.json',state)
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Repair the capture controller cookie/compact activation order on its real UI path."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_ACTIVATION_FIX47';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE35','GUIDE_PHASE_IMPORT_FIX46','GUIDE_PHASE_IMPORT_REVIEW46']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 assert r['verdict']=='FAILED_CAPTURE_COMPACT_COOKIE_ORDER_ZERO_ANSWERS' if parent=='GUIDE_LIVE35' else r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PHASE_IMPORT_FIX46-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'settle visible cookie consent before compact capture activation','GUIDE_LIVE35',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded real capture activation repair

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY, debugging and verification skills. Root persisted claim proxy. No reload, new agents or delegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for finite intercepted compiled-UI controls, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, canonical prompts, decisions or prior evidence edits; live Support sessions/messages/model requests, status/capacity/DB reads, private data or logs; future LIVE36 or actualGUIDE25 outputs; startup or restart; owner questions or acceptance.
- verification: the real changed capture openMode path against the compiled UI with every dynamic, private and external request intercepted before page creation; only ordinary same-origin public assets may be forwarded. No product test rerun or unrelated control family.

## 3. Work
Consume LIVE35's exact GUIDE_HARNESS_COMPACT_STATE_TRANSITION_ABSENT and zero attempted/completed/session/message counts. Preserve its whole failed receipt and all artifacts. The saved public observation shows cookieRegion VISIBLE, compact toggle hydrated/visible, and widget still COLLAPSED/aria FALSE after activation. Existing capture source settles cookies only inside selectLanguage, after compact activation and composer wait; the already-passing inert UI preflight settles cookies before the widget click.

Correct only this actual capture-controller interaction order. Settle the visible cookie consent through the exposed UI before activating the compact widget. Do not weaken the visible/hydrated/state/composer assertions, invent storage or hidden state operations, disable pointer hit testing, or bypass the real openMode path. Preserve full/compact and language behavior, same-session Help transition, screenshot and restoration contracts. Product code remains unchanged.

Use a finite intercepted compiled-UI regression of the REAL affected openMode function. Exercise the original order with a visible consent banner and prove it fails at the recorded boundary; exercise the corrected order and prove visible compact READY/composer state. Also check the same corrected path when consent is already settled, using exposed UI only. Bind the function executed to the final capture producer bytes; a duplicated stand-in or source-text assertion is insufficient. Intercept all Support APIs, status, auth, other private and external calls before navigation. No actual Support request may leave the browser; report intercepted counts and forwardedDynamic=0. Preserve all earlier passing UI/module/lifecycle/completion/schedule/budget/runtime/product dispositions. Inspect directly affected successor load/bindings statically; do not rerun all earlier controls.

Create fresh LIVE36 operational phase, prerequisite, stop, proof, UI, profile and finite log paths. The failed actualGUIDE24 receipt now exists; use a new actualGUIDE25 namespace for all new actual capture artifacts. Compose to GUIDE_LIVE36-composed31-manifest.json. Keep the UNUSED owner-capacity path GUIDE_LIVE21-owner-capacity.json and owner walkthrough GUIDE_LIVE25-owner-testability.json, which are distinct from actualGUIDE25. All future operational paths must remain absent after controls. All seven literal argv must select this node's final command contract; operator embeds its final digest, metadata binds executable and keeps operatorOwned. Preserve and update the real reachable module closure and all final path constants so no predecessor composition path survives.

Same product0d34 and KB7ef; retain ALL ten LIVE31 replies and reviewed row47 exception. Exact same outstanding21 in three new sessions, eighteen model-branch ceiling,31sec pacing,54-to43 real same-session keyboard Help navigation. LIVE32 through LIVE35 contribute zero actual answers. No completed-case resend or favorable resampling. Startup allowance is exhausted.

Seal PASS_CAPTURE_ACTIVATION_BOUND_REVIEW_REQUIRED or exact finite blocker with the source delta, actual-path negative/positive UI control evidence, intercepted network summary and final closure/bindings. Release heavy. Original reviewer then reviews only this change and namespace. Forgot unresolved; no CP1 ready, complete or accepted, no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, finite dispositions. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L);git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='finite real capture activation controls with all dynamic requests intercepted; zero live Support/model/status/capacity/DB traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded capture activation ordering repair only; intercepted compiled UI, zero live Support traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

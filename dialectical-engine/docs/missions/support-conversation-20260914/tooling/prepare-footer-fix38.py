"""Bounded screenshot correction and fresh successor binding; no live run."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CAPTURE_FIX38';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_FOOTER_DIAG38','GUIDE_LIVE30','GUIDE_PROCESS_BIND37','GUIDE_PROCESS_REVIEW37']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PROCESS_BIND37-manifest.json')['artifacts']))
files.extend([O/'probes/GUIDE_PREVIEW_RECOVER34/capture-public-guide.mjs',O/'probes/GUIDE_PREVIEW_RECOVER34/screenshot-evidence-successor.mjs'])
files.extend(L/p for p in ['apps/ui/components/support/Assistant.tsx','apps/ui/components/support/SupportWidget.tsx','apps/ui/app/help/page.tsx','apps/ui/app/globals.css'])
files=list(dict.fromkeys(files))
ticket=create(node,'correct contained footer scrolling and bind fresh LIVE31','GUIDE_FOOTER_DIAG38',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — preserve a visible footer and capture failure geometry

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and debugging skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite controls); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, canonical question or oracle changes; old evidence edits; live runtime, app browser, HTTP, status, capacity, DB, Support or model traffic; private values and logs; existing browser profile changes; runtime restarts, quota or identity changes; owner questions and acceptance.
- verification: sole heavy for finite inert local browser fixtures with production markup and CSS, intercepted I/O and zero forwarded Support or external traffic. No unchanged product suites.

## 3. Work
Implement only the consumed DIAG38 findings. Saved row23 top PNG already shows both current export answer source chips fully inside the original pane. The helper then unnecessarily scrolls backward using a negative footer-bottom delta, moving that visible footer to a strict bottom boundary. Prior Romanian rows15 and19 show this backward movement. Exact row23 post-scroll geometry was not persisted; do not invent whether rounding, clamp or another geometry detail triggered the historical throw. Product footer usability defect is not established; no product changes are authorized.

Correct the helper to preserve an already fully contained current footer. When reveal is genuinely required, use bounded deterministic scrolling and verify actual painted current footer containment after layout settles. Keep the original pane dimensions and product styles unchanged for top and footer captures; expanded complete evidence remains separately labeled. Do not weaken current article identity, sources or actions, accept a previous reply, or replace original-pane evidence with an expanded image. Maintain true clipping rejection rather than using permissive tolerance to conceal clipping. Preserve exact style, viewport and scroll restoration including exceptions.

Persist safe current article identity, pane and footer rectangles, scroll values and restoration disposition before propagating any future screenshot failure, so the actual partial receipt remains diagnostic. No raw DOM, browser storage, credentials, account or private content. Mark historically absent geometry unavailable. Bind any additional potential artifact paths to the future absence contract; do not overwrite previous evidence.

Follow DIAG38's finite reproduction contract with saved public Romanian turns2,15,19,23 and actual production layout and CSS. Use a fully intercepted or inert local fixture with no live app endpoints; assert zero forwarded Support and external requests. Preserve old-helper RED showing needless backward scroll from an already contained footer. Corrected case must preserve containment and capture painted current labels. Exercise a genuinely below-pane footer, a footer larger than the viewport or otherwise impossible containment, and exception restoration plus diagnostic persistence. Retain affected full and compact EN/RO, stale and previous-target safeguards; reuse unchanged prior controls instead of broad reaudits. Visually inspect actual resulting top, footer and expanded images, including the multi-turn two-source case.

Create append-only final command, gate, capture, screenshot helper, operator and metadata bindings under this node. LIVE30 and actualGUIDE22 are used immutable partial evidence. Use fresh LIVE31 phase outputs, logs, gate, row proof, UI probe, operator outputs and a fresh isolated profile; use actual GUIDE_LIVE_GUIDE23 for all31 actual rows and provenance. All7 literal argv must select this final contract, the real operator guard must embed its actual final digest, and metadata must hash the actual final operator. Verify the real non-inert stale hash rejection and corrected controlled first-phase boundary, with no private preparation. Check complete invocation-time future absence including rowProof.result, every potential screenshot/failure artifact, retained unused owner-capacity output and owner walkthrough. No repeated reads of capacity or runtime here.

Retain byte-identical PROCESS_BIND37 readiness, idle and shared process validator, authenticated RECOVER34 Runtime9 custody and schema, exact PID/PGID/PPID validation, TLS semantics, Support-principal memory-only preparation, exact cwd and Node --import tsx. Preserve distinct operator and child log ownership, tool-captured output with require_escalated, numeric stop-first behavior and all unaffected source hashes. No startup request remains under the user's latest approval. Runtime9 was last ready at LIVE30; postfailure custody remains unproven until later operational readiness.

Fixed31 fresh actual plan remains five sessions,14EN and17RO,max27modelcalls and31000ms pacing. Fresh58 logical proof must follow a fresh capacity gate and precede capture. No carry of the five LIVE30 rows. Full-five natural not-before is2026-09-21T09:51:12.590Z; this is planning, not capacity PASS. Owner6messages and2sessions use natural later availability and their separate command. Product0d34, FINAL18 and44-entry KB7ef remain unchanged. No actual31 or owner walkthrough in this packet.

Seal finite proofs, images, inputs and final bindings. Return PASS_FOOTER_CAPTURE_BOUND_REVIEW_REQUIRED or exact bounded failure; release heavy. Original baseline review follows, limited to this correction and its changed bindings. Forgot unresolved; no CP1 ready, complete or accepted and no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, finite dispositions and qualifications. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='bounded inert footer capture and failure persistence controls; fresh binding only; zero live traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded inert footer correction and final LIVE31 binding only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
state=read(E/'COORDINATOR-CURRENT.json');state.update({'updatedAt':now(),'active':[node],'activeNode':node,'activeAgent':seat,'seat':[seat],'ticket':ticket,'adminFreeze':commit,'heavyLease':node,'gitLease':None,'next':'Await finite helper correction, inert reproduction and final LIVE31 binding; no live run before review and natural expiry.'});write(E/'COORDINATOR-CURRENT.json',state)
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

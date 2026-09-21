"""Repair only the independently found continuation timestamp producer/composer mismatch."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PHASE_IMPORT_FIX46';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE34','GUIDE_UI_WRITER_FIX45','GUIDE_UI_WRITER_REVIEW45']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 assert r['verdict']=='FAILED_CAPACITY_MODULE_LINK_ZERO_OPERATIONAL_TRAFFIC' if parent=='GUIDE_LIVE34' else r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_UI_WRITER_FIX45-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'resolve the real phase module graph before operational execution','GUIDE_LIVE34',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded continuation timestamp repair

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY, debugging and verification skills. Root persisted claim proxy. No reload, new agents or delegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for finite offline controls, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, canonical prompts, decisions or prior evidence edits; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private data or logs; future LIVE35 or actualGUIDE24 outputs; startup or restart; owner questions or acceptance.
- verification: actual changed producer and composer using synthetic data offline, plus directly affected binding guards only. No UI rerun, broad control repetition or new control family.

## 3. Work
Consume LIVE34's exact ESM module-link failure and REVIEW45 PASS. Correct only actual phase module/import wiring. phase-capacity.mjs in BIND40 imports a missing local phase-contract.mjs. Resolve that import to the correct existing reviewed contract helper or an immutable compatible successor; do not invent a placeholder or weaken contract validation. Trace the reachable imports/exports of ALL seven real phase entrypoints plus configured row-proof/capture children, and fix any other concrete wiring omissions of this same cause now, so later phases do not encounter it one at a time. Product code is unchanged and outside edit scope.

Verify actual import/export resolution, not syntax-only or source-search tests. Use real module-load/link controls that stop at the existing missing-contract/gate boundary BEFORE operational I/O, or a real non-evaluating module linker where necessary. Preserve Node --import tsx and exact cwd/module semantics. Record each actual entrypoint, resolved local dependency and expected pre-I/O stopping boundary. All required named exports must resolve. No stand-in module or stubbed entrypoint may bypass the missing import. Prove a deliberately missing dependency rejects. If a command would cross into private preparation, runtime, browser, status, DB, capacity, Support or model activity, do not execute it; use link-only analysis and explain the finite limit. Never print sensitive environments or arbitrary private errors.

Retain actual UI writer/lifecycle, stage-owned files, shared completion state, producer/composer, schedule, budget, screenshot, runtime/schema/process and product PASS. No UI, product or broad test rerun. Only the phase graph wiring, actual load controls and directly affected hashes change. Preserve all authenticated contract helper behavior and the existing private principal parser/ownership checks.

Create fresh LIVE35 operational phase, prerequisite, stop, proof, UI, profile and log paths. Compose to GUIDE_LIVE35-composed31-manifest.json. Existing failed LIVE34 bytes stay unchanged. actualGUIDE24 and owner21 capacity/25 walkthrough remain unused and unchanged. All future paths remain absent after controls. All seven literal argv select this node final command contract; operator embeds actual final digest, metadata hashes executable and retains operatorOwned. Ensure the reachable imported helper closure is actually bound, rather than hashing only entrypoint files.

Same product0d34, KB7ef, ten retained LIVE31 replies and row47 exception; exactly the same outstanding21, three sessions/18 model ceiling,31sec pacing and54-to43 same-session navigation. LIVE32/33/34 have zero actual answers and contribute none. No retry, completed-case resend, runtime restart, extra status/capacity frame or model request. Startup allowance exhausted.

Seal PASS_PHASE_IMPORTS_BOUND_REVIEW_REQUIRED or exact finite blocker with source delta, real import/link controls and final closure/bindings; release heavy. Original reviewer then checks only this wiring correction and new namespace. Forgot unresolved; no CP1 ready, complete or accepted, no CP2.

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
dispatch(node,seat,commit,True,revision,heavy_scope='offline real phase module graph/linking controls and fresh bindings; zero operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded actual phase import repair only, no traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

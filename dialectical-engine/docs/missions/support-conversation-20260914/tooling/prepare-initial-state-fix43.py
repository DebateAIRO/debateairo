"""Repair only the independently found continuation timestamp producer/composer mismatch."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_INITIAL_STATE_FIX43';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_COMPLETION_FIX42','GUIDE_COMPLETION_REVIEW42']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 if parent.endswith('REVIEW42'):assert r['verdict'].startswith('REWORK'),r['verdict']
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_COMPLETION_FIX42-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'share actual capture completion-state initialization with controls','GUIDE_COMPLETION_REVIEW42',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded continuation timestamp repair

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY, debugging and verification skills. Root persisted claim proxy. No reload, new agents or delegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for finite offline controls, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, canonical prompts, decisions or prior evidence edits; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private data or logs; future LIVE32 or actualGUIDE24 outputs; startup or restart; owner questions or acceptance.
- verification: actual changed producer and composer using synthetic data offline, plus directly affected binding guards only. No UI rerun, broad control repetition or new control family.

## 3. Work
Consume the sealed REVIEW42 single finding. The real result initializer omits sessionVersionFailure, leaving undefined, while commitCaptureSuccess rejects any value other than null; the control invented null and masked this deterministic clean-run failure. Correct only this actual-producer shape mismatch in an immutable successor. Initialize sessionVersionFailure:null in the real capture result. Share the same initialized completion-state factory between actual capture and the controls, so the positive fixture cannot differ from production on completed, sessionVersionFailure or sessionCreationTimesUtc. Do not weaken the strict failure check to permit ambiguous state.

Use the production initializer plus production completion predicate in controls. The unmodified clean initial state receives the existing valid synthetic completed21/three-session inputs and reaches one successful completion checkpoint. Existing missing, extra, malformed, unordered and accumulated-failure cases must remain incomplete with zero success checkpoints. Confirm the real capture calls that initializer and completion predicate in the correct order. Retain all other REVIEW42, REVIEW41 and REVIEW40 passing dispositions. No independent stand-in state, source-search-only proof, UI rerun, broad controls or extra review family.

Rebind only this changed initialization/capture module and directly dependent final command, gate and operator hashes under this node. Prefer immutable unchanged source references. All seven phase argv select the final command contract; operator embeds its exact digest; metadata hashes the executable and retains operatorOwned paths. Run directly affected existing stale/current binding guards without private preparation or I/O. Preserve authenticated runtime/parser/schema/process sources, 120-second gate freshness, 5-second future skew and owner contract.

Preserve all ten LIVE31 replies, failed provenance, row47 exception, fixed remaining21, three sessions,18 model branches,31sec pacing and same-session54-to43 navigation. No retry or selection interface. Same LIVE32 and actualGUIDE24 namespace,115 absent future paths, GUIDE_LIVE32-composed31-manifest.json, GUIDE_LIVE21-owner-capacity.json and GUIDE_LIVE25-owner-testability.json. Keep public contract fields compatible with FIX42. No operational output, runtime, browser, Support, status, DB, capacity or model request.

Seal PASS_INITIAL_STATE_BOUND_REVIEW_REQUIRED or a precise finite failure with the narrow delta, actual-initializer completion controls and affected bindings; release heavy. Next review is only this finding and hashes. Product0d34 and KB7ef unchanged. Startup allowance exhausted; Forgot unresolved; no CP1 ready, complete or accepted, no CP2.

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
dispatch(node,seat,commit,True,revision,heavy_scope='offline actual capture initialization correction and directly affected binding controls; zero traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded capture initialization repair only, no traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

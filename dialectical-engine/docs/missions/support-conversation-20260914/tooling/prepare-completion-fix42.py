"""Repair only the independently found continuation timestamp producer/composer mismatch."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_COMPLETION_FIX42';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_SESSION_TIMES_FIX41','GUIDE_SESSION_TIMES_REVIEW41']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 if parent.endswith('REVIEW41'):assert r['verdict'].startswith('REWORK'),r['verdict']
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_SESSION_TIMES_FIX41-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'validate session timestamps before capture completion','GUIDE_SESSION_TIMES_REVIEW41',seat)
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
Consume the sealed REVIEW41 finding. Implement only the concrete missing validation at the actual capture success boundary in an immutable successor. Before result.completed can become true or its success checkpoint can be written, assert exactly three valid ordered identifier-free session creation timestamps with correct ordinals and no accumulated sessionVersionFailure. A failed timestamp record must not be converted into a successful capture receipt. Preserve the already corrected timestamp producer and composer and all unrelated capture behavior.

Exercise the actual completion predicate used by the production capture code with controlled producer-shaped inputs: valid completed21/three-session state may reach success, while missing, malformed, extra or out-of-order timestamp state and an accumulated session failure cannot mark completed or write a success checkpoint. Reuse existing synthetic fixtures. Do not merely test a separate unused helper or search for a source string. Assert the same predicate is invoked before the real completed assignment. Retain FIX41 producer/composer and all REVIEW41 passing dispositions. No UI, budget, helper, product, process or schema re-audit; no broad controls rerun.

Rebind only the changed completion predicate/capture and directly dependent final command, gate and operator hashes under this node. Prefer immutable byte-identical references to unchanged sources. All seven exact phase argv must select this node's final command contract; final operator embeds its actual finalized digest; metadata hashes the executable and preserves operatorOwned outputs and logs. Run only the existing directly affected stale/current digest boundary controls with no private preparation or operational I/O. Preserve phase order, 120-second freshness, 5-second future skew, exact runtime custody and narrow memory-only principal parser.

Keep all ten LIVE31 responses, failed provenance and reviewed row47 exception; exact remaining21 and three-session/18-model schedule,31sec pacing and same-session54-to43 transition unchanged. No retries, favorable resampling, selection API or new cases. Preserve exact LIVE32 and actualGUIDE24 future namespace and all115 prior unique absence paths; composition remains GUIDE_LIVE32-composed31-manifest.json and retained owner outputs remain GUIDE_LIVE21-owner-capacity.json and GUIDE_LIVE25-owner-testability.json. Root's future helper needs the same public contract fields as FIX41. No operational outputs or model requests here.

Seal PASS_COMPLETION_BOUND_REVIEW_REQUIRED or a precise finite failure, showing the minimal source delta, real completion-boundary controls and affected binding controls; release heavy. The original reviewer next inspects only this correction and hashes. Product0d34, KB7ef, historical evidence and failures remain unchanged. Runtime startup allowance exhausted; Forgot unresolved; no CP1 ready, complete or accepted, no CP2.

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
dispatch(node,seat,commit,True,revision,heavy_scope='offline actual capture success-predicate correction and directly affected binding controls; zero traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded capture completion repair only, no traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

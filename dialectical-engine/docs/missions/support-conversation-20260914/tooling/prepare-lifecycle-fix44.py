"""Repair only the independently found continuation timestamp producer/composer mismatch."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PREFLIGHT_LIFECYCLE_FIX44';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE32','GUIDE_INITIAL_STATE_FIX43','GUIDE_INITIAL_STATE_REVIEW43']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 assert r['verdict']=='FAILED_PREFLIGHT_SELF_COLLISION_ZERO_TRAFFIC' if parent=='GUIDE_LIVE32' else r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_INITIAL_STATE_FIX43-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'correct actual operator-to-preflight artifact lifecycle','GUIDE_LIVE32',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded continuation timestamp repair

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY, debugging and verification skills. Root persisted claim proxy. No reload, new agents or delegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for finite offline controls, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, canonical prompts, decisions or prior evidence edits; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private data or logs; future LIVE33 or actualGUIDE24 outputs; startup or restart; owner questions or acceptance.
- verification: actual changed producer and composer using synthetic data offline, plus directly affected binding guards only. No UI rerun, broad control repetition or new control family.

## 3. Work
Consume the sealed LIVE32 zero-traffic failure and independent REVIEW43 PASS. Diagnose and correct only the actual operator-to-preflight artifact lifecycle. The operator initially verifies absence and creates its prerequisite before preflight, but preflight then rejects that owned file as a leftover. Inspect every file created before that check, including prerequisite and operator/phase logs, to correct the complete stage boundary rather than only the first reported path.

Every future path must be absent before the invocation begins. At the preflight stage permit only the exact, correctly owned artifacts necessarily created by this same invocation; unexpected, stale, forged, or late-written future outputs must still reject. Preserve no-follow, strict ownership, no-overwrite and separate log rules. Do not globally exempt future files or silently overwrite a prior result. Prefer one shared production lifecycle validator invoked by both operator and actual preflight, with explicit stages, so their assumptions cannot diverge.

Exercise the real shared operator-to-preflight lifecycle with controlled files and the actual production guard code, including successful initial absence then creation of exactly legitimate own artifacts reaching the preflight boundary. Cover stale prerequisite before initial guard, other preexisting future output, unexpected future file at preflight, forged/wrong binding prerequisite, and exact legitimate owned logs. No stubbed first phase that skips the failing preflight check, no metadata-only or source-search-only proof. Stop controlled success before public UI or any operational/private preparation. Reuse existing fixtures and preserve failures. No new audit family or full UI rerun.

Create a fresh LIVE33 operational namespace and browser profile; preserve LIVE32 failure and all existing bytes. actualGUIDE24 remains unused and stays the actual answer namespace. Rename every operational phase, prerequisite, stop, log, fresh58 proof, UI proof and profile path from LIVE32 to LIVE33 consistently. New composed output is GUIDE_LIVE33-composed31-manifest.json. Retained unused owner command/output and walkthrough remain GUIDE_LIVE21-owner-capacity.json and GUIDE_LIVE25-owner-testability.json. Initial future absence must cover every eventual output and remain true after offline controls. Never create an operational output during controls.

Rebind directly affected preflight/lifecycle imports, command/gate and exact operator under this node, retaining public contract fields and operatorOwned. All seven argv select this final command contract; operator embeds final digest, metadata hashes executable. Run only affected real stale/current boundary guards and new lifecycle controls. Retain REVIEW43 initialization/completion PASS, FIX41 producer/composer, BIND40 real UI/budget, helper39, process37/schema and all product proofs. No repeat tests or audits of unchanged code.

Same product0d34, KB7ef, all ten LIVE31 immutable replies with failed provenance and row47 exception, remaining21 in the same three groups and18-model ceiling,31sec pacing, real54-to43 same-session navigation. LIVE32 has zero answers and contributes none. Future composed31 remains exactly the original ten plus remaining21 across two answer segments. No resampling, retries, quota/config changes or runtime restart. Startup allowance exhausted. No runtime, browser, HTTP, status, DB, capacity, Support or model traffic in this node.

Seal PASS_PREFLIGHT_LIFECYCLE_BOUND_REVIEW_REQUIRED or precise finite failure with lifecycle evidence and affected bindings; release heavy. Original reviewer then reviews only this correction and fresh namespace bindings. Forgot unresolved, no CP1 ready, complete or accepted, no CP2.

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
dispatch(node,seat,commit,True,revision,heavy_scope='offline actual operator/preflight artifact lifecycle and fresh namespace bindings; zero traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded preflight lifecycle repair only, no traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

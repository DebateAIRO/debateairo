"""Repair only the independently found continuation timestamp producer/composer mismatch."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_SESSION_TIMES_FIX41';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_CONTINUATION_BIND40','GUIDE_CONTINUATION_REVIEW40']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 if parent.endswith('REVIEW40'):assert r['verdict'].startswith('REWORK'),r['verdict']
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_CONTINUATION_BIND40-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'correct three-session timestamp composition before live execution','GUIDE_CONTINUATION_REVIEW40',seat)
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
Consume the sealed REVIEW40 disposition. Correct its concrete timestamp producer/composer mismatch in an immutable successor. BIND40's capture only records two timestamps even though the remaining run creates three sessions and composition requires three. Record exactly three identifier-free creation timestamps and ordinals from the actual producer; missing, extra, malformed or out-of-order values must fail. Exercise the same producer logic and createComposedManifest with a realistic synthetic completed21 receipt: three valid timestamps PASS; two, four, malformed and incorrect-order inputs reject. These are synthetic fixtures under this node only, never actual remaining replies or an operational composed31 manifest. Preserve failure evidence and distinguish timestamps from private session identifiers/capabilities, which must never be persisted or hashed.

Retain every REVIEW40 passing disposition, all BIND40 compiled UI and budget proofs, helper39 images, process/schema guards and product reviews. No repeated audits. Implement only the sealed review's bounded defects, if any additional concrete defects are listed. Keep all ten LIVE31 responses unchanged with failed-attempt provenance; remaining21 membership, three groups, at most18 model branches,31sec pacing, same-session54-to43 transition and fixed canonical outcomes remain unchanged. No generic retry or selection interface.

Rebind only affected capture/composer imports, command, gate and exact operator hashes under this node. Prefer byte-identical references to unchanged BIND40 or older reviewed sources. Keep phase order preflight, readiness, capacity, gate, rowProof, capture, idle; all seven literal argv must select this node's final command contract. Final operator embeds its actual finalized command digest and operator metadata hashes the executable. Use finite stale/current digest controls at the existing boundary without private preparation or I/O. No operational execution.

Preserve exact LIVE32 and actualGUIDE24 future namespace, all prior required future-absence paths, complete body-end/failure images and rowProof result. Composition output remains GUIDE_LIVE32-composed31-manifest.json. Retained owner command and outputs remain GUIDE_LIVE21-owner-capacity.json and GUIDE_LIVE25-owner-testability.json. Operator contract must retain operatorOwned outputs and logs. Root's future live helper needs the same public contract field names as BIND40. Before sealing assert all future outputs remain absent; no manifest claims actual remaining21 has run.

Preserve authenticated PROCESS_BIND37 readiness/idle/shared validator, RECOVER34 runtime custody/schema and owner command, exact cwd and Node --import tsx, required execution permissions, narrow in-memory Support-principal parser and separate log ownership. Runtime9 startup allowance is exhausted. No runtime or capacity probe here.

Seal PASS_SESSION_TIMES_BOUND_REVIEW_REQUIRED or exact finite failure with source delta, controls and final bindings; release heavy. A separate original reviewer then inspects only this correction and changed hashes. Do not broaden the verification plan. Forgot unresolved, historical source custody/typecheck qualifications retained; no CP1 ready, complete or accepted, no CP2.

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
dispatch(node,seat,commit,True,revision,heavy_scope='offline bounded three-session timestamp producer/composer correction and directly affected binding controls; zero traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded timestamp repair only, no traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

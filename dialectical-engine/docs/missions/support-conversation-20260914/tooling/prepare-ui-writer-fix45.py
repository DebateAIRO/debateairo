"""Repair only the independently found continuation timestamp producer/composer mismatch."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_UI_WRITER_FIX45';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE33','GUIDE_PREFLIGHT_LIFECYCLE_FIX44','GUIDE_PREFLIGHT_LIFECYCLE_REVIEW44']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 assert r['verdict']=='FAILED_PREFLIGHT_UI_OUTPUT_MODE_ZERO_SUPPORT' if parent=='GUIDE_LIVE33' else r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREFLIGHT_LIFECYCLE_FIX44-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'align the actual UI proof writer with lifecycle ownership','GUIDE_LIVE33',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — bounded continuation timestamp repair

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY, debugging and verification skills. Root persisted claim proxy. No reload, new agents or delegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}; sole heavy for the bounded UI writer control, no Git.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite); {O}/agent-reports/{node}.md (new); read-only owned Runtime9 process, cwd and group identity metadata.
- forbidden: product, Git, KB, canonical prompts, decisions or prior evidence edits; forwarded dynamic, status, capacity, DB, Support or model traffic; private data or logs; future LIVE34 or actualGUIDE24 outputs; startup or restart; owner questions or acceptance.
- verification: actual changed UI proof writer and real lifecycle consumer; one controlled public-asset UI run with every dynamic request intercepted. Ordinary TLS only; no broad repetition.

## 3. Work
Consume the sealed LIVE33 failure and REVIEW44 PASS. Correct only the actual public UI proof writer that emitted mode0644 while the lifecycle consumer requires0600. Preserve strict lifecycle ownership; make the actual writer create its output exclusively with0600 and no symlink following/overwrite. Prefer one production output writer shared with its controls rather than a fixture that invents file permissions. Trace all files produced before PREFLIGHT_UI_COMPLETE against the retained lifecycle requirements, using actual producer code and observed LIVE33 facts, so no second permission mismatch remains hidden behind a stub.

Validate this affected producer with ONE real compiled-public-UI control using the same actual script and write path logic, with a fresh fixture output/profile under this node. First verify existing Runtime9 owned identity from metadata, without reading its private log or restarting. Allow ordinary-TLS local public HTML/assets only; retain complete interception before page load and block/fulfill all dynamic Support, auth, private, status and external requests. No actual Support or model request. The prior LIVE33 UI proof already passed same-session behavior; preserve that exact flow, changing only proof writing. After it writes, run the actual lifecycle consumer on the resulting real output, inspect mode0600/owner/regular-file/nlink/binding and require success. No fixture-only writer, stubbed UI output or source-search-only proof. Preserve any failed control and stop if this actual control fails; do not retry silently.

Retain prior stage lifecycle, initial absence, stale/forged/unexpected output rejection, shared completion initializer, producer/composer, schedule, UI behavior, capacity, helper, runtime/schema/process and product PASS. Run only directly affected writer/lifecycle and binding controls. No broad reruns. Private startup allowance is exhausted; no status, capacity, DB, actual Support/model or lifecycle mutation.

Fresh operational namespace is LIVE34: all phase/prerequisite/stop/proof/UI/profile/log outputs are new; compose to GUIDE_LIVE34-composed31-manifest.json. Preserve immutable LIVE33 failure. actualGUIDE24 and unused owner21 capacity/25 walkthrough remain unchanged. All future paths absent after controls. All seven argv select this node final contract; operator embeds its actual finalized digest; metadata hashes executable and retains operatorOwned. Preserve exact scoped private parser, phase ownership, freshness, runtime identity and all reviewed source references.

Same product0d34, KB7ef and same fixed remaining21 in three sessions/18 model branches with31sec pacing and54-to43 same-session navigation. All ten LIVE31 answers retained with failed provenance and row47 exception; LIVE32/33 have zero actual answers and contribute none. No completed-case resend, extra case, retry or selection interface.

Seal PASS_UI_WRITER_BOUND_REVIEW_REQUIRED or precise finite failure, with actual producer-to-lifecycle evidence, finite controls and final bindings; release heavy. Original reviewer inspects only this correction and new namespace. Forgot unresolved; no CP1 ready, complete or accepted, no CP2.

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
dispatch(node,seat,commit,True,revision,heavy_scope='one actual public UI writer control with all dynamic traffic intercepted, lifecycle validation and directly affected bindings; zero Support/model traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; bounded actual UI writer repair, zero forwarded dynamic traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

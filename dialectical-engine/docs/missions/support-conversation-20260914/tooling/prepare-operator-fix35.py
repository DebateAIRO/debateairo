"""Correct the final operator's stale embedded hash without rebinding its phase chain."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_OPERATOR_FIX35';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_PREVIEW_REVIEW34','GUIDE_PREVIEW_RECOVER34']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert r['verdict'].startswith('REWORK') if parent=='GUIDE_PREVIEW_REVIEW34' else r['verdict']=='PASS_RECOVERED_BOUND_REVIEW_REQUIRED'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_PREVIEW_RECOVER34-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'correct literal operator hash only and prove no-traffic guard','GUIDE_PREVIEW_REVIEW34',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — literal operator hash correction

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY skills. Root persisted claim proxy. No new agent, floor reload or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite inert logs); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, sealed evidence or existing harness edits; changing RECOVER34 command contract or seven phase commands; runtime actions, browser, HTTP, status, capacity, DB, Support or model traffic; private logs or values; owner questions or acceptance.
- verification: sole heavy for narrow no-traffic operator guard controls only. No runtime restart, paid request or new product tests.

## 3. Work
Consumed REVIEW34 found the only scoped blocker: RECOVER34 operator embeds old BIND32 command hash6269d1c5 while actual sealed RECOVER34 contract hash startsf8a5df03. The non-inert assertion rejects before first phase. External operator metadata passes because it contains the new hash; it does not validate the script literal. All other reviewed runtime, two-request accounting, retained full58, screenshot and future-absence dispositions stand.

Create an append-only operator-only successor. Copy the existing RECOVER34 run-operator.mjs to this node and correct its embedded command-contract hash to the verified exact RECOVER34 contract SHA. Retain that RECOVER34 command contract path and every existing phase, runtime, owner, gate, output, profile and log binding. Do not clone or rename the whole command chain. Create {E}/{node}-operator-contract.json (new) pointing to the new script and its hash while commandContract continues to reference the sealed RECOVER34 command contract. Retain exact operational argv and cwd semantics, absolute Node --import tsx, require_escalated, operator-owned logs and no external redirection. New operator argv points to the new script and same RECOVER34 command contract. The old operator remains immutable historical evidence.

Add a bounded regression control that tests the embedded literal against actual public contract bytes and exercises the real non-inert guard in an isolated no-traffic harness, so a metadata-only hash match cannot conceal this failure. Prove stale-hash rejection before any operational child or private preparation and matching-hash acceptance up to a controlled intercepted first-phase boundary. Do not run real operational preflight, private environment loader, browser, status or counters. Preserve a genuine failing control for old bytes and passing final control; make no broader harness semantic change. If no safe isolated branch exercise exists, report the exact limitation rather than consume traffic. Keep all123 future LIVE29 and actualGUIDE22 paths absent and all sealed downstream contracts byte-identical. No duplicated full58, screenshot fixture, product suite or runtime health run.

Seal final script, operator metadata, bounded guard proof and explicit hash of retained RECOVER34 command and runtime contracts. Include exact inputs in manifest. Return PASS_LITERAL_OPERATOR_HASH_FIXED_REVIEW_REQUIRED, release heavy. Independent original reviewer follows this exact delta; then root dispatches same fixed31 using the new operator metadata with the retained command chain. No startup request remains authorized under the two-request approval. Forgot unresolved; no CP1 complete, ready or accepted and no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, exact finite control verdict and immutable artifacts. Strict receipt node, ticket, revision, verdict and artifacts with absolute path, sha256 and bytes, excluding itself. Release heavy; no self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='isolated operator hash-guard controls only; no runtime, network, private preparation or paid traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; literal operator hash only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

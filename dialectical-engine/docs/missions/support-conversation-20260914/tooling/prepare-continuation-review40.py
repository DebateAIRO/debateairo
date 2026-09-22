"""Review corrected footer capture and its changed bindings only."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_CONTINUATION_REVIEW40';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_CONTINUATION_BIND40','GUIDE_FOOTERLESS_REVIEW39','GUIDE_CONTINUATION_REVIEW39','GUIDE_CONTINUATION_FEASIBILITY39']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_CONTINUATION_FEASIBILITY39' or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_CONTINUATION_BIND40-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review exact remaining21 UI transition, budgets and final binding','GUIDE_CONTINUATION_BIND40',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — final same-product continuation binding review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static final continuation sources and actual-UI intercepted proof only; retain already reviewed helper images and product dispositions.

## 3. Work
Review only BIND40 against the adopted same-revision continuation decision and your consumed plan39/helper39 reviews. All ten LIVE31 replies must be retained with FAILED_CAPTURE_ROW47_NO_RETRY provenance, including complete short row47 image; no completed-case recapture or favorable choice. No LIVE30 or older samples. Prior receipt, actual receipt, artifact hashes, product0d34, KB7ef and closed membership must be validated before operational I/O. Verify deterministic composition contract covers31 unique cases from retained10 plus fixed remaining21, and does not prematurely claim actual completeness.

Inspect the real compiled public-UI54-to43 transition proof and exact controller change. It must activate the real keyboard Help link, hydrate full Romanian, restore the same synthetic session/conversation, make zero createSession attempts and exactly one intercepted same-session message. All Support, status, auth, private and external dynamic traffic must be intercepted; distinguish allowed local public asset fetches from zero dynamic/model traffic. No inert markup substitute or language/reset click. Real continuation compares identity/capability only in memory and records booleans/ordinals, never real values or hashes. The mixed-mode allowance must be specific to54-to43; all other mode/language/group and action assertions stay strict.

Verify the remaining21 membership, exact three groups and18 model ceiling, no generic skip/retry interface,31sec pacing, canonical surface/language checks and failure-first behavior. Verify operational capacity imports really require3 sessions,21 messages plus6 reserved owner messages,18 model calls plus6 reserve, preserving original other limits and fresh58 after the gate. Inspect meaningful exact-positive and deficient-session/daily/model negative controls on the actual guard code; metadata-only changes are insufficient. Old5-new-session or31-new-message requirements must not remain active.

Check final seven argv self-bind the finalized command contract; corrected footerless helper and adapter are actually selected by imported hashes; final operator embeds the actual final digest and metadata matches it. Non-inert stale/current guard controls must exercise the real boundary with no private preparation. All potential LIVE32/actualGUIDE24 outputs, body-end/failure images, rowProof.result, profile/operator paths and retained unused owner paths must be unique and absent. PROCESS_BIND37 readiness/idle/shared process validator, RECOVER34 runtime schema/owner command, narrow principal parser, exact cwd, Node --import tsx, required execution permissions and log ownership must remain correctly bound and unchanged.

Retain your helper39 image/source review and earlier valid product/process/schema proofs. Do not repeat them or inspect unchanged whole chains. No new tests/browser/traffic here. Return PASS_FINAL_CONTINUATION21_BINDING or exact bounded REWORK. Actual remaining21, composed31 quality and fresh owner availability are still unproved. Forgot unresolved; no CP1 ready/complete/accepted or CP2.

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
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static final same-product continuation binding review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

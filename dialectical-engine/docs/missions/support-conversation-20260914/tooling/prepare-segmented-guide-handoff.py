"""Prepare final review from explicitly complete segmented coverage, never a relabeled partial."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_PRODUCT','GUIDE_TESTABILITY5'];revision='152eed4da1cd3e66b74d8301159ba76427552409';ticket=read(D/'board-ids.json')['tickets'][node]
product_review=node=='GUIDE_PRODUCT';seat='/root/baseline' if product_review else '/root/preview'
parents=['GUIDE_LOCK_HANDOFF_FIX','GUIDE_CORRECTNESS9','GUIDE_SECURITY9','GUIDE_HARNESS_BIND17','GUIDE_HARNESS_REVIEW17','GUIDE_RUNTIME6','GUIDE_COMPACT_UI_PROBE6','GUIDE_LIVE8','GUIDE_LIVE9','GUIDE_PRODUCT_PREFLIGHT']
if not product_review:parents.append('GUIDE_PRODUCT')
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-AFFECTED-LIVE-VERIFICATION-20260920.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL9-manifest.json']
for parent in parents:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert receipt_revision(r)==revision
 if parent not in ['GUIDE_LOCK_HANDOFF_FIX','GUIDE_LIVE8']:assert r['verdict'].startswith('PASS'),(parent,r['verdict'])
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
for parent in ['GUIDE_EDITORIAL','GUIDE_EDITORIAL_RECHECK','GUIDE_ATTEST']:
 rp=E/(parent+'-receipt.json');files.append(rp);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
for name in ['GUIDE_LIVE_GUIDE17-actual-receipt.json','GUIDE_LIVE9-coverage-manifest.json','GUIDE_LIVE9-owner-testability.json']:
 p=E/name;assert p.is_file();files.append(p)
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
allowed=(f'{D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new)' if product_review else f'{E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new, minimal read-only adapters); {O}/agent-reports/{node}.md (new)')
work=f'''Verify exact complete coverage of all54 canonical cases from the independently reviewed15 retained +39 fresh plan. Check source segment, unique canonical identity, unchanged code, KB, model and row proof, actual public API/DOM equality, outcomes, sources, actions, fixed diagnostic origins and screenshot provenance for every case. Only complete LIVE8 groups1+2 are retained. The partial third group is fully rerun in LIVE9. Old LIVE8 stays failed; this is explicitly segmented coverage, not one successful fresh54 capture. Reject missing, duplicated, misbound or merely inferred rows.

Consume the exact15 per-case product dispositions from GUIDE_PRODUCT_PREFLIGHT by unchanged evidence hashes; do not repeat that completed quality review. Independently review all39 fresh cases, then assemble the54-case quality and coverage disposition. Revisit a retained case only for a concrete new contradiction or changed defining evidence. Evaluate useful, truthful public guidance for every menu family in full and compact EN/RO, including Dialectical-Engine and both libraries, real menus/prerequisites and app-only boundaries. Users can type freely; pills are optional. Review the52-item menu inventory and reviewed KB mappings alongside actual family evidence; state a gap instead of extrapolating from a single answer. Distinguish generic library Compact Help from debate-local How-it-works, according to current UI and reviewed source authority. Check private and injection refusals, recovery classes and actual closed public pointer/keyboard navigation. Inspect screenshots for the existing design, text legibility, usable controls and overflow. Separate accepted model drafts, reviewed fallback answers and deterministic replies; fallback quality is not accepted-draft model quality.

Retain current CORRECTNESS9/SECURITY9 and1701 passing required-suite tests plus1 TODO where defining product bytes are unchanged. Inherited76 type errors and structural eval rubric PENDING remain limitations. No repeated whole-product review, test suite or model sample. Assess {E}/GUIDE_LIVE9-owner-testability.json as a short usable owner script based on observed public rows, with exact messages/session requirements and exposed UI steps only. No invented reset button, hidden profile, DevTools or stored capability. Later GUIDE_TESTABILITY5, not historical help200, establishes immediate current capacity.

Return finite PASS for public-guide scope or precise REWORK with exact source/case and smallest correction. The strongest eventual outcome is WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED. Forgot remains unresolved/actionless; do not claim recovery-link success or CP1 ready, complete or accepted. Initial intake-wide source custody remains unverified, and lost historical failure causes remain qualified. No CP2 or owner acceptance.''' if product_review else f'''Consume separate GUIDE_PRODUCT PASS for the same revision and all54 explicitly segmented cases. Read the exact reviewed script in {E}/GUIDE_LIVE9-owner-testability.json and its session, message and language requirements before any capacity read. Use the sealed measured limits and actual session timestamps only to choose a sensible natural-availability time; do not wait long while holding heavy. If that time has not arrived, release heavy and report the exact time without an exploratory request.

Validate clean152, current RUNTIME6 owned supervisor PID/PGID77769 only with matching command, cwd and listener ancestry,12 owned ports, preservation of9 unrelated services and ordinary system TLS https://localhost:3100/help HTTP200. Do not restart or kill services. Never read, hash or export {O}/logs/GUIDE_LIVE7-stack.log. Use the reviewed capacity reader exactly once: one supported statusGET and one counts-only aggregate, no identifiers, private data or raw records. No Support session, message or model request. Bind measured time, limits and counts to the exact script and prove capacity for the entire walkthrough, including locale-change sessions, daily and short-window messages and model calls. Manual capacity is distinct from a54 or39-case run; require the actual script's needs. No counter reset, quota change, repeated read or calculated-only availability claim.

Seal current ownership/TLS readiness, counts-only frame, exact script/hash, observation time and finite operational PASS or blocker. Keep runtime healthy. Root combines this with the separate product review for the bounded working-preview handoff. Forgot stays unresolved/actionless, no CP1 ready, complete or accepted or CP2. No owner question. A failure stops for exact routing, not an improvised retry loop.'''
packet=f'''# PACKET {node} — {'final public-guide evidence review' if product_review else 'current owner walkthrough availability'}

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain actual BODY skills. Assigned ticket/comments before work; root persisted claim proxy; no subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean read-only primary revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {allowed}.
- forbidden: product, Git, KB, harness or old evidence edits; Support createSession/sendMessage, model calls, private data/account actions, counter/limit mutation, service restart/kill, owner questions/acceptance.
- verification: {'static actual evidence, KB and product custody only; no heavy or runtime/DB activity' if product_review else 'sole heavy for one bounded read-only lifecycle, TLS and manual-capacity frame; no long wait or model traffic'}.

## 3. Work
{work}

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/session/revision/verdict, exact evidence scope/counts, findings/dispositions and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself or ongoing private logs. Release heavy if held; no self-close/readiness/acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,not product_review,revision,heavy_scope='one read-only owned lifecycle, ordinary TLS and exact manual-script capacity frame; no Support/model traffic')

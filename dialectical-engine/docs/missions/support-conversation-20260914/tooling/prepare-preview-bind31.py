"""Bind the reviewed reusable operator to the Pricing correction and reload only its owned preview."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PREVIEW_BIND31';seat='/root/preview';revision=receipt_revision(read(E/'GUIDE_PRICING_CLAIM_FIX-receipt.json'));clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL14-manifest.json',P/'GUIDE_RUNTIME7.md',E/'GUIDE_HARNESS_FIX22-owner-capacity-contract.json']
for parent in ['GUIDE_PRICING_CLAIM_FIX','GUIDE_CAPTURE_FIX30','GUIDE_CAPTURE_REVIEW30','GUIDE_RUNTIME7','GUIDE_HARNESS_REVIEW26','GUIDE_HARNESS_FIX22','GUIDE_HARNESS_REVIEW23','GUIDE_LIVE28']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_CAPTURE_FIX30-manifest.json')['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'bind corrected product and reload owned preview without Support traffic','GUIDE_PRICING_CLAIM_FIX',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f"""# PACKET {node} — final product binding and owned reload

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills. Root persisted claim proxy. No floor reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite logs); {O}/logs/GUIDE_RUNTIME8-stack.log (new, PRIVATE ongoing log, excluded from all reads/hashes/artifacts/freezes); {O}/agent-reports/{node}.md (new); repository-supported owned preview lifecycle files.
- forbidden: product, Git, KB, old evidence or old harness edits; private log reads, hashes, exports; private credential values in outputs; status/capacity/DB/Support/model traffic; app question or owner walkthrough; quota or identity changes, configuration/model/provider changes; unrelated services; owner questions or acceptance.
- verification: sole heavy for bounded offline binding and full58 logical proof, then exact supported owned runtime reload and ordinary TLS health only. Product review proceeds separately; paid31 requires both reviews.

## 3. Work
Retain all completed FIX30 screenshot and operator controls. REVIEW30 screenshot subverdict passes; its separate unsupported Pricing payment claim is now corrected by the consumed product author. Product revision changed, KB7ef and all44 corpus entries unchanged. Original baseline independently reviews that delta. No prior live row carries into the eventual fresh31.

Create an append-only successor using final FIX30 operator, command contract, gate, capture, exact58 producer/consumer binding, runtime schema and owner-capacity contract. Change only mechanically necessary product revision, FINAL14 inventory, implementation hashes/imports, new runtime custody identity/schema and seven final literal self paths. Retain unused LIVE29 phase/output/gate/row-proof/UI/profile paths and actualGUIDE22 screenshot namespace; verify absence. Retain exact31 ordering, five sessions,14EN/17RO,max27modelcalls,31sec pacing,58 logical proof, all screenshot target and actual-pane safeguards. Reuse byte-identical screenshot helper824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29. No new screenshot fixture rerun when helper unchanged. Keep full123 future absence set including rowProof.result and ownerwalkthrough. Operator owns distinct logs after child exit, Node --import tsx, require_escalated execution, narrow SUPPORT_DATABASE_URL to GUIDE_COUNTS_ONLY_DATABASE_URL memory-only preparation, expected debateai_dev_support role. Never reintroduce the failed general API loader, generic DB principal, shell redirection or pre-opened artifact.

Run only necessary final binding controls and current full44 58-row logical proof with exact existing canonical questions, sources and actions. Preserve all previous REDs; no oracle weakening to accept payment inventions. Verify seven final argv self paths and retained proof-before-capture gate. Rebind deferred owner command to exact new product/runtime if necessary, keeping future output GUIDE_LIVE21-owner-capacity.json absent and requirement6messages/2sessions. Existing output reservation-before-reader behavior remains. No operational traffic from inert controls. Seal executable operator metadata with exact cwd/argv and paths, not a regenerated later script.

Then validate current owned Runtime7 identity PID/PGID12272, command pnpm dev:auth:up, cwd and listener ancestry before any stop; PID alone is insufficient. Preserve unrelated services. Use repository-supported DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview pnpm dev:auth:up lifecycle and the proven detached supervisor to reload this owned full stack at exact new revision. Preserve data and counters. No bare/partial server substitute. Required owned ports3100,3101,55433,7177,8988,8890 through8896. Never inspect old or new private ongoing logs. Produce exact planned runtime custody schema/path under this node prefix with ordinary system-TLS https://localhost:3100/help HTTP200 and short-idle ownership evidence. Runtime node label may be GUIDE_RUNTIME8 in the exact new schema; provide all11 schema keys and current actual identity. Actual API KB confirmation remains the later single fresh status/capacity frame, not a checkout CLI assumption. Execute lifecycle/process inspection with require_escalated, no fallback after sandbox failure that consumes quota.

No actual seven-phase run in this node. Stop at real failure, preserve finite evidence. Leave healthy stack detached. Return PASS_BOUND_RELOADED_REVIEW_REQUIRED with final contract, operator, runtime custody, owner command and all exact hashes. Product and final harness independent review precede paid31. Natural bound from LIVE28 has elapsed; it is not a capacity PASS. Future owner sessions still require natural availability. Forgot unresolved; no full CP1 readiness/completion/acceptance and no CP2.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, exact controls and runtime verdict, actual finite receipts. Strict node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding receipt and all private or mutable logs. Release heavy; no self-close/acceptance.
"""
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,True,revision,heavy_scope='necessary inert binding58 and supported owned preview reload; no Support/status/capacity/database/model traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; final operator binding and supported owned reload; no paid traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

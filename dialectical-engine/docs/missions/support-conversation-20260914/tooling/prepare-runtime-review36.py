"""Review only the final literal-hash correction; retain other REVIEW34 dispositions."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_RUNTIME_REVIEW36';seat='/root/baseline';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_RUNTIME_BIND36','GUIDE_LIVE29','GUIDE_OPERATOR_REVIEW35','GUIDE_PREVIEW_RECOVER34']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert parent=='GUIDE_LIVE29' or r['verdict'].startswith('PASS')
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(Path(a['path']) for a in verify(read(E/'GUIDE_RUNTIME_BIND36-manifest.json')['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review actual runtime-schema guard and final fresh live binding','GUIDE_RUNTIME_BIND36',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — actual readiness and final runtime binding review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and review skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support or model traffic; private values or logs; owner questions and acceptance.
- verification: static actual readiness, downstream consumption and final-chain runtime binding review; retain unrelated completed evidence.

## 3. Work
LIVE29 stopped at real readiness before capacity, with0 actual traffic. Your prior metadata-only binding review missed the retained readiness hardcodes Runtime7 and api8787. Review the actual executable readiness source and final literal phase chain against current Runtime9 schema; preserve earlier failed evidence and disclose that coverage gap.

Verify the new readiness authenticates runtimeCustodyContractPath against its bound SHA and enforces exact keys, all required values, current revision and log, positive matching PID and PGID, valid time, complete authoritative ports, detached and ordinary-TLS facts. Check it preserves Git cleanliness, actual process and TLS checks plus output shape. It must derive expected runtime values from the authenticated schema, not replace an old hardcode with a new one or weaken validation.

Inspect the real-source controlled-I/O proofs: old readiness rejects current custody; corrected readiness completes its public checks and output; predecessor node, wrong API port, invalid schema hash, missing or extra key and invalid PID reject before I/O. Verify retained phase-idle consumes corrected output under intercepted process and TLS calls. These are offline controls, not live readiness or answer proof. Confirm no actual child, HTTP, private preparation or future output was produced by controls.

Independently verify the finite static inventory of all7 actual phase argv and transitive validators for the same stale runtime/schema dependency. Read the actual imported sources, not just generation helpers or metadata. Confirm new final readiness argv selects the corrected script, all seven selfpaths select the final RUNTIME_BIND36 command contract, fresh LIVE30 outputs/profile/logs are unique and absent, and unused actualGUIDE22 remains intact. The final operator embedded digest must equal actual finalized command bytes; inspect the actual non-inert hash-guard proof and final script metadata. Keep Node --import tsx, exact cwd, require_escalated, separate log ownership and no redirection.

Retain current product0d34, FINAL18, full58, unchanged FIX30 screenshots, supported Runtime9 custody and exactly2 approved startup requests. Verify reused runtime and owner schema hashes plus fresh proof-before-capture and narrow Support-principal preparation remain correct. No unrelated product, editorial, image, source-ranking or paid-test audit. Current capacity and fresh31 remain unproven until the later single operational run. LIVE29 created0sessions and adds no new hourly wait.

Return PASS_FINAL_RUNTIME_SCHEMA_OPERATOR_BINDING if the actual runtime guard and final executable chain are coherent, with exact finite dispositions; otherwise precise REWORK. This supersedes the insufficient wrapper-binding conclusion while retaining valid factual runtime and product evidence. Forgot unresolved; no CP1 complete, ready or accepted, no CP2.

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
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static operational runtime-schema and final binding review only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

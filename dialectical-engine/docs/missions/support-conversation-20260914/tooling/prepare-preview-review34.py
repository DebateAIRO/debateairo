"""Independent final operator/runtime binding review; retain unchanged screenshot proof."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PREVIEW_REVIEW34';seat='/root/baseline';revision=receipt_revision(read(E/'GUIDE_FINANCIAL_FALLBACK_FIX2-receipt.json'));clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_PREVIEW_RECOVER34','GUIDE_FINANCIAL_FALLBACK_REVIEW2','GUIDE_CAPTURE_FIX30','GUIDE_CAPTURE_REVIEW30']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 assert r['verdict'].startswith('PASS') or parent=='GUIDE_CAPTURE_REVIEW30'
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
manifest=E/'GUIDE_PREVIEW_RECOVER34-manifest.json';files.extend(Path(a['path']) for a in verify(read(manifest)['artifacts']));files=list(dict.fromkeys(files))
ticket=create(node,'review literal final product/operator/runtime binding','GUIDE_PREVIEW_RECOVER34',seat)
inp=E/(node+'-inputs.json');write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f"""# PACKET {node} — final executable binding review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain BODY/review skills, no reload or subdelegation. Root claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/agent-reports/{node}.md (new); {O}/logs/{node}- (new).
- forbidden: product/Git/KB/harness or old evidence edits; heavy execution; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private values or logs; user questions/acceptance.
- verification: bounded static final-binding review only; unchanged screenshot30 and product-review conclusions retained explicitly.

## 3. Work
Verify final sealed operator and seven child commands actually execute exact current revision, FINAL18 and KB7ef from their literal argv and imports, with all command self paths and hashes consistent. Do not approve a fixture contract while final argv point elsewhere. Check current full44 58-row logical proof without changed questions/oracles, fixed31 plan and all current screenshot safeguards. The FIX30 screenshot helper is byte-identical824e780a1817c198a6ca6ebc6215948241ecccbb5611617a033e650799ac4b29; retain its reviewed painted image and restoration evidence, no repeated visual audit.

Verify full future absence set123 (including rowProof.result and ownerwalkthrough), separate operator/wrapper log ownership, Node --import tsx, require_escalated operational launch, exact cwd and output namespaces LIVE29/actualGUIDE22. Verify fresh successful58 proof is consumed and hashed before capture, actual31 uses current API/DOM/source/action/outcome equality, and the first/second session timestamps permit conservative owner capacity timing. No prior LIVE28 row carries forward. Capacity still five capture sessions and later separate two owner sessions/six messages; no resets or retries. Review deferred owner command final binding and reservation-before-read behavior.

Verify new owned runtime custody/schema matches supported exact revision reload, expected ports and unchanged unrelated listener baseline, ordinary system TLS Help200 and detached current process identity. Verify the authorized closed Runtime8 local extractor emits only source-allowlisted fixed error codes, after no-follow ownership, mode, link, size and closed-file checks; it must not hash or export raw log content. Runtime8 local filtering is disclosed explicitly. All other private logs, including ongoing Runtime9, are excluded from reads, hashes and freezes. Verify the recovered startup follows the same supported lifecycle, with preserved configuration, data and unrelated processes. Verify the exact frozen RECOVER33_HANDSHAKE safeguards plus RECOVER34 explicit owner approval and its bounded fixed-code diagnostic. Verify the corrected diagnostic timing against the exact invocation evidence and immutable diagnostic file (07:55:46.698Z to07:56:05.342Z); a manually reported later interval was withdrawn. Artifact absence alone cannot prove invocation count because diagnostic write occurs after inference. Confirm exactly one diagnostic and one full supported start from command evidence. A startup handshake is real model traffic: count the diagnostic and any successful subsequent recovery handshake separately, qualify old zero-model claims as zero Support-answer traffic, and confirm no unapproved retry after diagnostic failure. Confirm successful isolated relay cleanup before full stack start. Authoritative support-preview API port is8890; reject stale8787 custody metadata. Retain the consumed BIND32 full58 proof for unchanged product0d34; do not require a duplicate product run. The planned actual operator is not run yet; static review and reload are not actual answer quality or current capacity proof. Preserve the narrow memory-only SUPPORT_DATABASE_URL loading and expected support principal; no private content needed for review.

Return PASS_FINAL_OPERATOR_RUNTIME_BINDING or exact finite REWORK. Product payment-claim delta has separate consumed review; do not reopen unrelated source/ranking or editorial audits. Forgot unresolved/actionless, CP1 not ready/accepted, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, native session, ticket, revision, finite dispositions. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close.
"""
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
outside=[f for f in files if not any(f.is_relative_to(b) for b in [D,P,O])]
for f in outside:
 assert f.is_relative_to(L)
 git('ls-files','--error-unmatch',str(f.relative_to(L)),cwd=L)
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+[f for f in files if f not in outside],revision)
dispatch(node,seat,commit,False,revision)
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; static final operator/runtime binding only.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

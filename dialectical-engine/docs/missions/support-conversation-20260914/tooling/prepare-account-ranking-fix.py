"""Correct full-corpus public account-navigation ranking; preserve the fixed owner cases."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_ACCOUNT_RANKING_FIX';seat='/root/requirements';revision='0f4290c290fd38caa0ccfb3b6781fb8c33999a22';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL12-manifest.json']
for parent in ['GUIDE_HARNESS_BIND19','GUIDE_SIGNIN_CLASSIFIER_FIX','GUIDE_SIGNIN_CLASSIFIER_REVIEW','GUIDE_QUALITY_FIX2','GUIDE_QUALITY_REVIEW2']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp);files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
write_paths=['packages/support-kb/src/context.ts','tests/unit/support-context.test.ts','tests/unit/support-answer-context.test.ts','tests/integration/support-routes.test.ts'];assert all((L/p).is_file() for p in write_paths)
files=list(dict.fromkeys(files));ticket=create(node,'rank reviewed account-access for public account creation using full44 corpus','GUIDE_HARNESS_BIND19',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files],'writePaths':write_paths,'sourceCustody':custody(),'originalFiles':[rec(L/p) for p in write_paths]})
packet=f'''# PACKET {node} — full-corpus account navigation

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY/debugging/TDD/verification skills; no floor reload or subdelegation. Root claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; base: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed product: {', '.join(str(L/p) for p in write_paths)}.
- allowed evidence: {E}/{node}.md (new); {E}/{node}- (new); {E}/GATE_GUIDE_FINAL13-manifest.json (new); {O}/logs/{node}- (new); {O}/probes/{node}/ (new, finite offline proof only); {O}/agent-reports/{node}.md (new).
- forbidden: other product/KB content/attestation, classifier or harness edits; prior evidence edits; runtime/browser/HTTP/status/capacity/DB/model traffic; private data/logs; quota changes, guessed recovery links, oracle or owner-prompt changes; user questions/acceptance.
- verification: sole heavy for affected full44 context, real answer and route regressions; scoped four-file Git. Disjoint original preview may prepare unbound capture code with no heavy execution. No administrative freeze while this Git lease is active.

## 3. Work
The sealed BIND19 proof passes owner sign-in row57 and fails final row58. Exact `Unde îmi pot crea un cont?` has PUBLIC_GUIDE boundary, null classifier outcome, requestedActionIds sign-up, but the full44 corpus selects settings-help-menus, app-navigation and support-cases with null sourcePolicy. It omits the required reviewed account-access source. The earlier owner test filtered corpus down to the expected article, so it did not prove real ranking. The fixed owner prompt and canonical sign-up/account-access requirement remain unchanged.

Diagnose the actual full-corpus ranking and make the smallest semantic correction to public account-navigation source selection. Use real reviewed canonical action/source authority and existing ranking signals; do not add a literal-prompt exception, hardcode a favorable response or globally force account-access for unrelated account questions. Preserve support-session, settings, case, private-record, unsupported-brand/topic and trusted-debate boundaries. Keep the closed action catalog, source cap, redacted-current-message-only contract and all security precedence unchanged.

First establish RED with all44 production reviewed entries loaded. Replace or strengthen the misleading expected-article-only owner assertions so they cannot claim retrieval coverage with competitors removed. Prove all four exact owner prompts and ordinary EN/RO account-navigation variants with the full corpus, through the real context builder and request-local allowed actions. For row58, include an actual POST route test whose answer service receives the same full44 corpus and traverses ingress plus opaque-reference translation. A synthetic one-article corpus can remain only for unrelated isolated behavior; it cannot be the evidence for this ranking correction.

Check every canonical54 plus4 owner query against the same real public classifiers and full context where feasible from the sealed pure matrix, without importing browser/model/HTTP operations or mutating the harness. At minimum prove the four owner cases and affected existing account/settings/menu regressions before seal; record exact coverage, never claim a future harness58 pass. Run affected context/answer/route suites only, preserve failures, and retain unchanged classifier648 and editorial proof. No redundant broad audit or paid samples. The final coherent58 harness proof still runs in the preview lane after rebinding.

Seal one clean scoped commit and nonempty cumulative FINAL13 inventory. Corpus content/components/manifest remain exact KB7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af, with prior snapshot inherited explicitly. Distinguish new checks from inherited76 type/evaluation evidence. Return IMPLEMENTED_REVIEW_REQUIRED with exact product files, RED/GREEN and source-ranking causal proof, then release heavy/Git promptly. Do not let metadata packaging become another idle critical-path stage; communicate an actual capacity/tool failure immediately.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/baseRevision/revision/verdict, finite checks and limits. Strict receipt productFiles/artifacts absolute/sha256/bytes excluding itself. Forgot unresolved/actionless; no full CP1 readiness/acceptance; CP2 gated. No self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,git_scope=write_paths,heavy_scope='full44 account-ranking RED/GREEN and actual route regressions; scoped clean commit; no operational traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; base='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; sole heavy and exact four-path Git.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

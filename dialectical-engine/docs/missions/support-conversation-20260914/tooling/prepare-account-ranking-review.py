"""Independent review of full44 ranking correction and realistic corpus tests."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_ACCOUNT_RANKING_REVIEW';seat='/root/baseline';author='GUIDE_ACCOUNT_RANKING_FIX';r=read(E/(author+'-receipt.json'));revision=receipt_revision(r);base=r['baseRevision'];clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL13-manifest.json']
for parent in [author,'GUIDE_HARNESS_BIND19','GUIDE_SIGNIN_CLASSIFIER_REVIEW','GUIDE_QUALITY_REVIEW2']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp);files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review full-corpus account-navigation ranking and actual context/route evidence',author,seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'base':base,'inputs':[rec(p) for p in files],'changedPaths':git('diff','--name-only',base,revision,cwd=L).decode().splitlines()})
packet=f'''# PACKET {node} — full-corpus ranking delta review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY/reviewer skills; no floor reload or subdelegation. Root claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact revision: {revision}; base: {base}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/Git/KB/harness or old evidence changes; heavy execution; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private data/logs; user questions/acceptance.
- verification: independent static bounded ranking/test delta only. Retain reviewed code, corpus, classifier and fixed31 plan where unchanged. No whole-app, editorial or broad suite repetition.

## 3. Work
BIND19 proved exact row58 `Unde îmi pot crea un cont?` requests canonical sign-up but full44 ranking selects settings-help-menus, app-navigation and support-cases instead of account-access. The old owner test filtered the corpus to the expected article and therefore missed this retrieval property. Review the semantic correction to real source selection and the fixture correction. Require all44 production reviewed entries to reach the context builder, with competing records present and normal language/source eligibility, for all four exact owner questions and affected account-navigation regressions. A count assertion followed by filtering to the desired record is not full-corpus proof.

Verify actual full-corpus POST row58 traverses ingress, the real context and answer services, request-local action constraints and opaque-reference translation. Source/account-access and canonical sign-up must be admitted before the model draft. Preserve sign-in and Engine owner cases. Inspect ordinary EN/RO wording plus unrelated account/settings/session/case queries so the fix is neither literal-only nor a broad forced-source override. Preserve closed canonical actions, reviewed-public-only admission, source cap, unsupported branded/topic behavior, privacy, injection, credential operations and trusted-debate restrictions. No private information or unredacted history can enter model context.

Verify exact scoped commit and nonempty FINAL13 inventory, all meaningful RED/GREEN and failure provenance, newly executed versus inherited tests, unchanged strict44 KB7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af and attestation bytes. Retain the normalized76 baseline distinction; do not re-label raw typecheck bytes equal. No new editorial audit or plan count review. The final full58 producer proof, capture controls, current runtime, live31 and manual capacity have separate later gates.

Return PASS_FULL_CORPUS_RANKING_DELTA or precise finite REWORK. If a boundary needs execution, request the exact missing discriminator rather than a broad rerun. Forgot unresolved/actionless; no full CP1 readiness/acceptance, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, precise finite dispositions and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close. Report selected-model capacity failures immediately and preserve completed review work.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision);board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; bounded static full44 ranking/test review.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

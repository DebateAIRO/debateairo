"""Review only the correction to public navigation classification and its actual route proof."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_SIGNIN_CLASSIFIER_REVIEW';seat='/root/baseline';author='GUIDE_SIGNIN_CLASSIFIER_FIX';r=read(E/(author+'-receipt.json'));revision=receipt_revision(r);base=r['baseRevision'];clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL12-manifest.json']
for parent in [author,'GUIDE_HARNESS_BIND18','GUIDE_QUALITY_REVIEW2']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp);files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review public sign-in ingress fix and preserved auth boundaries',author,seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'base':base,'inputs':[rec(p) for p in files],'changedPaths':git('diff','--name-only',base,revision,cwd=L).decode().splitlines()})
packet=f'''# PACKET {node} — actual ingress correction review

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY/reviewer skills; no floor reload or subdelegation. Root claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; base: {base}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, harness or old evidence edits; heavy execution; runtime, browser, HTTP, status, capacity, DB, Support/model traffic; private data/logs; user questions/acceptance.
- verification: static independent finite delta review; retain your completed REVIEW2 code, metadata and focused31-plan dispositions where unchanged. No repeated editorial or full-app audit.

## 3. Work
BIND18 full-path proof found a real ingress case omitted by lower answer-service tests: `Where can I sign in?` passed PUBLIC_GUIDE but returned REFUSE_ZONE /login before admitted account-access and canonical sign-in. Review the correction in the public account-navigation predicate and any necessary classifier wiring. It must admit ordinary public sign-in location language, including actual EN/RO regression coverage, without literal-only special casing or broad exemption of all auth-sensitive login mentions.

Verify meaningful RED/GREEN goes through the real ingress classifier and POST support-message route, then reviewed sources, request-local canonical action binding and opaque-reference translation. Calling only the answer helper is insufficient. Confirm exact owner row57 returns admitted account-access and sign-in; row58 account creation and both branded-overview prompts retain prior behavior. Inspect rejection controls for credential disclosure/operations, private-account access, prompt injection, unrelated restricted topics, unresolved recovery and trusted-debate context. No new private data access or secrets in model inputs.

Verify clean scoped commit and nonempty FINAL12 inventory, exact new path hashes and retained source custody. The final44 KB and attestation must remain unchanged at7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af; retain prior reviewed corpus proof instead of a new factual audit. Distinguish newly executed affected checks from inherited broad test/type/evaluation evidence, and preserve all failures. The complete58 offline producer proof still belongs to the resumed harness gate; no claim of actual model or browser success here.

Return PASS_SIGNIN_CLASSIFIER_DELTA or precise finite REWORK with the source-to-outcome path and any missing discriminator. No new plan selection or repeated31 count review: accepted plan is unchanged. Actual browser answer quality, screenshots, runtime KB and manual capacity remain later gates. Forgot unresolved/actionless; CP1 incomplete, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, precise finite dispositions, proof and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No readiness, acceptance or self-close.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision);board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; static classifier delta review only.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

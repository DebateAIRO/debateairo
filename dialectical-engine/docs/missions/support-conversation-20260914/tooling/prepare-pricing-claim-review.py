"""Independent review of the observed unsupported Pricing claim correction."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PRICING_CLAIM_REVIEW';seat='/root/baseline';author='GUIDE_PRICING_CLAIM_FIX';r=read(E/(author+'-receipt.json'));revision=receipt_revision(r);base=r['baseRevision'];clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL14-manifest.json']
for parent in [author,'GUIDE_CAPTURE_REVIEW30','GUIDE_ACCOUNT_RANKING_REVIEW']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp);files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'review unsupported payment claim correction and full-context semantic regressions',author,seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'base':base,'inputs':[rec(p) for p in files],'changedPaths':git('diff','--name-only',base,revision,cwd=L).decode().splitlines()})
packet=f'''# PACKET {node} — Pricing semantic delta review

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}, retained BODY/reviewer skills; no floor reload or subdelegation. Root claim proxy.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact revision: {revision}; base: {base}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {D}/reviews/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product/Git/KB/harness or old evidence changes; heavy execution; runtime/browser/HTTP/status/capacity/DB/Support/model traffic; private data/logs; user questions/acceptance.
- verification: independent static bounded payment-claim/test delta only. Retain reviewed code, corpus, classifier and fixed31 plan where unchanged. No whole-app, editorial or broad suite repetition.

## 3. Work
REVIEW30 found LIVE28 row1 accepted an unsupported claim that payment happens through the debate creator after sign-in. app-navigation establishes creation after sign-in and Pricing is informational, not checkout; budget-tier explicitly disclaims payment and checkout proof. Review the smallest correction in the exact author diff and the discriminating tests. API/DOM equality and ANSWER_GROUNDED are not semantic proof.

Require the exact observed bad answer to be rejected through real context and answer validation with the full44 reviewed corpus. Check EN/RO unsupported positive payment/checkout paraphrases, coordinated creating-or-paying phrasing, legitimate negative payment explanations, and supported creation after sign-in. Ensure useful product answers survive. Server-side enforcement must carry the capability restriction; prompt-only change or an exact input/answer exception is insufficient. Inspect real route ingress and fallback/accounting behavior. Preserve source/action admission, private-data, credential, injection and security precedence; no blanket claim that payments do not exist anywhere.

Verify clean scoped commit, FINAL14 cumulative inventory, truthful RED/GREEN and failure records, unchanged KB7ef and all44 attestations. Distinguish newly executed checks from retained evidence. Screenshot30 PASS is retained separately. No broad audit or tests; request only an exact missing discriminator if necessary. Current runtime, revised harness binding, live31 and owner capacity remain later gates. Return PASS_PRICING_CLAIM_DELTA or finite actionable REWORK. Forgot unresolved/actionless; no CP1 readiness or acceptance; CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, precise finite dispositions and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close. Report selected-model capacity failures immediately and preserve completed review work.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision);board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; bounded static payment-claim/test review.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

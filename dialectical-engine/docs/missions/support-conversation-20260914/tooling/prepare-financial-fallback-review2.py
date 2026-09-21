"""Independent review of the observed unsupported Pricing claim correction."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_FINANCIAL_FALLBACK_REVIEW2';seat='/root/baseline';author='GUIDE_FINANCIAL_FALLBACK_FIX2';r=read(E/(author+'-receipt.json'));revision=receipt_revision(r);base=r['baseRevision'];clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL18-manifest.json',D/'decisions/GUIDE-FINANCIAL-REVIEWED-FALLBACK-20260921.md']
for parent in [author,'GUIDE_FINANCIAL_FALLBACK_REVIEW','GUIDE_CAPTURE_REVIEW30']:
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
Review only the sealed finite family-parity finding and correction. Retain the deterministic reviewed-fallback architecture and useful full44 EN/RO service and POST/accounting dispositions already passed. Closed table: pay/payment/paid maps to plat and achit forms; purchase/buy/bought maps to cump and achiziț forms, with English bought included; billing maps to factur; transaction maps to tranzacț; charge maps to financial debitare/debitat and taxare/taxat. Confirm ordinary normalized and accented forms in that table. Preserve nonfinancial platform/platformă, taxonomie/taxonomic and flow-rate debit, plus ordinary creation/menu prose. No open-ended synonym, new-topic or general-language audit.

Verify the deterministic restriction still sends financial model prose to reviewed fallback regardless of polarity, useful final public guidance remains, and the finite parity tests discriminate the exact missing families. Retain full44 source, route, persistence and accounting evidence where defining code is unchanged; assess any added representative Romanian end-to-end control. No private-data, credential, injection, action or source authority changes. Model-draft acceptance of benign financial paraphrases is not required by the approved decision.

Verify clean scoped commit, FINAL18 inventory, truthful affected tests and preserved failures, unchanged44 KB7ef and base-qualified typecheck limitations. Retain Screenshot30 and all unrelated product review. Return PASS_FINANCIAL_REVIEWED_FALLBACK or precise finite REWORK against this closed table or a directly introduced regression. Product PASS precedes BIND32; live31 and owner capacity remain unproved. Forgot unresolved; CP1 unaccepted and CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, precise finite dispositions and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close. Report selected-model capacity failures immediately and preserve completed review work.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision);board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; bounded static payment-claim/test review.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

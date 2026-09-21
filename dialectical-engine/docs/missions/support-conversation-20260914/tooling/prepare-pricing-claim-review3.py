"""Independent review of the observed unsupported Pricing claim correction."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PRICING_CLAIM_REVIEW3';seat='/root/baseline';author='GUIDE_PRICING_CLAIM_FIX3';r=read(E/(author+'-receipt.json'));revision=receipt_revision(r);base=r['baseRevision'];clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL16-manifest.json']
for parent in [author,'GUIDE_PRICING_CLAIM_REVIEW2','GUIDE_CAPTURE_REVIEW30']:
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
Review the bounded anchored-polarity correction after consumed REWORK_BOUNDED_FINANCIAL_POLARITY_ORDER. Require arbitrary preceding96-character negation authority to be removed. Only clear local negative constructions governing the current financial mention may admit model financial prose; uncertain prose must recover through the existing reviewed fallback. Do not demand acceptance of every benign paraphrase when the final fallback remains useful and true.

Check both ordering directions: earlier financial negative followed by later positive, regardless of prefix or suffix negation, and the observed EN/RO causal/comma/coordinated examples including yet/or/sau. Confirm direct and modal negatives (cannot/can't/does not/doesn't/isn't and EN/RO equivalents) remain useful in the final answer. Inspect the actual local anchoring so it does not just substitute a longer connector list or another broad lookback. Preserve original LIVE28 rejection and the full44 real answer/POST/accounting recovery. No new source, action, private-data, credential and injection capability may be introduced.

Verify exact scoped clean commit, truthful affected-suite evidence, FINAL16 inventory, preserved failed attempts, strict44 KB7ef unchanged and inherited typecheck limitations. Retain Screenshot30 and unrelated reviewed product behavior. Review this causal defect and materially adjacent local-scope behavior, without reopening general language semantics or broad app audits. Return PASS_PRICING_CLAIM_DELTA or exact finite REWORK. Current runtime, final binding, actual31 and owner capacity are later gates. Forgot unresolved; CP1 unaccepted, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, precise finite dispositions and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close. Report selected-model capacity failures immediately and preserve completed review work.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision);board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; bounded static payment-claim/test review.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

"""Independent review of the observed unsupported Pricing claim correction."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_PRICING_CLAIM_REVIEW2';seat='/root/baseline';author='GUIDE_PRICING_CLAIM_FIX2';r=read(E/(author+'-receipt.json'));revision=receipt_revision(r);base=r['baseRevision'];clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL15-manifest.json']
for parent in [author,'GUIDE_PRICING_CLAIM_REVIEW','GUIDE_CAPTURE_REVIEW30']:
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
Review only the bounded local-polarity correction after consumed REWORK_BOUNDED_FINANCIAL_POLARITY. The previous guard allowed an earlier not-checkout claim to license a later positive payment claim across causal clauses, commas or coordination; it also rejected legitimate modal negatives. Verify the exact EN/RO examples and discriminating variants establish local claim polarity without merely splitting the observed connective or matching literal prompts.

Unsupported positive financial capability statements must remain rejected, while legitimate modal negatives and supported creation guidance survive. Retain previously proven exact LIVE28 rejection, full44 context/answer service and actual POST recovery/accounting path where defining code is unchanged; confirm affected final tests truthfully cover the changed validator. Require source/action, credential, private-data and injection precedence unchanged. No blanket claim that payment does not exist anywhere.

Verify exact scoped clean commit, FINAL15 cumulative inventory, new versus retained checks, failures preserved and KB7ef/all44 attestations unchanged. No general re-audit or hypothetical claim to solve all natural-language semantics. Review the identified causal defect and materially adjacent bypasses, return PASS_PRICING_CLAIM_DELTA or precise bounded REWORK with evidence. Screenshot30 PASS remains retained. Current runtime, operator rebind, actual31 and owner capacity remain later gates. Forgot unresolved/actionless; CP1 unaccepted, CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, precise finite dispositions and limits. Strict receipt node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. No self-close. Report selected-model capacity failures immediately and preserve completed review work.
'''
(P/(node+'.md')).write_text(packet);run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,False,revision);board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; bounded static payment-claim/test review.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

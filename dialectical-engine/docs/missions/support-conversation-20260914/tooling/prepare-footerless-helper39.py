"""Parallel bounded helper correction; continuation binding is explicitly excluded."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_FOOTERLESS_FIX39';seat='/root/preview';revision='0d34f82f4a2188d0ce1db04655b693798ffd2169';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-RESUME-20260917.md',E/'GATE_GUIDE_FINAL18-manifest.json']
for parent in ['GUIDE_LIVE31','GUIDE_CAPTURE_FIX38','GUIDE_CAPTURE_REVIEW38']:
 rp=E/(parent+'-receipt.json');r=read(rp);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp)
 files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
files.extend(L/p for p in ['apps/ui/components/support/Assistant.tsx','apps/ui/components/support/SupportWidget.tsx','apps/ui/app/help/page.tsx','apps/ui/app/globals.css'])
files=list(dict.fromkeys(files));ticket=create(node,'capture legitimate footerless replies without masking missing controls','GUIDE_LIVE31',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=f'''# PACKET {node} — footerless helper only, unbound to live continuation

Read FIRST this packet then {P/'COMMON.md'}. Original Sol {seat}; retain loaded BODY and debugging skills. Root persisted claim proxy. No reload, new agents or subdelegation.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean revision: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {E}/{node}- (new); {E}/{node}.md (new); {O}/logs/{node}- (new, finite only); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB, questions/oracles, decisions, existing helpers or prior evidence edits; live runtime/app browser/HTTP/status/capacity/DB/Support/model traffic; private logs, credentials or profile contents; quotas/identity/provider changes; new live command contracts or execution; owner questions/acceptance.
- verification: sole heavy for bounded inert local browser fixtures and controlled I/O only; zero forwarded Support and external traffic.

## 3. Work
Correct only the evidenced helper defect: LIVE31 row47 validly returned a deterministic current refusal with no sources/actions; production markup therefore has no supportCitation footer. The helper required one and threw GUIDE_CAPTURE_SCROLL_EDGE_MISSING. API/DOM equality passed and the actual top image contains the current body. Separate reviewer is deciding whether that original actual image suffices; do not recapture any live response or alter it here.

Create an append-only screenshot helper successor and the minimum unbound call-contract adapter. Distinguish expected footer presence from legitimate absence using the exact current response's already-validated source/action expectations. If sources or actions are expected but their footer is missing, remain closed. Do not treat an arbitrary missing selector as permission to downgrade evidence. For legitimate footerless replies, capture the actual current body start/end in the original pane, preserve strict painted current identity and complete-content visibility, and keep expanded complete evidence separately labeled. A short fully contained reply may use matching start/end positions; a long footerless body needs actual original-pane start/end evidence. Avoid layout mutation in the original-pane captures.

Preserve FIX38's contained-footer no-scroll behavior, bounded settled reveal, all existing source/action/current/stale checks, strict clipping failure, safe before-throw geometry and observed finally restoration. Explicitly label body-end versus source-footer evidence rather than pretending an absent footer exists. Preserve truthful screenshot identities and failure records; no raw DOM/storage/private content.

Use actual production markup/CSS and the exact saved row47 public response for a discriminating old-helper RED and corrected footerless GREEN. Cover affected full/compact EN/RO footerless short responses and one genuinely long body-end case; test missing expected source/action footer rejects, stale/previous target rejects, and exception restoration/diagnostics. Visually inspect the saved actual-sized start/end and expanded images. Retain unaffected prior helper proof instead of broad product or fixture reruns. Preserve any finite fixture failures accurately.

No live binding is authorized here: same-product continuation, remaining session grouping and row47 evidence treatment are under separate static review. Do not assume a new31 run, create LIVE32 outputs, change fixed case selection or construct a generic skip/retry selector. Return PASS_FOOTERLESS_HELPER_UNBOUND_REVIEW_REQUIRED with exact helper/call-contract bytes, affected controls, images, source custody and qualifications. Release heavy and seal; later final binding will consume this immutable helper. No product issue/change claim beyond proven evidence; Runtime9 untouched, no startup allowance remains, Forgot unresolved, no CP1 ready/complete/accepted and no CP2.

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
dispatch(node,seat,commit,True,revision,heavy_scope='bounded inert footerless helper controls only; unbound to live continuation; zero live traffic')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; footerless helper only, no live binding or traffic.'
board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

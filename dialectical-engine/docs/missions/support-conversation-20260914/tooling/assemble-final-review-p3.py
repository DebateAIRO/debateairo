from pathlib import Path
import subprocess,json,hashlib,datetime
S=Path('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine');D=S/'docs/missions/support-conversation-20260914';O=S/'.hermes/reports/support-conversation-20260914';E=O/'evidence';Q=O/'review-packages/CP1-p3';P=S/'.hermes/planning/support-conversation-20260914/packets';L=S/'.worktrees/support-conversation-cp1/dialectical-engine';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
runtimeRev='606b2eabea1dc9212159e53c193cf69655424e77';now=datetime.datetime.now(datetime.timezone.utc).isoformat()
livep=E/'LIVE_P2-consumption.json';assert livep.exists(),'Final live handoff must be consumed first';live=json.loads(livep.read_text());assert live['productCommit']==runtimeRev;summary=live['summary']
pm=E/'GATE_P3-final-product-manifest.json';prod=json.loads(pm.read_text());rev=prod['revision'];assert prod['runtimeEvidenceRevision']==runtimeRev
fixturep=E/'FIX_P2_DEGRADED-consumption.json';fixture=json.loads(fixturep.read_text());assert fixture['productCommit']==rev
assert subprocess.check_output(['git','--no-optional-locks','-C',str(L),'rev-parse','HEAD'],text=True).strip()==rev and subprocess.check_output(['git','--no-optional-locks','-C',str(L),'status','--porcelain'])==b''
for r in prod['productFiles']:assert sha(L/r['laneRelative'])==r['sha256']
workspaces=json.loads((E/'GATE_P3-final-review-workspaces.json').read_text())['workspaces']
for w in workspaces:
 p=Path(w['cwd']);assert subprocess.check_output(['git','--no-optional-locks','-C',str(p),'rev-parse','HEAD'],text=True).strip()==rev and subprocess.check_output(['git','--no-optional-locks','-C',str(p),'status','--porcelain'])==b''
 for r in prod['productFiles']:assert sha(p/r['laneRelative'])==r['sha256']
def put(p,text):
 assert not p.exists(),p;p.write_text(text)
def writej(p,d):put(p,json.dumps(d,indent=2)+'\n')
readme=f'''# CP1 final review pass3 — exact reviewed recovery revision

Review `{rev}` against correction base `{prod['correctionBase']}` and intended-product baseline `{prod['base']}`. The product branch is `codex/support-conversation-cp1`. Each existing separate Sol reviewer has its own detached read-only checkout at this revision, listed in GATE_P3-final-review-workspaces.json. No author is active. This is session separation, not model-family independence.

The complete product range has {prod['productPathCount']} files. The final correction has {prod['patches'][1]['pathCount']} paths across {len(prod['correctionCommits'])} commits; exact commit stats and both final patches are in GATE_P3-final-product-manifest.json. Reuse unchanged prior evidence and read the correction plus affected interfaces. Root reverified the prior 82 pass2 and 114 pass1 artifact hashes mechanically; no wholesale archival reread is required.

SPEC-v3 and CP1-REVIEWED-RECOVERY govern this review, superseding the old server-answer-replacement prohibition and unconditional refusal. New filesystem projections and fallback texts cover 36 language entries/18 pairs. Separate editorial pass2 reviewed all 36 records; manifest v2 binds exact current article/projection/fallback hashes to native reviewer 01a09ef7-e096-7c31-9b35-806840028cf0 and the actual 2026-09-15 evidence. All new owner fields remain blank. Original catalog and 24 article review records are unchanged. The author snapshot is d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df; validate its bindings without confusing canonical catalog digest with catalog.ts file SHA.

Author evidence retains all RED/failure frames. 449/449 across 12 suites binds c7e50817, then 3/3 changed fixture tests bind final 606b2eab; those counts overlap. Latest captured project typecheck at606b returns 1 with the same attributed 76 diagnostics and byte-identical baseline output. It was not repeated after the later one-test projection addition. The mission-added TS2532 was fixed in typing-only commit606b, before the later degraded-fixture-only commit5cbf; REV1 owns its separate disposition. The author manifest's transition RED revision label is qualified in ATTEST_P2-consumption.json: that failure predates the assertion correction and is not a run against exact c7 bytes.

The late degraded-test fixture correction is bound separately in FIX_P2_DEGRADED-consumption.json. It adds the missing admitted projection while preserving the refusal, actual model-call, usage and relay-health oracle; fallback remains absent intentionally. All other tracked Git paths, including runtime/config/content, are unchanged from606b. Final focused fixture evidence is:

```json
{json.dumps(fixture['summary'],indent=2)}
```

The final live worker measured runtime revision606b, not this later test-only Git HEAD. The original failed25 frame is preserved, and its corrected test-file evidence is separately attributed; no whole-suite PASS is invented. The complete live results, consumed with hash and timing checks, are:

```json
{json.dumps(summary,indent=2)}
```

These are one finite final sample, not combined successes from earlier attempts. Read LIVE_P2.md and its indexed immutable outputs for exact seven visitor replies, actions, API/DOM evidence, control timings, failed steps and preview custody. Distinguish accepted model prose, attributed server-authored reviewed recovery, attributed refusal and ambiguity. A fallback success does not prove model improvement. A unique diagnostic UUID and isolated cursor window are bounded attribution, not an API join or proof of discarded completion bytes. The final adapter must pin the trusted top source before each request from the exact snapshot and matched runtime guest context. All seven producer diagnostic keys remain bounded; raw prompt/rejected content and capabilities are excluded.

No further real Support/model/preview request or retry is authorized during review. Reviewers may use their own bounded inert fixtures under the single heavy lease, including compiled UI rendering with synthetic API state when needed. No product source edits or validator relaxation. Existing installed dependencies may be shared by explicitly allowed ignored symlinks; disclose any workspace source resolved through the unchanged primary lane and verify that lane's exact revision/hash binding before and after. Do not install packages or change existing dependency directories.

Forgot password is owner-confirmed and its destination remains unresolved; CP1-A05 blocks readiness. Do not investigate again or invent a substitute. SOURCE_SERIALIZATION found no intake match across exactly 37 current-Git abbreviation widths. That result narrows only that explanation. The historical source byte state, cause, actor and complete intake inventory remain unverified. Final REV3 owns SOURCE_CUSTODY disposition from the bounded evidence; no further source search/restoration.

GATE_P3 is evidence packaging, not functional PASS or checkpoint acceptance. Each final lens gives explicit dispositions for its assigned findings and any concrete affected-interface regressions. Pass3 is the final permitted review; unresolved REWORK becomes an owner decisions row, without a fourth hidden patch/review/sampling loop. CP2/CP3, publication, production release and new owner ratification remain gated.
'''
put(Q/'README.md',readme)
common=[D/'INSTRUCTIONS.md',D/'slices/CP1/SPEC-v3.md',D/'slices/CP1/DONE.md',D/'reviews/CP1-REVIEWED-RECOVERY.md',D/'reviews/REV-CP1-p2-UNION.md',D/'reviews/PLAN_P2-BLUEPRINT.md',E/'PLAN_P2-consumption.json',pm,E/'GATE_P3-final-review-workspaces.json',E/'GATE_P3-finding-state.json',Q/'README.md',Path(prod['patches'][1]['path']),E/'FIX_P2.md',E/'FIX_P2-consumption.json',O/'agent-reports/FIX_P2.md',E/'ATTEST_P2.md',fixturep,E/'FIX_P2_DEGRADED.md',O/'agent-reports/FIX_P2_DEGRADED.md',E/'ATTEST_P2-consumption.json',E/'ATTEST_P2-snapshot-receipt.json',O/'agent-reports/ATTEST_P2.md',E/'EDITREV_P2-consumption.json',D/'reviews/EDITORIAL-RECOVERY-p2.md',E/'HARNESS_P2-consumption.json',E/'LIVE_P2.md',livep]
source=[D/'reviews/CP1-SOURCE-DRIFT.md',E/'SOURCE_SERIALIZATION.md',E/'SOURCE_SERIALIZATION-receipt.json',E/'SOURCE_SERIALIZATION-consumption.json',E/'ROOT-source-custody-forward.json']
security=[O/'probes/REV2_P2/final-security-boundary-probe.ts',O/'logs/REV2_P2-final-security-boundary.log',E/'HARNESS_P2-control-receipt.json',O/'probes/HARNESS_P2/diagnostic-consumer.mjs',O/'probes/HARNESS_P2/response-evidence.mjs',O/'probes/HARNESS_P2/verify-diagnostic-consumer.mjs']
allrefs={}
def add(p,expected=None):
 p=Path(p);assert p.is_file() and not p.is_symlink(),p;h=sha(p)
 if expected:assert h==expected,p
 assert '-stack-detached.log' not in p.name,'Ongoing stack log forbidden'
 allrefs[str(p)]={'path':str(p),'sha256':h,'bytes':p.stat().st_size}
for p in common+source+security:add(p)
for receipt in ['FIX_P2-artifact-receipt.json','EDITFIX_P2-artifact-receipt.json','ATTEST_P2-artifact-receipt.json']:
 p=E/receipt;add(p)
 for x in json.loads(p.read_text())['artifacts']:add(x['absolute'],x['sha256'])
for x in json.loads((E/'HARNESS_P2-consumption.json').read_text())['immutableReferences']:add(x['path'],x['sha256'])
for x in json.loads((E/'SOURCE_SERIALIZATION-receipt.json').read_text())['outputBindings']:add(x['absolute'],x['sha256'])
for x in live['immutableReferences']+fixture['immutableReferences']:add(x.get('path') or x['absolute'],x['sha256'])
add(E/'GATE_P3-product-manifest.json')
for x in json.loads((E/'GATE_P3-product-manifest.json').read_text())['patches']:add(x['path'],x['sha256'])
for name in ['assemble-final-review-p3.py','bind-final-test-delta.py','consume-attest-p2.py','consume-degraded-p2.py','advance-final-review-workspaces.py']:add(D/'tooling'/name)
for p in [E/'EDIT_P2-consumption.json',E/'EDITFIX_P2-consumption.json',E/'EDITREV_P2-receipt.json',E/'EDIT_P2-receipt.json',D/'reviews/EDITORIAL-RECOVERY-p1.md',E/'GATE_P2-manifest.json',Path(prod['patches'][0]['path'])]:add(p)
board=json.loads((D/'board-ids.json').read_text())['tickets']
assigned={1:['COR_C1','COR_C2','COR_C3','LIVE_GUIDANCE','OBS_CORRELATION','TYPE_P2_REGRESSION','INT_P2_DEGRADED'],2:['SEC_P1','SEC_P2','SEC_P3','SEC_CREDENTIAL_POLICY','SEC_ENCODED_CREDENTIAL','LIVE2_ACTION_ID','OBS_CORRELATION'],3:['LIVE_GUIDANCE','LIVE2_ACTION_ID','SOURCE_CUSTODY','DEST']}
focus={1:'U1 complete projections, U2 exact reviewed recovery, immutable snapshot/canonical effects and TYPE_P2_REGRESSION/INT_P2_DEGRADED; retained C1-C3 and request-local reference contracts.',2:'U3-U6 credential span, operation/object scope, canonical views, IDs/labels and affected recovery/summary/canonical sink safety; diagnostic evidence boundary.',3:'Actual seven-row usefulness/product truth, EN pointer/compact RO keyboard, API/DOM/custody/provenance and SOURCE_CUSTODY qualification.'}
charges={1:'''Verify the late support-degraded fixture correction against the retained original failure. Run the final targeted test and your own discriminating inert transport control; do not expect the old NO_SOURCE result from the corrected fixture. Verify that adding the admitted projection restores an actual screened model call, preserved refusal and exact usage/health oracle without fallback or assertion weakening. Do not modify product or its tests; fixture variants belong only in your own probe output. Release the heavy lease promptly after your required fixture execution so the security and product lenses can run their own probes. Review complete admitted projections across every shipped language entry and every model-visible surface, whole-section/composed budget and immutable snapshot identity. Build bounded adversarial fixtures from these claims, not copies of author tests. Verify pre-call trusted top selection, exactly one unchanged model attempt, every rejected draft class including invalid kind/schema/envelope, complete discard, exact same-version fallback or refusal, canonical source and source-appropriate trusted actions, stable cipher/persistence/HTTP bytes and grounded/refusal usage/rating/resolution/E1/E2/E6 behavior. Preserve no-source/private/human/degraded paths and case-summary exclusions. Explicitly dispose TYPE_P2_REGRESSION using the test-only diff and captured 76-diagnostic baseline equality; do not rerun the whole project typecheck. Assess final live attribution/adapter pinning and actual required useful navigation separately from architecture correctness.''',2:'''Independently refute U3-U6 with transformed synthetic cases beyond prior author examples: incomplete quotes, over-bound and punctuation-bearing values across redaction sinks; positive finite/modal/additive operation groups after negative clauses; governed display-name objects; all 52 benign human labels; bounded decoded backslash/drive/UNC paths and exhaustion; all 35 exact machine IDs and stale/unknown/duplicate/cross-request aliases. Verify full answer and summary sinks, exact reviewed fallback admission and no rejected-byte or rejected-array reuse, no retries or auth/reset effects. Reuse the prior failed probe as evidence at e0, and adapt only a new isolated copy for final revision; report any changed fixture assumption. No formal arbitrary-language guarantee. Inspect final pre-traffic adapter controls and strict seven-key consumer without inferring discarded content or API-event join.''',3:'''Verify every actual final visitor answer for useful and accurate prerequisites/limitations, canonical source/action labels and absence of internal aliases, IDs, routes-as-prose or invented controls. Verify real EN creation pointer and compact RO keyboard receipts, all seven API/DOM comparisons, normal TLS and post-browser idle custody. Inspect final full/compact EN/RO rendered evidence against DONE.md and stable signed-in evidence. Use your own inert fixture or compiled render counterexample where needed, under the heavy lease; no new real request. You previously authored the editorial verdict, so do not self-approve that verdict: mechanically verify its exact integration and judge the separately authored product/runtime work. Dispose SOURCE_CUSTODY only from the bounded source evidence, retaining unknown historical byte state/cause/actor; no additional source investigation. Keep unverified Forgot destination as a hard checkpoint blocker.'''}
indices=[];packets=[]
for n in [1,2,3]:
 lens=f'REV{n}';node=f'{lens}_P3';w=workspaces[n-1];ticket=board[node];prior=[D/f'reviews/{lens}-p2.md',E/f'{lens}-p2-consumption.json']
 refs=list(dict.fromkeys(common+prior+(security if n==2 else source if n==3 else [])))
 for p in prior:add(p)
 # All exact final LIVE outputs are available to every lens; each lens reads only its relevant substrate.
 refs+=list(dict.fromkeys(Path(x.get('path') or x['absolute']) for x in live['immutableReferences']))
 refs=list(dict.fromkeys(refs));idx=Q/f'{lens}-inputs.json'
 data={'status':'EXACT FINAL PASS3 LENS INDEX','lens':lens,'revision':rev,'cwd':w['cwd'],'focus':focus[n],'assignedFindings':[{'key':k,'ticket':board[k]} for k in assigned[n]],'inputs':[{'path':str(p),'sha256':sha(p)} for p in refs],'productPaths':prod['productFiles'],'allChangedPaths':prod['patches'][1]['laneRelativePaths'],'historicalReuse':'Reuse prior pass2 disposition and prior complete package within recorded limits; no wholesale archive reread.','mechanicalFloor':'Verify GATE_P3 manifest and own indexed artifacts plus all 108 current product hashes in the detached checkout. No other pass3 lens outputs may be read.'}
 writej(idx,data);add(idx);indices.append(idx)
 seat={1:'/root/plan_review',2:'/root/forgot_destination',3:'/root/baseline'}[n]
 packet=f'''# PACKET {node} — final CP1 {w['lens']} review, pass3 of3

Read FIRST this packet, then {P}/COMMON.md. Resume separate Sol reviewer {seat}. Read assigned ticket comments before claim. Load actual bodies of using-superpowers, heartbeat-protocol, heartbeat-reviewer, verification-before-completion and relevant debugging/TDD skills for new fixtures. Whole library remains available. Prior review is retained, not repeated wholesale.

## 1. Node
- seat: {node} · ticket: {ticket} · model: gpt-5.6-sol · session: {seat} · pass: 3 of 3 · rework rounds: max 3
- cwd: {w['cwd']} · detached exact revision: {rev} · source administrative HEAD: 446c685e977104ecf2b0b5ee0519f7123968429f
- inputs: {D}/INSTRUCTIONS.md; {D}/slices/CP1/SPEC-v3.md; {D}/slices/CP1/DONE.md; {D}/reviews/CP1-REVIEWED-RECOVERY.md; {D}/reviews/REV-CP1-p2-UNION.md; {D}/reviews/{lens}-p2.md; {E}/GATE_P3.md; {E}/GATE_P3-manifest.json; {E}/GATE_P3-final-product-manifest.json; {E}/GATE_P3-final-review-workspaces.json; {E}/GATE_P3-finding-state.json; {Q}/README.md; {idx} and every exact file it indexes. Read affected current product definitions/callers in your detached checkout; no broad audit.
- output: {D}/reviews/{lens}-p3.md (new); {E}/{node}-receipt.json (new)
- self-report: {O}/agent-reports/{node}.md (new)

## 2. Contract
- allowed: {D}/reviews/{lens}-p3.md (new); {E}/{node}-receipt.json (new); {O}/agent-reports/{node}.md (new); {O}/probes/{node} (new, isolated inert fixtures); {O}/logs/{node}- (new, unique captures); {w['cwd']}/node_modules (new, ignored dependency symlink only if needed, target existing {L}/node_modules); {w['cwd']}/apps/ui/node_modules (new, optional ignored symlink only to existing {L}/apps/ui/node_modules); {w['cwd']}/apps/api/node_modules (new, optional ignored symlink only to existing {L}/apps/api/node_modules); {w['cwd']}/packages/support-kb/node_modules (new, optional ignored symlink only to existing {L}/packages/support-kb/node_modules)
- forbidden: product/source/Git/index/ref changes, existing dependency mutation or installation, user data/credentials, auth/reset operations, actual model/Support/preview requests, existing service changes, source investigation/restoration, external messages/connectors, subdelegation, other pass3 lens verdicts, owner acceptance or checkpoint advancement
- verification: same exact product and detached hashes before/after. {'Sole heavy lease granted on dispatch for bounded inert fixtures.' if n==1 else 'No heavy lease initially; prepare your inert fixture and request the lease before execution.'} Use {S}/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh with unique absolute LOG. No broad suite or whole-typecheck repeat. Installed headless runtime with synthetic API data only may be used for own render fixtures after lease grant; no visible browser, TLS bypass or production/real relay access. Put new fixture/cache outputs only in your owned probes/logs; do not let shared dependency caches be mutated. If dependency symlink resolves a workspace module through primary lane, bind that unchanged lane to the exact final revision/hashes and disclose it.

## 3. Work
Review the packet first. Verify the full {prod['productPathCount']}-file product inventory and own lens index hashes, then review the {prod['patches'][1]['pathCount']}-path final correction and affected interfaces using retained pass2 evidence. GATE is packaging and includes any live failure; it is not a PASS. Prior final review3 has not run; this is the last permitted pass.

{charges[n]}

Give explicit dispositions for these assigned findings: {', '.join(k+' '+board[k] for k in assigned[n])}. Root alone changes finding status. Retain prior closed findings unless concrete current evidence reopens them. Distinguish fixture/direct-import/inert HTTP or embedded DB/compiled render/actual model evidence. Avoid claiming a substrate you did not exercise. New probe claims need a discriminating negative control, not a green assertion that merely mirrors implementation. You may use ephemeral loopback and embedded-database synthetic fixtures under the heavy lease; record unique owned process/port if needed and stop only that process.

Forgot destination remains unresolved and checkpoint-blocking; no search, guessed URL, Settings/MFA substitute or new question. Server-authored reviewed recovery is permitted by SPEC-v3; it is not model-improvement evidence. No other lens's pass3 outputs may be read. For new blockers or non-blocking findings, supply concrete current file/line, inputs, wrong outcome, evidence, and owner decision needed if unresolved. Pass3 REWORK becomes a V DECISIONS PACKET row, no hidden fourth review or implementation loop. Separate scope verdict cannot accept CP1.

## 4. Handoff
Write self-report first including verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return actual SKILLS LOADED, ticket/native session/full revision, PASS/REWORK/BLOCKED for named scope, numbered finding dispositions, measured substrate and limits, probe/log hashes, self-report path and comments cursor. End verdict with falsifiable PREDICTIONS without reading other current lenses. Receipt JSON must bind node/ticket/revision/verdict and every final report/self/probe/captured log as artifacts [missionRelative,absolute,sha256,bytes], excluding itself and ongoing logs. Release any heavy lease. No self-close or acceptance; usage UNAVAILABLE unless measured.
'''
 pp=P/f'{node}.md';put(pp,packet);packets.append(pp)
gate=E/'GATE_P3.md';put(gate,f'''# CP1 final pass3 package

Exact product `{rev}`; {prod['productPathCount']} cumulative paths and {prod['patches'][1]['pathCount']} final correction paths. Separate detached Sol review workspaces are ready. All indexed inputs and current product bytes were mechanically verified. Full live evidence is consumed without selecting favorable samples; see {Q}/README.md and LIVE_P2-consumption.json.

GATE means evidence assembled, not functional acceptance. Final correctness/security/product verdicts remain. Forgot destination blocks CP1. No CP1 readiness, owner ratification, CP2/CP3 progression, push or deployment is authorized. Pass3 REWORK goes to an owner decisions row.
''');add(gate)
manifest={'at':now,'state':'PACKAGED FOR FINAL PASS3; NOT ACCEPTED','revision':rev,'base':prod['base'],'correctionBase':prod['correctionBase'],'reviewPass':3,'maximumReviewPasses':3,'productPathCount':108,'productFiles':prod['productFiles'],'immutableInputs':list(allrefs.values()),'inheritedEvidence':prod['inheritedEvidence'],'reportedFinalLiveSummary':summary,'runtimeEvidenceRevision':runtimeRev,'testOnlyCorrection':prod['testOnlyCorrection'],'focusedFinalFixtureSummary':fixture['summary'],'reviewWorkspaces':workspaces,'pendingOwnerInput':'Exact verified existing Forgot password URL/path/UI opener','ownerAcceptance':'PENDING','limits':['Root custody/consumption is not a reviewer verdict.','Typecheck still fails with the attributed 76 diagnostics.','Historical source-custody qualification remains unresolved.','No fourth review or hidden new live sampling loop.']}
mp=E/'GATE_P3-manifest.json';writej(mp,manifest)
freeze=list(dict.fromkeys([*map(Path,allrefs),*packets,mp]))
Path('/private/tmp/support-freeze-gate-p3-list.json').write_text(json.dumps([str(p) for p in freeze],indent=2)+'\n')
print(json.dumps({'manifest':str(mp),'sha256':sha(mp),'immutableInputs':len(allrefs),'lensInputs':{p.name:len(json.loads(p.read_text())['inputs']) for p in indices},'freezeFiles':len(freeze)}))

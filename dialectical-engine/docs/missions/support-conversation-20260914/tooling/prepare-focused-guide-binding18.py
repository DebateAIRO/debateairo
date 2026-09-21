"""Bind final product to the fixed fresh31 demonstration; no operational traffic."""
import runpy,json
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node='GUIDE_HARNESS_BIND18';seat='/root/preview';revision='5d6e028ae5defc24e0690219d6128949e73b750d';clean(revision)
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',D/'decisions/GUIDE-CP1-FOCUSED-LIVE-VERIFICATION-20260920.md',E/'GATE_GUIDE_FINAL11-manifest.json']
for parent in ['GUIDE_QUALITY_FIX2','GUIDE_HARNESS_BIND17','GUIDE_HARNESS_REVIEW17','GUIDE_CAPTURE_FIX18','GUIDE_CAPTURE_CONTROLS18','GUIDE_COMPACT_UI_PROBE6','GUIDE_RUNTIME6','GUIDE_LIVE9']:
 rp=E/(parent+'-receipt.json');assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(rp);files.extend([rp,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(read(rp)['artifacts']))
files=list(dict.fromkeys(files));ticket=create(node,'bind final corpus and focused31 browser demonstration with complete58 offline proof','GUIDE_QUALITY_FIX2',seat)
inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'kbVersion':'7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af','inputs':[rec(p) for p in files],'independentPlanGate':'GUIDE_QUALITY_REVIEW2 pending; preparation allowed, execution forbidden until PASS','nodeExecutable':'/Users/vladmihaimiron/.local/bin/node'})
packet=f'''# PACKET {node} — final focused demonstration binding

Read FIRST this packet then {P/'COMMON.md'}. Resume original Sol {seat}; retain loaded BODY skills. Root persisted claim proxy; do not repeat failed board writes. No subdelegation or floor reload.

## 1. Node
- seat: {node}; ticket: {ticket}; model: gpt-5.6-sol; rework rounds: max 3 under owner continuation.
- cwd: {L}; exact clean product: {revision}; inputs: {inp}.
- self-report: {O}/agent-reports/{node}.md (new).

## 2. Contract
- allowed: {O}/probes/{node}/ (new); {O}/probes/GUIDE_ROW_PROOF_BIND18/ (new); {E}/{node}.md (new); {E}/{node}- (new); {O}/logs/{node}- (new); {O}/agent-reports/{node}.md (new).
- forbidden: product, Git, KB or old evidence edits; runtime lifecycle, browser, app navigation, HTTP, status, capacity, DB, Support or model requests; private data and private logs; quota changes; generic skip or retry; user questions or acceptance.
- verification: sole heavy for bounded inert harness controls and full current-code58-row offline context/source/action proof. Retain completed synthetic screenshot/browser proof without repetition. No product-suite or structural-eval repeat. Original baseline performs disjoint static final product and execution-plan review.

## 3. Work
The final code and attested corpus are now sealed. Prepare append-only BIND18 and ROW_PROOF_BIND18 using the reviewed BIND17 source and the prepared FIX18 command binding plus PASS CONTROLS18 screenshot successor. Use screenshot-evidence-successor.mjs from CONTROLS18, not the earlier clipped screenshot implementation. Preserve the complete current assistant article, original pane top/footer reachability and the explicitly labeled evidence-only expanded view. Bind exact row identity, API/DOM text, visible source/action footer, locale/surface and outcome. Historical samples and screenshots cannot count toward the next run.

Implement only the frozen focused-live decision indexed above. The earlier15 retained plus39 fresh plan is withdrawn. Retain all54 original canonical rows and their branch, source, action and safety assertions. Add exactly four distinct owner rows55 through58 with the exact prompts and admitted authorities from the decision. Do not change a canonical question to make it pass. The actual plan is exactly31 fresh requests, at most27 model calls, five fixed sessions,14 English and17 Romanian cases, with all20 menu families, both broad-guide rows, eight affected prior cases, exact Engine and account questions, two Help navigation interactions and four deterministic boundaries. Preserve initial pricing-English to Account-Romanian language invalidation and terminal injection placement. No older sample is retained as current actual evidence. GUIDE_QUALITY_REVIEW2 must separately PASS this plan before any operational execution; report preparation only if that review remains pending.

Update capacity arithmetic for the fixed31 and five sessions with a reserved six-message owner walkthrough. Preserve the exact gate schema and freshness/skew limits unless an explicit strictly validated field is needed to express the already fixed plan. Keep minimum two naturally available owner sessions as a distinct final handoff requirement; never reset counters or switch identity. The running API still holds the old startup corpus; do not treat a checkout-loading CLI as runtime version proof. Prepare supported-runtime verification and a final counts-only owner frame invocation, but execute neither here.

Bind ALL seven operational phases through absolute executable, script, cwd, argument, output and log paths. Include capacity materialization, preflight, readiness, gate, row proof, actual capture and idle checks. Exact command contracts must reject the old relative-capacity-wrapper mistake before spawn. The operator-facing README must show the literal complete argv and prerequisites; do not omit tsx, binding file or output arguments. Future namespaces must be fresh and absent, including probe outputs, every actual screenshot segment and diagnostics. Use a new GUIDE_LIVE_GUIDE18 namespace if absent; report any collision rather than overwrite. New plan and corpus require coherent fresh ordered bindings, checksums, immutable input index and output manifest.

Retain the purposes of all prior151 composed controls while updating explicit plan bindings only. Preserve original54 logical-matrix controls; new58 offline membership and fixed31 selection must be independently asserted. Retention cannot mean preserving an obsolete15+39 expectation. Run one composed inert proof, additional focused controls for new owner rows, capacity arithmetic and screenshots/absolute invocations only where affected. Keep numerically distinct raw verifier controls and composed provenance; do not inflate counts by claiming historical controls newly executed. Preserve every failed attempt under unique paths. The prior long-reply synthetic browser fixture passed at unchanged successor helper bytes; retain it by exact hash instead of rerunning a browser here.

Run the full54+4 row proof against the real final context and response contracts without importing browser/model/HTTP operations. It must prove real branch, selected reviewed source IDs, request-local allowed actions, and exact KB binding. All new owner prompts must select their expected product-identity or account-access authority. A failure requires the actual root cause and bounded corrective scope, never relaxing an oracle or privately changing the product. All existing private-record, injection, unresolved recovery and closed-action boundaries remain exact. Preserve trusted-debate restrictions and source-alternative predicates reviewed in REVIEW17.

Return PREPARED_CONTROLS_AND_OFFLINE58_PASS or precise REWORK, with exact current product/KB, fixed31 membership, full58 offline results, finite control counts, retained screenshot-helper proof and complete absolute command contract. No current runtime readiness, live model quality, manual capacity or owner acceptance claim. Forgot remains unresolved/actionless; CP1 incomplete and CP2 gated.

## 4. Handoff
Self-report question verbatim:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Return SKILLS LOADED, ticket/native session/revision/verdict, exact delta and all failures, counts and limitations. Strict receipt with node/ticket/revision/verdict/artifacts absolute/sha256/bytes excluding itself. Release heavy; no self-close or acceptance.
'''
(P/(node+'.md')).write_text(packet)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(P/(node+'.md'))])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),P/(node+'.md'),inp,O/'LEDGER.md']+files,revision)
dispatch(node,seat,commit,True,revision,heavy_scope='final fixed31 harness binding, inert composed controls and real current offline58 row proof; no browser/runtime/HTTP/model/product/Git')
board('claim',ticket,'--ttl','10800');marker='ROOT_PERSISTED_CLAIM original '+seat+'; freeze='+commit+'; product='+revision+'; main='+git('rev-parse','HEAD').decode().strip()+'; bounded harness binding and offline58 only; execution plan independent review pending.';board('comment',ticket,marker,'--author','Astra');t=json.loads(board('show',ticket,'--json'));assert t['task']['status']=='running' and any(c['body']==marker for c in t['comments'])
print(json.dumps({'node':node,'ticket':ticket,'freeze':commit,'revision':revision}))

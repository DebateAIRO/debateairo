FULLY DONE — opus-blind (T1) · blind reconstruction filed · comments read through: packet only (no board CLI this mission)

# OPUS BLIND RECONSTRUCTION — dev@1c9578a

Worktree root for every citation below: `.worktrees/algo-lens-opus/dialectical-engine`.
HEAD verified `1c9578a24d5aedd0302fbda5593f66277cd87b98`, tree clean, branch `algo-lens-opus`.
Method: static reading only. No process was run, no database exists in this worktree; every
assertion is a code citation, and anything I could not settle statically is in OPEN QUESTIONS.

## PIPELINE

**P1 · Asker fills the run contract.** `web/app/new/NewQuestionForm.tsx:22-33` builds `AskRequest`
from the form. DATA in: question text, risk tier, composition budget tier, depth, two free-text
steering lists. → out: `AskRequest` with `tier_source:"ASKER"`, `decision_scope:"personal"`,
`as_of` from a server-rendered `machineAsOf`. Depth is validated client-side only as
`Number.isInteger(depth) && depth >= 1` (`:17-20`). CONFIDENCE certain.

**P2 · POST through the Next proxy.** `contractClient.submitAsk` → `POST /v1/asks`
(`packages/contract/src/client.ts:504`), which the Next route forwards to `DIALECTICAL_API_BASE`
with a header allowlist and only the two `__Host-` cookies (`web/app/api/[...path]/route.ts:61-91,
123-141`). CONFIDENCE certain.

**P3 · API admission.** `apps/api/src/index.ts:863-874` parses, calls `application.submit`, replies
`202`. `submit` first checks principal/session agreement (`:1231-1237`), then
`evaluateAskAdmission` (`:1241` → `:1152-1188`): resolve risk, resolve the discovered provider
panel, assert maker admission, resolve the cost-envelope basis. → out: `{risk, envelopeBasis,
discoveredPanel, criticUnavailableCap}`. CONFIDENCE certain.

**P4 · Run row frozen + one work item.** Under an owner admission lease, `startRun` writes the run
(`apps/api/src/index.ts:1246-1275`), then exactly one work item is enqueued —
`batteryRowId:"Q1"`, `nodeSet:[]`, `commandKey:"S00:<runId>:Q1"` (`:1292-1297`) — and dispatched to
Hatchet (`:1298`, gateway at `:1107-1118`). The API returns `{run_ref, status:"QUEUED"}` (`:1299`).
DATA out: one run row, one work item. **The entire debate is one work item.** CONFIDENCE certain.

**P5 · Three progress events, then silence.** `startRun` writes exactly three
`core.run_progress_event` rows at ask time: `PHASE=EMPIRICAL`, `ENVELOPE_STATE=WITHIN`,
`ENVELOPE_CONSUMED=0` (`packages/db/src/index.ts:1211-1221`). Nothing else writes progress events
during a healthy run: the only other writers are `recordRunLifecycleEvent`, restricted by its own
type to `"node.retrying" | "ledger.could_not_do"` (`packages/db/src/index.ts:1034-1046`), and the
`TERMINAL` row written at answer-persist time (`packages/serve/src/index.ts:1221-1226`).
CONFIDENCE certain.

**P6 · Runner claims the item.** `WalkingSkeletonRunner.execute` (`apps/runner/src/index.ts:1223`)
asserts the claim covers the longest organ deadline (`:1224-1237`), refuses loudly if
composition/judgement/serve policy or the scoring operator is unresolved (`:1238-1268`), claims the
item (`:1269-1273`), and reads the frozen run head (`:1281`). CONFIDENCE certain.

**P7 · Panel reconciliation at claim time.** For each pinned panel member the runner looks up a
configured gateway and *optionally* probes it (`:1366-1414`). Absent members are recorded and
dropped; zero survivors is a typed stop (`:1415-1420`). `effectiveMakerCount = configuredMakers.length`,
`primaryMaker = configuredMakers[0]` (`:1421-1422`). CONFIDENCE certain.

**P8 · Idempotency / poison checks.** A prior successful artifact settles the item immediately
(`:1424-1431`); a prior exhausted attempt either fails the item terminally or is remembered as a
pre-halted call site (`:1432-1459`). CONFIDENCE certain.

**P9 · Root position (one model call).** `primaryMaker.judge.judge(...)` with `callSiteKey:"JUDGE"`
(`:1475-1489`). The judge sends one system+user packet demanding a single JSON object
(`packages/judgement/src/index.ts:123-151`) and parses it with a 3-strategy ladder
(raw → one fence → first balanced object, `packages/judgement/src/s04.ts:142-153`).
DATA out: statement, way of knowing, locator, restatement, `valueLaden`, and a 5-block numeric
assessment. CONFIDENCE certain.

**P10 · Reduce → select → persist node.** `reduceAssessment` turns the assessment into `tau`
(`:1497-1505`), `selectReducedJudgement` "selects" over a **one-element array** (`:1506-1513`),
the node and its stranger restatement are written (`:1514-1536`), and the reduced judgement is
recorded with `dispersion:null` and `createUnmeasuredDisagreement()` (`:1537-1556`).
CONFIDENCE certain.

**P11 · Secondary and additional roots.** If `effectiveMakerCount > 1`, each other maker
independently authors its own root with an "author your own position" prompt
(`:1731-1779`). CONFIDENCE certain.

**P12 · Cross-maker review at round boundaries.** `reviewPendingAuthoredNodes` (`:1785-1836`)
picks a different-maker reviewer (`:1791`), calls `judge.review`, and records the outcome
(`:1816-1823`). Review is skipped entirely when `effectiveMakerCount <= 1` (`:1786`).
DATA out: a `ledger.node_review` row per node. CONFIDENCE certain.

**P13 · Pro/con expansion.** `buildMultiMakerExpansionPlan(depth, makers)` (`:1841-1842`,
def `:999-1031`) gives every root a breadth-first binary support/attack tree of `depth` rounds;
legs are authored in order, reviews interleave at round boundaries (`:1853-1897`). Halted subtrees
are pruned (`:1890-1895`). **The plan is empty when `effectiveMakerCount === 1`** (`:1841-1843`).
CONFIDENCE certain.

**P14 · Cross-root exchange.** One response per ordered distinct maker pair, each carrying a
`support` edge to its own root and an `attack` edge to the target root (`:1904-1940`).
CONFIDENCE certain.

**P15 · Snapshot + operator resolution.** The graph is materialised (`:1948`); if any arrow targets
a node, the register-supplied scoring operator is resolved and stamped per target
(`:1952-1977`). CONFIDENCE certain.

**P16 · Judged standing.** `projectJudgedStanding` (`:1981`, def `:299-376`) propagates "judged
basis" from reviewed nodes outward through children and incoming arrows; nodes with empty basis
are *removed from the snapshot* (hidden), nodes with basis but no own review are "derived
standing". When `effectiveMakerCount <= 1`, every node is declared reviewed (`:1978-1980`).
CONFIDENCE certain.

**P17 · Propagation.** `evaluate(snapshot)` (`:1986`) → per-node strengths, arrow order, cluster
records, lift records, sensitivity records. Rows at or below the hidden-node threshold are
collected (`:1987-1990`). CONFIDENCE certain.

**P18 · Served root chosen.** `selectServedRoot(servableMakerPositions)` (`:1999`) →
`buildFixedSingleRootServeNodes` projects **exactly one** node into the serve set with
`loadBearing:true` (`:2001-2004`, def `:964-984`). CONFIDENCE certain.

**P19 · Propagation receipt + condition marks.** The propagation run is recorded with per-node
lineage (`:2006-2040`), then the honesty condition marks are assembled: unserved maker positions,
critique unavailability, hidden/derived nodes, low-score nodes, halted branches
(`:2075-2204`). CONFIDENCE certain.

**P20 · Serve gate chain.** `runServeGateChain` (`:2265-2383`, def `packages/serve/src/index.ts:443-589`)
runs: R9 restatement gate → residual-objection gate → composition-budget gate → compose (≤2
attempts) → conformance per segment → Q51 way-of-knowing gate → post-compose R9 → band ceiling.
Composer, conformance and R9 are three further model calls, all against `primaryMaker.provider`
(`:2289-2301`, `:2340-2352`, `:2362-2374`). CONFIDENCE certain.

**P21 · Terminal battery drain, persist, settle.** Outstanding WAIT rows are resolved
(`:2403-2426`), owed-check and type-fallback marks are appended (`:2431-2471`), the answer is
persisted with the served number (`:2472-2493`), a SERVE ledger entry is appended (`:2498-2510`),
and the work item is settled (`:2511-2521`). CONFIDENCE certain.

**P22 · Display.** The debate page polls `readAnswer`/`readRunAnswer` and opens an SSE stream
(`web/app/debate/[id]/DebatePageClient.tsx:32-47, 75-91`). `projectAnswerSurface` maps the answer
to the surface (`web/lib/v3Presentation.ts:86-103`) and `VerdictBanner` prints
`answer.verdict.state ?? "VERDICT UNAVAILABLE"` plus the confidence band and serve state
(`web/components/VerdictBanner.tsx:4-11`). CONFIDENCE certain.

## THE MATH

**M1 · The three published operators** — `packages/published-arithmetic/src/index.ts:1-14`, verbatim:

```
export function agg(values: readonly number[]): number {
  return 1 - values.reduce((remainder, value) => remainder * (1 - value), 1);
}

export function σ(tau: number, aggregateAttack: number, aggregateSupport: number): number {
  return aggregateAttack >= aggregateSupport
    ? tau - tau * (aggregateAttack - aggregateSupport)
    : tau + (1 - tau) * (aggregateSupport - aggregateAttack);
}

export function product(values: readonly number[]): number {
  if (values.length === 0) throw new TypeError("strict-and has no identity element");
  return values.reduce((product, value) => product * value);
}
```

**M2 · Self-assessment → τ** — `packages/judgement/src/s04.ts:180-194`. The seven metrics are

```
steelman_fidelity  = steelman.fidelity
counter_resilience = 1 - critic.counterargumentStrength
evidence_quality   = evidence.quality
evidence_relevance = evidence.relevance
context_fit        = context.fit
clarity            = Math.max(0, 1 - clarityDecayPerAmbiguity * context.ambiguityFlags.length)
fallacy_resilience = 1 - fallacy.severity
```

and τ is a register-weighted linear sum, clamped:

```
tau = Σ_terms metrics[term.metric] * term.coefficient      (s04.ts:189-193)
tau = Math.max(0, Math.min(1, tau))                        (s04.ts:194)
```

Every input is the *same model's own* self-report about its *own* statement
(`packages/judgement/src/index.ts:202-208`). CONFIDENCE certain.

**M3 · Fatal caps** — `s04.ts:196-201`: for each register cap, if any `fatalFlags[].type ===
cap.whenFatalType` and `tau > cap.to`, then `tau = cap.to`. Caps only lower τ. CONFIDENCE certain.

**M4 · Uncertainty ladder** — `s04.ts:202-204`:
`uncertainty = clamp01(fallacy.severity + clarityDecayPerAmbiguity * ambiguityFlags.length)`, then
the first ladder entry with `uncertainty <= entry.atMost` supplies the label. Label only; it never
re-enters τ. CONFIDENCE certain.

**M5 · Panel selection** — `s04.ts:297-312`: `selectionScore = tau * effectiveWeight`, argmax over
candidates, and **the selected τ is returned unmodified — never averaged or rescaled** (comment at
`:304`). The runner always passes a single candidate (`apps/runner/src/index.ts:1506-1510` and
`:1650-1654`), so the argmax is the identity and `selectionScore = tau * earnedWeight` is recorded
but never compared against anything. CONFIDENCE certain.

**M6 · Arrow contribution** — `packages/propagation/src/index.ts:396-444`. Per cluster group, the
member with the largest contribution survives; the raw contribution is

```
rawContribution = (sourceValue === null || arrow.strength === null || arrow.magnitudeStatus === "UNKNOWN")
  ? null
  : arrow.strength * sourceValue                                     (propagation:399-401)
contribution = (raw === null || polarity === "attack")
  ? raw
  : Math.max(0, raw - (reductionsByEdge.get(arrow.arrowId) ?? 0))    (propagation:402-405)
```

**M7 · Node value** — `packages/propagation/src/index.ts:450-451`, verbatim:

```
    const aggregateSupport = strategy?.aggregateSupport(support) ?? agg(support);
    const result = σ(node.baseStrength, agg(attack), aggregateSupport);
```

**M8 · The load-bearing consequence.** Every edge the runner writes is created with
`strength: null, magnitudeStatus: "UNKNOWN"` (`apps/runner/src/index.ts:1689-1690`), and the only
other production `magnitudeStatus` write is the placeholder edge at
`packages/graph/src/index.ts:422`, also `"UNKNOWN"`. A tree-wide grep finds **no production write of
`"MEASURED"` anywhere** — the literal occurs only in the kernel vocabulary
(`packages/kernel/src/index.ts:178`), the read-side types (`packages/serve/src/index.ts:148,155,1995,2017`)
and the SQL check constraint (`migrations/0002_s02.sql:89,121-122`). Therefore every arrow yields
`contribution === null`, is skipped at `propagation:435-437`, and both `support` and `attack` stay
empty. With `agg([]) = 1 - 1 = 0` and `σ(tau, 0, 0)` taking the `aggregateAttack >= aggregateSupport`
branch, the result is `tau - tau * 0 = tau`:

> **For every node in every run, final strength ≡ that node's own τ. The debate graph has no
> numerical effect on the served number.**

CONFIDENCE certain.

**M9 · Served number** — `apps/runner/src/index.ts:2401-2402` selects the propagation row for the
served root by node identity, and `:2484-2492` persists `value: strength.strength`. By M8 that is
the served root's own τ, i.e. the first configured provider's self-assessment of its own opening
statement. CONFIDENCE certain.

**M10 · Band-ceiling shares** — `packages/serve/src/index.ts:240-256`:
`total = Σ_ways basis[way]`, a cut fires when `basis[way] / total >= minimum` for every declared
way, and `capped = candidateIndex > ceilingIndex` (`:260`). The basis is counted over
`loadBearing` serve nodes (`:559-564`), and there is exactly one (P18), so `total === 1` and every
share is 0 or 1 — the cut vocabulary is evaluated against a single sample. CONFIDENCE certain.

**M11 · Single-lineage cap** — `apps/runner/src/index.ts:2271-2273` replaces the candidate band with
`applySingleLineageBandCap`, one step down `bandOrder` (`:1100-1112`), when only one maker ran.
CONFIDENCE certain.

**M12 · Sensitivity** — `packages/propagation/src/index.ts:605-626` recomputes the whole graph once
per node with that node removed and reports `leverage = max |before - after|`. By M8 removing a
node cannot change any other node's value, so **every leverage is 0 and every `difference` is 0**
for a runner-produced graph. Cost: N+1 full evaluations. CONFIDENCE likely (certain on the
arithmetic; "unsure" only in that a node's removal also removes its own row, which is excluded at
`:610`).

## DECISION POINTS

**D1 · Which answer is served.**
VERDICT: not a choice among candidates at all. `SERVED_ROOT_RULE = "first-configured-provider"`
and `selectServedRoot` returns `configuredProviderRoots[0]` (`apps/runner/src/index.ts:934-944`);
the ordering is provider-discovery order via `createRunnerProviderTopology`
(`apps/runner/src/provider-topology.ts:17-28`). `buildFixedSingleRootServeNodes` then *enforces*
exactly one served root and throws otherwise (`:964-974`). Every other maker's position is
recorded as an `UNSERVED-MAKER-POSITION` honesty mark (`:1050-1070`).
CONFIDENCE: certain.
STRONGEST COUNTER: the rule is deliberate and disclosed — the losing positions stay graph-visible,
the mark names them, and a lift path is printed. It is an honest fixed rule, not an accident. My
answer: disclosure is not selection; nothing in the pipeline ever compares two roots' numbers.

**D2 · Verdict state.**
VERDICT: binary by construction. `deriveHonestVerdict` can return only `"SUPPORTED"` or `null`
(`packages/serve/src/index.ts:662-668`), driven by
`usableBasis = servedNumber !== null && (terminal === "SERVED" || terminal === "DOWNGRADED")`
(`:1008-1012`). The contract and the database both admit `"CONTESTED"` and `"UNSUPPORTED"`
(`packages/contract/src/index.ts:397,485`; `migrations/0000_s00.sql:265`) but no production path
writes them — the two literals appear only in those declarations and in test fixtures
(`tests/support/v2uiFixtures.ts:35`, `tests/render/bug03-home-buffer.test.tsx:13`,
`tests/unit/v2ui-data-layer.test.ts:237`).
CONFIDENCE: certain.
STRONGEST COUNTER: the *number* carries the nuance and the condition marks carry the caveats, so a
coarse label is defensible. My answer: the UI headline is exactly this label
(`web/components/VerdictBanner.tsx:5-7`), so a run whose critique demolished the position still
prints "SUPPORTED".

**D3 · Gate 4 (Q51) — the only gate the content can actually move.**
VERDICT: `packages/serve/src/index.ts:529-551`. If the single load-bearing node is `LOOKED_UP` with
a null locator → COMPONENTS_ONLY. If **all** load-bearing nodes are `REASONING` → `DOWNGRADED`
with `HYPOTHESIS_WITH_RESEARCH_PLAN`. Otherwise → `SERVED` with a `VERDICT`. Because
`wayOfKnowing` is `"LOOKED_UP"` only when the model also returned a non-null locator
(`packages/judgement/src/index.ts:192-196`), and the judge has no retrieval tool and is instructed
"Never invent evidence, citations, or sources" (`packages/judgement/src/index.ts:142`), the
overwhelmingly likely terminal is DOWNGRADED.
CONFIDENCE: certain on the rule; likely on which branch a real run takes.
STRONGEST COUNTER: a model may legitimately return `LOOKED_UP` with a locator from parametric
memory, making SERVED reachable. That is exactly the reading I cannot refute statically — see
OPEN QUESTIONS Q1.

**D4 · Gates that suppress output.** Six, all collapsing to COMPONENTS_ONLY with a `DEFECT` mark
(`packages/serve/src/index.ts:414-441`): R9 restatement on a load-bearing node (`:452-455`),
residual objections (`:458-461`), composition budget in bytes (`:474-477`, measured as
`Buffer.byteLength(JSON.stringify(facts))` at `apps/runner/src/index.ts:2275`), conformance failure
after ≤2 attempts (`:521-524`), the Q51 locator block (`:529-532`), post-compose R9
(`:554-557`). A seventh, envelope exhaustion, produces COMPONENTS_ONLY *without* DEFECT
(`:370-411`). CONFIDENCE certain.

**D5 · What the cross-maker review actually decides.**
VERDICT: visibility only, never magnitude. `readReviewedNodeIds` selects every
`ledger.node_review` row for the run **with no filter on `outcome`**
(`packages/judgement/src/index.ts:408-417`), so `"dispute"` and `"cannot-assess"`
(`packages/judgement/src/index.ts:218-221`) count exactly as `"agree"` does. The outcome is stored
(`:369-377`) and never read by any scoring path.
CONFIDENCE: certain.
STRONGEST COUNTER: review is designed as a *standing* mechanism — did anyone look at this node —
and the honesty marks disclose unreviewed nodes. My answer: then the label "review" oversells it;
a reviewer that disputes every node changes nothing but the reviewer-rotation cursor.

**D6 · Risk tier.**
VERDICT: decorative below admission. `assertMakerAdmission` takes the tier and then ignores it —
its only test is `new Set(configuredMakers).size < 1`, with the tier used solely in the error
string (`packages/critique/src/index.ts:328-340`). `readFrozenHead` does not select any risk column
(`packages/db/src/index.ts:1461-1463`), so the runner never sees it; the only production read is the
answer projection for display (`packages/serve/src/index.ts:1410`).
CONFIDENCE: certain.
STRONGEST COUNTER: the tier is preserved with provenance (`apps/api/src/index.ts:1140-1150`) for
audit, and a future policy layer is the obvious intent. My answer: today, choosing "high-stakes"
versus "casual" changes nothing an asker can observe except a printed word.

**D7 · Depth is accepted unvalidated and dies later.** `resolveExpansionDepth` requires an integer
in `[1,5]` (`apps/runner/src/index.ts:987-996`). Nothing upstream enforces that: the contract
declares `depth_params: z.record(z.string(), z.unknown())`
(`packages/contract/src/index.ts:113`) — a free-form object that does not require a `depth` key at
all — and the form checks only `Number.isInteger(depth) && depth >= 1`
(`web/app/new/NewQuestionForm.tsx:18`). A depth of 6, or an absent `depth`, is therefore accepted,
`202`-ed to the asker with a `run_ref`, and dies inside the runner as `RUN_DEPTH_PARAMS_INVALID`
after the run row and work item already exist. The asker is redirected to a debate page
(`web/app/new/NewQuestionForm.tsx:37`) for a run that cannot start.
CONFIDENCE: certain.
STRONGEST COUNTER: the product UI never emits an out-of-range depth, so only a direct API caller
reaches this. My answer: the API is the contract boundary, and it currently validates nothing about
the one parameter that sizes the whole run.

**D8 · Mono-maker collapse.** With one maker: no review (`:1786`), an **empty expansion plan**
(`:1841-1843`), no cross-root exchange legs (`:1034-1042` yields none for M=1), every node declared
reviewed (`:1978-1980`), and a one-step band cap (`:2271-2273`). The run reduces to one judge call
plus composer/conformance/R9 — a single-model answer with disclosure marks. CONFIDENCE certain.

## DEAD OR ODD

**X1 · `"MEASURED"` is a declared-but-never-produced state.** Vocabulary at
`packages/kernel/src/index.ts:178`, DB constraint at `migrations/0002_s02.sql:89,121-122`, read
paths at `packages/serve/src/index.ts:148,155`. Nothing writes it. This is the root cause of M8.
CONFIDENCE certain. STRONGEST COUNTER: an evidence-verifier organ is clearly planned —
`strengthSource: "EVIDENCE_VERIFIER"` is already stamped on every edge
(`apps/runner/src/index.ts:1691`) — so this is an unbuilt seam, not a bug. My answer: the seam is
unbuilt *and* the propagation machinery around it is fully built and shipped, which is what makes
it dangerous: it looks live.

**X2 · `"RAN"` is unreachable at the node level.** The judge schema offers
`"LOOKED_UP" | "RAN" | "REASONING"` (`packages/judgement/src/index.ts:28,130`) but the result is
narrowed to `pinnedLookup ? "LOOKED_UP" : "REASONING"` (`:195`). A model answering `"RAN"` is
silently recorded as `"REASONING"`. Consequence: the band-ceiling `RAN` share
(`packages/serve/src/index.ts:562`) is always 0. CONFIDENCE certain.
STRONGEST COUNTER: narrowing is deliberate — an unexecuted "RAN" claim would be a lie. My answer:
then the enum should not offer it, and the silent collapse should be a recorded mark.

**X3 · `GATE4_Q51_LOCATOR_BLOCK` is unreachable.** It fires on
`wayOfKnowing === "LOOKED_UP" && locator === null` (`packages/serve/src/index.ts:529`), but
`packages/judgement/src/index.ts:192-196` makes `LOOKED_UP` imply a non-null locator by
construction. CONFIDENCE certain. STRONGEST COUNTER: defence in depth against a future node source
that bypasses the judge. Fair — but it is currently untestable through the product path.

**X4 · Four ask-contract fields are stored and never read.** `decision_scope`, `steering_presets`,
`steering_annotations` and `critic_unavailable_cap` are packed into `askContract`
(`apps/api/src/index.ts:1267-1272`) and written to `core.run.ask_contract`
(`packages/db/src/index.ts:1194-1197`). `readFrozenHead` does not select the column
(`packages/db/src/index.ts:1461-1463`), and a tree-wide grep finds no other production read —
every remaining hit is a migration, an encryption trigger, or a test. **The UI's two steering
textareas (`web/app/new/NewQuestionForm.tsx:50-51`), which promise "logged verbatim", reach no
engine.** CONFIDENCE certain.

**X5 · Five judgement primitives are reachable only from tests.** `runJudgePanel` (`s04.ts:224`),
`measureDispersion` (`:268`), `applyCorrelatedErrorDiscount` (`:283`), `applyDeclaredDisagreement`
(`:314`) and `createTypedNonAnswer` (`:9`) are referenced nowhere in `apps/`, `packages/`, `web/`
or `acceptance/` — only in `tests/unit/judgement-s04.test.ts`, `tests/architecture/scaffold.test.ts`
and `tools/orphan-audit/src/index.ts`. Together they are the entire multi-judge apparatus:
panel execution, spread measurement, correlated-family weight discounting, and the disagreement
downgrade. The shipped path instead hard-codes `dispersion: null` and
`createUnmeasuredDisagreement()` whose reason is the literal `"SINGLE_JUDGE_WALKING_SKELETON"`
(`s04.ts:320-336`; used at `apps/runner/src/index.ts:1553-1555, 1713-1715`).
CONFIDENCE certain.

**X6 · The value-overlay organ is unreachable from the product.**
`WalkingSkeletonRunner.executeValueOverlay` (`apps/runner/src/index.ts:1183-1221`), and through it
`buildValueOverlay`/`serveMixedAnswer` (`packages/valuation/src/index.ts:312,392`), is called only
from `tests/architecture/*`. Nothing in `apps/runner/src/main.ts` invokes it, and no API route
reaches it. The `value_laden` flag the judge returns (`packages/judgement/src/index.ts:201`) is
persisted on the node but drives no overlay. CONFIDENCE certain.

**X7 · Review catch-up is acceptance-only.** `runReviewCatchUp` (`apps/runner/src/index.ts:473`)
is invoked only from `acceptance/review-catch-up.ts:121`. No production entrypoint schedules it.
CONFIDENCE certain.

**X8 · The event stream is a one-shot replay, not a live tail.** `events()` runs its queries once,
returns early if there are no rows (`apps/api/src/index.ts:1427`), yields the sorted batch and
returns (`:1477`); the route then calls `reply.raw.end()` (`:963`). The client reads to
`chunk.done` and resolves (`packages/contract/src/client.ts:~522-540`). Combined with P5, a freshly
submitted run streams at most one usable event — `PHASE` → `run.running` (`:1442`), while
`ENVELOPE_STATE = "WITHIN"` is explicitly dropped (`:1444`) — then the socket closes and the
effect does not re-subscribe (`web/app/debate/[id]/DebatePageClient.tsx:75-91`, deps
`[answer?.run_ref,id,privateDeletionStatus,refresh]`). Until the answer lands, the asker sees
progress only by tab-refocus (`:92-96`) or the manual button (`:141`). CONFIDENCE certain.
STRONGEST COUNTER: `run.terminal` re-triggers `refresh` (`:81`), so the *final* state does arrive
on a stream that happens to still be open. My answer: for a run that takes minutes, the stream
closed long before.

**X9 · Sensitivity records cost N+1 full graph evaluations to record all-zero leverage** (M12,
`packages/propagation/src/index.ts:605-626`), and they are recorded onto the propagation receipt
(`apps/runner/src/index.ts:2021`). CONFIDENCE likely.

**X10 · `selectionScore` is computed, recorded, and never compared.** Written onto the propagation
receipt at `apps/runner/src/index.ts:2016-2020`; by M5 it is `tau * earnedWeight` of the only
candidate. CONFIDENCE certain.

## RUNTIME WIRING

**Does `apps/runner/src/main.ts` construct a runner able to execute a full run?** Yes — the object
graph is complete and every mandatory policy is supplied. Two things make that "yes" conditional.

*Wired, and where each value comes from:*
- Environment (`loadRunnerEnvironment()`, `main.ts:19`): `KEK_PATH`, `DATABASE_URL`,
  `CONTENT_ENCRYPTION_ENABLED`, `USER_DEK_STORE_PATH`, `REGISTER_VERSION`,
  `PROVIDER_DISCOVERY_TARGETS_JSON`, all five `HATCHET_*`, `RUNNER_WORKER_ID`, `CLAIM_MS`,
  `CLAIM_MARGIN_MS`, `MAX_RECOMPOSE`, `JUDGEMENT_NUMBER_KIND`, `JUDGEMENT_PRODUCER`,
  `PROPAGATION_NUMBER_KIND`, `PROPAGATION_PRODUCER`, `PROVIDER_REF`, `VLLM_*` (`main.ts:19-71`).
- Database register rows via `readDevelopmentRunnerPolicy(pool, REGISTER_VERSION)` (`main.ts:41`):
  organ cost bounds (JUDGE/COMPOSER/CONFORMANCE), `runDeathPolicy`, `hiddenNodeScoreThreshold`,
  `compositionBundleBudget` (low/medium/high), `candidateConfidenceBand`, `wayOfKnowingCeiling`,
  `judgementSelectionPolicy`, `scoringOperator`, and five contract hashes
  (`apps/runner/src/dev-runner-policy.ts:18-71, 128-170`), plus the claim-type composition map
  (`:115`).
- Provider topology: index 0 → primary, index 1 → critique, 2+ → additional makers
  (`apps/runner/src/provider-topology.ts:22-28`), cross-checked against `PROVIDER_REF`/`VLLM_*`
  with a `RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT` guard (`main.ts:65-71`).
- Terminal activations: `createTerminalActivationEvaluator(pool)` (`main.ts:90`).
- Hold recorder: real cooldown persistence + `setTimeout` wait (`main.ts:101-118`).
- Hatchet task, worker registration, 30 s readiness, startup reconciliation of orphaned work
  (`main.ts:120-141`).

*Gap 1 — the production runner is gated on development provenance.* The only runner entrypoint
calls `readDevelopmentRunnerPolicy`, which **throws unless every register row's `source_ref`
equals `DEVELOPMENT_SOURCE_REF` or `DEVELOPMENT_RUNNER_SOURCE_REF`**
(`apps/runner/src/dev-runner-policy.ts:105-111, 116-118`, constants at
`apps/runner/src/dev-deployment-register.ts:23,25`). A register sealed with production provenance
fails startup with `DEV_RUNNER_POLICY_PROVENANCE_INVALID`. There is no non-dev policy reader in the
tree. CONFIDENCE certain.

*Gap 2 — `claimTimeProbe` is not wired.* `WalkingSkeletonSettings` declares it
(`apps/runner/src/index.ts:824`) and `execute` branches on it twice (`:1371`, `:1402`), but
`main.ts:72-119` never passes it; the only supplier is `acceptance/main.ts:519`. In production the
whole claim-time liveness path is inert: `state` stays `"HEALTHY"` for any member with a configured
gateway, `#providerProbes.record` is never called, and a provider that died between ask and claim
is used anyway. CONFIDENCE certain.

*Comparison with `acceptance/`.* `acceptance/main.ts:579` builds the same
`PostgresAskApplication`, and `acceptance/main.ts:519` supplies the `claimTimeProbe` the production
runner omits — so the acceptance harness exercises a **strictly richer** runner than the one
`main.ts` ships. That is the inversion worth naming: the probe logic is covered in acceptance and
dead in production.

*Not dev-stubbed but worth naming:* `readDeployment` hard-codes
`fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }` (`apps/api/src/index.ts:1398`).

## OPEN QUESTIONS

**Q1.** How often does a real model return `way_of_knowing: "LOOKED_UP"` with a non-null locator
when told "Never invent evidence, citations, or sources"? This decides whether D3 lands on SERVED
or DOWNGRADED, i.e. whether the product ever shows a verdict rather than a hypothesis. Static
reading cannot settle it; one live run would.

**Q2.** What are the actual register-row values — composition coefficients, `bandOrder`,
`ceilingLabels`, cuts, `earnedWeight`, `hiddenNodeScoreThreshold`, `compositionBundleBudget`? They
live in `register.register_row` in a database, not in this tree. `register.bootstrap.json` exists at
the repo root but I did not open it, since the packet scoped me to code. Every band/threshold
conclusion above is therefore about the *shape* of the arithmetic, not its calibration.

**Q3.** Is there a migration or operational script that seals register rows with the development
source refs in production? If yes, RUNTIME WIRING Gap 1 is a naming problem; if no, it is a
deployment blocker.

**Q4.** How many entries does `PROVIDER_DISCOVERY_TARGETS_JSON` carry in the deployed
configuration? `effectiveMakerCount` decides between the full debate and the D8 mono-maker
collapse, and it is an environment value I cannot see.

**Q5.** Does anything outside the runner ever settle the single `Q1` work item, or re-enqueue on
crash beyond `reconcileRunnerStartupWork` (`main.ts:127-141`)? I traced the happy path and the
exhausted-attempt path but did not exhaustively read `packages/battery/src/terminal.ts` (1122
lines).

**Q6.** I did not read `packages/evidence`, `packages/settlement`, `packages/ledger`,
`packages/budget` internals, or the 3652-line `packages/evaluator/src/index.ts`. The evaluator is
plausibly the intended writer of measured edge magnitudes; if it is, X1/M8 change from "unbuilt" to
"built but unwired", and that is the first thing I would check next.

**Predictions (blindness check).** I expect the other lenses to find the same
`first-configured-provider` served-root rule and the same COMPONENTS_ONLY gate list — those are
hard to miss. I predict at least one lens will **miss M8**, because the two facts that compose it
sit 1,300 lines apart in different packages (`apps/runner/src/index.ts:1690` and
`packages/propagation/src/index.ts:399`) and each looks innocuous alone; a lens reading the
propagation package on its own will describe a rich, correct argumentation calculus and never
notice it is fed exclusively nulls. I also predict a lens will describe the SSE endpoint as a live
stream (X8) on the strength of `text/event-stream` and `connection: keep-alive`
(`apps/api/src/index.ts:953-957`) without following `events()` to its `return` at `:1477`. Where I
am most likely to be the one who is wrong: Q6 — if the evaluator writes measured magnitudes on a
path I did not read, M8 is overstated, and that single fact would rewrite this report's ABSTRACT.
I would check `packages/evaluator/src/index.ts` for an `UPDATE ... magnitude_status` first.

## ABSTRACT

1. The debate graph has no arithmetic effect. Every edge is written `magnitudeStatus:"UNKNOWN"`,
   nothing ever writes `"MEASURED"`, so every arrow contributes null and `σ(τ,0,0)` returns τ.
   Every node's final strength is its own τ.
2. The served number is therefore one model grading its own opening statement: τ from the root
   authored by the first configured provider, picked by config order, never by score.
3. The verdict is binary by construction — `SUPPORTED` or nothing. `CONTESTED` and `UNSUPPORTED`
   live in the contract, the database and the test fixtures, and in no code path.
4. Cross-maker review changes visibility, not magnitude: the reviewed-node query ignores
   `outcome`, so a reviewer disputing every node moves no number.
5. The whole multi-judge apparatus — panel, dispersion, family discount, disagreement downgrade —
   is written, exported, tested and called by nothing; the shipped path hard-codes
   `dispersion: null` and a reason literal reading `SINGLE_JUDGE_WALKING_SKELETON`.

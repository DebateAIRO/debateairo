# DR-184 / DR-184-A — Architecture plan: completable review coverage

**Fired under DR-171** (architecture-consult law) **with DR-175** (a Grok lens
authorizes AND may counter-propose). Author: Opus 5 ARCHITECT seat, 2026-08-15.
**Status: awaiting Grok authorization.** This plan writes no product code and
binds nothing until an independent Grok lens authorizes it; only an authorized
plan re-enters the coding loop as ticket scope. Its only real-tree write is this
file.

Scope of the read: ledger rows DR-115, DR-137, DR-159, DR-161, DR-162-A,
DR-165(3), DR-171, DR-172, DR-173, DR-174, DR-174-A, DR-175, DR-176, DR-177,
DR-178, DR-179, DR-180, DR-181, DR-182, DR-183, **DR-184**, **DR-184-A**;
`reviews/dr174-architecture-plan.md` (whole file, including the R-revision and
its VROW-6-R deferral); `reviews/dr181-architecture-plan.md`; and the live code
cited inline below — every line reference in this document was opened and read,
not recalled.

---

## 1. The incident, stated precisely — including where V's summary is generous to the code

Run `091b7663`, 2026-08-15, the first three-house depth-5 debate. V's ledger row
(DR-184) records: 122 authored nodes, all 122 self-judged, zero low-score hides,
**210 of 262 cross-house review calls transport-failed**, 70 class-H hidden
nodes, default canvas ≈ 5 visible.

### 1.1 The arithmetic checks out exactly, and it names the mechanism

70 nodes × 3 attempts (`acceptanceOrganCostBounds.JUDGE.maxAttempts`) = **210
failed calls**; 52 nodes reviewed successfully in one call each = **52**; total
**262**. The numbers are not approximate — they are the attempt bound times the
failure count. That tells us every one of the 70 failing sites burned its full
ruled attempt bound and then stopped.

### 1.2 The precise defect: the courtesy existed and was already spent

DR-184's text says review call sites "received NO cooldown courtesy — the seam
the DR-174 architect explicitly deferred as VROW-6-R". **That is operationally
true and mechanically imprecise, and the difference decides the fix.**

RESIL-01 shipped the courtesy to review sites. It is right there:

```ts
// apps/runner/src/index.ts:1362-1366
const reviewAttempt = await cooldownAttempt({
  callSiteKey, parentNodeId: authoredNode.nodeId, plannedLegCount: 1,
  failureScope: "REVIEW",
  attempt: (maxAttempts) => reviewer.judge.review({ ... })
});
```

What actually happened is in `withCooldownRetry`
(`apps/runner/src/index.ts:178-258`):

```ts
// :220-221
const holds = await input.hold.countCooldownHolds(input.runId);
if (holds >= input.policy.maxCooldownHoldsPerRun) return halted(error, error.attempts);
```

`max_cooldown_holds_per_run = 2` is **V's ruled cap at DR-174-A(1)**, and the
counter is **per run**, recovered from the recorded event stream (R.1 of the
DR-174 plan, implemented as `RunRepository.countCooldownHolds`). By the time the
terminal review phase began — after ~5 h and 122 authoring calls — the run's two
holds were long spent. Every one of the 70 review exhaustions therefore took the
`halted(...)` path **on the first line of the catch**: no hold, no wait, **and
no final retry**.

**So the seam VROW-6-R deferred is not "reviews have no cooldown". It is: the
hold budget is a single run-wide pool, ruled to bound a waiting user's loading
page, and it is consumed by whichever phase fails first. A terminal review phase
is structurally last in line for a budget it cannot replenish.** That is the
thing to fix, and it is a smaller and more honest fix than "add cooldown to
reviews".

### 1.3 A second defect, found while reading: the 70 halts left no trace in the event stream

`withCooldownRetry`'s `halted()` records a `ledger.could_not_do` progress event
**only for `failureScope === "EXPANSION"`** (`:200-213`). `MAKER_POSITION` and
**`REVIEW`** halts record nothing. The 70 dead review sites exist in
`ledger.ledger_entry` (as `MODEL_CALL` rows with `TIMED_OUT`/`FAILED`) and in the
served condition-mark records — but the run's own public progress stream, the
thing a watcher watches, was silent while 57 % of the debate went dark. This is
a P15 "every caught failure is typed AND ledgered" gap. It is cheap to close and
this plan closes it (§3.3).

### 1.4 The diagnosis "relays exhausted by authoring" is asserted, not yet evidenced

DR-184 attributes the failures to relays worn down by ~5 h of authoring. That is
plausible and it is the ledger's recorded reading. It is **not yet proven**, and
the fix's shape depends on it:

| If the true cause is… | …then interleaving (§3.2) | …and catch-up (§5) |
|---|---|---|
| cumulative load / rate pressure that recovers with idle time | helps a lot — review load spreads across the run | helps |
| a session/auth lifetime that expires at a wall-clock age | helps **partially** — reviews before the expiry land, after it they do not | **is the load-bearing repair** |
| a hard per-session quota | barely helps — the quota is consumed either way | is the load-bearing repair |

**Ticket obligation, before any code:** run the before-state query over
`091b7663` and put its output in the packet —

```sql
SELECT date_trunc('minute', started_at) AS minute, outcome, count(*)
FROM ledger.ledger_entry
WHERE run_id = '091b7663-…' AND action_kind = 'MODEL_CALL'
GROUP BY 1, 2 ORDER BY 1;
```

A clean transition from `OK` to `TIMED_OUT`/`FAILED` at a wall-clock boundary
tells one story; a gradual degradation tells another. **This is free evidence
already on disk and the plan should not guess in front of it** (DR-115's spirit:
do not fill an absence with a plausible story). Both fixes below are correct
under all three causes; only their *relative* value moves.

### 1.5 Why the canvas collapsed to five

Two independent subtree rules compounded:

1. **Engine** — `excludeHiddenSubtrees` (`apps/runner/src/index.ts:260-296`,
   called at `:1443-1444`) removes each class-H node **and every descendant**
   from the evaluated snapshot before `evaluate()`.
2. **UI** — `projectGraph` in `apps/v2-ui/lib/v3/adapter.ts` threads an
   `inheritedHiddenReason` down the tree (parameter at `:127`, merged at `:143`,
   passed to every child at the recursive `build(...)` call `:172-178`),
   stamping `path_status: "abandoned"` and `stopping_reason: "HIDDEN-ANCESTOR"`
   on descendants of a hidden node (`:164-169`);
   `DebateCanvas.withoutSetAsidePaths` (`:47-52`, applied at `:108`) then
   removes those subtrees from the default view.

70 hidden nodes, many of them shallow, veiled ~117 of 122. **DR-184-A retires
rule 2 and re-shapes rule 1.**

---

## 2. What DR-184-A ruled, and the constraint table

> **(1)** a node with judged descendants SERVES with a derived score, its own
> missing cross-review disclosed as a mark on the node — never as a veil over the
> lineage; **(2)** subtree hiding contracts to nodes with NO judged basis at all
> (own review absent AND no judged descendants); **(3)** DR-165(3) is reconciled,
> not waived: the ancestor serves on its judged arguments' authority, not its own
> unjudged assertion — the distinction is carried on the mark.
> — `decisions-ledger.md:1546-1564`

| Constraint | Source | Binding effect here |
|---|---|---|
| **DR-165(3)** no opinion serves unjudged | ledger:1070-1091 | reconciled per DR-184-A(3), never waived: §4 keeps the un-cross-reviewed *assertion* out of the authority claim and puts the distinction on a typed mark; the fix **completes** judgement (§3, §5) rather than lowering the bar |
| **DR-184-A** virtue of arguments | ledger:1546-1564 | the judged-basis closure (§4.1) replaces subtree exclusion; hiding contracts to no-basis nodes |
| **DR-115** never fabricate | ledger:175-189 | §4.4's central finding: no number is invented for a derived-standing node, and the plan says out loud where the arithmetic **cannot yet** deliver what the principle asks |
| **AC-76 / DR-039** no invented numbers | `04-api-contract.md:59` | every new quantity below is a register row or a derivation from shipped exports; unruled ones carry `— none stated` |
| **DR-179** no API keys | ledger:1429-1439 | the catch-up job reuses the CLI relays (`acceptance/claude-relay.ts`, `grok-relay.ts`) and DISC-01 discovery; no key material anywhere |
| **DR-162-A / DR-178 / DR-181** N-generic, discovery-composed panel | ledger:1011, 1407, 1463 | nothing below names a maker, a house, a relay or a panel size; the catch-up's reviewer selection reuses `selectDifferentMakerReviewer` (`apps/runner/src/index.ts:100-128`) |
| **DR-182(4)** the tripwire is computed structural math | ledger:1486-1508 | §5.6 derives catch-up spend from the **pinned** basis; §3.1 re-derives the ceiling formula rather than adding a constant |
| **P10 / grants** append-only store | `migrations/0000_s00.sql:305-311` | `core.node`, `ledger.node_review`, **and `serve.answer`** all have `UPDATE`/`DELETE` revoked — a served answer is structurally immutable, which is what makes §5's new-version shape the only lawful one |
| **AC-65 / S-13** marks minted once in `kernel` | 03 §10 | the one new member goes in `packages/kernel/src/index.ts:69-107`; `contract`, DDL and both UI label tables import it |
| **P17** DDL is the single authority | design-patterns.md:241 | the CHECK amendments are hand-authored in one migration |
| **Edge table rows 1–27** | 03 §3.1 | **no new edge.** The catch-up algorithm lives in `apps/runner` (row 22: imports every engine package except `contract`); its CLI lives in `acceptance/` where the relays already are |
| **AC-04 / §9.5** no write txn across a model call | 03 §9.5 | the catch-up's per-node loop commits each review before the next call, exactly as the in-run loop does |

---

## 3. Seam 1 — in-run review resilience

### 3.1 The hold budget: separate the *wait* from the *final retry*

Two changes, in increasing order of what they cost V.

**(a) The final retry becomes unconditional — no wall clock, no V number needed.**

Today the hold cap gates *both* the 10-minute wait *and* the one extra attempt
(`withCooldownRetry:220-221` returns `halted` before either). Split them: past
the cap, **skip the wait, still spend the final retry.** Cost to the user's
loading page: **zero seconds.** Cost to the envelope: one attempt per exhausted
site, which is a derivation, not an invention — see below.

This alone would not have saved run `091b7663` (a relay that fails three
attempts back-to-back rarely succeeds on a fourth in the same second), and the
plan will not claim otherwise. It is included because it is free, it makes the
`final_retry_attempts` register row mean what its name says, and it removes an
asymmetry that would otherwise confuse every future reading of the policy.

**Ceiling interplay — the part that must not be improvised.**
`computeStructuralCeilingBasis` (`packages/register/src/index.ts:166-196`)
provisions the final retries as a *flat* term:

```ts
// :180-183
const finalRetryTotal = input.maxCooldownHoldsPerRun * input.finalRetryAttempts;
const maxModelAttempts = (authored + reviews) * input.judgeMaxAttempts
  + fixedSites * input.organMaxAttempts + finalRetryTotal;
```

If the final retry becomes per-site, that term becomes
`(authored + reviews) * finalRetryAttempts`, i.e. the ceiling collapses to
`(authored + reviews) * (judgeMaxAttempts + finalRetryAttempts) + fixedSites *
organMaxAttempts`. That is **derived from the same engine exports**, it stays
invisible and unratified per DR-181(3)/DR-182(4), and it must bump
`formula_version` (`:190`, today `"DR-181-v1"`). Concretely at panel 3 / depth 5:
`(195 + 195) × 4 + 12 = 1572` instead of `1196`. **A larger tripwire is not a
larger budget** — it is the same structural worst case, correctly counted. The
ticket must pin the new formula with the arithmetic test that already exists for
the old one.

**(b) A review hold budget — V's number, `— none stated`.**

`runDeathPolicy` gains a second budget so that a phase cannot be starved by an
earlier phase's failures:

| Field | Value | Provenance |
|---|---|---|
| `max_cooldown_holds_per_run` | `2` | V-ruled, DR-174-A(1) — **unchanged** |
| `max_cooldown_holds_per_run_review` | **`— none stated`** | **V's number — VROW-1** |
| `final_retry_applies_past_hold_cap` | `true` | derived from (a); a boolean, not a quantity |

Architecture's reading of the shape, offered for V's correction: DR-174-A(1)'s
cap exists to bound a **waiting user's wall clock** ("the bound on added wall
clock is therefore exactly 2 × 10 min = 20 minutes", dr174 plan R.1). A second
budget re-opens that bound to `(2 + k) × 10 min`. **The honest way to put it to V
is as a wall-clock trade, not as a resilience knob:** every extra hold is
another ten minutes V waits, and V ruled the first bound while watching a
loading page. That is why the number is V's and why this plan proposes none.

Rejected alternative: a *per-phase* cap that resets (authoring gets 2, reviews
get 2, refreshed each phase). Rejected because it makes the wall-clock bound a
function of the run's shape rather than a stated number, which is exactly the
property DR-174-A(1) was ruled to remove.

### 3.2 Interleaving — checked against a real dependency, at round granularity

**Does review depend on complete subtrees? Verified: no.** The review call
(`apps/runner/src/index.ts:1367-1377`) passes exactly
`{ runId, subjectItemId, callSiteKey, questionLine, statement, authorMaker,
providerRef, contractHash, bound }` — the node's own statement and the run's
question. No children, no subtree, no propagated strength. `recordNodeReview`
(`packages/judgement/src/index.ts:325-347`) needs the node row (written before
the review, `apps/runner/src/index.ts:1131-1169`) and nothing else; the DDL
enforces `UNIQUE (node_id)` and a different-maker trigger
(`migrations/0019_xrev01_node_review.sql:11, 14-39`). **Reviews are node-local.**

**So why does the review phase run last?** Searched, and the honest answer is:
because `execute()` is a single sequential pass and the review loop was written
after the collection it iterates. The loop's own comment (`:1351-1355`) states a
*coverage* law, never an ordering one. There is no invariant to break — but there
are two real consequences, and pretending otherwise would be the failure mode
this seat exists to prevent:

1. **Reviewer rotation moves.** `readLatestReviewerMaker(run.runId,
   authoredNode.maker)` (`:1358`) makes each selection depend on the previous
   review's reviewer. Re-ordering the loop re-assigns which house reviews which
   node. That is V's steer (DR-177) and it changes replay fingerprints and any
   test asserting a specific reviewer. **It is a behaviour change, not a bug
   fix, and it must be declared in the ticket rather than discovered in review.**
2. **Envelope ordering moves.** Interleaved reviews consume attempts earlier.
   If the pinned tripwire ever fires (`RUN_COST_ENVELOPE_EXHAUSTED`,
   `packages/budget/src/index.ts:256-263`) the run now loses *authoring depth*
   instead of losing *reviews*. Under DR-165(3) + DR-184 that is the **right**
   trade — a shallower fully-judged debate beats a deeper unjudged one — but it
   is V's product, and V should see the trade named.

**Chosen granularity: per ROUND, not per node.** Review round *r*'s nodes before
authoring round *r+1*. Reasons: (i) it spreads review load across the run's whole
wall clock, which is the entire point; (ii) rotation stays stable and replayable
*within* a round, minimising consequence 1; (iii) a round boundary is a natural
place to record a progress event and to check the coverage invariant; (iv) it
composes with the depth dial with no per-depth special case (DR-162-A). Per-node
interleaving spreads marginally better and churns rotation maximally; a terminal
phase spreads not at all.

**The honest limit, stated up front:** if the cause is a wall-clock session
lifetime (§1.4), interleaving converts "*all* reviews fail" into "reviews after
hour *t* fail". That is a large improvement and it is **not** a cure. The cure
for an already-served debate is §5.

### 3.3 The silent-halt fix

`withCooldownRetry`'s `halted()` (`:192-215`) records its progress event only for
`EXPANSION`. Extend it to every `failureScope`, with the existing vocabulary:
`kind: "ledger.could_not_do"`, `state: "REVIEW_HALTED"` /
`"MAKER_POSITION_HALTED"` beside today's `"EXPANSION_HALTED"`.

- `HoldProgressEvent.state` (`:149`) is a runner-local union — extending it is
  **not** a `kernel` vocabulary change and **not** a `contract` change.
- `core.run_progress_event.kind` already permits `ledger.could_not_do`
  (`migrations/0021_dr174_cooldown_prune.sql:5-11`). **No migration.**
- The API already projects the stream (`apps/api:GET /v1/runs/:id/events`).

Result: a watcher can see reviews dying **while it happens**, instead of learning
it from a condition mark five hours later.

---

## 4. Seam 2 — the judged-standing projection (DR-184-A's mechanism)

This replaces `excludeHiddenSubtrees` at `apps/runner/src/index.ts:1443-1444`,
and it is the **one implementation shared by the in-run path and the catch-up
job** (§5.4). That sharing is the reason it is specified here as its own seam.

### 4.1 The closure — and why subtree exclusion falls out instead of being imposed

```
reviewed(n)        ⟺ a ledger.node_review row exists for n
hasJudgedBasis(n)  ⟺ reviewed(n) ∨ ∃ c ∈ children(n): hasJudgedBasis(c)
```

Three classes, computed bottom-up over the materialised snapshot:

| Class | Predicate | Serves? | Visible by default? | Number |
|---|---|---|---|---|
| **R — reviewed** | `reviewed(n)` | yes | yes | its propagated strength, as today |
| **D — derived standing** | `¬reviewed(n) ∧ hasJudgedBasis(n)` | **yes — DR-184-A(1)** | **yes** | §4.4 (VROW-2) |
| **H — no judged basis** | `¬hasJudgedBasis(n)` | no | no — set aside | excluded from the number |

**The structural property worth stating, because it is what makes this safe:**
if `¬hasJudgedBasis(n)` then no descendant of `n` has a judged basis either — by
the definition, a judged descendant would have conferred one. **So the class-H
set is already exactly a union of complete subtrees.** Subtree exclusion is no
longer a rule imposed on top of a per-node decision; it is a *theorem* about the
closure. Nothing is re-parented (`snapshotWithoutNode`'s re-parenting,
`packages/propagation/src/index.ts:506-512`, stays forbidden here for the reason
the DR-174 plan R.4.3(3) gave: re-attaching an argument to a grandparent it was
never authored against asserts a structure no model made).

And it means the **UI's `inheritedHiddenReason` thread can simply be deleted**
(`apps/v2-ui/lib/v3/adapter.ts:127, 143, 164-178`): every hidden node now
carries its own reason from the engine, recorded and replayable, instead of the
veil being re-derived in a React component. **The veil moves from presentation
to the ledger.** That is a strict honesty gain independent of DR-184-A.

### 4.2 The seam, file-level

```ts
// apps/runner/src/index.ts — replaces excludeHiddenSubtrees (:260-296)
export function projectJudgedStanding(
  snapshot: EvaluationSnapshot,
  reviewedNodeIds: readonly string[]
): {
  readonly snapshot: EvaluationSnapshot;          // class H removed, R and D kept
  readonly hiddenNodeIds: readonly string[];      // class H, subtree-complete by theorem
  readonly derivedStandingNodeIds: readonly string[];  // class D
};
```

- `packages/propagation` stays **pure and untouched** (AC-09/AC-14: same engine,
  different input). This is the propagation-**input** projection VROW-6-R
  anticipated, now with V's principle in it.
- `reviewedNodeIds` comes from `ledger.node_review` — a new
  `JudgementRepository.readReviewedNodeIds(runId)`, one `SELECT`. The in-run path
  can also supply it from its own successful reviews; **the query is the source
  of truth** so that the in-run path and the catch-up path cannot drift.
- `excludeHiddenSubtrees` is **retired**, not kept beside the new function
  (`tools/orphan-audit` G2 would BLOCK on a never-called export;
  `tools/orphan-audit/src/index.ts:592-599` is where the new job registers).

### 4.3 The mark vocabulary

`CONDITION_MARKS` (`packages/kernel/src/index.ts:69-107`) goes **27 → 28**:

| Member | Class | Chip label | Record carries |
|---|---|---|---|
| `HIDDEN-UNJUDGEABLE` *(shipped, unchanged)* | H | *"Hidden: could not be judged — show hidden to read it"* | dead review call-site key, transport outcome, `excluded_from_served_number = true`, `affected_node_ids` = the whole hidden subtree |
| **`DERIVED-STANDING-UNREVIEWED`** *(new — VROW-3)* | D | *"Stands on its judged arguments — its own cross-house review is missing"* | dead review call-site key, transport outcome, **`judged_basis_count`**, `excluded_from_served_number = false`, `affected_node_ids = [nodeId]` |
| `HIDDEN-LOW-SCORE`, `UNAUTHORED-BRANCH-HALTED` *(shipped)* | — | unchanged | unchanged |

- **No rename of a shipped member, therefore no data migration.** `HIDDEN-UNJUDGEABLE`
  keeps its exact meaning; its *population* shrinks to the no-basis class.
- The `mark` union at `packages/serve/src/index.ts:772`, the
  `REQUIRED_CONDITION_MARK_RECORDS` two-way contract (`:796-797`, enforced by
  `assertRequiredConditionMarkRecords` at `:940`), the field validators
  (`:819-830`) and the contract mirror (`packages/contract/src/index.ts:391-397`)
  all gain the member. Both UI label switches
  (`apps/v2-ui/lib/v3/labels.ts:44-45`, `web/lib/v3Presentation.ts:142-143`) are
  exhaustive over `ConditionMark`, so **omission is a compile error**.
- `tests/unit/s14-ui.test.ts:116` moves 27 → 28.
- DR-184-A(3) lives in the record's `reason`, verbatim in substance: *this node's
  own cross-house review did not land; it serves on the authority of its N judged
  arguments, not on its own unreviewed assertion.*

### 4.4 THE FINDING THAT DECIDES VROW-2 — the arrows carry no magnitude

DR-184-A calls the derived grade "the propagation model's own arithmetic". The
arithmetic is real and it is exactly V's sentence:

```ts
// packages/published-arithmetic/src/index.ts:5-9
export function σ(tau: number, aggregateAttack: number, aggregateSupport: number): number {
  return aggregateAttack >= aggregateSupport
    ? tau - tau * (aggregateAttack - aggregateSupport)
    : tau + (1 - tau) * (aggregateSupport - aggregateAttack);
}
```

*A hypothesis (τ) gains or loses power (±) through the virtue of its arguments
(S, A).* V's founding sentence **is** σ.

**But its inputs are not produced.** Every edge the engine writes is written
with no magnitude:

```ts
// apps/runner/src/index.ts:1152-1166
await writer.addEdge({ ..., strength: null, magnitudeStatus: "UNKNOWN",
                       strengthSource: "EVIDENCE_VERIFIER", ... });
```

`packages/graph/src/index.ts:393` does the same, and a repository-wide search
finds **no writer of `magnitudeStatus: "MEASURED"` anywhere in the engine**. In
`computeGraph`, an arrow with `strength === null` or
`magnitudeStatus === "UNKNOWN"` contributes nothing (`:435-438`). Therefore for
every node today:

```
S = agg([]) = 0,  A = agg([]) = 0,  σ(τ, 0, 0) = τ − τ·0 = τ
```

**Every served node strength in the system today is identically its own judge's
τ. The tree's arrows move no number.** (`strengthSource: "EVIDENCE_VERIFIER"`
names the organ that would supply magnitudes; DR-181(4) puts the evaluator in the
future, and DR-184 lists "no evaluator" as a NON-goal.)

Three consequences, all load-bearing:

1. **DR-184-A(1)'s "derived score" cannot yet be *derived from* anything.**
   Saying otherwise would be exactly the fabrication DR-115 forbids. The honest
   statement is: *the mechanism that will compute it is in place and correct; the
   measurement that feeds it is not built.*
2. **Setting a derived-standing node's τ to 0** ("no standing of its own; power
   comes only from its arguments" — the most literal reading of V's sentence)
   would today serve **0.0** for every such node, because S = A = 0. A number no
   judge produced, on V's screen. **Rejected as unlawful today**, available the
   day magnitudes are measured.
3. **The catch-up cannot change the served number today** (§5.5) — which is a
   large de-risking, and a tripwire the moment it stops being true.

**Architecture's reading for VROW-2: keep the node's own recorded τ as its
`baseStrength` (T-KEEP).** It is the only option that invents nothing, it shows
V a real number produced by a real judge, and **the day edge magnitudes become
measured, the same code path starts producing exactly the derived score
DR-184-A describes, with no further change.** The reconciliation DR-184-A(3)
demands is carried where V put it — on the mark — and it is a true statement:
the node is *self-judged* (τ exists, from its own house's judge) and
*un-cross-reviewed* (no independent house checked it). Those are different
guarantees, and the mark names precisely which one is missing.

The third option — τ := `null` — is specified in VROW-2 for completeness: it is
the strictest DR-165(3) reading (the unreviewed node contributes nothing to any
number, and `applyLifts` at `packages/propagation/src/index.ts:295-314` already
lifts its children's arrows to the nearest judged ancestor, recording a
`JUDGED_ANCESTOR` `LiftRecord`). It keeps the node **visible** with its
`base_score` on the wire and `final_strength: null` — a shipped, contract-legal
state (`NodeSchema.final_strength` is `.nullable()`). It satisfies DR-184-A(2)
fully and DR-184-A(1) only partly: the node has a grade (its base score) but no
*recorded propagated strength*. Presented, not recommended.

---

## 5. Seam 3 — the post-serve review catch-up job

### 5.0 The one law the job lives under

> **A catch-up may only ADD judgement. It may never mutate v1, never delete,
> never change the served text, and never land a terminal worse than the one it
> found.**

Everything below is that sentence made mechanical.

### 5.1 Where it lives — edge-lawful, keys-lawful

| Piece | Home | Why |
|---|---|---|
| the algorithm | **`apps/runner/src/index.ts`** (exported `runReviewCatchUp`) | it needs `JudgementRepository`, `GraphRepository`, `LedgerRepository`, `ServeRepository`, `BudgetRepository`, `selectDifferentMakerReviewer` (`:100-128`), `withCooldownRetry` (`:178-258`) and `projectJudgedStanding` (§4.2). `apps/runner` already imports every engine package except `contract` (edge row 22) — **no new edge** |
| the CLI / composition root | **`acceptance/review-catch-up.ts`** + a `package.json` script | the CLI relays (`acceptance/claude-relay.ts`, `acceptance/grok-relay.ts`) and DISC-01 discovery (`acceptance/discovery.ts`) are wired only in `acceptance/main.ts:172-330`. DR-179 forbids any other access path |
| registration | `tools/orphan-audit/src/index.ts:592-599` `entryPoints` += `acceptance:job:review-catch-up` | G2 BLOCKS an unreachable export (03 §12) |

Rejected: hanging the job off `apps/scheduler/src/cli.ts:1-23` beside
`job:replay-self-test` / `job:liveness-sweep` / `job:settlement-watch`. The name
pattern fits, but those jobs are **DB-only**; this one makes model calls, and
importing the relays there would mint a dependency edge that does not exist.
Named because it is the tempting wrong answer.

### 5.2 (a) Find the work — two sources, and which one is authoritative

| Source | Query | Role |
|---|---|---|
| **ground truth** | `core.node` for the run (`generation_status <> 'stale'`) `LEFT JOIN ledger.node_review USING (node_id)` `WHERE review IS NULL` | **the work list** |
| **served disclosure** | `serve.condition_mark` for `(answer_id, answer_version)` where `mark IN ('HIDDEN-UNJUDGEABLE','DERIVED-STANDING-UNREVIEWED')`, joined `serve.condition_mark_node` → node ids, with `call_site_key` (persisted by `migrations/0021_…:14`) | **the cross-check** |

Ground truth is authoritative because it **is** the DR-165(3) predicate — an
opinion with no cross-house review — and it cannot drift if a mark was
mis-emitted. A disagreement between the two is a **typed loud stop**
(`CATCH_UP_DISCLOSURE_MISMATCH`), never a silent reconcile. The failed review
call-site key rides along for the record, but the site key is *derivable*
anyway: it is `JUDGE:review:${nodeId}` (`apps/runner/src/index.ts:1361`).

### 5.3 (b) Probe first, then call — reuse DISC-01, do not re-invent it

Sequence, before any spend:

1. `discoverPanel` / `probeRelay` / `resolveFreshDiscovery`
   (`acceptance/discovery.ts:45, 78, 110, 131, 161`) under
   `panelDiscoveryPolicy.probe_freshness_ms = 600_000` (DR-182(1)) with
   `probe_max_attempts = 1`.
2. Empty panel, or no maker differing from some author, ⇒ **stop before spending
   anything**, with a typed report. A catch-up that opens by burning attempts on
   a dead relay repeats the original sin at a smaller scale.
3. Reviewer selection: `selectDifferentMakerReviewer(authorMaker, availableMakers,
   latestReviewerMaker)` — the same shipped function, the same rotation, the same
   `DIFFERENT_MAKER_REVIEWER_UNAVAILABLE` typed stop.
4. Each call goes through `withCooldownRetry` with `failureScope: "REVIEW"` and
   the catch-up's own hold budget (§5.6), so the job inherits the whole §3
   discipline instead of growing a parallel one.

**Whose panel?** The run's *pinned* panel (`run.discoveredPanel`) or *today's*
discovered panel — a genuine value question, **VROW-4**.

### 5.4 (c)(d) Record, then re-project

- **(c)** `recordNodeReview` (`packages/judgement/src/index.ts:325-347`) —
  a pure `INSERT` into append-only `ledger.node_review`. `UNIQUE (node_id)`
  makes double-recording impossible; the `reject_same_maker_node_review` trigger
  (`migrations/0019_…:14-39`) enforces cross-lineage at the DDL, not in the app.
  **No new write path exists or is needed.**
- **(d)** `materialiseSnapshot(runId)` (`packages/graph/src/index.ts:537-564`)
  → `projectJudgedStanding` (§4.2, the *same* function the in-run path calls)
  → `evaluate()` → `recordPropagation`. `packages/propagation` untouched.

### 5.5 (e) Serve a NEW answer version — and the finding that blocks it today

**The schema supports serve history. The writer does not.** Verified:

| Fact | Where |
|---|---|
| `PRIMARY KEY (answer_id, answer_version)`, `answer_version integer NOT NULL CHECK (> 0)` | `migrations/0000_s00.sql:259-272` |
| `serve.answer` has **`UPDATE`/`DELETE` revoked** — v1 is structurally immutable | `migrations/0000_s00.sql:309-311` |
| the read path already returns the newest version, and already pins a version | `packages/serve/src/index.ts:1166-1167` — `($3::integer IS NULL OR answer.answer_version = $3) ORDER BY answer.answer_version DESC LIMIT 1` |
| the read path already distinguishes reading *current* from reading a *sealed version* | `:1209`, `:1216-1220` (`readMode: "CURRENT" | "SEALED_VERSION"`) |
| `serve.condition_mark` and `serve.served_number` are already keyed by `(answer_id, answer_version)` | `migrations/0006_s05.sql:181-183`; `packages/serve/src/index.ts:1043, 1078` |
| **but** `answer_id` takes the DB default on every insert, and `answer_version` is fed `input.factBundleVersion` | `packages/serve/src/index.ts:996-1005` |
| and `factBundleVersion` is `ACCEPTANCE_REGISTER_VERSION` | `acceptance/main.ts:260` |

**So `answer_version` is currently the register version wearing the version
counter's name**, and every serve mints a brand-new `answer_id` — which is why
no answer in the system has ever had a second version.

**The repair needs no migration and no backfill**, because the register version's
authoritative home is elsewhere: `core.run.register_version`
(`migrations/0000_s00.sql:57`), reachable from every answer by `run_id`. Nothing
reads `serve.answer.answer_version` *as* a register version.

Minimal writer change to `persistAnswer`:

- add an optional `supersedes?: { answerId: string }` input;
- **absent** ⇒ today's behaviour, byte-identical (this is the property the first
  test pins);
- **present** ⇒ insert with that `answer_id` and
  `answer_version = MAX(answer_version) + 1` for it, computed inside the existing
  write transaction (`withWriteTransaction`, `:951`).

`sealed_at_seq` is `UNIQUE` and allocated fresh; the `serve.condition_mark` FK
`(answer_id, answer_version) → serve.answer` is satisfied because the answer row
is inserted first in the same transaction (`:1040-1046`). **v1 keeps its rows,
its marks, its number, its `sealed_at_seq` and its `SEALED_VERSION` read
semantics, and is protected by the grant, not by convention.** The API and the
UI need **no change** to show v2 — the default read already returns the highest
version.

**The text is not recomposed.** The v2 fact bundle carries the same `facts`
(`[servedRoot.statement]`, `apps/runner/src/index.ts:1526`) and the **same
composer raw artifact ref**; a new `serve.composed_text` row cites the identical
`raw_artifact_ref` and segments. No `COMPOSER` call, no `CONFORMANCE` call, no
new prose. Only the condition marks, the node visibility and the propagation
receipt differ. See VROW-5 for the honest tension in re-citing a conformance
verdict, and §5.7 for the refusal that guards it.

**And the number does not move today.** By §4.4, every node's strength is its own
τ regardless of which descendants are in the snapshot, so the served root's
number is invariant under the catch-up. `v2.served_number.value === v1.…value`
is therefore a **pinnable mutation test** — and the day edge magnitudes become
measured, that test failing is precisely the tripwire that forces V's ruling on
whether a catch-up may move a number a user has already read. **A test that is
designed to fail later, on purpose, at the exact moment a value question becomes
real.**

### 5.6 Spend accounting — derived, not invented

- `BudgetRepository.countRunModelAttempts(runId)` counts every `MODEL_CALL`
  ledger row for the run, **with no work-item filter and no time term**
  (`packages/budget/src/index.ts:237-246`); `assertModelAttemptAllowed` compares
  it against the run's **pinned** `envelope_basis` (`:256-263`), and the gateway
  calls it on every request (`apps/runner/src/index.ts:2009`).
  **A catch-up running under the same `run_id` therefore consumes the same pinned
  ceiling with zero new machinery.**
- **Is there room? Structurally, yes — and not by luck.** The ceiling formula
  provisions `reviews = authored` review sites at `judgeMaxAttempts` each
  (`packages/register/src/index.ts:174-183`). The run bought those reviews once
  and 70 of them did not land. Evidence: 450 of 1196 consumed; re-running 70
  sites at 3 attempts each is at most 210 against 746 remaining.
- **Architecture's reading: do NOT mint a fresh catch-up ceiling.** The pinned
  basis is a *bug tripwire* (DR-182(4)) whose whole purpose is to catch runaway
  loops — and a re-runnable job is precisely the runaway shape. Let a
  pathological third catch-up raise `RUN_COST_ENVELOPE_EXHAUSTED` loudly. If V
  wants unbounded catch-up, that is **VROW-6**, not an architect's default.
- The catch-up's own hold budget is a register field
  (`max_cooldown_holds_per_catch_up`, value `— none stated`, **VROW-1**), because
  a background job has no loading page to bound — its trade is different from
  the in-run one, and only V can say by how much.

### 5.7 (f) Resumable, and honest about partial completion

- **Resumability is structural, not bookkeeping.** The work list is recomputed
  from ground truth (§5.2) on every invocation. An interrupted job simply finds
  fewer nodes next time; `UNIQUE (node_id)` on `ledger.node_review` makes a
  double-record impossible even under a race.
- **Refuse rather than regress.** Before persisting v2 the job recomputes the
  terminal over the new snapshot. If it would be worse than v1's, the job stops
  with a typed `CATCH_UP_WOULD_DOWNGRADE`, writes **no** answer version, and
  reports. §5.0's law, enforced by shipped code.
- **The report is the honesty surface** (precedent: the scheduler CLI prints its
  report as JSON, `apps/scheduler/src/cli.ts:16-21`):

```json
{ "runId": "…", "answerId": "…", "fromVersion": 1, "toVersion": 2,
  "examined": 70, "reviewed": 61, "stillUnreviewed": 9,
  "nowVisible": 96, "stillSetAside": 4, "attemptsSpent": 183,
  "envelopeRemaining": 563, "refusal": null }
```

- **Partial completion is normal, not exceptional.** A v2 answer that still has
  unreviewed nodes still carries `HIDDEN-UNJUDGEABLE` for the remainder. The job
  must never claim a completion it did not achieve, and must be safe to run
  again. *A debate improves after serving* (DR-184) — improvement is monotone and
  need not be total.

### 5.8 Trigger

**Manual only, this ticket.** `pnpm job:review-catch-up --run <runId>`, run by V
or the orchestrator. A UI button is a follow-on (it needs an API route plus S05
asker-ownership scoping); a scheduled daemon is an explicit NON-goal (§8).

---

## 6. Seam 4 — the UI census

**Seam:** `apps/v2-ui/components/DebateCanvas.tsx`, the `stickyControl` slot
(`:141-152`) that already floats above the canvas hosting *"Show set-aside
paths"*. That control **is** the header; the census belongs beside it, where the
toggle that explains it already lives.

**Every number is already on the wire — no API change, no new contract field, no
new endpoint:**

| Census term | Source |
|---|---|
| **N claims** | `answer.nodes.length` (or `countClaims(root)`, `apps/v2-ui/lib/debatePresentation.ts:285-293`) |
| **L levels** | `treeDepth(root)`, `apps/v2-ui/lib/debatePresentation.ts:296-301` |
| **J judged** | `answer.nodes.filter(n => n.review !== null).length` — `NodeSchema.review` is already on the contract (`packages/contract/src/index.ts:306-313`), populated by the `LEFT JOIN LATERAL ledger.node_review` at `packages/serve/src/index.ts:1749-1752` |
| **H set aside** | the union of `affected_node_ids` over the answer's `HIDDEN-*` records — the same map `apps/v2-ui/lib/v3/adapter.ts:116-120` already builds |

**Line:** `122 claims across 6 levels · 52 judged · 70 set aside` — V's own words.
Supplier: `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:1332`, where the `meta`
object is already assembled and passed to the canvas; `meta` gains `judged` and
`setAside`. The existing root-card meta line (`DebateCanvas.tsx:326-340`,
`{meta.claims} claims / depth {meta.depth}`) stays as it is — it is a card
detail, not a page header, and duplicating two of the four numbers there is
harmless.

**Honesty rules the ticket must pin:** the counts describe the **whole** debate,
not the visible subset, and must not change when the toggle flips (that is the
entire point — V asked for the census *because* the visible count lied about the
debate's size). Under DR-184-A a fourth class exists (class D, derived standing);
it is counted in **J's complement, not in H**, and the drawer names it per node.
Whether V wants it in the header line as a fourth term is **VROW-7** — a
one-word answer either way.

---

## 7. Register rows and the touch list

### 7.1 Register rows

| Row | Field | Value | Provenance |
|---|---|---|---|
| `runDeathPolicy` | `cooldown_ms` | `600_000` | V-ruled, DR-174 — unchanged |
| | `final_retry_attempts` | `1` | V-ruled, DR-174 — unchanged |
| | `max_cooldown_holds_per_run` | `2` | V-ruled, DR-174-A(1) — unchanged |
| | `applies_to` | `TRANSPORT_EXHAUSTION` | V-ruled, DR-174-A(2) — unchanged |
| | **`final_retry_applies_past_hold_cap`** | `true` | derived (§3.1a) — a boolean, not a quantity |
| | **`max_cooldown_holds_per_run_review`** | **`— none stated`** | **V's number — VROW-1** |
| | **`max_cooldown_holds_per_catch_up`** | **`— none stated`** | **V's number — VROW-1** |
| `hiddenNodeScoreThreshold` | value | `0.35` | V-ruled, DR-176(2) — unchanged |
| *(no new row)* | structural ceiling | — | **derived** at admission from engine exports; `formula_version` bumps (§3.1) |

Seeded in `acceptance/seed-register.ts`, schema in `acceptance/runtime-policy.ts`,
resolved in `acceptance/main.ts`. **Register hash changes → V's backup-then-reseed
at next boot**, once, for all of them (DR-172/DR-173 precedent).

### 7.2 Files

| File | Change |
|---|---|
| `packages/kernel/src/index.ts:69-107` | **+1** `CONDITION_MARKS` member (27 → 28) |
| `apps/runner/src/index.ts:178-258` | `withCooldownRetry`: split wait from final retry; record a halt event for every `failureScope` |
| `apps/runner/src/index.ts:149` | `HoldProgressEvent.state` += `REVIEW_HALTED`, `MAKER_POSITION_HALTED` (runner-local union) |
| `apps/runner/src/index.ts:776-830` | `cooldownAttempt`: per-scope hold budget selection |
| `apps/runner/src/index.ts:1259-1406` | interleave review at round granularity; the review loop's body moves, its contents do not |
| `apps/runner/src/index.ts:260-296, 1443-1444` | `excludeHiddenSubtrees` → `projectJudgedStanding` (§4.2) |
| `apps/runner/src/index.ts:1519-1629` | mark/record construction gains class D; class-H records carry the subtree in `affected_node_ids` |
| `apps/runner/src/index.ts` **(new export)** | `runReviewCatchUp` (§5) |
| `packages/judgement/src/index.ts` | `readReviewedNodeIds(runId)` — one `SELECT` |
| `packages/serve/src/index.ts:772, 796-797, 819-830, 996-1005` | mark union; required-record pair; field validators; `persistAnswer` gains `supersedes` |
| `packages/contract/src/index.ts:391-397` | mark-record validator mirror (`ConditionMarkSchema` follows `kernel` automatically) |
| `packages/register/src/index.ts:166-196` | ceiling formula: per-site final retry; `formula_version` bump |
| `migrations/0024_dr184_derived_standing.sql` **(new)** | `serve.condition_mark`: `+ judged_basis_count integer` with a presence CHECK; amend the `call_site_key`, `terminal_transport_outcome` and `excluded_from_served_number` CHECKs (`migrations/0021_…:22-60`) for the new member |
| `apps/v2-ui/lib/v3/adapter.ts:116-178` | **delete** the `inheritedHiddenReason` thread (`:127`, `:143`, `:164-178`); class D renders normally with its disclosure |
| `apps/v2-ui/components/DebateCanvas.tsx:141-152` | the census line beside the toggle |
| `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:1332` | `meta` gains `judged`, `setAside` |
| `apps/v2-ui/lib/v3/labels.ts:44`, `web/lib/v3Presentation.ts:142` | one chip label each (omission = compile error) |
| `acceptance/review-catch-up.ts` **(new)**, `acceptance/seed-register.ts`, `acceptance/runtime-policy.ts`, `package.json` | the job's composition root, register fields, script |
| `tools/orphan-audit/src/index.ts:592-599` | `entryPoints` += the new job |

**Not touched:** `packages/propagation` (pure; different input, same engine),
`packages/budget`, `packages/graph`, `packages/providers`, `packages/battery`,
`apps/api`, `apps/scheduler`, `migrations/0021`'s existing columns, the DR-173
deadlines, DR-176's threshold. **No new dependency edge.**

---

## 8. NON-goals

1. **No evaluator, and specifically no edge-magnitude measurement.** §4.4 names
   this as the reason DR-184-A's arithmetic cannot yet move a number. It is
   reported, not fixed.
2. **No scheduler daemon.** Manual trigger only (§5.8).
3. **No re-authoring of halted branches.** Class N
   (`UNAUTHORED-BRANCH-HALTED`) is untouched: nothing was written, so nothing can
   be judged. **Noted as the next concern** — a re-authoring pass would mint new
   nodes into a served run, which is a materially larger question (a new node
   changes the debate, not just its judgement) and deserves its own consult.
4. **No recomposition, no change to any served text** (§5.5, VROW-5).
5. **No mutation of a served answer.** Enforced by grant, not by discipline.
6. **No new provider, no API keys** (DR-179).
7. **No checkpoint-resume for the in-run path.** A crash mid-run still loses the
   run; the catch-up repairs *reviews*, not *authoring*.
8. **No fresh spend ceiling** (§5.6) unless V rules VROW-6.
9. **No special-casing** of run `091b7663`, of any house, or of any panel size.

---

## 9. FORBIDDEN-by-default changes, planned as the lawful exception

| # | Normally forbidden | What is proposed | Why it is the minimum |
|---|---|---|---|
| 1 | `kernel` vocabulary extension (AC-65) | **one** member, `DERIVED-STANDING-UNREVIEWED` | DR-184-A(1) requires a mark that discloses *without veiling*; overloading `HIDDEN-UNJUDGEABLE` would make one label mean both "hidden" and "shown", the exact trade V rejected at DR-161. No shipped member is renamed ⇒ **no data migration** |
| 2 | DDL migration (P17) | **one** migration: one nullable column + CHECK amendments on `serve.condition_mark` | exact precedent `migrations/0021_dr174_cooldown_prune.sql`. No new table, no new enum, no backfill, no grant change |
| 3 | serve-writer semantic change | `answer_version` stops being fed the register version; `persistAnswer` gains an optional `supersedes` | without it there is no lawful second version, and §5's whole shape collapses. The register version is already authoritative at `core.run.register_version` ⇒ **nothing is lost and no backfill is needed** |
| 4 | changing a shipped execution order | reviews interleave at round granularity | §3.2 shows no data dependency, and declares the two real consequences (rotation, envelope ordering) rather than discovering them in review |

Everything else is ordinary in-boundary work.

---

## 10. Test obligations (mutation-proof, P1)

Enforced suite `tests/**/*.test.ts{,x}`; the handoff pastes `vitest list`
collection (P2). `testTimeout` is 120 000 ms, so the hold waiter stays an
injected collaborator — **no test ever sleeps.**

**Resilience (`tests/unit/dr184-review-resilience.test.ts`)**

| # | Assertion | Mutation it kills |
|---:|---|---|
| T1 | healthy path: no exhaustion ⇒ waiter never invoked; authored set and review set byte-identical to today | any change that holds, retries or re-orders on a healthy run |
| T2 | with the run-wide hold cap **already spent**, a review exhaustion still spends **exactly one** final retry at the **same `callSiteKey`** and waits **zero** ms | the §1.2 defect itself — the one that cost 70 nodes |
| T3 | the review hold budget is read from its **own** register field, and spending it does not decrement the authoring budget (and vice versa) | one shared pool wearing two names |
| T4 | every `failureScope` records its halt event; a REVIEW halt appears in `/v1/runs/:id/events` with its typed payload | §1.3's silence |
| T5 | the ceiling formula equals `(authored+reviews)×(judge+finalRetry) + fixed×organ` for panel 1..4 × depth 1..5, and `formula_version` changed | a flat `holds × finalRetry` term surviving the per-site change; a bumped number with an unbumped version |
| T6 | interleaved order reviews every authored node exactly once, at depths 1..5, for panel sizes 1..4, with **no** maker/house/organ literal in the ordering code | a DR-162-A breach; a node reviewed twice or missed |
| T7 | reviewer rotation is deterministic and replayable **within** a round | an ordering that makes the same graph produce different reviewers on replay |

**Judged standing (`tests/unit/dr184-judged-standing.test.ts`)**

| # | Assertion | Mutation it kills |
|---:|---|---|
| T8 | `hasJudgedBasis` is transitive: an unreviewed node whose only judged material is a **grandchild** is class D, not class H | a one-level-only check |
| T9 | the class-H set is **exactly** a union of complete subtrees, asserted as a property over generated trees — not imposed by a filter | re-introducing subtree exclusion as a rule (it must remain a consequence) |
| T10 | a class-D node is **present** in `strengths`, `arrowOrder` and the fingerprint, and carries `DERIVED-STANDING-UNREVIEWED` with a **non-zero** `judged_basis_count` | DR-184-A(1) reverted to exclusion; a mark with no basis behind it |
| T11 | a class-H node is **absent** from `strengths` and **present and intact** in `core.node` with its judgement and artifact | excluding by deleting (impossible — the grant proves it) |
| T12 | class-H children are excluded **with** their parent and are **never re-parented** | reusing `snapshotWithoutNode`'s re-parenting — a fabricated structural claim |
| T13 | **σ(τ,0,0) === τ** for every node while every edge is `UNKNOWN` — the §4.4 finding, pinned | a "derived score" that quietly invents an arrow magnitude to look derived |
| T14 | a class-D node's `baseStrength` is its **own recorded τ**, never `0` and never a constant | T-ZERO smuggled in; any invented anchor (DR-115/AC-76) |
| T15 | the UI adapter marks **only** nodes with their own hidden record; no descendant is veiled by inheritance | the `inheritedHiddenReason` thread creeping back |

**Catch-up (`tests/integration/database.test.ts`, real embedded Postgres)**

| # | Assertion | Mutation it kills |
|---:|---|---|
| T16 | catch-up on a run with unreviewed nodes writes `ledger.node_review` rows and a **v2** `serve.answer` for the **same `answer_id`**, `answer_version = 2` | minting a new `answer_id` (the current writer's behaviour) — v1 would be orphaned, not superseded |
| T17 | v1's row, marks, number and `sealed_at_seq` are **bit-identical** after catch-up; `readAnswerProjection(id, asker)` returns v2 and `(id, asker, 1)` still returns v1 | any mutation of a served answer; a read path that loses history |
| T18 | `v2.served_number.value === v1.served_number.value` while every edge is `UNKNOWN` | a number that moved for a reason nobody can name — **and this test is designed to fail the day magnitudes are measured, forcing VROW-8** |
| T19 | the v2 composed text cites the **same** `raw_artifact_ref` as v1, and **no** COMPOSER/CONFORMANCE model call was made | a silent recomposition changing V's answer text |
| T20 | a catch-up that would produce a worse terminal writes **nothing** and returns `CATCH_UP_WOULD_DOWNGRADE` | §5.0's law reduced to a comment |
| T21 | running the job twice is safe: the second run finds fewer nodes, records nothing new, and does **not** mint a v3 when nothing changed | a job that versions on every invocation |
| T22 | interrupting mid-way leaves every recorded review durable and the next run resumes from ground truth | in-memory progress state |
| T23 | catch-up attempts count against the **pinned** basis; exceeding it raises `RUN_COST_ENVELOPE_EXHAUSTED` and writes no version | a fresh ceiling invented for the job |
| T24 | a mark/record disagreement between ground truth and served disclosure raises `CATCH_UP_DISCLOSURE_MISMATCH` | a silent reconcile |
| T25 | the reviewer selection honours the ruled panel source (VROW-4) and the DDL trigger rejects a same-maker review | a catch-up that lets a house grade itself |

**Contract / UI / architecture**

| # | Assertion | Mutation it kills |
|---:|---|---|
| T26 | `CONDITION_MARKS` length **28**; every member has a non-blank, **unique** label in **both** tables | a member with no chip; a duplicate label |
| T27 | mark-without-record and record-without-mark both throw, for the new member too | dropping it from `REQUIRED_CONDITION_MARK_RECORDS` |
| T28 | the census renders `N claims across L levels · J judged · H set aside`, and the four numbers are **unchanged** when the set-aside toggle flips | a census that counts the visible subset — the exact lie V caught |
| T29 | dependency-edge assertion passes with **no new edge**; `apps/runner` still does not import `contract`; the catch-up CLI is not in `apps/scheduler` | routing relays through the wrong app |
| T30 | the orphan audit lists no new never-called export and registers the new entry point | shipping the job unreachable (G2 BLOCKS) |

---

## 11. Live verification without burning a depth-5 run

1. **Before-state, free, on disk now:** the §1.4 minute-by-minute outcome query
   over `091b7663`, plus `SELECT count(*) FROM core.node n LEFT JOIN
   ledger.node_review r USING (node_id) WHERE n.run_id = … AND r.node_id IS NULL`
   — which must return **70**. If it does not, the class-H accounting is wrong
   and the ticket stops there.
2. **The catch-up's primary live evidence is V's own dead debate.** Run
   `job:review-catch-up` against `091b7663` on the live stack: real relays, real
   reviews, real rows, no fixture, no stub, no injected failure. Expected: node
   reviews land, a v2 answer appears, and **V's canvas fills up** with the same
   URL. That is the acceptance demonstration, and it costs no re-authoring.
3. **The in-run fix** verifies on a **depth-1** run (≈12 calls) for
   no-regression, plus the DR-174 dead-relay scratch-stack technique
   (point a maker's relay base URL at a closed port on a throwaway acceptance
   stack) to produce a **genuine** review exhaustion and observe: no wait, one
   final retry, a recorded `REVIEW_HALTED` event, class-D standing for the
   ancestors, and a served answer whose canvas is not collapsed.
4. **Honest limits, to be written in the packet:** (a) a relay that recovers
   *during* a hold cannot be summoned on demand — that path rests on unit
   evidence; (b) a green depth-1 run proves no regression, never that the fix
   fired; (c) the wall clock is verified as *the value handed to the waiter*.
5. **Never acceptable:** a fixture, stub, forced malformed response or injected
   failure on the live acceptance path (DR-115); and no re-run of V's depth-5
   debate to demonstrate a code path.

---

## 12. Adjacent findings — reported, not fixed here

1. **Every edge magnitude in the system is `UNKNOWN`** (§4.4). The propagation
   engine is correct and inert. This is the single largest gap between what the
   scoring layer *says* and what it *does*, and DR-184-A is the first ruling that
   depends on it.
2. **`answer_version` has never been a version** (§5.5) — it is the register
   version under another name, and every serve mints a fresh `answer_id`. The
   serve-history machinery was built, tested at the read end, and never reached
   at the write end.
3. **`withCooldownRetry` records nothing for non-EXPANSION halts** (§1.3).
4. **`NODE_REVIEW_UNAVAILABLE` is now unreachable** — `apps/runner/src/index.ts:1400-1403`
   sits in a `catch` that the `cooldownAttempt` `HALTED` return path (`:1379-1382`)
   pre-empts for every transport failure. It still guards non-transport errors,
   so it is not dead, but its comment describes the retired policy. Worth a
   comment fix in the ticket, not a behaviour change.
5. **`NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW`** (`:1453-1458`) becomes far less
   reachable under DR-184-A: a maker position with any judged descendant now
   keeps its standing. The typed stop stays for the genuinely basis-less case.
6. **`apps/scheduler`'s `job:reaper` is still unimplemented**
   (`apps/scheduler/src/index.ts:87-89`). When it lands it must treat a held work
   item as alive — carried forward from the DR-174 plan §13(4), still true.
7. **The census will make a second thing visible**: with 122 claims across 6
   levels on one canvas, V will meet the layout at full size for the first time.
   That is a UI-lane concern (DR-183: "UI remains a bit behind V2"), named so it
   is not a surprise.

---

## 13. V DECISIONS PACKET

None of these is decided by this plan. Grok's position is taken on each before
they travel to V (DR-175(2)).

| Row | Question | Architecture's reading | Cost if V rules otherwise |
|---|---|---|---|
| **VROW-1** *(register rows, `— none stated`)* | How many 10-minute holds may the **review phase** and the **catch-up job** each spend? | The in-run one is a **wall-clock trade V already ruled once** (DR-174-A(1): 20 minutes, whatever the depth); a second budget re-opens that bound to `(2+k)×10 min` while V watches a loading page. The catch-up's budget has no loading page behind it, so it can be more generous. **Both numbers are V's**; this plan invents neither | ruling `0` for the review budget is lawful and coherent — §3.1(a)'s free final retry plus §3.2's interleaving plus §5's catch-up still deliver DR-184's capability, just with less in-run recovery |
| **VROW-2** *(the load-bearing one — DR-184-A(1)'s number)* | What is a derived-standing node's `baseStrength`? **(a) T-KEEP** its own recorded τ; **(b) T-ZERO** — no standing of its own, power only from arguments; **(c) T-NULL** — no propagated strength, base score still shown, children lift to the nearest reviewed ancestor | **(a).** §4.4 proves every arrow carries `magnitudeStatus: "UNKNOWN"`, so σ(τ,0,0)=τ: **(b) would serve 0.0 for every such node today** — a number no judge produced (DR-115). (a) invents nothing, shows a real judge's number, and **becomes exactly DR-184-A's derived score, with no code change, the day magnitudes are measured**. (c) is the strictest DR-165(3) reading and satisfies DR-184-A(2) fully but DR-184-A(1) only partly | (b) is available and correct **after** the evaluator work — it is a "not yet", not a "no". (c) is a small delta from (a): drop the τ, keep the node |
| **VROW-3** *(vocabulary — V mints, DR-161 precedent)* | Confirm `DERIVED-STANDING-UNREVIEWED`, chip *"Stands on its judged arguments — its own cross-house review is missing"* | mint a new member; do **not** overload `HIDDEN-UNJUDGEABLE`, which would make one label mean both hidden and shown. Alternatives offered: `STANDING-FROM-JUDGED-ARGUMENTS`, `UNREVIEWED-BUT-ARGUED` | a rename before the ticket is one line; after the migration it is a data migration |
| **VROW-4** *(value)* | Must a catch-up reviewer come from the run's **pinned panel**, or may **any** healthy different-house model review? | **pinned panel first.** DR-181(1) pins the panel at admission and the debate's identity includes who was in it; a review by a house that never debated is a different object. But DR-165(3)'s words are *"judged by another model"*, not *"by a panel member"* — so V's reading may differ, and the reviewer's lineage is recorded on its raw artifact either way | pinned-only means a debate whose reviewing house is permanently gone can never complete — the job would report `stillUnreviewed` forever, honestly |
| **VROW-5** *(honesty)* | v2 re-cites v1's composed text **and its conformance verdict** without re-running the gate. Is citing a gate result for a new fact bundle a reference, or a re-assertion? | a **reference**: identical artifact, identical facts, only the marks differ. Re-running would spend organ calls and could BLOCK an answer that already served — the worse hazard | if V wants the gate re-run, §5.5 gains COMPOSER+CONFORMANCE spend and §5.7's refusal becomes load-bearing rather than defensive |
| **VROW-6** *(spend)* | Does a catch-up spend the run's **pinned** ceiling, or get a fresh one? | **pinned.** It is a bug tripwire (DR-182(4)), and a re-runnable job is the runaway shape it exists to catch. There is structural room: the ceiling already bought those reviews once (§5.6) | a fresh ceiling per invocation makes the tripwire unable to see repeated catch-ups — which is precisely what it is for |
| **VROW-7** *(small, UI)* | Does the census header carry a fourth term for derived standing — `N claims across L levels · J judged · D standing on their arguments · H set aside`? | **no** for the header (V asked for three terms and length hurts a header line); **yes** in the node drawer, per node | one term either way |
| **VROW-8** *(pre-registered, not yet live)* | The day edge magnitudes become **measured**, a catch-up **will** move a number a user has already read. May it? | not ruled, not invented, and not needed today — §5.5's T18 is written to **fail loudly** at that exact moment rather than let it pass silently | recorded now so the future ticket meets a ruled question instead of a surprise |

---

**PLAN READY FOR GROK AUTHORIZATION**

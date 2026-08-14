# DR-174 — Architecture plan: cooldown, final retry, prune, serve-with-marks

**Fired under DR-171** (architecture-consult law, 2026-08-13). Author: Opus 5
ARCHITECT seat, 2026-08-14. **Status: awaiting Grok authorization.** This plan
writes no product code and binds nothing until an independent Grok lens
authorizes it; only an authorized plan re-enters the coding loop as ticket
scope. Its only real-tree write is this file.

Scope of the read: `docs/architecture/03-module-design.md` (§3.1 edge table,
§5.3 Seam C, §9.2–§9.5, §10, §11, §12), `design-patterns.md` (P1, P10, P12,
P15, P17), `decisions-ledger.md` rows DR-115, DR-121-r, DR-137, DR-139(4),
DR-159, DR-161, DR-162-A, DR-165(3), DR-171, DR-172, DR-172-A, DR-173, DR-174,
the BUG-01 architecture plan (`reviews/bug01-architecture-plan.md`, whose
VROW-4 DR-174 resolves), the BUG-02 goal packet (the loading-surface law), and
the live code cited inline below.

---

## 1. The incident, and what DR-174 ruled

Run `18a664d3`, 2026-08-14, V's first real depth-5 debate ("How do I fry
scream?").

| Fact | Value |
|---|---|
| call site | `JUDGE:critic:root0:r5:p17` — an expansion leg, `apps/runner/src/index.ts:872-882` |
| failure | three consecutive 60 s transport timeouts; the last SUCCESSFUL claude-relay call took 50 s of its 60 s budget |
| carrier | `PROVIDER_CALL_FAILED` (`packages/providers/src/index.ts:46-55`, thrown at `:356`) |
| outcome | whole-run terminal death; **35 good calls of spend lost** |
| already fixed | DR-173 moved `JUDGE.deadlineMs` 60 000 → 180 000 (`acceptance/seed-register.ts:165`) |

DR-173 addressed the *deadline*. DR-174 addresses **the death**:

> when a call site exhausts its attempt bound, the run HOLDS for 10 minutes
> (provider recovery window), retries the site once more, and only if still
> failing PRUNES the subtree that cannot be judged and SERVES everything
> settled, carrying a typed honesty mark naming what was pruned and why.
> — DR-174, decisions-ledger:1300-1314

DR-165(3) is absolute and unamended: **pruned nodes never serve.** The
10-minute cooldown is V's ruled number, carried as a register row, never a
literal.

**Why this is an architecture consult and not a coding-loop fix.** It crosses
the runner's unit-of-work lifecycle (§9.2–§9.5), the work-item claim contract,
`kernel`'s closed condition-mark vocabulary (AC-65 — minted once, never
extended by a sibling), the serve required-record contract, one DDL migration,
and the loading surface V watches. Any of those improvised inside the coding
loop is a quiet architecture amendment.

---

## 2. What the architecture already says about this

The degrade-not-die path is **already designed**; today's code simply does not
take it.

> An unjudged node that *does* have a persisted raw artifact — **not** a gate
> failure — M1's path: **no arrow, a typed record, and the answer serves**
> (AC-11 × AC-21).
> — `03-module-design.md` §10, line 1141

> A required node with **no raw artifact in any state** — the completeness
> gate fails; **no aggregated run is written** (AC-11).
> — `03-module-design.md` §10, line 1140

These two rows are the hinge of this plan, and §7 below shows why the prune
lands on the **first** row's side and not the second.

> **P15 · Bulkhead failure isolation.** A panel member's failure isolates to a
> typed note — never fails the primary run … Every caught failure is typed AND
> ledgered — a swallowed exception is a defect.
> — `design-patterns.md:229`

> envelope exhaustion hard-stops with `ENVELOPE_EXHAUSTED` — **never a silent
> timeout** (AC-49).
> — `03-module-design.md` §9.5, line 1104

The precedent for *"serve the settled part, disclose the missing part with a
dedicated minted mark"* is DR-161's `UNSERVED-MAKER-POSITION`, shipped end to
end: kernel member (`packages/kernel/src/index.ts:87-89`), required record
(`packages/serve/src/index.ts:781-808`), nullable DDL column
(`migrations/0018_panel01_rework.sql:4-6`), UI chip
(`apps/v2-ui/lib/v3/labels.ts:37`, `web/lib/v3Presentation.ts:135`). **This
plan re-uses that exact shape.** V's choice there — mint a new member rather
than overload an existing diagnostic — is treated as binding style here.

### Constraints this plan is bound by

| Constraint | Source | Binding effect here |
|---|---|---|
| **DR-165(3)** no opinion serves unjudged | ledger:1070-1091 | a pruned node contributes **nothing** to the served text and **nothing** to the served number; §8 proves the remainder is clean |
| **DR-115** no scaffolded data | ledger:175-189 | the missing branch's effect on the score is **never estimated, interpolated or defaulted**; absence is disclosed, not filled |
| **AC-76 / DR-039** no invented numbers | `04-api-contract.md:59`; ledger:1088 | 10 minutes is V's; every other quantity is a register row or a V row with value `— none stated` |
| **DR-162-A** the algorithm is N-generic | ledger:1011-1029 | the hold/prune may not name a maker, a relay, an organ or a maker count; it is expressed over the expansion plan, which is already M-parameterised |
| **DR-121-r** no Docker/Hatchet | ledger:547-550 | nothing here needs a container, a broker or engine redelivery; the acceptance stack topology is untouched |
| **Edge table rows 1–27** | 03 §3.1 | no new edge. `kernel`←nobody, `contract`→`kernel`, `db`→`kernel`, `serve` row 20, `battery` row 19, `apps/runner` row 22 (every engine package **except** `contract`), `web`/`apps/v2-ui` row 25 (`contract` only) |
| **AC-04 / §9.5** never hold a write txn across a model call | 03 §9.5 line 1099 | the hold happens **between** calls, outside any write transaction; every hold record is its own committed write |
| **AC-65 / S-13** condition marks minted once in `kernel` | 03 §10 line 1153-1157 | the new member goes in `packages/kernel/src/index.ts` and nowhere else; `contract`, DDL and UI **import** it |
| **P17** DDL is the single authority | design-patterns.md:241 | the CHECK amendment is hand-authored in the migration; app-side lists are courtesy restatements |
| **P10** append-only ledger | design-patterns.md | `core.node` has `UPDATE`/`DELETE` revoked (`migrations/0000_s00.sql:305-306`) — **pruning can never mean deleting or mutating a node** |
| **DR-159 (B1-B) / DR-172** retry-tolerant ceilings, attempts are the unit | ledger:922-956, 1250-1266 | the envelope counts MODEL_CALL rows with **no outcome filter** and **no time term** — held wall-clock is structurally not spend |

---

## 3. The chosen seams

### 3.0 The shape of the run, stated once, because everything follows from it

The live path is `acceptance/main.ts:76-96` → `AcceptanceDispatcher.dispatch`
→ `WalkingSkeletonRunner.executeWorkItem` → one call to `execute()`
(`apps/runner/src/index.ts:505-1413`). **The entire depth-N debate — roots,
every expansion leg, the cross-root exchange, every cross-maker review,
propagation, composition, conformance and serve — happens inside ONE work
item's single `execute()` invocation.** There is no per-node work item, no
checkpoint, no resume. That is why one dead call site kills 35 good calls:
the loop that dies is a plain sequential `for` over the expansion plan
(`:851-883`).

Three consequences the rest of this plan depends on:

1. **A node row is written only AFTER its model call returns**
   (`authorPosition`, `:732-797`: `judge()` first, `withGraphWrite`/`addNode`
   second). A dead authoring call therefore leaves **no node, no arrow, no
   judgement, no raw artifact** — nothing to delete, nothing to un-say.
2. **The hold has somewhere to live.** The runner is already an in-process,
   long-lived orchestration shell holding no transaction between calls.
3. **The claim is already long.** `claimMs = longestDeadline ×
   maximumRunAttempts` (`acceptance/main.ts:186-196`) = 180 000 × 780 ≈ 39
   hours at depth 5. The hold fits with room; §5 makes that an *asserted*
   invariant rather than an accident.

### 3.1 Seam 1 — the 10-minute hold lives in the RUNNER lifecycle

**Ruling: the cooldown belongs in `apps/runner`, wrapped around the single
authoring funnel `authorPosition` (`apps/runner/src/index.ts:702-830`), and
nowhere else.**

Four reasons, in the order Grok should test them:

1. **The gateway is bounded by construction and knows nothing about runs.**
   `CallBound` is *"one bounded model call"* (03 §7.1). A 10-minute sleep
   inside `OpenAICompatibleProviderGateway.call`'s attempt loop
   (`packages/providers/src/index.ts:198-346`) would sit **inside** the very
   call the deadline exists to bound, would silently falsify
   `assertClaimCoversCall`'s invariant (`packages/battery/src/index.ts:214-225`,
   which compares the claim against `deadlineMs` only), and would make the
   hold invisible to the run lifecycle that must decide what to prune. BUG-01
   put *attempt* policy in the gateway; *lifecycle* policy is not attempt
   policy.
2. **Only the runner knows what a prune costs.** The decision "which planned
   legs die with this call site" is a fact about the **expansion plan**
   (`buildMultiMakerExpansionPlan`, `:353-386`), which exists only in the
   runner. The gateway cannot compute it; the queue cannot compute it.
3. **The queue is the wrong instrument, and DR-174's own NON-goal says so.**
   Releasing the claim and re-enqueuing after 10 minutes requires
   checkpoint-resume, which is an explicit NON-goal — and would be actively
   destructive today: the re-claim's pre-flight
   (`apps/runner/src/index.ts:577-591`) terminal-fails the work item on sight
   of an exhausted call site, and even if it did not, `execute()` restarts
   from the root and re-spends every call.
4. **One funnel, N-generic.** Every authoring call — primary root
   (`:607-615`), secondary root (`:832-847`), every expansion leg
   (`:872-882`) and both cross-root responses (`:894-912`) — passes through
   `authorPosition` or the identical `Judge.judge` shape. Wrapping the funnel
   covers every maker, every polarity, every depth, with no per-call-site
   special case (DR-162-A).

**Mechanism.** A typed lifecycle helper in `apps/runner/src/index.ts`:

```
withCooldownRetry(
  attempt: () => Promise<T>,          // the ruled-bound call, unchanged
  site: { callSiteKey, parentNodeId, plannedLegCount },
  policy: RunDeathPolicy,             // register-sourced (§5)
  hold: HoldRecorder,                 // records + waits; injected (§3.3)
): Promise<{ kind: "AUTHORED"; value: T } | { kind: "PRUNED"; record: PrunedSubtree }>
```

- `attempt()` runs with the ruled bound. On success nothing else happens —
  **zero behaviour change on the healthy path**, which is the property the
  ticket's first test must pin.
- On `ProviderCallFailedError` (transport exhaustion) the helper records
  `COOLDOWN_HOLD`, waits `policy.cooldownMs`, records `COOLDOWN_RETRY`, and
  re-issues **the same call at the same `callSiteKey`** with a bound whose
  `maxAttempts` is `ruledBound.maxAttempts + policy.finalRetryAttempts` (§4
  proves this yields exactly one further attempt).
- If the retry also fails, the helper returns `PRUNED` carrying the typed
  record; the caller marks the subtree and continues.
- `ProviderContentUnacceptedError` (schema exhaustion, BUG-01's carrier) is
  **not** a cooldown case — waiting does not repair a schema. It keeps today's
  loud typed stop. See VROW-3.

### 3.2 Seam 2 — the prune is a *plan filter*, never a graph mutation

**Ruling: pruning = "do not author the planned legs whose parent is gone".
Nothing is deleted; nothing is mutated.**

`core.node` and `core.stranger_restatement` have `UPDATE` and `DELETE` revoked
from `debateai_runtime` (`migrations/0000_s00.sql:305-306`). The graph is
append-only. The only lawful prune is therefore a **contraction of the work
that remains to be done**, which is exactly what DR-174 describes.

Mechanism, precisely:

1. `authoredNodes` becomes a **dense keyed collection** (`Map<number,
   AuthoredDebateNode>`) instead of today's sparse array
   (`apps/runner/src/index.ts:689`, assigned by index at `:872` and `:833`).
   **This is a correctness requirement, not a style preference**: today a
   skipped leg would leave an array hole, and the XREV loop
   `for (const authoredNode of authoredNodes)` (`:925`) would read `undefined`
   and throw an untyped `TypeError` — a swallow-class defect under 03 §10.
2. A `prunedIndices: Set<number>` accumulates the dead child index plus, by a
   single forward pass over the plan (legs are breadth-first and every leg's
   `parentIndex < childIndex`, `:365-385`), every descendant index.
3. The leg loop skips any leg whose `parentIndex ∈ prunedIndices`. The
   existing `DEBATE_EXPANSION_PARENT_MISSING` throw (`:854-857`) **stays a
   loud typed error** for the un-planned case — a missing parent that was
   never pruned is still an invariant breach, and the ticket must keep a test
   proving the two paths do not merge.
4. **Roots are not prunable.** Pruning the primary root leaves no answer;
   pruning the secondary root silently converts an admitted 2-maker run into a
   1-maker run, which is an admission-time property (`:560-566`,
   `RUN_MAKER_CONFIGURATION_MISMATCH`) and DR-137/DR-143 territory. A root
   authoring call that exhausts after cooldown **keeps today's loud death**.
   VROW-4 puts this to V rather than deciding it here.
5. The cross-root exchange legs (`:888-913`) are prunable exactly like
   expansion legs, and for the same reason.

**What the prune is NOT allowed to touch:** the served-root selection
(`:963-969`), the evaluation snapshot (`:971`), the propagation call
(`:1002`), or the served node set. §7 explains why no snapshot surgery is
needed for this class, and §8 why the served answer stays lawful.

### 3.3 Seam 3 — the hold is a VISIBLE typed state, not a silent wait

V watches a loading page. A silent 10-minute freeze is BUG-02's dead page with
a longer fuse. The hold must be honest on **both** surfaces V can see.

**(a) The event stream.** `core.run_progress_event` already carries the run's
public event log and the API projects it (`apps/api/src/index.ts:500-560`),
mapping `row.kind` **directly** through `EventTypeSchema` when the stored kind
is already a contract event type — the precedent being S11's
`honesty.staleness_trigger_fired`, written as a literal by
`packages/liveness/src/index.ts:186` and allowed by the DDL CHECK amendment at
`migrations/0014_s11.sql:50-53`.

Two contract event types **already exist and already have UI consumers**, so
this plan mints **no new event vocabulary**:

| Transition | Stored `kind` | Existing consumers (`packages/contract/src/index.ts:17-47`) |
|---|---|---|
| hold started / final retry issued | `node.retrying` | W6 (run stream), W8 (node card) |
| subtree pruned | `ledger.could_not_do` | W6, W18 (ledger view) |

`value_json` carries the typed payload — `{state, call_site_key, parent_node_ref,
hold_ms, hold_until, attempts_spent, transport_outcome, planned_leg_count}` —
so nothing is learned by parsing prose (AC-63).

**Who writes it.** `packages/db`'s `RunRepository` gains one typed method
(`recordRunHoldEvent` / `recordPruneEvent`), joining the run-progress writes
that already live there (`packages/db/src/index.ts:280`). The runner **may not
import `contract`** (edge row 22), so the kind literal stays in `db`, exactly
as `liveness` holds its own literal today. No vocabulary is duplicated in
`kernel`.

**(b) The loading projection — the surface V actually stares at.**
`readLoadingProjection` (`packages/db/src/index.ts:313-343`) derives
`QUEUED | RUNNING | SETTLED | FAILED` from `core.work_item` alone; a held run
reads `RUNNING` and the page shows a progress bar that means nothing for ten
minutes. Add a **`HOLDING`** member to `RunLoadingProjection["state"]` and to
`RunProjectionSchema` (`packages/contract/src/index.ts:131-143`; its
`superRefine` already only constrains `FAILED ⟺ terminal_reason`, so `HOLDING`
needs no reason column).

Derivation, read-time and **self-expiring** — no new column, no write:

> `HOLDING` iff the run's latest `node.retrying` event has
> `value_json->>'state' = 'COOLDOWN_HOLD'` **and**
> `(value_json->>'hold_until')::timestamptz > clock_timestamp()`, and the work
> item is still `CLAIMED`. Otherwise the existing CASE arms decide.

The expiry predicate is what makes this immune to BUG-02's defect class (a
state that keeps asserting itself after the fact is over). It also matches 03
§5.4's ruled shape: `serve` derives work-item liveness **on read without a
write**.

**(c) The UI.** `apps/v2-ui`'s LOAD-01 loading surface renders `HOLDING` with
an honest sentence and the remaining time (the payload carries `hold_until`);
`web/` carries the parallel label table. Both consume `contract` only (edge
row 25). The copy must say what is true — *the model provider stopped
responding; the run is waiting N minutes before one final attempt* — and must
never present the hold as ordinary progress.

### 3.4 Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| Cooldown inside the gateway's attempt loop (`providers:198-346`) | puts a 10-minute wait inside a call bounded by `deadlineMs`; falsifies `assertClaimCoversCall`; the gateway cannot know what to prune; breaks Seam C's "one bounded model call" |
| Cooldown inside the claude relay (`acceptance/relay-core.ts`) | a transport adapter is the wrong owner; invisible to the run, to the ledger, and to the UI; and it would be maker-specific, breaching DR-162-A |
| Release the claim, re-enqueue with a visible-after time | needs checkpoint-resume (NON-goal); the pre-flight at `apps/runner/src/index.ts:577-591` terminal-fails the re-claim; and a restart re-spends 35 good calls |
| Hatchet engine retry / redelivery | DR-121-r defers Hatchet; redelivery re-runs the whole work item, and P11 law 3 makes the exhaustion check terminal-fail it correctly |
| A distinct `callSiteKey` suffix for the post-cooldown attempt (e.g. `…:cooldown`) | **actively harmful**: it would hide the retry from `findExhaustedModelAttempt`'s `GROUP BY call_site_key` (`packages/ledger/src/index.ts:481-495`) and break attempt-chain reconstruction. The retry MUST be the same key |
| Mutate the pruned parent's `path_status` to `abandoned` / `exploration_decision` to `abandon` | `core.node` has UPDATE/DELETE revoked (`migrations/0000_s00.sql:305-306`). The vocabulary members exist (`kernel:144-155`) but there is no lawful writer at this point in the lifecycle; disclosure goes through the mark |
| Overload `UNDER-EXPLORED` or `UNCOVERED-SCOPE` instead of minting a member | DR-161 ruled this exact question the other way — one chip label carrying two meanings on one answer was the rejected alternative. `UNCOVERED-SCOPE` is the DR-020 knob-8 diagnostic; `UNDER-EXPLORED` is the depth-budget note |

### 3.5 File-level touch list

| File | Change | Notes |
|---|---|---|
| `packages/kernel/src/index.ts:69-100` | **+1 `CONDITION_MARKS` member** | the single kernel change; §6 |
| `packages/providers/src/index.ts:46-55` | `ProviderCallFailedError` gains structured fields: `attempts`, `lastOutcome: "TIMED_OUT" \| "FAILED"`, `lastLedgerEntryRef` | 03 §10 forbids the caller string-sniffing `cause: unknown`. No change to the loop's control flow |
| `apps/runner/src/index.ts:689, 833, 854-883, 894-913` | `authoredNodes` → keyed map; leg loop honours `prunedIndices` | the sparse-array hazard is a live latent defect |
| `apps/runner/src/index.ts:702-830` | `authorPosition` wrapped by `withCooldownRetry`; `PRUNED` return path | the one funnel |
| `apps/runner/src/index.ts:577-591` | pre-flight exhaustion check becomes cooldown-aware (§4) | otherwise a post-cooldown success is terminal-failed on any later re-claim |
| `apps/runner/src/index.ts:1075-1106` | build the prune `ConditionMarkRecord`s beside the DR-161 records | identical shape |
| `apps/runner/src/index.ts:139-188` | `WalkingSkeletonSettings` gains `runDeathPolicy` + the injected `holdRecorder` | production-supplied collaborator, same shape as `resolveTerminalActivations`; **not** a test-only hatch |
| `packages/serve/src/index.ts:771-808` | `ConditionMarkRecord` gains the new mark + 3 typed nullable fields; new member added to `REQUIRED_CONDITION_MARK_RECORDS` | the two-way contract |
| `packages/serve/src/index.ts` (persist path, `:969`) | persist the three new columns | mirrors `served_root_rule` |
| `packages/db/src/index.ts:280, 313-343` | hold/prune event writers; `HOLDING` arm in the loading projection | |
| `packages/contract/src/index.ts:134` | `RunProjectionSchema.state` += `HOLDING` | `ConditionMarkSchema` follows `kernel` automatically (`:11`) |
| `packages/battery/src/index.ts:214-225` | `assertClaimCoversCall` gains the cooldown term (§5) | |
| `migrations/0021_dr174_cooldown_prune.sql` | **new**: `core.run_progress_event` kind CHECK += 2 members; `serve.condition_mark` += 3 nullable columns with presence CHECKs | §6 |
| `apps/v2-ui/lib/v3/labels.ts:37`, `web/lib/v3Presentation.ts:135` | one chip label each | both switches are exhaustive over `ConditionMark`, so omission is a **compile error** |
| `apps/v2-ui` LOAD-01 surface | render `HOLDING` honestly | |
| `acceptance/seed-register.ts`, `acceptance/runtime-policy.ts`, `acceptance/main.ts` | seed + schema + wire the `runDeathPolicy` row and the real hold recorder | register hash changes → V's backup-then-reseed at next boot (DR-172/DR-173 precedent) |
| `tools/orphan-audit/src/index.ts` | attach the new exported runner helper | G2's never-called list BLOCKS (03 §12) |

**Not touched:** `packages/propagation` (§7), `packages/budget`,
`packages/graph`, `packages/judgement`, the DR-172 envelope numbers, the
DR-173 deadlines, `packages/ledger`'s counters.

---

## 4. Attempt, envelope and claim accounting

**Claim A — the held time is not spend.** The envelope is counted by
`BudgetRepository.countRunModelAttempts` over `MODEL_CALL` ledger rows with no
outcome filter and **no time term whatsoever**; `assertModelAttemptAllowed`
(`packages/budget/src/index.ts:265-273`) compares that count against the
pinned basis. During a hold the runner issues no call, so no row is written,
so consumption is unchanged **by construction**. The ticket pins this with a
mutation test (T9) rather than an argument.

**Claim B — the final retry consumes attempts lawfully, and needs no
`providers` change.** `createPostgresProviderGateway`
(`apps/runner/src/index.ts:1469-1499`) already derives per-call-site budget
from the ledger:

```
consumed = countModelAttempts(runId, workItemId, contractHash, callSiteKey)   // 3
remaining = request.bound.maxAttempts - consumed
if (remaining <= 0) throw CALL_BUDGET_EXHAUSTED
http.call({ ...request, bound: { ...bound, maxAttempts: remaining } })
```

Re-issuing the same call with `maxAttempts = 3 + 1` yields `remaining = 1` —
**exactly one further attempt**, at the same `call_site_key`, with its own
`attempt_id`, its own raw artifact where one exists, its own ledger row, and
its own envelope charge. Nothing in `packages/providers` changes. This is the
second claim Grok should attack; the proof is the arithmetic above plus T10.

**Claim C — the pre-flight exhaustion check must become cooldown-aware, or
DR-174 is self-defeating.** `apps/runner/src/index.ts:577-591` calls
`findExhaustedModelAttempt` with the **ruled** `maxAttempts` (3) and, on a
hit, calls `failFromExhaustedAttempt`, which sets the whole work item to
`FAILED` with `terminal_reason = 'CALL_BUDGET_EXHAUSTED'`
(`packages/battery/src/index.ts:372-389`). Two defects surface under DR-174:

1. a **call-site** exhaustion terminal-fails the **whole work item** — the
   very over-reach DR-174 exists to end;
2. after a *successful* post-cooldown retry the ledger holds 4 attempts at
   that site, so any later re-claim (crash, redelivery) terminal-fails a run
   that recovered.

**Ruling:** the pre-flight compares against the **effective** bound
(`ruled + finalRetryAttempts`) and, on a hit, hands the site to the same
prune path rather than failing the item — with the single exception of the
root call sites (§3.2 clause 4), which keep the loud stop. The ticket must
carry T11/T12 for both halves.

**Claim D — the claim TTL covers the hold, and is asserted rather than
assumed.** `assertClaimCoversCall` (`packages/battery/src/index.ts:214-225`)
today asserts `claimMs ≥ deadlineMs + marginMs`. Under DR-174 the invariant
becomes

```
claimMs ≥ maxHoldsPerRun × (cooldownMs + longestDeadlineMs) + longestDeadlineMs + marginMs
```

The live configuration satisfies it with enormous room (claim ≈ 39 h at depth
5, `acceptance/main.ts:186-196`), so this is a guard against a future tuning
that would silently let a held item be re-claimed mid-hold. Note also that
`apps/scheduler`'s `job:reaper` is **still unimplemented**
(`apps/scheduler/src/index.ts:88`, `S00_SCAFFOLD_ONLY`) — so nothing can reap
a held item today, and when the reaper lands it must treat a held item as
alive. Recorded in §12 as a forward constraint.

---

## 5. The numbers — one register row, and the wall-clock question V must rule

**Proposed register row (one row, one reseed):**

| Field | Value | Provenance |
|---|---|---|
| `rowKey` | `runDeathPolicy` | new |
| `kind` | `RUN_DEATH_POLICY` | |
| `cooldown_ms` | `600_000` | **V-ruled, DR-174** ("wait for 10 minutes"); expressed in ms exactly as DR-173's "180s" → `180_000` |
| `final_retry_attempts` | `1` | **V-ruled, DR-174** ("retries the site once more") |
| `max_cooldown_holds_per_run` | **`— none stated`** | **no ruled basis — VROW-1** |
| `sourceRef` | `acceptance:DR-174:V-approved` | matches the DR-172/DR-173 seeding pattern |

Seeded in `acceptance/seed-register.ts` beside `acceptanceOrganCostBounds`
(`:160-171`), schema in `acceptance/runtime-policy.ts`, resolved at
`acceptance/main.ts`. **Register hash changes → V's ruled backup-then-reseed
flow at next boot** (same consequence DR-172 and DR-173 already carry).

**The wall-clock finding V must see (VROW-1).** DR-174's text is per call site
("when a call site exhausts"). Taken literally with no cap, a genuinely dead
relay makes every remaining call site hold. The spend stays bounded — DR-172's
780-attempt ceiling still hard-stops — but **the wall clock does not**. Worst
case at depth 5, with pruning removing descendants but not siblings, is many
independent 10-minute holds in series: hours of a loading page. That is a
*new* failure mode created by the cure, and naming it is the architect's job.

- Architecture's reading: the cooldown exists to ride out **throttling**. After
  the *k*-th consecutive post-cooldown failure the provider is not throttled,
  it is down, and further holds buy nothing.
- Recommendation: a `max_cooldown_holds_per_run` cap, after which further
  exhaustions prune **immediately** (no hold), still serving with the mark.
- The value of *k* has **no ruled basis** and is therefore a V row with value
  `— none stated`, never a literal (AC-76/DR-039).

---

## 6. The mark

### 6.1 The member

**Proposed new `CONDITION_MARKS` member: `PRUNED-UNJUDGEABLE-SUBTREE`**
(`packages/kernel/src/index.ts:69-100`; alternative name offered in VROW-2 —
under DR-161's precedent the *word* is V's to mint).

Chip label, both tables: **"Part of the debate could not be judged and was
pruned"**.

Comment block in `kernel`, in the DR-161/DR-139 house style, citing DR-174 and
naming what the member means: *a planned subtree whose authoring call site
exhausted its attempt bound, held for the ruled cooldown and failed its final
retry; the subtree was never authored and never serves (DR-165(3)).*

### 6.2 The record — DR-115-loud, machine-readable

`ConditionMarkRecord` (`packages/serve/src/index.ts:771-779`) gains the member
in its `mark` union and three typed fields:

| Field | Type | Carries |
|---|---|---|
| `prunedCallSiteKey` | `string \| null` | the exhausted site verbatim, e.g. `JUDGE:critic:root0:r5:p17` |
| `prunedLegCount` | `number \| null` | planned-but-unauthored legs, computed from the ruled expansion plan — a **plan** fact, not an estimate |
| `terminalTransportOutcome` | `"TIMED_OUT" \| "FAILED" \| null` | the last attempt's ledger outcome, taken from the enriched typed carrier (§3.5) — never sniffed from a message |

- `scope` = `"node"`, `subjectRef` = the surviving **parent** node id.
- `reason` = prose for humans; **every fact above is also a typed field**,
  because 03 §10 forbids learning a fact by parsing prose (AC-63).
- `affectedNodeIds` = `[parentNodeId]` **only**. This is forced by DDL:
  `serve.condition_mark_node.node_id` is `REFERENCES core.node(node_id)`
  (`migrations/0006_s05.sql:185-189`), and the pruned legs have no node rows.
  The pruned legs are identified by **call-site key**, which is the ledger's
  own identity for them.
- The member is added to `REQUIRED_CONDITION_MARK_RECORDS`
  (`packages/serve/src/index.ts:781-789`), so
  `assertRequiredConditionMarkRecords` makes mark-without-record **and**
  record-without-mark typed failures. That is the DR-115-loud requirement, and
  it is enforced by shipped code rather than by review.
- One record **per pruned call site** (a run may prune more than once); the
  answer carries the mark once.

### 6.3 The DDL — one migration, mirroring DR-161's

`migrations/0021_dr174_cooldown_prune.sql`:

1. `ALTER TABLE core.run_progress_event` — `kind` CHECK gains
   `'node.retrying'` and `'ledger.could_not_do'` (exact precedent:
   `migrations/0014_s11.sql:50-53`).
2. `ALTER TABLE serve.condition_mark` — three nullable columns with presence
   CHECKs (`… IS NULL OR mark = 'PRUNED-UNJUDGEABLE-SUBTREE'`, and
   non-blank/positive where present), exact precedent
   `migrations/0018_panel01_rework.sql:4-6`.

**No enum table changes anywhere else**: `serve.condition_mark.mark` is
`text NOT NULL CHECK (length(btrim(mark)) > 0)` and
`serve.answer.condition_marks` is a `jsonb` array with only a type check
(`migrations/0000_s00.sql:267`) — the closed vocabulary is enforced in
`kernel`/`contract`, not in DDL. Verified, not assumed.

---

## 7. Propagation — what the prune does to the scores, and what it must never do

**Finding: for the ruled class (an authoring call site dying), the prune needs
NO change to `packages/propagation` and NO snapshot surgery.**

The proof is mechanical. A node row exists only after its call returns
(`apps/runner/src/index.ts:732-797`). A pruned leg therefore contributes no
row to `materialiseSnapshot` (`:971`), no arrow, and no
`reduced_judgement`. `evaluate()` (`packages/propagation/src/index.ts:633`)
sees a smaller but **internally complete and honest** graph: the total arrow
order covers every arrow (`assertTotalArrowOrder`, `:178-187`), every endpoint
resolves (`:222-234`), and `STRENGTH_LINEAGE_UNRESOLVED`
(`apps/runner/src/index.ts:1023-1027`) still holds because every strength maps
to an authored node. Nothing is withheld, nothing is faked.

This is precisely 03 §10's **AC-11 × AC-21** row, not its AC-11 row: the
completeness gate is about *required nodes that exist without artifacts*, and
a never-authored leg is not a node. The M1 path — "no arrow, a typed record,
and the answer serves" — is the ruled path, and DR-174 is its lifecycle
counterpart.

**What is genuinely lost, stated plainly:** the ancestor's strength is
computed over **fewer children than the ruled plan required**. If the pruned
leg was an `attack`, the ancestor's number is *higher* than a complete run
would have produced. That is a real, directional distortion.

**What this plan forbids, absolutely (DR-115):** any attempt to estimate,
interpolate, discount, or otherwise fill the missing branch's contribution. No
counterfactual, no "typical attack strength", no penalty constant. The
sensitivity machinery (`packages/propagation/src/index.ts:605-626`) can only
remove nodes that exist; it cannot say what an unauthored branch would have
done, and it must not be asked to. **The absence is disclosed, not modelled.**

Two honesty carriers that already exist and should be named in the ticket
rather than invented:

- `PropagationOutcome.unjudgedNodeIds` and `withheld`
  (`packages/propagation/src/index.ts:586-592`) remain untouched and continue
  to mean what they mean.
- `SensitivityRecord.leverage` per surviving node is already recorded on the
  propagation receipt (`apps/runner/src/index.ts:1019`) — so a reader can see
  how fragile the served number is to the nodes that **did** exist, beside a
  mark saying how many planned ones did not.

**Whether a prune inside the served root's own subtree should additionally cap
the confidence band** (AC-24's `applyBandCeiling`,
`packages/serve/src/index.ts:553-557`) is a real lever that already exists —
and has **no ruled basis**. VROW-5.

---

## 8. The serve — pruned-but-served vs DOWNGRADED vs full service

**Ruling: pruning mints no new terminal. The terminal stays whatever the gate
chain computes over the surviving evidence; the prune rides as a condition
mark.** This is DR-161's shape exactly: `UNSERVED-MAKER-POSITION` rides a
`SERVED` answer today (`apps/runner/src/index.ts:1061-1063`).

| | What it is | Where decided |
|---|---|---|
| **SERVED** | every gate passed; verdict form | `packages/serve/src/index.ts:536-538` |
| **DOWNGRADED** | **orthogonal to pruning** — Q51's way-of-knowing downgrade: every load-bearing node is `REASONING`, so the answer serves as hypothesis + research plan | `:521-534` |
| **COMPONENTS_ONLY** | a gate blocked (R9, conformance, Q51 locator) → `DEFECT`; or the envelope hard-stopped → `ENVELOPE_EXHAUSTED` | `:402-429`, `:358-400` |
| **pruned-but-served** | **not a terminal at all** — the answer reaches whichever of the above it earns, and carries `PRUNED-UNJUDGEABLE-SUBTREE` + its required record | this plan |

A pruned run may land on any of the three terminals; the mark composes with
`DEFECT` and `ENVELOPE_EXHAUSTED` the way DR-161's mark already composes
(`preserveEnvelopeTerminalConditionMarkRecords`,
`apps/runner/src/index.ts:301-306` — records append, never erase).

### 8.1 DR-165(3): serving the remainder violates nothing — the proof

The load-bearing question is whether serving the remainder smuggles an
unjudged opinion into V's answer. It does not, on three independent grounds:

1. **The pruned nodes do not exist.** There is no opinion to serve. DR-165(3)
   forbids serving an *unjudged opinion*; a leg that was never authored is not
   an opinion the system holds. (This is exactly why §3.2 forbids any
   mechanism that would delete or suppress an *existing* node — that would be
   a different act with a different answer.)
2. **The served text cannot contain them.** DR-159 B2-A serves exactly one
   root (`buildFixedSingleRootServeNodes`, `apps/runner/src/index.ts:318-338`)
   and the composer may reference only the supplied `"primary"` node
   (`:1211-1216`, an unknown ref is a typed `COMPOSITION_CONTRACT_ERROR`).
3. **XREV's coverage law is satisfied by construction.** DR-165(3)'s
   machinery is the review loop at `apps/runner/src/index.ts:920-961`, which
   iterates `authoredNodes`. Pruned legs are absent from that collection, so
   **total cross-maker review coverage over what exists remains total**. The
   `NODE_REVIEW_UNAVAILABLE` stop (`:955-958`) is untouched, and the envelope
   refusals it re-raises (`:948-952`) are still never swallowed.

Point 3 has a converse the ticket must not blur, and §12/VROW-6 keep it
explicit: **a failure of a REVIEW call is a different case from a failure of
an AUTHORING call.** A node whose review call dies already exists, is already
judged, and already contributes an arrow. Pruning *it* would mean excluding a
persisted node from the evaluation snapshot — a strictly larger seam
(a propagation-input projection) with its own honesty questions. This plan
does **not** open it; review-call exhaustion keeps its present loud stop,
which is DR-165(3)-correct today. VROW-6 puts the extension to V.

---

## 9. The FORBIDDEN-by-default changes, planned as the lawful exception

DR-171 exists so that changes normally forbidden inside the coding loop can be
authorized deliberately. This plan needs exactly three, and no more:

| # | Normally forbidden | What is proposed | Why it is the minimum |
|---|---|---|---|
| 1 | **`kernel` vocabulary extension** (AC-65: minted once, never extended by a sibling) | **one** `CONDITION_MARKS` member | DR-174 requires a typed mark naming the prune; DR-161 ruled that overloading an existing member is the wrong trade. `contract`'s `ConditionMarkSchema` (`:11`) and both UI switches follow automatically — omission is a **compile error**, not a review miss |
| 2 | **DDL migration** (P17) | **one** migration: 2 CHECK members on `core.run_progress_event.kind`; 3 nullable columns on `serve.condition_mark` | both have exact shipped precedents (S11's kind amendment; DR-161's `served_root_rule`). No new table, no new enum type, no data backfill, no grant change |
| 3 | **`contract` wire-shape change** | `RunProjectionSchema.state` += `HOLDING` | without it the hold is invisible on the surface V watches, which is the BUG-02 defect class. **No new event type is minted** — `node.retrying` and `ledger.could_not_do` already exist with consumers |

Everything else in this plan is ordinary in-boundary work. **No new dependency
edge** is created: every touched package already imports what it needs
(§3.5 checked against 03 §3.1 rows 1, 5, 6, 19, 20, 22, 25).

---

## 10. Test obligations (mutation-proof, P1)

Every assertion names the mutation it kills. Enforced suite is
`tests/**/*.test.ts{,x}` (`vitest.config.ts`); the handoff must paste
`vitest list` collection (P2). **`testTimeout` is 120 000 ms**, so the hold's
waiter is an injected collaborator (§3.5) and no test ever sleeps 10 minutes —
a fake waiter that records its argument is the instrument.

**`tests/unit/pro01-runner-tree.test.ts` / a new `dr174-prune.test.ts`** (the plan filter)

| # | Assertion | Mutation it kills |
|---:|---|---|
| T1 | healthy path: no exhaustion ⇒ the waiter is **never** invoked and the authored-node set is byte-identical to today's | any change that holds or prunes on a healthy run |
| T2 | leg at index *i* prunes ⇒ **every** descendant index is skipped and **no** sibling under another parent is skipped | pruning only the dead leg (its children would be attempted against a missing parent); pruning the whole round |
| T3 | the authored-node collection has **no holes**, and the XREV loop iterates only authored nodes | reverting to the sparse array — today's latent `TypeError` |
| T4 | an un-planned missing parent still throws `DEBATE_EXPANSION_PARENT_MISSING` | merging the prune path with the invariant breach |
| T5 | a **root** call-site exhaustion still terminal-fails (no prune) | pruning a root and silently converting a 2-maker run to 1 |
| T6 | the prune plan is computed from the expansion plan for depths 1..5 and both maker orderings — no literal maker, relay or organ appears in the prune code | a DR-162-A breach special-casing the failing site |

**`tests/unit/provider.test.ts` / `dr174-cooldown.test.ts`** (the lifecycle)

| # | Assertion | Mutation it kills |
|---:|---|---|
| T7 | on `PROVIDER_CALL_FAILED`: waiter called **exactly once** with `cooldown_ms` read from the register row, then **exactly one** further attempt at the **same `callSiteKey`** | retrying without waiting; waiting twice; hard-coding the ms; re-keying the retry |
| T8 | retry succeeds ⇒ run continues, **no** mark, **no** prune record | marking a run that recovered (a false honesty mark is as dishonest as a missing one) |
| T9 | across a hold, `countRunModelAttempts` is **unchanged**; total attempts at the site = `ruled + 1` after the retry | charging wall-clock to the envelope; letting the retry escape the ledger |
| T10 | with `consumed = 3` and bound `3 + 1`, the gateway wrapper computes `remaining = 1` — not 4, not 0 | changing the wrapper arithmetic, or resetting the per-site counter |
| T11 | pre-flight: a site with `ruled + 1` attempts and a **successful** last attempt does **not** terminal-fail the work item | leaving the pre-flight on the ruled bound — a recovered run dies on re-claim |
| T12 | pre-flight: a site exhausted **and** failed hands to the prune path, not to `failFromExhaustedAttempt`, except at a root | keeping the whole-work-item kill DR-174 abolished |
| T13 | `ProviderContentUnacceptedError` (schema) does **not** trigger a cooldown | conflating BUG-01's carrier with the transport carrier — 10 minutes cannot repair a schema |
| T14 | `assertClaimCoversCall` **fails** when `claimMs < holds × (cooldown + deadline) + deadline + margin` | leaving the invariant on the old inequality |

**`tests/integration/database.test.ts`** (real embedded Postgres — the prune/serve/mark path end to end)

| # | Assertion | Mutation it kills |
|---:|---|---|
| T15 | a served answer with a prune carries the mark **and** its record, with `pruned_call_site_key`, `pruned_leg_count`, `terminal_transport_outcome` persisted and `condition_mark_node` naming the **surviving parent** | dropping the record (the DR-115-loud requirement); writing a non-existent node id (FK violation proves it) |
| T16 | mark without record **and** record without mark both throw (`CONDITION_MARK_RECORD_REQUIRED` / `…_WITHOUT_MARK`) | removing the member from `REQUIRED_CONDITION_MARK_RECORDS` |
| T17 | the hold/retry/prune progress events insert and read back through `/v1/runs/:id/events` in `at_seq` order with their typed payloads | a DDL CHECK that rejects the kinds (the migration's own proof); a payload that only carries prose |
| T18 | `readLoadingProjection` returns `HOLDING` while `hold_until` is in the future and **stops** returning it once it passes | the BUG-02 defect class — a state that outlives its fact |
| T19 | the served number for a pruned run is the propagated strength of the **surviving** graph, and no pruned identity appears in `strengths`, `arrowOrder` or the fingerprint | any attempt to synthesise the missing branch (DR-115) |

**`tests/unit/s14-ui.test.ts` / `v2ui-data-layer.test.ts` / render**

| # | Assertion | Mutation it kills |
|---:|---|---|
| T20 | `CONDITION_MARKS` length **25** (from 24, `tests/unit/s14-ui.test.ts:115`) and contains the new member; every member's label is non-blank and **unique** across both label tables | adding the member without a chip label; a duplicate label |
| T21 | the LOAD-01 surface renders the `HOLDING` state with the remaining time and **no** error banner | showing the hold as ordinary progress, or as an error |
| T22 | the honesty drawer surfaces the mark with its call site and reason | a mark that persists but never reaches the reader |

**`tests/architecture/*`**

| # | Assertion | Mutation it kills |
|---:|---|---|
| T23 | dependency-edge assertion still passes with **no new edge**; `apps/runner` still does not import `contract` | routing the event kind through `contract` in the runner |
| T24 | the orphan audit lists no new never-called export | shipping the helper unreachable (G2 BLOCKS) |

---

## 11. Live verification without burning a depth-5 run

1. **Before-state, available now.** Over run `18a664d3`:
   `SELECT e.call_site_key, e.outcome, e.sequence FROM ledger.ledger_entry e
   WHERE e.run_id = … AND e.action_kind = 'MODEL_CALL'
   ORDER BY e.sequence` — must show `JUDGE:critic:root0:r5:p17` with three
   `TIMED_OUT` rows and nothing after them, and the work item `FAILED` with
   `terminal_reason`. **That is the incident on the record**, and it is the
   fixture-free before-state.
2. **After-state, cheap.** A **depth-1** two-maker run with the fix: proves no
   regression on the healthy path (the waiter is never invoked, T1's live
   counterpart) at ~12 calls of spend instead of ~400.
3. **The hold itself, live and lawful, without a depth-5 run.** The cooldown
   fires on transport exhaustion. A **genuine** transport exhaustion can be
   produced without any scaffolding by pointing the *second maker's relay
   base URL* at a port with nothing listening, in a **throwaway acceptance
   stack on a scratch database** — the failure is real (real connect errors,
   real ledger rows, real timeouts), nothing is stubbed, no fake response is
   injected, and DR-115 is untouched because no runtime datum is fabricated.
   Expected: 3 real failed attempts → `HOLDING` visible on `/v1/runs/:id` →
   one real retry → prune → a **served depth-1 answer carrying the mark**.
   This is the packet's primary live evidence.
4. **Honest limits, to be stated in the packet.** (a) A relay that recovers
   *during* the cooldown cannot be summoned on demand, so T8's recovery path
   rests on unit evidence; the packet must say so rather than imply the live
   run proved it. (b) A green depth-1 run is evidence of **no regression**,
   never evidence the hold fired. (c) The 10-minute wall clock is verified as
   *the value passed to the waiter*, not by sitting through it.
5. **Never acceptable:** a fixture, stub, forced malformed response, or
   injected failure on the live acceptance path (DR-115); and no re-run of
   V's depth-5 debate to demonstrate a code path.

---

## 12. NON-goals (explicitly out of scope)

1. **No scheduler or queue rework.** `core.work_item` keeps its shape; no
   visible-after column, no priority, no re-enqueue.
2. **No checkpoint-resume.** A crash mid-run still loses the run. Named as the
   obvious future (it is the only thing that would have saved the 35 calls
   *without* pruning), deliberately not opened here.
3. **No provider-pool changes.** No failover to a second relay, no routing, no
   roster change. DR-162-A's "how many" stays configuration.
4. **No Docker, no Hatchet** (DR-121-r); no change to the acceptance stack's
   topology; this seat restarts no stack.
5. **No new number.** `600_000` and `1` are DR-174's own; everything else
   unruled is a V row with value `— none stated`.
6. **No propagation change**, and specifically **no estimation of the pruned
   branch's effect** on any score (§7).
7. **No prune of an existing, persisted node** — including the review-death
   case (§8.1, VROW-6), which keeps its present loud stop.
8. **No change to the DR-172 envelope or DR-173 deadlines.**
9. **No special-casing** to `JUDGE:critic:root0:r5:p17`, to Anthropic, to the
   claude relay, or to any maker count.

---

## 13. Adjacent findings — reported, not fixed here

1. **`authoredNodes` is a sparse array today** (`apps/runner/src/index.ts:689`,
   assigned by index at `:833`/`:872`). Any future skip in the leg loop
   produces an untyped `TypeError` in the XREV loop at `:925`. This plan fixes
   it because it must; it is a latent defect independent of DR-174.
2. **The pre-flight exhaustion check kills a whole work item for one call
   site's exhaustion** (`:577-591`). Pre-existing, and the direct cause of the
   "resume is impossible" property; §4 Claim C repairs it.
3. **`ProviderCallFailedError` carries only `cause: unknown`**
   (`packages/providers/src/index.ts:46-55`), forcing any caller that wants the
   terminal reason to sniff a message — contrary to 03 §10. Typed as part of
   this plan's minimal edit.
4. **`apps/scheduler`'s `job:reaper` is unimplemented**
   (`apps/scheduler/src/index.ts:88`). When it lands it must treat a held work
   item as alive, or it will reap exactly the runs DR-174 is saving.
5. **DR-159 risk A-2 is still live** on the Hatchet runner path
   (`apps/runner/src/main.ts` reads attempt bounds from `process.env`). This
   plan adds a second register-sourced policy the acceptance path resolves
   cleanly and the Hatchet path would not; it does not fix A-2.
6. **A prune could remove every leg authored by one maker** while both roots
   survive. The run would still satisfy DR-137/DR-143's run-level maker law by
   root count, but the *debate* would be lopsided. The mark's record makes it
   visible; whether it should also be refused is VROW-4's neighbour and is not
   decided here.

---

## 14. V DECISIONS PACKET

Rows for V. None is decided by this plan.

| Row | Question | Architecture's reading | Cost if V rules otherwise |
|---|---|---|---|
| **VROW-1** *(register row, value `— none stated`)* | How many 10-minute holds may one run take before it stops holding and prunes immediately? DR-174's text is per call site; with no cap, a dead relay turns a bounded-spend run into an unbounded **wall clock** (hours of loading page at depth 5) | a cap exists and is small — a cooldown rides out **throttling**; a provider that fails a post-cooldown retry repeatedly is down, not throttled. **The number is V's**, never a literal | without a cap, ship as written and accept that a dead provider can hold a depth-5 run for hours; V would likely re-rule after seeing it, which DR-174's "for now" anticipates |
| **VROW-2** *(vocabulary mint, DR-161 precedent)* | Confirm the new kernel condition mark and its name: **`PRUNED-UNJUDGEABLE-SUBTREE`** (chip: *"Part of the debate could not be judged and was pruned"*) | mint a dedicated member; do **not** overload `UNDER-EXPLORED` or `UNCOVERED-SCOPE` — V ruled that exact trade at DR-161 | a different name is a one-line change if ruled **before** the ticket; after the migration ships it is a data migration |
| **VROW-3** *(scope confirmation)* | Does DR-174's "exhausts its attempt bound" cover **schema** exhaustion (`PROVIDER_CONTENT_UNACCEPTED`, BUG-01's carrier) as well as **transport** exhaustion? | **transport only.** Ten minutes of waiting cannot repair a malformed schema; BUG-01 already gave that path its bounded repair loop and its loud stop | if V includes schema exhaustion, the prune path is unchanged but the cooldown becomes pure delay before a prune — worth a separate `finalRetryAttempts` of 0 for that class |
| **VROW-4** *(architecture + value)* | May a **root** authoring call site be pruned? Pruning the primary root leaves no answer; pruning the secondary root converts an admitted 2-maker run into a 1-maker run after admission | **no** — roots keep the loud death. A 1-maker answer is lawful only when the run was **admitted** as one (DR-137), and DR-143 clause 1 makes >1 maker run-level law | if V rules roots prunable, the run must also re-derive its maker-count disclosure and the DR-161 mark's prose at serve time |
| **VROW-5** *(register row, value `— none stated`)* | Should a prune inside the served root's own subtree **cap the confidence band** (AC-24's existing `applyBandCeiling`), in addition to carrying the mark? | the lever exists and is the natural place; the **basis has no ruled value**, so this plan invents none — the mark alone discloses today | a cap ruled later is additive; a cap invented now would be an unruled number on the served surface (AC-76) |
| **VROW-6** *(scope, follow-up ticket)* | Does DR-174 extend to a failed **cross-maker review** call — i.e. must an already-authored, already-judged node whose DR-165(3) review died be pruned from the **number** as well as the text? | out of scope here; it needs a propagation-**input** projection (excluding a persisted node from the evaluation snapshot), which is a strictly larger seam with its own honesty questions. Present behaviour (`NODE_REVIEW_UNAVAILABLE`, loud stop) is DR-165(3)-correct and is preserved | ruling it in scope roughly doubles the ticket and re-opens §7's "no propagation change" |

---

**PLAN READY FOR GROK AUTHORIZATION**

# ADR-0017 — Durable execution: Hatchet as dispatcher

| Field | Value |
|---|---|
| **Status** | **RULED — DR-118 (V-RULING, FINAL).** **Hatchet, self-hosted, Postgres-first** (`SERVER_MSGQUEUE_KIND=postgres`; RabbitMQ **off** until measured need). The engine is a **DISPATCHER ONLY**: `core.work_item`'s claim-before-call, Seam C's gateway artifacts and **our** ledger sequence remain the sources of record. |
| **Date** | **2026-08-07** — minted by PROG-V3-R1 / PRE-10 rev 2 |
| **Proposed by** | The DR-117 stack sitting left durable execution as its **one open sub-decision** (Hatchet OR Inngest). Decided by V at **DR-118** after a two-lens debate. |
| **Source of record** | PROG-V3-R1 ledger **DR-117** (the either/or), **DR-118** (the ruling); acceptance bar = [ADR-0009](ADR-0009-job-execution-in-postgres.md) |
| **Evaluation record** | **`docs/missions/2026-08-06-v3-programming/ratification/hatchet-vs-inngest-grok.md`** — the Grok comparison artifact prepared for the sitting: seven-law acceptance bar, fact snapshot for both candidates, PROS/CONS per option, a law-by-law risk table, and a recommendation. Orchestrator research concurred. **This ADR records the decision; that artifact is the reasoning it was taken on, and it is not restated here.** |
| **Numbering note** | ADR-0015 and ADR-0016 were minted after the planned fourteen (README §2). ADR-0017 and ADR-0018 are minted by **DR-117/DR-118**, the first ADRs whose subject the C4 plan did not anticipate at all. |

## Context

[ADR-0009](ADR-0009-job-execution-in-postgres.md) decided **where work lives**: a
Postgres-backed queue inside the one store, claimed with
`SELECT … FOR UPDATE SKIP LOCKED`, committed before any model call. It did not
decide **what dispatches workers, retries them, times them out, fans out child
work, or schedules time-triggered jobs** — under the C4 design those were the
runner's own loop.

**DR-117 put durable execution into the stack as a first-class row** and left its
identity as the sitting's one open sub-decision. DR-118 closes it.

**The framing that decides everything downstream**, taken verbatim from the
evaluation record: *"neither product **is** ADR-0009's `SELECT … FOR UPDATE SKIP
LOCKED` queue on `core.work_item`. Both are external orchestration engines. The
real question is which one **interferes least** with implementing those laws in
our gateway/runner."*

### The acceptance bar — ADR-0009's seven laws

Any engine must **satisfy** these or **permit us to implement them on top**
without fighting the engine. DR-117 makes them the acceptance criteria by name.

| # | Law | Source |
|---:|---|---|
| 1 | **Claim-before-call** — the claim is committed **before** any model call; results written after | ADR-0009 decision; AC-04 |
| 2 | **Idempotent scoped commands** — work items are idempotent `(row, node-set)` commands on `core.work_item` | ADR-0009 clause 2; AC-72 |
| 3 | **No lock across a model call** | ADR-0009 clause 7; AC-04 |
| 4 | **Resumability** — a crash mid-batch leaves completed work durable and resumable | ADR-0009 clause 4; AC-04 |
| 5 | **Real artifacts only** — no engine-injected result may stand in for a model call | ADR-0009 clause 1; **DR-115** |
| 6 | **One durable store** — strong preference for PostgreSQL; a second broker or store is a design cost | AC-02 |
| 7 | **Own ledger, own sequence** — every executed attempt is recorded in **our** append-only ledger in **our** order (`at_seq`) | AC-44, AC-45; ADR-0006 |

**The cross-cutting truth the evaluation established, and the reason this ADR is
short on engine features and long on boundaries:** laws **1, 2, 3, 5 and 7 are
application contracts** — *no engine enforces them*. Only laws **4 and 6** are
where product architecture actually diverges. So the engine choice is almost
entirely a **law-6 question**, and everything else in this document is about
keeping the other five ours.

## Options considered

### Option A — Hatchet, self-hosted, Postgres-first *(chosen; RULED at DR-118)*

PostgreSQL is the source of truth for workflow and task state; Postgres-only
messaging is a documented configuration (`SERVER_MSGQUEUE_KIND=postgres`), so
**law 6 is satisfiable without a second durable store**. MIT-licensed, first-class
self-host on Docker Compose, official TypeScript SDK with long-lived workers —
which matches DR-117's TypeScript workers and
[ADR-0018](ADR-0018-deployment-topology.md)'s Compose topology, and matches the
runner's shape far better than a serverless re-invoke-per-step model.

Durable tasks checkpoint waits and child-task completion, which supports law 4
**when model calls live in child tasks** — the posture clause below.

### Option B — Inngest, self-hosted *(rejected)*

The better TypeScript developer experience of the two, with step memoization
giving law 4 natively. Rejected on **law 6**: queue and run state live in Redis
for any serious deployment, with Postgres covering config and history — **two
durable stores by design**, which is the structural cost AC-02 exists to prevent.
Secondary costs recorded rather than decisive: SSPL with a delayed Apache
conversion rather than MIT, and a self-host support posture the vendor's own docs
describe as second-class.

### Option C — Inngest Cloud *(rejected)*

The least operational toil and the most mature form of the product. Rejected as
the **strongest law-6 violation of the three**: run state, step memoization and
the queue live in an external durable plane, so *"what is running"* and *"what
step is done"* leave the building. That also degrades laws 4 and 7 during
incidents — our Postgres could be healthy while resume truth is elsewhere — and
it is at odds with DR-117's self-host Compose ruling.

### Option D — no engine: `core.work_item` plus a hand-rolled poller *(closed by ruling, recorded honestly)*

ADR-0009's queue already exists and already satisfies laws 1–3, 5 and 7 by
construction. What an engine adds is **worker lifecycle, redelivery, timeouts,
child-task fan-out, scheduling and an operational surface** — all of which we
would otherwise write and operate ourselves.

**DR-117 made durable execution a stack row, so this option is closed by
ruling, not by argument** — and it is recorded because it is the honest baseline
against which the engine's cost should be read. What we buy is dispatch
machinery; what we pay is a permanent second bookkeeping surface (see
Consequences).

## Decision

**Hatchet, self-hosted, Postgres-first.** Six clauses. **Clauses 1, 2, 4, 5 and 6
and the headline of clause 3 are DR-118's ruled posture**, reproduced here.
**Clause 3's sub-clauses (b)–(f) are this seat's composition design** — the
mapping DR-118 requires but does not spell out — and are **SEAT-PROPOSAL**: a
reviewer may overturn them without re-opening a ruling.

### 1. Postgres-first messaging; RabbitMQ is off, and turning it on is a recorded exception

`SERVER_MSGQUEUE_KIND=postgres`. **RabbitMQ is OFF until measured need**, and
**enabling it is a recorded law-6 exception** — a second durable moving part,
introduced deliberately, with the measurement that forced it written down.

This clause exists because the failure mode is *convenience*, not disagreement:
the vendor's production Compose examples commonly ship RabbitMQ, so a
copy-pasted deployment acquires a second store without anyone deciding to
(evaluation record §A con 2). **A deployment that has RabbitMQ running without a
recorded exception is a defect, not a configuration preference.**

### 2. The engine is a DISPATCHER ONLY

**`core.work_item`'s claim-before-call, Seam C's gateway artifacts and our ledger
sequence remain the sources of record.** The engine's state is *its* record of
dispatch. Stated as three prohibitions, because each has a tempting violation:

- **Engine run history is not the ledger.** AC-44's *"everything executed is
  recorded"* is discharged by our ledger row per attempt, never by the engine's
  task history. A dashboard is not an audit trail.
- **Engine ordering is not `at_seq`.** ADR-0006's total order comes from a
  dedicated sequence allocator under a write lock. Engine completion order is
  whatever the engine's scheduling produced. **Where they disagree, `at_seq`
  wins**, and nothing may read engine order as the sequence of record
  (evaluation record §C law 7).
- **Engine state is not run state.** ADR-0007 derives current status from our
  event streams. A run's phase, an envelope's state and a row's activation state
  are folds over `run_progress_event` / `run_row_activation_event` — never a
  query against the engine.

### 3. The claim commits in our database as the worker's first act inside any task

**This is the mapping of AC-04's claim law onto Hatchet's assignment model, and
it is the clause the whole ADR turns on.**

#### 3(a) Assignment is not a claim

The two mechanisms are not the same thing and must not be conflated:

| | Hatchet's assignment | ADR-0009's claim |
|---|---|---|
| **What it is** | the engine deciding *which worker should attempt this task now* | a **committed row in our database** saying this work item is being worked |
| **Owned by** | the engine — assignment, redelivery, timeouts | **us** — `core.work_item`, `claim_deadline`, the reaper |
| **Delivery guarantee** | **at-least-once**: a task may be delivered more than once | exactly one live claim per work item, enforced by `SELECT … FOR UPDATE SKIP LOCKED` |
| **What it authorizes** | an *attempt* | **the model call** |

#### 3(b) The first lines of every task body — three checks, in order

**Never rely on Hatchet's assignment as the claim** (evaluation record §C law 1
mitigation). The sequence is:

1. **Open a short transaction.**
2. **Settled-identity check — ledger first, and scoped to COMMAND COMPLETION.**
   If this `(row, node-set)` **command** carries a **settled outcome on
   `core.work_item`** — a success, or a **terminal typed state that ends the
   command** (an exhausted attempt budget under clause 5; a typed skip under
   clause 6; any outcome the command contract marks terminal) — the task **exits
   as a no-op, whatever the claim says, live or not**. *The ledger, not the
   claim, is the source of record* (law 7). This is law 2's *"idempotent scoped
   command"* made mechanical rather than left as a background principle.

   **It does NOT fire on a retryable failure, and the distinction is
   load-bearing.** A ledgered **attempt** row is evidence that *an attempt
   happened* — **not** proof that *the command is finished*. A typed failure with
   attempt budget remaining leaves the command **unsettled**, and a redelivered
   attempt is **exactly what that state is for**. A short-circuit that fired on
   any ledgered attempt outcome would strand every retryable failure
   permanently — **resumability inverted into stuck work** (AC-04), which is a
   worse defect than the double-call window this check exists to close. **The
   predicate is the command's settled state; attempt rows are its evidence, never
   its trigger.**
3. **Claim the row** — `SELECT … FOR UPDATE SKIP LOCKED` on `core.work_item`. A
   live claim held by another attempt yields no row, and the task **exits as a
   no-op**.
4. **COMMIT.**
5. **Settlement-completion path — finish, don't redo.** Before entering the
   gateway, the claiming attempt asks whether this command already has **a
   durably-ledgered attempt artifact awaiting settlement**, or an **attempt
   ledger that already shows the shared budget exhausted**:
   - **A recorded successful attempt awaiting settlement** ⇒ **complete the
     settlement from that existing artifact** and exit. The command settles on an
     artifact that was already produced by a real call; **no second call is
     made.**
   - **An attempt ledger showing the budget exhausted** (clause 5's shared
     `max_attempts`) ⇒ **commit the terminal exhausted-budget state derived from
     the ledger** and exit. **No second call is made**, and the shared bound is
     not overrun by a redelivery that reasoned only from the unsettled state.
   - **Neither** ⇒ proceed. **A retryable failed attempt with budget remaining is
     exactly the "neither" case** — there is nothing to complete and the command
     is meant to be retried (step 2's scoping).
6. **Only then** the model call — and **re-read the settled state immediately
   before entering the gateway** (this narrows the window of §3(d); it does not
   close it, and §3(d) says so).

**A builder who implements only step 3 has implemented a third of the rule.**
Step 3 closes the *concurrent* case; **step 2 closes the case where the work is
already done and the claim is long gone** — post-success redelivery, engine
replay after a restart, a manual re-enqueue; **step 5 closes the case in
between** — the call returned and its artifact is durable, but the settlement
never committed. Step 2's predicate is the command's **settled** state and step
5's is the command's **completable** state, and the two are different questions:
between the gateway's writes and the conditional settle there is a window in
which the command is *not settled* and yet *must not be re-called*. Step 5 is the
only thing that closes it.

#### 3(c) The claim must outlive the call it authorizes

`claim_deadline` is **derived from the call site's declared `CallBound.deadline`
plus a margin** — both register values, both V's at DR-023 (AC-74, AC-76; **no
numeral appears here**). The invariant, stated because §3(b) is vacuous without
it:

> **A `claim_deadline` shorter than the call-site deadline it authorizes is a
> defect in the register values — never a licence for a second call.**

A permitted alternative where call bounds vary widely — local vLLM latency
variance is the obvious case — is for the worker to **extend the claim in a
short separate transaction** until the gateway returns or fails typed. That is
**not** a breach of ADR-0009 clause 7(a), which forbids an **open** transaction
across the call, not a later short one. **The derivation is the default** because
it needs no write path during the call and no liveness signal from the worker
that may be the very thing that died; the heartbeat is the exception a call-bound
spread can justify.

#### 3(d) The residual — a zombie attempt may overlap, and pretending otherwise would be the dishonest clause

*"The reaper never expires a claim whose gateway call is in flight"* is **not
enforceable**. A worker that is network-partitioned, GC-paused or host-frozen is
**indistinguishable from a dead one** on the database's side; and the far side of
a model call offers no universal idempotency key we could re-present to suppress
a duplicate. So §3(c) makes the window **not open under a healthy attempt**, and
**nothing makes it impossible**.

**The interleaving table** — the six cases a builder must be able to answer:

| # | Interleaving | What happens | Second real call? |
|---|---|---|---|
| **A** | Engine redelivers while attempt-1's model call is in flight and the claim is **live** | attempt-2's step 3 finds a live claim → **no-op** | **No** |
| **B** | Engine's own assignment timeout fires between claim-COMMIT and the gateway call | engine timeout is **not** a claim release; re-dispatch no-ops against the live claim | **No** |
| **C** | Worker crashes after claim-COMMIT, before the call | claim stays live; redelivery no-ops until **our reaper** expires it; then a legitimate re-claim | **No** — the stuck window is `claim_deadline`, by design |
| **D** | **`claim_deadline` elapses while attempt-1's call is still in flight** — mis-sized bound, or a zombie worker | attempt-2 finds nothing settled and no live claim → claims → **a second real call runs concurrently** | **POSSIBLE — this is the residual** |
| **E** | Redelivery *after* attempt-1 settled and the claim was released | attempt-2's **step 2** finds the identity settled → **no-op, regardless of claim liveness** | **No** |
| **F** | **The call RETURNED and its artifact + attempt row are durably ledgered, but the conditional settle had not committed** when the worker died or lost the claim | the command is **unsettled**, so step 2 does **not** fire and the claim is gone — but attempt-2's **step 5** finds a **completable artifact** and **completes the settlement from it**. Same shape when the last budgeted failure is ledgered before the terminal exhausted state commits: step 5 **derives exhaustion from the attempt ledger** and commits the terminal state | **No** |

Case **D** is irreducible. Cases **A/B/C** are closed by the claim; **E** by the
settled-command check; **F by the settlement-completion path** — and F is the
state that sits *between* D and E, where the call is neither in flight nor
settled. `claim_deadline = CallBound.deadline + margin` (§3(c)) covers the
**call**, not the post-call settlement window, so F is not closed by the sizing
invariant either. **Only D survives, and §3(e) is what makes it safe rather than
silently harmful.**

#### 3(e) What makes an overlap safe — three properties, all required

1. **Attempt-scoped identity.** Each attempt writes its raw artifact and its
   ledger row under **its own attempt identity** (AC-13, AC-44); the ledger is
   append-only (AC-45). **Both writes are legal and neither overwrites the
   other**, so *"which write wins"* is **not** a question about the ledger — there
   is no conflict there to resolve.
2. **First settled wins; the loser is recorded, not discarded — and a settle may
   be completed by a later attempt.** Exactly one attempt's result becomes the
   work item's **settled outcome**, and the settle is a **conditional update that
   succeeds only if the item is not already settled**. **The attempt that commits
   that update need not be the attempt that produced the artifact** (§3(b) step 5,
   case F): a redelivered attempt completing an orphaned settlement writes the
   *recorded* artifact's outcome, and the winner is **the artifact, not the
   worker**. The conditional update is what keeps this safe under a race — a
   completing attempt and a revived original cannot both settle.
   The losing attempt's artifact and ledger row **stay in the ledger as a recorded
   attempt** — AC-44 requires everything executed to be recorded and AC-45 forbids
   rewriting it — marked as a **superseded duplicate attempt**, and that artifact
   **never becomes a served number's provenance**. Replay stays deterministic
   because the served number points at the **winning** attempt's artifact
   (AC-06, AC-07).
3. **The attempt budget counts both, and it is derived from the ledger.**
   Overlapping attempts consume **the same** call-site budget (`max_attempts`
   under DR-020's caps — clause 5), so the pathological case is **bounded rather
   than unbounded**; and because every attempt is a ledger row, **the duplication
   is visible in the ledger rather than silent**. **Remaining budget is computed
   from the attempt ledger for this command, never from the unsettled work-item
   state** — otherwise a redelivery arriving in case F's window reasons from a
   command that looks untouched and enters the gateway past the shared bound.

**A recorded duplicate attempt is a signal, not noise.** It means either
`claim_deadline` was mis-sized against the call bound (§3(c)) or a worker went
zombie. It should be **watched**, and the honest reason it is watched rather than
gated is that **no gate can prevent it** — only the bound can make it rare and the
ledger can make it visible.

**Its DR-115 boundary.** A second real call is a **cost and consistency** event,
**not** a scaffolded-data breach: both artifacts are real. What **would** be a
breach is **discarding** an attempt's artifact to tidy the books — that deletes
the record of something executed (AC-44, AC-45) — or serving a number whose
provenance points at no artifact at all.

#### 3(f) Why the two expiry mechanisms compose instead of competing

The engine may time out an assignment and re-dispatch; that does **not** release
our claim. **Our reaper owns expiry** (AC-89's write half; ADR-0007), and the read
derives failed status from `claim_deadline` without writing (AC-62). With §3(b)'s
ledger-first check and §3(c)'s sizing invariant in place, the slogan holds **with
its invariant stated**:

> **The engine decides when to try; our claim and our ledger together decide
> whether work happens.**

The earlier form of this sentence rested on the claim alone, which is **vacuous
the moment the deadline is not live** — §3(d) is the case that proves it. A
re-dispatch against a live claim is a no-op; a re-dispatch against a settled
identity is a no-op; a re-dispatch after our reaper has expired the claim on
genuinely abandoned work is a **legitimate** re-claim. Two mechanisms, two
decision points, **no second source of truth**.

### 4. Model calls live in plain or child tasks — never naked in durable orchestrator code

Durable orchestrator code is **replayed from an event log** to reconstruct
progress after a crash. A side effect sitting naked in replayed code either
re-executes or is skipped, depending on checkpointing — and for a model call
**neither outcome is acceptable**: re-execution is an unbudgeted real call, and
skipping is a result with no call behind it.

**The rule:** durable orchestrator tasks carry **wait and spawn control flow
only**. Every model call sits in a **plain or child task**, whose *completion* is
what the orchestrator checkpoints. Replay then reads the child's recorded
outcome rather than re-issuing the call.

**Its DR-115 boundary, stated precisely.** Replaying a child's recorded output is
**not** a scaffolded-data breach *if* that output came from a real call the
gateway already persisted and ledgered (clause 1 of ADR-0009). It **is** a breach
the moment an engine-stored task output is treated as an artifact without a
gateway write behind it. See
[ADR-0012](ADR-0012-test-stack-and-replay-ceremony-isolation.md) clause 7.

**This is the "determinism tax"** the evaluation record names as Hatchet's
sharpest misuse risk (§A con 4) — wrong structure yields replay bugs or double
side effects, and it is *easy to get wrong under time pressure*. It is written as
a rule here rather than left as engine folklore.

### 5. Engine auto-retries are bound by register values — never engine defaults

Engine retries are **convenience-oriented, not ADR-0009-oriented**: a retried
task issues **another real model call**. That is a cost and consistency question,
not a DR-115 breach — but it is unbounded unless we bound it.

**The rule:** engine retry behaviour is configured **from register rows**, under
**DR-020's caps**, and **never left at the engine's defaults**. Three
consequences:

- **The attempt budget is one budget, not two.** The provider call bound
  `{max_attempts, token_ceiling, deadline}` is already a register row per call
  site (`05-register-skeleton.md` §5.4; Plan.md §6.2 AM-13). Engine retries and
  gateway attempts consume **the same declared budget** — an engine retry that
  pushes total attempts past the call site's bound has broken the bound, not
  extended it.
- **Every attempt is a ledger row regardless of who initiated it** (AC-44,
  including schema-failure retries). The ledger is what counts attempts; the
  engine's retry counter is not an authority.
- **No numeral appears here or in any engine configuration file.** Values are
  V's at DR-023 (AC-74, AC-76 · DR-039). A retry count written into a task
  decorator as a literal is the source-literal-constant defect
  (`no-source-literal-constant`; charter A3.5).

**Default posture:** engine retries are **disabled or tightly bounded**, because
our reaper and our typed failures own recovery (evaluation record §D
implementation posture).

### 6. Hatchet's tables live in a dedicated database or schema on the one Postgres instance

**One backup lineage.** The engine's schema is **not** in our migration lineage,
**not** in `02-data-model.md`, and is migrated by the engine's own tooling on its
own cadence. **No V3 query joins across the boundary.** The full statement of the
boundary, including why this is not an AC-02 breach, is
[ADR-0003](ADR-0003-postgres-access-and-migration-tooling.md) **rule 4**.

**ON THE ONE INSTANCE is the ruled posture, and there is no operational escape
from it.** DR-118 rules a dedicated database or schema **on the one Postgres
instance**, for one backup lineage. **Moving the engine to a second instance is
NOT an operational decision** — it would soften AC-02's *"one store"* into *"one
kind of store"*, which is precisely the property the ruling chose, so it requires
**a new human ruling under DR-116's rule**, not a capacity judgement at deploy
time. The shared-capacity cost is real (Consequences; evaluation record §A con 8)
and is **accepted**, not held open as an exit.

## Consequences

**Accepted:**

- **Law 6 is satisfied without a second durable store** — the only law of the
  seven that is a product-architecture question rather than app discipline, and
  the reason this option won.
- **MIT license, self-host, Docker Compose** — no vendor-license friction, and
  the control plane sits inside the deployment
  ([ADR-0018](ADR-0018-deployment-topology.md)) rather than off it.
- **Long-lived TypeScript workers** map cleanly onto Compose services beside
  `apps/api` and the runner, and stay inside ADR-0001's single type graph.
- **Durable resumability for worker lifecycle**, with our activation stream
  still owning battery resume (clause 2; ADR-0009 clause 4).
- **Polyglot optionality without redesign** — a later Python or Go worker lane is
  possible without changing the control plane. Recorded as available, **not
  recommended**: taking it spends ADR-0001's single-type-graph property, which
  that ADR prices.

**Costs and risks — each named in the evaluation record and accepted at DR-118:**

- **Dual bookkeeping is permanent** (§A con 1). Engine state is its schema and
  history; our ledger and activation stream are ours. They will not agree on
  ordering and are not meant to. Clause 2 says which one is authoritative every
  time it matters.
- **The RabbitMQ pull is real** (§A con 2). Clause 1 makes the exception
  recorded rather than accidental; nothing else prevents a copy-pasted compose
  file from acquiring a second store.
- **A gRPC control plane is extra surface** (§A con 3) — engine, dashboard,
  migrations, tokens, config volumes. More services than "a table and
  `SKIP LOCKED` in our app", which is Option D's honest advantage.
- **The determinism tax is easy to misuse** (§A con 4). Clause 4 is the rule; a
  breach of it produces replay bugs or double model calls, and neither fails
  loudly.
- **Retries re-run real work** (§A con 5). Clause 5 bounds it; the risk is
  multi-attempt cost and noise, **not** fake artifacts.
- **Claim semantics are engine-owned** (§A con 6) — the engine will not enforce
  ADR-0009's transaction shape. Clause 3 is worker-boundary discipline, and it is
  discipline the engine cannot check for us.
- **A double real call is possible and is not designed away** (clause 3(d),
  case D). Under a mis-sized `claim_deadline` or a zombie worker, a re-claim can
  overlap an in-flight attempt and **two real model calls run**. Clause 3(c)
  makes the window not open under a healthy attempt and clause 3(e) makes an
  overlap **bounded and visible** — attempt-scoped identities, first-settled-wins
  with the loser recorded, one budget counting both — but **no clause makes it
  impossible**, because a frozen worker is indistinguishable from a dead one and
  the provider offers no idempotency key we could re-present. This is an
  **accepted residual**, and it is stated as one rather than hidden behind the
  live-claim check.
- **Shared Postgres capacity** (§A con 8). Engine polling and dashboard queries
  compete with graph and ledger writes. Clause 6 accepts this for one backup
  lineage; ADR-0003's costs section carries it too.
- **A younger ecosystem than the alternative's cloud mindshare** (§A con 7).
  Edge-case maturity under multi-day debate batteries and local vLLM latency
  variance is **unproven for this workload** — the evaluation record says so
  plainly and this ADR does not claim otherwise.

## Constraints served

| Constraint | Citation | Carried in this decision by |
|---|---|---|
| AC-02 — one store, multiple indexes | spec §20 W-3; §16.5 K-22 | clause 1 (Postgres-first messaging) + clause 6 (one instance, one backup lineage); ADR-0003 rule 4 argues the co-tenant boundary |
| AC-04 — no lock across a model call; durable, resumable, isolated | spec §20 W-4; manifest §13.1 C-3 | clause 3's claim mapping **including 3(b)'s ledger-first check and 3(c)'s sizing invariant**; ADR-0009 clause 7's transaction boundary |
| AC-44 / AC-45 — everything executed is recorded, append-only, in order | DR-027; manifest §8.3, §8.2g | clause 2 — the ledger and `at_seq` remain ours. **Clause 3(e) is where this bites hardest**: a duplicate attempt's artifact is **recorded as a superseded attempt, never discarded**, because discarding it would delete the record of something executed |
| AC-13 — raw artifact persisted unconditionally | manifest §8.2a | clause 4 — the gateway writes it, not the engine |
| AC-72 — propagate re-judges only affected nodes | DR-015 | law 2's `(row, node-set)` idempotency key, which is what makes at-least-once safe |
| AC-89 / AC-62 — stale work expires on read; reads do not write | manifest §9.2d | clause 3(f) — our reaper owns expiry; engine timeout is a re-dispatch, not an expiry. **The reaper's freedom to expire is exactly what opens case D**, which is why 3(c) binds `claim_deadline` to the call bound |
| AC-74 / AC-76 — constants are register rows; no invented numbers | DR-023, DR-039 | clause 5 — retry bounds are register values under DR-020's caps; no numeral in any engine config |
| **DR-115** — no scaffolded data | PROG-V3-R1 ledger DR-115 | clause 4's boundary; ADR-0012 clause 7 |
| **DR-117** — durable execution is a stack row | PROG-V3-R1 ledger DR-117 | this ADR exists because that row was left open |
| **DR-118** — Hatchet, self-hosted, Postgres-first, dispatcher only | PROG-V3-R1 ledger DR-118 | clauses 1–6, verbatim posture |

## What this ADR does not rule

- **Version pins.** The engine's image tag is not stated here and is not a
  numeral in any document — see `05-register-skeleton.md` §5.4c for how it is
  pinned. The evaluation record explicitly flags that vendor Compose examples
  and version pins **must be re-checked at the implementation ticket**
  (§"Uncertainty"), and this ADR does not pretend otherwise.
- **Poll interval, batch size, worker count, concurrency limits.** ADR-0009
  already routes these to register keys; adopting an engine does not move them
  and mints no new authority.
- **Whether the co-tenant ever leaves the one instance.** It does **not** under
  this ADR: DR-118's clause 6 rules it on the one instance and clause 6 states
  that a split needs **a new human ruling**, not an operational reclassification.
- **Whether a later worker lane is polyglot.** Available, priced at
  [ADR-0001](ADR-0001-language-and-runtime.md), not recommended here.
- **Anything about how the queue itself works.** `SELECT … FOR UPDATE SKIP
  LOCKED`, the work item, the activation stream and the WAIT drain law are
  [ADR-0009](ADR-0009-job-execution-in-postgres.md)'s, unchanged. **This ADR adds
  a dispatcher; it removes nothing.**

# ADR-0009 — Job execution inside Postgres

| Field | Value |
|---|---|
| **Status** | **RULED — DR-117 (V + the human stack sitting, FINAL).** A Postgres-backed queue inside the one store, TypeScript executor. This is the original C4 instantiation, **restored as the ruled text**; the Python-executor episode of DR-105 is **SUPERSEDED** and recorded at §"The superseded episode". **Its seven laws are the acceptance criteria any durable-execution engine must satisfy** — see the companion [ADR-0017](ADR-0017-durable-execution-hatchet.md) (DR-118). See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 · re-instantiated 2026-08-07 (DR-105) · **restored and ruled 2026-08-07 (DR-117/DR-118)** |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. **Ruled at the DR-117 stack sitting**; the execution platform ruled at **DR-118**. Executed as PRE-10 rev 2. |
| **Source of record** | Plan.md rev 3, §2.7 (job execution row), with §3.2 Seam C, §4.1a and §6.2 AM-8; PROG-V3-R1 ledger **DR-115**, **DR-117**, **DR-118** |

## Rulings folded in (PRE-04, 2026-08-06)

| Ruling | Q-nn | What it changes here |
|---|---|---|
| **DR-089** | Q-20 (AM-10) | **The runner's evaluation policy is fixed** — clause 4 no longer defers it. **WAIT drain law**: at run completion nothing remains waiting. **Q61** is a **post-completion settlement event**, not an intra-run WAIT row; the standing watch lives outside the run lifecycle. New **clause 5**. |
| **DR-083** | Q-15 (OQ-G9) | The activation table is **re-derived and ratified in-repo** as a first-class per-row contract field, with a **written predicate per row**; a row whose predicate the spec only summarizes files as `POLICY_BLOCKED`. **No import of the old research artifact.** Gives clause 4's `{predicate_ref}` a named source. |
| **DR-093** | Q-24 (OQ-G2) | The per-row correctness/enrichment classification is **proposed once by architecture and ratified once by V** (one sitting, alongside the register). Design-time config, fully automatic at runtime, **no human in any user's loop**. **Until ratified, rows behave as correctness — never skipped.** |
| **DR-099 / A-05** | — | The work item's carrier is accepted: **`core.work_item`** (`02-data-model.md` §3.8), which closes gap `MOD-4`'s acceptance half. |

## Rulings folded in at rev 2 (PRE-10, 2026-08-07)

| Ruling | What it changes here |
|---|---|
| **DR-115** | **NO SCAFFOLDED DATA.** Every runtime artifact is a real model call's artifact. Folded into **clause 1**, because this gateway is the only place a model artifact enters V3. |
| **DR-117** | The executor is **TypeScript**; the Python instantiation is superseded. The queue design itself is unchanged — it was never a language property. |
| **DR-118** | **Durable execution = Hatchet**, self-hosted, Postgres-first, **dispatcher only**. This ADR's laws are the acceptance bar the engine had to clear; the engine decision, its posture and the mapping of AC-04's claim law onto its assignment model are carried by **[ADR-0017](ADR-0017-durable-execution-hatchet.md)**, not here. **Nothing in this ADR is weakened by adopting an engine** — clause 7 states the boundary. |

## Context

A run executes many units of work, most of which involve a model call. Three
ruled properties decide where the work queue lives:

- **AC-02** — the settlement store, the model ledger and the cross-run memory
  index are **one store, never parallel stores** (spec §20 W-3; §16.5 K-22;
  §17.7 M-26).
- **AC-04** — keep the property, drop the storage accident: **never hold a write
  lock across a model call**; isolate per-member failures; a crash mid-batch
  leaves completed work **durable and resumable**; no storage-engine-specific
  ordering tiebreak (spec §20 W-4; manifest §13.1 C-3).
- **AC-44** — everything executed is recorded; the ledger is the record of what
  ran (DR-027; manifest §8.3; charter S3).

The interface-facing consequence is that a "job" must be a thing the reader can
be told about honestly — a stuck job may never masquerade as work-in-progress
(AC-89 · manifest §9.2d), which ADR-0007 carries.

## Options considered

### Option A — a Redis or message-broker queue *(rejected)*

The conventional choice. Rejected under AC-02: run state in a broker is a
**second durable store** for run state, and the pack's rule is one store with
multiple indexes. It would also put the record of what was claimed outside the
ledger, weakening AC-44.

### Option B — an in-process scheduler with no durable claim *(rejected)*

Rejected under AC-04: a crash mid-batch would not leave completed work durable
and resumable, and there would be nothing to resume *from*.

### Option C — a Postgres-backed queue inside the one store *(chosen)*

`SELECT … FOR UPDATE SKIP LOCKED` for the claim, **work claimed and committed
*before* any model call, results written after**.

## Decision

**A Postgres-backed queue (`SELECT … FOR UPDATE SKIP LOCKED`) inside the one
store. Work is claimed and committed before any model call; results are written
after.** Status: **RULED at DR-117**; the executor is TypeScript, and the
durable-execution platform that dispatches it is ruled at **DR-118**
([ADR-0017](ADR-0017-durable-execution-hatchet.md)).

Seven rules ride with it — the first four as authored, clauses 5 and 6 folded in
from DR-089 and DR-093, and clause 7 added at rev 2:

### 1. Seam C's write ordering at the provider boundary

Every model call crosses **one** provider interface taking a typed role, a lane,
a call bound and a contract hash, and returning a raw artifact (AC-36 · DR-029
H1). The gateway persists the raw artifact **unconditionally, parseable or not**
(AC-13 · manifest §8.2a) and writes the ledger row (AC-44) — **outside any open
write transaction** (AC-04). Provider identity, model id and `model_version` are
configuration values on the way in (AC-36) and recorded keys on the way out
(AC-42 · spec §16.2 K-3…K-11).

**The raw artifact is a REAL call's artifact — `RULED — DR-115`.** V's standing
law: *"no stubbed judge responses, no hardcoded sample debates, no seeded
artifacts masquerading as generation, no demo data on production paths."* It is
stated here because this gateway is the **only** place a model artifact enters
V3, which makes it the only place the law can be broken and the only place it
needs enforcing. Four consequences, none of them new law:

- **A `RawArtifactRef` written by this gateway always corresponds to a call that
  was actually made**, to a configured provider, with the recorded model id and
  `model_version` — which is exactly what AC-42's honest-reporting keys already
  claim, now stated as a prohibition rather than left as an implication.
- **A failed call produces a typed failure and a ledger row**, never a
  substituted artifact. AC-13's *"persist unconditionally, parseable or not"*
  means an unparseable **real** response is kept; it has never meant a
  fabricated one is written when there was no response at all. Both readings
  persist "something", and only one of them is the ledger telling the truth
  (AC-44, charter S3).
- **A cache hit is not a fabrication and is not exempt.** It replays a
  **recorded real** artifact under the contract-hash identity ADR-0006 fixes,
  and it yields a **new ledger row** — provenance intact. A cache hit never sets
  a row INACTIVE (AC-83) and never launders an artifact that was not produced by
  a call.
- **A fixture may not stand in for the provider on a runtime path.** Test
  doubles are legal in the test layer and confined there
  ([ADR-0012](ADR-0012-test-stack-and-replay-ceremony-isolation.md) clause 7); a
  runtime code path that selects a double is the scaffolded-data breach DR-115
  makes a **BLOCKING** review finding.

**And an engine retry is not an exception to any of this.** A durable-execution
engine that re-invokes a failed task produces **another real call** — which is a
cost and consistency question (clause 7, [ADR-0017](ADR-0017-durable-execution-hatchet.md)),
not a DR-115 breach. What *would* be a breach is treating an engine's stored
task output as an artifact without a gateway write behind it.

### 2. The unit of work is an idempotent scoped work item

Stage work is modelled as an **idempotent scoped work item** — a `(row,
node-set)` pair — rather than a monolithic stage pass (Plan.md §6.2 AM-8,
**DESIGN-NEUTRALIZED**). This one unit serves three otherwise-unmodelled needs:
a halt enqueues a scoped re-execution bounded at K=1 per parent per run
(DR-050), DR-015's propagate re-judges only the affected nodes (AC-72), and the
regeneration return uses the same unit. Any V ruling on granularity — full
stage, single row, subgraph — is expressible as the node-set argument.

**Its carrier is `core.work_item`** (`02-data-model.md` §3.8) — the one mutable
operational table, whose history is the ledger. Proposed in C4 as gap `MOD-4`'s
repair, **accepted at DR-099/A-05**; the acceptance is what the gap register was
waiting on, and the table is no longer "proposed".

### 3. Run-scoped frozen values are pinned at run start, so re-entry cannot move them

The stranger sample rate and the envelope basis are pinned on the run's
immutable frozen head (AC-50 · DR-052, DR-019 knob 1; Plan.md §4.1a), with
`UPDATE` and `DELETE` both revoked (ADR-0006). Re-entrant execution therefore
cannot move a value that was frozen at run start.

### 4. Resumability is carried by the activation event stream

`run_row_activation` is an immutable row carrying `{predicate_ref}`; every
transition — `{state ∈ {ACTIVE, INACTIVE, WAIT, POLICY_BLOCKED},
predicate_inputs as evaluated at this transition, skip_evidence, at_seq}` —
lands on the append-only `run_row_activation_event` stream, with the current
state derived from the latest event (ADR-0007) and a **mandatory initial event
per battery row written in the same transaction as the run's frozen head**.

This is what makes AC-04's "resumable" property real: **without it, a runner
restart cannot know which rows were WAIT under which predicate**, so the resumed
run either re-fires rows the ledger already recorded or files WAIT rows as
INACTIVE — which spec §1 explicitly forbids, as it forbids filing
`POLICY_BLOCKED` as INACTIVE (AC-83 · DR-037). A cache hit never sets a row
INACTIVE (spec §1; `OD-M-22`).

**Where `{predicate_ref}` points, after DR-083.** The four-member state is
evaluated against the **in-repo activation table**: re-derived and ratified
inside this repository as a **first-class per-row contract field**, carrying a
**written predicate per row**, populated from spec §3's row contracts. A row
whose predicate the spec only *summarizes* is filed **`POLICY_BLOCKED`** — loud,
never a silent skip. **The old research artifact is not imported.** The table
itself is authored by ticket **PRE-05**; this ADR consumes it.

**Rev-2 clarification (DR-118).** Engine resume is **not** battery resume. A
durable-execution engine resuming a task tells you the *dispatch* survived; only
`run_row_activation_event` plus `core.work_item` state tells you which rows were
WAIT under which predicate. Where the two disagree, **this stream wins**
([ADR-0017](ADR-0017-durable-execution-hatchet.md) law 4).

### 5. The runner's evaluation policy — the WAIT drain law (DR-089)

Clause 4 deliberately left the runner's *evaluation policy* open, because the
event stream implements any of Q-20's three readings and only the policy
differs. **V ruled the policy at DR-089, and it is recorded here rather than
left to the builder.**

**(a) WAIT drains at completion.** At debate (run) completion **nothing remains
in a waiting state** — every node is fulfilled and user-visible. A waiting node
completes as soon as its dependencies complete. **No completed run displays a
dangling WAIT**, so a WAIT row is neither a suspended computation parked
forever nor a queued job that may outlive its run: it is a re-evaluated
predicate that must resolve before the run may terminate.

**(b) The run records a typed terminal state at completion.** Terminal means
terminal — a run does **not** reach a terminal state with rows still in WAIT.

**(c) Q61 fires *after* completion, outside the run lifecycle.** V's direction,
recorded: Q61 fires **after the debate is completed**, and its outcome is saved
to the execution ledger (DR-027). **If the debate is not completed or cannot
complete, Q61 never fires for that debate.** Q61 is therefore **not an intra-run
WAIT row** but a **post-completion settlement event**: the standing watch lives
**outside any run**, in Stage-11 / settlement, and fires when the resolver
outcome arrives; calibration then updates version from the ledger record.

**(d) The literal spec reading is amended.** Spec §3 Q61's *"may sit in WAIT
indefinitely"* is amended by DR-089: the indefinite watch persists **across
runs, outside any run** — it is not a row of some run's activation table sitting
in WAIT forever.

*(Consequence for this ADR's carrier: the activation event stream still carries
`WAIT` as one of its four members and still resumes from it — what DR-089 fixes
is that a resumed run must **drain** those rows, not that WAIT disappears.)*

### 6. What the budget subsystem may skip (DR-093)

The per-row correctness/enrichment classification — which decides which work
items the budget subsystem may skip under pressure — is produced by
**architecture proposing the full 71-row split and V ratifying it once**, in one
sitting alongside the register (the wholesale-register pattern of DR-061/DR-062).
Clarified on the record by V: this is **one-time design-time configuration,
fully automatic at runtime, with no human in any user's loop.**

**Until it is ratified, every row behaves as correctness — never skipped.** The
proposal is authored by ticket **PRE-06** and ratified at **VG-02**.

### 7. The transaction boundary, and what an engine may not move (rev 2 · DR-117, DR-118)

AC-04's *"never hold a write lock across a model call"* is one sentence and two
distinct footguns. Both are **application contracts**: no durable-execution
engine enforces either, and the evaluation record says so in as many words —
*"laws 1, 2, 3, 5, 7 are application contracts; no engine enforces them"*
(`ratification/hatchet-vs-inngest-grok.md` §C).

**(a) No transaction is open across a model call.** A `db.transaction(...)`
callback that `await`s the provider gateway holds a write lock for the duration
of a network call to a model. It looks completely ordinary and it is the exact
breach. **The provider gateway is never awaited inside a transaction callback.**

**(b) The gateway's two writes use their own connection.** Clause 1 requires the
raw artifact and the ledger row to be written **outside any open write
transaction**. A gateway that inherits the caller's transaction handle inherits
its lock; it must take its own connection from the pool.

**(c) Per-item failure isolation is per-item, and a cancellation is a failure
like any other.** One item's failure does not roll back its siblings' committed
claims. Where sibling work runs concurrently, a failure is **caught, typed and
ledgered per item** (P15's bulkhead) and never allowed to abort the batch. A
swallowed cancellation is as much a defect as a swallowed exception.

**(d) An engine dispatches; it does not claim.** Adopting a durable-execution
engine (DR-118) does **not** move the claim: `core.work_item` is claimed and
**committed in our database as the worker's first act inside any task**, before
any model call. Engine assignment is not a claim, engine state is not the
ledger, and engine ordering is not `at_seq`. The full mapping is
[ADR-0017](ADR-0017-durable-execution-hatchet.md); the boundary is stated here
because it is *this* ADR's law that would otherwise erode.

**(e) The claim is not the only check, and it must outlive the call it
authorizes.** Two invariants ride with clause (d), stated here because they are
**this ADR's** laws and would otherwise live only in the engine ADR:

- **Ledger-first short-circuit, scoped to command completion.** Before claiming,
  a task checks whether this `(row, node-set)` **command is settled** — a
  success, or a **terminal typed state that ends the command** — and if so exits
  as a **no-op, regardless of claim liveness**. A live-claim check alone is
  silent about work that is *finished* and whose claim is long released, so
  without this the model path stays re-enterable on completed work. **The ledger,
  not the claim, is the source of record** (AC-44/AC-45); clause 2's idempotent
  scoped command is what this makes mechanical. **It does not fire on a
  retryable ledgered failure**: an attempt row is evidence that an attempt
  happened, not that the command finished, and a typed failure with budget
  remaining leaves the command **unsettled — which is precisely the state a
  redelivered attempt exists to resume**. Short-circuiting there would strand the
  work permanently and invert AC-04's resumability into stuck work.
- **Settlement-completion before the gateway — finish, don't redo.** A claim is
  not a licence to call: before entering the gateway the claiming attempt asks
  whether this command already has a **durably-ledgered attempt artifact awaiting
  settlement**, or an **attempt ledger already showing the shared budget
  exhausted**. A recorded successful attempt ⇒ **complete the settlement from that
  existing artifact** and exit; an exhausted ledger ⇒ **commit the terminal
  exhausted state derived from it** and exit. **Neither ⇒ proceed** — and a
  retryable failure with budget remaining is exactly that case. This closes the
  window **between the gateway's writes and the conditional settle**, in which the
  command is *not settled* and yet *must not be re-called*: the completion check
  asks whether the command is **completable**, which is a different question from
  whether it is **settled**. **Remaining budget is derived from the attempt
  ledger, never from the unsettled work-item state.**
- **`claim_deadline` covers the call.** It is derived from the call site's
  declared `CallBound.deadline` plus a margin — both register values, no numeral
  anywhere. **A `claim_deadline` shorter than the call-site deadline it
  authorizes is a defect in the register values, never a licence for a second
  call.** Where call bounds vary widely, the worker may instead **extend the
  claim in a short separate transaction** until the gateway returns — which is
  not a breach of (a), because (a) forbids an *open* transaction across the call,
  not a later short one.

**And the residual is named rather than papered over:** because a
network-partitioned or frozen worker is indistinguishable from a dead one, an
expired claim **may** be re-claimed while a zombie attempt is still in flight, and
**two real calls may overlap**. That is bounded and made visible rather than
prevented — attempt-scoped identities, first-settled-wins with the loser recorded
as a superseded attempt (never discarded, AC-44/AC-45), and one attempt budget
counting both. The interleaving table and the full composition are
[ADR-0017](ADR-0017-durable-execution-hatchet.md) §3(d)–(e). **A duplicate is a
cost and consistency event, not a DR-115 breach — both artifacts are real.**

## Consequences

**Accepted:**

- One store, one backup, one migration lineage, one place to ask "what is
  running" (AC-02, ADR-0003).
- The claim is a committed database fact **before** the model call, so a crash
  during the call leaves a claimed-but-unfinished item that is visibly
  recoverable rather than lost — and the raw artifact is persisted whether or
  not it parsed (AC-13).
- Per-member failure isolation (AC-04) falls out of the unit of work: one failed
  item does not roll back its siblings' committed claims.
- **The seven laws became an acceptance bar rather than a description.** DR-117
  made them the criteria any durable-execution engine must satisfy, and the
  two-lens evaluation (`ratification/hatchet-vs-inngest-grok.md`) scored two
  candidates against them law by law. A decision this ADR did not anticipate was
  made **against** it rather than around it.

**Costs and risks:**

- A database-backed queue puts polling load on the same Postgres instance that
  holds the ledger and the graph. The plan states no interval, no batch size and
  no worker count; this ADR invents none (AC-76 · DR-039). Each is a register
  key (ADR-0011). **DR-118 adds the engine's own polling to that load**
  (ADR-0003 rule 4).
- `SKIP LOCKED` semantics are Postgres behaviour, which is why the database
  tests run against a real Postgres rather than a substitute — an in-memory
  double would test a store V3 does not have (ADR-0012).
- The stale-job story is split across two mechanisms by design (ADR-0007): a
  scheduled reaper performs the transition, and the read derives the failed
  status from the deadline. A builder who implements only one of the two has
  either a read that writes (breaching AC-62) or a stuck job that reads as
  in-progress (breaching AC-89).
- **Dual bookkeeping is now permanent** (DR-118). The engine keeps its dispatch
  history and we keep our ledger; they will not agree on ordering and are not
  meant to. Named as an accepted cost in the evaluation record (§A con 1) and
  carried by [ADR-0017](ADR-0017-durable-execution-hatchet.md).

## The superseded episode — the Python executor (DR-105 → DR-116 → DR-117)

**DR-105** ruled the engine Python; **DR-116** made it CONDITIONAL pending the
human sitting; **DR-117** superseded it. The three-ruling history is at
[ADR-0001](ADR-0001-language-and-runtime.md) §"The superseded episode".

**This was the narrowest of the five re-instantiations, and the reason is the
finding worth keeping:** nothing in this decision was a language property.
`SKIP LOCKED` is Postgres behaviour; claim-before-call is a transaction-ordering
law; the six clauses, `core.work_item` and the activation stream came through
the replacement and the restoration without a word changing. The rev-1 pass
added exactly one thing — a restatement of AC-04 for a coroutine-based executor
— and **that finding survives as clause 7**, re-expressed for TypeScript,
because the footgun is not Python's: it is *any* runtime where a model call is
an `await` and a transaction is a scope.

**Status: record, not option.**

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-02 — one store, multiple indexes | spec §20 W-3; §16.5 K-22; §17.7 M-26 | the queue lives in the same database; no broker (and **DR-118 keeps it that way** — Postgres-first messaging, RabbitMQ off) |
| AC-04 — no write lock across a model call; durable, resumable, isolated | spec §20 W-4; manifest §13.1 C-3 | claim-and-commit before the call; the activation event stream for resume; **clause 7's boundary** |
| AC-44 — everything executed is recorded | DR-027; manifest §8.3; charter S3 | the ledger row written by the gateway per call |
| AC-13 — raw artifact persisted unconditionally | manifest §8.2a | Seam C's gateway write, outside the transaction |
| **DR-115** — no scaffolded data; every runtime artifact is a real call | PROG-V3-R1 ledger DR-115 (V-RULING, FINAL) | clause 1's real-call clauses — the gateway is the **only** entry point for a model artifact; a failed call yields a typed failure and a ledger row, never a substitute |
| AC-36 / AC-37 — one provider interface; second provider by configuration | DR-029 H1/H2; spec §19 H1/H2 | all calls cross the gateway; provider identity is a configured value — **including vLLM** ([ADR-0018](ADR-0018-deployment-topology.md)) |
| AC-42 — cell shape and honest reporting keys | spec §16.2 K-3…K-11 | model id, `model_version` and provider recorded on the way out |
| AC-50 — rates frozen at run start | DR-052; DR-019 knob 1 | pinned on the immutable run head |
| AC-83 — `POLICY_BLOCKED` never filed as INACTIVE; a cache hit never sets INACTIVE | DR-037; spec §5.1 F-1, §1, §3.13 | the four-member activation state on the event stream |
| AC-72 — propagate re-judges only affected nodes | DR-015; spec §13.1 T-1…T-4 | the `(row, node-set)` work item |
| AC-89 / AC-62 — stale work expires on read; reads do not write | manifest §9.2d; ui §2 surface 14 | reaper writes, read derives (ADR-0007) |
| **DR-089** — WAIT drains at completion; Q61 is a post-completion settlement event | ARCH-V3-R1 ledger DR-089 (Q-20) | clause 5, and the run's typed terminal state |
| **DR-083** — the activation table is re-derived and ratified in-repo, predicate written per row | ARCH-V3-R1 ledger DR-083 (Q-15) | clause 4's `{predicate_ref}` source; `POLICY_BLOCKED` for summarized predicates |
| **DR-093** — correctness/enrichment split proposed once, ratified once; correctness until then | ARCH-V3-R1 ledger DR-093 (Q-24) | clause 6 |
| **DR-118** — durable execution is a dispatcher, not the settlement store | PROG-V3-R1 ledger DR-118 (V-RULING, FINAL) | clause 7(d); the full mapping at [ADR-0017](ADR-0017-durable-execution-hatchet.md) |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.
**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-20 (DR-089)** — a WAIT row is a **re-evaluated predicate that
  must drain**, and a run **may not** reach a terminal state with rows still in
  WAIT. Q61's indefinite watch is a **post-completion settlement event outside
  the run lifecycle**, not an intra-run WAIT row. Clause 5 carries it; the
  settlement watch itself is slice **S12** work.
- **RULED — Q-15 (DR-083)** — the activation table is **re-derived and ratified
  in-repo**, as a first-class per-row contract field with a written predicate
  per row; **no import** of the old research artifact. Clause 4 carries it; the
  71 row contracts are authored at ticket **PRE-05**.
- **RULED — Q-24 (DR-093)** — architecture proposes the full 71-row
  correctness/enrichment split, **V ratifies once**; until then **rows behave as
  correctness and are never skipped**. Clause 6 carries it; the proposal is
  ticket **PRE-06**, the sitting is **VG-02**.

**Still reserved (not a Q-nn):** the queue's **operational values** — poll
interval, batch size, worker count. The plan states none and this ADR invents
none (**AC-76** · DR-039); each is a register key whose value is V's at DR-023,
proposed at `05-register-skeleton.md` and ratified at **VG-02**. **DR-118 adds
one class to that list rather than to this ADR's design**: the engine's retry
bounds, which are register values under DR-020's caps and never engine defaults
([ADR-0017](ADR-0017-durable-execution-hatchet.md)).

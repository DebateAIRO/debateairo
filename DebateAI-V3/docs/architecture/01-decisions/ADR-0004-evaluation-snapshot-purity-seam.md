# ADR-0004 — The evaluation-snapshot purity seam, and the recorded arrow order

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §3.2 Seam A, with §2.6 structural rules 1 and 5, §2.7, §4.1 and §4.3 |
| **Label carried from the plan** | Plan.md §1 preamble: **SEAT-PROPOSAL throughout**. Nothing in the plan is a ruling. |

## Context

Two constraints point in opposite directions and both are ruled.

- **AC-09** — the graph-scoring math contains no model calls, no file or network
  I/O, no clock, no randomness and **no database access**. It is the structural
  precondition of the replay law (DR-029 H3; spec §19 H3; manifest §11).
- **AC-01** — the graph lives in Postgres, and there is no second store
  (DR-024).

So the math may not touch the store the graph lives in. The pack records this as
an unresolved ambiguity (spec AM-11); this ADR is the concrete answer
(Plan.md §6.2 AM-11, **DESIGN-NEUTRALIZED**).

A third constraint decides the *inside* of the seam. **AC-08** requires a total,
deterministic ordering of the ledger **and** a deterministic, recorded arrow
order, because a left fold is not bit-identical under reordering in IEEE-754
(spec §12.5 S-21; manifest §4.2a, §8.2g). Without a recorded order, AC-07's
byte-identical replay (DR-060(b), DR-063 VR-3, charter S1) is unachievable no
matter how pure the core is.

**Vocabulary.** *(architecture term: **evaluation snapshot** — an immutable
in-memory value carrying the node set, the arrow set, the per-parent operator
resolution, the cluster records and a recorded total order over arrows.)* The
term is coined by Plan.md §3.2 and is not pack vocabulary.

## Options considered

### Option A — let the scoring engine read the database directly *(rejected)*

Simplest to write. Rejected outright: it breaches AC-09 in terms, and AC-09 is
DR-034's structural precondition, so the breach propagates into the replay law
(AC-06).

### Option B — an ORM cache or lazy-loading layer under the engine *(rejected)*

Superficially pure — the engine "just reads objects". Rejected because the I/O
still happens, merely at an unpredictable time and in an unrecorded order. That
defeats AC-09 and AC-08 simultaneously, and it makes the purity claim unfalsifiable:
there is no dependency-graph property left to check.

### Option C — materialise → compute → persist, over an immutable evaluation snapshot *(chosen)*

`graph` builds the snapshot (impure); `propagation` consumes it and returns a
per-node result record (pure); `ledger` persists the result and the snapshot's
fingerprint. The boundary is a value, not a connection.

## Decision

**Adopt Seam A: materialise → compute → persist.** Three parts, all binding.

### 1. The seam itself

`graph` materialises an immutable evaluation snapshot; `propagation` is a pure
function over it; `ledger` persists the per-node result record and the
snapshot's fingerprint on `propagation_run` (Plan.md §4.3). The result is a
**per-node record joined to its origin, never a flat `node_id → float` map**
(AC-34 · manifest §4.3, §9.3), and the debug facet uses the same record.

### 2. Purity is a dependency-graph property, enforced twice

- **Structural rule 1 (CI-enforced):** `propagation` may not appear in any
  dependency cycle and may not import anything but `kernel` and
  `published-arithmetic`. AC-09's purity is a graph property, not a habit, and
  the serving engine must still be able to reach the one shared arithmetic
  module (ADR-0012).
- **Structural rule 5 (CI-enforced):** `battery/decision` — organ 4 — may import
  nothing but `kernel`. AC-48's "decision→spawn is a **pure function**"
  (manifest §7.2a–f) is a graph property exactly as AC-09's is, so organ 4 gets
  the same fence organ 1 gets. Its impure caller (the stage runner) materialises
  the two typed signal bundles and the path state and passes them in — Seam A's
  shape applied to organ 4. Without the fence, a decision could read the clock
  for freshness or query the graph for a blocker it should have received; both
  compile, pass every other gate, and silently break `decision_record`'s replay
  identity hash (manifest §7.2f).
- **The lint gate applies to both packages**: `no-impure-import` bans `fs`,
  `net`, `Date`, `Math.random` and database imports in `propagation` (AC-09) and
  in `battery/decision` (AC-48) alike (Plan.md §2.7).

### 3. The arrow ordering rule — stated once, here and in Seam A only

The arrow evaluation order is a **deterministic function of stable non-identity
content**:

```
(target_kind, polarity, kind, source node's materialized path, sibling ordinal)
```

with `created_at_seq` as the final tiebreak, and **`NULLS FIRST` declared
explicitly on `kind`** — support edges carry `kind IS NULL` (ADR-0005), and
leaving NULL placement to the engine default is exactly the
storage-engine-specific ordering behaviour manifest §8.2g refuses to carry
(AC-04 · spec §20 W-4). The derived order is **recorded on `propagation_run`**.

Two properties ride with it:

- **It is deliberately not an order over opaque identities.** Manifest §8.2g
  forbids carrying the random-identifier fall-through as an ordering device, and
  an opaque-id sort is an instance of exactly that.
- **Every recomputation of an already-computed run consumes the recorded order
  and never re-derives it.** This binds the overlay-detachment byte-identity
  check (AC-30 · DR-017; spec §15.3 V-6; charter §7), the replay ceremony
  (AC-07), and the removal-based leverage/fragility recomputations
  (AC-29 · spec §10.2 C-7; manifest §4.2k). Without it, the detachment invariant
  could fail for a reason that is not overlay mutation.

A property test asserts the derived order is **stable across two independent
derivations of the same snapshot**, because the first computation and the
overlay-detachment recomputation both derive it and an environment difference
would otherwise produce two recorded orders for one graph
(`06-test-strategy.md`; Plan.md §8 S2).

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- AC-09 becomes checkable by reading the dependency graph, which is what charter
  A3.4 asks of a house rule.
- AC-30's detachment invariant becomes assertable: recompute every strength with
  the overlay detached and assert byte-identity, with the ordering held constant
  by the recorded order rather than by luck.
- The ledger's total order and the evaluation order are **different mechanisms
  for different purposes** and are kept apart (Plan.md §4.1 rule 5): the ledger's
  order is its own `sequence` allocator (AC-45, ADR-0006); the evaluation order
  is the content-derived rule above.

**Costs and risks:**

- Materialising a snapshot means the whole evaluated subgraph is held in memory
  for the duration of a computation. The plan states no size bound and this ADR
  invents none (AC-76 · DR-039); any bound is a register key (ADR-0011).
- The ordering rule depends on the materialized path (AC-33) and on sibling
  ordinal being banded by child kind (Plan.md §4.2 `node`). A change to either
  changes the recorded order and therefore the fingerprint — which is the
  intended behaviour, but it means those two columns are replay-load-bearing and
  not free to refactor.
- Re-deriving instead of re-consuming the order is a silent defect: it produces
  a plausible answer that fails byte-identity for a reason unrelated to what is
  being tested. The arrow-order stability property test is the only thing that
  catches it.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-09 — pure propagation | DR-029 H3; spec §19 H3; manifest §11 | the snapshot value boundary + structural rule 1 + the lint gate |
| AC-48 — decision→spawn is a pure function | manifest §7.2a–f | structural rule 5 + the same lint gate on `battery/decision` |
| AC-01 / AC-02 — the graph lives in one Postgres store | DR-024; spec §20 W-1, W-3 | materialise from the store; never read it inside the core |
| AC-08 — deterministic, recorded arrow order | spec §12.5 S-21; manifest §4.2a, §8.2g | the content-derived ordering rule, recorded on `propagation_run` |
| AC-04 — no storage-engine-specific ordering tiebreak | spec §20 W-4; manifest §13.1 C-3 | `NULLS FIRST` declared explicitly; no engine default relied on |
| AC-07 — byte-identical numbers | DR-060(b), DR-063 VR-3; charter S1 | the recorded order is consumed, never re-derived |
| AC-30 — overlay never mutates the scored graph | DR-017; spec §15.3 V-6; charter §7 | recomputation under a held-constant recorded order |
| AC-29 — no sensitivity feedback | spec §10.2 C-7; manifest §4.2k | leverage/fragility recomputations reuse the recorded order; outputs never re-enter |
| AC-34 — per-node record, never a flat map | manifest §4.3, §9.3 | `node_strength_record`, one row per node per propagation run |
| AC-14 — one scoring engine | DR-030 J1; spec §18 O-1 | one consumer of the snapshot; see ADR-0012 for the ceremony boundary |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.

The seam is a carrier; four questions decided what the snapshot *contains* and
what the core *does* with it. **All four are now ruled**, so Plan.md §8 rule
(iv)'s carriers-only restriction is lifted for S3 (**DR-068..DR-097**, closure
at DR-100).

- **RULED — Q-05 (DR-072)** — lifting composition order is **folder-lift first,
  then `OD-02`'s judged-ancestor lift**, and **both-ends markers are emitted in
  both cases**. Verdict-affecting per D2's measured 0.97 → 0.5 shift, so the
  order is not a detail.
- **RULED — Q-06 (DR-073)** — provenance-cluster collapse applies to **both
  polarities** (support **and** attack). A claim node's cluster key derives from
  the provenance of its evidence and the producing run/model-family; **a node
  with no resolvable key clusters alone** — which is how a non-evidence sibling
  claim is handled, and it is a rule, not a fallback.
- **RULED — Q-07 (DR-074)** — the deployment-level operator is **MANDATORY,
  never blank**: a required register row, no undeclared/withhold state at the
  deployment level, parent- and run-level overrides optional above it. The
  declare-once/withhold runtime machinery is **dropped from the design**
  (ADR-0011 clause 8).
- **RULED — Q-08 (DR-075, amended by DR-076)** — a `pending` node **is** an
  unjudged interior node under `OD-02` (no arrow to its parent yet; children
  lift to the nearest judged ancestor; skip-markers at both ends), and
  **placeholder arrows are live, real arrow endpoints**. Serving a placeholder
  as a claim stays forbidden regardless (manifest §6.2 item 10, AC-86). DR-076
  adds V's amendment: the pending node is structurally connected to its parent
  **from the moment it spawns**, and its lifecycle must be **observable live** —
  an observability requirement on the event vocabulary (ADR-0008), not on this
  seam's arithmetic.

The ordering rule and the snapshot shape stood under every answer, and they
stand under these; what the rulings fix is the **arithmetic performed over
them** — which is now buildable rather than deferred.

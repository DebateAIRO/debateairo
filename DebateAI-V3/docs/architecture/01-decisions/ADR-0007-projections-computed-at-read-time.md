# ADR-0007 — Frozen artifacts versus projections computed at read time

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §3.2 Seam D, with §4.4 (clauses 2, 2a, 3), §6.6 UI-3, UI-9, UI-13 |
| **Label carried from the plan** | Plan.md §1 preamble: **SEAT-PROPOSAL throughout**. |

## Context

Two obligations pull in opposite directions on the same payload.

- **Freeze it.** AC-06 permanently refuses to serve a number V3 cannot recompute
  from its **own frozen records** (DR-034; spec §12.5 S-17). AC-07 makes the
  serve decision replay **as stored data** — the conformance verdict is an input
  artifact, **never regenerated** (DR-060(b), DR-063 VR-3; charter S1).
- **Recompute it.** AC-64's freshness invariant binds **every read of, or
  subscription to, an answer that occurs after a wake-up** to expose that
  answer's current staleness state (ui §1.3 E4 · DR-015). A state that changed
  after serving must be visible on the next read.

A third pair sharpens it into a contradiction the pack itself carries:
**AC-89** requires stale active jobs to transition to failed **on every read**
(manifest §9.2d), while **AC-62** rules that reads carry **no write side
effects** (ui §2 surface 14). Plan.md §6.6 UI-13 records this as a genuine
cross-artifact contradiction, identified at rework round 1.

**Vocabulary.** A **projection** is a typed value the reader receives — a badge,
a mark, a provenance summary, a per-node restatement. The interface contract
defines projections by contents but never by cardinality or lifecycle
(Plan.md §6.6 UI-3), so architecture owes the lifecycle rule.

## Options considered

### Option A — freeze everything at serve time, badges included *(rejected)*

Simple and fully replayable. Rejected because AC-64 then fails by construction:
an answer whose staleness state changed after serving would keep serving the
stale badge, which DR-015's "never silently" forbids.

### Option B — recompute everything at read time *(rejected)*

Always current. Rejected because AC-06 and AC-07 require frozen records — and
specifically because DR-060(b) makes the conformance verdict an **input
artifact**. A recomputed verdict is a regenerated verdict, and the ceremony
would then replay a different serve decision than the one served.

### Option C — split the two by kind *(chosen)*

`serve` produces two distinguishable things, and the distinction is structural
rather than a naming convention.

## Decision

**Adopt Seam D.** `serve` produces exactly two kinds of thing:

- **Frozen artifacts** — the fact bundle, the conformance record, the served
  numbers and their provenance. Persisted, hashed, replay inputs.
- **Projections** — badges, marks, provenance summaries, per-node restatements.
  **Computed at read time from stored typed fields**, and delivered **inline on
  the Answer and Node resources in one coherent read** (Plan.md §5.3, §6.6 UI-3).

Freezing the facts is what AC-06 requires; computing the projections at read
time is what AC-64 requires. This is the concrete answer to the interface
contract's ambiguity 3.

Four consequences of the split are themselves decisions:

### 1. Status is derived, never asserted

AC-88 (manifest §9.2c) is applied wherever a state could have been stored as a
mutable column:

- the run's current envelope consumption, envelope state and phase are derived
  from the latest `run_progress_event` (Plan.md §4.1a);
- a battery row's current activation state is derived from the latest
  `run_row_activation_event`, and `last_evaluated_at_seq` is **derived** as that
  event's sequence rather than stored;
- a served number's current status is derived from the latest
  `served_number_event`, and an answer version with at least one `EVICTED` event
  projects as components-only + `DEFECT` (Plan.md §4.4 clause 2a; ADR-0014).

**An empty event stream is not a legal state**: it is a typed error on read,
never a default — which is why the run's initial events are written in the same
transaction as the run's frozen head (Plan.md §4.1a). A default there would be
the silent assumption the pack forbids everywhere else.

### 2. UI-13's split obligation — the reaper writes, the read derives

The **state transition** for a stale job is performed by a **scheduled reaper**
(the same mechanism already used for stale-worker reaping); the **read derives**
the failed status from the job's deadline **without writing**. That satisfies
AC-88 and AC-62 simultaneously and preserves AC-89's actual guarantee — a stuck
job can never masquerade as work-in-progress on any read — because the
derivation is evaluated on every read even when the reaper has not yet run.
Owner: context 7 (`serve`).

### 3. Version selection on reads

`GET /v1/answers/{id}` with no `version` parameter returns the **latest
`answer_version` with its current derived projection**; `?version=` returns that
version's artifacts **as sealed**, and the replay ceremony always reads the
sealed form (Plan.md §4.4 clause 2a, §5.3). So the historical answer replays
byte-identically while the live read shows the degradation.

### 4. One authoritative store per fact, two payload appearances

A fact is stored once and projected, never stored twice. The worked case is the
condition mark (Plan.md §4.4, §6.6 UI-9): `condition_mark_node` is the **single
authoritative store of the affected set**, a join table populated at write time
from the ledger rows that caused the mark, with **no `affected_node_ids` array
on the mark row**. The API's affected-node list is a **read-time projection** of
that join. Two writable representations of one fact is the defect UI-9 was
corrected for (AC-85 · charter A3.1), and an answer-scoped row with no affected
set would project to the empty set for every node — serving honesty surface 8 on
the answer and absent on exactly the nodes it describes.

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- AC-64 holds by construction rather than by a re-projection step: a staleness
  state that changed after serving is visible on the next read (Plan.md §6.6
  UI-3).
- AC-07 holds because nothing in the projection path writes to a sealed
  artifact. The replay ceremony reads the conformance record **without** the
  suppression overlay, because the overlay post-dates the serve decision it is
  replaying (ADR-0014).
- AC-62 holds on every read surface, including the fleet-status surface whose
  stale-worker reaping side effect moves to a scheduled job (Plan.md §5.3).

**Costs and risks:**

- Read cost rises: every answer read computes projections rather than selecting
  a stored blob. The plan states no latency budget and this ADR invents none
  (AC-76 · DR-039).
- **Two reads of the same answer can differ** — legitimately, when a state
  changed between them. Any test that asserts read-stability without pinning
  `?version=` is asserting the wrong thing.
- The derived-status rule has a hard precondition: **the event stream must be
  total from creation onward**. The run-immutability fixture pair
  (`06-test-strategy.md`) exists precisely to prove there is no empty-stream
  window.
- E4's **subscription** limb is not discharged by this ADR. Seam D covers the
  read path; the stream owes the `staleness trigger fired` honesty event, which
  is ADR-0008's.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-06 / AC-07 — replay from frozen records; the verdict is an input artifact | DR-034; DR-060(b), DR-063 VR-3; charter S1 | the frozen-artifact half of the split; sealed version reads |
| AC-64 — E4 freshness on every read or subscription | ui §1.3 E4 (DR-015) | the projection half, computed at read time |
| AC-62 — reads carry no write side effects | ui §2 surfaces 1 and 14 | the reaper writes; the read derives |
| AC-88 — status is derived, never asserted | manifest §9.2c | derived state from the latest event, everywhere a mutable column was tempting |
| AC-89 — stale work expires on read | manifest §9.2d | derivation evaluated on every read regardless of reaper timing |
| AC-72 — badges never silent | DR-015; spec §13.1 T-1…T-4, T-10 | current staleness state attached to every answer read |
| AC-56 — projections on the wire, bundle behind a handle | DR-054; spec §12.6 S-22…S-24 | only projections cross the wire by default (ADR-0013) |
| AC-63 — typed state travels as typed projection fields | ui §1.1 clauses 2 and 4 | projections are typed fields, never parsed prose |
| AC-85 — one behaviour, one place | charter A3.1, A3.3 | one authoritative store per fact; the second appearance is a projection |
| AC-12 — replay eviction serves the rest with a `DEFECT` badge | DR-059; spec §12.1c S-9e | the derived serve state of clause 3 (detail in ADR-0014) |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.

**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-11 (DR-079)** — the non-node senses of "load-bearing" **project
  from the charter's node definition**: a sentence is load-bearing iff it
  asserts a fact drawn from a load-bearing node or states a served number; a
  claim iff its node is; an unknown iff removing it would change the verdict or
  band. The carriers-only restriction is **lifted** — projections may now derive
  behaviour from the flag (ADR-0014 clause 1; slice S5).
- **RULED — Q-13 (DR-081)** — `OD-11`'s layer-2 per-side provenance detail
  activates behind **a register row V flips**, with **layer 1 as the default**
  and **both states testable before the flip** — nothing ships dark. This is
  exactly the register-gated branch this ADR proposed (ADR-0011 clause 6), with
  the named condition DR-066(2)'s sequenced-adoption rule required; the trigger
  value is V's at DR-023 (**VG-02**).
- **AM-6** — *no Q-nn: **DESIGN-NEUTRALIZED**, so it is not one of 08's 28
  questions* — (Plan.md §6.2) needs no answer for this ADR: the wire carries
  one uniform `condition_marks[]` projection, so every member has a rendering
  regardless of which surface it visually lands on; which strip or badge it
  appears in is delegated presentation (DR-064).

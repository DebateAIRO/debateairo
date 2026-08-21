# ADR-0006 — Ledger ordering and the hash triple

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §4.3, with §4.1 (standing rules 1, 4, 5), §4.1a and §3.2 Seam C |
| **Label carried from the plan** | Plan.md §1 preamble: **SEAT-PROPOSAL throughout**. |

## Context

The **execution ledger** is the record of everything V3 executed — attempts,
retries, failures, could-not-dos, abstentions, condition marks and typed skips,
in two tiers: raw tapes internal, digest user-visible (AC-44 · DR-027; manifest
§8.3; charter S3). It is the substrate the replay law reads (AC-06 · DR-034) and
the thing SERVE reads (AC-16 · DR-030 J3).

Two of its properties need a decision rather than an implementation:

1. **Ordering.** AC-45 requires append-only storage with a **total order**, runs
   carrying a monotonic sequence assigned under a write lock, nothing ever
   rewritten — and states expressly that the random-identifier fall-through
   **does not carry** (manifest §8.2g). AC-08 requires total, deterministic
   ordering. AC-04 forbids any storage-engine-specific ordering tiebreak
   (spec §20 W-4; manifest §13.1 C-3).
2. **Hashing.** AC-10 requires contract-hash discipline: the contract hash
   freezes identity / rubric / prompt / schema / reducer versions and
   invalidates every cached result; it is **excluded from the input hash** and
   **included in cache identity**; history is never overwritten (manifest
   §8.2c–e).

The failure this ADR exists to prevent is a quiet one: an ordering that "works"
in test and reorders under load, or a single hash column that cannot tell a
superseded artifact from a colliding one.

## Options considered

### For the ledger's total order

**Option A — timestamps.** Rejected: same-tick rows are unorderable, and any
resolution of the tie falls back to storage-engine behaviour, which AC-04 refuses
in terms.

**Option B — opaque identifiers with a random fall-through.** Rejected: manifest
§8.2g names it and says it does not carry. It is also the shape ADR-0004 refuses
for arrow ordering, for the same reason.

**Option C — a dedicated `sequence bigint` allocator taken under a write lock.**
*(chosen)* Same-tick rows are orderable because the order is allocated, not
observed.

### For hashing

**Option D — one `hash` column per row.** Rejected: it cannot express AC-10's
exclusion/inclusion asymmetry, so a superseded artifact would collide with the
artifact that superseded it instead of being recognised as superseded.

**Option E — named, separate hash columns.** *(chosen)*

## Decision

### 1. The ledger's total order is an allocated sequence

`ledger_entry` is append-only with `sequence bigint` from a **dedicated
allocator taken under a write lock**, so same-tick rows are orderable. **The
total order is the sequence — never a timestamp and never a random tiebreak**
(AC-08, AC-45).

**This is a different mechanism from ADR-0004's arrow order, deliberately.**
Plan.md §4.1 standing rule 5 keeps them apart: identity columns are opaque and
never reused; evaluation ordering is the content-derived rule recorded on
`propagation_run`; the ledger's total order is its own allocator. Two orders,
two purposes, no shared mechanism.

### 2. Append-only is enforced by grants and triggers, not by convention

Plan.md §4.1 standing rule 1: every mutable-looking fact is either append-only
or versioned with the old row preserved; **nothing is deleted** (AC-05, AC-45;
manifest §8.2e). Append-only tables have `UPDATE`/`DELETE` **revoked** and a
trigger that raises.

Applied to the run entity (Plan.md §4.1a), where the reasoning is recorded
explicitly: `UPDATE` **and** `DELETE` are both revoked on the `run` frozen head,
and likewise on `run_progress_event`, `run_row_activation` and
`run_row_activation_event`. Revoking `UPDATE` alone would leave a `DELETE` free
to erase a served answer's pinned `register_version`, `stranger_sample_rate` and
`battery_version`, making that answer unreplayable with no trace — because the
ledger records what executed, not what the run row pinned. Without the
revocations, "frozen at run start" is enforced by nothing: a mid-run update to
the stranger sample rate moves conformance coverage inside a live run (AC-50 ·
DR-052, DR-019 knob 1), and a mid-run `register_version` change makes replay read
a register the run did not use, breaking AC-06 silently.

`ledger_entry` and `raw_artifact` are **partitioned by run range, and no
partition is ever dropped** (AC-05).

### 3. The hash triple, plus the fingerprints, each naming what it hashes

Plan.md §4.1 standing rule 4: **every hash column names what it hashes and is
immutable once written** (AC-10). The named set:

| Column | On | What it carries |
|---|---|---|
| `input_hash` | `ledger_entry`, `raw_artifact` | the call's inputs — **excludes** the contract hash (AC-10) |
| `contract_hash` | `ledger_entry`, `raw_artifact` | identity/rubric/prompt/schema/reducer versions — **included in cache identity** (AC-10) |
| `content_hash` | pinned memory pulls, the fact bundle | the frozen content addressed (AC-70, AC-06) |
| `packet_fingerprint` | critique packets | the blinded packet's identity (Plan.md §3.1 context 5) |
| graph fingerprint | `propagation_run` | input-order-independent; changes when any τ changes; differs between two operator selections (Plan.md §4.3) |

`input_hash` and `contract_hash` are **separate columns on `raw_artifact`** so a
superseded artifact is recognised as superseded rather than colliding; cache
identity includes the contract hash and yields a **new row**, so history is never
overwritten (AC-10).

### 4. One replay identity hash carries declared exclusions

`decision_record` carries a **replay identity hash excluding the idempotency
key, the spawn count and the classification fields** (AC-48 · manifest §7.2f).
The exclusions are part of the hash's definition, not an implementation
convenience; ADR-0004's structural rule 5 exists so that nothing outside the
declared inputs can reach the decision and silently break it.

### 5. What is written where, and when

Seam C binds the write ordering at the provider boundary: the gateway persists
the raw artifact **unconditionally, parseable or not** (AC-13 · manifest §8.2a)
and writes the ledger row (AC-44) — **outside any open write transaction**,
because AC-04 forbids holding a write lock across a model call. See ADR-0009.

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- AC-47's four reconstruction paths (rebuild-from-artifacts, stored-result
  verbatim, resume-partial, completeness gate — manifest §8.2f) are all readable
  off one totally ordered, append-only stream, and each can refuse to fabricate a
  score where nothing was persisted.
- The completeness gate's failure condition stays distinguishable from AC-13's
  unconditionally persisted unparseable artifact, because the artifact row exists
  either way and its parse status is a column (AC-11's predicate; the fixture
  pair is `06-test-strategy.md`'s).
- A cache hit produces a **new row**, so the ledger never has to be edited to
  record one — which is also why a cache hit may never set a battery row
  `INACTIVE` (AC-83 · spec §1).

**Costs and risks:**

- The sequence allocator is a serialization point. The plan states no throughput
  target and this ADR invents none (AC-76 · DR-039); any bound is a register key
  (ADR-0011).
- Revoked `UPDATE`/`DELETE` grants mean operational repair of a bad row is not
  possible in place. That is the intended reading of AC-05 and AC-45 — the
  correction is a new row, not an edit — but it must be understood before
  launch rather than discovered during an incident.
- Partitions accumulate without bound because none is ever dropped (AC-05).
  Retirement is archival, not deletion (AC-05 · DR-016).

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-45 — append-only with a total order | manifest §8.2g | the `sequence` allocator under a write lock; revoked grants + triggers |
| AC-08 — total, deterministic ordering | spec §12.5 S-21; manifest §4.2a, §8.2g | the sequence as the only ledger order |
| AC-04 — no storage-engine-specific tiebreak; no write lock across a model call | spec §20 W-4; manifest §13.1 C-3 | allocated order; Seam C writes outside the open transaction |
| AC-05 — nothing is ever deleted | spec §13.2 T-7 (DR-016) | `DELETE` revoked; no partition dropped; retirement is archival |
| AC-10 — contract-hash discipline | manifest §8.2c–e | separate named hash columns; cache identity yields a new row |
| AC-44 — everything executed is recorded, two tiers | DR-027; manifest §8.3; charter S3 | `ledger_entry` with typed outcome, actor, timings, digest text |
| AC-46 — two stamps on every action row | DR-045; spec §8.1 A-1 | `subject_item_id` and `stance_at_action` as columns |
| AC-13 — the raw artifact persisted unconditionally | manifest §8.2a | `raw_artifact` written by the gateway regardless of parseability |
| AC-47 — four reconstruction paths | manifest §8.2f | one ordered append-only stream all four read |
| AC-48 — replay identity hash with declared exclusions | manifest §7.2a–f | `decision_record`'s hash definition |
| AC-50 — the stranger sample rate freezes at run start | DR-052; DR-019 knob 1 | pinned on the immutable run head, with `UPDATE`/`DELETE` revoked |
| AC-06 — replay from frozen records | DR-034; spec §12.5 S-17; manifest §8.3 | `register_version` and `battery_version` pinned per run and unerasable |
| AC-85 — every caught failure typed and written to the ledger | charter A3.1, A3.3, A3.6 | typed outcome vocabulary on every entry |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.

**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-09 (DR-077)** — a judge's earned weight **multiplies the served
  arithmetic**, consumed in the **selection** of which judgement becomes the
  reduced score, under a declared rule — **never by averaging**. Dispersion is
  measured and served **separately, never blended away**. The entailed half this
  ADR already carried is unchanged: any input that moved a served number —
  including the judge weight in force and its version — is a **frozen replay
  input**, pinned on the reduced judgement and on the number's provenance
  (`judge_weight_version`). P-D5's property test now has a real assertion
  target.
- **RULED — Q-20 (DR-089)** — **WAIT drains**: at run completion nothing
  remains in a waiting state, and a run does **not** reach a terminal state with
  rows still in WAIT. Q61's indefinite watch persists **across runs, outside any
  run**, as a post-completion settlement event whose outcome is saved to the
  execution ledger (DR-027). The append-only activation event stream remains the
  carrier; the runner's evaluation policy is now recorded rather than deferred
  (ADR-0009 clause 5).

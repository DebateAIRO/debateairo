# ADR-0008 — Event payload grade, and the stream's E4 obligation

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §5.5, with §6.5 C6 and §6.6 UI-6 |
| **Label carried from the plan** | Plan.md §1 preamble: **SEAT-PROPOSAL throughout**. |

## Context

V3 emits events to subscribed clients over six declared families — run
lifecycle, node lifecycle, graph, serve-composition, honesty, ledger (ui §1.3).
Three constraints decide what an event may **carry**, and one decides what the
stream **owes**:

- **AC-56** splits the payload into default projections and an authorized bundle
  reachable through an inspection/replay handle (DR-054; spec §12.6 S-22…S-24).
- **AC-61 / E1** requires every emitted event to have a **declared consumer**;
  both directions of drift are defects (DR-047 clause 4; ui §1.3 E1, §1.4 L6).
- **AC-60** requires one transport front door (ui §1.4 L5).
- **AC-64** binds "every read of, **or subscription to**, an answer that occurs
  after a wake-up" to expose that answer's current staleness state
  (ui §1.3 E4 · DR-015).

The interface contract records that the event stream's relationship to the
projection boundary is unstated (Plan.md §6.6 UI-6) and that the kept interface
satisfies neither push nor pull (§6.5 C6). Both are dispositioned
**DESIGN-NEUTRALIZED**, and this ADR is the design that neutralizes them.

## Options considered

### Option A — events carry bundle-grade material *(rejected)*

Attractive because a client could then avoid a follow-up fetch. Rejected on the
authorization argument: **AC-56's gate cannot be re-evaluated per frame on a
long-lived subscription**. A subscription opened under one authorization
outlives the check; shipping bundle-grade material over it turns one evaluated
gate into an unbounded series of unevaluated ones.

### Option B — a separate streaming service or address *(rejected)*

Rejected by AC-60 in terms: SSR and the browser read the same contract through
the same front door, with no second proxy.

### Option C — no stream; rely on reads alone *(rejected)*

Correctness would in fact be satisfied — Seam D discharges AC-64's correctness
obligation on the read path (ADR-0007). Rejected anyway, because a client
holding an open subscription and issuing no further reads — the tab-left-open
case the interface contract analyses explicitly (ui cell 4(a)) — is a
**conforming client that is never told the answer went STALE**. That breaches
DR-015's "never silently" on a path this architecture itself ships.

### Option D — projection-grade payloads or bare signals only, over the one front door, with a mandatory staleness event *(chosen)*

## Decision

**Server-sent events at `GET /v1/runs/{id}/events`, over the same front door
(AC-60).** Four laws:

### E1 — declared consumer per name

The event vocabulary lives in `packages/contract` with a **declared consumer per
name**, checked by `tools/orphan-audit` (AC-61, AC-77; ADR-0010). An event with
no consumer is an orphan and fails the audit, in the same pass as a served field
with no consumer.

### E2 — one name per meaning, declared once

The name is declared once in the contract package. V2's
`synthesis_completed` / `synthesis_complete` mismatch is caught by a
**contract-level test, not a runtime hope** (ui §1.4).

### Payload grade — projection-grade or bare signal, never bundle-grade

Events carry **projection-grade payloads or bare signals only**. The worked
case: the "fact bundle frozen" event carries the bundle's **identity and content
hash, not its contents** (ui ambiguity 6). A client that wants the bundle
fetches it through the authorized handle, where AC-56's gate is evaluated once
per request (ADR-0013).

*(Interface law E3 is a CANDIDATE clause and non-binding; this design is
**strictly narrower** than E3 would require, so a later ruling can only tighten
it — Plan.md §6.6 UI-6.)*

### E4 — both limbs, because AC-64 names both

1. **Correctness is discharged on the read path**: every answer read attaches
   the answer's current staleness state, computed at read time (Seam D,
   ADR-0007). The *choice* of transport is therefore not load-bearing for
   correctness.
2. **Where a stream exists it MUST additionally carry the `staleness trigger
   fired` honesty event for every subscribed answer**, with a declared consumer
   per E1.

With both limbs, **push, pull and pull-plus-ping all conform**, which is what
the interface's delegated cell 4(a) needs (ui §4 row 4) and what closes C6
without ruling the transport question that belongs to the mockup review.

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- The authorization surface stays finite: one gate per request, never one per
  frame.
- The orphan audit covers events and fields in the same mechanism, so E1 is not
  a second, weaker rule living somewhere else (AC-85 · charter A3.1).
- The transport question stays genuinely open for the mockup review: any of
  push, pull or pull-plus-ping conforms, so no presentation decision is
  pre-empted (DR-064).

**Costs and risks:**

- A subscribed client that wants bundle-grade material must make a second,
  authorized request. That is the intended cost of AC-56 and is not
  negotiable per-screen.
- The mandatory staleness event is an obligation on **every** stream
  implementation, not an optimisation. A stream shipped without it satisfies
  AC-64's correctness limb and still breaches DR-015 for the tab-left-open
  client — the exact failure Option C was rejected for.
- `debateTerminal` dies with the interface death list regardless of the
  transport chosen (ui §3.2; Plan.md §6.5 C6).

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-60 — one transport | ui §1.4 L5 (DR-048) | the stream is served by the same front door, no second address |
| AC-56 — projections on the wire; bundle behind a handle | DR-054; spec §12.6 S-22…S-24 | the payload-grade law; identity-and-hash instead of contents |
| AC-61 / E1 — no emitted event without a declared consumer | DR-047 clause 4; ui §1.3 E1, §1.4 L6 | the event registry in `packages/contract`, walked by the orphan audit |
| AC-64 — E4 freshness on read **or subscription** | ui §1.3 E4 (DR-015) | both limbs: read-path derivation plus the mandatory staleness event |
| AC-72 — a fired trigger is never silent | DR-015; spec §13.1 T-1…T-4, T-10 | the `staleness trigger fired` honesty event |
| AC-77 — no orphaned modules | DR-047 clause 4; charter §5, A4.2 | an event with no consumer fails the same blocking audit |
| AC-63 — typed state travels as typed projection fields | ui §1.1 clauses 2 and 4 | projection-grade payloads only; the client never parses prose |
| AC-85 — one behaviour, one place | charter A3.1, A3.6 | one event name per meaning, declared once |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.

**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **The transport preference itself** is a delegated presentation cell (ui §4
  row 4, cell 4(a); DR-064). This ADR makes all three conforming and chooses
  none.
- **RULED — Q-26 (DR-095)** — "kept component" = **kept SURFACE, rebuilt
  insides**. It decides which components consume these events, not what the
  events carry, so nothing in this ADR moves.
- **RULED — Q-03 (DR-070)** — the asker is **the requesting user/person**, with
  no separate authenticated-principal/session model for this stage. A
  subscription's authorization resolves against the same subject as a read
  (ADR-0013 clause 5), so the simplification applies identically to both paths —
  which is what this ADR always required of the answer.

## Ruling folded in — DR-076's node-lifecycle events

**DR-076** (V's amendment to Q-08) adds a requirement this ADR's vocabulary must
carry: a pending node's **lifecycle — generating → being judged → scored — must
be observable live in the UI, not only after settling**, and the node is
structurally connected to its parent from the moment it spawns.

Three things follow, and none of them is a new law:

1. **It is an observability/streaming requirement, not an arithmetic one.** It
   does not change what contributes to a served score (DR-076 says so in terms).
2. **The new events live in the node-lifecycle family** — one of the six
   declared families (ui §1.3) — and obey this ADR's rules without exception:
   **projection-grade or bare signals, never bundle-grade** (the authorization
   argument of Option A applies unchanged to a long-lived subscription);
   **E1** — no event without a declared consumer; **E2** — one name per meaning.
3. **The exact event names are not chosen here.** DR-076 explicitly defers them
   to the C4 revision of `04-api-contract.md` (ticket **PRE-02**) rather than
   having them invented at ruling time; the UI data-layer rebuild (S14) and the
   SPLIT loop (S7) are the consuming slices.

> **ACCEPTED ARCHITECTURE.** VS-1 is ratified (**DR-098**), amendments
> A-01…A-13 are accepted (**DR-099**), and **ARCHITECTURE SATISFIED** is emitted
> under V's authority (**DR-100**) — the ARCH-V3-R1 architecture loop is CLOSED.
> The provisional-status banner that headed this file is removed under
> DR-100's follow-through.
> **All 28 questions in `08-open-questions-for-V.md` are RULED**
> (DR-068…DR-097), so the three this document carried — the clean-room fence,
> the band-ceiling label, the asker's identity — are answered below at the
> places they were raised. **What did not change: this document still states no
> number of its own** (AC-76).

# 00 — V3 architecture overview

Mission ARCH-V3-R1, step C4 · lane 1 · 2026-08-05 · seat: Opus 5 artifact author
(session `c4-lane-1`) · **rulings folded in 2026-08-06 under PROG-V3-R1 ticket
PRE-03** (DR-100 follow-through; DR-102). Source:
`docs/missions/2026-08-05-v3-architecture/architecture/Plan.md`
rev 3 — §1 (AC-01…AC-92), §2.6, §3, §7 row 1 — plus the decisions ledger
DR-068…DR-101.

---

## 0. How to read this document

**What it is.** The system in one read: what V3 is, what it is made of, how the
pieces are bounded, and how a served number gets from a question to a reader.
It is written to the **stranger law** (quality charter clause 2, restated in the
C4 authoring contract): a reader with no project history must be able to close
this document and correctly restate what the engine is and how a number gets
served.

**What it is not.** No schema, no endpoint list, no rationale-by-anecdote
(Plan.md §7 row 1, out-of-scope column). Table shapes live in
`02-data-model.md`; the resource surface lives in `04-api-contract.md`; the
reasoned choices live in `01-decisions/`; the per-constraint index lives in
`09-traceability.md`.

**Status.** Everything here that originates in Plan.md §2 (the stack) is
**SEAT-PROPOSAL** and is V's to ratify (DR-005 as narrowed by DR-024).
Everything that originates in Plan.md §1 is a **constraint the pack already
imposes** and is not this seat's to move. **Everything marked `RULED — DR-nnn`
is V's ruling** and is neither. Where the three are distinguishable in a
sentence below, the sentence says which it is.

**Authority chain, in order.** The decisions ledger wins over a founding
document; a founding document wins over a research digest (spec §2 item 1;
manifest §2.2 item 1). The ledger is now two files read as one continuous
sequence: `docs/founding/decisions-ledger.md` (DR-001…DR-067) and
`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md`
(**DR-068…DR-101**). Every normative sentence below cites the AC row it carries
and/or the DR or founding-doc section that imposes it; an uncited normative
sentence in this file is a defect, on the same rule Plan.md applies to itself.

**Vocabulary.** `docs/founding/GLOSSARY.md`. Terms coined by the architecture
are marked *(architecture term)* at first use and are defined in the section
that owns them.

**No numbers.** Every constant named here is quoted from the pack with its
citation or named as a register key whose value is V's at DR-023 (AC-74,
AC-76). This document states no threshold of its own.

---

## 1. What V3 is, for a reader with no project history

### 1.1 The shape of the thing

V3 is a **reasoning engine**. A person asks a question; the engine researches
it, breaks it into claims, has each claim judged, lets a different model attack
the result, scores the whole structure arithmetically, and serves an answer that
carries its own honesty record. It is a greenfield rebuild in a new repository
(`DebateAI-V3`, AC-82; DR-031 knob 1, DR-065) of an earlier prototype whose
production data is gone and is not recovered (AC-03; DR-024).

An **answer** is not a paragraph with a number attached. It is an **argument
graph**: claims (**nodes**) connected by **typed arrows** — this supports that,
this attacks that, each arrow carrying a strength — plus a verdict computed from
the graph by a fixed formula, plus the record of everything that was executed to
produce it. The graph is the answer's substance; the prose is a rendering of it
(AC-15, AC-63).

### 1.2 The five laws a stranger needs before anything else

Everything in this architecture is downstream of five rules the pack already
ruled. They are not preferences; they are what the shape of the system is for.

1. **The replay law.** V3 permanently refuses to serve a number it cannot
   recompute from its own frozen records, and **no model may sit in the replay
   path** (AC-06; DR-034). A number that fails replay is thrown out of the answer
   with a typed mark rather than being served unbacked (AC-12; DR-059).
2. **Purity of the arithmetic.** The code that scores the graph makes no model
   calls and performs no file, network, clock, randomness or database access
   (AC-09; DR-029 H3). This is not tidiness: it is the structural precondition
   that makes law 1 achievable.
3. **One of each.** One scoring engine, one graph, one serving truth (AC-14,
   AC-15, AC-16; DR-030 J1/J2/J3), and one place where any behaviour is decided
   (AC-85; charter A3.1). A second implementation of one behaviour is a defect,
   not a convenience.
4. **Provenance is not optional.** Every number arrives with its origin and its
   replay handle **or it does not arrive** (AC-63; ui §1.1). A per-node record
   joins the number to where it came from; a flat map from node to float is
   forbidden (AC-34).
5. **Nothing is deleted, and nothing executed goes unrecorded.** Retirement is
   archival (AC-05; DR-016); every attempt, retry, failure, abstention and typed
   skip is written to an append-only execution ledger with a total order
   (AC-44, AC-45; DR-027), and **no served sentence may imply a check the ledger
   says did not run** (AC-44).

### 1.3 The honesty obligations that shape the serve path

A stranger reading a V3 answer is owed more than the verdict. The pack fixes
these, and the architecture carries them as typed fields rather than as prose:

- The **verdict model has two independent axes** — a verdict state
  (SUPPORTED / CONTESTED / UNSUPPORTED) and a separate confidence band. An
  abstention is neither; it is a typed non-answer, never a mid-range number
  (AC-66; DR-066(3), GLOSSARY "Verdict model", charter VR-2).
- Every claim carries its **way of knowing** — `LOOKED_UP | RAN | REASONING` —
  and each band must **name its way-of-knowing ceiling** (AC-24; charter VR-2).
  A load-bearing basis that is reasoning-only is downgraded to a hypothesis plus
  a research plan rather than annotated (AC-24 carrier (i); DR-044 Q51).
  **`RULED — DR-082 / DR-086`:** the ceiling is a **second, independent gate**
  beside the three blocking ones, and when it fires it **caps the confidence
  band** — the answer serves, cannot reach the top band, and wears its ceiling
  label visibly. It **never silently blocks**. The label vocabulary and its cut
  points are **register rows V ratifies** (`05-register-skeleton.md` §5.4).
- **What is load-bearing, beyond a node · `RULED — DR-079`:** the non-node senses
  project from the charter's node definition — a **sentence** is load-bearing iff
  it asserts a fact drawn from a load-bearing node or states a served number; a
  **claim** iff its node is; an **unknown** iff removing it would change the
  verdict or the band. Conformance sampling, memory re-verification and the
  ignorance ledger all read that one predicate.
- **Nine honesty surfaces are canonical**, each with exactly one requirement,
  one interface row and one charter acceptance hook (AC-58; DR-048).
- A withheld verdict must say **why in prose and what would unlock it**
  (AC-91; DR-062 OD-20).
- A missing or malformed input **proves nothing** and is read at its honest
  zero-information value; a verdict with no usable basis degrades to a typed
  `unavailable`, never to a number (AC-90).
- Composition is four machine-ordered steps, not a render: the machine assembles
  the facts, one model writes the text, a **second model judges text against
  facts**, and the machine enforces that verdict (AC-51; DR-044). Pure render
  was rejected by ruling.

### 1.4 What V3 structurally cannot do

Stated because a stranger's first question is usually "what stops it going
wrong?". Each is a build-time or write-time impossibility, not a review
convention:

| It cannot | Because |
|---|---|
| Give an unjudged claim a default score | AC-21 (M1); no default τ at any layer, and an unjudged interior node is transparent with markers at both ends (DR-028, DR-062 OD-02) |
| Serve a number without its origin | AC-63, AC-34 — the wire type has no bare-scalar form (§5.4 labeled number) |
| Score the graph with a model in the loop | AC-09 — `propagation` may import nothing but `kernel` and `published-arithmetic`, CI-enforced (§2.6 structural rule 1) |
| Reach a fixed point by approximating a cycle | AC-20 — construction refuses the cycle-closing edge, the write is rejected, and compute raises a typed error (DR-056(b), DR-042) |
| Feed sensitivity results back into scores | AC-29 — that loop has no declared fixed point (spec §10.2 C-7) |
| Let a value overlay move an evidence-scored number | AC-30 — enforced by recomputing with the overlay detached and asserting byte-identity (DR-017) |
| Skip a protected-core check to save budget | AC-49 — every skip carries a visible `SKIPPED-BY-BUDGET`; exhaustion hard-stops with `ENVELOPE_EXHAUSTED`, never a silent timeout (DR-021 knob 9, DR-052) |
| Ship a module nothing calls | AC-77 — the never-called list ships with every release and **blocks** it (DR-047 clause 4, charter A4.2) |

---

## 2. Stages and organs

The battery is the discipline the engine executes: rows of checks grouped into
**eleven stages** (GLOSSARY, "the battery"). The mapping from V3's implementation
organs to those stages is **FINAL and no longer vetoable** (AC-17; DR-056(a),
spec §18 O-7, manifest §3). Restated here in full, because every module boundary
in §4 below is downstream of it:

| Stage | Owning context (§4) | Package | Organ status (AC-17) |
|---|---|---|---|
| LOCK | 1 Framing | `battery` + the run's framing state | greenfield |
| ROUTE | 1 Framing | `battery` + the run's framing state | greenfield |
| AIM | 2 Inquiry | `evidence` | greenfield |
| HARVEST | 2 Inquiry | `evidence` | greenfield |
| RUN | 2 Inquiry | `evidence` | greenfield |
| SPLIT (graph as object, and substrate for every stage) | 3 Argumentation | `graph` | kept organ — graph shapes |
| SPLIT (spawn mechanics) | 3a Spawn decision | `battery/decision` | kept organ — spawn plumbing |
| WEIGH | 4 Appraisal | `judgement` | kept organs — scorer + judge contract |
| CROSS | 5 Adjudication | `critique` | greenfield |
| COMPOSE | 6 Recomposition | `valuation` + `propagation` | kept organ — scorer |
| SERVE | 7 Serving | `serve` | kept organ — ledger read |
| SETTLE | 8 Settlement | `settlement` | greenfield |
| *(all stages write; SERVE reads)* | shared | `ledger` | kept organ — ledger |

Two readings a stranger should take from this table. First, **the kept organs
are behaviours, not code**: they are re-specified and rebuilt clean-room, never
copied (AC-81; DR-003, DR-033, manifest §14). Second, **`battery` owns a row's
contract, activation state and sequencing; the named domain package owns the
row's substance** — so an AIM row's contract lives in `battery` and its substance
lives in `evidence`, and the question "where is this decided?" has exactly one
answer for each half (Plan.md §3.1, charter A3.6). Context 3a is the one
exception, by ruling: AC-17 places spawn plumbing in SPLIT mechanics, so its
substance is a fenced sub-package of `battery` while `graph` remains the owner of
what a spawn *writes*.

---

## 3. Container view

One database, one API front door, **four** executables, and **one kept interface
package inside the same repository** (`RULED — DR-069`: **no fence**). This is
the whole deployment (Plan.md §2.6 plus `03-module-design.md` §1.2, which names
the fourth; **SEAT-PROPOSAL** for everything except "Postgres", which is AC-01).

```
                    ┌───────────────────────────────────────────┐
   asker ─────────► │  web  (kept Next.js interface)            │
                    │  NOT FENCED (DR-069): a plain,            │
                    │  always-visible package inside            │
                    │  DebateAI-V3, beside the engine           │
                    │  packages; imports types from             │  ← Q-01/Q-02
                    │  packages/contract and nothing else       │    RULED
                    └────────────────────┬──────────────────────┘  DR-068/DR-069
                                         │  one transport (AC-60)
                                         ▼
                    ┌───────────────────────────────────────────┐
                    │  apps/api        the single front door    │
                    └────────────────────┬──────────────────────┘
                                         │
        ┌────────────────────────────────┼───────────────────────────┐
        ▼                                ▼                           ▼
┌───────────────┐              ┌──────────────────┐        ┌──────────────────┐
│ apps/runner   │              │  ONE POSTGRES    │        │  apps/replay     │
│ stage         │◄────────────►│  namespaced      │◄───────│  the ceremony    │
│ orchestration │              │  schemas, one    │ read-  │  imports ONLY    │
│ + work claim  │              │  migration       │ only   │  published-      │
└───────┬───────┘              │  lineage         │        │  arithmetic      │
        │                      └────────┬─────────┘        └──────────────────┘
        │                               │
        │                      ┌────────┴─────────────────────────────────────┐
        │                      │  apps/scheduler — the one home for           │
        │                      │  time-triggered work, two named entry points:│
        │                      │    job:replay-self-test  (charter S1's       │
        │                      │        continuous limb; FX-LG-01a)           │
        │                      │    job:reaper            (AC-89's write half │
        │                      │        + the stale-worker reaping AC-62      │
        │                      │        moves off the read path)              │
        │                      └──────────────────────────────────────────────┘
        │  provider gateway (the only path to a model)
        ▼
   external model providers  (≥2 makers compiled in, one configured — AC-37/AC-38)
```

**One Postgres, and no second store** — including for the product observability
layer: score provenance, the execution-ledger artifact store and the debug views
all live there (AC-01; DR-024, spec §20 W-1). The settlement store, the model
ledger and the cross-run memory index are **one store with multiple indexes,
never parallel stores** (AC-02). Job execution is a Postgres-backed queue inside
that same store rather than a broker, because a broker would be a second durable
store for run state (Plan.md §2.7; AC-02, AC-04).

**Packages, grouped by what they are for** (the authoritative dependency edge
list is `03-module-design.md`; Plan.md §2.6 states the rules this table
summarises):

| Group | Packages | The rule that shapes the group |
|---|---|---|
| Pure, zero-dependency | `kernel` (closed vocabularies, branded identities, the labeled-number type), `published-arithmetic` (`agg`, `σ`, product — and nothing else) | `published-arithmetic` is the one module the replay ceremony is licensed to share (DR-063 VR-3); its exported surface is pinned by CI to those three symbols |
| Pure, fenced | `propagation` (the scoring engine), `battery/decision` (the spawn decision) | both may import nothing but `kernel` (+ `published-arithmetic` for `propagation`); AC-09 and AC-48 are dependency-graph properties, not habits |
| Contract and configuration | `contract` (the wire vocabulary), `register` (every constant as a ratified row) | `contract` is the **only** package the interface may import types from (AC-59); no constant is a source literal (AC-74) |
| Store and record | `db`, `ledger` | one migration lineage over one database (AC-02); append-only with a total order (AC-45) |
| Domain | `graph`, `judgement`, `evidence`, `critique`, `valuation`, `serve`, `memory`, `settlement`, `liveness`, `budget`, `battery` | one context owns each invariant; no anti-corruption layer, because there is nothing to translate (§4) |
| Gateway | `providers` | every model call crosses one interface; provider identity is a configured value, never an import (AC-36) |
| Executables | `apps/api`, `apps/runner`, `apps/replay`, `apps/scheduler` | four processes, no more; **`apps/scheduler`'s two jobs are named entry points on the published entry-point list** (charter G1, A4.5), so neither is an orphan on the day it lands (AC-77) |
| Tools | `tools/orphan-audit`, `tools/acceptance-bundle` | the never-called list and the acceptance bundle that **block** the release (AC-77, AC-79) |

**Why the interface is *not* fenced · `RULED — DR-068 / DR-069`.** The clean-room
split binds whoever implements V3's organs to read the manifest and never V2
source, and it is voided *"regardless of intent"* (AC-81; manifest §14). Code
fences cannot enforce a reading rule. The architecture proposed **checkout
separation** as the barrier — the kept interface living outside the organ
implementers' working tree, with `packages/contract` published to it as a
versioned artifact. **V ruled otherwise, and priced the ruling explicitly:**

- **Q-01 — kept UI component source MAY be carried into `DebateAI-V3`** (DR-068).
- **Q-02 — NO FENCE** (DR-069). The kept UI package sits in `DebateAI-V3` as a
  **plain, always-visible package beside the engine packages** — not a separately
  checked-out workspace, not a separate repository.
- **The priced cost, on the record:** *"DR-003's clean-room mandate has no
  enforcement mechanism under this ruling — compliance is an honour system, not
  a checked barrier."* This is an **accepted trade-off, not a gap**, and DR-069
  directs that it is **not re-raised as an open question**.

Three things survive the ruling unchanged, and one mechanism is replaced.
**Unchanged:** AC-81's prohibition itself; AC-59's *no adapter*, which requires
**one contract declaration, not one checkout**; and AC-61's bidirectional
no-orphan rule, which **still fails the build**. **Replaced:** the
**consumer-manifest** mechanism is *not required* (DR-069), because there is no
second build to emit it — the engine's release build now runs an **intra-repo
static type-graph pass** over the kept package in its place
(`07-build-order.md` §3.4; `06-test-strategy.md` §11 `FX-ORPH-01`, §13). DR-069
removed the fence, not the obligation.

**Scope limit, stated so this ruling is not over-applied.** DR-069 removes **one
barrier: the UI checkout separation.** It does **not** touch the architecture's
**import fences**, which are a different mechanism serving different constraints
and remain fully in force — `propagation` and `battery/decision` may still import
nothing but `kernel` (+ `published-arithmetic`), enforced by the dependency graph
and the `no-impure-import` lint (AC-09, AC-48); `apps/replay` still imports no
workspace package but `published-arithmetic` (VR-3); `contract` is still the only
package the interface may import types from (AC-59); and context 3a's spawn
plumbing is still a fenced sub-package of `battery` (AC-17). Those are
**code-coupling rules a build can check**. The clean-room split was never one —
which is exactly why removing its checkout barrier leaves an honour system rather
than a weaker check.

---

## 4. The context map

V3 has **one core domain** — a run that turns a question into a served,
replayable answer — expressed as nine core contexts (eight stage contexts plus
context 3a), four supporting contexts, and five shared-kernel or generic modules
(Plan.md §3.1).

**There is no anti-corruption layer between contexts.** The usual reflex — give
each stage its own model of the argument and translate between them — is
forbidden by ruling: one graph (AC-15), one scoring engine (AC-14), one serving
truth (AC-16). Contexts differ by **which invariants they own**, not by which
model they hold.

### 4.1 Core contexts

| # | Context | Package | Owns |
|---|---|---|---|
| 1 | Framing | `battery` + the run's framing state | the answer rule frozen and hashed before the first retrieval; `prior_basis` with no DEFAULT/ASSUMED member; the binding as the sole scope key; **the five terminal routes** (DR-037 — see the note below this table); the machine-enforced dual-act phase order (AC-83) |
| 2 | Inquiry | `evidence` | the frozen query set and its typed amendments; admissibility; three-valued access depth; absence rows; provenance clusters; freshness; probe capture and instrument certification |
| 3 | Argumentation | `graph` | node identity never reused; three orthogonal lifecycles; the materialized path (AC-33); **write-time enforcement** (AC-32); the arrow as a stored first-class object with a polymorphic target (AC-18/AC-19); cycle refusal and shared-crux redirect (AC-20); defeater completeness |
| 3a | Spawn decision | `battery/decision` | **AC-48 in full** — the decision is a pure function over typed signal bundles with fixed precedence; only categorically-grounded decisions may spawn real work and unclassified fails closed to scalar; the replay identity hash excluding the idempotency key, spawn count and classification fields |
| 4 | Appraisal | `judgement` | one structured grade per node reduced deterministically; parse failure and schema failure kept distinguishable; no default τ (AC-21); dispersion never averaged away; **organ 2's judge contract in full (AC-92)** |
| 5 | Adjudication | `critique` | different maker = different lineage; independence never fabricated; blinded fingerprinted packets; the symmetry diff with no fairness scalar; `UNINSTRUMENTED` withholding the fairness claim and capping the band; the residual objection set as a first-class object |
| 6 | Recomposition | `valuation` + `propagation` | operator declaration and its resolution chain (AC-22); the rival reading where it flips the band; leverage and fragility as **outputs, never weights** (AC-29); the overlay detachment invariant (AC-30) |
| 7 | Serving | `serve` | the fact bundle of computed facts and typed records; gate order (AC-52); the recompose bound and its terminals (AC-53); machine-injected honesty fields (AC-54); degraded-mode projection fields (AC-55); the projection/bundle disclosure split (AC-56/AC-57); **organ 6's serve behaviour in full (AC-86…AC-91)**; AC-24's band ceiling |
| 8 | Settlement | `settlement` | resolution events and external resolvers; read-back verification; the proper score registered once; scorecards as pure ledger functions (AC-41); cell shape and honest reporting (AC-42); the eight routing guards (AC-40); demonstrated cold-start exit (AC-43) |

**The terminal-route count is FIVE, and the founding pack now says so in one
voice.** `requirements-spec.md` §5.2, **DR-037** and **spec §12.3's Home-3
table** all enumerate five, including the depth-zero (no-justification-no-split)
route raised by Q10. `kernel`'s membership-and-count test (AC-65, `FX-LG-04`)
counts against that five-member list.

**The split this paragraph used to record is closed.** Home 3 formerly listed
**four** and omitted depth-zero, which put it against DR-037 — and under S-13,
where §12.3 is *"the only place a typed state may be minted"*, an unplaced ruled
state is a specification defect rather than a difference of opinion. The
architecture could not repair it (a C4 artifact may not amend a founding doc) and
carried it as **TRACE-7 ≡ H-C-1**, resolved by the order of authority (spec §2
item 1; manifest §2.2 item 1) — *the ledger wins over a founding doc*. **V
ratified the repair individually as amendment A-01 at DR-099**, DR-100 listed it
in the follow-through, and **it has since landed: §12.3 Home 3 carries row 5,
added 2026-08-06 under `RULED(DR-099 A-01; follow-through DR-100)`** by board
ticket **PRE-08**. The spec's own edit note records that the correction **mints no
new typed state** — the route's authority was always DR-037 — and **discharges
TRACE-7 ≡ H-C-1**.

**What did not move, and why that matters.** `FX-LG-04` was already pinned to the
five-member list, so **the correction did not repair the fixture and the fixture
did not need repairing** — it stays green across the edit. That is the whole
point of `06-test-strategy.md` §6.2's refusal to point a membership test at the
lower-authority table: a test frozen to the four-row reading would have **failed
the build on the day §12.3 was corrected**. The closed-enum inventory in
`02-data-model.md` still carries the one membership list, cited and never copied
(S-12/S-13). **One residue remains, and it is the Plan-side half of the same
amendment:** `Plan.md` AC-65 still transcribes *"4 terminal routes"*, carried on
the board as **PRE-09** (*Plan.md rev-4 amendment record + AC-65 five-route
string*). It changes nothing here — Plan.md is a digest, and both documents above
it already say five.

### 4.2 Supporting contexts

| # | Context | Package | Owns |
|---|---|---|---|
| 9 | Memory | `memory` | four database-predicate match tiers with no embeddings (AC-68); link-never-merge with no transitive closure (AC-69); pinned pulls (AC-70); per-asker scope on question-level pulls (AC-71); a match never reduces the work |
| 10 | Liveness | `liveness` | relevant-as-of at spawn; watched triggers and TTL review clocks; propagate re-judges only affected nodes; badges never silent; retirement as archival (AC-05, AC-72) |
| 11 | Budget | `budget` | the visible cost envelope; enrichment skips before any hard stop; the protected core's refusal to be skipped (AC-49); rates frozen at run start (AC-50) |
| 12 | Register | `register` | one ratified table of every constant, threshold and flag; the resolution chain per row; provisional-row metadata (charter A5.2); naked-constant printing (AC-75) |

### 4.3 Shared kernel and generic subdomains

| # | Module | Kind | Note |
|---|---|---|---|
| 13 | `kernel` | shared kernel | the closed vocabularies every context speaks; condition marks, abstention kinds and terminal routes are **transcribed once with a membership-and-count test (`FX-LG-04`) and never extended locally** (AC-65; DR-051), against **spec §12.3** — whose Home-3 terminal-route table and **DR-037's five-member list now agree at five** since the A-01 correction landed (§4.1 note) |
| 14 | `propagation` (+ `published-arithmetic`) | shared kernel (pure) | the one scoring engine (AC-14), used by Appraisal and Recomposition; `published-arithmetic` is a boundary inside it, not a second engine |
| 15 | `ledger` | shared kernel (written by all) | every context writes; SERVE reads (AC-17); recording is not optional anywhere (AC-44) |
| 16 | `providers` | generic subdomain | the one provider interface (AC-36/AC-37); lane assignment and context isolation (AC-39); typed call bounds; the deployment-level maker-inventory assertion (AC-38) |
| 17 | `contract` | published language | the wire vocabulary; `apps/api` implements it, the **kept `web` package consumes it in-repo** (`RULED — DR-069`: no fence, so consumption is an ordinary intra-repo type dependency rather than a published-artifact hand-off), and **nothing else declares a wire shape** (AC-59/AC-60) |

---

## 5. The four seams

Four boundaries carry the constraints that would otherwise have no home. A
stranger who understands these four understands why the module map looks the way
it does (Plan.md §3.2).

### Seam A — the evaluation snapshot (AC-09 × AC-01)

*(architecture term: **evaluation snapshot** — an immutable in-memory value
carrying the node set, the arrow set, the per-parent operator resolution, the
cluster records and a recorded total order over arrows.)*

The graph lives in Postgres; the arithmetic may not touch a database. The
boundary is **materialise → compute → persist**: `graph` builds the snapshot
(impure), `propagation` consumes it and returns a per-node result record (pure),
`ledger` persists the result and the snapshot's fingerprint.

**The ordering rule lives here and only here** (AC-08). Arrow evaluation order is
a deterministic function of stable non-identity content, not a sort over opaque
identities — an opaque-id sort is exactly the storage-engine-specific ordering
tiebreak the pack refuses to carry (manifest §8.2g, AC-04). The order is
**recorded**, and every recomputation of an already-computed run **consumes the
recorded order rather than re-deriving it**. That one rule is what makes the
overlay-detachment byte-identity check (AC-30), the replay ceremony (AC-07) and
the removal-based leverage and fragility recomputations (AC-29) mean what they
claim to mean.

### Seam B — the single writer for graph invariants (AC-32 × AC-20)

All node and arrow writes go through `graph`'s write API, inside one transaction
holding a per-graph advisory lock, so acyclicity is checked against a stable
predecessor set. DDL carries what DDL can — closed-enum checks, the non-blank
claim, endpoint foreign keys, self-edge rejection, arrow-identity uniqueness —
and the transaction carries the recursive reachability check. This is layer two
of the three-layer cycle law; layer one is the builder's refusal-and-redirect and
layer three is `propagation`'s typed compute-time error. **All three must exist**
(AC-20; charter §5.2 row 10, fixture `FX-C52-10`).

### Seam C — the provider gateway (AC-36 × AC-04 × AC-44)

Every model call crosses one interface taking a typed role, a lane, a call bound
and a contract hash, and returning a raw artifact. The gateway persists that raw
artifact **unconditionally, parseable or not**, with provider metadata
allow-listed and recursively scrubbed (AC-13), and writes the ledger row
(AC-44) — **outside any open write transaction**, because a write lock may never
be held across a model call (AC-04). Provider identity, model id and
`model_version` are configuration values on the way in (AC-36) and recorded keys
on the way out (AC-42).

This seam also owns the **deployment-level maker inventory** (AC-38; DR-055).
Two predicates with different subjects, because one cannot carry both: the
**deployment's configuration** is evaluated at startup and on every register
change and is the launch/admission gate — a deployment that cannot execute
multi-maker critique at standard-and-above refuses those asks and produces no
launch attestation; **one run's provider reachability** is evaluated per critique
attempt and invokes only the transient cap-and-label path (DR-014). A
ledger-derived counter classifies every capped run against the two, so a standing
misconfiguration can never accumulate as a run of "transient" outages. The pair is
fixtured separately — `FX-PRV-01a` (standing one-maker deployment fails) and
`FX-PRV-01b` (two-maker deployment with one transient outage passes), with
`FX-PRV-02` for the counter.

### Seam D — the projection boundary (AC-56 × AC-64)

`serve` produces two distinguishable kinds of thing:

- **Frozen artifacts** — the fact bundle, the conformance record, the served
  numbers and their provenance. Persisted, hashed, and inputs to replay. Freezing
  them is what AC-06 requires.
- **Projections** — badges, marks, provenance summaries, per-node restatements.
  **Computed at read time from stored typed fields.** Computing them at read time
  is what AC-64 requires: an answer whose staleness state changed after it was
  served must expose that state on the next read.

The same boundary carries the disclosure split: default projections cross the
wire to anyone authorized to read the answer, while the complete fact bundle and
the conformance record are fetchable through an **authorized inspection/replay
handle** — the same handle the replay law needs (AC-56) — scoped to the asker's
own session (AC-57; DR-066(1)). Internal prompt material and the raw text of
every model call stay operator-only (AC-44, AC-87).

**Who the asker is · `RULED — DR-070`.** The asker is **the requesting
user/person**. There is **no separate authenticated-principal / session-scope
model** at this stage: authorization and user credentials are **explicitly out
of scope**, and V2's existing `user_dev_token` vertical slice is adopted as
sufficient. `GET /v1/session` is the principal surface the handle's scope is
evaluated against (`04-api-contract.md` §3.1; fixture `FX-WIRE-03`). Recorded
with the ruling's own condition: this is a **provisional simplification, not a
design closed away** — real principal/session separation may be needed before a
multi-tenant or credentialed launch, and that revisit carries charter A5.2-style
language when it is built.

---

## 6. How a number gets served

The end-to-end walk. Every state named is AC-52's or AC-53's; none is invented
here. The slice-level ordered trace, with its fixtures, is
`07-build-order.md`; the resource shapes are `04-api-contract.md`.

1. **The ask is frozen.** A run is created with its question, its risk tier and
   the tier's supplier, its depth parameters, its `as_of`, the **stranger sample
   rate frozen at run start** (AC-50; the ratchet applies to the *next* run), the
   envelope basis (AC-49), and the pinned register and battery versions (AC-74) —
   written **before the first stage executes**, so a mid-run change cannot move a
   served number retroactively. **`RULED — DR-094`: the asker declares the risk
   tier and deployment policy may RAISE it, never lower it**, with `tier_source`
   recorded and printed. **`RULED — DR-078`:** the asker also selects a
   **composition-budget tier** (`low` / `medium` / `high`) here, and the bounds
   it resolves to are register rows.
2. **The question is broken into claims.** SPLIT produces nodes and, as
   first-class stored objects, the typed arrows between them — including arrows
   that target another **arrow** rather than a claim, which is how an undercut is
   represented (AC-18, AC-19; DR-066(2)). A cycle-closing edge is refused at
   construction and redirected to a typed shared-crux sub-claim or an ancestor
   attack (AC-20). Whether a spawn happens at all is a **pure function** over
   typed signal bundles, and only categorically-grounded decisions may spawn real
   work (AC-48). **`RULED — DR-075 / DR-076`:** a node that spawns **`pending`**
   is an unjudged interior node — **structurally connected to its parent from the
   moment it spawns** by a placeholder arrow that is a **live, real arrow
   endpoint**, never the *"endpoint absent from the node set"* error — and its
   lifecycle (**generating → judged → scored**) is **observable live**, not only
   after settling. Serving a placeholder as a claim stays forbidden regardless.
3. **Each claim is judged.** Every model call crosses the provider gateway
   (Seam C); the raw artifact is stored whether or not it parses (AC-13); a
   deterministic reducer turns the grade into a number with its uncertainty
   ladder position, its drivers in a fixed order and its typed holes (AC-92). A
   node nobody could judge gets **no default score** — it emits no arrow and
   carries a typed record, and its children's arrows attach to the nearest judged
   ancestor with a marker at both ends (AC-21).
4. **The graph is scored.** `graph` materialises the evaluation snapshot,
   `propagation` computes over it purely, `ledger` persists the per-node record
   and the snapshot fingerprint (Seam A). Siblings are partitioned by provenance
   so a cluster contributes once, at its strongest member — a gate, not a bonus
   (AC-23) — and **`RULED — DR-073`: this applies to both polarities, support
   *and* attack**, with the cluster key derived from the provenance of a node's
   evidence and the producing run/model family; **a node with no resolvable key
   clusters alone**. **`RULED — DR-072`:** where lifting is needed the two
   predicates compose **folder-lift first, then the judged-ancestor lift**, with
   **markers at both ends in both cases**. **`RULED — DR-071`:** an undercut is a
   **transmission-reduction** — a reduction of the targeted support edge's
   transmitted contribution, computed in the pure core and **recorded per edge**
   — which makes it a **third ruled producer of arrow strength** beside the
   evidence verifier's grounded score and cluster collapse. Arrow strength stays
   closed to those three (AC-27).
   **The combining operator · `RULED — DR-074`:** it resolves on a chain whose
   **deployment row is MANDATORY and never blank**; parent and run levels are
   optional overrides on top, and **the supplying level is recorded on the
   number** (AC-22). The former undeclared-parent path — a bounded declaration
   call, then a withheld parent — is **deleted from the design**, because with a
   mandatory deployment row nothing can reach it and charter G4 forbids a branch
   no production caller can produce. The anti-defect property is unchanged and
   now rests wholly on the register: **the operator is a recorded config value,
   never a source literal.**
5. **A different maker attacks it.** CROSS runs blinded critique from a genuinely
   different lineage. Where a second lineage is unavailable the run still serves,
   capped and labelled with its reason and its recorded lift condition (DR-014) —
   but a **deployment** that cannot execute multi-maker at standard-and-above does
   not pass launch (AC-38).
6. **The facts are assembled and the answer is written.** The machine builds one
   structured fact bundle of computed facts and typed records — never prose —
   which is **persisted, versioned and content-hashed** because the conformance
   verdict is rendered against it and is itself a frozen input artifact (AC-07,
   AC-51). One composition model writes the text; it may not introduce a claim,
   number, hedge or softener with no fact behind it. Honesty fields are
   **machine-injected into the output structure, outside the composition model's
   discretion**, so silently truncating an honesty surface is impossible by
   construction (AC-54).
7. **Four gates fire in a fixed order, and then a cap** (AC-52; DR-049, DR-057;
   **`RULED — DR-082 / DR-086`**): the stranger check on node text **before**
   composition → objection visibility → the conformance judge (text against
   facts) → the provenance gate, whose limbs include the locator gate and the
   reasoning-only downgrade — and then the **composed verdict's own
   post-composition stranger pass**. The conformance judge may never demand an
   edit that violates the stranger rule. **Beside those blocking gates sits the
   way-of-knowing ceiling — a second, independent gate that does not block.**
   When it fires the answer **serves with its confidence band capped**, unable to
   reach the top band and wearing its ceiling label visibly. **Four gates plus
   the cap** is the whole serve order; the cap adds no terminal.
8. **Failure has ruled terminals, not a loop.** The recompose bound is
   `max_recompose = 2`; a second conformance failure, a failed verdict stranger
   pass, or a bundle past the declared hard composition budget each terminate in
   **components-only plus a visible `DEFECT`** — never blank, never unchecked
   prose, and never a new loop (AC-53). One fixture per terminal. **`RULED —
   DR-078`:** that third route's budget is an **independent register row**, *not*
   derived from the cost envelope — which is what keeps **`DEFECT` and
   `ENVELOPE_EXHAUSTED` distinguishable** — and it is reached by the tier the
   asker selected at step 1. **There are five terminal routes in the framing
   vocabulary and three compose-time routes to components-only; the two counts
   are different things** and §4.1's note governs the first.
9. **The answer is served as typed projections.** The browser receives the
   honesty surfaces as typed fields, the node set and the edge set, and every
   number as a labeled number carrying its provenance reference and replay handle
   (AC-56, AC-63). The complete bundle and the conformance record are behind the
   authorized handle (AC-57). Before anything is served, five distinct typed
   refusals are evaluated — produced by the ledger, a list, every item valid, a
   known status, no reference outside the current node set — and each refusal is
   its own typed reason (AC-86). On the way out, every item is re-validated, raw
   judge output is stripped, damaged reason strings are **dropped rather than
   served**, and optional scalars are copied **only when well-typed** (AC-87).
   Coverage is reconciled and the **status is derived, never asserted** (AC-88).
10. **The answer stays honest after it is served.** Wake-up triggers and TTL
    review clocks re-assess ancestors and re-judge only the affected nodes, and a
    fired trigger serves with a visible `STALE` / `UNDER-REVIEW` badge, never
    silently (AC-72). Every read after a wake-up exposes the current staleness
    state (AC-64). And the continuous replay self-test keeps checking: when a
    component number can no longer be recomputed it is **evicted with a typed
    missing-number mark**, the answer transitions to components-only plus
    `DEFECT`, and the sealed version still replays byte-identically because
    nothing frozen was rewritten (AC-12, AC-07). One number is lost, never the
    answer.

**The one-paragraph restatement, for the stranger.** *You ask a question. The
engine turns it into a map of claims joined by supporting and attacking arrows,
has each claim graded by a model, has a different model attack the result, and
computes the verdict from the map with a fixed formula that never runs a model
and never guesses a missing score. Everything it did is written down in an
append-only record. Before you see the answer, a second model checks that the
text matches the facts, and a machine — not a model — enforces that check; if it
fails twice you get the components and a visible defect badge instead of prose.
Every number you see carries a handle you can follow back to how it was
computed, and if the engine ever finds it can no longer reproduce that number, it
takes the number away rather than keep showing it.*

---

## 7. The constraint spine

Plan.md §1 is the ground truth: the union of the founding pack's hard
constraints, deduplicated, each with its citation. **A design element that traces
to none of them is unjustified; a constraint with no design element carrying it
is a gap** (Plan.md §1).

Below is the spine — every AC row, one line, the context or module that carries
it, and **the acceptance address in `06-test-strategy.md`'s `FX-*` namespace**,
which is the only fixture address the set uses (charter A4.4 requires each
blocking path to be *named by fixture id*). **The full row — owner → data carrier
→ API carrier → fixture, in both directions — is `09-traceability.md`**, which is
also where **AC-86…AC-92 resolve completely** and where every row with no `FX-*`
address is characterised (`09` §8.3).

### 7.1 Persistence and store

| AC | Constraint, in one line | Carried by | Acceptance (`FX-*`, `06`) |
|---|---|---|---|
| AC-01 | Postgres is the persistence layer, including product observability; no second store | `db`, all schemas | CI `db-integration`; every `FX-DB-*` runs on the migrated database |
| AC-02 | One store, multiple indexes — never parallel stores | `db`, `ledger`, `memory`, `settlement` | CI `db-integration` |
| AC-03 | Start from scratch; nothing depends on recovering V2's database | repository (AC-82) | — (TRACE-3: repository review + AC-80's prohibition) |
| AC-04 | Never hold a write lock across a model call; isolate per-member failures; crash-resumable; no storage-engine ordering tiebreak | `apps/runner`, Seam C, Seam A | `FX-LG-15` · `FX-DB-02` |
| AC-05 | Nothing is ever deleted; retirement is archival with auto-revival | `liveness`, `db` | `FX-DB-01a` / `FX-DB-01b` |

### 7.2 Replay, determinism, purity

| AC | Constraint, in one line | Carried by | Acceptance (`FX-*`, `06`) |
|---|---|---|---|
| AC-06 | Never serve a number it cannot recompute; no model in the replay path | `ledger`, `apps/replay` (ceremony), `apps/scheduler` (continuous limb) | `FX-LG-01a` (continuous) · `FX-LG-01b` (ceremony) · `FX-LED-02` · `FX-DB-01b` · `FX-REG-01` |
| AC-07 | Numbers replay byte-identically; the serve decision replays as stored data; ceremony independence | `apps/replay`, `serve`, `published-arithmetic` | `FX-LG-01b` · `FX-IND-01/02/03` · `FX-SRV-02` · `FX-SRV-04` |
| AC-08 | Total deterministic ledger order and a deterministic recorded arrow order | `ledger` (sequence), Seam A (arrow order) | `FX-PT-ORD` · `FX-LG-02` |
| AC-09 | The scoring math has no model call, no I/O, no clock, no randomness, no database | `propagation` | `FX-HR-H3` |
| AC-10 | Contract-hash discipline: excluded from the input hash, included in cache identity | `ledger` | `FX-LED-05` |
| AC-11 | Completeness gate over required nodes, with the failure condition kept apart from the definition | `ledger`, `battery` | `FX-LED-01a` / `FX-LED-01b` |
| AC-12 | A number failing replay is evicted with a typed mark; the rest serves with `DEFECT` | `serve` | `FX-SRV-03…06` · `FX-C52-12` |
| AC-13 | The raw artifact is persisted unconditionally, allow-listed and scrubbed | `providers` (Seam C), `ledger` | `FX-LG-02` · `FX-LED-01b` |

### 7.3 Graph and scoring arithmetic

| AC | Constraint, in one line | Carried by | Acceptance (`FX-*`, `06`) |
|---|---|---|---|
| AC-14 | One scoring engine; no second scoring path anywhere | `propagation` | `FX-IND-01` · `FX-IND-02` · `FX-LV-01/02` |
| AC-15 | One graph, no conversion layer | `graph` | — structural (TRACE-4): the enforced edge list |
| AC-16 | One serving truth; the debug view is its facet, not a second answer | `serve` | `FX-ORPH-01` (the facet's address is on the walked list) |
| AC-17 | The organ↔stage table is FINAL | context map (§2, §4) | — structural (TRACE-4): the context map |
| AC-18 | Edges are stored first-class objects and may target a non-parent | `graph` | `FX-DB-06b` · `FX-C52-10` |
| AC-19 | The undercut is a typed attack targeting the support **edge** | `graph` | `FX-DB-04a` / `FX-DB-04b` |
| AC-20 | Cycle law at three layers; never a partial result or a fixed-point approximation | `graph` ×2, `propagation` | `FX-C52-10` |
| AC-21 | M1 — no default τ; unjudged interior nodes are transparent with markers | `judgement`, `propagation` | `FX-PT-D1` · `FX-LED-01b` |
| AC-22 | M2 — the operator resolves **parent → run → deployment**, where the **deployment row is MANDATORY and never blank** (`RULED — DR-074`); the **supplying level is recorded on the number** and selection is **never a source literal**. *The former "no declaration ⇒ withheld parent" tail is deleted with the undeclared state that produced it; **AC-26's limb below is untouched**, so `WITHHELD(reason)` keeps a live producer* | `valuation`, `propagation`, `register` | `FX-PT-D2` · `FX-HR-H4` · `FX-SRV-06` |
| AC-23 | M3 — counting by provenance; a cluster contributes once, at its strongest member | `propagation`, `evidence` | `FX-PT-D3` |
| AC-24 | M4 — way of knowing; no numeric τ ceiling; every band names its ceiling | `serve` (context 7) | `FX-SRV-13` · `FX-SRV-01a` / `FX-SRV-01b` · `FX-C52-01` |
| AC-25 | F1 — the semantic-restatement flag changes no number | `judgement` | **`FX-PT-FLG`** (S3) |
| AC-26 | Strict-and has no identity element; an unjudged conjunct withholds the parent | `propagation`, `valuation` | `FX-SRV-06` |
| AC-27 | Arrow strength is closed to its ruled producers | `graph`, `evidence` | `FX-DB-08` · `FX-ORPH-02` |
| AC-28 | A contradicting verdict yields an attack arrow with typed unknown magnitude; unverifiable yields no arrow | `evidence`, `graph` | `FX-DB-08` |
| AC-29 | No sensitivity feedback into base scores or arrow strengths | `valuation` | `FX-C52-09` |
| AC-30 | The value overlay never mutates the evidence-scored graph — byte-identity enforced | `valuation` | `FX-LG-07` |
| AC-31 | Position and corroboration are already in the arithmetic; a position label travels with the number | `graph`, `propagation` | **`FX-PT-POS`** (S3) |
| AC-32 | Write-time enforcement of types, vocabularies, non-blank claim, path consistency, acyclicity | `graph` (Seam B) | `FX-DB-03a/03b` · `FX-DB-04a/04b` · `FX-DB-08` |
| AC-33 | A materialized path is a required capability | `graph` | `FX-PT-ORD` |
| AC-34 | A per-node record, never a flat node→float map | `ledger` | `FX-PT-D4` |
| AC-35 | Loud failure on unknown members; duplicates collapse, conflicting identities raise | `kernel`, `graph` | `FX-DB-05a` / `FX-DB-05b` · `FX-DB-08` |

### 7.4 Providers, models, routing

| AC | Constraint, in one line | Carried by | Acceptance (`FX-*`, `06`) |
|---|---|---|---|
| AC-36 | H1 — one provider interface; provider identity is configured, never imported | `providers` (Seam C) | `FX-HR-H1` |
| AC-37 | H2 — a second provider is addable through configuration alone | `providers`, `register` | `FX-HR-H2a` / `FX-HR-H2b` |
| AC-38 | Multi-maker critique is a launch gate at the **deployment** level | `providers` (Seam C); predicates at `03` §7.3 | `FX-PRV-01a` / `FX-PRV-01b` · `FX-PRV-02` |
| AC-39 | Context isolation is checkable; no role grades its own artifact | `providers` | `FX-HR-H6` |
| AC-40 | Eight routing guards are mandatory on the served lane | `settlement` | `FX-LG-09` · `FX-ORPH-05` |
| AC-41 | A scorecard is a pure function of the ledger | `settlement` | `FX-LG-10` · `FX-PT-D5` |
| AC-42 | Cell shape and honest reporting; no ASSUMED, no DEFAULT; no leaderboard | `settlement` | `FX-LG-10` |
| AC-43 | Cold-start exit must demonstrably execute | `settlement` | `FX-S22-03` |

### 7.5 Execution ledger, recording, decisions, budget

| AC | Constraint, in one line | Carried by | Acceptance (`FX-*`, `06`) |
|---|---|---|---|
| AC-44 | Everything executed is recorded, in two tiers; no served sentence implies an unrun check | `ledger` | `FX-LG-02` · `FX-WIRE-01` |
| AC-45 | Append-only with a total order under a write lock | `ledger` | `FX-DB-01a` / `FX-DB-01b` |
| AC-46 | Two stamps on every action row, plus typed outcome, actor, timings, fingerprint | `ledger` | `FX-LED-04` |
| AC-47 | Four reconstruction paths, none fabricating a score | `ledger` | `FX-LED-02` |
| AC-48 | Decision→spawn is a pure function; only categorical decisions spawn work | `battery/decision` (context 3a) | `FX-HR-H3D` · `FX-LED-06` |
| AC-49 | The protected core is never budget-skippable; exhaustion hard-stops | `budget` | `FX-C52-06` · `FX-C52-07` · `FX-LG-05` · `FX-HR-H8` |
| AC-50 | The stranger sample rate freezes at run start | Framing (the run), `budget` | `FX-LG-05` · `FX-LG-06` · `FX-DB-01a/01b` |

### 7.6 Serve, wire, interface

| AC | Constraint, in one line | Carried by | Acceptance (`FX-*`, `06`) |
|---|---|---|---|
| AC-51 | Serve composition, four steps in order; pure render was rejected | `serve` | `FX-SRV-17` · `FX-LG-03` |
| AC-52 | Gate order is law, including the post-composition verdict pass | `serve` | `FX-SRV-17` · `FX-C52-01/02/03/11` · `FX-LG-03` |
| AC-53 | `max_recompose = 2`; three terminals, each components-only + `DEFECT` | `serve` | `FX-LG-03` · `FX-C52-08` · `FX-SRV-18` · `FX-SRV-19a…f` |
| AC-54 | Compose size law; honesty fields machine-injected outside model discretion | `serve` | `FX-SRV-14` |
| AC-55 | Degraded mode still owes the reversal point and the builds-on-previous disclosure | `serve`, `valuation` | `FX-SRV-15` (= `FX-C52-12`'s first limb) |
| AC-56 | Wire boundary: typed projections by default, bundle behind an authorized handle | `serve`, `contract` | `FX-WIRE-01` · `FX-SRV-08` |
| AC-57 | Authorization is asker-scoped; prompt material stays operator-only | `apps/api`, `contract` | `FX-WIRE-01` · **`FX-WIRE-03`** — the principal is **`RULED — DR-070`** (the requesting user/person; credentials out of scope, `user_dev_token` adopted) |
| AC-58 | The nine honesty surfaces are canonical | `serve`, `contract` | `FX-ORPH-04` |
| AC-59 | The kept UI's data layer is rebuilt with **no adapter** | `contract`, the in-repo `web` package (`RULED — DR-069`) | `FX-ORPH-01` (the **intra-repo static type-graph pass** as the required input, replacing the consumer manifest) |
| AC-60 | L5 — one transport, one front door | `apps/api` | `FX-LG-13` |
| AC-61 | L6 / E1 — bidirectional no-orphan, for fields and for events | `tools/orphan-audit`, `contract` | `FX-ORPH-01` · `FX-ORPH-02` · `FX-ORPH-04` |
| AC-62 | Real pagination; reads carry no write side effects; polling is declared | `apps/api`, `serve` | `FX-SRV-10` · **`FX-WIRE-02`** — the executions-pagination limb, gap `API-1`, ratified as **A-12 at DR-099** and fixtured at `06` §9.10 |
| AC-63 | Every number arrives with its origin and replay handle, or not at all | `contract` | `FX-PT-D4` · `FX-SRV-06` |
| AC-64 | E4 — every read of or subscription to a woken answer exposes its staleness | `liveness`, `serve` (Seam D) | `FX-LG-12` |
| AC-65 | The condition-marks enum is closed and centrally owned; siblings cite, never extend | `kernel` | `FX-LG-04` |
| AC-66 | Verdict model, two axes; an abstention is neither; numbers deferred | `serve`, `register` | `FX-C52-04` · `FX-SRV-13` |
| AC-67 | One canonical `stranger_restatement` schema, minted with its subject | `graph`, `serve` | `FX-LG-06` · `FX-C52-03` |
| AC-86 | Serve preconditions — five distinct typed refusals; the replay precondition is per number | `serve` (context 7) | `FX-SRV-07` (+ `FX-SRV-05` for the per-number limb) |
| AC-87 | Sanitizing on the way out; strip raw judge output; drop rather than serve damaged | `serve` | `FX-SRV-08` · `FX-WIRE-01` |
| AC-88 | Coverage reconciliation; status is derived, never asserted | `serve` | `FX-SRV-09` · `FX-SRV-05` · `FX-DB-02` |
| AC-89 | Stale work expires on read — reaper writes, read derives | `serve`, scheduled reaper | `FX-SRV-10` |
| AC-90 | Honest-degradation vocabulary; never a guess, never a fabricated split | `serve` | `FX-SRV-11` |
| AC-91 | Suppression carries its unlock; the evidence gate runs in shadow mode | `serve`, `evidence`, `valuation` | `FX-SRV-12` |
| AC-92 | Organ 2's judge contract, in full | `judgement` (context 4) | `FX-LG-15` · `FX-LG-16` · `FX-S22-01` · `FX-PT-D1` |

### 7.7 Memory, liveness, settlement

| AC | Constraint, in one line | Carried by | Acceptance (`FX-*`, `06`) |
|---|---|---|---|
| AC-68 | No embedding pipeline; four match tiers as database predicates; `NULL` is never agreement | `memory` | `FX-S22-04` |
| AC-69 | Link, never merge; no transitive closure; ambiguity resolves to "do not link, and say so" | `memory` | `FX-PT-MEM` · `FX-DB-06a` / `FX-DB-06b` |
| AC-70 | Pulls are pinned; an unpinned pull makes the answer unreplayable | `memory` | `FX-S22-04` |
| AC-71 | Class-level facts are shared; question-level pulls are per-asker | `memory` | asserted inside `FX-S22-04`, scope evaluated against **`FX-WIRE-03`** — the asker is **`RULED — DR-070`** |
| AC-72 | Snapshot, wake, propagate; badges never silent; staleness is a ceiling and a refusal rule | `liveness` | `FX-C52-05` |
| AC-73 | Answers persist their outcome tuple with read-back verification | `settlement` | — (no dedicated id; §8.3) |

### 7.8 Configuration, acceptance, process

| AC | Constraint, in one line | Carried by | Acceptance (`FX-*`, `06`) |
|---|---|---|---|
| AC-74 | The register is drawn fresh and V-ratified; constants never live as source literals | `register` | `FX-REG-01` (S0 + S15) · `FX-REG-02` (S15) |
| AC-75 | Naked constants are printed where they are used, in the served trail | `register` | `FX-SRV-13` |
| AC-76 | No invented measurements | `register`, `tools/acceptance-bundle` | `FX-REG-01` (asserts equality, never a value) |
| AC-77 | No orphaned modules; the never-called list **blocks** the release | `tools/orphan-audit` | `FX-ORPH-01…06`, `FX-ORPH-02` **BLOCKING** · `FX-REG-02` |
| AC-78 | Deferred gates are not shipped dark | `tools/acceptance-bundle` | `FX-DEF-01` / `FX-DEF-02` (attestations) |
| AC-79 | Every gate is shown to fire **both ways** before it counts as adopted | CI gates, `06-test-strategy.md` | `06` §8's fire-both-ways register — every `a`/`b` pair |
| AC-80 | Ground truth = two published literature vectors + property tests of V3's own rules | `published-arithmetic`, property tests | `FX-LV-01` / `FX-LV-02` · `FX-PT-D1…D5` |
| AC-81 | The clean-room role split is binding | **the role split itself** — `RULED — DR-069` removed the checkout separation and named the cost: *compliance is an honour system, not a checked barrier*. Structural rule 4 still holds as **code coupling** and never as a reading rule | — unfixturable by ruling (TRACE-6): launch attestation |
| AC-82 | Greenfield, new repo, no shared history | repository | — structural (TRACE-4): repository assertion |
| AC-83 | 13 MACHINE rows make zero model calls; `POLICY_BLOCKED` is never filed as INACTIVE | Framing, `battery` | `FX-S22-05` |
| AC-84 | Research-upgradeability: findings land as data, not as contract changes | `register`, contract governance | CI `contract` |
| AC-85 | One behaviour lives in exactly one place; every caught failure is typed and ledgered | all contexts; dependency edge list | `FX-IND-01` · `FX-LG-02` · `FX-SRV-16` · `FX-ORPH-02` |

---

## 8. What this architecture forbids

The anti-pattern list is part of the design, not commentary on it (Plan.md §3.3).
Each is enforced somewhere named, because a rule with no enforcement point is the
shape the quality charter indicts.

| Forbidden | Enforced by |
|---|---|
| A second graph model. A context needing a different view builds a **projection**, never a parallel persisted model (AC-15) | one node/arrow aggregate; the dependency edge list |
| A second scoring path — including "just for the debug facet", "just for the preview", "just for the UI" (AC-14, AC-16) | `propagation` as the only engine; `apps/replay` importing `published-arithmetic` and nothing else; the isolation proof pinned at symbol granularity (`FX-IND-01`) and the exported-surface pin (`FX-IND-02`) |
| The same behaviour in two places (AC-85) | one canonical owner per invariant, named in `02-data-model.md` and `03-module-design.md`; application-level checks are restatements for error quality, never the authority |
| A module shipped unreachable (AC-77, AC-78) | `tools/orphan-audit` from the first slice onward (`FX-ORPH-01…06`); the never-called list **blocks** the release (`FX-ORPH-02`) |
| A deferred gate shipped dark | where the pack says a gate does not ship, it is **not written**, and the acceptance bundle carries a NOT-SHIPPED attestation instead of a firing fixture — `FX-DEF-01`, `FX-DEF-02` (AC-78; charter §5.2 deferred table) |
| A constant as a source literal (AC-74) | `packages/register` plus the `no-source-literal-constant` lint rule. **`RULED — DR-074`** makes the scoring operator the sharpest case: its **deployment row is mandatory and never blank**, so there is no undeclared state a literal could quietly fill |
| An unlabeled number on the wire (AC-63) | the labeled-number type; the `no-unlabeled-number` lint rule |
| A verdict-first presentation flag (**`RULED — DR-096`**) | there is **no such flag and no register row for one**: the verdict banner renders unconditionally, so honesty surfaces 1 and 4 always have their landing place. Recorded as a **deliberate absence** at `05-register-skeleton.md` §5.4-i and listed as never-a-row at §5.5 |
| A proxy for "measured behavioural difference" (**`RULED — DR-090`**) | rival-carver selection runs on the **maker-diversity floor alone**; the criterion is **recorded as unavailable, never approximated**. A future real metric lands as a register/scorecard upgrade, not a re-architecture |

Note the distinction the last two rows depend on, because it is easy to collapse:
a **deferred capability may** ship as a register-gated branch where the pack has
not said otherwise, and that branch must then be exercisable in both states by a
configuration a production caller can produce (charter VR-4 class 1, G4). **Where
the pack says a gate does not ship, it is not written.** The two shapes are not
interchangeable, and the register-gated shape may not be used to license the
not-written cases.

---

## 9. The C4 artifact set

What each document in `docs/architecture/` carries, so a reader knows where to
go next (Plan.md §7). Nothing in this set duplicates the founding pack: where the
pack states a rule, the C4 document **cites** it (AC-85).

| Document | Carries |
|---|---|
| `00-overview.md` *(this file)* | the system in one read: stages and organs, containers, contexts, seams, the serve walk, the constraint spine |
| `01-decisions/ADR-NNNN-*.md` | one ADR per irreversible or contested choice — context, options, decision, consequences, and the constraint each serves |
| `02-data-model.md` | per-schema table shapes, keys, constraints, append-only mechanics, archival, migration policy, and the DDL home of every write-time invariant with its **named canonical owner** |
| `03-module-design.md` | package boundaries and the enforced dependency graph, invariant ownership, the provider gateway, the graph write API, the pure core's signature and lint gates |
| `04-api-contract.md` | the frozen resource vocabulary and encoding — resources, projections, closed enums, pagination, the typed error taxonomy, events with declared consumers, authorization tiers, versioning, and the field inventory the orphan audit walks |
| `05-register-skeleton.md` | the register schema, resolution-chain mechanism, provisional-row metadata, the naked-constant printing rule, and the key inventory drawn from the pack — **values only where the pack states one** |
| `06-test-strategy.md` | the four test layers, the literature vectors, the property tests with their generator preconditions, the house-rule and law gates, the firing-fixture map and the fire-both-ways discipline |
| `07-build-order.md` | the vertical slices with per-slice entry criteria, the gates each must show firing, and the launch-readiness matrix |
| `08-open-questions-for-V.md` | the **28 distinct questions**, each in its smallest form with this seat's recommendation labelled SEAT-PROPOSAL, the consequence of the alternative, and the slice it blocks from — **now with V's ruling annotated on each entry (`RULED — DR-nnn`)**. **All 28 are ruled** (DR-068…DR-097); the question text is preserved as history, so the register reads as the record of what was asked *and* answered |
| `09-traceability.md` | the bidirectional index: DR → requirement → module → table → endpoint → test, with every AC row resolved to its owner, its carrier and its `FX-*` fixture — **and the consolidated gap index**, the single register of every lane's gaps under the global `DM/MOD/API/REG/TEST/BUILD/TRACE` ids |

---

## 10. What is not decided here

- **Nothing product-facing.** Every question of what the engine should *do* is
  the pack's or V's, and **no C4 document ever rules one** (DR-005). The **28
  distinct questions** of `08-open-questions-for-V.md` were **all ruled by V at
  DR-068…DR-097** and the loop closed at **DR-100**; this set now **carries** the
  rulings and cites them. The carrier-not-behaviour discipline stands for
  anything that arrives next.
- **The stack is a proposal.** Plan.md §2 — language, framework, database access,
  test stack, repository layout — is SEAT-PROPOSAL end to end, offered for V's
  ratification (DR-005 as narrowed by DR-024). Only Postgres is already imposed
  (AC-01). If V rules differently, §4's context map, the data model and the API
  direction survive unchanged; only the stack instantiation is redone.
- **No numbers.** Band cut-points, abstention prices, budgets, exploration
  shares, minimum-n gates, version pins: all are **register keys** whose values
  are V's at DR-023 (AC-74, AC-76).
- **No presentation.** The delegated presentation cells resolve at build-phase
  mockup review; the architecture carries their consequences only (DR-064).
- **Two divergences are recorded, not resolved.** Plan.md §1.9 records where a
  founding document and the ledger disagree and which wins. The terminal-route
  count is the live one, and **A-01's ratification at DR-099 authorizes its
  founding-table repair** (§4.1; board ticket PRE-08).

**The three questions that touched this document directly — all ruled.**

| Where | Question | Ruling |
|---|---|---|
| §3 (container view) | the clean-room fence's shape — **Q-01 / Q-02** | **DR-068 / DR-069** — source may be carried; **NO FENCE**, and the honour-system cost is on the record. The consumer-manifest mechanism is replaced by an intra-repo type-graph pass |
| §1.3 (honesty obligations) | the band-ceiling's obligation and label — **Q-14** | **DR-082 / DR-086** — a **second, independent gate** that **caps the band** and never silently blocks; label vocabulary and cut points stay register rows |
| §5 Seam D (the authorized handle) | the asker's identity — **Q-03** | **DR-070** — the requesting user/person; authorization out of scope; a **provisional simplification** by its own terms |

Numbering is `08-open-questions-for-V.md`'s. Each was carried here as a
**carrier that ships either way**; each now names its DR, and the carrier is
unchanged by the answer — which is what the discipline was for.

---

*End of `00-overview.md` — ARCH-V3-R1 / C4 lane 1, 2026-08-05; rulings
DR-068…DR-101 folded in 2026-08-06 under PROG-V3-R1 ticket **PRE-03** (DR-100
follow-through). The provisional-status banner is discharged by DR-098/DR-100 — this is
accepted architecture. **Unchanged: this document still states no number of its
own** (AC-74, AC-76); every constant it names is the pack's or a register key
whose value is V's at DR-023.*

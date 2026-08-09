# ADR-0001 — Language and runtime

| Field | Value |
|---|---|
| **Status** | **RULED — DR-117 (V + the human stack sitting, FINAL).** **TypeScript on Node.js**, one language across engine, API and interface; **workers TypeScript initially**. This is the original C4 instantiation, **restored as the ruled text**. The Python/FastAPI episode of DR-105 is **SUPERSEDED** and preserved at §"The superseded episode" as a record, not as an alternative. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 · re-instantiated 2026-08-07 (DR-105) · **restored and ruled 2026-08-07 (DR-117)** |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04. **Ruled by all the humans in the loop at the stack sitting, DR-117**, executed as PRE-10 rev 2. |
| **Source of record** | `docs/missions/2026-08-05-v3-architecture/architecture/Plan.md` rev 3, §2.2, with §2.0 and §9; PROG-V3-R1 ledger **DR-116, DR-117** |
| **Companions minted with the ruling** | [ADR-0017](ADR-0017-durable-execution-hatchet.md) (durable execution — DR-118) · [ADR-0018](ADR-0018-deployment-topology.md) (deployment topology — DR-117) |

## Context

V3 is a greenfield rebuild in a new repository with no shared history
(AC-82 · DR-031 knob 1, DR-065). One stack element is already imposed — Postgres
as the single persistence layer, including the product observability layer
(AC-01 · DR-024). Everything else in the stack was architecture's to propose and
V's to ratify (DR-005 as narrowed by DR-024); **DR-117 is that ratification,
taken at a human sitting.** This ADR proposes the first and most consequential of
those elements, because the language choice decides whether four separate
obligations are enforced by a machine or by a habit.

The fixed points this choice must clear are listed at Plan.md §2.0. The four
that bear on language specifically:

- **AC-59** (the kept interface's data layer is rebuilt against V3's native
  shapes with **no adapter**; DR-048) and **AC-60** (one transport front door;
  ui §1.4 L5). A cross-language wire boundary needs a generated mirror of the
  wire types, and a mirror that drifts is the exact defect shape the pack
  indicts as D4 — "the defect is the join" (manifest §10.4). V2's own
  `web/lib/types.ts` mirror is on the death list for this reason (ui digest
  §3.2).
- **AC-61** (bidirectional no-orphan: both drift directions are defects;
  DR-047 clause 4, ui §1.4 L6 / §1.3 E1) together with **AC-77** (no orphaned
  modules; the never-called list blocks the release; charter §5, A4.2). Deciding
  "no served field without a consumer" is a reachability question over field
  references; one type system on both sides of the wire makes it a static query
  rather than a manual inventory.
- **AC-35 / AC-65** (closed declared vocabularies with loud failure on unknown
  members; manifest §4.4/§6.3/§6.4, DR-051, spec §12.3 S-11…S-13).
- **AC-09** (the graph-scoring math contains no model calls, no file or network
  I/O, no clock, no randomness and no database access; DR-029 H3) — which
  charter A3.4 wants expressed as a gate rather than as a review convention.

**AC-07**'s byte-identical replay (DR-060(b), DR-063 VR-3, charter S1) is a
further force, but it is **not** a language property: determinism comes from the
recorded evaluation order of AC-08 (spec §12.5 S-21; manifest §4.2a, §8.2g), not
from the runtime. See ADR-0004.

## Options considered

### Option A — TypeScript on Node.js, one language across engine, API and interface *(chosen; RULED at DR-117)*

Node.js at an LTS release, with the runtime version pinned as a register row
rather than asserted in a document (AC-74 · DR-023; Plan.md §2.7 "Versions").

- AC-59's "no adapter" becomes structural rather than aspirational: the wire
  types the API serves and the types the interface consumes are the *same
  declarations* in one package.
- AC-61's audit stays statically decidable in both directions, **in one type
  graph**. As authored this bullet hedged, because the then-expected clean-room
  fence would have split the checkout and forced the consumer side out through
  an exported manifest. **DR-069 ruled NO FENCE**: one repository, one checkout,
  one type graph, so producer *and* consumer sides are decided by the same
  static walk with no artifact crossing anything (ADR-0010's G1;
  [ADR-0016](ADR-0016-repository-layout-no-fence.md)).
- AC-35/AC-65 map onto discriminated unions plus compile-time exhaustiveness,
  with runtime closure from the same schema declaration.
- AC-09's purity becomes a build-time gate: a package with zero runtime
  dependencies and a lint rule banning `fs` / `net` / `Date` / `Math.random` /
  database imports (ADR-0004).
- AC-07 is achievable: JavaScript numbers are IEEE-754 doubles and
  `Number.prototype.toString` is shortest-round-trip, so a served number's
  decimal form is a pure function of the double.
- AC-60 is simplest when server-side rendering and the browser share one client
  implementation.

**DR-117 adds one row to this option that the C4 proposal did not state:
workers are TypeScript initially.** The durable-execution engine ruled at
DR-118 is reached through its TypeScript SDK
([ADR-0017](ADR-0017-durable-execution-hatchet.md)), so the runner, the
scheduler and every worker process stay inside the one type graph this option
exists to preserve. *"Initially"* is the ruling's own word: a later polyglot
worker lane is not foreclosed, and ADR-0017 records that the engine permits one
without a control-plane redesign — but adding one **spends** the property below,
and any such proposal must price it here rather than treat it as an
implementation detail.

### Option B — Python (FastAPI + SQLAlchemy/Alembic + Hypothesis) *(rejected at C4; ruled in at DR-105; ruled out again at DR-117)*

The strongest property-testing library in any ecosystem and the richest model
ecosystem. Rejected at C4 because AC-36 (DR-029 H1) already forbids calling model
SDKs outside the one provider interface, which flattens most of the ecosystem
advantage, and because it reintroduces exactly the cross-language wire boundary
AC-59 exists to delete: two type systems, a generated schema pipeline, and an
AC-61 orphan audit that cannot be answered in one pass.

**This option was subsequently ruled IN at DR-105 and fully worked, then ruled
OUT again at DR-117.** That episode is recorded at §"The superseded episode"
below — including the four replacement mechanisms it designed, which are the
honest measure of what a cross-language boundary costs. It is preserved as
history and as evidence; **it is not a live alternative and may not be cited as
one.**

### Option C — a compiled core (Rust/Go) behind a TypeScript shell *(rejected)*

The best determinism and performance story. Rejected because it splits AC-09's
purity gate and AC-85's "one behaviour lives in exactly one place" (charter
A3.1) across an FFI boundary, doubles the build and test toolchain, and raises
the cost of charter A5.3's "register change plus a re-run" for every upgrade
that touches the arithmetic (AC-84).

## Decision

**TypeScript on Node.js (LTS, version pinned as a register row), one language
across engine, API and interface; workers TypeScript initially.** Status:
**RULED at DR-117** by all the humans in the loop, at the stack sitting DR-116
mandated. *(The version values — Node LTS, pnpm, Postgres major, TypeScript —
remain register keys, valueless here, filled at S00 under DR-104's
resolve-on-machine rule.)*

Two elements ruled alongside it are carried by companion ADRs rather than here,
because each is a decision in its own right:

- **Durable execution** — Hatchet, self-hosted, Postgres-first
  ([ADR-0017](ADR-0017-durable-execution-hatchet.md); DR-118). It is reached
  from TypeScript workers and does not alter this ADR's type-graph argument.
- **Deployment topology and the local model** — Docker Compose on Hetzner behind
  Cloudflare, with vLLM as a separate service reached over HTTP
  ([ADR-0018](ADR-0018-deployment-topology.md); DR-117). vLLM is **not** a second
  language in V3: it is a service behind Seam C's one provider interface, and no
  V3 code imports it.

## Consequences

**Accepted:**

- The four obligations above become machine-checked rather than reviewed. This
  is the whole of the argument; nothing else in this ADR would justify the
  choice on its own.
- The version numbers (Node LTS, pnpm, Postgres major, TypeScript) are **not
  stated anywhere in the C4 set**. They are register keys whose values are V's
  at DR-023 (AC-74, AC-76 · DR-039), filled at S00 under **DR-104**. A builder
  who finds a version literal in source has found a defect.
- **The single type graph survives the durable-execution and deployment
  rulings.** Workers are TypeScript, the engine is reached through a TypeScript
  SDK, and vLLM is an HTTP service behind the gateway — so neither DR-117 nor
  DR-118 puts a second language inside the repository.

**Costs and risks:**

- ~~The single-type-graph property is **not free**: the clean-room fence splits
  the checkout, so AC-61's consumer side must be exported as a generated
  manifest.~~ **DISCHARGED by DR-069.** There is no fence, so the checkout is
  not split and the property is not paid for: AC-61's consumer side is decided
  by ADR-0010's intra-repo G1 walk. What is paid instead is DR-069's own
  accepted cost — **DR-003's clean-room mandate has no enforcement mechanism**,
  an honour system rather than a checked barrier, recorded as an accepted
  trade-off at [ADR-0016](ADR-0016-repository-layout-no-fence.md). That cost
  lands on clean-room discipline, **not** on this ADR's type-graph argument.
- Node's numeric behaviour gives byte-identical *formatting* of a double; it
  does **not** give byte-identical *arithmetic* under reordering, because a left
  fold is not bit-identical under reordering in IEEE-754 (AC-08). The recorded
  arrow order of ADR-0004 is what carries AC-07, and it must be recorded and
  re-consumed rather than re-derived.
- **A second runtime now exists in the deployment, though not in the
  repository**: the durable-execution engine is a Go service and vLLM is a Python
  service, both operated as containers
  ([ADR-0017](ADR-0017-durable-execution-hatchet.md),
  [ADR-0018](ADR-0018-deployment-topology.md)). This is an **operational**
  polyglot surface, not a code one — no V3 package imports either — and the
  distinction is exactly the one this ADR is about: the type-graph argument is a
  claim about *our source*, and neither service touches it. Recorded so that a
  later reader does not mistake the compose file for a breach of this decision,
  and does not mistake this decision for a licence to write a worker in another
  language.
- ~~If V ratifies a different language, Plan.md §9 states the blast radius.~~
  **This is now history rather than a hypothetical.** DR-105 ruled a different
  language, PRE-10 executed the bounded replacement across exactly the five ADRs
  this bullet predicted, and DR-117 reversed it. Plan.md §9's bound held in both
  directions: the context map, the data model and the API direction never moved.
  See §"The superseded episode".

## The superseded episode — the Python/FastAPI instantiation (DR-105 → DR-116 → DR-117)

**Preserved deliberately.** The pack's discipline is that a rejected option is
recorded with its reasons rather than dropped, and this option was more than
rejected — it was **ruled, fully worked, and then reversed by a wider
authority**. Deleting it would erase the only worked measurement V3 has of what
a cross-language wire boundary actually costs.

### The history, in three rulings

| Ruling | Date | What it did |
|---|---|---|
| **DR-105** | 2026-08-07 | V's clarification at the VG-01 sitting — *"keep FastAPI, but database on PostgreSQL"* — ruled GPG-2 **a replacement, not a confirmation**, superseding DR-104(2)'s reading. Engine = Python/FastAPI; database = PostgreSQL; kept UI stays TypeScript. Ordered the bounded re-instantiation of ADR-0001/0002/0003/0009/0012 and named the four replacement mechanisms to be designed. Status: **FINAL**. |
| **DR-116** | 2026-08-07 | **The backend stack decision belongs to all the humans in the loop**, taken at a sitting after pre-flight and before any backend code. **DR-105's status changed FINAL → CONDITIONAL**: the Python instantiation stood as V's prepared position, and PRE-10's rev-1 work proceeded as pre-flight so the sitting could choose between **two fully-worked options** rather than between a worked one and a sketch. |
| **DR-117** | 2026-08-07 | The stack sitting ruled. **DR-105 is SUPERSEDED**; the Python instantiation dies and the original TypeScript ADR text is the ruled text again. PRE-10 re-scoped to rev 2. **DR-116's sitting condition is SATISFIED.** |

**What DR-116 bought, and why it is worth recording.** The sitting did not choose
between a proposal and a memory: both options existed as complete, reviewable
instantiations with their mechanisms designed and their costs written down. The
rev-1 work was **not wasted by the reversal** — it was the input that made the
reversal an informed decision rather than a preference.

### What the Python instantiation had designed, and what it cost

The four obligations at §"Context" cannot be structural across a language
boundary. Rev 1 designed a mechanism for each; the summary is kept because it is
the price list for any future proposal to split the languages again.

| Obligation | The TS instantiation (operative) | What the Python instantiation had to build instead |
|---|---|---|
| **AC-59** — no adapter | the wire types served and the types consumed are the **same declarations** | one pydantic declaration → OpenAPI as a **build artifact, never checked in** → types-only TS codegen → a **byte-equality regeneration gate**. A generated mirror with a drift gate is not an adapter, but the property becomes **gate-enforced where it had been structural** |
| **AC-61** — bidirectional no-orphan | **one static walk over one type graph**, both directions | a **generated field inventory joining two graphs** on the OpenAPI pointer; consumer direction decided by the TypeScript checker; a third artifact sitting between the two sides |
| **AC-35 / AC-65** — closed vocabularies | discriminated unions + compile-time exhaustiveness from one declaration, reaching both sides | pydantic discriminated unions + `assert_never` + a lint asserting the **fall-through exists** + the surviving Postgres `CHECK`s + generated TS unions — **two checkers over two representations**, agreeing only by the generation step |
| **AC-09 / AC-48** — purity | zero-dependency package + the `no-impure-import` lint | **import-linter contracts** — the one mechanism that was *better*, because the edge table became a config file rather than rule code |

**The honest verdict, recorded at rev 1 and unchanged by the reversal:** three
gates carried what one identity carried, and a CI configuration that skipped any
of them re-opened defect D4. Two lockfiles, two type checkers, two test runners.
**Exactly one thing improved** — the import fence — and one thing was genuinely
better in kind: hypothesis over fast-check for charter S2's mandatory
P-D1…P-D5 layer.

**Two findings from the episode are carried forward into the operative text,
because they were true independently of the language:**

1. **`require-exhaustive-switch` needs a second half.** A switch with **no
   default branch at all** is silently non-exhaustive and gives the compiler
   nothing to complain about. The lint must assert the fall-through **exists**,
   not only that it is unreachable. This was discovered while re-expressing the
   gate for Python and is a real gap in the gate as originally written; it is
   folded into `03-module-design.md` §6.3.
2. **The replay ceremony cannot detect a seeded run.** A run built from stubbed
   artifacts replays byte-identically and passes, because replay checks
   arithmetic against records, not records against reality. This is why
   **DR-115**'s confinement clauses are the only barrier, and it is carried at
   [ADR-0012](ADR-0012-test-stack-and-replay-ceremony-isolation.md) clause 7 and
   [ADR-0009](ADR-0009-job-execution-in-postgres.md) clause 1.

### The status of this section

**Record, not option.** The Python instantiation may be cited as evidence of what
a language split costs, as the provenance of the two findings above, and as the
history of DR-105/DR-116/DR-117. It may **not** be cited as a live alternative,
a fallback, or a precedent for reintroducing a second language into the
repository. Re-opening it requires a new human sitting under DR-116's rule.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-59 — no adapter under the kept interface | DR-048; spec §12.6 | one set of wire-type declarations, consumed by both sides |
| AC-60 — one transport front door | ui §1.4 L5 (DR-048) | one client implementation shared by SSR and browser; the law holds through the Cloudflare proxy ([ADR-0018](ADR-0018-deployment-topology.md)) |
| AC-61 — bidirectional no-orphan | DR-047 clause 4; ui §1.4 L6, §1.3 E1 | field reference reachability decided statically in one type graph |
| AC-35 / AC-65 — closed vocabularies, loud failure | manifest §4.4, §6.3, §6.4; DR-051; spec §12.3 | discriminated unions + exhaustiveness + one runtime schema declaration |
| AC-09 — pure propagation | DR-029 H3; spec §19 H3; manifest §11 | a zero-dependency package plus the lint gate of ADR-0004 |
| AC-07 / AC-08 — byte-identical numbers, recorded order | DR-060(b), DR-063 VR-3, charter S1; spec §12.5 S-21; manifest §8.2g | IEEE-754 doubles + shortest-round-trip formatting; ordering delegated to ADR-0004 |
| AC-36 — one provider interface | DR-029 H1; spec §19 H1 | (negative) removes the model-SDK ecosystem from the comparison; **vLLM is one adapter behind that interface, not an exception to it** ([ADR-0018](ADR-0018-deployment-topology.md)) |
| AC-74 / AC-76 — constants are register rows, no invented numbers | DR-023, DR-039; spec §20 W-5 | runtime and toolchain versions ship as register keys, valueless here |
| AC-82 — greenfield, new repo | DR-031 knob 1; DR-065 | no inherited toolchain constraint applies |
| AC-01 — Postgres, including observability | DR-024; **DR-117** | unchanged and re-affirmed at the stack sitting |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.
**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-01 / Q-02 (DR-068 / DR-069)** — kept UI component source **MAY**
  be carried into `DebateAI-V3`, and there is **NO FENCE**. The type graph does
  not split at all, which strengthens rather than changes this ADR's argument:
  AC-61 is decided in one walk, and ADR-0010's manifest mechanism — the part
  that depended on the answer — is voided
  ([ADR-0016](ADR-0016-repository-layout-no-fence.md)).

**Still reserved (not a Q-nn):**

- **The stack's acceptance.** Accepted **wholesale** at DR-098 (VS-1) as part of
  the C4 artifact set; **itemized at the DR-117 human sitting**, where the
  language, the API framework, the database tooling, durable execution, workers,
  the local model and the deployment target were each named. **GPG-2 is
  discharged.**
- **The version values.** Node LTS, pnpm, Postgres major and TypeScript are
  register keys and **remain valueless here** (AC-74/AC-76 · DR-023, DR-039).
  They fill at **S00** under **DR-104**'s resolve-on-machine rule, recorded in
  `register.bootstrap.json` and a ledger follow-up row. A builder who finds a
  version literal in source has found a defect.
- **A polyglot worker lane.** DR-117's *"workers TypeScript initially"* leaves
  the door open and this ADR does not close it — but it prices it: a second
  worker language spends the single-type-graph property, and the superseded
  episode above is the measurement of what that costs.

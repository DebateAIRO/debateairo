# ADR-0012 — The test stack, and the replay ceremony's isolation

| Field | Value |
|---|---|
| **Status** | **RULED — DR-117 (V + the human stack sitting, FINAL).** **Vitest · fast-check · Testcontainers + real Postgres · schema-driven contract tests from `packages/contract`.** This is the original C4 instantiation, **restored as the ruled text**; the pytest/hypothesis episode of DR-105 is **SUPERSEDED** and recorded at §"The superseded episode". **Clause 7 (DR-115 fixture confinement) survives the reversal** — it was never a language clause. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 · re-instantiated 2026-08-07 (DR-105) · **restored and ruled 2026-08-07 (DR-117)** |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. **Ruled at the DR-117 stack sitting**; clause 7 added under **DR-115**. Executed as PRE-10 rev 2. |
| **Source of record** | Plan.md rev 3, §2.5 and §2.5a, with §2.6 (structural rules 1 and 3), §2.7 (CI gates) and §6.3 U-3; PROG-V3-R1 ledger **DR-115**, **DR-117** |

## Context

**The replay law is the constraint this ADR exists for.** V3 permanently refuses
to serve a number it cannot recompute from its own frozen records; **no model in
the replay path**; and the property is **continuously self-tested**
(AC-06 · DR-034; spec §12.5 S-17; manifest §8.3). Numbers replay
byte-identically and the serve decision replays as stored data
(AC-07 · DR-060(b), DR-063 VR-3; charter S1).

AC-07 also fixes what "independent" means: **ceremony independence is a separate
execution sharing no code path beyond the published arithmetic.** Charter S1 adds
that the ceremony must be run by a **person or job that did not produce** the
numbers.

Two further constraints bound the answer hard:

- **AC-14** — one scoring engine; **no second scoring path anywhere in V3**
  (DR-030 J1; spec §18 O-1).
- **AC-85** — one behaviour lives in exactly one place; two implementations of
  one behaviour is a defect (charter A3.1).

And the test layers themselves are constrained: **AC-80** fixes ground truth as
**two published literature vectors plus property tests of V3's own rules, with
no conformance test against V2 at any level** (DR-033; spec §22 Z-2; manifest
§12), and **AC-79** requires every gate to be **shown to fire both ways** before
it counts as adopted (DR-063 VR-1/VR-5; spec §22 Z-1).

## Options considered

### For the ceremony — the pack enumerates three and rejects two

VR-3's own ruled text considers:

- **(i) the same code in a fresh process** — **rejected in the ruled text**
  ("proves little");
- **(iii) an independent re-implementation** — **rejected in the ruled text**
  (disproportionate at launch);
- **(ii) a separate execution sharing no code path with the serving run beyond
  the published arithmetic** — **adopted**.

### Within option (ii), one further sub-option is rejected here

**A self-contained `agg`/`σ`/product duplicated inside `apps/replay`.**
Rejected, and Plan.md §2.5a records why it is a defect rather than a nuance: a
duplicate is a **second implementation of the scoring arithmetic inside V3**,
forbidden by AC-14 and AC-85 — the same refusal §3.3's anti-pattern list already
applies to the debug facet, the preview and the interface. It would also be
live: a ceremony `σ` written with `>` where the engine uses `≥` breaks every
tie-boundary node (manifest §4.2b makes `≥` the clause that keeps the aggregation
discontinuity-free and the tie case exactly `τ`), and **the pack has no rule for
adjudicating a ceremony-vs-serving disagreement** — so the BLOCKING launch gate
would report a serving defect that does not exist, or mask a real one when both
copies are edited in the same commit.

### For the test layers

Rejected alternatives are recorded per row in the decision table below.

## Decision

### 1. The shared boundary is one named package, and no exemption is needed

**`packages/published-arithmetic`** — `agg`, `σ`, the product, **zero
dependencies**, no V3-specific rule — is imported by **both** `propagation` and
`apps/replay`. **No exemption is required, because VR-3 licenses the sharing in
its own ruled text**: "sharing no code path with the serving run **beyond the
published arithmetic**". One behaviour, one place (AC-85); one scoring path
(AC-14); one shared module, which VR-3 permits by name.

The boundary matters because **everything else in `packages/propagation` is V3's
own re-specification** — the lifting rule and its markers, operator selection and
resolution level, cluster collapse, the fingerprint. `apps/replay` imports **no
other workspace package**, and every V3-specific structural outcome — lift
targets and both-ends markers, cluster-collapse records, the effective operator
and its resolution level, the recorded arrow order — is **read from the frozen
`propagation_run` / `node_strength_record` rows as data, never recomputed**.
Otherwise a defect in the shared collapse or lift rule reproduces identically on
both sides and the ceremony reports agreement while proving nothing.

### 2. All three independence limbs are carried

| Limb | Source | Carried by |
|---|---|---|
| **(i) Code independence** | VR-3 option (ii) | `apps/replay` imports only `published-arithmetic`; structural rule 3 makes it a dependency-graph property |
| **(ii) Frozen records only** | AC-06 / DR-034 | a read-only database reader, no other input |
| **(iii) Operator independence** | charter S1 ("run by a person or job that did not produce them") | a **job with read-only database credentials, scheduled separately from the acceptance run, reading run ids it did not write** |

Limb (iii) is not decorative: the obvious CI shape — the acceptance job produces
runs and then replays them in the same job on the same worker — satisfies limbs
(i) and (ii) and **defeats the failure limb (iii) guards**.

### 3. Two attestations, not one — both S1 gates, both in the S15 bundle

- **The isolation proof.** An artifact naming every symbol `apps/replay` shares
  with `apps/api` / `apps/runner`, **pinned at SYMBOL granularity, not package
  granularity: exactly `agg`, `σ` and `product`.** Package granularity would be
  satisfied by a `published-arithmetic` that had grown past the published
  definitions, and VR-3's licence covers sharing nothing *beyond* them. **The
  same artifact fails if `apps/replay` declares any local arithmetic symbol of
  its own** — structural rule 3 checks *imports* and the proof lists *shared*
  symbols, so without this clause a privately duplicated `agg`/`σ`/product inside
  `apps/replay` is caught by no gate at all, and that duplicate is precisely the
  AC-14/AC-85 breach clause 1 exists to prevent. A one-line CI assertion pins
  `packages/published-arithmetic`'s **exported surface** to the same three
  symbols.
- **The operator attestation.** The executing principal, its credential scope,
  and the run ids it did not produce.

**One clause is retained from the superseded pass, because it is a real gap in
the proof as originally written and it is language-neutral:** the proof must read
**the names `apps/replay` actually imports**, not the exported surface it is
offered. An export pin and an import list answer different questions, and only
the second one is what limb (i) asks. The local-duplicate half above is the
other half of the same point.

### 4. Drift control on the shared module

The two literature vectors (manifest §4.5) and the tie-boundary case run against
`published-arithmetic` in CI, so an arithmetic change is caught **as an
arithmetic change**.

### 5. The test layers

| Layer | Decision | Constraint it serves — and the rejected alternative |
|---|---|---|
| Unit / integration | **Vitest** | one runner across every package, so charter G2's call instrumentation has one hook. *Rejected: a heavier alternative runner, for no gain here.* |
| Property tests | **fast-check** | AC-80 and manifest §12.2 require generated graphs with **declared preconditions** and exclusion sets (manifest §4.5); shrinking is what makes a P-D1…P-D5 failure actionable. *Rejected: hand-rolled generators — no shrinking, and the exclusion sets become untestable prose.* **The suite runs on a pinned seed in CI**, so a red build is re-runnable — AC-79's fire-both-ways evidence is worthless if it cannot be reproduced. *(Clause retained from the superseded pass; it is a property of generative testing, not of one library.)* |
| Database tests | **Testcontainers + real Postgres** | AC-01/AC-04 make a substitute a category error: the constraints, triggers, advisory locks and claim semantics under test are Postgres behaviours. *Rejected: an in-memory or differently-shaped double — it would test a store V3 does not have.* The container's image tag is the `postgresMajorVersion` bootstrap pin read through the register loader, **never a literal in a test file** (AC-74). |
| Contract tests | **schema-driven from `packages/contract`** | re-authors the interface contract tests against the declared contract rather than interface source text (ui §5 W7). *Rejected: recorded-response snapshot tests — a snapshot asserts what the server happened to send, which is how a served-but-unread field survives an audit (AC-61).* |
| Replay ceremony | **`apps/replay`**, per clauses 1–4 | AC-06, AC-07, charter S1 / VR-3 |
| Acceptance bundle | **`tools/acceptance-bundle`** | emits the never-called list (AC-77, charter A4.2), the §5.2 firing-fixture ids (A4.4) and the entry-point list G1 walked (A4.5) |

**Where the durable-execution engine sits in this table: nowhere, deliberately.**
DR-118's engine is a **dispatcher** ([ADR-0017](ADR-0017-durable-execution-hatchet.md)),
so the unit, property and contract layers do not involve it, and the
database-invariant layer tests **our** schema against a real Postgres exactly as
before. Where a test needs the engine present — the runner's dispatch path — it
is a compose concern (`07-build-order.md` S0's dev-compose row), not a new test
layer. **A test that needs the engine to prove a claim-before-call law has
misplaced the law**: those laws are ours and are asserted against
`core.work_item` and the ledger.

### 6. The fire-both-ways bar, and what "demonstrably fire" means

Plan.md §6.3 U-3 disposes the two apparent routes as **one route**
(**RESOLVED-BY-PACK**): charter VR-1 (`OD-C-02`, ratified by DR-063) states the
three-part bar — shown-to-fire-both-ways as the **adoption** bar, fires-at-least-once
as the **launch-day minimum**, rate-consistency as a **standing SETTLE-stage
monitor** — and the charter is the acceptance artifact whose §5.2 fixture table is
BLOCKING (VR-5). Architecture owes the labelled **should-not-fire** case as part
of each fixture.

### 7. Fixture confinement — the test layer never reaches a run (`RULED — DR-115`)

**V's standing law: NO SCAFFOLDED DATA — NO CHEATING ON GENERATION.** *"The
algorithm never fabricates runtime data: every judgement, composition, evidence
item, score and served artifact in any run comes from REAL model calls, real
retrieval and real computation — no stubbed judge responses, no hardcoded sample
debates, no seeded artifacts masquerading as generation, no demo data on
production paths."* This ADR is one of the two the ruling names, because a test
strategy is precisely where the temptation lives: the fixtures above are the most
convenient fake data in the repository.

**This clause survived the DR-117 reversal unchanged**, which is the clearest
evidence that it was never a language clause.

**The fixtures stay legal, exactly where the pack mandates them — and confined.**
DR-115 is explicit that they *"remain LEGAL exactly where the pack mandates them —
confined to the test layer, clearly labeled, never seeded into a served run and
never crossing into runtime paths."* Four clauses make that checkable:

1. **Named inventory of everything this document authorizes as synthetic.** The
   **two literature vectors** (§4's drift control, manifest §4.5), the **property
   generators** of the layer-1 and layer-2 suites, **the one synthetic settled
   outcome** the settlement fixture requires, and the **DDL fixtures** that insert
   through the raw connection. That list is exhaustive **against this ADR**: a
   synthetic artifact not on it, and not mandated by the pack elsewhere, is not
   authorized by this decision.
2. **They live in the test layer and are imported by nothing else.** No engine
   package, no `apps/*` unit and no migration may import a fixture module.
   Mechanically this is the same kind of statement as the purity fences and is
   carried the same way — a **dependency-graph assertion** from the production
   packages to the fixture packages, alongside structural rules 1–5. A fence, not
   a convention.
3. **They are labeled at the artifact, not only at the file.** A synthetic settled
   outcome or a generated graph carries a **typed marker in the record itself**, so
   that a row which somehow reached a database is identifiable as synthetic by
   reading the row rather than by tracing which test wrote it. An unlabeled fake is
   indistinguishable from a real one the moment it escapes, which is the whole
   failure mode.
4. **No fixture is ever a fallback.** The prohibition this clause guards is not
   only *"do not seed a run"* — it is *"never substitute a fixture for a call that
   failed"*. A judge that returns nothing produces **no arrow and a typed record**
   (AC-21, P-D1); it does **not** produce a sample judgement. This is D1's
   no-invented-numbers law extended from constants to whole artifacts, which is
   exactly how DR-115 states its own scope.

**And the replay ceremony is where a breach would be invisible.** `apps/replay`
reads **frozen records only** (limb (ii)) and recomputes with **no model in the
path** (AC-06). A run seeded with a stubbed judgement would replay
**byte-identically and pass**, because replay checks arithmetic against records,
not records against reality. The ceremony therefore proves nothing about
DR-115 — **it cannot**, by construction — and clauses 1–4 are the only thing
standing between a scaffolded run and a green launch gate.

**One engine-shaped variant, named because DR-118 makes it reachable.** A durable-
execution engine that memoizes or replays a completed task's stored output is
**not** a DR-115 breach *if* that output came from a real call the gateway
already ledgered. It **is** a breach the moment a stored task output is treated
as an artifact without a gateway write behind it, or a fixture value is ever
written into engine state on a runtime path
(`ratification/hatchet-vs-inngest-grok.md` §C law 5).

**Force.** DR-115 makes a scaffolded-data path a **BLOCKING finding in review** on
every implementation ticket, and instructs reviewers to hunt for it. Nothing in
this ADR softens that.

Status: **RULED at DR-117**, with clause 7 under **DR-115**.

## Consequences

**Accepted:**

- The ceremony is independent in all three senses the pack names, and each sense
  has an artifact that proves it rather than a claim that asserts it.
- AC-14 and AC-85 survive the ceremony: there is exactly one implementation of
  the published arithmetic in V3, in a package with zero dependencies.
- The CI gate list is fixed (Plan.md §2.7): typecheck · lint · unit · property ·
  db-integration · contract · replay self-test · orphan audit (report) ·
  never-called list (**blocking**) · firing-fixture presence (**blocking**).
  **Its membership survived both the replacement and the restoration.**
- **One type system, one runner, one coverage source.** G2's *"called at least
  once on a real run"* instrumentation has a single hook, which is the property
  the superseded pass had to split across two runners and re-join.

**Costs and risks:**

- The symbol-granularity pin is fragile in a useful way: any growth of
  `published-arithmetic` past `agg`, `σ` and `product` fails CI. That is the
  intent — the licence covers those three and nothing beyond them — but it means
  a builder who "just needs one helper there" must instead put it in
  `propagation`.
- Limb (iii) constrains the deployment pipeline, not only the code: a scheduler
  and a separate read-only credential must exist before the ceremony gate can
  pass. That is an infrastructure dependency the build order must carry, and
  [ADR-0018](ADR-0018-deployment-topology.md) is where the compose topology for
  it lands.
- Reading every structural outcome from frozen rows makes the ceremony sensitive
  to the completeness of `propagation_run` and `node_strength_record`. A field
  the engine computes but does not record is a field the ceremony cannot check,
  and the failure mode is a **silent pass**.
- **The ceremony cannot see a DR-115 breach** (clause 7). This is the sharpest
  limitation in the document and it is stated where a reader will meet it rather
  than left to be discovered.

## The superseded episode — pytest / hypothesis / testcontainers-python (DR-105 → DR-116 → DR-117)

**DR-105** ruled the engine Python; **DR-116** made it CONDITIONAL pending the
human sitting; **DR-117** superseded it. The three-ruling history is at
[ADR-0001](ADR-0001-language-and-runtime.md) §"The superseded episode".

**The ceremony did not move at all**, in either direction — VR-3's licence, the
three limbs, the two attestations, symbol granularity, drift control and the
fire-both-ways bar are properties of *what shares code with what*. What the
rev-1 pass had to solve was narrower and more interesting: **Python has no
compiled export surface**, so the symbol pin was re-expressed as `__all__` plus
an import-name walk plus an AST check for a local duplicate. **Two of those three
clauses came back into the operative text** (clause 3's retained paragraph),
because the insight — *an export pin and an import list answer different
questions* — was never about Python.

**What the episode genuinely bought and then gave back:** hypothesis over
fast-check for charter S2's mandatory P-D1…P-D5 layer. It was recorded at rev 1
as the one place the language ruling improved something, and the reversal gives
it up knowingly. What survives is the **pinned-seed clause** in the §5 table —
generative determinism is a property of generative testing, and fast-check
needs it as much as hypothesis did.

**Status: record, not option.**

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-06 — replay law, no model in the path, continuously self-tested | DR-034; spec §12.5 S-17; manifest §8.3 | `apps/replay` as a frozen-records-only reader, run in CI |
| AC-07 — byte-identical numbers; ceremony independence | DR-060(b), DR-063 VR-3; charter S1 | the three limbs and the two attestations |
| AC-14 — one scoring engine, no second path | DR-030 J1; spec §18 O-1 | one `published-arithmetic`; no local duplicate permitted |
| AC-85 — one behaviour, one place | charter A3.1, A3.3 | the same, enforced by the isolation proof at symbol granularity |
| AC-80 — ground truth is the two vectors + property tests; no V2 conformance | DR-033; spec §22 Z-2; manifest §12 | the property and vector layers; no V2 comparison at any level |
| AC-79 — every gate fires both ways | DR-063 VR-1/VR-5; spec §22 Z-1 | the labelled should-not-fire case owed per fixture; **the pinned seed that makes the evidence re-runnable** |
| AC-01 / AC-04 — Postgres behaviours are what is under test | DR-024; spec §20 W-4 | real Postgres in database tests |
| AC-61 — bidirectional field inventory | DR-047 clause 4; ui §1.4 L6 | schema-driven contract tests instead of snapshots |
| AC-77 — never-called list blocks the release | DR-047 clause 4; charter §5, A4.2 | `tools/acceptance-bundle`; the blocking CI gates |
| AC-09 / AC-48 — purity fences | DR-029 H3; manifest §7.2a–f | structural rules 1 and 5, checked in CI (ADR-0004) |
| **DR-115** — no scaffolded data; every runtime artifact is a real call, real retrieval, real computation | PROG-V3-R1 ledger DR-115 (V-RULING, FINAL) | **clause 7** — the named synthetic inventory, the dependency fence from production to fixtures, the typed synthetic marker on the artifact, and the no-fallback rule. Stated with the ceremony's blind spot named: replay **cannot** detect a seeded run |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.

**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-11 (DR-079)** — the non-node senses of "load-bearing" project
  from the charter's node definition (a sentence is load-bearing iff it asserts
  a fact drawn from a load-bearing node or states a served number). Conformance
  sampling therefore has a real coverage rule from S5. **S0's behaviour is
  unchanged**: judging every segment stays legal — charter A2.5 forbids skipping
  the conformance **role**, never mandating sampling — so S0 still runs
  conformance **exhaustively**, with no consumption of the run's stranger sample
  rate for coverage.
- **RULED — Q-09 (DR-077)** — a judge's earned weight **multiplies the served
  arithmetic**, consumed in the **selection** of which judgement becomes the
  reduced score under a declared rule, **never by averaging**; dispersion is
  measured and served separately. **P-D5's "at least one judge's weight moves"
  now has a real assertion target**, which is what the question blocked on.
- **RULED — Q-01 / Q-02 (DR-068 / DR-069)** — kept UI source is carried in and
  there is **NO FENCE**, so the interface's contract tests run **inside the
  engine's own CI, in one workspace** — no split pipeline, no cross-checkout
  coordination ([ADR-0016](ADR-0016-repository-layout-no-fence.md)).

**Still reserved (not a Q-nn):** the **per-layer tool rows** were ruled as part
of the stack at **DR-117**; their **versions** are lockfile pins and never source
or document literals (AC-74, AC-76 · DR-039).

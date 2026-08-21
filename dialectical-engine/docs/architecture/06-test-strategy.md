> **ACCEPTED ARCHITECTURE.** VS-1 is ratified (**DR-098**), amendments
> A-01…A-13 are accepted (**DR-099**), and **ARCHITECTURE SATISFIED** is emitted
> under V's authority (**DR-100**) — the ARCH-V3-R1 architecture loop is CLOSED.
> The provisional-status banner that headed this file is removed under DR-100's
> follow-through, which
> also directs this fold-in. **All 28 questions of `08-open-questions-for-V.md`
> are RULED** (DR-068…DR-097), so **no fixture in this document is `pending V`
> any more**: every row that was gated on a question now names the DR that ruled
> it, and the constructibility consequence is stated. **What did not change: no
> number is invented** — a ruling that makes a fixture constructible does not
> supply its constants, which are still V's at DR-023 (AC-76, DR-039).

# 06 — Test strategy

ARCH-V3-R1 / C4 · 2026-08-05 · authored from `Plan.md` rev 3 §7 row 7 and §8's
gate columns · **rulings folded in 2026-08-06 under PROG-V3-R1 ticket PRE-03**
(DR-100 follow-through; DR-102) · **stack ruled 2026-08-07 under PROG-V3-R1
ticket PRE-10 rev 2** (**DR-117**, **DR-118**). **Every id this seat minted is a
seat proposal; the rulings folded in are V's and are FINAL.** Every normative
sentence cites the AC row and/or the DR / founding-doc section that imposes it.
An uncited normative sentence in this file is a defect.

> **`RULED — DR-117` — the stack, and what it touched here.** All the humans in
> the loop ruled the coding stack at the sitting DR-116 mandated: **TypeScript on
> Node**, **Fastify + SSE**, **PostgreSQL + Drizzle**, **Vitest / fast-check /
> Testcontainers**, with **Hatchet** for durable execution (DR-118). In this
> document that reaches **§2's stack table** and **§14's CI stage list** — and
> nothing else.
>
> **No fixture id was minted, renamed or retired; no assertion changed; no force
> column changed; no number was supplied.** That is true of *both* passes over
> this file: an earlier ruling (**DR-105**) replaced the engine language with
> Python and PRE-10 rev 1 re-expressed §2 and §14 for it, and **DR-117 superseded
> that**, restoring the text above. Every `FX-*` row asserted the same behaviour
> throughout, because a fixture asserts a *behaviour* and no behaviour moved. The
> episode is recorded at `01-decisions/README.md` §5.6, not here.
>
> **Two clauses in §2 are retained from that superseded pass**, flagged where they
> appear, because each is a property of testing rather than of a language.

---

## 0. How to read this document

**What it is.** The single place that says *what V3 must prove about itself, and
by which named artifact*. It defines four test layers, a fixture id for every
obligation the pack makes checkable, and the discipline that decides when a gate
counts as adopted. It is the document `tools/acceptance-bundle` is assembled
against (charter A4.4: every blocking path has *"a recorded firing fixture in the
acceptance bundle, named by fixture id"*).

**What it is not.** No test code (Plan §7 row 7's out-of-scope column). No
per-slice entry criteria and no launch-readiness matrix — those are
`07-build-order.md`'s. No AC→module→table→endpoint index — that is
`09-traceability.md`'s. Where this document names a slice it is quoting Plan §8's
gate column, so a fixture can be found; it is not re-deciding the build order.

**Vocabulary.** `spec` = `docs/founding/requirements-spec.md`; `manifest` =
`docs/founding/carryover-manifest.md`; `charter` = `docs/founding/quality-charter.md`;
`ui` = `docs/founding/ui-boundary-contract.md`; `ledger` =
`docs/founding/decisions-ledger.md` (DR-001…DR-067). `AC-nn` are Plan §1's
consolidated constraint rows. Order of authority: **the ledger wins over a
founding doc; a founding doc wins over a digest** (spec §2 item 1).

**Fixture ids.** Every obligation below carries an id of the form
`FX-<AREA>-<nn>`, and a paired obligation carries `a`/`b` suffixes (`FX-LED-01a`
fires, `FX-LED-01b` correctly does not). Areas: `LV` literature vectors and
accumulate properties · `PT` property tests · `HR` house-rule gates · `LG` law
gates · `C52` charter §5.2 blocking rows · `DEF` deferred-gate attestations ·
`S22` spec §22.1 launch gates not otherwise mapped · `DB` database-invariant
fixtures · `LED` ledger and replay · `SRV` serve · `WIRE` front-door and wire
surfaces · `IND` replay-ceremony independence artifacts · `PRV` provider and
maker inventory · `ORPH` orphan audits. The id is an identifier, not a
measurement (AC-76). The full roster is §15.

**Force.** Three values, and they are the pack's, not this document's
(charter VR-5):

| Force | Meaning | Authority |
|---|---|---|
| **BLOCKING** | a missing or failing artifact stops the release | charter §5.2 table + the never-called list (VR-5, A4.2, A4.4) |
| **LAUNCH GATE** | named in spec §22.1 as checkable at launch | spec §22.1 |
| **ADVISORY** | runs in CI and reports; does not block on its own | charter A4.1, VR-5 (G1, G4, G5, the generalized G3, the drills) |

**Open questions — all ruled.** This document never rules a V-QUESTION (packet
law 5) and still does not; it now **carries** the rulings. Where a row previously
read **pending V — `Q-nn`** it now reads **`RULED — DR-nnn`**, followed by what
the ruling did to that fixture's *constructibility* or *content*. Three shapes
recur and are worth naming once:

| Shape | What the row says | Example |
|---|---|---|
| **Constructible now** | the ruling supplied the missing fact and the fixture can be built | `FX-S22-02` after DR-092 |
| **Limb deleted** | the ruling removed the thing the limb was asserting; the assertion is replaced, not weakened | `FX-PT-D2`'s undeclared-parent limb after DR-074 |
| **Still waits on a value, not a question** | the ruling created or confirmed a register row; the fixture waits on **DR-023**, which is ratification, not an open question | `FX-SRV-13`'s cut points |

`08-open-questions-for-V.md` remains the register of what was asked and which DR
answered it. The full question → ruling map for this document is §16.

---

## 1. The two standing prohibitions

**P1 — no V2 comparison, at any level (AC-80).** V3's math is tested against
**two published literature vectors** (external ground truth) plus **property
tests of V3's own rules**. *"No conformance test against V2 exists at any level"*
(spec §22 Z-2, `RULED(DR-033)`). The MUST-MATCH class is dead; the V2 vector
recorder is out of scope; DR-024's clause naming it *"the sole
scoring-ground-truth source"* is superseded (manifest §12.1 items 1–3). **No
fixture in this document carries a V2 expected output, a V2 recorded pair, or a
V2 baseline** — including as a tolerance, a sanity bound or a commented
reference.

**P2 — the clean-room split is binding (AC-81, manifest §14).** Whoever
implements V3's organs may read only the manifest, never V2 source; a missing
fact is obtained by **amending the manifest**, not by looking at V2. **The
literature vectors are the exemption** (DR-003, DR-033; manifest §14
consequence 2), and they are read from **manifest §4.5's own text**, which is
where this document takes them from.

**`RULED — DR-068 / DR-069`, and this changes what P2 can be tested by.**
Q-01: kept UI component source **may** be carried into `DebateAI-V3`. Q-02:
**NO FENCE** — the kept UI package sits in the repository as a **plain,
always-visible package** beside the engine packages, not a separate workspace
and not a separate repository. V chose this **after the cost was priced**, and
the priced cost is a test-strategy fact, recorded here rather than softened:

> **DR-003's clean-room mandate has no enforcement mechanism under this
> ruling — compliance is an honour system, not a checked barrier.**

Three consequences for this document, each stated so nothing is over- or
under-claimed:

1. **P2 remains binding as a prohibition.** DR-069 removed the *barrier*, not
   the *rule*. AC-81 and manifest §14 are untouched: reading V2 engine source
   still voids the split *"regardless of intent"*, and **P1's prohibition on any
   V2 expected output, recorded pair or baseline is unaffected** — that one *is*
   mechanically checkable, and every fixture below is still bound by it.
2. **No CI check substitutes for it, and now none is claimed to.** Previously
   this paragraph rested the barrier on **checkout separation** while noting a
   reading violation is not CI-detectable. The checkout separation is gone, so
   the honest statement is the ruling's own: the remaining guard is the role
   split itself. **This document invents no test for it** — an invented
   conformance check here would be exactly the dead check charter G3 indicts.
3. **The consumer-manifest mechanism is not required** (DR-069, §2.6/§2.7's
   fence-cost). `FX-ORPH-01`'s mechanism text is repaired accordingly at §11 —
   the manifest is replaced as a required build input by the **intra-repo static
   type-graph pass**, a repair directed to this ticket by
   `07-build-order.md` §3.4 (PRE-01 lane).

**Accepted trade-off, not a gap** (DR-069's own condition): it is **not to be
re-raised as an open question**, and AC-81's launch attestation (`TRACE-6`,
*unfixturable by ruling*) remains its only acceptance-bundle expression.

---

## 2. The test stack, and why each constraint needs it

From Plan §2.5, **`RULED — DR-117`**. The per-layer rows are argued with their
rejected alternatives at
`01-decisions/ADR-0012-test-stack-and-replay-ceremony-isolation.md` §5. **The
constraint column has never moved** — through the C4 proposal, the superseded
DR-105 pass and this restoration, it is the same column.

| Layer of the stack | Tool | The constraint that needs it |
|---|---|---|
| Unit / integration | **Vitest** | one runner across every package, so charter G2's *"called at least once on a real run"* instrumentation has **one** hook — **one language, one runner, one coverage source** (`RULED — DR-117`) |
| Property tests | **fast-check** | manifest §4.5's **declared preconditions and exclusion sets** must be encoded in generators, and shrinking is what makes a P-D1…P-D5 failure actionable. **The suite runs on a pinned seed in CI** — a corpus that varies per run makes a red build unreproducible, and AC-79's fire-both-ways evidence must be re-runnable. *(Clause retained from the superseded pass; generative determinism is a property of generative testing, not of one library.)* |
| Database tests | **Testcontainers + real Postgres** | AC-01/AC-04: the constraints, triggers, advisory locks and `SKIP LOCKED` semantics under test **are** Postgres behaviours; an in-memory double would test a store V3 does not have. The container's image tag is the `postgresMajorVersion` bootstrap pin read through the register loader, **never a literal in a test file** (AC-74) |
| Contract tests | **schema-driven from `packages/contract`** | a recorded-response snapshot asserts what the server happened to send, which is how a served-but-unread field survives an audit (AC-61). The interface test suite ui §5 W7 carries forward is **re-authored against the declared contract**, not against interface source text and not against recorded responses |
| Replay ceremony | **`apps/replay`**, a separate executable sharing exactly one package (`published-arithmetic`) and run by a separate principal | charter S1 / DR-063 VR-3's three independence limbs — see §9.1. **Its separateness is now a topology fact**: a separately-scheduled job with its own read-only credential (`01-decisions/ADR-0018-deployment-topology.md` clause 2) |
| Acceptance bundle | **`tools/acceptance-bundle`** | emits the never-called list (AC-77, A4.2), the §5.2 firing-fixture ids (A4.4) and the entry-point list G1 walked (A4.5) |

**Where the durable-execution engine sits in this table: nowhere, deliberately.**
DR-118's Hatchet is a **dispatcher**
(`01-decisions/ADR-0017-durable-execution-hatchet.md`), so the unit, property and
contract layers do not involve it, and the database-invariant layer tests **our**
schema against a real Postgres exactly as before. Where a test needs the engine
present — the runner's dispatch path — it is a compose concern
(`07-build-order.md` S0's dev-compose row), not a new test layer. **A test that
needs the engine to prove a claim-before-call law has misplaced the law**: those
laws are ours and are asserted against `core.work_item` and the ledger.

**The database-fixture discipline, stated once (Plan §2.4, §4.2).** *Every*
fixture for a DDL invariant **exercises the migrated database directly —
inserting through the connection, bypassing every application validator** — or
it tests the restatement rather than the authority. **"The connection" means the
raw driver connection**, not an ORM session and not a repository helper: a fixture
that inserts through any application layer has stopped testing the DDL (ADR-0003
rule 2). Canonical DDL ownership is single and named (the migration that creates
the table); application-level checks exist for error quality and are never the
authority (AC-85). Every `FX-DB-*` row below is bound by this rule, and **not one
of those rows changed in either pass** — the DDL they assert is in
`02-data-model.md`, which neither the re-instantiation nor the restoration opened.

---

## 3. Layer 1 — external ground truth

*Manifest §12.2 layer 1: the two published literature vectors, reproduced
exactly, plus the corrected monotonicity and determinism properties with their
strictness preconditions encoded in the generators. These are the authors'
numbers, not V2's, and carry zero contamination.*

### 3.1 The two literature vectors

Quoted from manifest §4.5 (`CARRIED-DESIGN`); no number here is this document's.

| id | Vector | Inputs | Required outputs | Force |
|---|---|---|---|---|
| **FX-LV-01** | **Literature vector 1** — arXiv:2307.13582 Fig. 3 | all τ = 0.5; supports `B→A, C→A`; attacks `D→A, E→B, F→D, G→F, H→F` | `F = 0.125`, `B = 0.25`, `D = 0.4375`, `A = 0.59375`; leaves `C, E, G, H = 0.5` | LAUNCH GATE (Plan §8 S3: *"both literature vectors reproduce"*) |
| **FX-LV-02** | **Literature vector 2** — arXiv:2407.08497 Fig. 1 | τ: `alpha 0.5, beta 0.3, gamma 0.6, rho 0.7, zeta 0.4`; supports `beta→alpha, zeta→gamma`; attacks `gamma→alpha, rho→beta` | `zeta = 0.4`, `rho = 0.7`, `gamma = 0.76`, `beta = 0.09`, `alpha = 0.165` | LAUNCH GATE |

Both run against **`packages/published-arithmetic`** as well as through
`packages/propagation`, as drift control: an arithmetic change is then caught
**as an arithmetic change** rather than as a ceremony disagreement with no
adjudication rule (Plan §2.5a).

### 3.2 The accumulate operator's non-strict properties

Manifest §4.5. Generated **without** the strict-property exclusions.

| id | Property | Authority |
|---|---|---|
| **FX-LV-03** | **Determinism** — repeated evaluation of the same graph yields the same result | manifest §4.5 |
| **FX-LV-04** | **Non-increasing under added attack** — adding an attack arrow into a target never raises that target's strength | manifest §4.5 |
| **FX-LV-05** | **Non-decreasing under added support** — adding a support arrow into a target never lowers it | manifest §4.5 |
| **FX-LV-06** | **Empty graph gives an empty result; an isolated node gives its own τ** | manifest §4.5 |

### 3.3 The strict properties and their preconditions

Manifest §4.5 records that an earlier draft asserted *strict* monotonicity, which
is **mathematically false at the boundaries** — *"a correct implementation would
have failed the stated test"*. The corrected statements, with `c = arrow strength
× strength(source)` and `va`, `vs` the target's aggregated attack and support
**before** the addition:

| id | Property | Precondition (manifest §4.5, verbatim conditions) |
|---|---|---|
| **FX-LV-07** | strictly **decreasing** under an added attack | **iff** `c > 0` **and** `va < 1` **and** `0 < τ < 1` |
| **FX-LV-08** | strictly **increasing** under an added support | **iff** `c > 0` **and** `vs < 1` **and** `0 < τ < 1` |

**Why each precondition exists** (manifest §4.5 from §4.2(b), reproduced so the
generator author does not have to reconstruct it): `c = 0` moves nothing;
`va = 1` (or `vs = 1`) is already saturated, since `1 − (1−1)(1−c) = 1`; `τ = 0`
makes σ's lower slope zero, so an attacked target pinned at 0 stays 0; `τ = 1`
makes the upper slope zero, so a supported target at 1 stays 1. The arrow must
also be **novel**: an exact duplicate identity collapses (manifest §4.4) and a
cluster-absorbed arrow contributes nothing (manifest §4.2g).

**The exclusion set the strict generators must encode** — six items, all from
manifest §4.5:

1. `τ ∈ {0, 1}`
2. zero-strength arrows
3. **zero-strength sources**
4. pre-saturated aggregates (`va = 1` or `vs = 1`)
5. duplicate identities
6. cluster-absorbed arrows

**The non-strict properties are generated without those exclusions** (manifest
§4.5). Two generator regimes, declared once, consumed by layers 1 and 2.

> **Gap `TEST-1` — disposition MISREAD, carried correctly** (C4 review round 1,
> merged verdict §5). Plan §2.5's parenthetical abbreviation of this list omits
> **zero-strength sources**, which manifest §4.5 states. This is **not a Plan
> gap**: Plan §7 row 7 expressly requires *"the manifest's generator preconditions
> and exclusion sets"*, so **manifest §4.5 is the test-scope authority and §2.5's
> parenthetical is not**. Carrying all six is correct and is what this section
> does; the row is recorded here so a reader who notices the difference does not
> re-open it.

### 3.4 The tie boundary

| id | Assertion | Authority |
|---|---|---|
| **FX-LV-09** | the **`va == vs` tie-boundary case** runs against `published-arithmetic` in CI. `≥` — not `>` — is the clause that keeps DF-QuAD discontinuity-free, and the tie case is exactly `τ` | manifest §4.2(b); Plan §2.5a |

This fixture exists because the failure it catches is silent: a ceremony `σ`
written with `>` where the engine uses `≥` breaks every tie-boundary node, and
the pack has no rule for adjudicating a ceremony-vs-serving disagreement
(Plan §2.5a).

---

## 4. Layer 2 — the defect prohibitions as properties of V3

*Manifest §12.2 layer 2: each replaces a MUST-DIFFER vector mark with something
stronger — a rule that must hold for* every *input, checkable with no V2 artifact
present.* Charter **S2** `RATIFIED(DR-026, DR-028, DR-033)` makes all five
mandatory over the manifest's scenario list (§11 below), alongside the two
literature vectors.

| id | Property | Statement (manifest §12.2) | How it is checked, and what the generator must do | Slice (Plan §8) |
|---|---|---|---|---|
| **FX-PT-D1** | **P-D1** | *No code path can produce a base score in the absence of a judgement.* | Generate graphs with **arbitrary unjudged subsets**; assert **no number exists for an unjudged node**, and that **each parent's value equals the value computed from its judged children alone** — manifest §4.2(e)'s identity-element argument makes this exactly checkable. Non-strict regime. **AC-11's predicate is what makes it assertable at all**: an unjudged node that has ≥1 persisted raw artifact satisfies the completeness gate and takes M1's path — no arrow, a typed record, the answer serves | S3 (green), S4 (*no default τ from an unusable judge*) |
| **FX-PT-D2** | **P-D2** | *The operator is a declared, recorded input, emitted by the component that computed the run; no production selection path reads a literal.* | **RESCOPED per `RULED — DR-074`.** Assert **both operators are computable on demand** and produce **different recorded identifiers**; assert the identifier **travels with the result**; assert that **where the rival operator flips the band both readings appear** (DR-031 Q47); and — replacing the deleted limb — assert that **the effective operator resolves from a parent / run / deployment register row and never from a source literal**, with **the supplying level recorded on the produced number**, and that **the deployment row is present and non-blank in every producible configuration**. See the rescope note below the table | **S3.** `RULED — DR-074`: the deployment declaration is **MANDATORY, never blank**, so the **undeclared-parent limb is deleted, not deferred** — no parent can be undeclared, and asserting an unconstructible path would be the G4 defect this property exists to catch |
| **FX-PT-D3** | **P-D3** | *Counting is by provenance: N restatements sharing a provenance key contribute exactly once, at the strongest member.* | Property test over **generated sibling sets** — the `0.784 → 0.400` collapse **computed from V3's own arithmetic** (manifest §12.2), asserted against the **recorded per-cluster collapse record** `{cluster_id, key, absorbed_edge_ids, surviving_member}` (Plan §4.2/§6.4 A-5), never against a V2 figure (AC-80). **`RULED — DR-073`** settles the generator's scope: collapse applies to **both polarities — support *and* attack** — so the generated sibling sets must include attack siblings; a node's cluster key derives from **the provenance of its evidence and the producing run/model family**; and **a node with no resolvable key clusters alone**, which is a distinct asserted case, never a merge-by-default | S3 (green), S6 (*against real clusters*). **`RULED — DR-073`** — the attack limb is now **required**, not optional |
| **FX-PT-D4** | **P-D4** | *Every weight-bearing number in a served payload carries its own kind, source and producer; no payload-level label may be contradicted by a per-item fact.* | Assert **a number with no provenance is unservable**; assert a **mixed-freshness payload reports freshness per item**; **fuzz payload assembly** for aggregate labels that contradict item facts. Holds **by type** through the labeled number `{value, provenance_ref, replay_handle, kind, source, producer}` (Plan §5.4, AC-63/AC-34) — but *"holds by type"* is a design property, **not a firing fixture**, which is why the fixture is owed | **S5** (payload assembly) · **S14** (wire). **Gap `BUILD-2`, REAL** — Plan §8 names P-D1/D2/D3 at S3 and P-D5 at S12 and **assigns P-D4 to no slice**, while charter §7 S2 makes **all five** mandatory. Assigned here so lane 7's matrix can consume the id |
| **FX-PT-D5** | **P-D5** | *Judge weight is a function of recorded outcomes, and the learned path is reachable.* | **Feed recorded outcomes; assert at least one judge's weight moves.** *A weight constant under all outcome histories fails.* DR-046 states the same requirement from the other side — **the cold-start exit must demonstrably execute**. **`RULED — DR-077`** supplies the assertion target the property was missing: a judge's earned weight **multiplies the served arithmetic**, consumed in the **selection** of which judgement becomes the reduced score **under a declared rule — never by averaging**. So the fixture asserts the weight change **reaches a served number through the selection**, and separately asserts **dispersion is measured and served on its own field, never blended away** | S12. **`RULED — DR-077`** — P-D5 now has a real assertion target and D5 is repaired in full (the U-4 ≡ A-6 gap is closed) |

**The P-D2 rescope, stated in full because DR-074 deleted an assertion.**
DR-074's own text directs it: *"P-D2's fixture is rescoped from 'exercises the
withhold path' to 'operator resolves from parent/run/deployment register rows,
never a source literal'"*. Three things follow, and the third is the one a
reviewer should check.

1. **What is deleted.** The undeclared-parent limb, and with it the withheld-parent
   terminal and the bounded declaration call. The **declare-once/withhold runtime
   machinery is dropped from the design** — with a mandatory deployment row there
   is nothing left to trigger it (DR-074; `05-register-skeleton.md` §2.3).
2. **What replaces it.** The register-resolution assertion above. This is a
   *stronger* test of the same defect, not a weaker one: D2 is *"hardcoded
   aggregation"*, and reading the operator from a ratified row with its supplying
   level recorded is what forbids the literal. The old limb tested the fallback
   for a state that can no longer exist.
3. **Nothing became unassertable.** Charter **G4** forbids a configuration branch
   no production caller can produce; had the limb been *kept*, `FX-PT-D2` would
   itself have asserted an unreachable branch — the precise D5 shape the property
   suite exists to catch. The deletion is what keeps the suite honest.
   Correspondingly, **`FX-SRV-06`'s `WITHHELD(reason)` state is unaffected**: it
   has other producers (AC-22's strict-and conjunct case, AC-26), and DR-074
   removed one route into it, not the state.

Two further properties belong to this layer because the plan states them as
property tests rather than as example fixtures:

| id | Property | Statement | Authority |
|---|---|---|---|
| **FX-PT-ORD** | **arrow-order stability** | the derived arrow evaluation order is **stable across two independent derivations of the same snapshot** — because the first computation and the overlay-detachment recomputation both derive it, and an environment difference would otherwise produce **two recorded orders for one graph** | AC-08; Plan §3.2 Seam A, §7 row 7, §8 S2 |
| **FX-PT-MEM** | **no transitive closure** | memory links never close transitively — enforced by **the absence of any closure job** and by this property test | AC-69; Plan §4.7 |
| **FX-PT-FLG** | **F1 — the restatement flag changes no number** | over generated sibling sets in which the **semantic-restatement flag** is raised, **every node strength and every arrow strength is byte-identical** to the same graph evaluated with the flag suppressed. The flag is served **as a flag**; it is **non-gating** and it collapses nothing — collapse is `FX-PT-D3`'s provenance key, which is a different mechanism. Minted at C4 rework round 1 (gap `TRACE-5`, REAL): AC-25 previously had **no assertion**, and a non-gating flag that silently moved a number would be indistinguishable from a working one | **AC-25**; manifest §4.2i; DR-062 `OD-08` |
| **FX-PT-POS** | **No position re-encoding; the position label travels** | three assertions. **(a)** a node's **base score (τ) and its arrows' strengths are invariant under relocating that node in the graph**, holding its judgement and evidence inputs fixed — position is *already in the arithmetic*, so **no factor may re-encode it into a base score or an arrow strength**; **(b)** `position_label` **travels with the number** on every per-node record; **(c)** an independence failure is a **dependence discount, never an independence bonus** — the adjustment's sign is asserted, so the prohibited direction fails. Minted at C4 rework round 1 (gap `TRACE-5`, REAL): AC-31 previously had **no assertion** | **AC-31**; spec §18 O-5, O-6 |

**What the order is, so the test knows what it is asserting** (Plan §3.2 Seam A,
stated there and not re-decided here): a deterministic function of stable
**non-identity** content — `(target_kind, polarity, kind, source node's
materialized path, sibling ordinal)` with `created_at_seq` as the final
tiebreak and **`NULLS FIRST` declared explicitly on `kind`** — recorded on
`propagation_run`. It is deliberately **not** an order over opaque identities:
manifest §8.2g refuses to carry a random-identifier fall-through as an ordering
device, and an opaque-id sort is an instance of exactly that. **Every
recomputation of an already-computed run consumes the recorded order and never
re-derives it**, which is what binds FX-PT-ORD to the overlay-detachment check
(`FX-LG-07`) and the ceremony (`FX-LG-01b`).

---

## 5. Layer 3 — the eight house-rule gates

*Manifest §11: all eight of Proposal-B's standing product laws carry into V3 as
required behaviours, `RULED — DR-029`, and* **each is a testable gate** *— they
are layer 3 of V3's self-test base (§12.2): "a house rule that cannot be
expressed as a gate is a house rule V3 cannot prove it kept."* Where a battery
successor is stronger, **the successor governs and the house rule is the floor**.

| id | Rule | The gate | Authority |
|---|---|---|---|
| **FX-HR-H1** | **Provider-agnostic agents** | no scoring, debate, evidence, metareasoning or orchestration code imports or invokes a model SDK or CLI directly; every model call crosses **one** interface taking a typed role, lane, call bound and contract hash (Seam C). **Provider identity is a first-class configured value, not an import** — asserted over the dependency graph, not by review | AC-36; manifest §11 H1; spec §19 H1, §14.1 L-3 |
| **FX-HR-H2a** | **H2 — the config-only switch** | flip the named configuration row, re-run a fixture, and **fail unless every source and build input is byte-identical between the two runs except that one register row** — including everything inside `packages/providers` and the rest of `packages/register`. A test tolerating differences anywhere in those two packages **passes even when provider implementation code changed during the supposed config-only switch**, which proves nothing about H2 | AC-37 (DR-029 H2: *"without changing agent, scorer, evidence or semantics code"*); Plan §3.2. **Launch prerequisite** under AC-38/DR-055, not merely charter A5.1's advisory drill |
| **FX-HR-H2b** | **H2 — the plugin boundary** | adding a **third, previously unimplemented** provider is a code change **inside `packages/providers` only** — a separate test permitting changes there and nowhere else. Names the boundary so no builder has to guess whether the second adapter is pre-shipped (**it is**: the launch artifact already contains at least two provider implementations, both compiled in and registered in the provider table at build time) | AC-37; Plan §3.2, §7 row 7 |
| **FX-HR-H3** | **Pure propagation** | `packages/propagation` contains **no model calls, no file or network I/O, no clock, no randomness, no database access** — enforced as a **build-time gate**: the `no-impure-import` lint rule (no `fs`/`net`/`Date`/`Math.random`/db import) plus structural rule 1 (`propagation` may not appear in any dependency cycle and may not import anything but `kernel` and `published-arithmetic`) | AC-09; manifest §11 H3, §12.2; DR-034's structural precondition; Plan §2.6, §2.7 |
| **FX-HR-H3D** | **The purity twin — `battery/decision`** | organ 4 gets the fence organ 1 gets: **`battery/decision` may import nothing but `kernel`**, with the same `no-impure-import` rule. Without it a decision could read `now()` for freshness or query the graph for a blocker it should have received — both compile, pass every other gate, and **silently break `decision_record`'s replay identity hash** | **AC-48** (manifest §7.2f); Plan §2.6 structural rule 5, §2.7, §7 row 7 |
| **FX-HR-H4** | **Swappable semantics** | the default gradual semantics sits behind a strategy interface; **both combination operators exist and both are computable on demand**, so the rival reading can be served beside the deciding one; **selection is never by source literal** (D2) and resolves through the register chain whose deployment row is **mandatory** (`RULED — DR-074`). Overlaps FX-PT-D2 by design — the house rule is the floor, P-D2 the property | AC-22; manifest §11 H4, §10.2; DR-031 Q47; **DR-074** (superseding DR-040 Q45's chain tail) |
| **FX-HR-H5** | **Every leaf is gated by the evidence subsystem** | evidence leaves that cite sources receive base scores **from the evidence pipeline, not from a model assertion**. Successor governs: DR-009's mixed admissibility rule, DR-020 knob 7's eight typed citation failure routes, DR-044's Q51 locator gate and reasoning-only downgrade, DR-038's two-field record | manifest §11 H5; Plan §8 S6. **`RULED — DR-084`**: the eight routes are a **closed enum architecture proposes and V ratifies** — loud failure, **no generic "other"**, and any member a reader sees is placed in **spec §12.3 by amendment** (S-13's single-minting-place law intact), so the fixture asserts membership against the ratified enum, never against a local list. Ratification sitting: **VG-02**. **`RULED — DR-087`**: `mixed` and `unknown` are **evidence-GATED (fail-closed)** — gate unless proven evidence-free — and `value-laden` is a **cross-cutting flag, not a claim type**, so the fixture asserts it **beside** a claim type and never as one |
| **FX-HR-H6** | **Anonymize debate sources** | **agent identity is stripped before another debate role reads prior turns**; research and criticism never share a context; **the agent that produced an artifact never grades it**. Anonymization is the mechanism that makes "blind" true rather than merely claimed | AC-39; manifest §11 H6; spec §3.8 stage law, §19 H6 |
| **FX-HR-H7** | **The skeptic certifies that no unaddressed attack remains** | a node is **not converged until the skeptic hook passes**; successor: DR-041's defeater obligation (**non-empty defeater set or exhaustion-marked**), DR-049's gate order putting **Q53 objection visibility ahead of conformance**, and the **residual objection as a fact-bundle field** (spec S-6 — it cannot be satisfied by the composition model happening to mention it) | manifest §11 H7; Plan §8 S5, S7 |
| **FX-HR-H8** | **Confidence-driven, cost-soft** | stop conditions are driven by convergence, unresolved caveats and skeptic certification; **cost is a soft tie-breaker**. Three assertions: (a) **protected-core rows refuse the skip**; (b) **enrichment skips precede any hard stop**; (c) the convergence comparison **refuses to compare across a semantics change** and emits its typed non-comparison reason (first evaluation, semantics changed, topology changed, strengths unavailable), with a max-delta comparison over the overlapping node set and the changed-evidence-topology detector. Epsilon and defaults are **register rows** (DR-023) — no value is asserted here. **Unchanged by DR-068…DR-097:** `convergenceStopDefaults`' member set is gap **REG-8**, a naming-authority question and **not** one of the 28, so it is still **UNRATIFIED with a typed loud failure on read**; the tolerance-bearing limb stays blocked and the other assertions still run (`05-register-skeleton.md` §5.4b, §7). Its sitting is **VG-02** | AC-49; manifest §11 H8 + *Convergence, specifically*; DR-052, DR-021 knob 9; `05` §5.4b REG-8 |

**Two H2 tests, because they prove different things** (Plan §3.2). H2-a is the
ruled property; H2-b names the boundary. Neither substitutes for the other, and
FX-HR-H2a is the one AC-38/DR-055 makes a launch prerequisite.

**Two purity gates, because two packages carry purity** (Plan §2.7, §7 row 7):
FX-HR-H3 for AC-09 and FX-HR-H3D for AC-48. The lint rule is one rule applied to
both; the gates are counted separately so a green build cannot come from having
fenced only one.

---

## 6. Layer 4 — the law gates

*Manifest §12.2 layer 4: the rulings that are directly checkable.* Plan §7 row 7
names seven (replay, ledger completeness, serve termination, partition law, cost
envelope, stranger coverage, overlay detachment); manifest §12.2's own layer-4
list carries an **eighth combined bullet**, which is carried here as FX-LG-08 —
it is the manifest's, not an addition.

| id | Law gate | What it checks | Authority |
|---|---|---|---|
| **FX-LG-01a** | **Replay — the continuous limb (DR-034)** | **every servable number recomputes from frozen records, continuously, with no model in the path**; a number that fails is **evicted** with a typed `MISSING-NUMBER` mark and the rest of the answer serves with `DEFECT`. **Owner: `apps/scheduler` · `job:replay-self-test`.** **Recomputes with `propagation` — the one engine**: a separate implementation inside the self-test would be the **second scoring path AC-14 forbids**, so sharing the engine is *required, not tolerated*, and VR-3's independence limbs **do not bind here** (they bind *the ceremony*). **Writes exactly two things and only through `serve`'s eviction writer**: `served_number_event {… status: EVICTED …}` and the matching `segment_suppression` row — `serve` owns the eviction transition, so the scheduler calls it and does not re-implement it. Credentials: read-only on every schema **except** append rights on `serve`'s two eviction streams. The fixture asserts the trigger fires end to end into `FX-SRV-03`/`FX-SRV-05` | AC-06, AC-12, AC-14; charter S1 (*continuous* limb); DR-034, DR-059; `03-module-design.md` §5.5.0 |
| **FX-LG-01b** | **Replay — the launch-ceremony limb (DR-034)** | **one independent replay of recorded runs passes exactly** = **byte-identical served numbers**. **Owner: `apps/replay`** — reads frozen records **only**, through the Postgres driver directly (it may not import `packages/db`), recomputes with **`published-arithmetic` only**, and **never writes**: a ceremony failure is a **failed launch gate, not a write**. Credentials **read-only, full stop** — the scope `FX-IND-03` attests. The serve *decision* replays as **stored data** — the conformance verdict is an input artifact, never regenerated. All three VR-3 independence limbs bind: §9.1 | AC-06/AC-07; charter S1 (*launch ceremony* limb), VR-3; DR-060(b); `03-module-design.md` §5.5.0 |
| **FX-LG-02** | **Ledger completeness (DR-027)** | **every executed thing has a row**; the digest is user-visible; **no served sentence implies a check the ledger says did not run**; raw judge text never reaches a served item. Includes AC-85's limb: **every caught failure is typed and written to the ledger — a swallowed exception is a defect** | AC-44, AC-85; charter S3; spec §22.1 |
| **FX-LG-03** | **Serve termination (DR-049)** | `max_recompose = 2`; gate order **R9 → Q53 → conformance → Q51**; a **components-only serve under a `DEFECT` badge** rather than blank or unchecked prose. Six terminal fixtures: §9.6. **`RULED — DR-082 / DR-086`: the serve order is now four gates *plus the band cap*.** The way-of-knowing ceiling is a **second, independent gate** beside the three blocking ones, and when it fires it **caps the band and serves** — so the fixture must assert the cap **does not** add a terminal: a capped answer still serves, still carries its label, and **never** reaches components-only by that route | AC-52, AC-53; spec §12.1a S-4…S-9; **DR-082, DR-086** |
| **FX-LG-04** | **Partition law (DR-051)** | the exhaustive mapping table **exists and leaves no residue**; **one abstention kind and several condition marks per answer**. Carried as a membership-and-count test in `packages/kernel` against the **five-member terminal-route list** — *5 abstention kinds (ignorance-ledger unknowns only) + 22 condition marks + **5 terminal routes*** — the vocabulary is **transcribed once and never extended locally**. **The five routes are named in §6.2**; the count and membership question is settled there and not restated | AC-65 **as corrected in §6.2**; **DR-037**; spec §5.2, §12.3 S-11…S-13; Plan §3.1 context 1 (*"the five terminal routes"*) |
| **FX-LG-05** | **Cost envelope (DR-052)** | **visible envelope**; **enrichment skipped before any hard stop**; **protected core never skipped**; **stranger-sample rate frozen at run start**. The freeze is checkable because `stranger_sample_rate` sits on the **`run` frozen head** with `UPDATE`/`DELETE` revoked (`FX-DB-01a` / `FX-DB-01b`) | AC-49, AC-50; Plan §4.1a |
| **FX-LG-06** | **Stranger coverage (DR-018/DR-019)** | **load-bearing nodes exhaustively restatable**; sampling **derived from the asker's run parameters**; the rate **ratchets on the *next* run**. `stranger_restatement.check_status ∈ {PASS, FAIL, NOT_SAMPLED}` and **blocks serving on FAIL** | AC-67, AC-50; spec §12.7. **`RULED — DR-079`**: the non-node senses **project from the charter's node definition** — *a sentence is load-bearing iff it asserts a fact drawn from a load-bearing node or states a served number; a claim iff its node is; an unknown iff removing it would change the verdict or band*. The sampling limb is therefore constructible: the fixture partitions sentences by that written predicate rather than by judgement. S0 still runs conformance exhaustively and needed no answer |
| **FX-LG-07** | **Overlay detachment (DR-017)** | **recompute every strength with the value overlay detached and assert byte-identity**, as an enforced invariant rather than a convention. The recomputation **consumes the recorded arrow order** (FX-PT-ORD) so a failure cannot come from a re-derived order | AC-30; spec §15.3 V-6; charter §7 |
| **FX-LG-08** | **The manifest's combined bullet** | the **off-subject downgrade is visible** (DR-009); **every answer names its abstention-price cell** (DR-012); **a missing second lineage caps, labels and records a lift path** (DR-014); **every budget skip and unresolved-type fallback carries its label** (DR-021); an **`UNINSTRUMENTED` verdict blocks the fairness claim** (DR-045); **`LEVERAGE_UNRESOLVED` appears where the deepening bound was hit** (DR-050); **multi-maker critique executes at standard-and-above tiers** (DR-055) | manifest §12.2 layer 4, final bullet. Individual fixtures map to `FX-C52-*` and `FX-PRV-*` below |

> **Why the replay gate is two ids and not one, stated as asked.** DR-034 puts
> both obligations in one sentence — *"continuously self-tested"* **and** *"at
> launch one independent replay … must pass exactly"* — but they are **two
> obligations with two owning units, two credential scopes, two recomputation
> rules and two failure meanings**, which `03-module-design.md` §5.5.0 makes
> structural. **Two ids, `FX-LG-01a` and `FX-LG-01b`**, rather than one row with
> two limbs: a single id cannot be assigned to two units in §12's slice map, and
> A4.4's *"named by fixture id"* would then let one green result stand for two
> guarantees. The naming keeps the pairing visible — they remain the two halves
> of one law gate, in the order DR-034 states them.
>
> **Two things this split must not be read as.** It does **not** reopen VR-3
> option (i): VR-3 rejected *"the same code in a fresh process"* **as the
> ceremony**, and the ceremony is `FX-LG-01b`, under all three limbs. And the
> continuous limb's use of the shared `propagation` engine is **not** a weakened
> independence claim — it is AC-14's requirement, since a second implementation
> of the arithmetic inside V3 is itself the defect (Plan §2.5a). Independence is
> proved once, at launch, by the unit that owes it.

### 6.1 Spec §22.1's launch gates not otherwise mapped

Charter §5.2's own preamble records the division of labour: *"Spec §22.1 already
carries launch gates for replay, ledger completeness, the disagreement flag,
symmetry both ways, cold-start exit, memory inertness and firing, stranger
coverage, overlay detachment and the zero-call proof. **These are the serve
blocks it does not name**."* The five that neither layer 4 nor §7 below already
carries:

| id | Gate | Requirement | Source |
|---|---|---|---|
| **FX-S22-01** | **Disagreement flag fires** | V3's judge-disagreement flag **demonstrably fires**. The bar is charter **VR-1**: *(c)* **shown to fire both ways** as the **adoption bar**, *(a)* fires at least once as the **launch-day minimum**, *(b)* rate-consistency as a **standing SETTLE-stage monitor** once outcome data exists | DR-032; charter VR-1 `RATIFIED(DR-063)`; U-3 |
| **FX-S22-02** | **Symmetry fires both ways** | a **deliberate-asymmetry** fixture emits `ASYMMETRIC` with **exact remediation targets**; a **stripped-telemetry** fixture emits `UNINSTRUMENTED` and **never `SYMMETRIC`** | spec §22.1, §8 A-12. **`RULED — DR-092`: this fixture is now passable as designed.** The Q34 symmetry diff runs over **item-scoped actions only** — the subject-carrying members of the closed action vocabulary — and **pre-item actions are excluded by KIND, never by value**, so **`UNASSIGNED` stays a real signal** rather than being definitionally swallowed. The literal reading under which nearly every run came out `UNINSTRUMENTED` is superseded; the fixture's generator must therefore partition the action population **by kind before diffing**, and must still show `UNASSIGNED` surviving as an observable stance |
| **FX-S22-03** | **Cold-start exit executes** | **one synthetic settled outcome moves a judge weight off its cold value, end to end and replayable**; and at t=0 the router behaves **exactly as it would with no scorecard at all** | AC-43; DR-046; spec §16.4 K-20/K-21; charter A5.4. Paired with FX-PT-D5 |
| **FX-S22-04** | **Memory inertness + firing** | **empty store ⇒ byte-identical to mechanism-disabled**; **one injected prior settlement ⇒ a visible link, fully replayable**. Plus Plan §8 S13: **no memory sentence without a match fact** | spec §17.6 M-25, §22.1 |
| **FX-S22-05** | **Zero-call proof** | each of the **13 MACHINE rows** is proven to make **zero model calls**; the `·A·` always-run marker is retired; **a cache hit never sets a row INACTIVE**; **`POLICY_BLOCKED` is never filed as INACTIVE**. **Owning slices (gap `BUILD-1`, REAL — Plan §8 named no slice): S0 · S6 · S15.** The proof is **per MACHINE row**, so it accrues as each row's stage lands — the framing rows at **S0**, the evidence-stage rows at **S6** — with the **complete 13-row attestation in the S15 bundle**. Assigned here so `07-build-order.md`'s matrix A can consume one id and one slice set | AC-83; DR-037; spec §5.1 F-1, §1, §3.13, §22.1 |

**Requirement Z-1, the standing discipline behind all of these** `RULED(DR-063)`:
*"A check is not accepted until it has been made to fail on purpose. A gate that
has never been observed to fire both ways is not evidence that the system is
healthy; it is an untested claim."* §8 is where that discipline is made concrete.

### 6.2 The terminal-route count is FIVE — what `FX-LG-04` counts against

**The founding pack now says five in one voice.** It was internally split when
this section was written, and the split was never a reading error; **the
correction has since landed**, and the table below is the present state.

| Source | What it says |
|---|---|
| **DR-037** (`V-RULING`, FINAL) | *"Q1, Q3, Q7, Q9, Q10 all HYBRID — each owns a terminal route code must enforce (inert stop; false-assumption non-answer; value→human; `NOT_EMPIRICALLY_DECIDABLE`; **no-justification-no-split**)"* — **five** |
| **spec §5.2**, headed *"The five terminal routes code must enforce (DR-037)"* | `INERT` (Q1) · false-presupposition non-answer (Q3) · value → human (Q7) · `NOT_EMPIRICALLY_DECIDABLE` (Q9) · **depth-zero, no justification and no split (Q10)** — **five**, *"gates with fixtures proving each fires **both ways**"* |
| **spec §12.3 Home 3**, the single-source terminal-route table | `INERT` · false-presupposition non-answer · value → human · `NOT_EMPIRICALLY_DECIDABLE` · **depth-zero (no justification, no split)** — **five**. **Row 5 was added 2026-08-06** under `RULED(DR-099 A-01; follow-through DR-100)`, authority DR-037, by board ticket **PRE-08**. *(This table listed four and omitted depth-zero until that date — see the discharge note below.)* |
| **Plan.md AC-65** | **the one remaining four-route transcription**: copies §12.3's pre-correction *"4 terminal routes"*, while **Plan §3.1 context 1 says "the five terminal routes"** in the same document. Plan-side half of the same amendment, carried on the board as **PRE-09**; Plan.md is a digest and loses to both documents above it (spec §2 item 1) |

**The resolution, and it is the pack's own rule, not this seat's preference.**
Order of authority: *"the ledger wins over a founding doc"* (spec §2 item 1;
manifest §2.2 item 1). **DR-037 says five, so the count is five**, and spec §5.2
— which cites DR-037 by number in its own heading — has always agreed; **spec
§12.3 Home 3 now agrees too**. `FX-LG-04` counts against the **five-member
list**, and this document's earlier *"4 terminal routes"* wording is corrected
here and at §16.

**What `FX-LG-04` must not do — DISCHARGED, recorded as history.** This section
carried a live caution: *`FX-LG-04` must not assert "count against spec §12.3's
table" while §12.3 carries four, because a membership test pointed at the
known-incomplete table fails the build the moment the vocabulary is corrected,
and passes today only by freezing the lower-authority side.* **That caution is
now moot in its own terms**: DR-037 and §12.3 Home 3 both yield five, so there is
no lower-authority side left to freeze and no divergence for a test to entrench.
`FX-LG-04` may assert membership and count against **either**, and the two
assertions are the same assertion.

**Why the caution is kept on the page rather than deleted.** It is the reason the
fixture **survived** the correction. `FX-LG-04` was pinned to the five named
routes throughout, so **the day §12.3 gained row 5 the build stayed green** —
whereas a test written against the four-row table would have failed on that day
and been "repaired" by weakening it back. The standing rule the episode leaves
behind, and the one a builder should carry forward: **point a membership test at
the highest-authority list, never at the copy most convenient today.** The
paired assertion — *every member found in spec §12.3 Home 3 is present in the
five* — remains worth keeping as a **future**-divergence detector, which is what
it was always for.

> **Gap `TRACE-7` (≡ `H-C-1`), disposition REAL — DISCHARGED 2026-08-06.**
> Spec §12.3 is declared by AC-65/S-13 to be *"the only place a typed state may
> be minted"*, and under S-13 **an unplaced ruled state is a specification
> defect**, so §12.3 omitting a route DR-037 rules was a real founding-pack
> defect and not a wording preference. This document could not make the repair —
> **a C4 artifact may not amend a founding doc** — and recorded it as a directed
> item. **V ratified the repair individually as amendment A-01 at DR-099**
> (*"five terminal routes + founding-table correction authorized"*), **DR-100**
> listed *"apply A-01's founding-table correction"* in its mechanical
> follow-through, and **board ticket PRE-08 applied it: `requirements-spec.md`
> §12.3 Home 3 carries row 5 as of 2026-08-06**, under a dated edit note
> `RULED(DR-099 A-01; follow-through DR-100)`.
>
> **The correction minted no typed state**, which is what keeps S-13 intact: the
> depth-zero route's authority was **DR-037 all along**, and the edit **placed**
> an already-ruled state rather than creating one. The spec's own edit note
> records the discharge of **TRACE-7 ≡ H-C-1** and of residual risk **R-3**
> (*the terminal-route correction is a founding-pack edit nobody has made yet*).
>
> **Nothing about `FX-LG-04` changed, and that was the design.** It already
> counted against the **five-member list** under the pack's own order of
> authority, so it **stayed green across the correction** instead of being
> repaired by it. **This document still rules nothing here**; it records a
> founding-pack edit made under V's ruling, by the ticket that owned it.

---

## 7. The charter §5.2 firing-fixture table, mapped to fixture ids

Charter §5.2 is **BLOCKING(DR-063)** and charter **A4.4** requires each row to
carry *"a recorded firing fixture in the acceptance bundle, **named by fixture
id**"*. This is that mapping. The "must demonstrate" column is the charter's own
text; the id, owner and slice columns are this document's.

| id | § 5.2 row | The fixture must demonstrate | Owner (Plan §3.1) | Slice (Plan §8) | Authority |
|---|---|---|---|---|---|
| **FX-C52-01** | 1 — **Q51 locator gate** | a load-bearing claim with a **missing locator blocks serving**; a **reasoning-only claim is downgraded to hypothesis-plus-research-plan** | context 7 `serve` | **S0** (two fixtures — §9.6) | RATIFIED(DR-044, DR-049) |
| **FX-C52-02** | 2 — **Q53 objection visibility** | an answer whose **strongest live objection is not surfaced is blocked**; the **residual objection appears as a fact-bundle field** | context 7 `serve`, context 5 `critique` | **S5** (S0 demonstrates the gate's *position*, vacuous on a one-node graph, with its residual-objection field populated) | RATIFIED(DR-049) |
| **FX-C52-03** | 3 — **R9 stranger block** | a load-bearing node whose **restatement fails blocks serving *before* conformance runs** | context 7 `serve` | **S0** (fires in gate position) | RATIFIED(DR-018, DR-049) |
| **FX-C52-04** | 4 — **DR-014 cap** | a run with **no second lineage serves**, **cannot reach the top band**, carries *"independent critique unavailable"* **with its reason**, and **records the lift condition** | context 5 `critique` | **S8** | RATIFIED(DR-014) |
| **FX-C52-05** | 5 — **DR-015 STALE** | a **fired revision trigger** puts a **visible STALE / UNDER-REVIEW badge** on a served answer, **never silently** | context 10 `liveness` | **S11** | RATIFIED(DR-015) |
| **FX-C52-06** | 6 — **Budget-skip marker** | an **enrichment row skipped under the envelope serves with a visible `SKIPPED-BY-BUDGET` mark**; a **protected-core row refuses the skip** | context 11 `budget` | **S9** | RATIFIED(DR-021 knob 9, DR-052). **`RULED — DR-093`**: the per-row correctness/enrichment split is produced by **architecture proposing the full 71 rows and V ratifying once**, in one sitting alongside the register — **VG-02**. **Until ratified, every row behaves as correctness and is never skipped**, so this fixture stays **unconstructible until the sitting lands**: the dependency is now *dated to a sitting* rather than *waiting on an unasked question*, and it remains the explicit launch-readiness dependency **LRD-1** in `07-build-order.md` §7 |
| **FX-C52-07** | 7 — **Envelope exhaustion** | exhaustion **hard-stops** and serves **already-verified components with `ENVELOPE_EXHAUSTED`** — never a silent timeout | context 11 `budget` | **S9** | RATIFIED(DR-052) |
| **FX-C52-08** | 8 — **Serve termination** | **two conformance failures produce components-only plus a visible `DEFECT` badge** | context 7 `serve` | **S5** (S0 fixtures this same terminal — §9.6) | RATIFIED(DR-049) |
| **FX-C52-09** | 9 — **Leverage bound** | after the **K=1 deepening round**, recombination proceeds and **`LEVERAGE_UNRESOLVED` is served, naming the carrying piece** | context 6 `valuation` / `propagation` | **S3** | RATIFIED(DR-050) |
| **FX-C52-10** | 10 — **Cycle law, three layers** | a cycle-closing edge is **refused at construction**; a cycle-creating write is **rejected**; a cycle reaching compute **raises a typed error** | context 3 `graph` (layers 1–2), `propagation` (layer 3) | **S2** | RATIFIED(DR-056) |
| **FX-C52-11** | 11 — **Verdict-R9, post-composition** | node text is stranger-checked **before** composition; the composed **verdict** then takes **its own R9 pass**, and a verdict-R9 failure goes **straight to components-only + `DEFECT` — no new loop** | context 7 `serve` | **S5** | RATIFIED(DR-057) |
| **FX-C52-12** | 12 — **Degraded-mode projections and replay eviction** | in components-only mode the **reversal point** and **builds-on-previous disclosure** still render as **structured projection fields with no composed prose**; and a component number failing replay is **evicted** with a typed missing-number mark **while the rest serves + `DEFECT`** — *one number lost, never the answer* | context 7 `serve` | **S5** | RATIFIED(DR-059). Three further assertions: §9.5 |

### 7.1 The deferred rows — NOT-SHIPPED attestations, not fixtures

Charter §5.2's deferred table and A4.4: *"the deferred rows carry a NOT-SHIPPED
attestation instead"*. Plan §3.3 and §6.7 are explicit that these take the
**not-written** branch, not the register-gated one — a register-gated branch here
would make A4.4 unsatisfiable, since no firing fixture is possible (the quote
matcher has not validated) and the attestation would be false (the code is in the
tree).

| id | Gate | Status at launch | Authority |
|---|---|---|---|
| **FX-DEF-01** | **Citation hard-kill** | the **eight typed citation failure routes ship**; the **hard-kill gate does not ship** until V3's character-level quote matcher ships and validates — *"it must not exist as code that cannot fire"*. Attestation, not fixture | RATIFIED(DR-020 knob 7); AC-78. **`RULED — DR-088`: auto-activation COUNTS as shipped dark — the charter's not-shipped rule wins.** *"Auto-activates"* describes the **activation event only**: the gate is **written when the quote matcher validates**, never shipped inert, and the **NOT-SHIPPED attestation stands in the bundle until then**. So this row keeps the **not-written** branch and does **not** become a register-gated one — charter §9 contradiction 6 is closed, and §7.1's preamble is confirmed rather than amended. **`RULED — DR-084`** additionally fixes what "the eight routes ship" means: a **closed enum architecture proposes and V ratifies** (**VG-02**), no generic "other" |
| **FX-DEF-02** | **Coverage-as-gate** | ships as the **diagnostic `UNCOVERED-SCOPE` note only**; becomes a gate **after outcome data sets the threshold, and not before**. Spec D-7 additionally makes `coverage_passed` a **forbidden claim** until outcome data exists | RATIFIED(DR-020 knob 8); AC-78 |

---

## 8. Fire-both-ways — the labelled should-not-fire register

**The discipline.** *"Every gate is shown to fire both ways before it counts as
adopted"* (AC-79, from DR-063 VR-1/VR-5 and spec Z-1). **The blocking force is
the named subset**: charter §5.2's table and the never-called list block
(VR-5); charter G3's *generalization to every other branch is* **ADVISORY**
(charter §5.1 G3). Both halves are stated so this document does not overclaim:
the discipline is general, the block is named.

**The recorded cost of VR-1's ruling, carried here:** option (c) *"requires a
labelled should-not-fire case; pinning that case is part of building the fixture,
and the fixture is BLOCKING under §5.2"*. Plan §6.3 U-3 records that
**architecture owes the labelled *should-not-fire* case**. This document names
the case's *slot* for every gate below; where the pack has not specified the
case's data, inventing one would be a DR-039 violation and the row says so.

| Gate | Fixture ids | **Fires** (labelled) | **Correctly does not fire** (labelled) | Force |
|---|---|---|---|---|
| **Completeness gate** | `FX-LED-01a` / `FX-LED-01b` | a **required node with no raw artifact in any state** ⇒ the job fails and **no aggregated run is written** | a required node whose only artifact is **unparseable but persisted** ⇒ the gate **does not fire**; the node takes **M1's path** — no arrow, a typed record, and **the answer serves** | AC-11, AC-79; LAUNCH GATE via FX-LG-02 |
| **Undercut invariant** | `FX-DB-04a` / `FX-DB-04b` | an undercut written against an **attack edge** ⇒ **refused** | an undercut written against a **support edge** ⇒ **accepted** | AC-19, AC-32; Plan §4.2(2) |
| **Arrow upsert** | `FX-DB-05a` / `FX-DB-05b` | one identity carrying **two different payloads** (`strength`, `magnitude_status`, `strength_source`, `kind`) ⇒ **loud typed integrity error**, never a silent pick | an **identical duplicate** ⇒ **collapses to the existing row** (no-op, returns the existing `edge_id`) — *not* a write failure | AC-35 (both behaviours); Plan §4.2(3) |
| **Maker inventory** | `FX-PRV-01a` / `FX-PRV-01b` | a **standing one-maker deployment** ⇒ `deployment_maker_capability` **FAILS**; standard-and-above `POST /v1/asks` **refused**; **no S15 attestation** | a **two-maker deployment with one provider transiently down mid-run** ⇒ capability **PASSES**; that run takes **DR-014's cap-and-label path** and the ledger-derived counter **classifies it transient** | AC-38, charter S4; the S15 attestation BLOCKS |
| **Q51 provenance** | **fires:** `FX-C52-01` (missing locator) · `FX-SRV-01b` (reasoning-only downgrade) · **does not fire:** `FX-SRV-01a` | a load-bearing claim with a **missing locator** ⇒ **blocks**; a **reasoning-only** load-bearing basis ⇒ **DOWNGRADED** to hypothesis + research plan (**blocks rather than annotates**) | **`FX-SRV-01a`** — a **`LOOKED_UP` basis with a resolving locator** ⇒ **serves as a verdict** | charter §5.2 row 1 — **BLOCKING** |
| **Budget skip / protected core** | `FX-C52-06` | an **enrichment** row skipped under the envelope ⇒ visible **`SKIPPED-BY-BUDGET`** | a **protected-core** row ⇒ **refuses the skip** (provenance, abstention typing, standard+ blind verification, citation routes, serve-conformance) | charter §5.2 row 6 — **BLOCKING**; constructibility waits on **DR-093**'s 71-row ratification sitting (**VG-02**), not on an open question |
| **Symmetry** | `FX-S22-02` | deliberate-asymmetry fixture ⇒ **`ASYMMETRIC`** with exact remediation targets | stripped-telemetry fixture ⇒ **`UNINSTRUMENTED`**, and **never `SYMMETRIC`** | LAUNCH GATE (spec §22.1) |
| **Memory** | `FX-S22-04` | one injected prior settlement ⇒ a **visible link, fully replayable** | **empty store** ⇒ **byte-identical to mechanism-disabled** (inertness) | LAUNCH GATE (spec §22.1, M-25) |
| **Disagreement flag** | `FX-S22-01` | **one real case that fires** | **one real case that correctly does not** — **the case's data is not specified anywhere in the pack**; it is authored as part of the fixture, and **no threshold is invented here** (DR-039) | Adoption bar **VR-1(c)**; launch-day minimum **VR-1(a)**; `RATIFIED(DR-032)` |
| **Cycle law** | `FX-C52-10` / `FX-DB-06b` | cycle-closing edge ⇒ refused at construction, rejected at write, typed error at compute | an edge targeting a **non-parent ancestor that closes no cycle** ⇒ **accepted** — AC-18 explicitly admits an edge whose target is not the source's structural parent | firing half **BLOCKING** (§5.2 row 10); non-firing half under **Z-1's general discipline** (ADVISORY) |
| **Cross-run integrity** | `FX-DB-06a` / `FX-DB-06b` | **every** cross-run source/target combination ⇒ refused, including an **otherwise-valid undercut of a support edge in another run** | the same three shapes **within one run** ⇒ accepted | AC-69, C-11; Plan §4.2(5) |
| **Non-blank claim** | `FX-DB-03a` / `FX-DB-03b` | **null**, **empty string** and **whitespace-only** ⇒ rejected **by the migrated database** | a claim with content ⇒ accepted | AC-32, manifest §6.4, charter A3.2 |
| **Run immutability** | `FX-DB-01a` / `FX-DB-01b` | `UPDATE` **and** `DELETE` against the `run` frozen head ⇒ **both raise** | appends to `run_progress_event` / `run_row_activation_event` ⇒ **succeed** | AC-05, AC-45; Plan §4.1a |
| **Judge-weight learning** | `FX-PT-D5` | recorded outcomes ⇒ **at least one judge's weight moves** | *(this property's negative is a failure, not a should-not-fire)*: **a weight constant under all outcome histories fails** | charter S2 (`RATIFIED`) |
| **STALE badge** | `FX-C52-05` | a fired revision trigger ⇒ visible **STALE / UNDER-REVIEW** badge | no trigger ⇒ **no badge**, and no answer is silently marked | **BLOCKING** (§5.2 row 5) |

**Sequencing rule (i), from Plan §8, restated because it is a test rule:** *"No
slice ships a gate it has not shown firing in both directions where the pack
requires both (AC-79) — **a slice with a dark gate is not done**."*

---

## 9. The rework-named fixtures

Plan §7 row 7's named additions from rework rounds 1–2, plus the fixtures §4.1a,
§4.2, §4.4, §5.2 and §8 name in their own text. **This list is exhaustive against
its sources; a fixture missing from it is a gap, not an omission by choice.**

### 9.1 Replay-ceremony independence — two artifacts, three limbs

Charter S1 / DR-063 VR-3 give independence **three limbs**, and Plan §2.5 carries
all three. Limb (ii) is discharged by construction (`apps/replay` is a read-only
database reader with no other input). The other two owe artifacts:

| id | Artifact | What it must contain / assert | Authority |
|---|---|---|---|
| **FX-IND-01** | **The isolation proof** | an artifact **naming every symbol `apps/replay` shares with `apps/api` / `apps/runner`**, whose expected content is **pinned at SYMBOL granularity, not package granularity: exactly `agg`, `σ` and `product`**. Package granularity would be satisfied by a `published-arithmetic` that had grown past the published definitions, and VR-3's licence covers sharing nothing *beyond* them. **The same artifact FAILS if `apps/replay` declares any local arithmetic symbol of its own** — structural rule 3 checks *imports* and the proof lists *shared* symbols, so without this clause a privately duplicated `agg`/`σ`/product inside `apps/replay` is caught by **no gate at all**, and that duplicate is precisely the AC-14/AC-85 breach | AC-07; VR-3 limb (i); Plan §2.5, §2.5a, §2.6 structural rule 3 |
| **FX-IND-02** | **The exported-surface pin** | a **one-line CI assertion pinning `packages/published-arithmetic`'s exported surface to the same three symbols** — because zero-deps alone would not stop a lift-target selector or collapse filter written inline over plain numbers | Plan §2.5, §2.6 |
| **FX-IND-03** | **The operator attestation** | names the **executing principal**, its **credential scope** (read-only database credentials) and **the run ids it did not produce**. Required because the obvious CI shape — acceptance job produces runs, then replays them in the same job on the same worker — **satisfies limbs (i) and (ii) and defeats the failure limb (iii) guards** | charter S1 (*"run by a person or job that did not produce them"*); VR-3 limb (iii); Plan §2.5 |

**Both are S1 gates and both enter the S15 bundle** (Plan §2.5, §8 S15).

**What the ceremony reads, so the fixture asserts the right thing** (Plan §2.5):
every V3-specific structural outcome — **lift targets and both-ends markers,
cluster-collapse records, the effective operator and its resolution level, the
recorded arrow order** — is **read from the frozen `propagation_run` /
`node_strength_record` rows as data, never recomputed**. Otherwise a defect in the
shared collapse or lift rule reproduces identically on both sides and the ceremony
**reports agreement while proving nothing**.

### 9.2 The two H2 tests

`FX-HR-H2a` and `FX-HR-H2b` — stated in full at §5. Listed here so the row-7
inventory is complete in one place.

### 9.3 The two purity gates

`FX-HR-H3` (`propagation`, AC-09) and `FX-HR-H3D` (`battery/decision`, AC-48) —
stated in full at §5.

### 9.4 Database-invariant fixtures

All exercise the **migrated database directly**, bypassing every application
validator (§2's discipline).

| id | Fixture | Assertion | Slice | Authority |
|---|---|---|---|---|
| **FX-DB-01a** | **Run immutability — `UPDATE`** | `UPDATE` against the `run` frozen head **raises** | S1 | AC-45; Plan §4.1a |
| **FX-DB-01b** | **Run immutability — `DELETE`** | `DELETE` against the `run` frozen head **raises**. Revoking `UPDATE` alone would leave a `DELETE` free to erase the pinned `register_version`, `stranger_sample_rate` and `battery_version` of a run whose answer has already been served, **making that answer unreplayable with no trace** | S1 | AC-05, AC-06; Plan §4.1a |
| **FX-DB-02** | **Run-state totality — no empty-stream window** | **current phase, envelope state and every row's activation state are resolvable at every point from run creation to run end**, with **no empty-stream window** — the mandatory initial events (`PHASE = EMPIRICAL`, `ENVELOPE_STATE = WITHIN`, `ENVELOPE_CONSUMED = 0`, and one `run_row_activation_event` per battery row) are written **in the same transaction as the `run` frozen head**. **An empty stream is a typed error on read, never a default** | S1 | AC-88 applied to the run; Plan §4.1a |
| **FX-DB-03a/b** | **Non-blank claim** | rejects **null**, **empty string** and **whitespace-only**; accepts content. The canonical DDL is `claim_text text NOT NULL` **together with** `CHECK (length(btrim(claim_text)) > 0)` — a **bare** trimmed-length `CHECK` **accepts the null case it appears to reject**, because in PostgreSQL a `CHECK` passes unless its expression is **false** and `length(btrim(NULL)) > 0` evaluates to `NULL` | S2 | AC-32; manifest §6.4; charter A3.2; Plan §2.4, §4.2 |
| **FX-DB-04a** | **Undercut — accepting case** | an undercut against a **support** edge is accepted, resolved by the graph-scoped composite FK `(run_id, target_edge_id, target_edge_polarity) → edge (run_id, edge_id, polarity)` | S2 | DR-066(2), AC-19; Plan §4.2(2) |
| **FX-DB-04b** | **Undercut — rejecting case** | an undercut written against an **attack** edge is **refused**. `target_kind = EDGE` alone is too weak: it would admit exactly this | S2 | DR-066(2), AC-79; Plan §4.2(2) |
| **FX-DB-05a** | **Upsert — collapse** | an **identical duplicate** collapses to the existing row (no-op, returns the existing `edge_id`) | S2 | AC-35; manifest §4.4 |
| **FX-DB-05b** | **Upsert — typed integrity error** | the **same identity with a differing payload raises the typed integrity error** — never a silent pick. Identity = `(source_node_id, target_kind, coalesce(target_node_id, target_edge_id), polarity)` | S2 | AC-35; Plan §4.2(3) |
| **FX-DB-06a** | **Cross-run rejection set** | **three** rejections: a **cross-run source node**; a **cross-run target node**; and an **otherwise-valid undercut of a support edge in another run** | S2 | AC-69, C-11; Plan §4.2(5) |
| **FX-DB-06b** | **Cross-run — the accepting complement** | the same three shapes **within one run** are accepted, so the rejection is scoping and not a general refusal | S2 | Z-1 (ADVISORY generalization) |
| **FX-DB-07** | **`tier_source` round-trip** | the risk tier round-trips with its supplier for **all three suppliers** — `ASKER`, `DEPLOYMENT_POLICY`, `DERIVED` — and `tier_provenance_ref` travels with it. **`RULED — DR-094`** adds a **directional** assertion the schema alone never carried: **the asker declares the tier; deployment policy may RAISE it but never lower it.** The fixture must therefore show a policy **raise** recorded as `DEPLOYMENT_POLICY` **and a policy lowering refused**, so the one-way rule is fixtured rather than assumed | S0 (carrier) / S9 (behaviour) | Plan §4.1a, §5.3; **DR-094**; consistent with DR-078's asker-facing tiers and DR-070's asker ruling |
| **FX-DB-08** | **Remaining write-time invariants** | `CHECK` that `target_kind` matches exactly **one** populated target column; `CHECK (strength IS NULL) = (magnitude_status = 'UNKNOWN')`; **no self-edge**; `kind` bound to polarity (`attack` ⇒ `rebutting` \| `undercutting`; `support` ⇒ `kind IS NULL`); *"endpoint absent from the node set"* is a **write error**, not a compute surprise | S2 | AC-28, AC-32, AC-35; manifest §4.4; Plan §4.2(1), §4.2(5) |

> **`strength_source` — the fence comes off · `RULED — DR-071`.** The undercut's
> shape is **`transmission-reduction`**: a reduction of the targeted support
> edge's transmitted contribution, **computed inside the pure core** and
> **recorded per edge** — a **third ruled producer of arrow strength**. The
> ruling grants DR-062 `OD-06`'s producer-set extension from **two to three**, so
> **`UNDERCUT_TRANSMISSION` becomes WRITABLE** and the *"declared but not
> writable"* fence of Plan §4.2(4) is discharged. Three consequences: fixtures
> **may and must** write it (`FX-DB-04a`'s accepting case now has a magnitude
> producer, and the reduction is asserted **as a recorded per-edge value**, never
> re-derived at read time); the removal-if-inert branch and its **S2 exit
> condition are moot** — the member ships live, so `FX-ORPH-02` has nothing to
> catch here; and **AC-27 is not loosened** — arrow strength stays **closed** to
> its now-three ruled producers, and no register row may set it freely
> (`05-register-skeleton.md` §5.5).

### 9.5 Ledger, replay and serve fixtures

| id | Fixture | Assertion | Slice | Authority |
|---|---|---|---|---|
| **FX-LED-01a** | **Completeness gate fires** | fires on a **genuinely missing artifact** — a required node with **no raw artifact in any state, parseable or not** ⇒ the job fails and **no aggregated run is written** | S1 | AC-11; manifest §8.2f path D |
| **FX-LED-01b** | **Completeness gate does not fire** | does **not** fire on an **unparseable-but-persisted** artifact. This is the pair AC-11 exists to make expressible: without the distinction the broad reading makes M1's served-with-a-typed-record outcome unreachable and **P-D1 unassertable**, and the narrow reading makes **the gate unfireable** | S1 | AC-11, AC-13, AC-21, AC-79 |
| **FX-LED-02** | **The four reconstruction paths** | rebuild-from-artifacts, stored-result verbatim, resume-partial and the completeness gate — **each refusing to fabricate a score where nothing was persisted** | S1 | AC-47; manifest §8.2f |
| **FX-WIRE-01** | **No `raw_text` in any tier-2 payload** | `GET /v1/answers/{id}/inspection` returns the **structured** `conformance_record`; **no `raw_text` appears anywhere in the tier-2 payload** — the raw text of **every** model call, **conformance judge included**, is operator-only | S5 / S14 | AC-44 (*"raw tapes internal"*), AC-87 (*"strip raw judge output"*); Plan §5.2 |
| **FX-SRV-02** | **Frozen conformance record — byte-identity around an eviction** | the **frozen conformance record is byte-identical before and after** an eviction. Its per-segment vocabulary stays the ruled three — `JUDGED / SAMPLED_PASSED / NOT_SAMPLED` — with **no fourth member minted** | S5 | AC-07, DR-060(a)/(b); Plan §4.4 clauses 1 and 4(a) |
| **FX-SRV-03** | **Eviction — the suppressed segment** | a **segment reciting an evicted number is suppressed**, via an **append-only `segment_suppression` row**; the served per-segment state is the **derived join** of the frozen conformance record and the suppression rows, and **the replay ceremony reads the conformance record without the overlay** | S5 | AC-12, AC-63, AC-88; Plan §4.4 clause 2 |
| **FX-SRV-04** | **Eviction — historical replay** | the **sealed answer version still replays historically**, reading the sealed artifacts **without** the overlay; `GET /v1/answers/{id}?version=` returns that version's artifacts **as sealed** | S5 | AC-06/AC-07; Plan §4.4 clauses 2a and 4(b) |
| **FX-SRV-05** | **Eviction — current projection** | the **current projection** reads **components-only + `DEFECT`**, with the evicted number carrying its **typed missing-number mark**; the status change is written as a **`served_number_event`**, and **nothing is overwritten** — the original `served_number` rows, the composed text, the fact bundle and the conformance record all stay exactly as sealed | S5 | AC-12, DR-059; Plan §4.4 clauses 2a, 3, 4(c) |
| **FX-SRV-06** | **The number slot's three states** | `PRESENT` \| `EVICTED(MISSING-NUMBER)` \| `WITHHELD(reason)` are three distinct served states, **all distinct from *absent*, which the schema does not admit** | S5 | AC-12, AC-22, AC-26, AC-63; Plan §4.4, §5.4 |
| **FX-SRV-07** | **Five distinct typed refusals** | each of AC-86's five serve preconditions demonstrated as **its own typed reason**: output not produced by the ledger; items not a list; any item failing validation; unknown status string; an item referencing a node outside the current set. **The replay precondition is per number, not per payload** — an unreplayable number is evicted and the rest serves | S5 | AC-86; manifest §9.2a |
| **FX-SRV-08** | **Sanitizing on the way out** | re-validate every item; **strip raw judge output**; reduce debug detail to declared version fields or drop entirely; **scrub every served reason string for secret markers and drop rather than serve damaged**; copy optional scalars **only when well-typed** | S5 | AC-87; manifest §9.2b |
| **FX-SRV-09** | **Coverage reconciliation** | drop items for non-current nodes; for current nodes with no entry add **typed pending** where work is active and **typed error** otherwise; then recompute. **Status is derived, never asserted** | S5 | AC-88; manifest §9.2c |
| **FX-SRV-10** | **Stale work expires on read, without a write** | an active job past its deadline **reads as failed with a typed reason on every read**, while the *state transition* is performed by a **scheduled reaper** — so a stuck job cannot masquerade as work-in-progress **and no read carries a write side effect** | S5 / S14 | AC-89 × AC-62, disposed at Plan §6.6 UI-13 |
| **FX-SRV-11** | **Honest-degradation vocabulary** | a missing or malformed input is read at its **honest zero-information value, never guessed**; a verdict with no usable basis degrades to a typed **`unavailable`, never to a number**; a lean with no live supporting or attacking node returns **nothing**, never a fabricated even split | S5 | AC-90; manifest §9.2e |
| **FX-SRV-12** | **Suppression carries its unlock; shadow mode** | a withheld verdict tells the reader **why in prose** *and* **what would unlock it**; the evidence gate runs in **shadow mode**, publishing what it would have suppressed **beside** the unsuppressed band | S5 / S6 | AC-91; manifest §9.2f. **`RULED — DR-085`**: the `OD-20` gate ships **tier-invariant with shadow mode**; eligibility is the **exact complement of spec §5.2(f)'s evidence-free list**; the tier × claim-type map is an **empty register table V fills**, so **shadow mode is the tested state, not a placeholder** — the fixture asserts the published-beside-unsuppressed pair against the empty map. **`RULED — DR-087`**: `mixed` and `unknown` are **fail-closed** (gate unless proven evidence-free), which is the shadow limb's generator input |
| **FX-SRV-13** | **Band ceiling — a gate that CAPS** | **every band names its way-of-knowing ceiling** — `band_ceiling {label, basis}` on the Answer, computed from the load-bearing nodes' `way_of_knowing` distribution and the Q51 downgrade state, **printed beside the band** and printing its register row. **Semantics fixed per `RULED — DR-082 / DR-086`, and this is what the fixture now asserts:** **(a)** the band rule is a **second, independent gate** beside DR-044(Q51)'s three blocking gates — **not a restatement**, so the fixture must show it firing on an answer that **passes all three** blocking gates; **(b)** when it fires it **CAPS the band** — the answer **serves**, **cannot reach the top band**, and **wears its ceiling label visibly**, mirroring DR-014's cap + label + recorded lift-path pattern; **(c)** the negative limb is the load-bearing one: it **never silently blocks and adds no terminal** — a capped answer is not a components-only route (`FX-LG-03`). **Still no value asserted**: the **label vocabulary and the cut points are register rows** V ratifies at DR-023, so the fixture pins the *mechanism* and reads the *labels* from the register | S5 | AC-24; charter **VR-2**; **DR-082, DR-086**; **no mapping is invented here** (DR-039) |
| **FX-SRV-14** | **Machine-injected honesty fields** | residual objections, badges and condition marks are **injected into the output structure by the machine, outside the composition model's discretion** — **silent truncation of an honesty surface is impossible by construction**; and honesty projections are **non-optional fields**, so a serializer cannot do what the composition model is forbidden to do | S5 | AC-54; spec §12.1b S-9b; Plan §5.4 |
| **FX-SRV-15** | **Degraded-mode projection fields** | the **reversal point** and the **builds-on-previous disclosure** render **as structured projection fields with no composed prose** | S5 | AC-55; spec §12.1c S-9d; = `FX-C52-12`'s first limb |
| **FX-SRV-16** | **Condition marks reach the nodes they describe** | an answer-scoped mark's **affected set** is stored **once** in `condition_mark_node` and **projected per node at read time** — an answer-scoped row with no affected set would project to the **empty set for every node**, showing `SKIPPED-BY-BUDGET` on the answer and on **none of the nodes it describes**, and would **silently fail `FX-C52-06` if the fixture inspects a node** | **S9** — **reconciled per `07-build-order.md` §5.1 (PRE-01 lane)**: the mark whose affected set the fixture must inspect is the **budget skip**, which lands at S9; S5 owes the **read-time projection half** and does not own the id. Not picked here — this document records the reconciliation, `07` §5.1 rules the direction | AC-85 applied to data; DR-021 knob 10; Plan §4.4, §6.6 UI-9 |

### 9.6 S0's gate fixtures, and the six serve terminals

**S0 owes an ordered, position-named set** (Plan §8 S0): *"Every S0 gate fixture
names which of the four positions it occupies, so a later gate's 'in position'
claim is checkable rather than asserted."* The four positions are AC-52's:
**R9 (pre-compose) → Q53 → conformance → Q51**, followed by the **composed
verdict's own post-composition R9 pass** (DR-057).

| id | S0 fixture | Position / assertion | Authority |
|---|---|---|---|
| **FX-SRV-01a** | **Q51 — the verdict path** | a **`LOOKED_UP` basis with a resolving locator serves as a verdict** | Plan §8 S0; charter §5.2 row 1 |
| **FX-SRV-01b** | **Q51 — the downgrade path** | a **reasoning-only** load-bearing basis is **DOWNGRADED to hypothesis + research plan** — Q51 limb (c) **blocks rather than annotates**. **S0's single node is `way_of_knowing = REASONING` unless a fixture pins it otherwise, so S0's default served form is the downgraded one** | AC-24 carrier (i); `RULED — DR-044(Q51)`; spec §3.10 Q51; Plan §8 |
| **FX-SRV-17** | **Gate-position proof** | all four AC-52 gates **present in order**: R9 **fires** in gate position (= `FX-C52-03`); Q53 **passes through** (vacuous on a one-node graph) **with its residual-objection field populated**; conformance **runs, exhaustively — every segment judged, no sampling**; Q51 **fires after conformance has passed, all three limbs** (provenance join · locator gate · reasoning-only downgrade) | AC-52; Plan §8 S0, §6.2 AM-1 |
| **FX-SRV-18** | **S0's named terminal** | AC-53's **first** route: **two conformance failures** — compose, fail, recompose once, fail again ⇒ **components-only + visible `DEFECT`, no new loop**. The terminal is **reachable and fixtured rather than being the path** | AC-53; Plan §8 S0 |

**The six terminal fixtures** (spec §12.1a S-9, `CARRIED-DESIGN`; S5 owns the
full set, S0 owns the fourth and fifth as above):

| id | Terminal |
|---|---|
| **FX-SRV-19a** | a **node-text R9** failure |
| **FX-SRV-19b** | a **verdict R9** failure |
| **FX-SRV-19c** | a **Q53** failure |
| **FX-SRV-19d** | a **first conformance failure that recomposes to a pass** |
| **FX-SRV-19e** | a **second conformance failure that reaches components-only** |
| **FX-SRV-19f** | a **Q51 provenance** failure |

*"A state machine with an untested terminal is a state machine with an unknown
terminal"* (spec S-9). The **third** compose-time route — a bundle past the
declared hard composition budget — is S5's and is **`RULED — DR-078`**: the
budget is an **independent register row**, *not* derived from the DR-052 cost
envelope, **so `DEFECT` and `ENVELOPE_EXHAUSTED` stay distinguishable** — which
is precisely what makes this a separate terminal rather than a restatement of
`FX-C52-07`. V's amendment makes the cap **user-facing as a tier list the asker
selects per run** (`low` / `medium` / `high`), so the route is **exercised by
selecting a tier**, and the per-tier bounds are register rows (§`05` §5.4).
**The route is ruled and its shape is fixed; what it now waits on is DR-023's
values, not a question** — and **no id is minted for it here**: it is fixtured
inside `FX-LG-03`'s terminal set at S5, where AC-53's routes already live.

**Components-only has three ruled compose-time routes and one post-serve
transition, and the fixtures must not conflate them** (Plan §8 rule (iii)):
components-only may be **entered at compose time** only by AC-53's three ruled
routes; a **post-serve replay eviction** transitions an already-served answer to
the same surface (`FX-SRV-05`), which is a **degradation of a served answer
rather than a fourth compose-time route**.

### 9.7 The maker-inventory pair

| id | Fixture | Assertion | Slice | Authority |
|---|---|---|---|---|
| **FX-PRV-01a** | **Standing one-maker deployment** | `deployment_maker_capability` **FAILS**; **standard-and-above `POST /v1/asks` is refused** with a typed error; **the S15 attestation is absent** | S8 / S15 | AC-38; DR-055; charter S4; Plan §3.2 Seam C |
| **FX-PRV-01b** | **Two-maker deployment, one transient outage** | `deployment_maker_capability` **PASSES** even while `run_maker_reachability` is **false for one provider mid-run**; that run takes **DR-014's cap-and-label path** (`SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE`, confidence-band cap, recorded lift condition) and the **ledger-derived counter classifies it transient** | S8 | AC-38; DR-014, DR-055; Plan §3.2 Seam C |
| **FX-PRV-02** | **The counter itself** | a **standing misconfiguration can never accumulate as a run of "transient" outages** — every capped run is classified against the two predicates | S8 | Plan §3.2 Seam C |

**Why the pair, and not one predicate** (Plan §3.2): *"configured **and
reachable**" would make a two-maker deployment with one provider briefly down
simultaneously rejecting (reachability false) and non-rejecting (configuration
true)*. Two predicates with **different subjects, different timings and different
consequences**. Without the split, every standard-tier run on a one-provider
deployment quietly takes DR-014's path and serves, nothing counts or refuses, and
**DR-055's launch gate is dead code wearing a gate's clothes** — charter G3's
exact indictment.

### 9.8 Context-isolation and other named assertions

| id | Fixture | Assertion | Authority |
|---|---|---|---|
| **FX-LED-03** | **Ledger action vocabulary** | an executed check mapping to **no member** of the closed action vocabulary is filed as **`UNCLASSIFIED_ACTION`** and is itself an **`UNINSTRUMENTED` trigger** | spec §8.1 A-2; Plan §4.3 |
| **FX-LED-04** | **Two stamps on every action row** | `subject_item_id` **and** `stance_at_action ∈ {SUPPORTS, ATTACKS, NEUTRAL, UNASSIGNED}`, plus typed outcome, actor, timings and input fingerprint. **`RULED — DR-092`** binds the fourth member: because the Q34 diff excludes pre-item actions **by kind, never by value**, **`UNASSIGNED` stays a real signal** — the fixture must show an `UNASSIGNED` stance **surviving into the diff population's complement** rather than being filtered away, since a value-based exclusion would make the member indistinguishable from absent | AC-46; DR-045; **DR-092** |
| **FX-LED-05** | **Contract-hash discipline** | the contract hash **freezes** identity/rubric/prompt/schema/reducer versions and **invalidates every cached result**; it is **excluded from the input hash** and **included in cache identity**; a cache hit yields a **new row** and **history is never overwritten** | AC-10; manifest §8.2c–e |
| **FX-LED-06** | **Decision replay identity** | `decision_record`'s replay identity hash **excludes the idempotency key, spawn count and classification fields**; **only categorically-grounded decisions spawn real work**; **unclassified fails closed to scalar** | AC-48; manifest §7.2a–f |
| **FX-LG-09** | **Eight routing guards** | G1–G8 as mandatory for any routing touching the served lane: separate served/panel lanes; **non-zero exploration floor with propensity recorded per decision**; version-pinned identity; minimum-n with interval-overlap fallback; multiplicity control; critic lane exempt; **no self-routing**; **route on the class, never on the expected answer** | AC-40; spec §16.5 K-25 (DR-046). *(These are the spec's routing guards; not the charter's orphan gates of §10.)* |
| **FX-LG-10** | **Scorecard honesty** | a scorecard is **a pure function of the ledger**; required keys model id + `model_version` + provider + task class + metric + `as_of`; `basis ∈ {MEASURED_OUTCOME, MEASURED_PROCESS, EXTERNAL_BENCHMARK, NONE}` with **no ASSUMED, no DEFAULT**; **a leaderboard of point estimates is prohibited**; a provider's silent model update **wakes the cell** | AC-41, AC-42; spec §16.2 K-3…K-11 |
| **FX-LG-11** | **Overlay owner** | a recommendation with an **empty overlay owner is a defect** | Plan §8 S10 (V-10); DR-017 |
| **FX-LG-12** | **E4 freshness on every read** | every **read of, or subscription to**, an answer occurring after a wake-up **exposes that answer's current staleness state**; the stream additionally carries the **`staleness trigger fired`** honesty event for every subscribed answer, with a **declared consumer** | AC-64; ui §1.3 E4; Plan §5.5, §6.5 C6 |
| **FX-LG-13** | **One transport** | SSR and the browser read the same contract **through the same front door**; **SSR is a caller, never a privileged one**; no second proxy and no hook that fires on some paths only | AC-60; ui §1.4 L5; Plan §8 S14 |
| **FX-LG-14** | **SPLIT obligations** | **defeater completeness** (non-empty or exhaustion-marked); **`UNFALSIFIED-AFTER-ROTATION` serves**; the **regeneration cap** (2 rounds / 3 attempts) yields the **typed "not runnable" abstention** carrying the rejection evidence | Plan §8 S7; DR-041, DR-020 knob 5 |
| **FX-LG-15** | **Panel isolation and dispersion** | a **panel member failure isolates**; dispersion is measured across **≥2 distinct judgements** with a **prepended** driver and **no measurement below two**; correlated-error grouping by family in **first-appearance order**, non-compounding, unknown families never discounted against each other; **"independence unknown" carries a typed reason, never a default of "independent"**; raw provider/model strings **never embedded in a served weight record** | AC-04, **AC-92**; manifest §5.2a–m |
| **FX-LG-16** | **Judge contract — the composition map is data** | the **claim-type → composition map is held as data, never a source literal**; **parse failure and schema failure stay distinguishable**; the reducer **emits its branch**; ordered score caps each record **what / to-what / why / by-what**; drivers appear in a **fixed, never-reordered order**; declared numbers validate to `[0,1]` with typed fatal flags | **AC-92**; manifest §5.2a–m; DR-037 |

### 9.9 The register read path — two fixtures minted at C4 rework round 1

Both are owed to this document by lane 4's structural repair (`05-register-skeleton.md`
§5.4a under `H-C-5`; `03-module-design.md` §3.1 rows 26/27 resolving gap
`MOD-2 ≡ REG-5`), which named the mechanism and left the fixture id here.

| id | Fixture | Assertion | Slice | Authority |
|---|---|---|---|---|
| **FX-REG-01** | **Bootstrap equality — one register, two read locations, no second source of truth** | the CI assertion **fails the build if `register.bootstrap.json` and the ratified register disagree on any bootstrap key**. The **five** bootstrap-class keys (`nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion`, **`vllmImageDigest`** — the last added by `RULED — DR-117`/`DR-118`, `05` §5.4c) must be readable **before the database-backed register exists** — *you cannot run a migration to learn which Postgres major to install* — so they are read from a version-controlled file **through the same loader**, and once ratified the same five exist as `register_row`s in the pinned `register_version`. Two read *locations*, **one** source of truth; without the assertion the file and the database drift and a run pins a register it did not use, which is AC-06 broken with no trace. **The fixture asserts equality, never a value**: the five rows ship valueless and the values are V's at DR-023 (AC-76), filled at S00 under **DR-104**'s resolve-on-machine rule — the pre-S0 gate in `07-build-order.md` is where accepted values are recorded | **S0** (the gate must hold from the first build that reads a pin) · re-asserted at **S15** against the ratified `register_version` | AC-74, AC-76, AC-06; `05-register-skeleton.md` §5.4a clause 3; charter A5.2 |
| **FX-REG-02** | **The acceptance bundle can actually read the register** | `tools/acceptance-bundle` reads the register **through its declared read-only `register` dependency** (`03-module-design.md` §3.1 row 27, with `db` reached read-only *through* `register`) — not through an API call and not through a separate export artifact. Plan §8 S15 requires the bundle to **present the register for V's ratification**, and Plan §2.6's single `tools/*` row permitted only `kernel` and `contract`, so the obligation had **no legal implementation path**: gap `MOD-2 ≡ REG-5`, adjudicated **REAL** and resolved by lane 4's edge row. The fixture asserts the edge is exercised on a real bundle run, so the row is not an unexercised dependency — a `tools/*` edge that no run traverses is a `FX-ORPH-02` entry on the day it lands | **S15** (the bundle's own run) · edge present from **S0** so `FX-ORPH-01`'s walk sees it | AC-74, AC-77; charter A4.2/A4.4; Plan §8 S15 — **Plan §2.6's edge list needs the matching amendment, carried by lane 4 to FinalPlan** |

### 9.10 Fixtures minted by the DR-068…DR-097 fold-in

Five obligations arrived with the rulings and had **no fixture id**. They are
minted here because **§15 is the roster's home** and an obligation without an id
cannot be named in the acceptance bundle (charter A4.4). Each continues an
existing area's numbering; **the id is an identifier, not a measurement**
(AC-76), and **not one of these fixtures asserts a value**.

| id | Fixture | Assertion | Slice | Authority |
|---|---|---|---|---|
| **FX-WIRE-02** | **Executions-read pagination** (gap `API-1`) | `GET /v1/nodes/{nodeId}/executions` is **keyset-paginated, ordered by the ledger `sequence`** — never by timestamp; the caller's absent `limit` resolves to **`paginationLimitDefault`** and a `limit` above **`paginationLimitMax`** is refused rather than silently clamped past the bound; both limits are **read from the register, never as literals** (AC-74); the page envelope is `contract`'s single envelope; and **the read carries no write side effect** (AC-62 × AC-89). **The fixture asserts the mechanism, never a number** — both limits ship `— none stated` and are V's at DR-023 | **S1** (the paginated read over the ledger) · **S14** (interface limb, through the one transport with `FX-LG-13`) | AC-44, AC-62, AC-74, AC-76; `04-api-contract.md` §7.5/§7.6, §4; `05-register-skeleton.md` §5.4; **DR-099 (A-12)** ratifies executions pagination |
| **FX-WIRE-03** | **`GET /v1/session` — the principal surface** | the principal resolves **session → asker → answer ownership**, and the tier-2 `/inspection` gate and per-asker memory scope are evaluated **against this surface** rather than against an ad-hoc identity. **`RULED — DR-070`: the asker is the requesting user/person** — no separate authenticated-principal/session-scope model, V2's `user_dev_token` vertical slice adopted as sufficient. **Scope of the assertion, stated so it is not overclaimed:** authorization and user credentials are **explicitly out of scope at this stage**, so the fixture asserts **ownership scoping and its provenance**, never authentication strength. The row records DR-070's own condition: this is a **provisional simplification**, expected to need real principal/session separation before a multi-tenant or credentialed launch, and it carries **charter A5.2-style revisit language when built** | **S0** (the surface lands with the walking skeleton — `07-build-order.md` §3.2, PRE-01 lane) · **S13** (AC-71's per-asker pull scope evaluated against it) | AC-57, AC-71; DR-066(1); **DR-070**; `04-api-contract.md` §3.1, §4 |
| **FX-ORPH-07** | **The DR-097 advisory unread-key audit** | after a full build and the acceptance run, `tools/orphan-audit` emits a report of **every ratified register key that no code ever reads**. Two assertions: the report is **produced and non-vacuous** against a seeded deliberately-unread key, and it **does not fail the build**. **Force is the ruling's own: ADVISORY, non-blocking.** Register rows are **data, not code**, so they sit **outside charter clause 4's orphan reach** and the **BLOCKING** never-called list (`FX-ORPH-02`) stays about **executable units** — this lane exists so a stale row is *noticed* without **any** key needing a dated A4.3 exemption. Mixing the two would re-create by the back door exactly the consequence DR-097 declined | **S15** (`07-build-order.md` §3.3 assigns the lane to S15) | **DR-097** (ruling + V's amendment); charter §5, §5.1 G2, A4.1/A4.2, VR-4; AC-74, AC-77 |
| **FX-LG-17** | **Node-lifecycle events, consumer-declared** *(slice provisional — see the note below the table)* | a **pending node is structurally connected to its parent from the moment it spawns**, via the placeholder arrow DR-075 confirms is a **live, real arrow endpoint**; and its lifecycle — **generating → being judged → scored** — is **observable live on the stream**, not only after settling. Every lifecycle event carries a **declared consumer** (E1) and **one name per meaning** (E2), and payloads are **projection-grade or bare signals, never bundle-grade** (ADR-0008). Event names are `04-api-contract.md`'s node-lifecycle rows, not this document's. **The negative assertion is the load-bearing one: no served number changes because of it** — DR-076 is an observability/streaming obligation and **does not change what contributes to a served score** | **S7** (spawn half) · **S14** (UI half) — **PROVISIONAL, per `07-build-order.md` §3.3 (PRE-01)**, which is the owning-slice authority for work a ruling created. Recorded here, not settled here; **confirmed consistent** with §3.3's DR-076 row at the rev-3 repair | **DR-075, DR-076**; AC-61 (E1/E2), AC-64; `04-api-contract.md` event vocabulary; ui §1.3; slice per `07` §3.3 |
| **FX-LG-18** | **The WAIT drain law and the standing settlement watch** *(slice provisional — see the note below the table)* | two assertions, kept apart because they live on different sides of the run boundary. **(a) Drain:** at debate (run) completion **nothing remains in a waiting state** — every node is fulfilled and user-visible, a waiting node completes as soon as its dependencies complete, and **no completed run displays a dangling WAIT**. **(b) The watch is outside the run lifecycle:** the run records a **typed terminal state at completion**; Q61 **fires after the debate completes**, its outcome saved to the execution ledger (DR-027); **if the debate does not or cannot complete it never fires for that debate**; the standing watch **persists across runs**, fires when the resolver outcome arrives, and **calibration updates version from the ledger record**. Q61 is therefore **not an intra-run WAIT row** — a fixture asserting it as one would pin the reading DR-089 supersedes | **S12** (the watch) · **S7** (the intra-run WAIT drain half) — **PROVISIONAL, per `07-build-order.md` §3.3 (PRE-01)**, the owning-slice authority. Recorded here, not settled here; **confirmed consistent** with §3.3's DR-089 row at the rev-3 repair | **DR-089**; DR-027; AC-88; `02-data-model.md` §4.1a `run_row_activation`; spec §3 Q61; slice per `07` §3.3 |

**Slice ownership for the ruling-created fixtures is PRE-01's, not this
document's.** `FX-LG-17` and `FX-LG-18` exist because **a ruling created work no
slice previously owed**, and `07-build-order.md` **§3.3** — *"Work the rulings
created, and the slice that owes it"* — is where that work is assigned. The
slices in the two rows above are therefore **recorded, not settled**: they are
**provisional and subordinate to `07` §3.3**, the same discipline `FX-SRV-16`
follows against `07` §5.1. If §3.3 moves either, **`07` is right and these rows
are the ones to repair.**

**Consistency confirmed rather than assumed** (checked against PRE-01's landed
§3.3 text at the rev-3 repair, not inferred): §3.3 assigns **DR-076** to *"S7
(spawn half) · S14 (UI half)"* and **DR-089** to *"S12 (the watch) · S7 (the
intra-run WAIT drain half)"* — which is what the rows above carry. §3.3 also
assigns **DR-097** to **S15**, matching `FX-ORPH-07`, and explicitly leaves that
lane's **fixture id** to be minted here (*"the lane needs a fixture id, minted by
PRE-03 in `06`'s roster — not minted here; `06` §15 is the roster's home"*). That
is the standing division of labour between the two documents: **`07` owns which
slice owes the work; `06` owns the id and what it asserts.** This section mints
ids; it does not assign slices.

---

## 10. Manifest §12.2's scenario coverage

*"V3's property tests should exercise at least the shapes research/03
inventoried, read as **test scenarios rather than recorded pairs**."* The list is
the manifest's, in its own order. **None carries a V2 expected output** (manifest
§12.2; AC-80).

| # | Scenario family | What it exercises here |
|---:|---|---|
| 1 | **single node** | `FX-LV-06` (isolated node returns its own τ); S0's one-node graph |
| 2 | **shallow-wide fans** | `FX-PT-D3` sibling sets; aggregation across many arrows into one target |
| 3 | **deep chains** | materialized path, lifting under `FX-PT-D1`, ancestor-triggered invalidation |
| 4 | **realistic mixed graphs** | `FX-LV-03…05` non-strict properties; `FX-PT-ORD` |
| 5 | **degenerate and error graphs** | empty graph (`FX-LV-06`); cycle law (`FX-C52-10`); endpoint-absent write errors (`FX-DB-08`) |
| 6 | **container and pass-through shapes** | perspective containers and folder lifts. **`RULED — DR-072`**: the lifting predicates compose **folder-lift first, then `OD-02`'s judged-ancestor lift**, with **both-ends markers emitted in both cases** — so the generator must exercise the ordered pair, and the fixture asserts the markers on **both** lift kinds. The order is verdict-affecting (D2's measured `0.97 → 0.5` shift), which is why it is a ruled order and not an implementation detail |
| 7 | **evidence-verdict variants** | contradicting verdict ⇒ attack arrow with **typed unknown magnitude**; unverifiable / pending / absent / malformed ⇒ **no arrow** (AC-28) |
| 8 | **base-score extremes** | `τ ∈ {0, 1}` — **excluded from the strict generators, required in the non-strict ones** (§3.3) |
| 9 | **the mediating-function tie boundary** | `FX-LV-09` (`va == vs`, `≥` not `>`) |
| 10 | **arrow-strength extremes and conflicts** | zero-strength arrows and sources (excluded from strict generators); `FX-DB-05b`'s conflicting identity |
| 11 | **float accumulation order** | `FX-PT-ORD` + the recorded arrow order — *the left fold is not bit-identical under reordering in IEEE-754* (AC-08) |
| 12 | **unjudged subsets** | `FX-PT-D1`'s core generator; M1 transparency and both-ends markers (AC-21) |
| 13 | **the dedup ladder** — byte-identical → whitespace → case → Unicode → paraphrase | `FX-PT-D3`; the semantic-restatement flag is **non-gating and changes no number** (AC-25) |
| 14 | **judge-output duplication**, byte-identical and one-byte-apart | `FX-DB-05a`/`FX-DB-05b` — the pair that separates collapse from integrity error |
| 15 | **abstention and degradation paths** | `FX-LG-04`; `FX-SRV-06`, `FX-SRV-11`, `FX-SRV-15`; strict-and has **no identity element** (AC-26) |
| 16 | **operator-selection variants** | `FX-PT-D2`; both operators computable on demand, both identifiers recorded |
| 17 | **mixed-provenance payloads** | `FX-PT-D4`'s mixed-freshness assertion and payload fuzzing |
| 18 | **the reducer's compositions, caps, ladders and orderings** | `FX-LG-16` |
| 19 | **banding and suppression** | `FX-SRV-12`, `FX-SRV-13`; two axes, abstention in its own field (AC-66) |
| 20 | **the normalizer's classification, scope and ambiguity behaviour** | claim typing code-first with a **bounded model call only on `unknown`** (AC-92); the five terminal routes |

---

## 11. The orphan audits — G1, G2, G5

Charter §5 defines the unit a stranger can apply: *a shipped unit — module,
function, endpoint, table, migration, config flag, prompt — is **live** if (a) it
is reachable from a declared entry point and (b) it is actually called on a real
run. **Anything else is an orphan.*** `tools/orphan-audit` carries **three named
mechanisms, not one** (Plan §2.7).

| id | Audit | Mechanism | Force |
|---|---|---|---|
| **FX-ORPH-01** | **G1 — reachability** | a **static walk of the TypeScript program, the contract field inventory and the event registry from a published entry-point list**, **plus an intra-repo static type-graph pass over the kept UI package** as a required build input, so **both directions** of AC-61 are decided. **`REPAIRED per RULED — DR-069`, a correction directed to this ticket by `07-build-order.md` §3.4 (PRE-01 lane):** this row previously named the fenced interface's **`consumer-manifest.json`** as the required input and made a missing manifest fail the release. **DR-069 rules NO FENCE** — the kept UI package sits inside `DebateAI-V3` as a plain, always-visible package — so **the consumer-manifest mechanism is not required**, and a build input that no longer exists cannot fail a release. **The obligation is not repealed and the force does not move**: AC-61's bidirectional rule — *no served field without a consumer, no consumer without a served field, no emitted event without a declared consumer* — is unchanged and **still fails the build** (`FX-ORPH-04`); what changed is that the consumer side is now readable **in one repository by a type-graph walk** instead of by a cross-build artifact. **DR-069 names no replacement; the type-graph pass is the choice `07` §3.4 made and this row consumes** | obligation **CLAUSE(DR-047)**; mechanism **ADVISORY(DR-063)**; **DR-069**. The audit **publishes the entry-point list it walked** — *an unnamed entry point is how orphans hide* |
| **FX-ORPH-02** | **G2 — call coverage** | a **runtime call tape from the acceptance run**, yielding the **never-called list**. Every entry is **deleted or exempted before release** | **BLOCKING(DR-063)**, charter A4.2 — *"a release with an unexplained entry does not go out"* |
| **FX-ORPH-03** | **G5 — dead cost** | a **reviewed manual audit**, because *"a unit whose output no served surface, no ledger row and no downstream decision consumes"* is **not statically decidable**. Plus the **`measurement_lane` exemption**: spend whose only consumer is the **scorecard**, with **the consumer named on the lane** and its output **demonstrably reaching the scorecard** — without which G5 deletes the judge panel P-D5's cold-start exit depends on | **ADVISORY(DR-063)** — G5's advisory status is VR-5's own classification; **G2's output is what blocks** |
| **FX-ORPH-04** | **W19 — the interface's slice** | the reachability check **fails the build on an orphan**: **no served field without a consumer, no consumer without a served field; no emitted event without a declared consumer** — both directions of drift are defects | AC-61, AC-77; ui §5 W19; **blocking at S14** (Plan §8) |
| **FX-ORPH-05** | **G4 — configuration reachability** | **no configuration branch may be permanently unreachable**: every branch of every register flag is exercised by a test constructing a configuration **a production caller can actually produce** — *the precise failure D5 records*. Exercised on **the learned path** at S12 | **RATIFIED(DR-026)** for the learned path; **ADVISORY(DR-063)** as generalized |
| **FX-ORPH-06** | **Dead-check detector** | `tools/orphan-audit` **does** owe a dead-check detector — a gate un-fireable against its own data — at **advisory** force, because the dead check sits outside the D1–D5 register and inside charter clause 4 | Plan §6.9 item 3; charter §5.1 G3, §9 item 3 |
| **FX-ORPH-07** | **The unread-register-key audit** | after a full build and the acceptance run, a report of **every ratified register key no code ever reads** — produced, non-vacuous against a seeded unread key, and **never failing the build**. Minted at the DR-068…DR-097 fold-in; stated in full at §9.10 | **ADVISORY**, non-blocking, by the ruling's own terms — **`RULED — DR-097`** plus V's amendment. Register rows are **data, not code**, so they sit outside clause 4's reach and `FX-ORPH-02`'s **BLOCKING** list stays about executable units |

**Exemptions** (charter A4.3, VR-4): **configuration-class only**, granted by **V
alone**, and **dated**. *An exemption names the run that will call the unit and
expires at the next release; an expired exemption fails the build.* An undated or
non-V exemption **is not an exemption**. The three ways a flag can exist, which
VR-4's option text distinguishes: **(1)** reachable code behind an off-by-default
flag — **G4's subject, not an orphan**; **(2)** dormant code behind a flag **no
production configuration can set** — the D5 shape, **the case the exemption exists
for**; **(3)** configuration data with no code — **no executable unit at all**.

> **`RULED — DR-097` (Q-28, charter §9 item 7): class (3) is OUTSIDE clause 4's
> reach.** Register rows are **data, not code**; the never-called list stays
> about **executable units**; **AC-74's ratify-before-production gate is what
> governs the register**. So **no unfilled register key is an entry on the
> BLOCKING never-called list**, `packages/register`'s skeleton of valueless keys
> (AC-76) does **not** make the S15 list non-empty by construction, and **no key
> needs a dated A4.3 exemption**. Charter §9 contradiction 7 is resolved and
> **LRD-2 is satisfied** (`07-build-order.md` §7).
>
> **V's amendment keeps it observed rather than merely exempt:** an **advisory,
> non-blocking audit reports any key no code ever reads after full build** —
> fixtured as **`FX-ORPH-07`** above (§9.10), landing at **S15**. The two lanes
> must not be merged: `FX-ORPH-02` blocks and is about executable units;
> `FX-ORPH-07` reports and is about data. Merging them would re-impose by
> mechanism the outcome DR-097 declined by ruling.

**Sequencing rule (ii), from Plan §8, restated because it is a test rule:** *"No
slice adds a module that no other slice calls; a module without a caller is an
orphan on the day it lands (AC-77), so `tools/orphan-audit` runs **from S0
onward** and its never-called list is reviewed at **every slice boundary**, not
only at S15."*

---

## 12. The fixture map by slice

Plan §8's gate columns, as a fixture index. **Entry criteria and the
launch-readiness matrix are `07-build-order.md`'s**; this table exists so a
builder can find the fixtures a slice owes.

**This map is exhaustive against §15's roster.** Every id in the roster appears
in at least one row below or in the **standing** row, and no row names an id the
roster does not carry. A fixture with no slice is a **dark gate** — Plan §8
sequencing rule (i): *"a slice with a dark gate is not done"* — and charter A4.4
blocks on a missing fixture, so an unassigned id is a defect, not a deferral.
**Reconciled against `07-build-order.md` §5 matrix A** on every gate the two
documents share, and the two known reconciliations (stranger coverage, zero-call
proof) are carried below. This paragraph's original tie-break — *"where the two
disagree, **matrix A's slice assignment is the one to repair**"* — is
**SUPERSEDED and carries no force**: it had two readings pointing opposite ways,
and `07-build-order.md` **§5.1** resolved the question on the merits as the
**operative tie-break** (PRE-01).

**Cross-lane reconciliation, and who ruled it.** The fixture-slice disagreements
surfaced by the fold-in — **`FX-SRV-16`** first among them — are **ruled inside
`07-build-order.md` §5.1 by the PRE-01 lane**, not picked independently here.
This document **records** the reconciled assignment and names its source; where a
row's slice came from that reconciliation it says **"reconciled per `07` §5.1
(PRE-01)"**. The reason for the split is the one §12's preamble already states:
**an unassigned id is a defect**, so exactly one document must own the tie-break,
and `07` owns slice assignment. Where this table and `07` §5.1 ever disagree
again, **`07` §5.1 is the one to read and this table is the one to repair.**

| Slice | Fixtures it must show |
|---|---|
| **S0** — walking skeleton, a *legal* serve path | `FX-SRV-17` (four AC-52 gates in order, position-named) · `FX-C52-03` (R9 fires in position) · `FX-SRV-01a` / `FX-SRV-01b` (the two Q51 fixtures) · `FX-SRV-18` (two conformance failures ⇒ components-only + DEFECT) · `FX-LG-01a` (continuous replay self-test, **wired**; `apps/scheduler` · `job:replay-self-test` is a **named entry point** from the day it lands, charter G1/A4.5) · `FX-LG-02` (ledger tells the truth) · `FX-LG-04` (kernel membership + count, **five terminal routes** — §6.2) · `FX-LG-06` (stranger coverage **exhaustive, no sampling** — matrix A S0) · `FX-HR-H1` (every model call crosses the one interface, from the first judge call) · `FX-HR-H3` (purity gate live with `propagation`) · `FX-LED-04` (two stamps on every action row) · `FX-S22-05` (zero-call proof, the framing MACHINE rows) · **`FX-REG-01`** (bootstrap equality — the five pins are read through one loader from the first build) · **`FX-REG-02`**'s edge present so `FX-ORPH-01`'s walk sees it · `FX-ORPH-01` / `FX-ORPH-02` **wired and reporting** · `FX-DB-07` (carrier) · **`FX-WIRE-03`** (`GET /v1/session` — the principal surface, `RULED — DR-070`; slice per `07` §3.2, PRE-01) |
| **S1** — ledger and replay hardening | `FX-LG-01b` (ceremony passes **exactly**, byte-identical numbers, no model in the path) · `FX-LG-01a` (hardened: the eviction trigger fires end to end into `FX-SRV-03` / `FX-SRV-05`) · `FX-IND-01` / `FX-IND-02` / `FX-IND-03` (all three independence limbs evidenced) · `FX-LED-01a` / `FX-LED-01b` (completeness-gate pair) · `FX-LED-02` (four reconstruction paths) · `FX-LED-03` (`UNCLASSIFIED_ACTION`) · `FX-LED-04` (hardened) · `FX-LED-05` (hash triple) · `FX-DB-01a` / `FX-DB-01b` / `FX-DB-02` (run immutability and totality) · **`FX-WIRE-02`** (executions-read pagination — keyset over the ledger `sequence`, limits from the register, gap `API-1`) |
| **S2** — graph and the cycle law | `FX-C52-10` (three layers) · `FX-DB-03a` / `FX-DB-03b` · `FX-DB-04a` / `FX-DB-04b` · `FX-DB-05a` / `FX-DB-05b` · `FX-DB-06a` / `FX-DB-06b` · `FX-DB-08` · `FX-PT-ORD` |
| **S3** — scoring engine | `FX-LV-01` / `FX-LV-02` (both vectors reproduce) · `FX-LV-03…09` · `FX-PT-D1` / `FX-PT-D2` / `FX-PT-D3` green · **`FX-PT-FLG`** (AC-25, restatement flag changes no number) · **`FX-PT-POS`** (AC-31, no position re-encoding) · `FX-C52-09` (`LEVERAGE_UNRESOLVED`) · `FX-HR-H4` (both operators computable on demand) |
| **S4** — judge contract and panel | `FX-S22-01` (**fires both ways**, VR-1) · `FX-PT-D1` (no default τ from an unusable judge) · `FX-LG-15` (panel member failure isolates) · `FX-LG-16` (reducer; composition map as data) · `FX-HR-H6` (produced-never-grades limb) |
| **S5** — serve pipeline hardened | `FX-C52-02` · `FX-C52-08` · `FX-C52-11` · `FX-C52-12` · `FX-SRV-02…16` · `FX-SRV-19a…f` (six terminals) · `FX-WIRE-01` · `FX-LG-03` · `FX-LG-04` (one abstention kind + several condition marks per answer) · `FX-LG-06` (**sampling** — matrix A S5; **unblocked by `RULED — DR-079`**, which supplies the load-bearing predicate the partition needs) · **`FX-PT-D4`** (payload assembly) · `FX-HR-H7` (Q53 ahead of conformance) · `FX-SRV-13` (**the band cap** — a second, independent gate that caps and serves, `RULED — DR-082/DR-086`) |
| **S6** — evidence subsystem | `FX-HR-H5` · `FX-LG-08` (off-subject downgrade visible) · `FX-PT-D3` against real clusters · `FX-DEF-01` (**NOT-SHIPPED attestation**, not a fixture) · **`FX-DEF-02`** (`UNCOVERED-SCOPE` ships as a **diagnostic note**; the **gate does not ship** — matrix A: *no gate slice*; the attestation lands in the S15 bundle) · `FX-SRV-12` · `FX-S22-05` (the evidence-stage MACHINE rows) |
| **S7** — SPLIT loop and defeaters | `FX-LED-06` (only categorically-grounded decisions spawn) · `FX-HR-H3D` (organ-4 purity fence) · `FX-HR-H7` (defeater completeness / skeptic certification) · `FX-LG-14` · **`FX-LG-17`** (spawn-time node lifecycle observable live, consumer-declared — `RULED — DR-075/DR-076`; **slice provisional per `07` §3.3, PRE-01**) · **`FX-LG-18`** (the **WAIT drain law** limb — `RULED — DR-089`; **slice provisional per `07` §3.3, PRE-01**) |
| **S8** — CROSS | `FX-S22-02` (symmetry both ways — **`RULED — DR-092`**: the diff runs over **item-scoped actions only**, pre-item actions excluded **by kind, never by value**, so **`UNASSIGNED` stays a real signal** and the fixture is passable as designed) · `FX-C52-04` (DR-014 cap) · `FX-PRV-01a` / `FX-PRV-01b` / `FX-PRV-02` (**both halves, fixtured separately**) · **`FX-HR-H2a`** (the **config-only switch — a launch prerequisite** under AC-38/DR-055, evidenced again in the S15 bundle) · **`FX-HR-H2b`** (the plugin boundary) · `FX-HR-H6` (blinding and identity-stripping) · `FX-LED-03` (`UNINSTRUMENTED` trigger limb) · `FX-LED-04` (the `UNASSIGNED`-survives limb of **DR-092**). **`RULED — DR-091` — the CROSS row contract this slice builds:** the **CASUAL-tier blind-verification trigger is the CROSS-entry leverage snapshot**, computed from the then-current graph **by the pure core with no model calls** and **recorded as the trigger's basis**; the **COMPOSE-time recomputation is authoritative**. V explicitly authorized this proxy, so S8's trigger is fixtured against a **recorded basis**, never against a re-derived one. **Standard and high-stakes coverage is unchanged** — CROSS always runs (DR-019 knob 3), so no fixture may sample it |
| **S9** — budget and envelope | `FX-C52-06` · `FX-C52-07` · `FX-LG-05` (rate frozen at run start) · `FX-LG-06` (frozen-rate limb — matrix A S9) · `FX-HR-H8` (protected-core refusal · enrichment-before-hard-stop · the convergence comparison's typed non-comparison reason) · `FX-SRV-16` (**owning slice — reconciled per `07` §5.1 (PRE-01)**; the mark it inspects is the budget skip) · `FX-DB-07` (behaviour limb — **DR-094**'s raise-never-lower direction) |
| **S10** — value overlay | `FX-LG-07` (overlay detachment byte-identity) · `FX-LG-11` |
| **S11** — staleness and liveness | `FX-C52-05` · `FX-LG-12` |
| **S12** — settlement and scorecards | `FX-S22-03` (cold-start exit **demonstrably executes**) · `FX-PT-D5` green (**`RULED — DR-077`**: the weight change must reach a **served** number through the **selection**, never by averaging; dispersion asserted on its own field) · `FX-ORPH-05` (G4 on the learned path) · `FX-LG-09` · `FX-LG-10` · **`FX-LG-18`** (the **standing settlement watch** limb — fires when the resolver outcome arrives, **outside any run**, calibration versioned from the ledger record; `RULED — DR-089`; **slice provisional per `07` §3.3, PRE-01**, which also names the watch a **third `apps/scheduler` job** owing a published entry-point listing and its own credential scope) |
| **S13** — cross-run memory | `FX-S22-04` (inertness **and** firing) · `FX-PT-MEM` · `FX-WIRE-03` (AC-71's per-asker pull scope evaluated against the principal surface) · *no memory sentence without a match fact* |
| **S14** — UI data-layer rebuild | `FX-LG-13` (L5) · `FX-ORPH-04` (L6, **fails the build on an orphan**) · `FX-WIRE-01` · `FX-WIRE-02` (interface limb) · **`FX-LG-17`** (the lifecycle rendered live — `RULED — DR-076`; **slice provisional per `07` §3.3, PRE-01**) · `FX-SRV-10` · `FX-PT-D4` (wire limb). **`RULED — DR-095`: "kept component" = kept SURFACE, rebuilt insides** — pages, canvas, drawers, badges and navigation stay; components are rebuilt inside as the flex rows require, and **each altered component is approved at its mockup review** (DR-064). No fixture asserts a mockup; the slice's fixtures assert the **data layer**, which is what is rebuilt |
| **S15** — launch bundle | §13's contents list, which consumes `FX-C52-01…12` · `FX-DEF-01` / `FX-DEF-02` · `FX-IND-01` / `FX-IND-02` / `FX-IND-03` · `FX-PRV-01a` · `FX-HR-H2a` · `FX-S22-05` (complete 13-row attestation) · `FX-ORPH-02` (never-called list, **BLOCKING**) · `FX-ORPH-01` (entry-point list G1 walked) · **`FX-REG-01`** (re-asserted against the ratified `register_version`) · **`FX-REG-02`** (the bundle's register read exercised on a real run) · **`FX-ORPH-07`** (the DR-097 advisory unread-key report — **ADVISORY, never blocking**) |
| **standing — every build, no single owning slice** | `FX-HR-H3` and `FX-HR-H3D` (lint gates, once their packages exist) · `FX-ORPH-01` / `FX-ORPH-02` (from **S0 onward**, reviewed at **every slice boundary**, Plan §8 rule (ii)) · `FX-ORPH-03` and `FX-ORPH-06` (**ADVISORY**, reviewed audits) · `FX-LV-*` and `FX-PT-*` (the property suites re-run on every build once landed) · `FX-LG-01a`'s continuous replay limb. **These are the CI-cross-cutting subset named in §14**; each still has a first-landing slice above |

---

## 13. What the acceptance bundle carries

`tools/acceptance-bundle` emits the artifacts charter A4.2/A4.4/A4.5 and Plan §8
S15 name. This is the **contents** list; the readiness judgement is
`07-build-order.md`'s.

| Item | Force | Authority |
|---|---|---|
| the **never-called list** (empty or itemized) | **BLOCKING** | charter A4.2; AC-77 |
| **one firing fixture per §5.2 row**, named by fixture id (`FX-C52-01…12`) | **BLOCKING** | charter A4.4 |
| **NOT-SHIPPED attestations** for the citation hard-kill gate and coverage-as-gate (`FX-DEF-01`, `FX-DEF-02`) | **BLOCKING** (in lieu of fixtures) | charter §5.2 deferred table, A4.4; AC-78 |
| the **replay-ceremony isolation proof** (`FX-IND-01`, `FX-IND-02`) and the **operator attestation** (`FX-IND-03`) — **both VR-3 limbs** | **BLOCKING** (VR-3 ceremony passes) | charter S1, VR-3; Plan §2.5, §8 S15 |
| the **`deployment_maker_capability` attestation** | **BLOCKING** (Plan §8 S15: *S4 multi-maker deployment attestation present*) | AC-38; charter S4 |
| the **intra-repo static type-graph pass report** against the pinned contract version | **BLOCKING** (AC-61's bidirectional rule still fails the build) | AC-61; **`RULED — DR-069`** — this **replaces the fenced interface's consumer manifest**, which DR-069 makes **not required** by removing the fence. An acceptance-bundle **artifact without a fixture id**, evidenced by `FX-ORPH-01` / `FX-ORPH-04`; the replacement choice is `07-build-order.md` §3.4's (PRE-01) |
| the **`UNCLASSIFIED` battery-row report** | reported as an **outstanding item**, so the gap is loud rather than absorbed | **`RULED — DR-093`** — until the 71-row split is ratified at **VG-02**, unclassified rows behave as **correctness** and the report names them |
| the **advisory unread-register-key report** (`FX-ORPH-07`) | **ADVISORY** — reported, never blocking | **`RULED — DR-097`** + V's amendment; charter A4.1 |
| the **entry-point list G1 walked**, and the run G2 measured | **ADVISORY** | charter A4.5 |
| the **register presented for V's ratification** | ratified **before production** | AC-74; DR-023 |

**One thing the bundle must not contain.** *"`tools/acceptance-bundle` emits **no
aggregate quality score**, and **no CI gate computes one**"* — charter A1.3
`RATIFIED(DR-039)`: *"No proxy metric may stand in for V's judgment … none may be
declared 'the bar'."* (Plan §6.9 item 2.) Clause 1 acceptance is **V's judgment on
outputs**, and this document does not convert it into a number.

---

## 14. CI gates, and what blocks

Plan §2.7's CI row, with the force column made explicit (charter VR-5).

**The stage list's membership has never changed** — not at the C4 proposal, not
under the superseded DR-105 pass, not at this restoration.

| CI stage | What it runs | Force |
|---|---|---|
| typecheck | one type system across engine, API and **the kept `web` package's** contract consumption — **one in-repo program graph**, since **`RULED — DR-069`** removed the fence and **`RULED — DR-117`** keeps it one language. Both together are what make `FX-ORPH-01`'s type-graph pass possible; either alone would not | build |
| lint | `no-impure-import` on **both** `propagation` and `battery/decision`; `no-source-literal-constant`; `require-exhaustive-switch` (**both clauses** — exhaustive, *and* a fall-through that exists; `03-module-design.md` §6.3); `no-unlabeled-number` | build (`FX-HR-H3`, `FX-HR-H3D`) |
| unit | per-package suites | build |
| property | layer 1 and layer 2 (`FX-LV-*`, `FX-PT-*` — **including `FX-PT-D4`, `FX-PT-FLG` and `FX-PT-POS`**), on a **pinned seed** so a red build is re-runnable | build; **charter S2 makes P-D1…P-D5 mandatory** |
| db-integration | every `FX-DB-*` against a real Postgres, through the connection | build |
| contract | schema-driven from `packages/contract`; the event vocabulary's declared-consumer check (E1) and the one-name-per-meaning check (E2) — **covering the SSE event names ruled at DR-117 like any other wire shape** | build |
| replay self-test | **`FX-LG-01a`** — the continuous limb, run by `apps/scheduler` · `job:replay-self-test` against the shared `propagation` engine. **`FX-LG-01b` is not a CI stage**: the ceremony is a launch gate run by a separate principal on runs it did not produce (`FX-IND-03`), so scheduling it inside the acceptance job would defeat VR-3 limb (iii) | build |
| orphan audit (report) | `FX-ORPH-01`, `FX-ORPH-03`, `FX-ORPH-05`, `FX-ORPH-06`, **`FX-ORPH-07`** (the DR-097 unread-key lane) | **ADVISORY** (charter A4.1) |
| never-called list | `FX-ORPH-02` | **BLOCKING** (A4.2) |
| firing-fixture presence | every `FX-C52-*` present, or its `FX-DEF-*` attestation | **BLOCKING** (A4.4) |

**The CI-cross-cutting subset, named explicitly.** The stages above run on
**every build once their package exists**, so their fixtures are not owed by one
slice alone. That subset is enumerated in §12's **standing** row — the two lint
purity gates, the two orphan audits that run from S0 onward, the two advisory
reviewed audits, the whole `FX-LV-*` / `FX-PT-*` property suite, and
`FX-LG-01a`, the continuous replay limb. **Every one of them still has a first-landing
slice in §12**, so no fixture is discharged by "CI runs it" alone: a gate that
CI runs but that no slice ever showed *firing* is still a dark gate under Plan
§8 rule (i).

**Structural rules the CI enforces** (Plan §2.6), each of which is the mechanism
behind a gate above: (1) `propagation` in no dependency cycle, importing only
`kernel` and `published-arithmetic`; (2) `contract` the **only** package the
interface may import types from; (3) `apps/replay` imports **no** workspace
package except `packages/published-arithmetic`; (4) no engine package imports
from the interface, and **the kept `web` package imports nothing but
`packages/contract`** — **code coupling only; nothing in CI substitutes for the
reading-level clean-room split** (AC-81, manifest §14); (5) `battery/decision`
imports nothing but `kernel`.

**These five are import fences, and `RULED — DR-069` does not touch them.** The
ruling removed **one** barrier — the kept interface's **checkout separation** —
and rules 1–5 are a different mechanism serving different constraints: they are
**dependency-graph properties a build can check**, which is why they survive
unchanged while the clean-room split does not. Rule 4 in particular is now an
**intra-repo** edge rather than a cross-checkout one, and that is what makes
`FX-ORPH-01`'s type-graph pass possible at all — but its force and its wording
are the same, and **its second clause remains the honest one**: the reading-level
split has **no CI substitute**, before DR-069 or after.

---

## 15. Fixture id roster

| Prefix | Range | Covers |
|---|---|---|
| `FX-LV-` | 01–09 | two literature vectors · four non-strict properties · two strict properties · the tie boundary |
| `FX-PT-` | D1–D5, ORD, MEM, **FLG**, **POS** | the five defect prohibitions · arrow-order stability · no transitive closure · **AC-25's restatement-flag invariance** and **AC-31's no-position-re-encoding** (both minted at C4 rework round 1, gap `TRACE-5`) |
| `FX-HR-` | H1, H2a, H2b, H3, H3D, H4–H8 | the eight house rules (H2 as two tests; purity as two gates); AC-39's context isolation is `FX-HR-H6` and is not counted twice |
| `FX-LG-` | **01a**, **01b**, 02–**18** | manifest §12.2's seven law gates + its eighth combined bullet — **the replay gate is two ids**, the continuous limb (`apps/scheduler`) and the launch ceremony (`apps/replay`), split at the C4 rework sync per `03-module-design.md` §5.5.0 · routing guards · scorecard honesty · overlay owner · E4 · one transport · SPLIT · panel · reducer · **17 node-lifecycle events, consumer-declared (`RULED — DR-075/DR-076`)** · **18 the WAIT drain law and the standing settlement watch (`RULED — DR-089`)**. Both minted at the DR-068…DR-097 fold-in (§9.10) |
| `FX-C52-` | 01–12 | charter §5.2's twelve **BLOCKING** rows |
| `FX-DEF-` | 01–02 | the two deferred gates' **NOT-SHIPPED attestations** |
| `FX-S22-` | 01–05 | spec §22.1 launch gates not otherwise mapped |
| `FX-DB-` | 01–08 | run immutability and totality · non-blank claim · undercut pair · upsert pair · cross-run set · `tier_source` · remaining write-time invariants |
| `FX-LED-` | 01–06 | completeness-gate pair · reconstruction paths · action vocabulary · two stamps · hash triple · decision replay identity |
| `FX-SRV-` | 01–19f | Q51 pair · eviction's three assertions · five refusals · sanitizing · reconciliation · degradation · band ceiling · six terminals · gate-position proof |
| `FX-WIRE-` | **01–03** | 01 no `raw_text` in any tier-2 payload · **02 executions-read pagination** (keyset over the ledger `sequence`; limits from the register; gap `API-1`, ratified as **A-12** at DR-099) · **03 `GET /v1/session`, the principal surface** (**`RULED — DR-070`** — asker = the requesting user/person; ownership scoping asserted, not authentication strength). Both minted at the DR-068…DR-097 fold-in (§9.10) |
| `FX-IND-` | 01–03 | isolation proof · exported-surface pin · operator attestation |
| `FX-PRV-` | 01a/01b, 02 | maker-inventory pair · the transient-vs-standing counter |
| `FX-ORPH-` | 01–**07** | G1 · G2 · G5 · W19 · G4 · dead-check detector · **07 the advisory unread-register-key audit (`RULED — DR-097` + V's amendment), ADVISORY and never blocking** — minted at the DR-068…DR-097 fold-in (§9.10) |
| `FX-REG-` | **01–02** | **bootstrap equality** (`register.bootstrap.json` ≡ the ratified rows, or the build fails) · **acceptance-bundle register read** through the declared read-only edge. Both minted at the C4 rework sync from lane 4's `05` §5.4a and `03` §3.1 row 27 |

**Roster ↔ slice-map completeness.** §12 is exhaustive against this roster: every
id above appears in at least one slice row or in §12's **standing** row.

**Ids minted at the DR-068…DR-097 fold-in (PRE-03), each with its slice — the
roster stays exhaustive and no id is left unassigned** (*"an unassigned id is a
defect, not a deferral"*, §12):

**Slice column discipline:** where a slice came from `07-build-order.md` it says
so and is **provisional against `07`**, which owns slice assignment; this
document owns the **id** and **what it asserts** (§9.10's closing note).

| id | Obligation the ruling created | Slice(s) in §12 | Slice authority |
|---|---|---|---|
| **`FX-WIRE-02`** | executions-read pagination (gap `API-1`; A-12 at DR-099) | **S1** · S14 (interface limb) | this document; no `07` row claims it |
| **`FX-WIRE-03`** | `GET /v1/session`, the principal surface (DR-070) | **S0** · S13 (per-asker pull scope) | S0 per **`07` §3.2** (PRE-01) |
| **`FX-ORPH-07`** | the advisory unread-register-key audit (DR-097) | **S15** · §14's advisory orphan-audit stage | S15 per **`07` §3.3** (PRE-01), which leaves the **id** to this roster |
| **`FX-LG-17`** | node-lifecycle events, consumer-declared (DR-075/DR-076) | **S7** (spawn half) · **S14** (UI half) | **PROVISIONAL — `07` §3.3** (PRE-01); consistency confirmed, not assumed |
| **`FX-LG-18`** | WAIT drain + the standing settlement watch (DR-089) | **S12** (watch) · **S7** (drain) | **PROVISIONAL — `07` §3.3** (PRE-01); consistency confirmed, not assumed |

Ids minted or moved at C4 rework round 1 and its sync pass: `FX-PT-FLG` and
`FX-PT-POS` land at **S3**; `FX-S22-05` (zero-call proof, gap `BUILD-1`) and
`FX-PT-D4` (gap `BUILD-2`) — which existed without a slice — are assigned at
**S0/S6/S15** and **S5/S14** for lanes 1 and 7 to consume; `FX-LG-01` **splits
into `FX-LG-01a` (S0 wired, S1 hardened) and `FX-LG-01b` (S1)**, so every id that
referenced the old undivided row now names the limb it meant; `FX-REG-01` lands
at **S0** and is re-asserted at **S15**, and `FX-REG-02` lands at **S15** with
its edge present from **S0**.

---

## 16. What this document does not decide

- **No V-QUESTION is ruled here** (packet law 5; Plan §9) — and none is left to
  rule. All 28 were ruled by V at **DR-068…DR-097** and closed at **DR-100**;
  this document **carries** the rulings and cites them. The questions this
  document touches, what each held up, and what its ruling did:

| Q | Plan id (provenance) | What waited on it here | **Ruling, and its effect on the fixture** |
|---|---|---|---|
| **Q-01** / **Q-02** | `AQ-2` / `AQ-3` | the clean-room fence (§1 P2) | **DR-068 / DR-069** — source may be carried; **NO FENCE**. P2's prohibition stands with **no checked barrier**; `FX-ORPH-01`'s consumer-manifest input is **replaced by the intra-repo type-graph pass** (§11, §13) |
| **Q-03** | `AM-12` | the tier-2 handle's principal (`FX-WIRE-01`'s scope) | **DR-070** — asker = the requesting user/person; authorization out of scope. `FX-WIRE-03` minted for the principal surface (§9.10) |
| **Q-04** | `A-1` | the undercut's arithmetic; `UNDERCUT_TRANSMISSION` unwritable | **DR-071** — **`transmission-reduction`**, a **third** ruled producer. The fence comes off: fixtures **write** the member and assert the recorded per-edge reduction (§9.4) |
| **Q-05** · **Q-06** · **Q-08** | `A-3` · `A-4` · `A-9` | lifting composition · collapse over attacks · `pending` nodes | **DR-072** folder-lift then judged-ancestor lift, markers both cases (§10 row 6) · **DR-073** collapse on **both polarities** (`FX-PT-D3`) · **DR-075/DR-076** a `pending` node **is** an unjudged interior node, placeholder arrows are **live**, lifecycle observable live (`FX-LG-17`) |
| **Q-07** | `A-8` | `FX-PT-D2`'s undeclared-parent limb | **DR-074** — deployment operator **MANDATORY**. The limb is **deleted** and replaced by the register-resolution assertion (§4) |
| **Q-09** | `U-4` ≡ `A-6` | `FX-PT-D5`'s assertion target | **DR-077** — weight **multiplies the served arithmetic** through **selection**, never averaging; dispersion served separately. P-D5 now has a target |
| **Q-10** | `OQ-G3` | the hard bundle budget — the third compose-time terminal | **DR-078** — **independent row** + asker-selected tiers; the route is ruled and waits on **DR-023 values**, not a question (§9.6) |
| **Q-11** | `AM-1` | the non-node senses of "load-bearing" | **DR-079** — they **project from the charter's node definition** by a written predicate; `FX-LG-06`'s sampling limb is constructible |
| **Q-12** | `AM-3` | the abstention/scorecard axes | **DR-080** — **three separate vocabularies** plus **two explicit mapping-table register rows**; contents V's (`05` §5.4) |
| **Q-13** | `U-1` | `OD-11` layer-2 activation | **DR-081** — a **register row V flips**, layer 1 default, **both states testable**, nothing ships dark |
| **Q-14** | `AQ-1` | `FX-SRV-13`'s semantics and label content | **DR-082 + DR-086** — a **second, independent gate** that **CAPS the band**, never blocks. Label vocabulary and cut points stay register rows (§9.5) |
| **Q-15** | `OQ-G9` | the activation table's provenance | **DR-083** — **re-derived and ratified in-repo** as a per-row contract field with a written predicate; a row the spec only summarizes files as **`POLICY_BLOCKED`**, loud, never a silent skip |
| **Q-16** · **Q-18** | `OQ-G10` · `A-7` | `FX-HR-H5`'s eight routes and the `mixed`/`unknown` side | **DR-084** — closed enum, **architecture proposes, V ratifies** (**VG-02**), no generic "other" · **DR-087** — `mixed`/`unknown` **fail-closed**; `value-laden` a **cross-cutting flag, not a claim type** |
| **Q-17** | `U-2` | `FX-SRV-12`'s eligibility map | **DR-085** — **empty register table**, gate **tier-invariant in shadow mode**, eligibility = the exact complement of spec §5.2(f) |
| **Q-19** | charter §9 item 6 | `FX-DEF-01` — attestation or fixture | **DR-088** — auto-activation **counts as shipped dark**; the gate is **written when the matcher validates**, and `FX-DEF-01` stays a **NOT-SHIPPED attestation** |
| **Q-20** | `AM-10` | run termination with rows in WAIT | **DR-089** — the **WAIT drain law** plus a **post-completion settlement watch outside the run**; `FX-LG-18` minted (§9.10) |
| **Q-21** | `AM-14` | the behavioural-difference metric | **DR-090** — maker-diversity floor alone; the metric is **recorded unavailable, never approximated**. No fixture asserts a proxy |
| **Q-22** | `AM-2` | the casual-tier trigger's basis | **DR-091** — the **CROSS-entry leverage snapshot**, pure-core, no model calls, **recorded as the trigger's basis**; COMPOSE-time recomputation authoritative (§12 S8) |
| **Q-23** | `AM-4` | `FX-S22-02`'s passability | **DR-092** — **item-scoped actions only**, pre-item excluded **by kind, never by value**; `UNASSIGNED` survives. The fixture is passable as designed |
| **Q-24** | `OQ-G2` | `FX-C52-06`'s constructibility | **DR-093** — architecture proposes the **71-row split**, V ratifies **once** at **VG-02**; until then rows behave as **correctness**. Still LRD-1 |
| **Q-25** | `AM-5` | `FX-DB-07`'s ownership | **DR-094** — **asker declares; policy may RAISE, never lower**. The fixture gains a **directional** assertion |
| **Q-26** | `C5` | what "kept component" means for S14 | **DR-095** — **kept SURFACE, rebuilt insides**; each altered component approved at its mockup review (§12 S14) |
| **Q-27** | `C8` | the verdict-first flag | **DR-096** — **no such flag**; the register row is **deliberately absent** (`05` §5.4-i). No fixture gates on presentation |
| **Q-28** | charter §9 item 7 | whether unfilled register keys block at S15 | **DR-097** — **outside** clause 4's reach; the BLOCKING list is unaffected, and the **advisory** `FX-ORPH-07` reports unread keys (§11) |

  **`08-open-questions-for-V.md` remains the question register** and now carries
  a `RULED — DR-nnn` annotation on each entry; the Plan ids above are provenance.
- **No numbers are invented** (AC-76, DR-039). Every constant here is quoted from
  the pack with its citation — the literature vectors' outputs, `max_recompose =
  2`, `K = 1`, 2 regeneration rounds / 3 attempts, ≥2 judgements, 5 abstention
  kinds + 22 condition marks + **5 terminal routes** (DR-037; §6.2), 13
  MACHINE rows, the
  `0.784 → 0.400` collapse — or named as a register key whose value is V's at
  DR-023. **No threshold, tolerance, coverage target, flake budget or pass rate
  is stated anywhere in this document.**
- **No V2 comparison, at any level** (AC-80, §1 P1).
- ~~**The stack is a proposal** (§2).~~ **The stack is RULED — `DR-117`.** The
  claim this bullet used to make — *the four layers, the fixture ids and the
  fire-both-ways discipline survive a language change; only the runner column of
  §2 is re-instantiated* — is now **tested rather than asserted**: DR-105 ruled a
  different language, PRE-10 rev 1 re-expressed §2's tool column and §14's
  stages, DR-117 reversed it, and **not one fixture id was minted, renamed or
  retired in either direction** (`01-decisions/README.md` §5.6).

---

*End of `06-test-strategy.md` — ARCH-V3-R1 / C4 lane 6, 2026-08-05; rulings
DR-068…DR-101 folded in 2026-08-06 under PROG-V3-R1 ticket **PRE-03** (DR-100
follow-through). The provisional-status banner is discharged by DR-098/DR-100 — this is
accepted architecture, and **§12/§15 stay exhaustive against each other**: five
ids were minted with slices, none was left unassigned. **Still owed and
unchanged: no number is stated here**, and the constants every fixture reads are
register rows V ratifies at DR-023.*

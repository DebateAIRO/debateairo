# H4 — Independent Opus lens review of the C4 architecture artifact set

Mission ARCH-V3-R1, stage H4 · 2026-08-05 · seat: **fresh independent Opus 5
reviewer** (session `h4-reviewer`). Never an author of any reviewed file; no
prior context from any C4 lane. Read-only over the reviewed set.

**Lens:** RED-TEAM / PACK-COHERENCE over the set as a system.

**Reviewed set** (`docs/architecture/`): `00-overview.md` · `01-decisions/ADR-0001…0014`
· `02-data-model.md` · `03-module-design.md` · `04-api-contract.md` ·
`05-register-skeleton.md` · `06-test-strategy.md` · `07-build-order.md` ·
`08-open-questions-for-V.md` · `09-traceability.md`.

**Contract:** `docs/missions/2026-08-05-v3-architecture/architecture/Plan.md`
rev 3 (1852 lines, read in full) and its §7 scope table. Founding pack
spot-checked at `docs/founding/{requirements-spec,carryover-manifest,quality-charter,ui-boundary-contract}.md`.

**Independence law honoured:** `reviews/codex-c4-review.md` was not read (it does
not exist at review time); `logs/codex-c4-review.log` was not read.

---

## LENS VERDICT: **CHANGES REQUESTED** (REWORK ROUND: 1 of 3)

**2 BLOCKER · 10 MAJOR · 7 MINOR.**

The set is materially better than its contract in several places — lane 6
restored a property-test exclusion Plan §2.5 dropped, lane 3 refused to mint the
eight citation routes, lane 7 kept Q-04 an *entry* criterion. What it does not
survive is the **system** test. Three classes of defect recur:

1. **Units that exist in prose and in no inventory.** The continuous replay
   self-test and the scheduled reaper are named across six documents and two
   ADRs, own load-bearing obligations (AC-12 eviction; AC-89), and appear in no
   package list, no dependency edge row and no credential story.
2. **A declared surface the declared module graph cannot serve.** `apps/api`'s
   authoritative edge list cannot reach the packages behind four of its own
   endpoints, and one endpoint has no owner anywhere in the set.
3. **A traceability index that is not true.** `09-traceability.md` is the
   document Plan §7 row 1 leans on to prove AC-86…AC-92 resolve completely. Five
   of its data-carrier cells point at carriers `02-data-model.md` itself records
   as having no home, two of its recorded gaps are falsified by
   `06-test-strategy.md`, and its AC-92 "resolves: **yes**" is the direct
   negation of `02-data-model.md` §19 gap 3.

None of the three is a design disagreement. All three are places where a builder
following the set stops, or follows one document into a gate another document
fails.

---

## Findings

### H-O-1 · BLOCKER · The continuous replay self-test has no owning unit, no imports and no credentials — and every path that could give it one breaks a named rule

**Where.** `02-data-model.md` §7.5 ("when the continuous replay self-test later
evicts a number"); `06-test-strategy.md` §6 FX-LG-01 and §12 S0;
`00-overview.md` §6 step 10; `01-decisions/ADR-0014` (the eviction carrier);
`03-module-design.md` §1.1/§1.2 (the inventory that omits it) and §3.1 (the edge
table).

**Breaking scenario.** AC-12's eviction is the entire premise of the eviction
carrier (`served_number_event`, `segment_suppression`, `answer` current-state
derivation, `FX-SRV-03/04/05`, charter §5.2 row 12 — **BLOCKING**). Eviction is
triggered by *"the continuous replay self-test"*. That unit must (a) recompute a
served number from frozen records and (b) **write** a `served_number_event`. The
set gives it nowhere to live:

- `apps/replay` cannot: `03-module-design.md` §3.3 and §5.5 pin it to **read-only
  database credentials**, and `06-test-strategy.md` FX-IND-03's operator
  attestation *names* the credential scope as read-only. Giving it write access
  falsifies FX-IND-03 and breaks VR-3 limbs (ii)/(iii) (charter §7 S1: *"run by
  a person or job that did not produce them"*).
- `ledger` cannot: its edge row (`03` §3.1 row 8) is `kernel, db, register` — it
  can reach neither `propagation` nor `published-arithmetic`, so it cannot
  recompute anything.
- `serve` can (row 20 includes `propagation`) — but then the *continuous* limb of
  charter S1 is executed by the same code path that produced the number, which is
  precisely VR-3 option (i), *"the same code in a fresh process, which proves
  little"*, **rejected by DR-063**. It also puts a recompute path inside `serve`
  that no document declares, with no isolation proof over it.

So the builder's three options are: falsify an attestation, build nothing, or
build an undeclared second recompute path. There is no fourth.

**Required modification.** `03-module-design.md` §1.2 names the executing unit
(app or scheduled job), §3.1 gives it an edge row, and §5.5 states its credential
scope and its relationship to VR-3's three limbs — explicitly distinguishing the
*continuous* limb of charter S1 from the *launch ceremony* limb.
`06-test-strategy.md` splits `FX-LG-01` into the two limbs so each has a named
owner. `09-traceability.md` AC-06/AC-12 rows name the unit.

**Owning lane: 4** (with lane 6 for the fixture split, lane 1 for the index row).

---

### H-O-2 · BLOCKER · `apps/api`'s authoritative dependency edge list cannot serve its own declared endpoint surface, and `GET /v1/fleet` has no owner anywhere in the set

**Where.** `03-module-design.md` §3.1 row 21 (`apps/api` may depend on
`contract, kernel, db, register, serve, battery, ledger`) — declared
authoritative at §3 ("**This section is the authoritative dependency edge list**
… The CI rule reads this table") and enforced by the dependency-graph assertion
at §12. Against `04-api-contract.md` §4 and §5.

**Breaking scenario.** Four declared endpoints have no legal implementation path:

| Endpoint (`04` §4/§5) | Needs | Reachable from `apps/api`? |
|---|---|---|
| `GET /v1/scorecards` | `settlement` (`scorecard_cell`, `routing_decision`, `session_assignment`) | **No.** `serve` (row 20) has no `settlement`; only `battery → settlement` exists, and `03` §4.2's own layering rule says `battery` owns *"row contracts, activation state and stage sequencing"*, not read surfaces |
| `POST /v1/nodes/{id}/feedback` | `settlement` (the model ledger) | **No** — same |
| `POST /v1/investigations/{id}/executions` | `critique` (DR-045's flow) | **No** — neither `apps/api` nor `serve` may import `critique` |
| `GET /v1/fleet` | *nothing in the set owns "fleet status"* | **No owner exists.** Grepped across the whole reviewed set: `fleet` appears only in `04` §4, `04` §4.2, `09` §1.6/§2/§6.1 and ADR-0007 — never in a package inventory or context table |

At S12 (`GET /v1/scorecards`, `FX-LG-10`) and S14 the CI dependency assertion
(`03` §12, "CI failure") rejects the only obvious implementation. The
alternatives — `apps/api` querying `scorecard.*` through its permitted `db` edge,
or routing a read through the stage runner — both breach *"one context owns each
invariant"* (`03` §4) and AC-85, and neither is written down. `GET /v1/fleet`
additionally cannot pass AC-77's reachability audit: it is an endpoint with no
producing unit, which `04` §15.2 check 9 is built to fail on.

**Required modification.** Either extend row 21 with the packages the surface
requires and record the consequence for the acyclicity argument at `03` §3.2, or
state the read-path rule (`apps/api` reads schema *X* directly through `db`, and
which contexts that is legal for) as a numbered rule in `03` §3. Name the owning
context for `GET /v1/fleet` and `GET /v1/session` in `03` §4 and `09` §4.

**Owning lane: 4** (with lane 5 to align `04` §4, lane 1 to align `09` §4/§6.1).

---

### H-O-3 · MAJOR · The scheduled reaper is a shipped unit with no package, no edge row and no entry point

**Where.** Named in `00-overview.md` §7.6, `02-data-model.md` §11 and §14,
`03-module-design.md` §5.4, `04-api-contract.md` §4.2,
`06-test-strategy.md` FX-SRV-10, `09-traceability.md` §1.6/§2/§8, and
`ADR-0007` §2 / `ADR-0009`. Absent from `03-module-design.md` §1.1 (packages),
§1.2 (apps and tools) and §3.1 (the edge table).

**Breaking scenario.** AC-89 is the one constraint that resolves a cross-artifact
contradiction (manifest §9.2d × ui §2 surface 14, disposed at Plan §6.6 UI-13).
Its entire disposition is *"the reaper writes, the read derives"*. A unit named in
seven documents and inventoried in none is, by charter §5's own definition
(*"a shipped unit — module, function, endpoint, table, migration, config flag,
prompt"*), an orphan the day it lands — and the never-called list **BLOCKS**
(A4.2). `FX-SRV-10` cannot be written against a unit with no home.

**Required modification.** Add the reaper to `03-module-design.md` §1.2 with its
edge row in §3.1 and its schedule/credential story; `09-traceability.md` §4 gains
its module→AC row.

**Owning lane: 4.**

---

### H-O-4 · MAJOR · The terminal-route count is resolved two different ways *inside the reviewed set*, and one reviewed document contradicts itself

**Where.**
- **4 routes:** `02-data-model.md` §13 (`22 + 5 + 4`, the closed-enum inventory
  the `kernel` count test is written from); `04-api-contract.md` §10
  (*"terminal routes | 4 members — imported by citation"*);
  `06-test-strategy.md` §6 FX-LG-04 and §16.
- **5 routes:** `03-module-design.md` §4.1 context 1 (*"the five terminal
  routes"*); **`06-test-strategy.md` §10 row 20** (*"the five terminal routes"*) —
  the same document that writes 4 twice.
- `09-traceability.md` §8.1 G-7 records the split as a **Plan.md** gap and says
  *"Recorded, not picked"* — but the set then picked, twice, both ways.

**Citation.** The pack itself splits: spec §12.3 Home 3 enumerates **four**
(`INERT`, false-presupposition, value→human, `NOT_EMPIRICALLY_DECIDABLE`), while
spec §5.2 *"The five terminal routes code must enforce (DR-037)"* adds
**Depth-zero (no justification, no split)**, and spec F-4 makes each a *"recorded,
servable outcome"* with *"fixtures proving each fires both ways"*. Under S-13, a
typed state not placed in §12.3 is *"a specification defect"* — so Depth-zero is
either a fifth kernel member (and `FX-LG-04`'s count test must say 5) or a
framing outcome that is **not** a kernel typed state (and `03` §4.1 and `06` §10
must stop calling it one). The set never asks the question.

**Breaking scenario.** `FX-LG-04` is a **count** test and an S0 gate. A builder
reading `03`/`06 §10` writes 5; a builder reading `02`/`04`/`06 §6` writes 4. One
of the two fails S0 on day one, and the failure is a vocabulary dispute the set
gives no arbiter for.

**Required modification.** One count across `02` §13, `03` §4.1, `04` §10 and
`06` §6/§10/§16, with the Depth-zero route explicitly dispositioned — either
placed (and then it is a spec amendment V must grant, so it becomes a question in
`08`) or named as a framing outcome outside spec §12.3's table.

**Owning lane: 1** (adjudication and index), **with lanes 3, 4, 5, 6 to align.**

---

### H-O-5 · MAJOR · `09-traceability.md`'s data-carrier column points at carriers that do not exist in the document it names

**Where.** `09-traceability.md` §1.3 and §1.6, Doc column = `02`.

Spot-checked 20 rows against the named documents. Seven fail; five fail on the
data carrier:

| Row | Claimed data carrier, Doc `02` | Reality in `02-data-model.md` |
|---|---|---|
| **AC-25** | *"the restatement flag with its similarity field, gating nothing"* | the string `restatement flag` and `similarity` do not occur anywhere in `02` |
| **AC-29** | *"leverage and fragility as recorded **outputs**"* | no table; `02` §19 gap 2 states in terms that context 6's objects *"have no §4 table"* |
| **AC-55** | *"reversal point and builds-on-previous disclosure as structured projection fields"* | no table; same gap 2 |
| **AC-91** | *"the shadow-mode publication recorded beside the unsuppressed band"* | `shadow` does not occur in `02`; only `abstention.unlock condition` and `condition_mark.lift_path` exist |
| **AC-92** | *"per-member panel contract hashes, the claim-type→composition map **as data**"* | `02` §9 and §19 gap 3: *"The claim-type → composition map has no named home … no §4 table carries it"* |

Rows that verified clean: AC-05, AC-11, AC-13, AC-19, AC-24, AC-35, AC-40,
AC-46, AC-48, AC-64, AC-70, AC-83, AC-86, plus AC-89/AC-90 which fail on a
different column (H-O-7).

**Breaking scenario.** `09` is the document Plan §7 row 10 makes *"the index no
other document can carry"* and the discharge of AC-61 at documentation level. A
reader following AC-92 to `02` finds nothing, and the gap that would have been
found is instead reported as resolved.

**Required modification.** Every Doc-`02` cell resolves to a named table or column
that exists in `02`, or reads `—` and is carried into `09` §8 with the reason.

**Owning lane: 1.**

---

### H-O-6 · MAJOR · `09` §2 asserts AC-92 "resolves to a data carrier: **yes**" — the direct negation of `02` §19 gap 3, on the one check Plan §7 row 1 names by name

**Where.** `09-traceability.md` §2, AC-92 row, column *"Resolves to a data
carrier?"* = **yes**, listing *"the claim-type→composition map **as data**"*.
Against `02-data-model.md` §9 (*"Recorded gap: AC-92 requires the claim-type →
composition map to be 'held as data, never a source literal', and Plan.md §4
names **no table** for it"*) and §19 gap 3.

**Citation.** Plan §7 row 1: *"each of AC-86…AC-92 must resolve to its owner, its
data/API carrier and its acceptance fixture in `09-traceability.md`; a row that
does not is the gap §1's own law names."* §2 exists to make that check *"one read
rather than seven lookups"* — and it returns a false pass. The underlying
obligation is ruled: manifest §5.2 requires the map *"held as data, never a
source literal"*, and Plan §1's law makes an uncarried constraint a gap.

**Required modification.** `09` §2's AC-92 row reads **partial** with the missing
carrier named, and a new §8.1 gap records that AC-92's composition-map limb has
no data home; `02` proposes the home or the item goes to `08` as a question.

**Owning lane: 1** (with lane 3 to place the carrier).

---

### H-O-7 · MAJOR · `09` §8.1 reports two gaps that `06-test-strategy.md` closes, and its AC-89/AC-90 fixture cells are stale against the same document

**Where.** `09-traceability.md` §8.1 G-1 (*"AC-89 has no named acceptance
fixture"*) and G-2 (*"AC-90's third limb has no named fixture"*), plus §1.6 and
§2's "partial" rows for AC-89 and AC-90.

**Citation.** `06-test-strategy.md` §9.5 **FX-SRV-10** — *"Stale work expires on
read, without a write … the state transition is performed by a scheduled reaper
… no read carries a write side effect"*, slice S5/S14, authority *"AC-89 × AC-62,
disposed at Plan §6.6 UI-13"* — is exactly the pair G-1 says is owed. **FX-SRV-11**
— *"a lean with no live supporting or attacking node returns **nothing**, never a
fabricated even split"* — is exactly G-2's limb.

**Breaking scenario.** The index tells a release reviewer two constraints are
unasserted when they are asserted, and tells the test lane to author fixtures
that exist. Worse, `09` §2's two "partial" verdicts are the only qualifications on
the AC-86…AC-92 resolution statement — so the one document that is supposed to
prove the seven rows resolve is wrong in both directions at once (H-O-6 false
pass, H-O-7 false fail).

**Required modification.** G-1 and G-2 are withdrawn; `09` §1.6/§2 name
`FX-SRV-10` and `FX-SRV-11`.

**Owning lane: 1.**

---

### H-O-8 · MAJOR · `06` §12's fixture-by-slice map omits ~15 fixtures, including a stated launch prerequisite and two spec §22.1 launch gates

**Where.** `06-test-strategy.md` §12, against §5, §6, §6.1, §9.8 and
`07-build-order.md` §5.

Fixtures with no slice in §12 and no covering CI stage in §14:
`FX-HR-H1`, **`FX-HR-H2a`**, `FX-HR-H2b`, `FX-HR-H6`, `FX-HR-H7`, `FX-HR-H8`,
`FX-LG-04`, `FX-LG-06`, **`FX-PT-D4`**, **`FX-S22-05`**, `FX-DEF-02`,
`FX-LED-03`, `FX-LED-04`.

**Breaking scenario.** `FX-HR-H2a` is declared by `06` §5 itself to be *"a launch
prerequisite under AC-38/DR-055, not merely charter A5.1's advisory drill"* — a
launch prerequisite that no slice owes. `FX-S22-05` (zero-call proof) and
`FX-LG-06` (stranger coverage) are spec §22.1 launch gates; `07` §5's matrix A
*does* assign stranger coverage (S0/S5/S9) while `06` §12 does not, so the two
documents disagree about which slice owes it. `07` §9 G-1 already reasons that
*"a gate with no slice has no fixture, and A4.4 blocks on missing fixtures"* —
that reasoning applies to twelve more rows than G-1 counts. Plan §8 sequencing
rule (i): *"a slice with a dark gate is not done."*

**Required modification.** `06` §12 becomes exhaustive against §15's roster (or
declares the CI-cross-cutting subset explicitly in §14 and lists the remainder),
and reconciles with `07` §5's slice assignments.

**Owning lane: 6** (with lane 7 to reconcile matrix A).

---

### H-O-9 · MAJOR · Q-04's answer options are labelled three incompatible ways across the set, and Q-04 is S2's entry criterion

**Where.** `08-open-questions-for-V.md` Q-04 — half (ii)'s pick-one reads
*"**(a)** a third ruled producer … or **(c)** carried outside `edge.strength`"*,
while the same entry's *"Consequence of each alternative"* list reads
**(a)** plain attack on the node (forbidden), **(b)** inert, **(c)**
`propagation_run`. So "(a)" names two different answers in one entry.
`02-data-model.md` §5.5(4) and `ADR-0005` §6 use a **different** scheme —
*"option (ii)"* for the inert shape and *"A-1's answer (a)"* for the
producer-extension shape. Plan §4.2(4) and §6.4 carry the same collision upstream.

**Breaking scenario.** `07-build-order.md` §4 S2 makes Q-04 an **entry**
criterion, and `02` §5.5(4)'s table makes the schema outcome turn on the answer:
under one reading `UNDERCUT_TRANSMISSION` becomes writable, under another it is
**removed**, and removal is S2's exit condition. V answering *"(a)"* selects
"third ruled producer" in `08`'s pick-one and "plain attack on the node —
forbidden by DR-066" in `08`'s own consequence list. The edge table is frozen on
that letter.

**Required modification.** One label set across `08` Q-04, `02` §5.5(4) and
`ADR-0005` §6 — preferably the three named *shapes* (`transmission-reduction`,
`inert`, `recorded-on-propagation_run`) with no letters at all, since the letters
already collide upstream.

**Owning lane: 7** (with lanes 3 and 2 to align).

---

### H-O-10 · MAJOR · `serve` has no dependency edge to `critique` or `evidence`, yet owns obligations those contexts produce — and S0 must populate one of them before `critique` exists

**Where.** `03-module-design.md` §3.1 row 20 (`serve` may depend on `kernel, db,
ledger, register, graph, propagation, providers, contract, valuation, memory,
liveness` — no `critique`, no `evidence`, no `judgement`).

**Breaking scenario.** Two obligations cross the missing edges:
- **Q53's residual objection.** `04-api-contract.md` §8.9 makes `residual_objection`
  a non-optional tier-1 Answer field and `02` §7.1 makes it a `fact_bundle` field;
  `06` FX-C52-02's owner column reads *"context 7 `serve`, **context 5
  `critique`**"*. `07` §4 S0 requires the field **populated** at S0 — but
  `critique` is slice **S8**, and `serve` may not import it. Nothing states the
  mechanism (a ledger-table read? the runner writing the bundle?).
- **AC-91's shadow mode.** `09` §1.6 gives AC-91 the owner *"7 Serving `serve` +
  2 `evidence` (the gate)"*; `serve` cannot reach `evidence`.

Under `03` §4's own premise (*"contexts differ by which invariants they own"*,
no anti-corruption layer) a cross-context read must go through a named mechanism.
The set never names one, so a builder either adds an illegal edge (CI failure) or
invents a table.

**Required modification.** State the cross-context read rule once — e.g.
*"`serve` reads other contexts' frozen facts through `ledger`/`db` tables and
never imports their packages"* — as a numbered rule in `03` §3, and name which
table carries the residual objection before S8 exists.

**Owning lane: 4** (with lane 6 for the S0 fixture's precondition).

---

### H-O-11 · MAJOR · S6, S8 and S10 have no data model, and the set's own audits are run only in the direction that passes

**Where.** `02-data-model.md` §19 gaps 1 and 2 record it plainly: *"No `evidence`
schema, and no tables for context 2's own objects … Slice S6 has no data-model
home in §4"*, and *"No tables for `critique`, `valuation` or `budget` objects"*.

**Breaking scenario.** `07-build-order.md` §4 S6 promises to deliver *"frozen
queries and typed amendments, admissibility, access depth, **absence rows**,
provenance clusters and their key, freshness, probe capture and instrument
certification"* with no table for any of them, and its entry-criteria table names
five open questions and **no data-model dependency**. S8 delivers *"the
independence receipt, the symmetry diff, the objection ledger"*; S10 delivers
*"reversal points"* — all tableless. `09-traceability.md` §5 runs the audit in the
safe direction (*"Every table appears with at least one AC row"*) and §4 likewise
(*"A package with no AC row would be an orphan"*) — neither runs the direction
that would catch this: **an AC row that needs a persisted carrier and has none.**
AC-44 (*everything executed is recorded*), AC-70 and AC-27's absence rows all
require persistence that does not exist.

**Required modification.** `09` §8.1 carries the missing-carrier audit as a first-
class gap list (it is the reverse of §5's audit and is the one Plan §1's law
demands); `07` §4 S6/S8/S10 name the data-model dependency as an entry criterion
so it is not discovered at slice start.

**Owning lane: 1** (the audit), **with lane 7** (the slice entry criteria).

---

### H-O-12 · MAJOR · `07` §4 S5 lists the band ceiling among *"gates it must show firing"*, silently ruling AQ-1 half (i)

**Where.** `07-build-order.md` §4 S5 — *"Gates it must show firing: … **Every band
names its way-of-knowing ceiling** (charter VR-2, AC-24)"* — while the same
slice's entry-criteria table row 6 reads: *"Q-14 answered (AQ-1) — **Half (i)
decides whether `band_ceiling` is a gate or a charter-VR-2 display obligation, and
S5's gate text changes accordingly**."*

**Breaking scenario.** The document states that the gate/display question is
open, then writes the gate reading into the gate list. A slice lead reading the
gate list builds a blocking gate; if V rules "display obligation", the gate is a
branch the pack did not authorise, and charter G4/VR-4's shapes do not cover a
gate that should not have shipped. `06` FX-SRV-13 hedges correctly (*"Pending V —
AQ-1: whether the band rule is a second obligation or a restatement"*), so the two
documents give different instructions.

**Required modification.** `07` §4 S5's gate list carries the row **conditionally**
(*"gate only under Q-14 half (i) answer A; otherwise a projection assertion"*),
matching `06` FX-SRV-13's hedge.

**Owning lane: 7.**

---

### H-O-13 · MINOR · `serve_state` is a closed wire enum stored on `answer` and is absent from `02` §13's closed-enum inventory

**Where.** `04-api-contract.md` §10 declares `serve_state ∈ {COMPOSED,
RECOMPOSED_ONCE, COMPONENTS_ONLY}` with single source `ui §1.2` Serve record;
`02-data-model.md` §7.6 stores *"serve state as sealed at serve time"* on
`answer`; `02` §13 — *"Closed-enum inventory, with a single source each"* — has no
row for it. `02` §2 rule 3 requires *every* closed vocabulary to be a Postgres
`CHECK` against the `kernel` enum plus an application exhaustiveness check.

**Verified against the pack:** ui §1.2 does list *"composed / recomposed-once /
components-only + DEFECT"*, and `04` §18.3's reconciliation with ui §4.0's two
rendering states (with `DEFECT` as condition mark 14) checks out — spec §12.3
Home 2 #14 is indeed `DEFECT`. The gap is only that `02` never inventories it.

**Required modification.** Add the `serve_state` row to `02` §13 with its single
source and its `serve.answer` `CHECK`.

**Owning lane: 3.**

---

### H-O-14 · MINOR · `04`'s export-tier cross-references point at the wrong section

**Where.** `04-api-contract.md` §3.4 (*"No asker-scoped principal reaches tier 3
by any path, including export (§6.4)"*) and §4's read table (`GET
/v1/answers/{id}/export` | tier *"1 (see 6.4)"*). §6.4 is *"Nothing is
overwritten"* — an eviction rule. Plan §5.3 routes the export question to *"§5.2's
tiers"*, i.e. `04` §2/§3.

**Required modification.** Repoint both to §2/§3.

**Owning lane: 5.**

---

### H-O-15 · MINOR · Lane 2 recorded no gaps in the reviewed set, and no ADR covers the AC-38 two-predicate maker inventory

**Where.** `01-decisions/ADR-0001…0014`. Grepped: no ADR carries a "gaps found
while authoring" section, unlike lanes 1, 3, 4, 5, 6 and 7. The phase report
credits lane 2 with five recorded gaps; none is in the reviewed set, so the C4
authoring law (*gaps are listed, not silently fixed*) is undischarged for this
lane and the gaps are unreviewable.

Separately: Plan §7 row 2's rule is *"One ADR per irreversible or contested
choice"*. The **two-predicate maker inventory** (`deployment_maker_capability` vs
`run_maker_reachability`, Plan §3.2 Seam C) is a contested rework-round design
carrying a **BLOCKING** launch gate (DR-055, AC-38) and a typed API refusal, and
has no ADR — its rationale lives only in `03` §7.3 and `06` §9.7. One of lane 2's
reported gaps — *"toolchain-version keys owed"* — is a **MISREAD**:
`05-register-skeleton.md` line 372 already carries the row (*Runtime/tool version
pins (Node LTS, pnpm, Postgres major, TypeScript)*, values `— none stated`).

**Required modification.** Add a gaps section to the ADR set (or one shared
`01-decisions/README`), and either add ADR-0015 for the maker-inventory split or
record in `09` why it is not ADR-worthy.

**Owning lane: 2.**

---

### H-O-16 · MINOR · `09`'s fixture column carries prose names, not fixture ids, so charter A4.4 cannot be checked from the index

**Where.** `09-traceability.md` §1 and §7 use prose (*"eviction fixture, three
assertions"*), while `06-test-strategy.md` §15 mints `FX-<AREA>-<nn>` and charter
A4.4 requires each blocking path to carry *"a recorded firing fixture in the
acceptance bundle, **named by fixture id**"*. The phase report names this as a
reconciliation point; it is not reconciled in the set.

**Required modification.** `09`'s fixture column carries the `FX-` id.

**Owning lane: 1** (with lane 6's roster as the source).

---

### H-O-17 · MINOR · `08` SI-2 reproduces R-6's "12 blocking at or before S6" in the document V reads first, while `07` computes 19

**Where.** `08-open-questions-for-V.md` SI-2 row R-6 quotes *"28 open questions
for V, **12** of them blocking a slice at or before S6"*; `07-build-order.md` §9
G-3 computes **19** from Plan §6.8's own rows (S0: 3 · S2: 1 · S3: 4 · S4: 1 ·
S5: 5 · S6: 5) and records the discrepancy *"not adjudicated"*. `08`'s own §1
index confirms 19. `08` is *"what V reads first in the morning"* by its own
statement, and the wrong number is the one that prices the build order's
executability.

**Required modification.** SI-2's R-6 row carries the corrected count inline, with
the original quoted as the lens's figure.

**Owning lane: 7.**

---

### H-O-18 · MINOR · `06` §8's Q51 row mis-pairs the fire/does-not-fire fixture ids

**Where.** `06-test-strategy.md` §8, row *"Q51 provenance | `FX-C52-01` /
`FX-SRV-01b`"* — the **fires** column carries the missing-locator block and the
reasoning-only **downgrade**, and the **correctly does not fire** column carries
*"a `LOOKED_UP` basis with a resolving locator serves as a verdict"*. Per §9.6,
`FX-SRV-01a` is the verdict path and `FX-SRV-01b` is the downgrade path — so the
id pair names the *firing* fixture twice and never names the not-firing one.

**Required modification.** `FX-C52-01` / `FX-SRV-01b` (fires) · `FX-SRV-01a`
(correctly does not fire).

**Owning lane: 6.**

---

### H-O-19 · MINOR · `04` §3.1 presents Q-03's SEAT-PROPOSAL in a citation table that reads as RULED

**Where.** `04-api-contract.md` §3.1 — *"The principal is resolved **session →
asker → answer ownership**"* — in a two-column rule/citation table under a section
headed **"RULED: authorization is asker-scoped"**, cited to *"DR-066(1); AC-57"*.
DR-066(1) rules the *scope* (*"authorization = their session's scope"*); the
three-step resolution chain is the seat's proposal — `08` Q-03's SEAT-PROPOSAL,
verbatim. §3's closing paragraph does mark AM-12 pending V, but the table row
carries no status marker while §1's table does carry one.

**Required modification.** Mark row 3.1 SEAT-PROPOSAL, as §1's table marks its
rows.

**Owning lane: 5.**

---

## Silent-ruling sweep (Q-01…Q-28)

Every V-question was checked for a document that assumes its answer. Two hits,
both raised above:

| Question | Document that assumes an answer | Finding |
|---|---|---|
| **Q-14** (AQ-1 — is the band rule a gate or a display obligation?) | `07` §4 S5 lists it under *"Gates it must show firing"* while its own entry criterion says the answer decides that | **H-O-12** |
| **Q-04** (A-1 — the undercut's arithmetic) | not assumed, but the answer is unkeyable: three incompatible option-label schemes | **H-O-9** |

Clean on the rest. Notably clean where it would have been easy to slip:
`06` FX-PT-D2 correctly marks the undeclared-parent limb unconstructible under
Q-07; `02` §18 refuses to mint OQ-G10's eight routes and states three reasons;
`07` §3 correctly splits Q-11 (S5 for sampling, not S0, on charter A2.5's
*"forbids skipping the conformance role, never mandates exhaustive sampling"*);
`06` §8 refuses to invent the disagreement flag's should-not-fire data under
DR-039; `05` §5 carries `— none stated` rather than values.

---

## Traceability spot-check (20 rows)

Method: pick a row in `09-traceability.md` §1, open the document its **Doc**
column names, and look for the named carrier.

| Row | Verdict |
|---|---|
| AC-05, AC-11, AC-13, AC-19, AC-24, AC-35, AC-40, AC-46, AC-48, AC-64, AC-70, AC-83, AC-86 | **13 clean** — carrier found in the named document |
| AC-25, AC-29, AC-55, AC-91, AC-92 | **5 fail** — carrier absent from `02` (H-O-5, H-O-6) |
| AC-89, AC-90 | **2 fail** — fixture cell stale against `06` (H-O-7) |

Reverse indexes: `09` §4 (module→AC) and §5 (table→AC) are **complete** against
`03` §1.1/§1.2 and `02` §1.1 — every package and every table appears. `09` §6
(endpoint→AC) is **complete** against `04` §4/§5 in both directions. The failure
is not coverage; it is that three cells assert carriers and fixtures that the
named documents deny.

---

## Gap adjudication

Every gap each lane recorded, adjudicated REAL or MISREAD with a citation.

### Lane 1 — `09-traceability.md` §8.1

| Gap | Verdict | Citation |
|---|---|---|
| G-1 AC-89 has no named fixture | **MISREAD** | `06` §9.5 **FX-SRV-10** names exactly the pair G-1 describes (reaper writes / read derives), slice S5/S14 → **H-O-7** |
| G-2 AC-90's "lean returns nothing" limb has no fixture | **MISREAD** | `06` §9.5 **FX-SRV-11** asserts it verbatim → **H-O-7** |
| G-3 AC-03 has no acceptance form | **REAL**, harmless — a prohibition on a migration path is not positively assertable; AC-80's no-V2-conformance gate is the nearest |
| G-4 four structural rows carry no fixture (AC-15, AC-17, AC-82, AC-85's structural half) | **REAL** and correctly handled — `03` §3.1's edge table and §12's assertion are the enforcement |
| G-5 AC-25 and AC-31 carry no named fixture | **REAL** — confirmed: `06` names neither; AC-25 appears only inside §10 scenario 13's prose, AC-31 nowhere |
| G-6 AC-81 is unfixturable by design | **REAL** — charter/manifest §14's violation is a reading violation; `03` §2 and `06` §1 P2 both say so |
| G-7 terminal-route count stated two ways | **REAL, and now worse** — the set resolved it both ways → **H-O-4** |

### Lane 3 — `02-data-model.md` §19

| Gap | Verdict | Citation |
|---|---|---|
| 1 No `evidence` schema; S6 has no data-model home | **REAL** — confirmed against `07` §4 S6's delivery list → **H-O-11** |
| 2 No tables for `critique`, `valuation`, `budget` objects | **REAL** — `09` §5's table list contains none → **H-O-11** |
| 3 The claim-type→composition map has no named home | **REAL** — manifest §5.2 requires it *held as data*; `09` §2 denies the gap → **H-O-6** |
| 4 The completeness gate's "scheduled" input has no named ledger column | **REAL** — `02` §6.1's action-kind vocabulary is *"not enumerated in Plan.md"* (§13), so AC-11's first input is not locatable |
| 5 `answer_index`'s kind (base table vs view) is unstated | **REAL**, MINOR — left open correctly; the keyset index in §16 works either way |
| 6 The eight citation routes are asked of `02` while §7 row 3's scope does not carry them | **REAL** and correctly refused — spec S-13 makes an unplaced typed state a specification defect; carried to Q-16 |

### Lane 4 — `03-module-design.md` §13 and `05-register-skeleton.md` §7

| Gap | Verdict | Citation |
|---|---|---|
| 03 G-1 `battery`'s row-19 clause is a rule, not a list | **REAL** and correctly resolved — §3.2 derives it mechanically from §3.1's stage column and shows the derivation |
| 03 G-2 / 05 G-5 `tools/*` may import only `kernel` + `contract` but S15 must present the register | **REAL** — Plan §8 S15 vs §2.6's edge table; correctly not patched. *Note: this is the same shape as **H-O-2**, which the lane did not extend to `apps/api`* |
| 03 G-3 Seam A does not say which package derives the arrow order first | **REAL** and correctly left open — both placements satisfy AC-08 given purity + recording |
| 05 G-4 charter A5.2 binds *"every provisional number"*; `orderingPolicy` is a provisional ordering | **REAL**, MINOR — flagged, not resolved, correctly |
| 05 G-6 spec §4 row 16 calls `stage11Rollout` open while DR-061 `OD-S-01` ratifies it | **REAL** and correctly handled under FLAG-3 (the ledger wins, spec §2 item 1) |

### Lane 5 — `04-api-contract.md` §18

| Gap | Verdict | Citation |
|---|---|---|
| 18.1 Pagination declared for `GET /v1/answers` only; `GET /v1/nodes/{nodeId}/executions` unbounded | **REAL** — AC-62 says *"real pagination"* and that read grows with attempts, retries and could-not-dos (AC-44) |
| 18.2 The Investigation *listing* (ui §2 surface 7, W14) has no read endpoint | **REAL** — Plan §5.3 names only the write; carried as a tier-1 projection, which satisfies check 2 either way |
| 18.3 `serve_state` has three members in ui §1.2 and two answer-surface states in ui §4.0 | **REAL**, and the resolution **verifies**: ui §1.2 line 160 lists the three; spec §12.3 Home 2 #14 is `DEFECT`, so carrying it as a condition mark rather than a fourth serve state is correct under AC-65/S-13 |

### Lane 6 — `06-test-strategy.md`

| Gap | Verdict | Citation |
|---|---|---|
| Plan §2.5's exclusion list drops **zero-strength sources** | **REAL — verified against the founding doc.** manifest §4.5: *"must therefore exclude `τ ∈ {0,1}`, zero-strength arrows, **zero-strength sources**, pre-saturated aggregates, duplicate identities and cluster-absorbed arrows"*. Six items; Plan §2.5 lists five. The founding doc wins (spec §2 item 1) and lane 6 restored it. **The best catch in the set.** |
| Plan §7 row 7 names seven law gates; manifest §12.2 carries an eighth combined bullet | **REAL** — carried as `FX-LG-08` from the manifest, not minted |
| The disagreement flag's labelled should-not-fire case has no data anywhere in the pack | **REAL** — correctly refused under DR-039; charter §8 VR-1 records the same cost |
| Five spec §22.1 launch gates are carried by neither layer 4 nor charter §5.2 | **REAL** — `FX-S22-01…05`; charter §5.2's own preamble names the division of labour |

### Lane 7 — `07-build-order.md` §9

| Gap | Verdict | Citation |
|---|---|---|
| G-1 Zero-call proof (AC-83, spec §22.1) is named in no slice | **REAL** — and `06` §12 leaves `FX-S22-05` unassigned too → **H-O-8** |
| G-2 P-D4 is assigned to no slice | **REAL** — charter §7 S2 makes P-D1…P-D5 mandatory; `06` §4 gives D4 "S5/S14" but `06` §12 omits it → **H-O-8** |
| G-3 R-6's "12 blocking at or before S6" vs §6.8's 19 | **REAL** — recount confirms 19; but `08` SI-2 still prints 12 → **H-O-17** |
| G-4 §6.8's S13 row lists no question though the `EXACT_QUESTION` tier rests on Q-03 | **REAL** and correctly handled — S0 already gates on Q-03 |

### Lane 2 — `01-decisions/`

| Gap | Verdict | Citation |
|---|---|---|
| *No gap list recorded in the reviewed set* | **UNVERIFIABLE** — grep finds no gaps section in any of ADR-0001…0014 → **H-O-15** |
| (reported) toolchain-version keys owed | **MISREAD** | `05` line 372 already carries *Runtime/tool version pins (Node LTS, pnpm, Postgres major, TypeScript)*, `— none stated` |
| (reported) no ADR for the maker-inventory predicates | **REAL** — confirmed: 14 ADRs, none covers Plan §3.2 Seam C's two-predicate split → **H-O-15** |

**Tally: 28 REAL · 3 MISREAD · 4 UNVERIFIABLE (lane 2's unrecorded remainder).**

---

## What the set gets right, recorded so the rework does not undo it

Stated because a CHANGES REQUESTED verdict should not be read as an indictment of
the whole set.

- **Lane 6's restoration of `zero-strength sources`** against Plan §2.5's
  abbreviation, with the founding-doc citation and the authority rule invoked
  explicitly. This is the single clearest instance of a lane reading past its
  contract to the pack, which is what the reading contract demands.
- **Lane 3's refusal to mint the eight citation routes** (`02` §18) with three
  stated reasons, one of which (spec S-13's "unplaced state is a specification
  defect") is the correct controlling clause.
- **Lane 5's §18.3 reconciliation** of ui §1.2's three `serve_state` members with
  ui §4.0's two rendering states — independently verified correct against spec
  §12.3 Home 2 #14.
- **Every condition-mark index citation in `04` verifies**: Home 1 #4 (not
  runnable), Home 2 #4 (`ENVELOPE_EXHAUSTED`), #12 (`UNDER-EXPLORED`), #14
  (`DEFECT`), #22 (`MISSING-NUMBER`). Twenty-two marks, five abstention kinds —
  the counts match spec §12.3 exactly.
- **`06`'s `FX-IND-01` symbol-granularity clause** — *"the same artifact FAILS if
  `apps/replay` declares any local arithmetic symbol of its own"* — closes the
  hole structural rule 3 leaves open, and states why.
- **`07`'s LRD-1 and LRD-2** are correctly derived and correctly placed.
- **`05` carries `— none stated` everywhere the pack states no value**, including
  the toolchain pins. No invented number was found anywhere in the set.

---

## Residual risks (not findings — recorded for the merge)

- **R-A.** `09-traceability.md` is a hand-maintained index of a set that is still
  moving. Three of its cells were wrong at H4; the shape invites more. Consider
  making the fixture and carrier columns generated from `06` §15's roster and
  `02` §1.1's inventory rather than authored.
- **R-B.** The set's audits all run in the direction that passes (every table has
  an AC, every package has an AC). The direction that fails — *every AC that
  needs a persisted carrier has one* — is not run anywhere, and is what would
  have caught H-O-11 without a reviewer.
- **R-C.** Plan §7's ten-document split gives no document the cross-cutting
  runtime-unit inventory (which app runs the reaper, the continuous self-test, the
  scheduled jobs). H-O-1 and H-O-3 are both instances of that hole.

---

*End of `opus-c4-review.md` — ARCH-V3-R1 / H4, independent Opus lens, 2026-08-05.
Verdict **CHANGES REQUESTED**, rework round 1 of 3. This file is the lens's only
output; no reviewed file was modified.*

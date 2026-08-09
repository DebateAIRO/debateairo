> **ACCEPTED ARCHITECTURE.** VS-1 is ratified (**DR-098**), amendments
> A-01…A-13 are accepted (**DR-099**), and **ARCHITECTURE SATISFIED** is emitted
> under V's authority (**DR-100**). The provisional-status banner that headed
> this file is removed under DR-100's follow-through, which directs this
> fold-in. **All 28 questions are RULED (DR-068…DR-097)**, so this index's
> `pending V — Q-nn` notation is **retired**: every cell that carried it now
> carries **`RULED — DR-nnn`** and what the ruling requires. The one state that
> replaces it is **`value pending VG-02`** — a register row whose *value* V
> ratifies at DR-023's sitting, which is not an unruled behaviour.

# 09 — Traceability index

Mission ARCH-V3-R1, step C4 · lane 1 · 2026-08-05, folded to post-ruling state
2026-08-06 under PROG-V3-R1 ticket **PRE-01** (DR-100 follow-through; DR-102) ·
seat: Opus 5 artifact author (session `c4-lane-1`). Source:
`docs/missions/2026-08-05-v3-architecture/architecture/Plan.md`
rev 3 — §1 (AC-01…AC-92) for the constraint base and its citations, §3 for
owners, §4 for data carriers, §5 for wire carriers, §7 doc 7 and §8 for
fixtures, §7 row 10 for this document's scope. **The decisions ledger
(`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md`, DR-068…DR-101)
overrides any doc text it post-dates.**

---

## 0. How to read this index

**What this document is.** The index no other document can carry:
**DR → requirement → module → table → endpoint → test**, in both directions. It
discharges AC-61's bidirectional no-orphan check at the documentation level and
spec S-25's *"every surface traces to a requirement and every requirement to a
surface"* (Plan.md §7 row 10).

**What it is not.** It is **not a summary of anything** (Plan.md §7 row 10,
out-of-scope column). It does not restate what a constraint says — that is
Plan.md §1, and the one-line form is `00-overview.md` §7. It does not explain a
design — that is `01-decisions/`. Every cell here is a **pointer**.

**The chain, and where each link is authored.**

```
  DR / founding-doc section        docs/founding/  (the pack — not authored here)
        │
        ▼
  AC-nn  requirement               Plan.md §1      (the constraint base)
        │
        ▼
  owner: context + package         Plan.md §3.1 → 03-module-design.md
        │
        ├──► data carrier: table   Plan.md §4     → 02-data-model.md
        ├──► wire carrier: resource / endpoint / event / typed shape
        │                          Plan.md §5     → 04-api-contract.md
        │
        ▼
  acceptance fixture + slice       Plan.md §7 doc 7, §8 → 06-test-strategy.md,
                                                          07-build-order.md
```

**Column semantics in §1's master table.**

| Column | Means |
|---|---|
| **Owner** | the context (Plan.md §3.1 numbering) and the package that owns the invariant. Where two packages each own a limb, both are named and the limbs are distinguished. |
| **Data carrier** | the table or column that **exists in `02-data-model.md`** and holds the fact. `—` means either that the constraint has no persisted carrier by nature (a purity rule, a process rule, a build-graph property) **or that no table exists for it yet** — and in the second case the cell names the gap id from §8. A carrier cell never names a table the data model does not carry. |
| **Wire carrier** | the resource, endpoint, event or typed wire shape in Plan.md §5. `—` means the constraint does not cross the wire. |
| **Fixture (slice)** | the **exact `FX-*` id** from `06-test-strategy.md` — the only fixture address the C4 set uses, because charter A4.4 requires each blocking path to carry *"a recorded firing fixture in the acceptance bundle, **named by fixture id**"*. Where a row has no `FX-*` id, the cell names the CI or attestation artifact that carries it instead, and **every such row is classified in §8.3** — adjudicated gap, structural assertion, attestation, or covered inside a broader gate. |
| **Doc** | the C4 document where the carrier is specified in full: `02` `03` `04` `05` `06` `07` `ADR`. |

**Two notations used throughout.**

- **`RULED — DR-nnn`** *(replaces the retired `pending V — Q-nn`)* marks a row
  whose governing question **has been answered**, and names the ruling the
  builder must build to. `Q-nn` is `08-open-questions-for-V.md`'s numbering of
  the 28 distinct questions and survives **only as the address of the ruling**;
  Plan.md §6's identifier for the same question (`OQ-Gn`, `AM-n`, `U-n`, `A-n`,
  `Cn`, charter §9 item *n*, `AQ-n`) is still given in parentheses so either
  index resolves. **No question is ruled here** — every ruling is V's, in the
  decisions ledger. The consolidated post-ruling list is **§8.4**.
- **`value pending VG-02`** is the one state that survives the rulings. It marks
  a row whose **behaviour is ruled** but whose **register value** V ratifies at
  the DR-023 sitting (ticket **VG-02**). Every such row ships its carrier, its
  typed loud failure on an unratified read, and **no invented value** (AC-74,
  AC-76, DR-039). *A ruling is not a value; a value is not a ruling.*
- **`SEAT-PROPOSAL`** — **the status is discharged.** Every package name, table
  name, endpoint and stack element in this index originates in Plan.md §2–§5 and
  was SEAT-PROPOSAL, V's to ratify (DR-005 as narrowed by DR-024). **DR-098
  accepts the C4 artifact set as the working architecture and DR-099 accepts
  amendments A-01…A-13**, so those names are **accepted**, not proposed. The
  acceptance is **wholesale — there is no per-name ratification row**, and none
  may be fabricated to make it look itemized (AC-76, DR-039). The **AC column**
  and the **DR column** remain already-imposed pack content, as before.
- **Gap ids are global.** `DM` data model · `MOD` module design · `API` api
  contract · `REG` register · `TEST` test strategy · `BUILD` build order ·
  `TRACE` traceability. **§8 is the single register of them** for the whole C4
  set — every lane's gaps, with the merge node's REAL / MISREAD disposition, so
  the FinalPlan consolidation and the V register have one stable key list and no
  gap is adjudicated twice or missed.

**Counts, so the index is checkable.** 92 AC rows (AC-01…AC-92; AC-86…AC-92 were
added at rework round 1 and sit inside Plan.md §1.6). Every row appears exactly
once in §1 and at least once in each applicable reverse index. Rows with no
carrier of a given kind appear in §8 with the reason.

---

## 1. Master index — AC → owner → carrier → fixture

### 1.1 Persistence and store (Plan.md §1.1)

| AC | Owner (context · package) | Data carrier | Wire carrier | Fixture (slice) | Doc |
|---|---|---|---|---|---|
| AC-01 | infrastructure · `db` | one Postgres database; namespaced schemas `core` / `ledger` / `memory` / `scorecard` / `register` / `serve`; one migration lineage | — | CI `db-integration`; every `FX-DB-*` runs on the migrated database | 02, ADR |
| AC-02 | infrastructure · `db`, `ledger`, `memory`, `settlement` | schemas not databases; `scorecard.session_assignment` in the same database; the work queue inside the same store | — | CI `db-integration` | 02, ADR |
| AC-03 | repository · — | — *(no persisted carrier; the constraint is that none is inherited)* | — | — (TRACE-3: repository review + AC-80's prohibition) | 07 |
| AC-04 | run execution · `apps/runner`, `providers` (Seam C), `db` | Postgres work claim (`FOR UPDATE SKIP LOCKED`), claimed and committed **before** any model call; `run_row_activation_event` for resumability; no storage-engine ordering tiebreak (Seam A) | typed job + replay handle on `POST /v1/nodes/{id}/regenerations`, `POST /v1/investigations/{id}/executions` | `FX-LG-15` · `FX-DB-02` | 02, 03 |
| AC-05 | 10 Liveness · `liveness`, `db` | append-only tables with `UPDATE`/`DELETE` revoked plus a raising trigger; `staleness_state` including `ARCHIVED_REVIVED`; ledger partitions never dropped | staleness state on every answer read | `FX-DB-01a` / `FX-DB-01b` | 02 |

### 1.2 Replay, determinism, purity (Plan.md §1.2)

| AC | Owner (context · package) | Data carrier | Wire carrier | Fixture (slice) | Doc |
|---|---|---|---|---|---|
| AC-06 | shared · `ledger` + `apps/replay` (the ceremony) + **`apps/scheduler` · `job:replay-self-test`** (the continuous limb, `03` §1.2) | `ledger_entry`, `raw_artifact`, `reduced_judgement`, `propagation_run`, `node_strength_record`; `register_version` pinned per run | `GET /v1/numbers/{provenanceRef}/replay` (tier 2) | `FX-LG-01a` (continuous limb, `apps/scheduler`) · `FX-LG-01b` (launch ceremony, `apps/replay`) · `FX-LED-02` · `FX-DB-01b` · `FX-REG-01` (the pinned register a run replays against) | 02, 04, 06 |
| AC-07 | 7 Serving · `serve` + `apps/replay` + `published-arithmetic` | `fact_bundle` (versioned, content-hashed, keyed to `(answer_id, answer_version)`); `conformance_record` sealed and never rewritten | `GET /v1/answers/{id}?version=` returns the sealed artifacts — what the ceremony reads | `FX-LG-01b` (the ceremony limb — all three VR-3 independence limbs bind here, not to `01a`) · `FX-IND-01/02/03` · `FX-SRV-02` · `FX-SRV-04` | 02, 06 |
| AC-08 | shared · `ledger` (ledger order) · Seam A `graph`+`propagation` (arrow order) | `ledger_entry.sequence` from a dedicated allocator under a write lock; recorded arrow order on `propagation_run` | recorded arrow order in the tier-2 recomputation trail | `FX-PT-ORD` · `FX-LG-02` | 02, 06 |
| AC-09 | shared · `propagation` | — *(purity is the absence of a carrier)* | — | `FX-HR-H3` | 03, 06 |
| AC-10 | shared · `ledger` | `raw_artifact.input_hash` and `.contract_hash` as **separate** columns; cache identity includes the contract hash and yields a new row | hashes in the tier-2 recomputation trail | `FX-LED-05` | 02, 06 |
| AC-11 | shared · `ledger` (gate) · 1 Framing `battery` (the scheduling that defines "required node") | the four reconstruction paths over `raw_artifact` + `run_row_activation`; no aggregated run written when the gate fails | — | `FX-LED-01a` / `FX-LED-01b` | 02, 06 |
| AC-12 | 7 Serving · `serve` (the eviction writer) · detected by **`apps/scheduler` · `job:replay-self-test`** (`03` §1.2) | `served_number` discriminant `PRESENT \| EVICTED(MISSING-NUMBER) \| WITHHELD(reason)`, status derived from `served_number_event`; `segment_suppression` (append-only) | number slot union (§5.4); current projection on `GET /v1/answers/{id}` | `FX-SRV-03` · `FX-SRV-04` · `FX-SRV-05` · `FX-SRV-06` · `FX-C52-12` | 02, 04, 06 |
| AC-13 | 16 `providers` (Seam C) + `ledger` | `raw_artifact` — raw text, hash, request metadata, parse status and error, allow-listed and recursively scrubbed provider metadata | operator-only: `GET /v1/answers/{id}/inspection/prompts` | `FX-LG-02` · `FX-LED-01b` | 02, 03 |

### 1.3 Graph and scoring arithmetic (Plan.md §1.3)

| AC | Owner (context · package) | Data carrier | Wire carrier | Fixture (slice) | Doc |
|---|---|---|---|---|---|
| AC-14 | 14 shared kernel · `propagation` (+ `published-arithmetic`) | `propagation_run` as the single receipt of the single engine | — | `FX-IND-01` · `FX-IND-02` · `FX-LV-01/02` | 03, 06 |
| AC-15 | 3 Argumentation · `graph` | one `node` / `edge` aggregate; every other context reads it | node set + edge set in one coherent read on `GET /v1/answers/{id}` | — structural (TRACE-4): the enforced edge list | 02, 03 |
| AC-16 | 7 Serving · `serve` | the serve layer over the execution ledger; the debug facet reads the **identical** node set | `GET /v1/answers/{id}/inspection/debug` (tier 3, operator) | `FX-ORPH-01` (the facet's address is on the walked list) | 04 |
| AC-17 | context map · all | — | — | — structural (TRACE-4): the context map | 03 |
| AC-18 | 3 Argumentation · `graph` | `edge` — the mandatory first-class edge table, stored not derived | edge set on the Answer resource | `FX-DB-06b` · `FX-C52-10` | 02, 04 |
| AC-19 | 3 Argumentation · `graph` | `edge.target_kind ∈ {NODE, EDGE}` + graph-scoped composite FK `(run_id, target_edge_id, target_edge_polarity)` + `CHECK` binding `undercutting` to a **support** target | polymorphic target `{target_kind, target_node_id \| target_edge_id}` (§5.4) | `FX-DB-04a` / `FX-DB-04b` | 02, 04, 06 |
| AC-20 | 3 Argumentation · `graph` (layers 1–2) · `propagation` (layer 3) | per-graph advisory lock + recursive reachability check in the write transaction; typed compute-time error | "circular dependency found" as served information | `FX-C52-10` | 02, 03, 06 |
| AC-21 | 4 Appraisal · `judgement` · `propagation` | `node_strength_record.{tau_source, abstained, lift_marker}` | node envelope: base score and final strength each with a provenance reference | `FX-PT-D1` · `FX-LED-01b` | 02, 06 |
| AC-22 | 6 Recomposition · `valuation` + `propagation` + `register` | `propagation_run` — per-parent operator identifier **and the resolution level that supplied it**; `register_row.resolution scope` (deployment / run / parent); `served_number` `WITHHELD` | number slot `WITHHELD` (§5.4) | `FX-PT-D2` · `FX-HR-H4` (S3) · `FX-SRV-06` · **RULED — DR-074** (A-8): the **deployment row is MANDATORY, never blank**; parent/run overrides optional; the **declare-once/withhold runtime machinery is dropped**, so `FX-PT-D2` is rescoped to *"the operator resolves from parent/run/deployment register rows, never a source literal"* and **the `WITHHELD`-for-undeclared-operator branch is unreachable code to be removed** (AC-77) — `WITHHELD` survives for other reasons, AC-26 first among them | 02, 04, 06 |
| AC-23 | 14 `propagation` (collapse) · 2 Inquiry `evidence` (the key) | cluster records on `propagation_run` — `{cluster_id, key, absorbed_edge_ids, surviving_member}` | the key printed wherever a cluster changed a number | `FX-PT-D3` · **RULED — DR-073** (A-4): collapse applies to **both polarities**, support and attack; the key derives from evidence provenance + the producing run/model-family; **a node with no resolvable key clusters alone** | 02, 06 |
| AC-24 | **7 Serving · `serve`** | `answer.band_ceiling`; `node_strength_record.way_of_knowing` | `band_ceiling {label, basis}` on the Answer (§5.4), printing its register row | `FX-SRV-13` · `FX-SRV-01a` / `FX-SRV-01b` · `FX-C52-01` · **RULED — DR-082 + DR-086** (AQ-1): a **second, independent gate** beside Q51's three, **not a restatement**; firing **caps the band** (serves, cannot reach the top band, visible ceiling label, recorded lift path) and **never silently blocks**. Label vocabulary + cut points are **value pending VG-02** (DR-023) | 02, 04, 06 |
| AC-25 | 4 Appraisal · `judgement` | **`core.semantic_restatement_flag`** — append-only, structurally excluded from evaluation inputs. *Carrier proposed in C4 and **ACCEPTED** — DR-098 accepts the C4 set, DR-099 adopts A-05…A-13 wholesale (`02` §5.6); gap **TRACE-8** closes on that acceptance, and its DDL rides the slice that owns the table.* | flag on the node envelope | **`FX-PT-FLG`** (S3) | 02 |
| AC-26 | 14 `propagation` · 6 `valuation` | strict-and product in `published-arithmetic`; `served_number` `WITHHELD` on any unjudged conjunct | number slot `WITHHELD` | `FX-SRV-06` | 02, 06 |
| AC-27 | 3 Argumentation · `graph` · 2 `evidence` | `edge.strength_source ∈ {EVIDENCE_VERIFIER, CLUSTER_COLLAPSE, UNDERCUT_TRANSMISSION}`, the third member **now writable**, its `CHECK` fences retained | — | `FX-DB-08` · `FX-ORPH-02` · **RULED — DR-071** (A-1): undercut = **`transmission-reduction`**, computed in the pure core and **recorded per edge** — a **third ruled producer of arrow strength** (the `DR-062 OD-06` producer set goes two → three). The old *"written, or removed rather than left unreachable"* disjunction is discharged: **the member is live at S2** | 02, 06 |
| AC-28 | 2 Inquiry · `evidence` · 3 `graph` | `edge.strength` nullable + `magnitude_status ∈ {MEASURED, UNKNOWN}` + `CHECK ((strength IS NULL) = (magnitude_status = 'UNKNOWN'))` | typed unknown magnitude on the edge | `FX-DB-08` | 02 |
| AC-29 | 6 Recomposition · `valuation` | the **recorded arrow order** on `propagation_run`, consumed by every recomputation rather than re-derived; the leverage/fragility outputs are **`valuation.sensitivity_record`** — written *after* the propagation run it describes and never an input to it, which is AC-29's no-feedback rule as a write order. *Carrier proposed in C4 and **ACCEPTED** (DR-098 + DR-099 A-06; `02` §11A.3); gap **DM-2**'s `valuation` half is **slice-gated at S10**, which owns the four tables and their DDL.* | fragility table and reversal point as projections | `FX-C52-09` | 02, 06 |
| AC-30 | 6 Recomposition · `valuation` | recomputation with the overlay detached, asserting byte-identity against the recorded order | — | `FX-LG-07` | 06 |
| AC-31 | 3 `graph` · 14 `propagation` | `node.position_label`; `node_strength_record.position_label` | position label travelling with the number | **`FX-PT-POS`** (S3) | 02 |
| AC-32 | 3 Argumentation · `graph` (Seam B) | DDL: closed-enum `CHECK`s, the null-safe non-blank claim (`claim_text text NOT NULL` **with** `CHECK (length(btrim(claim_text)) > 0)`), endpoint FKs, self-edge rejection, arrow-identity uniqueness — **each with one named canonical owner, the creating migration** | typed write errors from the graph write API | `FX-DB-03a/03b` · `FX-DB-04a/04b` · `FX-DB-08` | 02, 06 |
| AC-33 | 3 Argumentation · `graph` | `node` materialized path; recursive/path indexes | subtree reads | `FX-PT-ORD` | 02 |
| AC-34 | shared · `ledger` | `node_strength_record` — one row per node per propagation run, **never a flat map** | the tau-source map on the debug facet is the per-node record, not a float map | `FX-PT-D4` | 02, 04 |
| AC-35 | 13 `kernel` · 3 `graph` | Postgres `CHECK` against the `kernel` enum + application exhaustiveness; arrow identity `(source_node_id, target_kind, coalesce(target_node_id, target_edge_id), polarity)` with collapse-vs-raise semantics | closed enums in `packages/contract`; `require-exhaustive-switch` lint | `FX-DB-05a` / `FX-DB-05b` · `FX-DB-08` | 02, 04, 06 |

### 1.4 Providers, models, routing (Plan.md §1.4)

| AC | Owner (context · package) | Data carrier | Wire carrier | Fixture (slice) | Doc |
|---|---|---|---|---|---|
| AC-36 | 16 `providers` (Seam C) | provider identity, model id and `model_version` as configuration in, recorded keys out; `raw_artifact` provider metadata | — *(internal boundary)* | `FX-HR-H1` | 03, 06 |
| AC-37 | 16 `providers` + 12 `register` | ≥2 provider implementations compiled in and registered at build time; the **configured** provider is a `register_row` | `GET /v1/register`, `PUT /v1/register/{key}` | `FX-HR-H2a` / `FX-HR-H2b` | 03, 05, 06 |
| AC-38 | 16 `providers` (Seam C) — the two predicates are specified at `03-module-design.md` **§7.3** | `deployment_maker_capability` over the register's configured maker set; `run_maker_reachability` over the ledger's recorded provider errors; the ledger-derived transient-vs-standing counter | **`POST /v1/asks` refuses a standard-or-above ask** on a failing deployment, with a typed error | `FX-PRV-01a` / `FX-PRV-01b` · `FX-PRV-02` | 03, 04, 06 |
| AC-39 | 16 `providers` | lane assignment; agent identity stripped before another role reads prior turns | — | `FX-HR-H6` | 03, 06 |
| AC-40 | 8 Settlement · `settlement` | `routing_decision` — lane, guard trail, **propensity recorded per decision** | `GET /v1/scorecards` | `FX-LG-09` · `FX-ORPH-05` | 02, 06 |
| AC-41 | 8 Settlement · `settlement` | `scorecard_cell` as a **derived view over the ledger** with a recorded derivation version; the model ledger in the same database | `GET /v1/scorecards` | `FX-LG-10` · `FX-PT-D5` | 02, 06 |
| AC-42 | 8 Settlement · `settlement` | `scorecard_cell` key `(model_id, model_version, provider, task_class, metric, as_of)`; `basis` with no ASSUMED/DEFAULT member; `model_identity.model_version` waking the cell on a silent update | `GET /v1/scorecards` — no leaderboard of point estimates | `FX-LG-10` · **RULED — DR-080** (AM-3): the three closed sets of six are **separate vocabularies**, joined by **two explicit register-row mapping tables** (`Q8 type → abstention class`; `(Q7 act, Q8 type) → scorecard task class`) — the second is this row's key. Table **contents are value pending VG-02** | 02, 04, 06 |
| AC-43 | 8 Settlement · `settlement` | router behaviour at t=0 identical to no-scorecard; capability cells `basis: NONE` until settled outcomes exist | `GET /v1/scorecards` | `FX-S22-03` | 06 |

### 1.5 Execution ledger, recording, decisions, budget (Plan.md §1.5)

| AC | Owner (context · package) | Data carrier | Wire carrier | Fixture (slice) | Doc |
|---|---|---|---|---|---|
| AC-44 | 15 shared · `ledger` | `ledger_entry` (tier-2 digest text) + `raw_artifact` (tier-1/3 raw tapes); `UNCLASSIFIED_ACTION` as an `UNINSTRUMENTED` trigger | `GET /v1/answers/{id}/ledger-digest`; `GET /v1/nodes/{nodeId}/executions` | `FX-LG-02` · `FX-WIRE-01` | 02, 04, 06 |
| AC-45 | 15 shared · `ledger` | `sequence bigint` allocator under a write lock; revoked `UPDATE`/`DELETE` + raising trigger | — | `FX-DB-01a` / `FX-DB-01b` | 02, 06 |
| AC-46 | 15 shared · `ledger` | `ledger_entry.subject_item_id`, `.stance_at_action`, typed outcome, actor, timings, `input_fingerprint` | `GET /v1/nodes/{nodeId}/executions` | `FX-LED-04` (S0 carrier · S1 hardened · S8 consumed) · `FX-LED-03` (S1 vocabulary · S8 `UNINSTRUMENTED` trigger) · **RULED — DR-092** (AM-4): the Q34 diff runs over **item-scoped actions only**; pre-item actions are excluded **by kind, never by value**, so **`UNASSIGNED` stays a real signal** and A-12's deliberate-asymmetry launch fixture is passable as designed | 02, 06 |
| AC-47 | 15 shared · `ledger` | four reconstruction paths: rebuild-from-artifacts, stored-result verbatim, resume-partial, completeness gate | `GET /v1/numbers/{provenanceRef}/replay` | `FX-LED-02` | 02, 06 |
| AC-48 | **3a Spawn decision · `battery/decision`** | `decision_record` — inputs, firing reasons, `categorical\|scalar` classification, blockers recorded but excluded, spawn count, and a **replay identity hash excluding the idempotency key, spawn count and classification fields** | typed job + replay handle on the spawn endpoints | `FX-HR-H3D` · `FX-LED-06` | 02, 03, 06 |
| AC-49 | 11 Budget · `budget` | `condition_mark` `SKIPPED-BY-BUDGET` + **`condition_mark_node`** (the single authoritative affected set); `run.envelope_basis`; `run_progress_event` `ENVELOPE_STATE` | condition-marks projection on Answer **and** Node | `FX-C52-06` · `FX-C52-07` · `FX-LG-05` · `FX-HR-H8` · `FX-SRV-16` (S5 projection limb · **S9 owning limb**) · **RULED — DR-093** (OQ-G2): architecture proposes the full 71-row correctness/enrichment split and **V ratifies once** — one-time design-time config, fully automatic at runtime, **no human in any user's loop**; **until ratified, rows behave as correctness and are never skipped**. Row 6's fixture (`FX-C52-06`, **LRD-1**) becomes **constructible at that ratification** — **value pending VG-02** | 02, 04, 06, 07 |
| AC-50 | 1 Framing (the run) · `budget` | `run.stranger_sample_rate` on the **immutable frozen head**; the ratchet applies to the next run | — | `FX-LG-05` · `FX-LG-06` · `FX-DB-01a/01b` | 02, 06 |

### 1.6 Serve, wire, interface (Plan.md §1.6)

| AC | Owner (context · package) | Data carrier | Wire carrier | Fixture (slice) | Doc |
|---|---|---|---|---|---|
| AC-51 | 7 Serving · `serve` | `fact_bundle` → `composed_text` → `conformance_record`, machine enforcement last | composed text or components-only rendering on the Answer | `FX-SRV-17` · `FX-LG-03` · `FX-LG-06` (S0 exhaustive · **S5 sampling**) · **RULED — DR-079** (AM-1): the non-node senses of "load-bearing" **project from the charter's node definition** — *a sentence is load-bearing iff it asserts a fact drawn from a load-bearing node or states a served number; a claim iff its node is; an unknown iff removing it would change the verdict or band* — so **conformance sampling is constructible at S5**; S0 ran exhaustively and never needed it | 02, 04, 06 |
| AC-52 | 7 Serving · `serve` | gate outcomes recorded per gate; `conformance_record` names **which R9 pass failed** | serve record on the Answer | `FX-SRV-17` · `FX-C52-01/02/03/11` · `FX-LG-03` · `FX-HR-H7` (S5 Q53-ahead-of-conformance limb · S7 skeptic limb) — the gate order is **four gates plus DR-082/086's band-cap**, which caps rather than terminates | 02, 04, 06 |
| AC-53 | 7 Serving · `serve` | terminal recorded on `answer`; components-only + `DEFECT` | serve state on the Answer and **in the answer index** | `FX-LG-03` · `FX-C52-08` · `FX-SRV-18` · `FX-SRV-19a…f` · `FX-LG-04` (S0 kernel limb · S5 per-answer limb) · **RULED — DR-078** (OQ-G3): the hard composition-bundle budget is an **independent register row** — distinct from DR-052's envelope so **`DEFECT` and `ENVELOPE_EXHAUSTED` stay distinguishable** — **with V's amendment that the cap is user-facing as a low/medium/high tier the asker selects per run**. AC-53's third terminal route becomes buildable at S5; **per-tier values pending VG-02** | 02, 04, 06 |
| AC-54 | 7 Serving · `serve` | honesty fields **machine-injected into `fact_bundle`**; `composed_text` segments ordered by load-bearing priority | honesty projections as **non-optional** fields on the Answer | `FX-SRV-14` (S5) — *injected by the machine, outside the composition model's discretion; silent truncation of an honesty surface is impossible by construction* | 02, 04, 06 |
| AC-55 | 7 Serving · `serve` · 6 `valuation` | **`valuation.reversal_point`** — the reversal point and the rejected criteria served, giving the degraded-mode projection field a stored origin. *Carrier proposed in C4 and **ACCEPTED** (DR-098 + DR-099 A-06; `02` §11A.3); gap **DM-2**'s `valuation` half is **slice-gated at S10**, which owns the four tables and their DDL.* | projection fields that render with no composed prose | `FX-SRV-15` (= `FX-C52-12`'s first limb) | 02, 04, 06 |
| AC-56 | 7 Serving · `serve` + 17 `contract` | `fact_bundle` and `conformance_record` behind the authorized handle; `raw_artifact` operator-only | tier 1 `GET /v1/answers/{id}`; tier 2 `/inspection`, `/numbers/{ref}/replay`; tier 3 `/inspection/debug`, `/inspection/prompts` | `FX-WIRE-01` · `FX-SRV-08` | 02, 04, 06 |
| AC-57 | `apps/api` + 17 `contract` | the principal resolved session → asker → answer ownership | `GET /v1/session` as the principal surface; tier-2 gate on `/inspection` | `FX-WIRE-01` · **RULED — DR-070** (AM-12): **asker = the requesting user/person**; **no separate authenticated-principal/session-scope model**, and **authorization and user credentials are explicitly OUT OF SCOPE for this stage**; V2's existing `user_dev_token` vertical slice is adopted as sufficient, landing at **S0**. **Flagged provisional on the record**: DR-070 defers credentialing rather than designing it away, and real principal/session separation may be needed before a multi-tenant or credentialed launch — carry the charter A5.2-style revisit note where it is built | 04, 06 |
| AC-58 | 7 Serving · `serve` + 17 `contract` | one requirement, one UI row and one charter hook per surface | nine honesty surfaces as typed non-optional Answer fields | `FX-ORPH-04` | 04, 06 |
| AC-59 | 17 `contract` + `web` *(in-repo, **unfenced** — DR-069)* | `packages/contract` as the **single** declaration, published as a versioned artifact | every wire shape declared once; no second declaration anywhere | `FX-ORPH-01` (**the intra-repo static type-graph pass** as the required input, replacing the consumer manifest — `07` §3.4) · **RULED — DR-068 + DR-069** (AQ-2 / AQ-3): kept UI source **may** be carried (DR-068), and there is **NO FENCE** (DR-069) — the kept UI package sits beside the engine packages as a plain, always-visible package | 03, 04, 06 |
| AC-60 | `apps/api` | — | one `/v1` namespace; SSR and browser use the same client and addresses, SSR never privileged | `FX-LG-13` | 04, 06 |
| AC-61 | `tools/orphan-audit` + 17 `contract` | the contract field inventory and the event registry as build artifacts; **the intra-repo static type-graph pass** as the required build input — `consumer-manifest.json` is **gone**, not demoted | every served field and every event name, both directions | `FX-ORPH-01` · `FX-ORPH-02` · `FX-ORPH-04` · **RULED — DR-069**, resolved at **`07-build-order.md` §3.4**: DR-069 rules the consumer-manifest mechanism *"not required"* while AC-61 still demands both directions, so the direction runs through the **single repo's single type graph** (ADR-0001's restored property) — a consumer naming an undeclared field is a **type error**, which a manifest could never be, and *"no consumer without a served field"* still **fails the build** at S14. **No optional manifest is kept**: a build input nothing requires would be a G5 dead-cost orphan (`FX-ORPH-03`) and a dead check (`FX-ORPH-06`) | 04, 06 |
| AC-62 | `apps/api` + 7 `serve` | keyset cursor over `answer_index`; the stale-worker transition moved to a **scheduled reaper** | `GET /v1/answers` with `limit` + opaque `cursor`, both sent and honoured; all reads side-effect-free | `FX-SRV-10` · pagination limb pending **API-1** | 02, 04, 06 |
| AC-63 | 17 `contract` | `served_number` with its provenance reference and replay handle | the **labeled number** `{value, provenance_ref, replay_handle, kind, source, producer}`; no bare-scalar form exists | `FX-PT-D4` · `FX-SRV-06` | 04, 06 |
| AC-64 | 10 Liveness · `liveness` + 7 `serve` (Seam D) | `staleness_state` per node and per answer, read-time projected | staleness on every answer read **and** the `staleness trigger fired` event on `GET /v1/runs/{id}/events`, with a declared consumer | `FX-LG-12` | 02, 04, 06 |
| AC-65 | 13 shared kernel · `kernel` | the spec §12.3 table transcribed **once**; `condition_mark` and `abstention` rows cite it | closed enums in `packages/contract`; uniform `condition_marks[]` projection | `FX-LG-04` | 02, 04, 06 |
| AC-66 | 7 Serving · `serve` + 12 `register` | `answer` — verdict state (`CHECK`-closed at three) and confidence band as **ordered labels**, cut-point matrix supplied by the register; abstention in its own field | two independent axes on the Answer; abstention never a band | `FX-C52-04` · `FX-SRV-13` | 02, 04, 06 |
| AC-67 | 3 `graph` (minted with the node) + 7 `serve` | `stranger_restatement` — one row per node and one per verdict, `action_consequence` `NOT_APPLICABLE` on node rows enforced by a `CHECK` on `subject_kind`, `check_status ∈ {PASS, FAIL, NOT_SAMPLED}` | restatement with `check_status` on the node envelope | `FX-LG-06` · `FX-C52-03` | 02, 04, 06 |
| **AC-86** | **7 Serving · `serve`** | `fact_bundle` (produced-by-the-ledger precondition); `answer` (known status); `node` current set (no out-of-set reference); item validation over the serve projection; **`served_number_event`** for the **per-number** replay precondition | the **typed error taxonomy** in `packages/contract` — five distinct typed reasons, closed enum (§5.6) — surfaced on `GET /v1/answers/{id}`; `GET /v1/numbers/{provenanceRef}/replay` for the per-number limb | `FX-SRV-07` (+ `FX-SRV-05` for the per-number limb) | 02, 04, 06 |
| **AC-87** | **7 Serving · `serve`** | `raw_artifact` never leaves tier 3; `conformance_record` is the structured tier-2 form; `condition_mark.reason` and every served reason string scrubbed, damaged strings **dropped**; optional scalars copied only when well-typed | §5.2's three payload classes; `/inspection` (structured) vs `/inspection/prompts` (raw, operator-only) | `FX-SRV-08` · `FX-WIRE-01` | 02, 04, 06 |
| **AC-88** | **7 Serving · `serve`** | status **derived** from the latest `served_number_event`; the answer's current serve state derived from its events; `segment_suppression` joined to the frozen `conformance_record`; typed pending and typed error entries for current nodes with no entry | `GET /v1/answers/{id}` returns the latest version with its **current derived** projection; `?version=` returns the sealed artifacts | `FX-SRV-09` · `FX-SRV-05` · `FX-DB-02` | 02, 04, 06 |
| **AC-89** | **7 Serving · `serve`** — the read-derives half (owner recorded at §6.6 UI-13) — + **`apps/scheduler` · `job:reaper`** for the write half (`03` §1.2) | the job's deadline as the stored fact; the **transition** written by the reaper; the **read derives** the failed status without writing — satisfying AC-88 and AC-62 simultaneously | `GET /v1/fleet` (the reaping side effect moved off the read path); `GET /v1/nodes/{nodeId}/executions` | `FX-SRV-10` | 02, 04, 06 |
| **AC-90** | **7 Serving · `serve`** | `served_number` `WITHHELD(reason)`; `abstention` rows (kind + price cell + unlock condition + ledger-unknown ref). the typed `unavailable` verdict is **`serve.answer.verdict_unavailable {reason_ref}`** — an optional typed field, not a table; when present, neither `verdict_state` nor the confidence band is populated. *Carrier proposed in C4 and **ACCEPTED** (DR-098 + DR-099 A-06; `02` §7.11); gap **TRACE-10** closes on that acceptance. If the token surfaces to a reader it is placed in spec §12.3 by amendment (AC-65, S-13).* The no-live-node limb is a return shape, not a stored fact | the number slot union `PRESENT \| EVICTED \| WITHHELD` — *absent* is not representable (§5.4); two-axis verdict fields with abstention in its own field | **`FX-SRV-11`** (`06` §9.5) — all three limbs, including the no-live-node case, S5 | 02, 04, 06 |
| **AC-91** | **7 Serving · `serve`** + 2 `evidence` (the gate) + 6 `valuation` (the overlay reusing the shape) | `abstention` unlock condition; `condition_mark.lift_path`; the shadow-mode record is **`serve.shadow_suppression`** — append-only, distinct from `segment_suppression`. *Carrier proposed in C4 and **ACCEPTED** (DR-098 + DR-099 A-06; `02` §7.10); gap **TRACE-9** closes on that acceptance, and the record's DDL rides **S6**, the slice that owns the evidence gate.* | suppression prose **and** its unlock as typed Answer fields; the shadow-mode pair (what would have been suppressed, beside the unsuppressed band) | `FX-SRV-12` · **RULED — DR-085** (U-2): the `OD-20` evidence gate ships **tier-invariant with shadow mode** — eligibility is **the exact complement of §5.2(f)'s evidence-free list**, and until the map is filled the gate **publishes what it would have suppressed beside the unsuppressed result**. The tier × claim-type map ships as an **empty register table**, **value pending VG-02**, with no invented cells (AC-76). *Shadow mode is now the ruled design, not an interim posture* | 02, 04, 06 |
| **AC-92** | **4 Appraisal · `judgement`** | `reduced_judgement` — τ, uncertainty-ladder position, **drivers in fixed emission order**, ordered score caps with what/to-what/why/by-what, typed holes, branch identifier, `reducer_version`, `judge_weight_version`; `raw_artifact.parse status and error` keeping **parse failure and schema failure distinguishable**; per-member panel contract hashes. the claim-type → composition map's canonical home is **`register.register_row`**, on Plan.md §6.2 AM-3's mapping-as-register-row precedent — AC-92's *held as data, never a source literal* satisfied without a new table. *Carrier proposed in C4 and **ACCEPTED** (DR-098 + DR-099 A-06; `02` §9.1) — gap **DM-3** closes on that acceptance; the key name and declared value type are `05`'s, the map's **contents are value pending VG-02** (DR-023), and the structure is asserted at **S4*** | node envelope: claim, way of knowing, base score and final strength each with a provenance reference, typed non-answers; dispersion and the disagreement flag as projections | `FX-LG-15` · `FX-LG-16` · `FX-S22-01` · `FX-PT-D1` · `FX-HR-H6` (S4 produced-never-grades limb) · **RULED — DR-077** (U-4 ≡ A-6): a judge's earned weight **multiplies the served arithmetic**, consumed in the **selection** of which judgement becomes the reduced score **under a declared rule, never by averaging**; **dispersion is measured and served separately, never blended away**. `FX-PT-D5` gains a real assertion target at S12. The composition map's **contents** stay **value pending VG-02** | 02, 04, 06 |

### 1.7 Memory, liveness, settlement (Plan.md §1.7)

| AC | Owner (context · package) | Data carrier | Wire carrier | Fixture (slice) | Doc |
|---|---|---|---|---|---|
| AC-68 | 9 Memory · `memory` | `question_key` — a projection of already-frozen fields, **not** the cache key; four tiers as database predicates | the disclosure block on the Answer | `FX-S22-04` | 02, 06 |
| AC-69 | 9 Memory · `memory` | `memory_link` typed directed edge; **no closure job exists**, asserted by a property test | disclosure block; `POST /v1/answers/{id}/memory-link/unlink` | `FX-PT-MEM` · `FX-DB-06a` / `FX-DB-06b` | 02, 04, 06 |
| AC-70 | 9 Memory · `memory` | `pull_record` pinned `{artifact_id, version, content_hash, as_of, staleness_state_at_pull}` | pinned pull refs in the disclosure block | `FX-S22-04` | 02, 06 |
| AC-71 | 9 Memory · `memory` | `asker_scope` on question-level pulls; class-level facts unpartitioned | per-asker scoping evaluated against `GET /v1/session` | — (asserted inside `FX-S22-04`) · **RULED — DR-070** (AM-12): the asker is the requesting user/person, so the per-asker memory partition resolves against that identity. The column existed either way; it is now **populated by a ruled identity** rather than an unnamed one — and it is one of the surfaces DR-070's provisional-simplification caveat would touch if principal/session separation is later needed | 02, 04, 06 |
| AC-72 | 10 Liveness · `liveness` | `revision_trigger`, `review_clock`, `staleness_state` | `STALE` / `UNDER-REVIEW` badges as projections; the staleness event on the stream | `FX-C52-05` | 02, 04, 06 |
| AC-73 | 8 Settlement · `settlement` | `answer_outcome {answer, prior, posterior, basis, resolver, date, provenance}` with read-back verification recorded as its own ledger action; scoring keyed on `(answer_id, answer_version, as_of)` | `POST /v1/nodes/{id}/feedback`; `GET /v1/scorecards` | — (no dedicated id; §8.3) | 02, 04, 06 |

### 1.8 Configuration, acceptance, process (Plan.md §1.8)

| AC | Owner (context · package) | Data carrier | Wire carrier | Fixture (slice) | Doc |
|---|---|---|---|---|---|
| AC-74 | 12 Register · `register` | `register_row` (key, type, value, unit, version, ratified-by/at, `is_provisional`, recalibration owner + trigger + sign-off, resolution scope); `register_version` immutable; `run.register_version` pinned per run | `GET /v1/register`; `PUT /v1/register/{key}` | **`FX-REG-01`** (bootstrap equality: `register.bootstrap.json` and the ratified register may not disagree on any bootstrap key — S0, re-asserted at S15) · **`FX-REG-02`** (the bundle actually reads the register through its declared read-only edge — S15, edge present from S0) · **RULED — DR-097** (charter §9 item 7): an unratified register row is **OUTSIDE charter clause 4's orphan reach** — rows are **data, not code**, the never-called list stays about **executable units**, and **AC-74's ratify-before-production gate governs the register**. **`LRD-2` is discharged.** **Plus V's amendment**: an **advisory, non-blocking audit** reports any key no code ever reads after full build (S15; fixture id minted in `06`'s roster by PRE-03). The register's ratification itself is **value pending VG-02** | 02, 04, 05, 06 |
| AC-75 | 12 Register · `register` | `register_row_key` + `register_version` on every row a register value moved | the constant printed in the served trail beside the number it set | `FX-SRV-13` | 02, 04, 05 |
| AC-76 | 12 Register · `register` + `tools/acceptance-bundle` | keys with **values only where the pack states one** | — | **`FX-REG-01`** — *asserts equality, never a value*: the four bootstrap rows ship valueless and the values are V's at DR-023 | 05, 06 |
| AC-77 | `tools/orphan-audit` | the never-called list, the published entry-point list, the dead-cost audit | every endpoint and event reachable from a named entry point | `FX-ORPH-01…06`, `FX-ORPH-02` **BLOCKING**; `FX-ORPH-03` / `FX-ORPH-06` **ADVISORY**, wired from S0 and reviewed into the S15 bundle · **RULED — DR-097**: register rows are outside clause 4's reach, so the blocking list stays about executable units, and the new **advisory unread-key lane** sits beside it. **Three `apps/scheduler` entry points must now be published**, not two — DR-089's settlement watch joins `job:replay-self-test` and `job:reaper` | 06, 07 |
| AC-78 | `tools/acceptance-bundle` | — *(the constraint is that no code exists)* | — | `FX-DEF-01` / `FX-DEF-02` (attestations) · **RULED — DR-088** (charter §9 item 6): **auto-activation counts as shipped dark — the charter's not-shipped rule wins.** *"Auto-activates"* describes the **activation event only**: the citation hard-kill gate is **written when the quote matcher validates, never shipped inert**, so the bundle carries the **NOT-SHIPPED attestation** and `FX-DEF-01`'s shape stands unchanged. Charter §9 contradiction 6 resolved | 06, 07 |
| AC-79 | CI gates · `06-test-strategy.md` | — | — | `06` §8's fire-both-ways register — every `a`/`b` pair | 06, 07 |
| AC-80 | test strategy · `published-arithmetic` + property tests | the two published literature vectors and the `va == vs` tie-boundary case run in CI against `published-arithmetic` | — | `FX-LV-01` / `FX-LV-02` · `FX-PT-D1…D5` | 06 |
| AC-81 | process · **honour system** + structural rule 4 | — | — | — unfixturable by ruling (TRACE-6): launch attestation · **RULED — DR-068 + DR-069** (AQ-2 / AQ-3): with **NO FENCE**, checkout separation is gone and **DR-003's clean-room mandate has no enforcement mechanism** — *compliance is an honour system, not a checked barrier*. V priced this and accepted it as a **trade-off, not a gap**, and directs that it **not be re-raised as an open question**. AC-81's acceptance form is therefore the launch attestation alone; code coupling stays CI-enforced (structural rule 4) and substitutes for nothing | 03, 07 |
| AC-82 | repository | — | — | — structural (TRACE-4): repository assertion | 07 |
| AC-83 | 1 Framing · `battery` | `run_row_activation` (immutable, `predicate_ref`) + `run_row_activation_event` (`state ∈ {ACTIVE, INACTIVE, WAIT, POLICY_BLOCKED}`, predicate inputs, skip evidence, `at_seq`); a cache hit never sets INACTIVE | — | `FX-S22-05` (S0 first limb · **S6** complete 13-row proof · **S15** bundle evidence) · **RULED — DR-083** (OQ-G9): the activation table is **re-derived and ratified in-repo** as a first-class per-row contract field with **a written predicate per row**; **a row whose predicate the spec only summarizes files as `POLICY_BLOCKED` — loud, never a silent skip**; **no import of the old research artifact**. Table drafted by PRE-05, **value pending VG-02** · **RULED — DR-089** (AM-10): the **WAIT drain law** — at run completion **nothing remains waiting**, the run records a **typed terminal state**, and Q61 becomes a **post-completion settlement event outside the run lifecycle** (S12), so **no completed run displays a dangling WAIT** | 02, 06 |
| AC-84 | 12 `register` + contract governance | validated findings land as register rows, scorecards or a strategy implementation — never as graph, ledger or serve-contract changes | **additive-only within `/v1`**; a non-additive change is a new version | CI `contract` | 04, 05, 06 |
| AC-85 | all contexts · enforced by the dependency edge list | one named canonical owner per invariant (the creating migration for DDL; the owning context otherwise); `ledger_entry` typed outcome for every caught failure | one declaration per wire shape | `FX-IND-01` · `FX-LG-02` · `FX-SRV-16` · `FX-ORPH-02` | 02, 03, 06 |

---

## 2. AC-86…AC-92 — the resolution statement

These seven rows were added to the constraint base at rework round 1 and are the
rows Plan.md §7 row 1 requires to **resolve completely**: each to its owner, its
data and API carrier, and its acceptance fixture. §1.6 above carries the full
rows. This section states the resolution in the form the requirement asks for, so
the check is one read rather than seven lookups.

| AC | Owner | Resolves to a data carrier? | Resolves to an API carrier? | Resolves to a fixture? |
|---|---|---|---|---|
| AC-86 | context 7 `serve` | **yes** — `fact_bundle`, `answer`, `node` current set, `served_number_event` | **yes** — the closed typed-error taxonomy in `packages/contract`, on `GET /v1/answers/{id}`, plus `/numbers/{ref}/replay` for the per-number limb | **yes** — `FX-SRV-07` (five distinct typed refusals) + `FX-SRV-05` (the per-number limb), S5 |
| AC-87 | context 7 `serve` | **yes** — `raw_artifact` (tier 3), `conformance_record` (tier 2 structured), scrubbed reason strings | **yes** — §5.2's three payload classes; `/inspection` vs `/inspection/prompts` | **yes** — `FX-SRV-08` + `FX-WIRE-01`, S5 |
| AC-88 | context 7 `serve` | **yes** — `served_number_event` (status derived), `segment_suppression`, `answer` current state derived | **yes** — `GET /v1/answers/{id}` latest+current vs `?version=` sealed | **yes** — `FX-SRV-09` + `FX-SRV-05`, S5; `FX-DB-02` for the same rule on the run side, S1 |
| AC-89 | context 7 `serve` + the scheduled reaper (§6.6 UI-13) | **yes** — the deadline is stored; the transition is the reaper's write; the read derives | **yes** — `GET /v1/fleet`, `GET /v1/nodes/{nodeId}/executions`, both side-effect-free | **yes** — **`FX-SRV-10`** (`06` §9.5): an active job past its deadline reads as failed on every read, the transition is the scheduled reaper's, **no read carries a write side effect**. S5 / S14 |
| AC-90 | context 7 `serve` | **yes, accepted** — `served_number` `WITHHELD(reason)`, `abstention`, and `answer.verdict_unavailable` *(proposed in C4 at `02` §7.11, **accepted at DR-098 + DR-099 A-06**; gap **TRACE-10** closes)* | **yes** — the number slot union; two-axis verdict fields | **yes** — **`FX-SRV-11`** (`06` §9.5) carries all three limbs, including *a lean with no live supporting or attacking node returns **nothing**, never a fabricated even split*. S5 |
| AC-91 | context 7 `serve` (+ `evidence`, `valuation`) | **yes, accepted** — `abstention` unlock condition; `condition_mark.lift_path`; the shadow-mode record is **`serve.shadow_suppression`** — append-only, distinct from `segment_suppression`. *Carrier proposed in C4 and **ACCEPTED** (DR-098 + DR-099 A-06; `02` §7.10); gap **TRACE-9** closes on that acceptance, and the record's DDL rides **S6**, the slice that owns the evidence gate.* | **yes** — suppression prose + unlock as typed Answer fields; the shadow-mode pair | **yes** — `FX-SRV-12`, S5 / S6 · eligibility map **RULED — DR-085** (U-2): tier-invariant **shadow mode**, eligibility = the exact complement of §5.2(f)'s evidence-free list, the tier × claim-type map an **empty register table**, **value pending VG-02** |
| AC-92 | context 4 `judgement` | **yes, accepted** — `reduced_judgement` and `raw_artifact`'s parse-vs-schema status carry the contract, and the claim-type → composition map's home is `register.register_row` *(proposed in C4 at `02` §9.1, **accepted at DR-098 + DR-099 A-06**; gap **DM-3** closes; contents **value pending VG-02**)* | **yes** — the node envelope's judgement fields; dispersion and disagreement projections | **yes** — `FX-LG-16` (the composition map is data; parse-vs-schema distinguishable; emitted branch; ordered caps; fixed driver order) · `FX-LG-15` (panel isolation, dispersion, correlated-error grouping) · `FX-S22-01` (disagreement flag fires both ways) · `FX-PT-D1`. S4 · **RULED — DR-077** (U-4 ≡ A-6): earned weight multiplies the served arithmetic, consumed in **selection** under a declared rule, never by averaging; dispersion served separately |

**Reading of the verdicts, after C4 rework round 1.**

- **All seven resolve to an owner and to an acceptance fixture with an exact
  `FX-*` id.** The round-1 review verified at source that `06-test-strategy.md`
  §9.5 already carries `FX-SRV-10` (AC-89's reaper-writes / read-derives pair)
  and `FX-SRV-11` (AC-90 including the no-live-node limb); the previous edition
  of this table reported both as unfixtured. **Those two false failures are
  withdrawn** (merge verdict adjudication 1; `TRACE-1`, `TRACE-2` close MISREAD).
- **All seven now resolve to a data carrier, and the three that were C4
  proposals are ACCEPTED.** `02-data-model.md` gained the three this index
  previously reported as absent — `answer.verdict_unavailable` (§7.11, AC-90),
  `shadow_suppression` (§7.10, AC-91) and the composition map's home at
  `register.register_row` (§9.1, AC-92). **DR-098 accepts the C4 artifact set as
  the working architecture and DR-099 adopts amendments A-05…A-13 wholesale —
  naming the evidence/critique/valuation schemas, the composition-map home, the
  `work_item` table, the `JUDGEMENT_SCHEDULED` action and the TRACE-8/9/10
  carriers among them** — so each row now reads **yes, accepted**, and the gap
  ids `TRACE-8`, `TRACE-9`, `TRACE-10` and `DM-3` close on that acceptance
  rather than waiting on a FinalPlan sitting that the ledger has already
  overtaken. **The distinction this table drew still matters and is now
  historical:** *carrier proposed in C4, acceptance pending* was a scheduled
  decision; *no carrier exists* is an unheld constraint. Neither is true of any
  AC-86…AC-92 row today.
- **What acceptance did not settle: where the DDL lands.** An accepted carrier
  with no owning slice is still unbuilt, and `06` §12's law — *an unassigned id
  is a defect, not a deferral* — has an exact analogue for tables. §8.1/§8.1a
  now name the **slice that owns each accepted carrier's migration** (`S0`
  `work_item`; `S4` the composition map; `S6` the eight evidence tables and
  `shadow_suppression`; `S8` the four critique tables; `S10` the four valuation
  tables), so the acceptance is checkable in the build rather than only on paper.

Nothing above rules a question or mints a fixture or a carrier. Where a carrier
was a C4 proposal the row says so and names the ruling that accepted it and the
slice that owns it; where lane 6's roster already holds the fixture, this index
points at it rather than asking for a new one.

---

## 3. Reverse index — DR → AC

The ledger leg of the chain. Built from Plan.md §1's citation column, which is
the authoritative mapping from a DR to the constraint it imposes. A DR absent
from this table imposes no architecture constraint through §1's base; that does
not make it inapplicable, only uncarried by an AC row.

| DR | AC rows it imposes |
|---|---|
| DR-003 | AC-81 |
| DR-005 *(as narrowed by DR-024)* | the SEAT-PROPOSAL status of every stack row; ratification of all of §2 |
| DR-013 | AC-92 (maker bright line, via §5.2's lineage clauses) |
| DR-014 | AC-92; the cap path referenced by AC-38 and AC-66 |
| DR-015 | AC-64, AC-72 |
| DR-016 | AC-05 |
| DR-017 | AC-30 |
| DR-018 | charter §5.2 row 3's R9 block, carried at AC-67 |
| DR-019 knob 1 | AC-50 |
| DR-020 knobs 7–8 | AC-78 |
| DR-021 knob 9 | AC-49 |
| DR-022 *(narrowed by DR-035)* | AC-18 |
| DR-023 | AC-74 (and every register-valued row: AC-66, AC-75, AC-76) |
| DR-024 | AC-01, AC-03 |
| DR-027 | AC-44, AC-63 |
| DR-028 | AC-11 (reconciliation), AC-21, AC-92 |
| DR-029 | H1 → AC-36; H2 → AC-37; H3 → AC-09; H4 → AC-22 |
| DR-030 | J1 → AC-14; J2 → AC-15, AC-18; J3 → AC-16 |
| DR-031 | knob 1 → AC-82; Q47 → AC-22 |
| DR-032 | AC-92 |
| DR-033 | AC-80, AC-81 |
| DR-034 | AC-06, AC-63, AC-86 |
| DR-035 | AC-18 |
| DR-037 | AC-83, AC-92 |
| DR-039 | AC-76 |
| DR-040 Q45 | AC-22 |
| DR-042 | AC-20 |
| DR-044 | AC-51; Q51 → AC-24 (carrier (i)) |
| DR-045 | AC-46 |
| DR-046 | AC-02, AC-40, AC-41, AC-43 |
| DR-047 clause 4 | AC-61, AC-77 |
| DR-048 | AC-58, AC-59, AC-60 |
| DR-049 | AC-52, AC-53 |
| DR-051 | AC-65 |
| DR-052 | AC-49, AC-50 |
| DR-053 | the run's monotone phase transition, carried under AC-88's derived-state rule |
| DR-054 | AC-56, AC-63 |
| DR-055 | AC-38 |
| DR-056 | (a) → AC-17; (b) → AC-20 |
| DR-057 | AC-52, AC-53 |
| DR-058 | AC-53, AC-54 |
| DR-059 | AC-12, AC-55, AC-63, AC-86 |
| DR-060 | (a) → the per-segment conformance vocabulary under AC-52; (b) → AC-07 |
| DR-061 | `OD-S-06` → AC-67; `OD-M-04` → AC-68; `OD-M-20` → AC-71 |
| DR-062 | `OD-01`/`OD-09` → AC-23; `OD-02` → AC-21; `OD-04` → AC-28; `OD-05` → AC-26; `OD-06` → AC-27; `OD-08` → AC-25; `OD-12` → AC-24; `OD-16`/`OD-17` → AC-92; `OD-20` → AC-91; `OD-22` → AC-22 |
| DR-063 | VR-1/VR-5 → AC-79; VR-2 → AC-24, AC-66; VR-3 → AC-07; VR-4 → AC-77 |
| DR-064 | out of C4's scope by ruling — presentation cells (`00-overview.md` §10) |
| DR-065 | AC-82 |
| DR-066 | (1) → AC-57; (2) → AC-19; (3) → AC-66 |

**The ARCH-V3-R1 rulings, DR-068…DR-101.** These impose through the same base:
each row names the AC rows the ruling reaches, so a reviewer can walk a ruling to
its constraints without re-reading the ledger. **A ruling absent from an AC row's
fixture cell is a fold-in defect**, which is what this table exists to expose.

| DR | AC rows it imposes | Slice it first binds |
|---|---|---|
| **DR-068** *(Q-01)* | AC-59, AC-81 — kept UI source may be carried | **S0** |
| **DR-069** *(Q-02)* | AC-59, AC-61, AC-81 — **NO FENCE**; the consumer manifest is not required, and AC-61's consumer direction re-routes to the intra-repo static type-graph pass (`07` §3.4) | **S0**, enforced at **S14** |
| **DR-070** *(Q-03)* | AC-57, AC-71 — asker = the requesting user/person; authorization out of scope, **provisional** | **S0** |
| **DR-071** *(Q-04)* | AC-27, AC-19 *(carrier)*, AC-18 — `UNDERCUT_TRANSMISSION` writable; a third producer of arrow strength | **S2** |
| **DR-072** *(Q-05)* | AC-21, AC-29 — folder-lift then judged-ancestor lift, both-ends markers | **S3** |
| **DR-073** *(Q-06)* | AC-23 — collapse over **both** polarities; unresolvable key clusters alone | **S3** |
| **DR-074** *(Q-07)* | AC-22, AC-26, AC-74 — mandatory deployment operator row; the declare/withhold machinery is **deleted** | **S3** (swept at **S5**) |
| **DR-075** *(Q-08)* | AC-21, AC-86 — a `pending` node is an unjudged interior node; placeholder arrows are **live** endpoints | **S3** |
| **DR-076** *(Q-08 amendment)* | AC-61, AC-64, AC-77 — node-lifecycle events with declared consumers; spawn-time connectivity | **S7** · **S14** |
| **DR-077** *(Q-09)* | AC-92, AC-21 — earned weight multiplies via **selection**; dispersion served separately | **S4** |
| **DR-078** *(Q-10)* | AC-53, AC-74, AC-75 — independent composition-budget row + asker-facing tier | **S5** *(carrier **S0**)* |
| **DR-079** *(Q-11)* | AC-51, AC-67 — the load-bearing projection rule; sampling becomes constructible | **S5** |
| **DR-080** *(Q-12)* | AC-42, AC-49, AC-65, AC-74 — three vocabularies + two register mapping tables | **S5** · **S12** |
| **DR-081** *(Q-13)* | AC-74; `OD-11`'s layer-2 detail behind a flip row, **both states testable** (G4) | **S5** |
| **DR-082 + DR-086** *(Q-14)* | AC-24, AC-66, AC-75 — a **second independent gate** whose firing **caps the band**, never blocks | **S5** |
| **DR-083** *(Q-15)* | AC-83 — the activation table as a per-row contract field; `POLICY_BLOCKED` is loud | **S6** |
| **DR-084** *(Q-16)* | AC-65, AC-78 — eight typed citation routes, architecture proposes / V ratifies, **no "other"** | **S6** |
| **DR-085** *(Q-17)* | AC-91 — evidence gate tier-invariant with **shadow mode**; empty eligibility table | **S6** |
| **DR-087** *(Q-18)* | AC-91, AC-92 — `mixed`/`unknown` gated fail-closed; **`value-laden` is a flag, not a claim type** | **S6** |
| **DR-088** *(Q-19)* | AC-78 — auto-activation **counts as shipped dark**; the NOT-SHIPPED attestation stands | **S6** |
| **DR-089** *(Q-20)* | AC-83, AC-88, AC-77 — the **WAIT drain law**; Q61 as a post-completion settlement watch on a third scheduler job | **S7** · **S12** |
| **DR-090** *(Q-21)* | AC-38 *(via the maker floor)*, AC-41 — maker-diversity floor alone; measured difference **recorded unavailable** | **S7** |
| **DR-091** *(Q-22)* | AC-38, AC-29 *(the basis is a trigger, never a score input)* — the CROSS-entry leverage snapshot, **authorized** | **S8** |
| **DR-092** *(Q-23)* | AC-46 — item-scoped actions only; excluded **by kind**, so `UNASSIGNED` stays a signal | **S8** |
| **DR-093** *(Q-24)* | AC-49, AC-74 — propose-and-ratify-once; **LRD-1** constructible at ratification | **S9** |
| **DR-094** *(Q-25)* | AC-49, AC-50, AC-38 — asker declares, policy may **raise, never lower** | **S9** |
| **DR-095** *(Q-26)* | AC-58, AC-59 — kept **surface**, rebuilt insides; mockup review per altered component | **S14** |
| **DR-096** *(Q-27)* | AC-58, AC-74 — **no** verdict-first flag; the register row is deliberately absent | **S14** |
| **DR-097** *(Q-28)* | AC-74, AC-77 — register rows **outside** clause 4's orphan reach; **LRD-2 discharged**; advisory unread-key lane | **S15** |
| **DR-098** *(VS-1)* | the **SEAT-PROPOSAL status of every stack row** and the whole C4 set — accepted **wholesale**, no per-technology row | pre-S0 (**GPG-1**, **GPG-2**) |
| **DR-099** *(A-01…A-13)* | AC-11 (`JUDGEMENT_SCHEDULED`), AC-04/AC-62/AC-89 (`work_item`), AC-23/AC-28/AC-90/AC-91 (evidence tables), AC-29/AC-30/AC-55 (valuation), AC-39/AC-46/AC-66/AC-92 (critique), AC-92 (composition-map home), AC-25 (restatement flag), AC-65 (**five terminal routes** — the founding-table correction, PRE-08), AC-74/AC-76 (bootstrap path; A5.2 over orderings), AC-62 (executions pagination), AC-38 (**ADR-0015**) | across **S0…S15** |
| **DR-100** *(closure)* | none directly — **ARCHITECTURE SATISFIED**; directs this fold-in | — |
| **DR-101 / DR-102** | none — **process rulings** (board authority; the programming loop's standing engineering law). Recorded here so a reader who greps a DR number finds it and learns it imposes no architecture constraint | — |

**Founding-doc sections carrying an AC row without a DR** (the second authority
leg): charter S1 → AC-07; charter VR-2 → AC-24 *(the authority for carrier (ii))*;
charter §5 / G1 / G2 / G5 / A4.2 / VR-4 → AC-77; charter A3.1 / A3.3 / A3.6 →
AC-85; charter A3.2 → AC-32; charter §6 / A5.3 / A5.5 → AC-84; charter A5.2 →
AC-74's provisional-row metadata; spec §12.3 → AC-65; spec §19 H6 → AC-39; spec
§19 H8 → AC-49; spec §16.2 K-3…K-11 → AC-42; spec §18 O-5/O-6 → AC-31; spec
§10.2 C-7 → AC-29; manifest §6.2 → AC-33; manifest §8.2g → AC-08, AC-45;
manifest §8.2a → AC-13; manifest §8.2c–e → AC-10; manifest §8.2f → AC-11, AC-47;
manifest §4.3 → AC-34; manifest §4.4 / §6.3 / §6.4 → AC-35; manifest §9.2a–f →
AC-86…AC-91; manifest §5.2a–m → AC-92; ui §2 → AC-62; ui §1.1 → AC-63.

---

## 4. Reverse index — module → AC

Every package in Plan.md §2.6 appears here. **A package with no AC row would be
an orphan by construction** (AC-77), so this column is itself an audit.

| Package / unit | AC rows it owns or co-owns |
|---|---|
| `kernel` | AC-35, AC-65 |
| `published-arithmetic` | AC-07, AC-14, AC-26, AC-80 |
| `propagation` | AC-09, AC-14, AC-20 (layer 3), AC-21, AC-22, AC-23, AC-26, AC-31 |
| `battery/decision` | AC-48 |
| `contract` | AC-35, AC-56, AC-57, AC-58, AC-59, AC-61, AC-63, AC-84 |
| `register` | AC-22, AC-37, AC-66, AC-74, AC-75, AC-76, AC-84 |
| `db` | AC-01, AC-02, AC-04, AC-05 |
| `ledger` | AC-06, AC-08, AC-10, AC-11, AC-13, AC-34, AC-44, AC-45, AC-46, AC-47 |
| `providers` | AC-04, AC-13, AC-36, AC-37, AC-38, AC-39 |
| `graph` | AC-15, AC-18, AC-19, AC-20, AC-27, AC-28, AC-31, AC-32, AC-33, AC-35, AC-67 |
| `judgement` | AC-21, AC-25, AC-92 |
| `evidence` | AC-23, AC-27, AC-28, AC-91 |
| `battery` | AC-11, AC-50, AC-83 |
| `critique` | AC-39 (blinding), AC-66 (the DR-014 cap path) |
| `valuation` | AC-22, AC-26, AC-29, AC-30, AC-55, AC-91 |
| `serve` | AC-12, AC-16, AC-24, AC-51, AC-52, AC-53, AC-54, AC-55, AC-56, AC-58, AC-62, AC-64, AC-66, AC-67, **AC-86, AC-87, AC-88, AC-89, AC-90, AC-91** |
| `memory` | AC-68, AC-69, AC-70, AC-71 |
| `settlement` | AC-40, AC-41, AC-42, AC-43, AC-73 |
| `liveness` | AC-05, AC-64, AC-72 |
| `budget` | AC-49, AC-50 |
| `apps/api` | AC-57, AC-60, AC-62 |
| `apps/runner` | AC-04, AC-11, AC-50 |
| `apps/replay` | AC-06, AC-07, AC-14, AC-85 |
| `apps/scheduler` | AC-06, AC-12, AC-62, AC-73, AC-77, AC-89 — the one home for time-triggered work (`03` §1.2), with **three** named entry points on the published entry-point list after DR-089 (was two). **Each job needs its own named credential scope**: the jobs share a process and must not share a credential (H-O-24's residue) |
| `apps/scheduler` · **`job:replay-self-test`** | AC-06, AC-12 — charter S1's *continuous* limb: recomputes each servable number from frozen records and, on a mismatch, writes the eviction transition |
| `apps/scheduler` · **`job:reaper`** | AC-62, AC-89 — AC-89's *write* half plus the stale-worker reaping AC-62 moves off the read path |
| `apps/scheduler` · **the settlement watch** *(new — **DR-089**)* | AC-73, AC-83 — Q61's standing cross-run watch, **outside any run lifecycle**: fires when the resolver outcome arrives, saves it to the execution ledger (DR-027), and updates calibration **from the ledger record**; **never fires for a debate that did not complete**. Lands at **S12**; **must be published on the G1 entry-point list** (charter A4.5) or it is an orphan the day it lands. *Job name is `03`'s to mint (PRE-02) — none is invented here* |
| `tools/orphan-audit` | AC-61, AC-77, AC-85 — plus **DR-097's advisory unread-register-key lane** (S15), non-blocking by ruling |
| `tools/acceptance-bundle` | AC-76, AC-77, AC-78, AC-79 |
| `web` *(in-repo, **unfenced** — DR-069)* | AC-59, AC-60, AC-61, AC-81 |

---

## 5. Reverse index — table → AC

Grouped by schema, per Plan.md §4. **Every table appears with at least one AC
row**; a table with none would be an orphan on the never-called list (AC-77).
Shapes are `02-data-model.md`'s, not restated here.

| Schema | Table | AC rows |
|---|---|---|
| `core` | `run` (immutable frozen head) | AC-49, AC-50, AC-74 |
| `core` | `run_progress_event` | AC-45, AC-49, AC-88 |
| `core` | `run_row_activation` | AC-83 |
| `core` | `run_row_activation_event` | AC-04, AC-45, AC-83 |
| `core` | `node` | AC-15, AC-31, AC-32, AC-33 |
| `core` | `node_text_revision` | AC-32 |
| `core` | `node_epistemic_record` | AC-34 |
| `core` | `stranger_restatement` | AC-67 |
| `core` | `edge` | AC-18, AC-19, AC-27, AC-28, AC-32, AC-35 |
| `core` | `revision_trigger`, `review_clock`, `staleness_state` | AC-05, AC-64, AC-72 |
| `ledger` | `ledger_entry` | AC-08, AC-44, AC-45, AC-46, AC-85 |
| `ledger` | `raw_artifact` | AC-10, AC-13, AC-87, AC-92 |
| `ledger` | `reduced_judgement` | AC-92 |
| `ledger` | `propagation_run` | AC-08, AC-14, AC-22, AC-23 |
| `ledger` | `node_strength_record` | AC-21, AC-24, AC-31, AC-34 |
| `ledger` | `decision_record` | AC-48 |
| `serve` | `fact_bundle` | AC-07, AC-51, AC-54, AC-86 |
| `serve` | `composed_text` | AC-53, AC-54, AC-63 |
| `serve` | `segment_suppression` | AC-12, AC-88 |
| `serve` | `served_number` | AC-12, AC-63, AC-90 |
| `serve` | `served_number_event` | AC-12, AC-86, AC-88 |
| `serve` | `conformance_record` | AC-07, AC-52, AC-87 |
| `serve` | `answer` | AC-24, AC-53, AC-66, AC-73, AC-88 |
| `serve` | `condition_mark` | AC-49, AC-65, AC-91 |
| `serve` | `condition_mark_node` | AC-49 |
| `serve` | `abstention` | AC-65, AC-90, AC-91 |
| `serve` | `answer_index` | AC-53, AC-62 — **a read-time view**, not a base table and not a materialized cache: every field it carries is derived elsewhere, so a base table would be a second writable store (`02` §7.9, decided under lane 3's authority; **DM-5** closed) |
| `scorecard` | `model_identity` | AC-42 |
| `scorecard` | `session_assignment` | AC-02, AC-41 |
| `scorecard` | `scorecard_cell` | AC-41, AC-42, AC-43 |
| `scorecard` | `routing_decision` | AC-40 |
| `scorecard` | `answer_outcome` | AC-73 |
| `register` | `register_row` | AC-22, AC-74, AC-75, AC-76 |
| `register` | `register_version` | AC-06, AC-74 |
| `memory` | `question_key` | AC-68 |
| `memory` | `memory_link` | AC-69 |
| `memory` | `alias_row` | AC-69 |
| `memory` | `pull_record` | AC-70, AC-75 |
| `memory` | `asker_scope` | AC-71 |

**Carriers proposed at C4 — now ACCEPTED, and slice-gated.** `02-data-model.md`
§11A and the sections below propose homes for objects Plan.md §4 does not
declare. They were listed separately because *proposed in C4, acceptance
pending* was a different state from *declared* — and a different state again
from *no carrier exists*, which was already true of none of them. **DR-098
accepts the C4 artifact set and DR-099 adopts A-05…A-13 wholesale**, so the
first distinction has collapsed: these are **accepted carriers**. The column
that matters now is the last one — **which slice owns the migration**, because
an accepted table with no owning slice is still an unbuilt table, and `06` §12's
*"an unassigned id is a defect, not a deferral"* has an exact analogue here.

| Schema | Accepted table / field | AC rows | Proposing section · gap · **owning slice** |
|---|---|---|---|
| `core` | `work_item` | AC-04, AC-62, AC-89 | `02` §3.8 · **MOD-4** · **S0** (DDL gates land with the table; the claim commits before any model call) |
| `core` | `semantic_restatement_flag` | AC-25 | `02` §5.6 · **TRACE-8** · **S3** (`FX-PT-FLG`) |
| `evidence` | `query_set`, `query_amendment`, `source_record`, `evidence_item`, `absence_row`, `probe_capture`, `instrument_certification`, `citation_route_record` | AC-23, AC-28, AC-90, AC-91 | `02` §11A.1 · **DM-1** · **S6** (the schema is absent from the migration lineage until then) |
| `critique` | `critique_packet`, `independence_receipt`, `symmetry_diff`, `objection_record` | AC-39, AC-46, AC-66, AC-92 | `02` §11A.2 · **DM-2** · **S8** |
| `valuation` | `value_hinge`, `overlay_run`, `reversal_point`, `sensitivity_record` | AC-29, AC-30, AC-55 | `02` §11A.3 · **DM-2** · **S10** *(schema home is `02`'s to state — §11A.3 names none)* |
| `serve` | `shadow_suppression` | AC-91 | `02` §7.10 · **TRACE-9** · **S6** |
| `serve` | `answer.verdict_unavailable` *(a field, not a table)* | AC-90 | `02` §7.11 · **TRACE-10** · **S5** (`FX-SRV-11`) |
| `ledger` | `JUDGEMENT_SCHEDULED` *(an action-kind member, not a table)* | AC-11 | `02` §11A.4 · **DM-4** · **S0** / **S1** (with the ledger's action vocabulary) |
| `register` | `register_row` *(existing table; the claim-type → composition map's canonical home)* | AC-92 | `02` §9.1 · **DM-3** · **S4** (structure asserted; **contents value pending VG-02**) |

### 5.1 Register rows → AC

The register leg of AC-74/AC-75: a control that must not be a source literal is a
register key, and a key with no consumer is an orphan. Key names are
`05-register-skeleton.md`'s; **values are V's at DR-023 and every row ships
`— none stated`** (AC-76).

| Register key or class | AC rows | Consumer | Source |
|---|---|---|---|
| `nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion` — the **bootstrap** class | AC-01, AC-04, AC-06, AC-61, AC-74, AC-76 | the engine and tooling, read through one loader from `register.bootstrap.json` before the database exists | `05` §5.4a; asserted by `FX-REG-01` |
| the 19 V-owned knob parameters | AC-74, AC-75 | every context that reads a knob | `05` §5.1 |
| the six annexed V-set values | AC-74, AC-75 | as annexed | `05` §5.2 |
| the operator resolution-chain rows (`resolution_scope ∈ deployment \| run \| parent`) | AC-22 | `valuation`, `propagation` | `05` §5.4; `02` §9 |
| the band cut-point matrix (question class × risk tier) | AC-66, AC-74 | `serve` at serve time | `05` §5.1; `02` §7.6 |
| the abstention price cell and the provenance-key width | AC-49, AC-75 | `budget`, `evidence` — **printed where used** | `05` §5.3 |
| `declaredPollInterval`, `paginationLimitMax`, `paginationLimitDefault` | AC-62 | `apps/api` — the declared poll and the keyset page bounds | `05` §5.4 (added under H-C-14); `04` §§4.2/7.3 |
| `convergenceEpsilon` | AC-49 | `budget` — `FX-HR-H8`'s convergence comparison | `05` §5.4 (added under H-C-14) |
| `convergenceStopDefaults` — **one consolidated typed row, members not enumerated** | AC-49, AC-76 | `budget` — H8's remaining stop-condition defaults | `05` §5.4b · **gap `REG-8`**: one typed row vs N stable keys — **pending V at VG-02**, the single gap-register row **no ruling of DR-068…DR-101 touches**. Enumerating invented members would breach AC-76/DR-039 |
| **the rows the rulings created** — the mandatory deployment scoring-operator row (**DR-074**); the independent composition-budget row and its per-tier values (**DR-078**); DR-080's **two mapping tables**; DR-081's `OD-11` layer-2 flip row; DR-082/086's **band label vocabulary and cut points**; DR-085's **empty** tier × claim-type eligibility table | AC-22, AC-24, AC-42, AC-49, AC-53, AC-66, AC-74, AC-75, AC-91 | `propagation` / `valuation` · `serve` · `budget` · `evidence` · `settlement` | **`05-register-skeleton.md`, minted by PRE-03** — *no key spelling is invented here*; **every value is V's at VG-02** (DR-023, AC-76). **DR-096's row is deliberately absent**: there is no verdict-first presentation flag, and a later ticket adding one is a defect |

*Every key above is `05`'s own spelling, and **no value appears here or there**
(AC-76) — the values are V's at DR-023, at ticket **VG-02**.
`convergenceStopDefaults` is the one row whose **member shape** is still open,
and it is the only register question in this index that **no ruling answers**;
it is joined to gap **`REG-8`** so the index and the register agree on where that
choice is tracked. Everything else in the two rows above is a **ruled row
awaiting a value**, which is a different state and is marked as such.*

---

## 6. Reverse index — endpoint / event → AC

**This is the surface leg of spec S-25** — every served surface traces back to a
requirement. A row with no AC would be a served field with no requirement behind
it; a requirement with no row appears in §1's wire-carrier column as `—` with its
reason.

### 6.1 Reads

| Endpoint | AC rows | Tier |
|---|---|---|
| `GET /v1/answers` | AC-53, AC-62 | 1 |
| `GET /v1/answers/{id}` | AC-15, AC-18, AC-51, AC-52, AC-54, AC-55, AC-56, AC-58, AC-63, AC-64, AC-66, AC-86, AC-88, AC-90, AC-91 | 1 |
| `GET /v1/answers/{id}/nodes/{nodeId}` | AC-21, AC-24, AC-25, AC-31, AC-67, AC-92 | 1 |
| `GET /v1/answers/{id}/export` | AC-58, AC-44 | 1 |
| `GET /v1/answers/{id}/ledger-digest` | AC-12 *(the degradation is a thing that happened)*, AC-44 | 1 |
| `GET /v1/answers/{id}/inspection` | AC-07, AC-12, AC-56, AC-57, AC-87 | 2 |
| `GET /v1/numbers/{provenanceRef}/replay` | AC-06, AC-08, AC-10, AC-47, AC-63, AC-86, AC-87 | 2 |
| `GET /v1/answers/{id}/inspection/debug` | AC-16, AC-34, AC-56, AC-77 | 3 |
| `GET /v1/answers/{id}/inspection/prompts` | AC-13, AC-44, AC-56, AC-87 | 3 |
| `GET /v1/nodes/{nodeId}/executions` | AC-44, AC-46, AC-89 | 1 |
| `GET /v1/register` | AC-37, AC-74, AC-75 | 1 |
| `GET /v1/scorecards` | AC-40, AC-41, AC-42, AC-43, AC-73 | 1 |
| `GET /v1/fleet` | AC-62, AC-89 | 1 |
| `GET /v1/session` | AC-57, AC-71 | 1 |

### 6.2 Writes

| Endpoint | AC rows |
|---|---|
| `POST /v1/asks` | AC-38 *(the standard-and-above refusal)*, AC-49, AC-50, AC-83 |
| `POST /v1/nodes/{id}/regenerations` | AC-04, AC-44 |
| `POST /v1/investigations/{id}/executions` | AC-04, AC-44 |
| `POST /v1/answers/{id}/steering` | AC-44 |
| `POST /v1/answers/{id}/memory-link/unlink` | AC-69 |
| `POST /v1/nodes/{id}/feedback` | AC-73 |
| `PUT /v1/register/{key}` | AC-74 |

### 6.3 Events and typed wire shapes

| Surface | AC rows |
|---|---|
| `GET /v1/runs/{id}/events` (SSE, six declared families) | AC-60, AC-61 |
| the mandatory `staleness trigger fired` event | AC-64, AC-72 |
| **the node-lifecycle events** — spawn-time placeholder connection, then generating → being judged → scored (**DR-076**). *Names are minted in `04-api-contract.md` by PRE-02 — none is invented here* | AC-61, AC-64, AC-77 |
| event vocabulary with a declared consumer per name (E1) | AC-61, AC-77 |
| projection-grade payload rule (no bundle-grade material on a stream) | AC-56 |
| the **labeled number** `{value, provenance_ref, replay_handle, kind, source, producer}` | AC-34, AC-63 |
| the **number slot** `PRESENT \| EVICTED \| WITHHELD` | AC-12, AC-22, AC-26, AC-90 |
| the polymorphic edge target | AC-18, AC-19 |
| `band_ceiling {label, basis}` | AC-24, AC-75 |
| two-axis verdict fields with abstention in its own field | AC-66, AC-90 |
| the value hinge's weight union (`{source: none}` with no vector field) | AC-30 |
| the closed typed-error taxonomy | AC-35, AC-86 |
| ~~the consumer manifest (`consumer-manifest.json`)~~ — **removed by DR-069**, which rules the mechanism *"not required"*. AC-61's consumer direction is discharged by the **intra-repo static type-graph pass** (`07` §3.4), which is not a wire shape and so has **no row in this section**. It is **not kept as an optional artifact**: a build input nothing requires is a G5 dead-cost orphan (`FX-ORPH-03`) and a dead check (`FX-ORPH-06`) | AC-59, AC-61 |

---

## 7. Reverse index — slice / fixture → AC

The test leg, in `06-test-strategy.md`'s **`FX-*`** namespace — the only fixture
address the C4 set uses (charter A4.4: each blocking path carries *"a recorded
firing fixture in the acceptance bundle, **named by fixture id**"*). Slices are
Plan.md §8's; entry criteria and the launch-readiness matrix are
`07-build-order.md`'s; the fixtures themselves are `06`'s §§3–11 and its §12
slice map, which this table joins to the constraint base.

**Reconciled this round, under the tie-break `07-build-order.md` §5.1 resolves.**
That resolution **supersedes** `06` §12's ambiguous *"where the two disagree,
matrix A's slice assignment is the one to repair"* and states one owner:
**`07` §5.1 is the operative tie-break, `07` owns fixture-slice assignment, and
`06` §12 is the table repaired when the two disagree** — `06` owns the roster
(existence, id, what a fixture asserts), `07` owns the schedule (slice, entry
criteria, gate force). Landed `06` §12 names the same owner from its side
(*"`07` owns slice assignment … `07` §5.1 is the one to read and this table is
the one to repair"*), so **the two documents are single-voiced**. Applying it
exposed a defect **in this table**: it named
**neither `FX-LG-06` nor `FX-S22-05` in any slice row**, although `06` §12 and
`07` §4/§5 both carry all six of their limbs and although §1's AC-83 cell points
at `FX-S22-05`. **`BUILD-1`'s repair was therefore invisible in the very index
that exists to make such things visible.** Both are now joined limb by limb
(`FX-LG-06`: S0 exhaustive · S5 sampling · S9 frozen-rate; `FX-S22-05`: S0 first
limb · S6 complete 13-row proof · S15 bundle evidence), and **`FX-SRV-16`**'s
two limbs are marked with **S9 as the owning slice**. The thirteen roster ids
`07` §4 had never placed in a slice are also joined here, from `06` §12.
**Every id in this table comes from `06` §12 or `06` §§3–11; none is minted.**

| Slice | Fixture ids (`06` §12) | AC rows evidenced |
|---|---|---|
| **S0** walking skeleton · **entry: GPG-3 / GPG-4 at VG-01; Q-01/02/03 RULED — DR-068 / DR-069 / DR-070** | `FX-SRV-17` · `FX-C52-03` · `FX-SRV-01a` / `FX-SRV-01b` · `FX-SRV-18` · `FX-LG-01a` (**wired**; `job:replay-self-test` is a named entry point from the day it lands) · `FX-LG-02` · **`FX-LG-04`** (kernel membership + count, **five terminal routes**) · **`FX-LG-06`** (stranger coverage **exhaustive, no sampling**) · **`FX-S22-05`** (zero-call proof, first limb — the framing MACHINE rows) · **`FX-HR-H1`** (every model call crosses the one interface) · **`FX-HR-H3`** (purity gate live with `propagation`) · **`FX-LED-04`** (two stamps on every action row) · **`FX-REG-01`** (bootstrap equality, from the first build that reads a pin) · **`FX-REG-02`**'s edge present so `FX-ORPH-01`'s walk sees it · `FX-ORPH-01` / `FX-ORPH-02` (wired and reporting) · **`FX-ORPH-03`** / **`FX-ORPH-06`** (advisory lanes wired, S0 onward) · `FX-DB-07` (carrier) | AC-01, AC-02, AC-09, AC-13, AC-24, AC-36, AC-44, AC-46, AC-51, AC-52, AC-53, AC-65, AC-67, AC-77, AC-83 |
| **S1** ledger and replay hardening | `FX-LG-01b` (ceremony passes **exactly**) · `FX-LG-01a` (hardened: the eviction trigger fires end to end into `FX-SRV-03` / `FX-SRV-05`) · `FX-IND-01` / `FX-IND-02` / `FX-IND-03` · `FX-LED-01a` / `FX-LED-01b` · `FX-LED-02` · **`FX-LED-03`** (`UNCLASSIFIED_ACTION` — the vocabulary limb) · **`FX-LED-04`** (hardened) · `FX-LED-05` · `FX-DB-01a` / `FX-DB-01b` / `FX-DB-02` | AC-05, AC-06, AC-07, AC-08, AC-10, AC-11, AC-14, AC-44, AC-45, AC-46, AC-47, AC-50, AC-74, AC-83, AC-85, AC-88 |
| **S2** graph and the cycle law · **entry: Q-04 RULED — DR-071** (`UNDERCUT_TRANSMISSION` **writable**; the member is live, not "live or removed") | `FX-C52-10` · `FX-DB-03a` / `FX-DB-03b` · `FX-DB-04a` / `FX-DB-04b` · `FX-DB-05a` / `FX-DB-05b` · `FX-DB-06a` / `FX-DB-06b` · `FX-DB-08` · `FX-PT-ORD` | AC-08, AC-15, AC-18, AC-19, AC-20, AC-27, AC-28, AC-32, AC-33, AC-35, AC-69, AC-85 |
| **S3** scoring engine · **entry: Q-05/06/07/08 RULED — DR-072 / DR-073 / DR-074 / DR-075** | `FX-LV-01` / `FX-LV-02` · `FX-LV-03…09` · `FX-PT-D1` / **`FX-PT-D2`** *(rescoped by DR-074: the operator resolves from register rows, never a source literal — the undeclared-parent limb is deleted)* / `FX-PT-D3` · **`FX-PT-FLG`** (AC-25) · **`FX-PT-POS`** (AC-31) · `FX-C52-09` · `FX-HR-H4` | AC-14, AC-21, AC-22, AC-23, **AC-25**, AC-26, AC-29, **AC-31**, AC-63, AC-80 |
| **S4** judge contract and panel · **entry: Q-09 RULED — DR-077** | `FX-S22-01` · `FX-PT-D1` · `FX-LG-15` · `FX-LG-16` · **`FX-HR-H6`** (produced-never-grades limb) | AC-04, AC-21, AC-39, AC-92 |
| **S5** serve pipeline hardened · **entry: Q-10…Q-14 RULED — DR-078 / DR-079 / DR-080 / DR-081 / DR-082+DR-086** | `FX-C52-02` · `FX-C52-08` · `FX-C52-11` · `FX-C52-12` · `FX-SRV-02…16` *(incl. **`FX-SRV-06`**, **`FX-SRV-13`** un-hedged as the capping gate, **`FX-SRV-14`**, and `FX-SRV-16`'s projection limb)* · `FX-SRV-19a…f` · `FX-WIRE-01` · `FX-LG-03` · **`FX-LG-04`** (one abstention kind + several condition marks per answer) · **`FX-LG-06`** (**sampling** limb, constructible under DR-079) · **`FX-PT-D4`** (serve limb) · **`FX-HR-H7`** (Q53 ahead of conformance) | AC-12, AC-16, AC-24, AC-34, AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-62, AC-63, AC-66, AC-75, **AC-86, AC-87, AC-88, AC-89, AC-90, AC-91** |
| **S6** evidence subsystem · **entry: Q-15…Q-19 RULED — DR-083 / DR-084 / DR-085 / DR-087 / DR-088; ratifications at VG-02** | `FX-HR-H5` · `FX-LG-08` · `FX-PT-D3` (against real clusters) · `FX-DEF-01` / **`FX-DEF-02`** (attestations, not fixtures — DR-088 confirms the shape) · `FX-SRV-12` · **`FX-S22-05`** (the complete 13-row zero-call proof) | AC-23, AC-78, AC-83, AC-91 |
| **S7** SPLIT loop and defeaters · **entry: Q-20/Q-21 RULED — DR-089 / DR-090**; **DR-076's spawn half lands here** | `FX-LED-06` · `FX-HR-H3D` · `FX-LG-14` · **`FX-HR-H7`** (skeptic-certification limb) | AC-48, AC-61, AC-83, AC-90 |
| **S8** CROSS · **entry: Q-22/Q-23 RULED — DR-091 / DR-092** | `FX-S22-02` · `FX-C52-04` · `FX-PRV-01a` / `FX-PRV-01b` / `FX-PRV-02` · **`FX-HR-H2a`** / **`FX-HR-H2b`** · **`FX-HR-H6`** (blinding limb) · **`FX-LED-03`** (`UNINSTRUMENTED`-trigger limb) · **`FX-LED-04`** (the two stamps the diff reads) | AC-37, AC-38, AC-39, AC-46, AC-66 |
| **S9** budget and envelope · **entry: Q-24/Q-25 RULED — DR-093 / DR-094; the 71-row split ratifies at VG-02** | `FX-C52-06` *(**LRD-1**: constructible at VG-02's ratification; the fixture must inspect a node)* · `FX-C52-07` · `FX-LG-05` · **`FX-LG-06`** (frozen-rate limb) · **`FX-HR-H8`** *(its remaining constants ride gap **`REG-8`**, the one unruled register question)* · **`FX-DB-07`** (behaviour limb, over the **reachable** supplier set) · `FX-SRV-16` (**owning slice**, per `07` §5.1) | AC-49, AC-50 |
| **S10** value overlay · **owns the `valuation` schema's four tables and their DDL** (gap `DM-2` half; DR-099 A-06) | `FX-LG-07` · `FX-LG-11` | AC-29, AC-30, AC-55 |
| **S11** staleness and liveness | `FX-C52-05` · `FX-LG-12` | AC-05, AC-64, AC-72 |
| **S12** settlement and scorecards · **DR-089's standing settlement watch lands here** (a third `apps/scheduler` job, on the G1 entry-point list, with its own credential scope) | `FX-S22-03` · `FX-PT-D5` *(a real assertion target under DR-077)* · `FX-ORPH-05` · `FX-LG-09` · `FX-LG-10` | AC-40, AC-41, AC-42, AC-43, AC-73, AC-77 |
| **S13** cross-run memory | `FX-S22-04` · `FX-PT-MEM` | AC-68, AC-69, AC-70, AC-71, AC-75 |
| **S14** UI data-layer rebuild · **entry: Q-26/Q-27 RULED — DR-095 / DR-096**; **DR-076's UI half lands here** | `FX-LG-13` · `FX-ORPH-04` *(both AC-61 directions now decided by the **intra-repo static type-graph pass** — `07` §3.4 — and still failing the build on an orphan)* · `FX-WIRE-01` · `FX-SRV-10` · **`FX-PT-D4`** (wire limb) | AC-58, AC-59, AC-60, AC-61, AC-62, AC-84 |
| **S15** launch bundle · **entry: Q-28 RULED — DR-097** (**LRD-2 discharged**); register ratified at VG-02 (AC-74) | the acceptance bundle (`06` §13): `FX-ORPH-02`'s never-called list **BLOCKS** · every `FX-C52-*` present or attested **BLOCKS** · `FX-IND-01/02/03` · `FX-PRV-01a` attestation · `FX-DEF-01` / `FX-DEF-02` · **`FX-S22-05`** (the finished 13-row zero-call proof) · `FX-ORPH-01` (entry-point list walked — **three** scheduler jobs now) · **`FX-ORPH-03`** / **`FX-ORPH-06`** (advisory, reviewed output) · **DR-097's advisory unread-register-key report** *(id minted in `06`'s roster by PRE-03)* · **`FX-REG-01`** (re-asserted against the ratified `register_version`) · **`FX-REG-02`** (the bundle's register read exercised on a real run) · **the static type-graph pass's consumer-direction report** for the pinned contract version *(an artifact, no id — AC-61 after DR-069)* | AC-38, AC-59, AC-61, AC-74, AC-76, AC-77, AC-78, AC-79, AC-81, AC-83 |

**Cross-cutting CI gates** (`06` §14; Plan.md §2.7), which are not slice-scoped:
typecheck · lint (`FX-HR-H3` → AC-09 and `FX-HR-H3D` → AC-48;
`no-source-literal-constant` → AC-74; `require-exhaustive-switch` → AC-35;
`no-unlabeled-number` → AC-63) · unit · property (AC-80) · `db-integration`
(AC-01, AC-02) · `contract` (AC-84) · replay self-test **`FX-LG-01a`** (AC-06) — **`FX-LG-01b` is not a CI stage**, because scheduling the ceremony inside the acceptance job would defeat VR-3 limb (iii) (`06` §14) ·
orphan audit report `FX-ORPH-01` (AC-61, AC-77) · never-called list `FX-ORPH-02`
**blocking** (AC-77) · firing-fixture presence **blocking** (AC-79).

---

## 8. The consolidated gap index

**What this section is, after C4 rework round 1.** The single register of every
gap raised by any C4 lane, under the **global ids** fixed by the merge verdict
(`DM` data model · `MOD` module design · `API` api contract · `REG` register ·
`TEST` test strategy · `BUILD` build order · `TRACE` traceability). Before this
round each lane restarted its own numbering at `G-1`, so one id meant four
different things across the set and no consumer could prove every gap had been
adjudicated once. **These ids are now the stable keys** the FinalPlan
consolidation and the V register consume.

**The index is 39 rows: 38 unique gaps plus one directed item.** The gap ids are
`DM-1…DM-6` (6), `MOD-1…MOD-4` (4), `API-1…API-4` (4), `REG-4…REG-8` (5),
`TEST-1` (1), `BUILD-1…BUILD-4` (4), `TRACE-1…TRACE-10` (10) and `G2-1…G2-5` (5)
— **39 identifiers over 38 gaps**, because `MOD-2 ≡ REG-5` are two ids for one
gap (the `tools/*` → register edge), carried under both so either lane's register
resolves. 38 gaps ⇒ 38 rows, **plus `ADR-0015`, which is the 39th row and is not
a gap**: it is a **directed item** — a FinalPlan/V decision to extend the planned
ADR set by one — and it is labelled as such wherever it appears, because
substituting a directed item for a missing gap is how a gap disappears from a
count that still looks complete. **Every id occurs exactly once** in §8.1, §8.1a
or §8.2. **The identifier set is unchanged by this fold-in: no gap id is minted
and none is retired.** What changed is dispositions — several rows moved from
*pending* to *accepted, owned by a slice* or to *closed by a ruling* — and the
changes are stated per row rather than by editing the count.

**`ADR-0015` is no longer only directed.** DR-099's amendment A-02 **mints it**:
*"The deployment maker inventory: two predicates, not one"* — `deployment_maker_capability`
vs `run_maker_reachability`, owner context 16, decision text at `03` §7.3,
fixtures `FX-PRV-01a` / `FX-PRV-01b`, authority DR-055 / charter S4 / AC-38. It is
authored by ticket **PRE-04**, which also resolves a **numbering collision** the
ledger created: DR-068's and DR-069's affected-rows columns point *"ADR-0015
scope"* and *"an ADR on the repo-layout decision"* at the same number. PRE-04's
resolution — recorded here because this index's readers follow those citations —
is **ADR-0015 = the maker inventory** (A-02's specific, ratified mint) and
**ADR-0016 = "Repository layout: kept UI as a plain in-repo package, no fence"**
(DR-068 + DR-069, including the honour-system trade-off and the *do not re-raise*
direction). **Neither is a gap**; both are directed items now discharged.

*`REG-8` joined at the frozen-loop annex: `05-register-skeleton.md` §§5.4b/7
minted it for this index, and until it was carried here the "every id occurs
exactly once" and 38-row claims were false at the set's current state.*

**Dispositions are the merge node's, not this lane's** (merge verdict §5).
**REAL** = a missing or contradictory contract fact that enters FinalPlan and the
V register, as either a directed repair or an explicit V decision. **MISREAD** =
the cited source already resolves it, or the owning C4 lane holds the choice; a
MISREAD row closes with its citation and is **not** preserved as an open
architecture question. Nothing in this section rules a V-QUESTION.

**What the rulings did to this register, in one read.** **DR-098** accepted the
C4 artifact set and **DR-099** adopted amendments A-01…A-13 wholesale, which is
the FinalPlan acceptance most REAL rows were waiting for. So the rows that read
*carrier proposed in C4, FinalPlan acceptance pending* now read **accepted**, and
the question they raise changes from *will this be accepted?* to **which slice
owns its DDL?** — answered per row below. Three rows close outright
(**`TRACE-7`** by DR-099/A-01 via PRE-08; **`ADR-0015`** by DR-099/A-02 via
PRE-04; **`MOD-2 ≡ REG-5`** by the C4 mechanism DR-098 accepted), and
**`BUILD-1`/`BUILD-2`'s repairs are made visible in §7**, where they were absent.
**One row is untouched by every ruling: `REG-8`**, which rides **VG-02**.

### 8.1 REAL — carried to FinalPlan and the V register

*(§8.1a carries the arrivals that post-date the round-1 merge verdict.)*

| Gap | Subject | Disposition basis | Owner |
|---|---|---|---|
| **DM-1** | No `evidence` schema and no tables for context 2's objects — frozen query sets, typed amendments, admissibility, access depth, absence rows, provenance clusters, freshness, probe capture, instrument certification | Plan.md §3.1 context 2 and §8 S6 require them; Plan.md §4 gives them no carrier. **Carriers proposed in C4** at `02` §11A.1 (`query_set`, `query_amendment`, `source_record`, `evidence_item`, `absence_row`, `probe_capture`, `instrument_certification`, `citation_route_record`) and **ACCEPTED wholesale at DR-098 + DR-099 A-06**. **Now slice-gated: `S6` owns the eight tables, their DDL and their raw-connection migration fixtures** — before this assignment the schema was accepted but had no migration and no owner | lane 3 (proposed) / **accepted at DR-099**; built at **S6** |
| **DM-2** | No tables for `critique` / `valuation` objects — the independence receipt, the symmetry diff, the objection ledger (context 5); hinges, flows, **reversal points**, **leverage and fragility outputs** (context 6) | Plan.md §3.1 contexts 5–6 require replayable records and Plan.md §4 names no home. **Carriers proposed in C4** at `02` §11A.2 (`critique_packet`, `independence_receipt`, `symmetry_diff`, `objection_record`) and §11A.3 (`value_hinge`, `overlay_run`, `reversal_point`, `sensitivity_record`) and **ACCEPTED wholesale at DR-098 + DR-099 A-06**. **Now slice-gated in two halves: `S8` owns the four `critique` tables, `S10` the four `valuation` tables**, each with its DDL and raw-connection fixtures. §1's AC-29 and AC-55 cells name them; the `valuation` tables' schema home is `02`'s to state (PRE-02), since §11A.3 names none | lane 3 (proposed) / **accepted at DR-099**; built at **S8** + **S10** |
| **DM-3** | The claim-type → composition map had no data home | AC-92 / manifest §5.2 require it *held as data, never a source literal*; Plan.md §4 names nothing. **Carrier proposed in C4** at `02` §9.1 — canonical home `register.register_row`, on Plan.md §6.2 AM-3's mapping-as-register-row precedent — and **ACCEPTED at DR-098 + DR-099 A-06**. **Now slice-gated at `S4`**, which asserts the structure (`FX-LG-16`: the map is data, never a source literal); the key name and declared value type are `05`'s, and the map's **contents are value pending VG-02** (DR-023). §2's AC-92 row reads *yes, accepted* | lane 3 + lane 4 (proposed) / **accepted at DR-099**; built at **S4** |
| **DM-4** | The completeness gate's "scheduled" input has no named ledger column | AC-11 defines a required node by a **scheduled** judgement; Plan.md §4.3's action vocabulary supplies no member. **Carrier proposed in C4** at `02` §11A.4 — `JUDGEMENT_SCHEDULED`, a ledger action kind and **not** a served typed state — and **ACCEPTED at DR-098 + DR-099** (A-07 confirmed individually in the same sitting). **Now slice-gated: the member lands with the ledger's action vocabulary at `S0`/`S1`**, where `FX-LED-01a`/`01b` and `FX-LED-03` assert against it | lane 3 (proposed) / **accepted at DR-099**; built at **S0** + **S1** |
| **MOD-2 ≡ REG-5** | `tools/*` may depend only on `kernel` and `contract`, yet S15 requires `tools/acceptance-bundle` to **present the register** | Plan.md §2.6's edge list contradicted §8 S15. **Resolved in C4 and accepted at DR-098**: the mechanism chosen is a **declared read-only `register` edge** (`03` §3.1 row 27), **not** an artifact input and **not** a register-export artifact. It is fixtured at both ends — **`FX-REG-02`** asserts the edge is *exercised on a real bundle run* (S15, edge present from **S0** so `FX-ORPH-01`'s walk sees it) and **`FX-REG-01`** asserts bootstrap equality. *A `tools/*` edge no run traverses would itself be an `FX-ORPH-02` entry, which is why the fixture asserts exercise rather than existence* | lane 4 (edge list) / **accepted at DR-098** |
| **API-1** | `GET /v1/nodes/{nodeId}/executions` is unbounded | AC-62 requires **real pagination** and AC-44 makes the execution record unbounded; keyset semantics must be added. **ACCEPTED at DR-099** (A-11, executions pagination, adopted wholesale). **Residue named so it is not lost: the endpoint has no fixture id anywhere** — `06` §15's roster carries none for it — so PRE-03 mints one and PRE-02 confirms the keyset shape; until then §1's AC-62 cell reads *pagination limb pending `API-1`* | lane 5 · id minted by **PRE-03** |
| **BUILD-1** | The **zero-call proof** has no owning slice | Spec §22.1 / DR-037 make it a launch gate; Plan.md §8 assigned no slice. **REPAIRED and now visible in all three documents**: `06` §12, `07` §4/§5 and — as of this fold-in — **§7 above**, which named `FX-S22-05` in no slice row at all. Limbs: **S0** (the framing MACHINE rows) · **S6** (the complete 13-row proof) · **S15** (bundle evidence) | lane 7 — **closed** |
| **BUILD-2** | **P-D4** has no owning slice | Charter S2 and manifest §12.2 require P-D1…P-D5; Plan.md §8 named D1–D3 and D5 only. **REPAIRED**: **`FX-PT-D4`** at **S5** (serve limb) and **S14** (wire limb), now carried in §7's rows as well as in `06` §12 and `07` §5 | lane 7 — **closed** |
| **TRACE-5** | **AC-25 and AC-31 had no fixture** — the restatement flag changing no number, and no factor re-encoding graph position | Both are machine-checkable invariants that had no assertion anywhere in `06`. **CLOSED this round**: lane 6 minted **`FX-PT-FLG`** (AC-25) and **`FX-PT-POS`** (AC-31), both at **S3**; §1 and `00`'s spine point at them | lane 6 — **closed** |
| **TRACE-7 ≡ H-C-1** | **The terminal-route count** | `requirements-spec.md` §5.2 and **DR-037** enumerate **five** (including depth-zero); spec §12.3's Home-3 table lists four; Plan.md AC-65 copies four. The ledger wins: **five**. `00` §4.1's note carries the unified reading; `02`'s enum inventory and `FX-LG-04` carry the same list. **The founding-table correction was a directed FinalPlan / V item; it is now RATIFIED and being applied.** **DR-099 ratifies A-01 individually** — *"five terminal routes + founding-table correction authorized"* — and ticket **PRE-08** applies it: the depth-zero no-split route is added to `requirements-spec.md` §12.3 Home 3 so the table lists **five**, annotated with its DR-037 + DR-099/A-01 authority and an edit note, and **that is the single authorized founding-doc edit**. On landing, AC-65's count, `kernel`'s transcription target and `FX-LG-04`'s membership-and-count assertion agree end to end, and **`TRACE-7 ≡ H-C-1` is DISCHARGED** (with it, the residual risk that rode the mismatch). *Until PRE-08 lands, the ledger still wins: five* | lanes 1, 3, 6 repaired; **ratified at DR-099**, applied by **PRE-08** |

**Also REAL, and subsuming DM-1 / DM-2:** the Opus lens's finding that **slices
S6, S8 and S10 have no data-model home at all** (merge verdict §5 headline).
**Now answered in both halves**: the carriers are **accepted** (DR-098 + DR-099
A-06) and each has an **owning slice with a DDL gate** — `S6` the eight evidence
tables, `S8` the four critique tables, `S10` the four valuation tables. The
headline finding is discharged; what remains is ordinary build work with a named
owner, which is exactly what the finding asked for.

#### 8.1a Post-round arrivals

Gaps raised by an owning lane **after** the round-1 merge verdict was written, so
they carried no merge-node disposition. Each is recorded with the resolution its
owning lane applied **and with what DR-098/DR-099 then did to it**, so a reader
adjudicates a current picture rather than a stale one. **None is disposed by this
lane** — the dispositions below are V's, in the ledger.

| Gap | Subject | Status as recorded by the owning lane | Owner |
|---|---|---|---|
| **API-4** | Two served surfaces the context map did not name: **`GET /v1/fleet`** and **`GET /v1/session`** had no owning context | **REAL, resolved at `03-module-design.md` §4.4**: fleet state is owned by **`battery`** — a read-time projection over the work-claim rows sequencing already owns, reached through `apps/api`'s existing edge, **no new edge**; `GET /v1/session` is owned by **`apps/api`**, the principal the front door authenticates — and **Q-03 is RULED at DR-070**: the asker is the requesting user/person, V2's `user_dev_token` slice adopted, authorization out of scope for this stage. **Also accepted at DR-099** (A-08, fleet/session owners). **Residue named: `GET /v1/session` has no fixture and no slice** — PRE-02 assigns it, at **S0**, with the `user_dev_token` adoption | lane 4 (resolved) / lane 5 for the endpoint half · **accepted at DR-099** |
| **MOD-4** | The **Postgres-backed work-claim queue** (Plan.md §2.7) has no table and no schema home in Plan.md §4, yet three units read or write it — `apps/runner`, `apps/scheduler`'s `job:reaper`, and the fleet projection | **REAL, both halves now proposed**: the owning **package** is `battery` (`03` §4.4, §9.2, lane 4's authority) and the **table is proposed in C4** as `core.work_item` — the one mutable operational table, its history the ledger (`02` §3.8). **ACCEPTED at DR-098 + DR-099 A-05.** **Now slice-gated: `S0` owns `core.work_item` and its DDL gates** — the invariants live in the creating migration and the claim **commits before any model call** (ADR-0009). One owner throughout: `battery` owns the queue state, `apps/runner` executes, `apps/scheduler` reaps, the fleet read projects | lane 3 + lane 4 (proposed) / **accepted at DR-099**; built at **S0** |
| **REG-7** | The four runtime/tool pins were one prose aggregate with no stable keys, and tooling had no way to read the register before the database exists | **REAL, mechanism resolved at `05-register-skeleton.md` §5.4a**: four stable keys — `nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion` — each `resolution_scope` marked **`bootstrap`** and readable from `register.bootstrap.json` through the same loader. **Mechanism ACCEPTED at DR-099** (A-09, bootstrap register path). **Values remain V's at DR-023** and every row reads `— none stated` (AC-76) — they are **GPG-3's content and are owed at ticket VG-01**, which is one of the two gates still blocking S0 (`07` §3.1) | lane 4 (mechanism, **accepted**) / **V at VG-01** (values) |
| **TRACE-8** | AC-25's restatement flag had no data carrier | **REAL**, raised by this lane under H-O-5. **Carrier proposed in C4**: `core.semantic_restatement_flag` (`02` §5.6), append-only and structurally excluded from evaluation inputs. **ACCEPTED at DR-098 + DR-099 A-13** (the TRACE-8/9/10 carriers, adopted wholesale). **Slice-gated at `S3`**, where `FX-PT-FLG` asserts the flag changes no number and the flag is structurally excluded from the evaluation snapshot. *(The **fixture** half was already closed — `FX-PT-FLG`.)* | lane 3 (proposed) / **accepted at DR-099**; built at **S3** |
| **TRACE-9** | AC-91's shadow-mode record had no data carrier | **REAL**, raised by this lane under H-O-5. **Carrier proposed in C4**: `serve.shadow_suppression` (`02` §7.10), append-only and distinct from `segment_suppression`. **ACCEPTED at DR-098 + DR-099 A-13**; **slice-gated at `S6`**, the slice that owns the evidence gate. Eligibility and the risk-tiering trigger are **RULED at DR-085** (U-2): tier-invariant shadow mode, eligibility the exact complement of §5.2(f)'s evidence-free list, the tier × claim-type map an **empty register table** whose contents are **value pending VG-02** | lane 3 (proposed) / **accepted at DR-099**; built at **S6** |
| **TRACE-10** | AC-90's typed `unavailable` verdict had no data carrier | **REAL**, raised by this lane under H-O-5. **Carrier proposed in C4**: `serve.answer.verdict_unavailable {reason_ref}` (`02` §7.11) — an optional typed field, not a table; when present neither `verdict_state` nor the band is populated. **ACCEPTED at DR-098 + DR-099 A-13**; **slice-gated at `S5`**, with `FX-SRV-11` asserting all three limbs. The one thing acceptance did **not** settle: whether the token needs placing in spec §12.3 when it surfaces to a reader — **spec §12.3 remains the only mint (AC-65, S-13)** and any such placement is an amendment V makes, exactly as DR-084 requires of the citation routes | lane 3 (proposed) / **accepted at DR-099**; built at **S5** |
| **REG-8** | **`convergenceStopDefaults`' member shape** — `FX-HR-H8` names *"epsilon **and defaults**"* as register rows; the pack names **epsilon** singly and the **defaults** collectively, and names **no member** of that set | **REAL**, raised at `05-register-skeleton.md` §5.4b under H-C-14 — a **cross-lane naming choice, not a value question**. §5.4b's choice is **one consolidated typed row** whose members are **not enumerated**, because minting a key per imagined stop condition would invent controls the pack never named (AC-76, DR-039) and an invented key is worse than a missing one, since a builder will implement against it. **Open:** whether it stays one typed row or becomes **N stable keys** — the question is *which document gets to name the members*, not what their values are. **Blocks `FX-HR-H8`'s constants** until ruled, and therefore **S9's exit**; **no value is at stake either way** | `06-test-strategy.md`'s H8 owner + lane 4 · **PENDING V at VG-02** — *the only row in this register that **no ruling of DR-068…DR-101 touches**, and the only reason it is still open is that it is a naming choice rather than a value* |
| **G2-1** | Plan.md §7 row 2 gives the fourteen ADRs as an unnumbered prose list with no titles; the `ADR-0001..0014` numbering and kebab titles are lane 2's | **STANDS** — a naming decision the contract does not make; cross-references depend on the numbers, so renumbering is not free. **Sharpened this round**: the set is now **sixteen** (ADR-0015, ADR-0016), and the ledger itself pointed **two different decisions at the number 0015** (DR-068/DR-069's affected-rows columns vs DR-099's A-02), which PRE-04 resolves with a renumbering note in `01-decisions/README.md` so both citation paths resolve. *That collision is the concrete cost this gap predicted* | lane 2 / **numbering resolved by PRE-04** |
| **G2-3** | The planned ADR set names **Seam A only**. Seams B, C and D are decided **inside** other ADRs rather than as addressable decisions, and **AC-38's deployment half has no ADR at all** | **PARTLY DISCHARGED.** Extending the planned set was not a lane's to do; **DR-099 (A-02) does it**, and **ADR-0015 is the addressable ADR AC-38's deployment half lacked** (authored by PRE-04). The **Seams B / C / D** half **STANDS**: those decisions are still made inside other ADRs rather than as addressable ones, which is a findability cost, not a missing decision | lane 2 / **A-02 discharged the AC-38 half at DR-099** |
| **G2-4** | Two contested items have no ADR in the planned fourteen — AC-11's *"required node"* predicate and AC-24's band-ceiling carrier | **STANDS** — both were rework-round repairs, both are referenced from the ADR set and decided in neither. Both are carried in §1 to their own documents (`02` and `04`) | lane 2 / FinalPlan |
| **ADR-0015** *(directed item)* | *"The deployment maker inventory: two predicates, not one"* — a **directed FinalPlan / V item** to extend the planned ADR set by one, recorded at `01-decisions/README.md` §2 | **MINTED — DR-099 (A-02), authored by ticket PRE-04.** Lane 2 had declined to mint it for a scope reason rather than a merit reason (Plan.md §7 row 2 fixes the set at fourteen); **V's ratification supplies the authority lane 2 lacked**, so the set is fourteen **plus two**: ADR-0015 (maker inventory — `03` §7.3, fixtures `FX-PRV-01a`/`01b`, DR-055 / charter S4 / AC-38) and **ADR-0016** (repository layout: kept UI as a plain in-repo package, **no fence** — DR-068 + DR-069), which PRE-04 mints to resolve the ledger's collision on the number 0015. **Gap `G2-3`'s "AC-38 has no ADR at all" is answered by ADR-0015** | **DR-099 / PRE-04 — discharged** |

### 8.2 MISREAD — closed with their citations

Listed because a closed gap must be provably closed, not silently dropped.

| Gap | Closing citation |
|---|---|
| **DM-5** (`answer_index` table vs view) | Plan.md §7 row 3 assigns lane 3 the table shapes and canonical ownership; AC-85/AC-88 already rule out an independently writable copy. **A lane design choice, not a V gap** — §5's table inventory follows lane 3's chosen kind |
| **DM-6** (the eight citation routes) | Plan.md §6.1 OQ-G10 made membership and ownership **pending V — Q-16**; carrying no invented members was correct. **Q-16 is now RULED at DR-084**: architecture proposes the closed enum (ticket **PRE-07**), **V ratifies** (at **VG-02**), failure is **loud with no generic "other"**, and any member surfacing to a reader is placed in spec §12.3 **by amendment** so S-13's single-mint law holds. Still MISREAD as a gap; the membership is now a scheduled ratification rather than an open question |
| **MOD-1** (row-19 dependency expansion) | Plan.md §2.6 puts the authoritative edge list in `03-module-design.md`; the expansion is the lane's assigned work |
| **MOD-3** (first arrow-order owner) | Plan.md §3.2: `graph` builds the evaluation snapshot **containing** the order and `propagation` consumes it — production ownership is `graph.materialiseSnapshot` |
| **API-2** (Investigation endpoint) | Plan.md §5.2 already carries the Investigation listing as an Answer tier-1 projection |
| **API-3** (three serve records vs two surfaces) | ui §1.2 records lifecycle/status while §4.0 defines two rendering surfaces; `RECOMPOSED_ONCE` projects to composed without minting a third surface |
| **REG-4** (charter A5.2 over an ordering) | A5.2 says provisional **number**; extending it to a provisional ordering is a new **SEAT-PROPOSAL**, not existing law |
| **REG-6** (`stage11Rollout`) | The authority rule plus DR-061 `OD-S-01` resolves the stale spec row to phased; Plan.md FLAG-3 already records it |
| **TEST-1** (zero-strength-source exclusion) | Plan.md §7 row 7 requires the manifest's generator preconditions and exclusion sets **in full**; carrying all six is correct |
| **BUILD-3** (review count 12 vs 19) | An arithmetic error in a review, not a Plan gap; Plan.md §6.8's enumerated rows and the 28-question index govern |
| **BUILD-4** (Q-03 absent at S13) | Q-03 is a hard **S0** entry criterion and S13 follows S0; a frozen prerequisite is not re-gated downstream. **Q-03 is now RULED at DR-070**, so the prerequisite is supplied rather than merely frozen |
| **G2-5** *(lane 2)* | *"Toolchain-version register keys are owed by `05-register-skeleton.md`."* **WITHDRAWN as lane 2's own MISREAD** per H-O-15, verified at `01-decisions/README.md` §3: `05` already carries the runtime/tool version pins, values `— none stated`, cited to AC-74/AC-76 and Plan.md §2.2/§2.7 — so ADR-0001's and ADR-0012's version-pinning claims have a real landing place. `05` §5.4a has since split them into four bootstrap-class keys (**REG-7**) |
| **G2-2** *(lane 2)* | The packet's authoring law 5 asks for `Q-nn` addresses but Plan.md never mints a `Q-nn` sequence — the mapping existed only in `08`. **Closed at round 1 by H-C-3**: `Q-nn` is now the primary address across the set, with each lane carrying its own mapping |
| **TRACE-1** *(was this document's G-1)* | **`FX-SRV-10` exists** (`06` §9.5): the reaper-writes / read-derives pair for AC-89 × AC-62, disposed at Plan.md §6.6 UI-13. The earlier claim that AC-89 had no fixture was **wrong**; §1.6 and §2 now point at the id |
| **TRACE-2** *(was this document's G-2)* | **`FX-SRV-11` exists** (`06` §9.5) and carries the no-live-node limb verbatim. Same correction |
| **TRACE-3** *(was G-3)* | AC-03 is a repository-scope negative; the absence of a V2 migration path plus AC-80's prohibition on any V2 conformance test **is** its acceptance form |
| **TRACE-4** *(was G-4)* | AC-15 / AC-17 / AC-82 and AC-85's structural limb are enforced by context, dependency-graph and repository assertions; §1 traces them to those CI/static artifacts rather than to runtime fixtures |
| **TRACE-6** *(was G-6)* | Plan.md §2.6 assigns checkout separation and role governance **because** CI cannot prove a reading prohibition; §1 traces AC-81 to a launch attestation |

### 8.3 Rows with no `FX-*` address, and why

Every row in §1 whose fixture cell is not an `FX-*` id, so a release reviewer can
tell an unasserted constraint from one asserted by a non-fixture artifact.

| Class | Rows | Why |
|---|---|---|
| **Structural, asserted by the dependency graph / context map / repository** | AC-15, AC-17, AC-82, AC-85's structural limb | **TRACE-4** MISREAD: the artifact is a CI/static assertion, not a runtime fixture |
| **Unfixturable by ruling** | AC-81 | **TRACE-6** MISREAD: manifest §14's violation is a *reading* violation; the artifact is a launch attestation |
| **Acceptance-bundle items, not fixtures** | AC-78 | `FX-DEF-01` / `FX-DEF-02` — NOT-SHIPPED attestations, which A4.4 distinguishes from firing fixtures. *(AC-74 and AC-76 left this class this round: `FX-REG-01` and `FX-REG-02` now address them.)* |
| **A discipline over all fixtures, not a fixture** | AC-79 | Its artifact is `06` §8's **fire-both-ways register** — every `a`/`b` pair in the roster — plus the **blocking** firing-fixture-presence CI gate (charter A4.4, VR-1/VR-5). It has no id of its own because it is the rule the ids are built to satisfy |
| **Asserted inside a broader gate** | AC-01, AC-02 (CI `db-integration`), AC-16 (`FX-ORPH-01`), AC-71 (`FX-S22-04`), AC-84 (CI `contract`) | The constraint is covered but has no dedicated id; named here so the coverage is visible |
| **No acceptance form by nature** | AC-03, AC-73 | AC-03 per **TRACE-3**; AC-73's read-back verification is recorded as its own ledger action and has no dedicated id in `06`'s roster |

### 8.4 The ruling register — every question, the DR that closed it, and what is still owed

*(Was: "Rows whose behaviour is pending V". **All 28 questions are RULED**, so
this table no longer records what is waiting — it records **what was decided**,
the AC rows the decision reaches, and the residue, if any, that rides **VG-01**
or **VG-02**. `Q-nn` is `08-open-questions-for-V.md`'s numbering, with Plan.md
§6's id in parentheses. **Nothing is ruled here** — every ruling is V's, in the
decisions ledger.)*

| Question | Ruling | AC rows reached | What the ruling requires | Residue |
|---|---|---|---|---|
| **Q-01** (AQ-2) — may kept UI source be carried? | **DR-068** | AC-59, AC-81 | **Yes.** The repository decision precedes the first commit; S0 scaffolds accordingly | — |
| **Q-02** (AQ-3) — the clean-room fence | **DR-069** | AC-59, AC-61, AC-81 | **NO FENCE** — a plain, always-visible in-repo package. **DR-003's clean-room mandate has no enforcement mechanism: compliance is an honour system.** Priced and accepted as a trade-off; **do not re-raise** | AC-61's consumer direction re-routed to the **static type-graph pass** (`07` §3.4) |
| **Q-03** (AM-12) — what an "asker" is | **DR-070** | AC-57, AC-71 | **The requesting user/person.** No separate principal/session model; authorization and credentials **out of scope for this stage**; V2's `user_dev_token` slice adopted | **Provisional** — carry the A5.2-style revisit note; real principal/session separation may be needed before a multi-tenant or credentialed launch |
| **Q-04** (A-1) — the undercut's arithmetic | **DR-071** | AC-18, AC-19, AC-27 | **`transmission-reduction`**, computed in the pure core, **recorded per edge**; `UNDERCUT_TRANSMISSION` **writable**; the `OD-06` producer set goes two → three | — |
| **Q-05** (A-3) — lifting composition order | **DR-072** | AC-21, AC-29 | **Folder-lift first, then `OD-02`'s judged-ancestor lift**; both-ends markers in both cases | — |
| **Q-06** (A-4) — collapse over attacks | **DR-073** | AC-23 | **Both polarities.** Key from evidence provenance + producing run/model-family; **no resolvable key ⇒ clusters alone** | — |
| **Q-07** (A-8) — the deployment operator | **DR-074** | AC-22, AC-26, AC-74 | **Mandatory, never blank**; parent/run overrides optional; **the declare/withhold machinery is deleted**; `FX-PT-D2` rescoped to *the operator resolves from register rows, never a source literal* | The `WITHHELD`-for-undeclared-operator branch is **unreachable code to remove** (AC-77) |
| **Q-08** (A-9) — the `pending` node | **DR-075** *(+ amendment **DR-076**)* | AC-21, AC-61, AC-64, AC-86 | A `pending` node **is** an unjudged interior node; **placeholder arrows are live endpoints**; serving a placeholder as a claim stays forbidden. DR-076 adds **spawn-time connectivity and a live, observable lifecycle** | DR-076's **event names** are minted at `04` (PRE-02), under E1/E2 |
| **Q-09** (U-4 ≡ A-6) — what judge weight multiplies | **DR-077** | AC-21, AC-92 | Weight **multiplies the served arithmetic** through **selection**, under a declared rule, **never averaging**; **dispersion served separately** | Composition-map **contents** at VG-02 |
| **Q-10** (OQ-G3) — the composition-bundle budget | **DR-078** | AC-53, AC-74, AC-75 | An **independent register row** (so `DEFECT` ≠ `ENVELOPE_EXHAUSTED`), **user-facing as a low/medium/high tier the asker picks per run** | **Per-tier values at VG-02** |
| **Q-11** (AM-1) — the non-node senses of "load-bearing" | **DR-079** | AC-51, AC-67 | The projection rule from the charter's node definition; **sampling becomes legal at S5** | — |
| **Q-12** (AM-3) — the three closed sets of six | **DR-080** | AC-42, AC-49, AC-65, AC-74 | **Three separate vocabularies** + **two register mapping tables** | **Table contents at VG-02** |
| **Q-13** (U-1) — `OD-11` layer-2 activation | **DR-081** | AC-74 | Behind **a register row V flips**; layer 1 default; **both states testable before the flip**; nothing ships dark | The **flip row's value** at VG-02 |
| **Q-14** (AQ-1) — the band rule | **DR-082** (i) **+ DR-086** (ii) | AC-24, AC-66, AC-75 | A **second, independent gate**, not a restatement; firing **caps the band** — serves, cannot reach the top band, visible label, recorded lift path — and **never silently blocks** | **Label vocabulary + cut points at VG-02** |
| **Q-15** (OQ-G9) — the activation table | **DR-083** | AC-83 | **Re-derived and ratified in-repo** as a per-row contract field with a written predicate; spec-summarised predicates file **`POLICY_BLOCKED`**, loud; **no import of the old artifact** | 71-row table drafted by **PRE-05**, ratified at **VG-02** |
| **Q-16** (OQ-G10) — the citation routes | **DR-084** | AC-65, AC-78 | **Architecture proposes the closed enum, V ratifies**; loud failure, **no "other"**; reader-surfacing members go to spec §12.3 **by amendment** | Enum drafted by **PRE-07**, ratified at **VG-02** |
| **Q-17** (U-2) — the evidence gate's eligibility | **DR-085** | AC-91 | **Tier-invariant with shadow mode**; eligibility = the exact complement of §5.2(f)'s evidence-free list; the map is an **empty register table** | **Map contents at VG-02** (or deliberately left empty, with shadow mode standing) |
| **Q-18** (A-7) — `mixed` / `unknown` / `value-laden` | **DR-087** | AC-91, AC-92 | `mixed` and `unknown` are **evidence-gated, fail-closed**; **`value-laden` is a cross-cutting flag, not a claim type** — `OD-16` stays closed | New claim-record field lands at **S6** |
| **Q-19** (charter §9 item 6) — auto-activation | **DR-088** | AC-78 | **Counts as shipped dark; the charter's not-shipped rule wins.** The gate is **written when the matcher validates, never shipped inert**; the **NOT-SHIPPED attestation stands** | — |
| **Q-20** (AM-10) — WAIT semantics | **DR-089** | AC-77, AC-83, AC-88 | **The WAIT drain law**: nothing waits at completion; the run records a **typed terminal state**; Q61 becomes a **post-completion settlement watch outside the run lifecycle** | New scheduler job **on the G1 entry-point list**, with its **own credential scope** |
| **Q-21** (AM-14) — rival-carver selection | **DR-090** | AC-38, AC-41 | **Maker-diversity floor alone**; "measured behavioural difference" **recorded as unavailable, never approximated**; a future metric is a register/scorecard upgrade | — |
| **Q-22** (AM-2) — the CASUAL blind-verification trigger | **DR-091** | AC-29, AC-38 | The **CROSS-entry leverage snapshot**, pure-core, no model calls, recorded as the **trigger's basis**; COMPOSE-time recomputation authoritative. **The proxy is explicitly authorized** | The basis is a **trigger basis, never a score input** (AC-29) |
| **Q-23** (AM-4) — the Q34 diff population | **DR-092** | AC-46 | **Item-scoped actions only**; pre-item excluded **by kind, never by value**, so **`UNASSIGNED` stays a real signal**; A-12's launch fixture passes as designed | An action-kind classification attribute is owed at `02` (PRE-02) |
| **Q-24** (OQ-G2) — the correctness/enrichment split | **DR-093** | AC-49, AC-74 | **Architecture proposes all 71 rows, V ratifies once**; design-time config, **no human in any user's loop**; **until ratified, rows behave as correctness** | Split drafted by **PRE-06**, ratified at **VG-02**; **LRD-1** constructible then |
| **Q-25** (AM-5) — who sets the risk tier | **DR-094** | AC-38, AC-49, AC-50 | **The asker declares; deployment policy may RAISE, never lower**; `tier_source` recorded and printed | Audit `DERIVED` for reachability — an unreachable member is an AC-77 orphan |
| **Q-26** (C5) — "kept component" | **DR-095** | AC-58, AC-59 | **Kept surface, rebuilt insides.** Pages, canvas, drawers, badges, navigation stay; **W8/W10 are buildable**; each altered component approved at its **mockup review** (DR-064) | The 30 delegated presentation cells are V's, at the mockup reviews |
| **Q-27** (C8) — a verdict-first flag | **DR-096** | AC-58, AC-74 | **No such flag.** The banner renders unconditionally; **the register carries no such row**, deliberately | A later ticket adding the row is a **defect**, not a feature |
| **Q-28** (charter §9 item 7) — unfilled keys as orphans | **DR-097** | AC-74, AC-77 | Register rows are **outside clause 4's orphan reach** — data, not code; **AC-74 governs**. **LRD-2 discharged** | **Plus** a new **advisory unread-key audit lane** at S15; its id is minted by PRE-03 |

**What is genuinely still owed, and by whom** — the short list this table exists
to produce, because *"all 28 ruled"* is not the same as *"nothing is owed"*:

| Owed | Owner | Blocks |
|---|---|---|
| **GPG-3** — values for the four bootstrap-class keys | **V, at VG-01** | **S0**, and therefore everything |
| **GPG-4** — the initial `packages/contract` and `register_version` identifiers | **V, at VG-01** | **S0** |
| The **register's values** — DR-078's tiers, DR-080's two tables, DR-081's flip row, DR-082/086's labels and cut points, DR-085's eligibility map, the composition map's contents | **V, at VG-02** (DR-023, AC-76) | **S5**, **S6**, **S12** behaviour that reads them |
| The **three ratification packages** — DR-093's 71-row split, DR-084's eight routes, DR-083's activation table | drafted by **PRE-06 / PRE-07 / PRE-05**, ratified by **V at VG-02** | **S6**, **S9**, and **LRD-1** |
| **`REG-8`** — `convergenceStopDefaults`' member shape | **V/FinalPlan at VG-02** | `FX-HR-H8`'s constants, and **S9's exit** |
| The **register ratified before production** (AC-74) | **V** | production, not S15's assembly |

**Nothing in that list is an architecture question.** Every one is a value, a
version, or a ratification act the pack already routed to V — which is what
DR-100 means by the architecture loop being closed.

---

*End of `09-traceability.md` — ARCH-V3-R1 / C4 lane 1, authored 2026-08-05
against Plan.md rev 3; folded to post-ruling state 2026-08-06 under PROG-V3-R1
ticket PRE-01. The architecture is **accepted** — VS-1 ratified (DR-098),
A-01…A-13 accepted (DR-099), ARCHITECTURE SATISFIED emitted (DR-100). All 28
questions are ruled (DR-068…DR-097); §8.4 is the register of those rulings and of
the values, versions and ratification acts that remain V's at **VG-01** and
**VG-02**. This index still rules nothing and mints nothing — every fixture id is
`06` §15's, every register key is `05`'s, every typed state is spec §12.3's.*

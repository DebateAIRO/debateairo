# 02 — Data model

ARCH-V3-R1 / C4 · 2026-08-05, **revised 2026-08-06 at the DR-100 fold-in** ·
authored from `docs/missions/2026-08-05-v3-architecture/architecture/Plan.md`
**rev 3**, §4 in full (including §4.1a and §4.4's eviction rule), with §2.4,
§3.2 Seams A and D, §6 and §8 consumed only where §4 points at them.

**Accepted architecture.** The provisional banner this document carried is
removed under **DR-098** (the C2 repairs and the C4 artifact set ratified),
**DR-099** (amendments A-01..A-13 accepted) and **DR-100** (ARCHITECTURE
SATISFIED; the fold-in of DR-068..DR-097 is the named mechanical
follow-through). Where a ruling and the older text disagree, **the ruling
wins** — the ledger is
`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md`.

---

## 0. How to read this document

**What it is.** Per-schema table shapes, keys, constraints, the indexes the plan
names, the append-only mechanics, partitioning, archival and revival, migration
policy, and **the DDL home of every write-time invariant (AC-32) with its named
canonical owner** — plus the closed-enum inventory with a single source per
enum. Scope is Plan.md §7 row 3.

**What it also carries, added at C4 rework round 1 and ACCEPTED at DR-099.**
§11A carries the objects Plan.md §4 declared no home for — context 2's evidence
objects (slice S6), context 5's and context 6's (S8, S10), and the ledger action
member AC-11's completeness predicate needs — and **§3.8, §5.6, §7.10 and
§7.11** carry four more in their own schema sections (the work-claim queue, F1's
semantic-restatement flag, AC-91's shadow-mode record, AC-90's typed
`unavailable` verdict). These were SEAT-PROPOSAL and FinalPlan-bound at
authoring; **DR-099 ratifies all thirteen FinalPlan amendments, A-05, A-06,
A-07 and A-10 among them, so every carrier in that list is accepted
architecture** and the matching gaps close in §19. What remains V's is what the
ledger still routes to a later sitting: the register **values** (DR-023), the
DR-093 correctness/enrichment split, and the DR-084 citation-route membership.

**What it is not** (Plan.md §7 row 3's out-of-scope column): **no ORM code and
no full DDL listings** — those live in the migrations. Where a constraint
*expression* appears below, it appears because the expression itself is the
normative content (the null-safe non-blank check, the undercut's composite
foreign key, the `strength_source` fence), not as a substitute for the
migration.

**Authority.** Plan.md rev 3 is the contract. `AC-nn` ids are Plan.md §1's
consolidated constraint base, each of which carries its own founding-doc or
ledger citation there; `DR-001..DR-067` are `docs/founding/decisions-ledger.md`
and **`DR-068..DR-101` are
`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md`**; `spec`,
`manifest`, `ui`, `charter` are the founding documents named in Plan.md's
reading contract. **A normative sentence here with no citation is a defect**,
which is Plan.md's own law applied to its own artifacts.

**Status.** Plan.md was **SEAT-PROPOSAL throughout**; **DR-098/DR-099/DR-100
ratify the C4 artifact set and the thirteen FinalPlan amendments**, and
**DR-068..DR-097 rule all 28 open questions** (30 rulings — Q-08 and Q-14 each
yielded two). The `pending V — Q-nn` markers this document carried are therefore
**discharged**: each is replaced by the ruling that closed it, cited by `DR-nnn`.
**§18 is now the disposition table** — every question this document touched, the
ruling that closed it, and what the ruling changed here. Three things stay
V's and are marked as such rather than as open questions: **register values**
(DR-023, AC-74/AC-76), the **DR-093** correctness/enrichment split, and the
**DR-084** citation-route membership. V still ratifies the stack (DR-005 as
narrowed by DR-024).

**Numbers.** No invented numbers (DR-039, AC-76). Every constant below is either
quoted from the pack with its citation or named as a register key whose value is
V's at DR-023 (AC-74).

**For a reader with no project history.** V3 keeps one PostgreSQL database
(AC-01). Everything a run does is written into it: the *run* itself and what it
froze at the start; the *graph* of claims and the typed arrows between them; the
*ledger* of everything that executed; the *serve artifacts* — the frozen bundle
of facts an answer was written from, the text, the conformance verdict and every
number that reached a reader; the *register* of constants; the *memory* links
between runs; and the *liveness* marks that say whether an answer has gone
stale. Two properties shape almost every table. **Nothing is ever deleted**
(AC-05): retirement is archival, and a table that looks mutable is either
append-only or versioned with the old row kept (AC-45). And **every number
carries its origin in the same row it lives in** (AC-34): the join to provenance
cannot be forgotten, because there is no row where the number sits alone.

---

## 1. The store in one picture

One PostgreSQL database, **namespaced schemas, one migration lineage** — schemas
rather than databases, so AC-02's "one store, multiple indexes" is enforced by
the deployment and not by discipline (Plan.md §2.4; AC-01, AC-02). There is no
second store for observability (AC-01).

| Schema | Holds | Plan.md |
|---|---|---|
| `core` | the run entity and its activation state; the graph store; liveness | §4.1a, §4.2, §4.8 |
| `ledger` | the execution ledger, raw artifacts, reduced judgements, propagation receipts, decision records | §4.3 |
| `serve` | fact bundles, composed text, conformance records, served numbers, answers, condition marks, abstentions, the index surface | §4.4 |
| `scorecard` | model identity, the model ledger, scorecard cells, routing decisions, outcomes | §4.5 |
| `register` | register rows and immutable register versions | §4.6 |
| `memory` | question keys, links, aliases, pinned pulls, asker scope | §4.7 |
| `evidence` | context 2's frozen query sets, sources, items, absence rows, probes, certifications, citation routes | **§11A.1** — accepted at **DR-099 (A-06)**; not declared by Plan.md §4 |

**Contexts 5 and 6 get no schema of their own** (§11A.2, §11A.3): a schema here
is a **discipline namespace, not a context boundary** — `core` already holds
contexts 1, 3 and 10 and `ledger` is written by every context (`03-module-design.md`
§4.3 row 15). Context 5's four objects and context 6's two run-scoped objects land
in `core`; context 6's two **propagation-attached** records land in `ledger`
beside `propagation_run` and `node_strength_record` (§11A.3).

### 1.1 Table inventory and each table's discipline

"Discipline" is the standing rule of §4.1 that governs the table: **immutable**
(written once, `UPDATE`/`DELETE` revoked), **append-only** (inserts only,
`UPDATE`/`DELETE` revoked, current state derived from the stream),
**versioned** (a new row supersedes; the old row is preserved), **sealed**
(written once at a serve act and never updated in place), or **derived**
(materialised from another table with a recorded derivation version).

| Schema | Table | Discipline | Plan.md |
|---|---|---|---|
| `core` | `run` (frozen head) | immutable — `UPDATE` **and** `DELETE` revoked | §4.1a |
| `core` | `run_progress_event` | append-only | §4.1a |
| `core` | `run_row_activation` | immutable (one row per `(run_id, battery_row_id)`) | §4.1a |
| `core` | `run_row_activation_event` | append-only | §4.1a |
| `core` | `work_item` | the one **mutable operational** table — its history is the ledger | **§3.8** — accepted at **DR-099 (A-05)** |
| `core` | `node` | write-time enforced; text history versioned on `node_text_revision` | §4.2 |
| `core` | `node_text_revision` | append-only, exactly one live text | §4.2 |
| `core` | `node_epistemic_record` | per-node record (13 items) | §4.2 |
| `core` | `stranger_restatement` | minted with its subject, one per node and one per verdict | §4.2 |
| `core` | `edge` | first-class stored object, never derived at read time | §4.2 |
| `core` | `semantic_restatement_flag` | append-only; **never an evaluation input** | **§5.6** — accepted at **DR-099 (A-10)** |
| `core` | `verification_trigger_basis` | immutable; the CROSS-entry leverage snapshot recorded as a **trigger basis**, never a score input | **§11A.2** — **DR-091** |
| `core` | `critique_packet`, `independence_receipt`, `symmetry_diff`, `objection_record` | context 5's run-scoped objects; append-only | **§11A.2** — DR-099 (A-06) |
| `core` | `value_hinge`, `reversal_point` | context 6's run-scoped objects; append-only | **§11A.3** — DR-099 (A-06) |
| `core` | `revision_trigger`, `review_clock`, `staleness_state` | liveness state; retirement writes `ARCHIVED` | §4.8 |
| `ledger` | `ledger_entry` | append-only, total order by `sequence`; partitioned by run range | §4.3 |
| `ledger` | `raw_artifact` | append-only, persisted unconditionally; partitioned by run range | §4.3 |
| `ledger` | `reduced_judgement` | append-only reducer output | §4.3 |
| `ledger` | `propagation_run` | append-only evaluation receipt | §4.3 |
| `ledger` | `node_strength_record` | one row per node per propagation run | §4.3 |
| `ledger` | `decision_record` | append-only decision-function record | §4.3 |
| `ledger` | `overlay_run` | append-only overlay evaluation receipt with its detachment proof | **§11A.3** — DR-099 (A-06) |
| `ledger` | `sensitivity_record` | one row per node per propagation run, written **after** it | **§11A.3** — DR-099 (A-06) |
| `serve` | `fact_bundle` | frozen: versioned + content-hashed | §4.4 |
| `serve` | `composed_text` | sealed ordered segment list | §4.4 |
| `serve` | `conformance_record` | sealed; **never written after sealing** | §4.4 |
| `serve` | `served_number` | sealed; status derived from its event stream | §4.4 |
| `serve` | `served_number_event` | append-only | §4.4 |
| `serve` | `segment_suppression` | append-only | §4.4 |
| `serve` | `answer` | sealed per `(answer_id, answer_version)`; current serve state derived | §4.4 |
| `serve` | `condition_mark` | one authoritative row at answer or node scope | §4.4 |
| `serve` | `condition_mark_node` | join; the **single** authoritative store of the affected set | §4.4 |
| `serve` | `abstention` | one row per ignorance-ledger unknown | §4.4 |
| `serve` | `shadow_suppression` | append-only; what a gate **would have** suppressed while unbound (DR-085) | **§7.10** — accepted at **DR-099 (A-10)** |
| `serve` | *(`answer.verdict_unavailable`)* | an optional typed **field**, not a table; no band, no number | **§7.11** — accepted at **DR-099 (A-10)** |
| `serve` | `answer_index` | **derived — a read-time view** over the authoritative rows, keyset-paginated (§7.9) | §4.4 |
| `scorecard` | `model_identity` | versioned identity keys | §4.5 |
| `scorecard` | `session_assignment` | the model ledger proper | §4.5 |
| `scorecard` | `scorecard_cell` | **derived** view over the ledger, materialised with a recorded derivation version | §4.5 |
| `scorecard` | `routing_decision` | append-only guard trail with recorded propensity | §4.5 |
| `scorecard` | `answer_outcome` | settlement record with read-back verification | §4.5 |
| `register` | `register_row` | versioned | §4.6 |
| `register` | `register_version` | immutable set of rows | §4.6 |
| `memory` | `question_key` | projection of already-frozen fields | §4.7 |
| `memory` | `memory_link` | typed directed edge; no transitive closure | §4.7 |
| `memory` | `alias_row` | written only when a link is confirmed; reversible | §4.7 |
| `memory` | `pull_record` | pinned pull | §4.7 |
| `memory` | `asker_scope` | partition for question-level pulls | §4.7 |

---

## 2. Standing schema-wide rules

Plan.md §4.1, restated as the six rules every table below is checked against.

| # | Rule | Mechanism | Constraint |
|---|---|---|---|
| 1 | Every mutable-looking fact is **append-only** or **versioned with the old row preserved**; nothing is deleted. | Append-only tables have `UPDATE`/`DELETE` revoked **and** a trigger that raises. | AC-05, AC-45; manifest §8.2e |
| 2 | Every table that can carry a served number carries **provenance by reference, never beside** — number and origin are one row, so the D4 join cannot be forgotten. | Column-level: the provenance reference is part of the number's own row. | AC-34; manifest §10.4 |
| 3 | Every closed vocabulary is a Postgres `CHECK` against the `kernel` enum **plus** an application-level exhaustiveness check; unknown members fail loudly at write. | `CHECK` in the creating migration; `require-exhaustive-switch` lint in the application (Plan.md §2.7). | AC-35, AC-65 |
| 4 | Every hash column **names what it hashes** (`input_hash`, `contract_hash`, `content_hash`, `packet_fingerprint`) and is immutable once written. | Distinct columns, never one polymorphic "hash". | AC-10 |
| 5 | Identity columns are opaque and never reused. **Evaluation ordering is the content-derived rule of Seam A, recorded on `propagation_run`** — never a sort over opaque identities, and never re-derived on a recomputation. The **ledger's** total order is its own `sequence` allocator, a different mechanism for a different purpose. | See §5.2 and §6.1 below. | manifest §6.2, §8.2g; AC-08, AC-45 |
| 6 | Every row that a register value moved records `register_row_key` + `register_version`, so the constant can be printed where it was used. | Two columns travelling with the moved value. | AC-75 |

**Rule 3's application-level half is a restatement, never the authority.** Every
invariant that can live in DDL has exactly one authoritative definition, in the
migration that creates its table (Plan.md §2.4; AC-85). §11 is that inventory.

---

## 3. `core` — run and activation (Plan.md §4.1a)

Every other table in §4 references a run. **The run is the carrier for seven
obligations that are otherwise stated and stored nowhere.** Both tables are
written **before the first stage executes** (Plan.md §4.1a; Plan.md §5.3
`POST /v1/asks`).

### 3.1 Why the run is split in two

The same row cannot be both continuously mutable and the carrier of "frozen at
run start". §4.1's standing rule 1 admits only append-only or versioned facts,
and AC-32 / charter A3.2 require enforcement **at write time, not by
convention** — a bar the plan applies to nodes and arrows and must apply here
too. So: an **immutable frozen head** and an **append-only progress record**.

### 3.2 `run` — the immutable frozen head

| Field | What it carries | Constraint |
|---|---|---|
| `run_id` | opaque identity, never reused | manifest §6.2 |
| `question_line`, `asker_id`, `session_id`, `caller_scope`, `as_of` | the ask's framing inputs. **DR-070 rules the asker is the requesting user/person**; authorization and user credentials are out of scope at this stage and V2's `user_dev_token` vertical slice is adopted as sufficient. The three columns stay **distinct** — the simplification is provisional and DR-070 flags a charter-A5.2-style revisit before any multi-tenant or credentialed launch, which a collapsed column could not survive | DR-021 knob 11; **DR-070** |
| `risk_tier` | casual / standard / high-stakes | DR-019 knob 3, DR-052, DR-055 |
| **`tier_source ∈ {ASKER, DEPLOYMENT_POLICY, DERIVED}`** + **`tier_provenance_ref`** | **who set the tier**. **DR-094 rules the authority: the asker declares; deployment policy may RAISE but never lower.** A `DEPLOYMENT_POLICY` row is therefore only legal where its tier is **strictly higher** than the asker's declaration — a write-time check (§12 row 26), not a convention. `tier_provenance_ref` points at the asker declaration a raise superseded, so the printed provenance shows both | **DR-094**; DR-019 knob 3 |
| **`composition_budget_tier`** | the **asker-selected composition-bundle budget tier**, frozen at run start. **DR-078** makes the hard composition-bundle budget an **independent register row** — distinct from DR-052's cost envelope, so `DEFECT` and `ENVELOPE_EXHAUSTED` stay distinguishable — **user-facing as the tier list V amended in: `low` / `medium` / `high`, selected per run**. This column records **which tier the asker chose**; the register carries the per-tier values, and **no value appears here** (AC-76, DR-039). Frozen on the head for the same reason `stranger_sample_rate` is: a mid-run change would move the composition budget inside a live run | **DR-078**; AC-74, AC-76 |
| `depth_params`, `agent_count` | run shape parameters | DR-021 knob 11 |
| **`stranger_sample_rate`** | frozen at run start; the ratchet applies to the **next** run | AC-50 |
| **`envelope_basis`** | the cost envelope is a **run** object, visible "before and during the run" (spec N-9), so it cannot live on `answer`, which does not exist yet | AC-49 |
| **`register_version`** | every run pins one, so a register change cannot retroactively move a served number | AC-74, AC-06 |
| **`battery_version`** | the pinned battery | spec §23.D `OD-S-04` |
| `created_at_seq` | creation sequence | AC-45 |

**`UPDATE` and `DELETE` are both revoked on this table** — grant revocation plus
a raising trigger — and likewise on `run_progress_event`, `run_row_activation`
and `run_row_activation_event`, per §4.1's standing rule 1 and AC-05.

**Why both, and not just `UPDATE`.** Revoking `UPDATE` alone would leave a
`DELETE` free to erase the pinned `register_version`, `stranger_sample_rate`,
`composition_budget_tier` and `battery_version` of a run whose answer has already
been served, making that answer unreplayable with no trace — the ledger records what executed, not what
the run row pinned. And without the revocations "frozen at run start" is
enforced by nothing: a mid-run `UPDATE run SET stranger_sample_rate = …` moves
conformance coverage inside a live run, and a mid-run `register_version` change
makes replay read a register the run did not use — breaking AC-06 with no trace
(Plan.md §4.1a; AC-05, AC-06, AC-45, AC-50, AC-74).

### 3.3 `run_progress_event` — the mutable half, as events

`{run_id, at_seq, kind ∈ {ENVELOPE_CONSUMED, ENVELOPE_STATE, PHASE, TERMINAL}, value}`,
append-only.

- **`TERMINAL` is DR-089's carrier**: *"the run records a typed terminal state at
  completion"*. It is an **event, not a column on the frozen head**, because the
  head is written before the first stage executes and cannot carry an outcome
  that does not exist yet; and it is on **this** stream rather than a new one
  because §3.6 already derives the run's current state from exactly this stream
  (AC-88). At most one `TERMINAL` event per run — a write-time check, since a
  second one would make "the run's terminal state" two facts. Its **value is the
  run's typed terminal state**, whose spelling on the wire is
  `04-api-contract.md` §12.3's `run.terminal` **with its typed kind**; where the
  run ends on a terminal route the kind is **DR-037's five** and **no new member
  is minted here** (AC-65, S-13). See §3.9 (DR-089).
- Current envelope consumption,
  `envelope_state ∈ {WITHIN, ENRICHMENT_SKIPPED, EXHAUSTED}` and
  `phase ∈ {EMPIRICAL, VALUE}` are **derived from the latest event**, never
  asserted on a mutable column — AC-88's *"status is derived, never asserted"*
  applied to the run (Plan.md §4.1a).
- The **monotone phase transition** (DR-053; F-12's gate reads phase *during*
  the run, so answer-grain is the wrong grain) is a **write-time check against
  the latest `PHASE` event**, and `phase_settled_at_seq` is that event's
  sequence (Plan.md §4.1a, §6.2 AM-9).
- The envelope's two states and the composition budget's terminal are **two
  independent gates with two marks and two owners** and neither reads the
  other's state (Plan.md §6.6 UI-7); this table carries only the envelope's.
- `answer` keeps only the **serve-time projection** of all of this (§7.7).

### 3.4 Initialization is mandatory — the initial events

Execution needs a phase, an envelope state and an activation state **before the
first stage runs**, and "derived from the latest event" is undefined over an
empty stream. Therefore, **in the same transaction that writes the `run` frozen
head**, the runner writes the initial events (Plan.md §4.1a):

| Initial event | Value | Why it must exist at t=0 |
|---|---|---|
| `run_progress_event` `PHASE` | `EMPIRICAL` | the dual-act phase order is machine-enforced and read during the run (DR-053; spec §5.5 F-11…F-13) |
| `run_progress_event` `ENVELOPE_STATE` | `WITHIN` | the envelope is visible before and during the run (AC-49; spec N-9) |
| `run_progress_event` `ENVELOPE_CONSUMED` | `0` | consumption is derived from the latest event, so it needs a first one |
| `run_row_activation_event` | one per battery row, carrying its opening state from its activation predicate | a row's state must be resolvable before the first stage executes |

**An empty stream is not a legal state.** It is a **typed error on read, never a
default** — a default here would be the silent assumption the pack forbids
everywhere else (Plan.md §4.1a; AC-76, DR-039).

### 3.5 `run_row_activation` and `run_row_activation_event`

**One discipline per table.**

- **`run_row_activation`** — one **immutable** row per `(run_id,
  battery_row_id)` carrying `{predicate_ref}` **only**.
- **`run_row_activation_event`** — append-only, carrying everything that belongs
  to a *transition*: `{state ∈ {ACTIVE, INACTIVE, WAIT, POLICY_BLOCKED},
  predicate_inputs (as evaluated at this transition), skip_evidence, at_seq}`.

`predicate_inputs` and `skip_evidence` are on the event stream and not on the
row because they are written **at** a transition — `skip_evidence` by definition
at the transition to INACTIVE, which spec §1 requires be *"recorded with
predicate + evidence"*. Leaving them on the row would force an `UPDATE` after
creation and, on R3 (the one row with an explicit re-activation clause), a
second skip would overwrite the first (Plan.md §4.1a).

**`last_evaluated_at_seq` is not a stored column.** It is **derived as the
`at_seq` of the latest event for that `(run_id, battery_row_id)`** (Plan.md
§4.1a).

**The activation predicate is the ratified in-repo row contract (DR-083).**
`predicate_ref` points at the **re-derived, in-repo, first-class per-row
contract field** DR-083 rules — `ACTIVE / INACTIVE / WAIT / POLICY_BLOCKED` with
a **written predicate per row**, populated from spec §3's row contracts, **no
import of the old research artifact**. A row whose predicate the spec only
summarizes files as **`POLICY_BLOCKED` — loud, never a silent skip**, which is
why the enum's fourth member is not decoration. The 71 row contracts are the
artifact DR-083 orders; this table is what they are read into.

**Why this table exists at all.** It is the carrier for the WAIT semantics
DR-089 rules and for DR-083's activation predicates, and it is what makes AC-04's
"resumable" property real: **without it, a runner restart cannot know which rows were WAIT
under which predicate**, so the resumed run either re-fires rows the ledger
already recorded or files WAIT rows as INACTIVE — which spec §1 explicitly
forbids, as it forbids filing `POLICY_BLOCKED` as INACTIVE. **A cache hit never
sets a row INACTIVE** (spec §1; `OD-M-22`; AC-83).

**The wake and terminality behaviour is ruled at DR-089** and is carried at §3.9:
a waiting node completes as soon as its dependencies complete, and **at run
completion nothing remains in a waiting state**. The carrier is unchanged — it
fitted all three readings of the old AM-10 question, and DR-089 selects the
evaluation policy rather than the shape.

### 3.6 What is derived from the run's two streams

| Derived value | Derived from | Rule |
|---|---|---|
| current phase | latest `PHASE` event | monotone transition checked at write |
| current envelope state | latest `ENVELOPE_STATE` event | two gates, two marks (UI-7) |
| current envelope consumption | latest `ENVELOPE_CONSUMED` event | AC-49 |
| a row's current activation state | latest `run_row_activation_event` for that `(run_id, battery_row_id)` | AC-88 |
| `last_evaluated_at_seq` | `at_seq` of that same latest event | not stored |
| **whether the run has terminated, and in what typed terminal state** | presence and value of the `TERMINAL` event | **DR-089**; AC-88 |

### 3.7 Database fixtures owed (S1; `06-test-strategy.md`)

(a) `UPDATE` and `DELETE` against the frozen head **both raise**; (b) current
phase, envelope state and **every row's activation state are resolvable at every
point from run creation to run end, with no empty-stream window**; (c) the
**`tier_source` round-trip over the REACHABLE suppliers** — **rescoped from "all
three" by DR-094**, which names a producer for `ASKER` and `DEPLOYMENT_POLICY`
and none for `DERIVED` (see §13's note); extended by DR-094 to assert that a
`DEPLOYMENT_POLICY` row **strictly raises** and that a lowering write **is
refused**. `06-test-strategy.md`'s **`FX-DB-07`** carries the same
reachable-members scope; (d) **DR-089's WAIT-drain pair** — the `TERMINAL` write is
**refused** while any row's derived activation state is `WAIT`, and **accepted**
once the last one drains (AC-79's fire-both-ways discipline); and (e) the
**`composition_budget_tier` round-trip for all three tiers** (DR-078), asserting
the tier is frozen and the register supplies the value (Plan.md §4.1a, §7 row 7,
§8 S1).

### 3.8 `work_item` — the Postgres-backed work claim (A-05, accepted)

**Accepted architecture at DR-099 (amendment A-05).** Plan.md §2.7 rules the mechanism —
*"Postgres-backed queue (`SELECT … FOR UPDATE SKIP LOCKED`) inside the one store;
work claimed and committed **before** any model call, results written after"* —
and §4 declares no table for it, so the queue every slice from S0 onward runs on
has no shape. Proposed:

```
work_item(
  work_item_id, run_id, battery_row_id,
  node_set,                       -- AM-8's scoped unit: a (row, node-set) pair
  state, attempt,
  claimed_by, claimed_at_seq, claim_deadline,
  enqueued_at_seq
)
```

| Property | Rule | Constraint |
|---|---|---|
| **Ownership** | `battery` **owns the state** (`03-module-design.md` §4.4/§13 `MOD-4`); `apps/runner` **executes**; the scheduler's **reaper writes expiries**; the fleet projection **reads** it | Plan.md §2.7, §3.1; AC-89 |
| **Unit of work** | a `(row, node-set)` pair, **idempotent**, so a halt enqueues a scoped re-execution bounded at K=1 per parent per run (DR-050) and DR-015's propagate re-judges only affected nodes through the same unit | Plan.md §6.2 AM-8 |
| **Claim** | claimed and **committed before any model call**; results written after — **never a write lock held across a model call** | AC-04; Plan.md §2.7 |
| **Expiry** | the **reaper writes** the transition to failed with a typed reason; **every read derives** the failed status from `claim_deadline` **without writing** — the stored `state` is never the read's authority for an expired claim | AC-89 × AC-62, disposed at UI-13 (§11) |
| **Record** | every claim, attempt, expiry and result is a **ledger row** (AC-44); the ledger, not this table, is what replay and the digest read | AC-44, AC-45 |
| **Fleet surface** | `GET /v1/fleet` is a **projection over this table plus the ledger**, and the stale-worker reaping side effect stays on the scheduled job, off the read | Plan.md §5.3; AC-62 |

**Why this is the one mutable operational table, and why that does not breach
§4.1 rule 1.** Rule 1 governs **facts** — anything that can be served, replayed
or re-derived. A work claim is **execution state, not a record**: its entire
history is written append-only to the ledger (AC-44), and nothing in a served
answer or a replay reads this table. Were the claim itself the record, the rule
would bind and the table would have to be an event stream; because the ledger is
the record, the queue may be updated in place. **A `work_item` row is therefore
never a provenance source for any number** (AC-34).

**`state` is an internal vocabulary, never a served typed state.** Its members
are inventoried at §13; the reader-facing status on the fleet surface is derived,
and **"past deadline" is derived, not a stored member** — otherwise the reaper
and the read would be two authorities for one fact.

### 3.9 Run termination, the WAIT drain law, and where Q61 lives (DR-089)

**DR-089 rules three things at once**, and the schema carries each of them
structurally rather than by convention.

**1. The WAIT drain law.** *"At debate (run) completion NOTHING remains in a
waiting state — every node is fulfilled and user-visible; a waiting node
completes as soon as its dependencies complete."* Carried as a **write-time check
on the `TERMINAL` event** (§3.3): the event is refused while any
`(run_id, battery_row_id)` derives `WAIT` from its latest
`run_row_activation_event`. **No completed run displays a dangling WAIT**, and
because the check reads the *derived* state rather than a stored flag, it cannot
be satisfied by a stale column (AC-88). This **amends the literal reading of spec
§3 Q61's "may sit in WAIT indefinitely"** — DR-089 says so in its own conditions
column, and the amendment is the reason the check is safe to enforce.

**2. The run records a typed terminal state at completion.** That is the
`TERMINAL` event (§3.3). Its consequence for every other schema is that **run
completion is a recorded positive fact, not an inferred absence** — settlement,
the fleet projection and the digest all read it rather than guessing from the
absence of further activity.

**3. Q61 is a post-completion settlement event, not an intra-run WAIT row.**
V's direction, recorded: *Q61 fires AFTER the debate is completed, its outcome
saved to the execution ledger (DR-027); if the debate is not completed or cannot
complete, it never fires for that debate.* So:

| Obligation | Where it lives | Why not the run |
|---|---|---|
| the standing watch for a resolver outcome | **outside any run** — Stage-11 / settlement, executed by `apps/scheduler`'s settlement-watch job (`03-module-design.md` §1.2) | the watch **persists across runs**; a row on `run_row_activation` would tie an indefinite watch to a run that has already terminated, which clause 1 now forbids |
| the resolver outcome when it arrives | `scorecard.answer_outcome` (§8), with its **read-back verification recorded as its own ledger action** (AC-73) | the run is immutable and already terminal |
| the fact that Q61 fired at all | a `ledger_entry` row (DR-027, AC-44) | everything executed is recorded, including work that post-dates the run |
| the calibration update | a **new `scorecard_cell` derivation version** over the ledger (AC-41; §8), written **INSERT-only** — a new version supersedes, it never edits a past one | a scorecard is a pure function of the ledger, so the update is a re-derivation, never an edit. The executing principal's credential is scoped to exactly this (`03-module-design.md` §5.5.0), so the write cannot become an independent write path |

**No new table is owed.** All four homes already exist; what DR-089 changes is
**which of them Q61 uses** — and it removes the only reading under which a run
could terminate with an open watch inside it.

---

## 4. The "required node" predicate and the completeness gate (AC-11)

The completeness gate is a data-model obligation because it decides whether an
aggregated run may be **persisted at all**.

**Definition** *(architecture term, from Plan.md AC-11)*: a **required node** is
**a node for which a judgement was scheduled under the running job**.

**The gate**: before an aggregated run is persisted, every required node must
have **≥1 raw artifact**; missing any ⇒ the job fails and **no aggregated run is
written** (manifest §8.2f path D).

**The failure condition is separate from the definition**: the gate fails when a
required node has **no raw artifact in any state, parseable or not**. Folding
the failure condition into the definition made the predicate read *"every node
with no raw artifact must have ≥1 raw artifact"* — vacuous or contradictory. The
two clauses are kept apart, and it is this predicate the data model carries
(AC-11).

**Its two interactions, both load-bearing:**

- **With AC-13.** The raw artifact is persisted unconditionally, parseable or
  not. So an **unparseable-but-persisted** artifact **satisfies** the gate.
- **With AC-21 (M1).** An **unjudged node that has ≥1 persisted raw artifact
  satisfies the completeness gate and takes M1's path** — it emits no arrow,
  carries a typed record, and the answer serves. Without this distinction the
  broad reading makes M1's served-with-a-typed-record outcome unreachable and
  P-D1 unassertable, and the narrow reading makes the gate unfireable (AC-11,
  AC-21).

**Where it lives.** The gate is evaluated over `ledger` rows immediately before
the aggregated run is persisted (`propagation_run` + `node_strength_record`,
§6). Its two inputs are (i) the set of nodes for which a judgement was scheduled
under the running job — a recorded ledger action, since everything executed is
recorded (AC-44) — and (ii) the presence of ≥1 `raw_artifact` row **in any parse
status** (AC-13). **No stored "required" flag is minted**: the predicate is
derived, per AC-88's derive-don't-assert discipline.

**Input (i) needs a carrier Plan.md §4.3 does not supply** — its action-kind
vocabulary has no member that records a *scheduled* judgement, so as written the
predicate is stated and unqueryable. **§11A.4 proposes that carrier**
(`JUDGEMENT_SCHEDULED`, a ledger action kind), **accepted at DR-099 (A-07)**,
closing gap `DM-4` (§19).

**Fixture pair owed (S1)**: the gate **fires** on a genuinely missing artifact
and **does not fire** on an unparseable-but-persisted one — both, per AC-79's
fire-both-ways discipline (Plan.md §7 row 7, §8 S1).

---

## 5. `core` — graph store (Plan.md §4.2)

**Graph scope.** One graph per answer/run. Cross-run relations are typed memory
links, **never merges** (AC-69). Archival keeps the whole graph (AC-05).

### 5.1 `node`

Opaque id; run/answer ref; owning question; **structural parent (lineage only)**;
depth; **sibling ordinal banded by child kind**; **materialized path** (AC-33);
node type; **`claim_type`** (the closed `OD-16` vocabulary); **`value_laden`**
(the cross-cutting flag, below); `generation_status ∈ pending|complete|failed|stale`;
`path_status ∈ active|abandoned`; `exploration_decision` from the closed set;
`relevant_as_of`; `position_label` (AC-31). **Write-time checks per AC-32** —
node type, claim type, lifecycle vocabularies, non-blank claim, path/depth
consistency and acyclicity are enforced at write time, not by convention (AC-32;
manifest §6.2, §6.4; charter A3.2).

**`claim_type`'s column home is named here, under this lane's authority.** §13
already inventories the claim-type vocabulary as closed (DR-062 `OD-16`, with
`OD-17` naming the revision condition) and enforced in `kernel`, but named **no
table**. It has to be `core.node` — the claim *is* the node — and it has to be
somewhere, because §9.1's claim-type → composition map is keyed on it and the
evidence gate's eligibility is evaluated per claim (AC-92; DR-085/DR-087). A map
with no per-row key domain is a map nothing can be applied to (AC-85).

**`value_laden` is a flag, not a claim type (DR-087).** DR-087 rules that
`mixed` and `unknown` are **evidence-GATED, fail-closed** — they are gated unless
proven evidence-free, so they stay members of `claim_type` — while **`value-laden`
is a cross-cutting flag and `OD-16`'s vocabulary stays closed**. The schema
carries that distinction exactly:

- `value_laden boolean NOT NULL` on `core.node`, **beside** `claim_type` and
  never inside it. It is **not** a `kernel` enum member and **not** in §13's
  closed-vocabulary inventory, because adding it there is precisely the ratified-
  closure extension DR-087 refuses (and §5.5(1) refuses for arrow kinds).
- `NOT NULL` rather than nullable: a three-valued flag would let "not yet
  classified" masquerade as "not value-laden", which is the silent-default shape
  the pack forbids everywhere (AC-76, DR-039). Absence of classification is a
  typed condition on the epistemic record (§5.3), not a null here.
- Being cross-cutting, it may co-occur with **any** `claim_type` member — there
  is no `CHECK` binding the two, and writing one would re-create the exclusivity
  DR-087 removed.
- **The gate's eligibility rule is context 2's, not this table's**: DR-085 makes
  eligibility the exact complement of spec §5.2(f)'s evidence-free list, and
  DR-087 places `mixed` and `unknown` on the gated side. This column supplies the
  gate's input; it does not decide it (`03-module-design.md` §3.3 rule 6).

Three points a stranger needs:

- **Structural parent is lineage only.** The argumentative relation is the
  `edge` table's, not the parent pointer's — an edge may target a node that is
  **not** the source's structural parent (AC-18).
- **The materialized path is a required capability**, not decoration: it is the
  cheap subtree operator that makes ancestor-triggered invalidation possible
  (AC-33; manifest §6.2).
- **`position_label` travels with the number.** Position and corroboration are
  already in the arithmetic; no factor may re-encode graph position into a base
  score or arrow strength — what is owed is a per-node position label (AC-31).

### 5.2 `node_text_revision` — and the non-blank claim

Append-only body-text history with **exactly one live text**, pointed at by the
node (manifest §6.2).

**The non-blank claim uses the null-safe canonical rule of Plan.md §2.4,
restated here identically so the two cannot diverge:**

```
claim_text text NOT NULL
CHECK (length(btrim(claim_text)) > 0)
```

— equivalently the single null-safe form
`CHECK (coalesce(length(btrim(claim_text)), 0) > 0)`.

**A bare trimmed-length `CHECK` is not sufficient and must not be written.** In
PostgreSQL a `CHECK` passes unless its expression is **false**, and
`length(btrim(NULL)) > 0` evaluates to `NULL` — so the bare form **accepts the
null case it appears to reject** and leaves manifest §6.4's *"blank claim
rejected at write time, not merely at serialization"* and charter A3.2 unmet
(Plan.md §2.4, §4.2).

**Canonical owner:** this table's creating migration (Plan.md §2.4).
**Fixture (S2):** rejects **null, empty and whitespace-only**, **exercised
against the migrated database rather than an application validator** — otherwise
it tests the restatement rather than the authority (Plan.md §2.4, §4.2).

### 5.3 `node_epistemic_record`

The **13-item per-node record** (manifest §6.2), including the node-level
**provenance projection readable at the node, not a join away**, the
**uncovered-scope statement**, and **structural-drop visibility** (Plan.md
§4.2). The record lives *on the node* precisely because V2's equivalent was
keyed by node id but not part of the node, so it could be absent, stale or keyed
to different content with no indication which (manifest §6.2). AC-34 applies:
per-node record, **never a flat `node_id → float` map**, and the debug facet
uses the same record.

### 5.4 `stranger_restatement`

One row **per node** and one **per verdict**, **minted with its subject, not at
serve time**, carrying the canonical field list
`{subject_ref, claim, certainty, what_would_change_it, action_consequence,
generated_at, check_status}` and `check_status ∈ {PASS, FAIL, NOT_SAMPLED}`
(AC-67; DR-061 · `OD-S-06`; spec §12.7 S-26, S-26a).

- **`action_consequence` is verdict-only**: node rows set `NOT_APPLICABLE`,
  **enforced by a `CHECK` keyed on `subject_kind`** (Plan.md §4.2; AC-67).
- **`check_status = FAIL` blocks serving** (AC-67).
- The schema is **cited by name and never restated** anywhere else (AC-67);
  the field list above is reproduced once, here, because this is the table.
- Seam D reconciliation: the **row** is minted with the node; what is computed
  at read time is its **projection** onto the wire (Plan.md §3.2 Seam D).

### 5.5 `edge` — the mandatory first-class edge table

AC-18: edges are **stored first-class objects, never derived at read time**;
manifest §6.3 names V2's absent edge table the largest structural gap.

```
edge(
  edge_id, run_id, source_node_id,
  target_kind    ∈ {NODE, EDGE},           -- polymorphic target, AC-19
  target_node_id, target_edge_id,          -- exactly one non-null per kind
  target_edge_polarity,                    -- denormalized; see the FK in (2)
  polarity       ∈ {support, attack},
  kind           ∈ {rebutting, undercutting} NULL,   -- closed; attacks only
  strength       numeric NULL,             -- nullable, AC-28 / A-2
  magnitude_status ∈ {MEASURED, UNKNOWN},
  strength_source ∈ {EVIDENCE_VERIFIER, CLUSTER_COLLAPSE,
                     UNDERCUT_TRANSMISSION},         -- see (4)
  provenance_ref, created_at_seq
)
UNIQUE (run_id, edge_id, polarity)         -- the FK target for (2)
```

#### (1) The arrow-kind vocabulary is closed at two members, and it types attacks

Manifest §6.3 (DR-062 `OD-19`) distinguishes **rebutting** an attack (denying
the claim itself) from **undercutting** it (granting the claim while denying
that it supports its parent) — both members are distinctions **within** an
attack. The pack declares **no support-side member**, and minting one would
extend a ratified closed enum, which architecture may not do (DR-062 `OD-19`;
spec S-13's discipline; DR-039).

Therefore `kind` is **bound to polarity** by `CHECK`:

- `polarity = 'attack'` requires `kind IN ('rebutting','undercutting')`;
- `polarity = 'support'` requires `kind IS NULL`.

A support edge is fully typed by its polarity; the kind column is the
attack-typing vocabulary and nothing else. Unknown values fail loudly at write
(AC-35).

#### (2) The undercut targets a SUPPORT edge specifically — enforced, not described

DR-066(2) rules the undercut is *"a typed attack targeting the support EDGE,
never the claim node"* (AC-19). **`target_kind = EDGE` alone is too weak**: it
would admit an undercut of an attack edge. The invariant is carried by a
**graph-scoped composite foreign key**

```
(run_id, target_edge_id, target_edge_polarity)
  REFERENCES edge (run_id, edge_id, polarity)
```

plus

```
CHECK (kind <> 'undercutting'
       OR (target_kind = 'EDGE' AND target_edge_polarity = 'support'))
```

The denormalized `target_edge_polarity` **cannot drift**, because the FK makes
the database resolve it against the target edge's actual polarity, **and
carrying `run_id` on both sides means the resolution can only land inside the
same graph** (C-11).

**Single canonical owner: the migration that creates `edge`** (Plan.md §2.4);
the `graph` write API restates it **only for error quality** and is never the
authority (AC-85). `06-test-strategy.md` owes a **rejecting fixture** — an
undercut written against an *attack* edge is refused — alongside the accepting
one, per AC-79.

#### (3) Upsert semantics — collapse and integrity error are different outcomes

AC-35 carries **two distinct behaviours** from manifest §4.4: *"Duplicate
identical arrows collapse"* and *"one identity carrying two different strengths
is a loud typed integrity error"*. **A bare unique index cannot tell them apart
and would reject both**, turning a legitimate re-derivation into a write
failure. The rule (Plan.md §4.2(3)):

| Element | Value |
|---|---|
| **Identity** | `(source_node_id, target_kind, coalesce(target_node_id, target_edge_id), polarity)` |
| **On conflict, payload equal** — `(strength, magnitude_status, strength_source, kind)` all equal | **collapse to the existing row**: no-op, returns the existing `edge_id` |
| **On conflict, any of those differ** | **raise the typed integrity error** — never a silent pick |

Both cases get a fixture in S2 (Plan.md §4.2(3), §8 S2).

#### (4) `strength_source` has three ruled producers, and the third is WRITABLE (DR-071)

AC-27 / DR-062 `OD-06` closes arrow strength to ruled producers. Two were named
at `OD-06`: **the evidence verifier's grounded score** and **provenance cluster
collapse**. **DR-071 rules the third.** The undercut's shape is
**`transmission-reduction`** — *a reduction of the targeted support edge's
transmitted contribution, computed inside the pure core, recorded per edge* — and
DR-071 grants the `OD-06` producer-set extension explicitly, **two → three**.

**`UNDERCUT_TRANSMISSION` is therefore a writable member.** The earlier "declared
but NOT WRITABLE" fence is discharged: it existed only because writing the member
before V ruled would have been a ratified-closure extension by architecture, and
V has now made the extension.

The `CHECK` **stays**, because it never was the not-writable rule — it is the
placement rule, and it is the thing that keeps AC-27's closure intact for every
**other** edge:

```
CHECK (strength_source <> 'UNDERCUT_TRANSMISSION'
       OR (kind = 'undercutting' AND target_kind = 'EDGE'))
```

**Two records, not one, and confusing them loses the arithmetic.** DR-071 ruled
one shape that lands in two places:

| What | Where | Discipline |
|---|---|---|
| the **undercut edge's own magnitude** — a `MEASURED` strength whose producer is `UNDERCUT_TRANSMISSION` | `core.edge.strength` + `strength_source` on the undercut row | the same column every other producer writes; `magnitude_status = MEASURED`, so §5.5(5)'s binding `CHECK` holds |
| the **reduction applied to the targeted support edge's transmitted contribution** — DR-071's *"recorded per edge"* | `ledger.propagation_run.transmission_reductions` (§6.4) | a compute-time outcome of the pure core, **recorded** so replay reads it as data and never re-derives it |

The second is not optional bookkeeping: **without it the replay ceremony can read
that an undercut existed and cannot read what it did**, which is the shape P13
and AC-07 exist to prevent. It follows the **cluster records'** precedent exactly
(§6.4) — computed inside the pure core, persisted by Seam A's *persist* step,
frozen as a replay input and an input to the graph fingerprint.

**Removal path: none.** §17 item 7's declared-removal exception no longer
applies to this member; nothing here is unreachable, so AC-77 / charter VR-4 are
satisfied by use rather than by deletion.

#### (5) Graph-scoped integrity, and the remaining constraints

Every endpoint is bound to **the edge's own graph**, not merely to some row
somewhere:

- `node` carries `UNIQUE (run_id, node_id)`;
- `(run_id, source_node_id) REFERENCES node (run_id, node_id)`;
- `(run_id, target_node_id) REFERENCES node (run_id, node_id)`;
- plus (2)'s graph-scoped target-edge FK.

Without `run_id` in those keys an edge in run A could take a node or a support
edge in run B as an endpoint — contradicting "one graph per run" and AC-69's
**link-never-merge, no transitive closure** rule, under which the *only* legal
cross-run relation is a typed memory link (C-11).

**Rejection fixtures are owed for every cross-run source/target combination** —
cross-run source node, cross-run target node, and an **otherwise-valid undercut
of a support edge in another run** (S2; Plan.md §4.2(5), §7 row 7).

Remaining constraints:

- `CHECK` that `target_kind` matches **exactly one** populated target column;
- `CHECK ((strength IS NULL) = (magnitude_status = 'UNKNOWN'))` (AC-28);
- **no self-edge**;
- consequently, *"endpoint absent from the node set"* is a **write error rather
  than a compute surprise** (manifest §4.4) — **narrowed by DR-075**, below.

**DR-075 narrows "endpoint absent", and the narrowing is load-bearing.** A
**placeholder arrow is a live, real arrow endpoint**: a node with
`generation_status = pending` **is** an unjudged interior node under `OD-02`, its
row exists, and the graph-scoped FKs of this clause resolve against it like any
other. **The *"endpoint absent from the node set"* error is therefore reserved
for genuinely foreign or deleted endpoints only — a cross-run endpoint or a row
that never existed — and may never fire on a legitimate placeholder.** Left
unnarrowed, the two would be indistinguishable and DR-076's requirement that a
pending node be *structurally connected to its parent from the moment it spawns*
would be unsatisfiable: the connecting arrow would be refused at write.

Two consequences the schema already honours, said so nobody re-derives them:

- **Nothing about the placeholder is special-cased in the edge table.** It is an
  ordinary row; what makes it a placeholder is the *target node's*
  `generation_status`, which is the node's fact, not the edge's. There is no
  `is_placeholder` column, and adding one would be a second store of a fact the
  node already holds (AC-85, AC-88).
- **Serving a placeholder as a claim stays forbidden regardless** (DR-075's own
  condition; manifest §6.2 item 10, AC-86). Being a legal arrow endpoint and
  being a servable claim are two different permissions, and only the first is
  granted here.

**Why `strength` is nullable at all (A-2).** A contradicting verdict yields an
attack arrow with a **typed unknown magnitude** — visible, contributing nothing;
unverifiable / pending / absent / malformed yields **no arrow** (AC-28; DR-062
`OD-04`). The integrity rule of (3) applies to the identity **together with**
its magnitude, so two rows disagreeing on either is the loud typed error the
manifest requires. `OD-04`'s pre-approved successor — a verifier-vouched
magnitude — lands as a **value in the same column with no schema change**
(Plan.md §6.4 A-2).

### 5.6 `semantic_restatement_flag` — F1's carrier (A-10, accepted)

**Accepted architecture at DR-099 (amendment A-10).** AC-25 states F1 whole — *"the
semantic-restatement flag is **non-gating**: it changes no number"* (manifest
§4.2i; DR-062 `OD-08`) — and Plan.md §4 gave it no row, so a constraint in the
base had no design element carrying it, which §1's own law calls a gap.

```
semantic_restatement_flag(
  node_id, run_id,               -- graph-scoped, as every graph FK is (C-11)
  restates_node_id,              -- the node this one is flagged as restating
  similarity_field,              -- the field OD-08's successor promotes
  raised_by, raised_at_seq
)
```

**Not to be confused with `stranger_restatement` (§5.4).** They share a word and
nothing else: `stranger_restatement` is the canonical plain-language restatement
minted with every node and verdict for a stranger to read (AC-67); this flag
records that **two claims say the same thing**, and no reader-facing text depends
on it.

**"Changes no number" is carried structurally, not by discipline.** The flag is
**not a field of the evaluation snapshot** — Seam A's snapshot carries the node
set, the arrow set, the operator resolution, the cluster records and the arrow
order, and nothing else (Plan.md §3.2 Seam A) — so the pure core **cannot** read
it. **`FX-PT-FLG` asserts the property directly**: every number is
**byte-identical** with the flag raised and unraised, which is AC-30's
detachment idiom applied to F1. Raising the flag after a propagation run
therefore requires no recomputation and invalidates nothing.

**The successor lands as a value, not a shape.** Manifest `O-4` / `OD-08`'s
restatement-flag promotion is a **register-gated branch that changes a value or a
flag, never a shape** (Plan.md §6.7), and `similarity_field` is the column it
would move.

---

## 6. `ledger` — the execution ledger (Plan.md §4.3)

### 6.1 `ledger_entry`

Append-only. `sequence bigint` from a **dedicated allocator taken under a write
lock**, so same-tick rows are orderable; **the total order is the sequence,
never a timestamp and never a random tiebreak** (AC-08, AC-45; manifest §8.2g).

Columns: run ref, stage, row id (battery row), **action kind** (closed
vocabulary — an executed check mapping to no member is `UNCLASSIFIED_ACTION` and
is itself an `UNINSTRUMENTED` trigger, spec §8.1 A-2), actor,
**`subject_item_id`**, **`stance_at_action`** (AC-46), **typed outcome**
(`OK|FAILED|BLOCKED|TIMED_OUT|REFUSED|SKIPPED_BY_BUDGET`), timings,
`input_fingerprint`, `contract_hash`, register refs, **digest text (tier 2)**.

Two properties a stranger should carry away: **everything executed is recorded**
— attempts, retries, failures, could-not-dos, abstentions, condition marks,
typed skips (AC-44) — and **nothing is ever rewritten** (AC-45).

**The action-kind vocabulary carries a scope classification (DR-092).** DR-092
rules that the Q34 symmetry diff runs over **item-scoped actions only** — the
subject-carrying members of the closed action vocabulary — and that **pre-item
actions are excluded BY KIND, never by value**. That distinction has no carrier
in Plan.md §4.3, so the diff as written was unqueryable. **Minted here:**

```
action_scope ∈ {ITEM_SCOPED, PRE_ITEM}
```

— a **declared attribute of each member** of the action-kind vocabulary, held
once in `kernel` beside the vocabulary itself and transcribed with it.

**It is not a column on `ledger_entry`**, and that is the whole design:

- It is a property of the **kind**, not of the row. Stored per row, two rows of
  one kind could disagree — a second authority for one fact (AC-85) — and the
  disagreement would be invisible until the fairness diff produced a wrong
  answer.
- It is **derivable from the kind**, so deriving it is mandatory (AC-88, §14).
- **Excluding by kind is what keeps `UNASSIGNED` a real signal.** DR-092's
  "never by value" is the trap: filtering the population on
  `stance_at_action <> 'UNASSIGNED'` would drop exactly the rows AC-46 minted
  `UNASSIGNED` to make visible, and the fairness launch fixture would pass by
  hiding its own evidence. The diff's population predicate reads
  `action_scope = 'ITEM_SCOPED'` **and nothing about `stance_at_action`**, so an
  item-scoped action stamped `UNASSIGNED` stays in the population and is counted.
- `UNCLASSIFIED_ACTION` — the declared fall-through — is **`PRE_ITEM`**: it
  carries no reliable subject by definition, so counting it as item-scoped would
  put an uninstrumented row into a fairness population. It remains an
  `UNINSTRUMENTED` trigger either way (spec §8.1 A-2), so the exclusion silences
  nothing.

**The per-member assignment is transcribed, never invented**: each member's
scope follows from whether spec §8.1's contract gives it a subject, which is the
same source the vocabulary's membership comes from. `03-module-design.md` §4.1
context 5 owns the diff that consumes it.

### 6.2 `raw_artifact`

Persisted **unconditionally, parseable or not**: raw text, its hash, request
metadata, parse status and error, the validated assessment **or nothing**,
**allow-listed and recursively scrubbed** provider metadata, latency, checked-at
(AC-13).

**`input_hash` and `contract_hash` are separate columns** (AC-10), so a
superseded artifact is recognised as superseded rather than colliding; **cache
identity includes the contract hash and yields a new row** — the contract hash
is excluded from the input hash and included in cache identity, and history is
never overwritten (AC-10; manifest §8.2c–e).

**Tiering.** `raw_text`, provider metadata and request metadata of **every**
model call — per-node judges, the composition model **and the conformance
judge** — are operator-only (Plan.md §5.2; AC-44, AC-87). The serve-side fixture
asserting **no `raw_text` appears anywhere in a tier-2 payload** is owed to
`06-test-strategy.md` (Plan.md §5.2).

### 6.3 `reduced_judgement`

The deterministic reducer's output: τ, uncertainty-ladder position, **drivers in
fixed emission order**, **ordered score caps with what/to-what/why/by-what**,
typed holes, **branch identifier**, `reducer_version`, and
**`judge_weight_version`**.

The last is not optional: DR-034 plus DR-060(b) require every served number to
recompute **byte-identically** from frozen records with no model in the path, so
**any input that moved a served number — including the judge weight in force and
its version — is a frozen replay input** (Plan.md §6.3 U-5, RESOLVED-BY-PACK by
entailment).

**What the weight multiplies is ruled at DR-077, and the outcome is recorded
here.** A judge's earned weight **multiplies the served arithmetic** — consumed
in the **selection** of which judgement becomes the reduced score, under a
**declared rule, never by averaging** — and **dispersion is measured and served
separately, never blended away**. Two columns carry the ruled outcome, and
without them the ceremony can read the τ and not what produced it:

| Column | Carries | Constraint |
|---|---|---|
| **`selected_judgement_ref`** | **which** judgement the declared rule selected, out of the candidate set the panel produced | DR-077; AC-34 (the number joined to its origin) |
| **`dispersion`** | the measured dispersion across the panel — **a separate served quantity, never folded into τ**; **typed absent, never zero, below two judgements** (P15; AC-04's bulkhead) | DR-077; AC-66 |

**The rule's identity lives once, on `propagation_run`** (§6.4) — it resolves
from the register like the operator does, so recording it per judgement would be
a second copy of a per-run fact (AC-85). This row records **what the rule
selected**; that row records **which rule was in force and which level supplied
it**.

**Averaging is unrepresentable rather than forbidden by convention**: there is no
column for a blended τ and no column for a dispersion-adjusted one. A reducer
that averaged would have to write the average into `tau` and leave
`selected_judgement_ref` pointing at a judgement whose τ differs from it — which
the S4 fixture checks directly.

### 6.4 `propagation_run` — the evaluation snapshot's receipt

Carries: the **graph fingerprint** (input-order-independent; changes when any τ
changes; **differs between two operator selections**), **the recorded arrow
order**, the per-parent **operator identifier and the resolution level that
supplied it** (AC-22), the **cluster records** (AC-23), engine version — **plus
the five ruled structural outcomes below**.

#### 6.4a The recorded-outcome columns — one per ruled structural outcome

**The rule this section exists to satisfy.** DR-034/AC-07 make the replay
ceremony read **frozen rows as data**, and `apps/replay` may recompute nothing
V3-specific (`03-module-design.md` §3.3, §5.5). So **a ruled structural outcome
that is not a recorded column is an outcome the ceremony cannot check** — the
ceremony would pass while saying nothing about it. Every ruling of Theme C
therefore lands as a column, here or on `node_strength_record` (§6.5):

| Ruled outcome | Column | Grain | Ruling |
|---|---|---|---|
| **transmission reductions** — the reduction each undercut applied to its targeted support edge's transmitted contribution | **`transmission_reductions`** — `{target_edge_id, undercut_edge_id, reduction, magnitude_status}` | **per edge** (DR-071's own words) | **DR-071** |
| **lift markers** — which lift applied, to what, in what order, with the marker at **both** ends | **`lift_records`** — `{node_id, lift_kind ∈ {FOLDER, JUDGED_ANCESTOR}, lift_target_node_id, marker_at_source, marker_at_target, applied_ordinal}`; projected per node at §6.5's `lift_marker` | per node, ordered | **DR-072** |
| **cluster records, both polarities** | **`cluster_records`** — `{cluster_id, key, key_basis, polarity ∈ {support, attack}, absorbed_edge_ids, surviving_member}` | per cluster | **DR-073** |
| **effective operator + supplying level** | **`operator_by_parent`** — `{parent_node_id, operator, supplying_level}`; mirrored per node at §6.5 | per parent | **DR-074** (AC-22's chain) |
| **judgement selection rule** | **`judgement_selection_rule`** + its `register_row_key` / `register_version` (§2 rule 6, AC-75) | per run | **DR-077** |

All five are **frozen replay inputs** and all five are **inputs to the graph
fingerprint** — otherwise two runs differing only in a lift order or a
transmission reduction would fingerprint identically, and AC-07's byte-identity
check would be blind to exactly the values these rulings created.

**DR-072's composition order is a ruled constant, and the record is what proves
it was honoured.** The order is **folder-lift first, then `OD-02`'s judged-ancestor
lift**, with **both-ends markers emitted in both cases** — so the order itself is
not per-run data and is not stored as a policy. `applied_ordinal` records the
sequence the run actually applied, which is what makes "folder-then-ancestor" a
checkable property of the frozen record rather than a claim about the code. The
verdict-affecting weight of this ruling is on the record at DR-072 (D2's measured
0.97 → 0.5 shift), which is why the marker pair is not decoration.

**DR-073's key derivation is recorded, not just the key.** A claim node's cluster
key **derives from the provenance of its evidence and the producing run/model
family**, and **a node with no resolvable key clusters alone**. `key_basis`
carries the derivation, and a lone node gets a **real singleton cluster record** —
not a null, not an absent row. The distinction matters because "clustered alone"
and "not clustered" are different facts and only the first is true; recording the
singleton is what makes the key **printable wherever a cluster changed a number**
(AC-23) even when the cluster has one member.

**The recorded arrow order is a stored fact, and the rule that produces it lives
in Seam A, not here** (Plan.md §3.2 Seam A, stated once there). Two consequences
the data model must honour:

- the order is a **deterministic function of stable non-identity content** —
  `(target_kind, polarity, kind, source node's materialized path, sibling
  ordinal)` with `created_at_seq` as the final tiebreak, **`NULLS FIRST`
  declared explicitly on `kind`** (support edges carry `kind IS NULL` per
  §5.5(1), and leaving NULL placement to the engine default is exactly the
  storage-engine-specific ordering manifest §8.2g refuses to carry — AC-04);
- because the order is **recorded**, **every recomputation of an
  already-computed run consumes the recorded order and never re-derives it** —
  which binds the overlay-detachment byte-identity check (AC-30), the replay
  ceremony (AC-07) and the removal-based leverage/fragility recomputations
  (AC-29).

A property test asserts the derived order is **stable across two independent
derivations of the same snapshot** (AC-08; Plan.md §3.2, §8 S2).

**Cluster records** are emitted by the compute-time collapse gate **inside the
pure core** and recorded here — stored arrow strengths remain the outputs of
their ruled producers (AC-27), the record is itself a frozen replay input and an
input to the graph fingerprint, and the key is **printed wherever a cluster
changed a number** (AC-23; Plan.md §6.4 A-5). **DR-073 rules that collapse
applies to BOTH polarities**, support and attack alike, which is why `polarity`
is a column of the record (§6.4a) rather than an assumption about it.

### 6.5 `node_strength_record`

**One row per node per propagation run**:
`{strength, tau_source, way_of_knowing, cluster_id, judged_by, abstained,
supported_by, attacked_by, operator_used, position_label, lift_marker}`
(manifest §4.3) — **never a flat map** (AC-34). The debug facet reads this same
per-node record, not a parallel one (AC-34; manifest §9.3).

**Three additions the Theme C rulings force**, each the per-node half of a §6.4a
outcome:

| Column | Carries | Why it is here and not only at §6.4 | Ruling |
|---|---|---|---|
| **`operator_level`** | the resolution level that supplied `operator_used` — parent, run or deployment | `operator_used` alone records *what* without *where from*, and DR-074's whole anti-defect property is that the operator is **a recorded config value, never a hardcoded literal**. A record naming the operator and not its supplying level cannot tell a register-resolved value from a source literal, which is exactly D2 | **DR-074** |
| **`lift_marker`** *(shape fixed, not added)* | `{lift_kind, lift_target_node_id, marker_at_source, marker_at_target, applied_ordinal}` — the per-node projection of §6.4a's `lift_records`, **never a bare boolean** | manifest §4.3 names the field; DR-072 gives it content. A marker that says *"a lift happened"* and not *which* one or *to what* leaves both ends of DR-072's ruled marker pair unrecorded | **DR-072** |
| **`reduced_judgement_ref`** | the `reduced_judgement` row (§6.3) whose selected judgement produced this τ | DR-077's selection is the join between the panel and the served number; without the ref, `strength` and `selected_judgement_ref` sit in two tables with no key between them and the ceremony cannot walk from a served number to the judgement that became it | **DR-077** |

**No value is duplicated.** `dispersion` stays on `reduced_judgement` and the
selection **rule** stays on `propagation_run`; this row carries the **level**,
the **markers** and the **ref** — three facts that are per node per run and are
recorded nowhere else (AC-85).

### 6.6 `decision_record`

The pure decision function's inputs, firing reasons, `categorical|scalar`
classification, **blockers (recorded, excluded from classification)**, spawn
count, and a **replay identity hash excluding the idempotency key, spawn count
and classification fields** (AC-48; manifest §7.2a–f).

### 6.7 Partitioning

`ledger_entry` and `raw_artifact` are **partitioned by run range**, and **no
partition is ever dropped** (AC-05; Plan.md §4.3). Partitioning is a physical
arrangement of an append-only table; it changes nothing about §2's rule 1.

---

## 7. `serve` — serve artifacts (Plan.md §4.4)

**Seam D governs this schema.** `serve` produces two distinguishable things:
**frozen artifacts** — the fact bundle, the conformance record, the served
numbers and their provenance: persisted, hashed, replay inputs — and
**projections** — badges, marks, provenance summaries, per-node restatements:
**computed at read time from stored typed fields**. Freezing the facts is what
AC-06 requires; computing the projections at read time is what AC-64 requires,
because a staleness state that changed after serving must be visible on the next
read (Plan.md §3.2 Seam D).

### 7.1 `fact_bundle`

Persisted, **versioned and content-hashed**, keyed to
`(answer_id, answer_version)`. **Rationale**: DR-034 replays from *frozen
records* and DR-060(b) makes the conformance verdict an **input artifact**, so
the bundle the verdict was rendered against must be frozen and addressable
(AC-06, AC-07).

Contents are **computed facts and typed records only** (AC-51), including Q53's
**residual objection as a field** and the **machine-injected honesty fields**
(AC-54) — machine-injected precisely so silent truncation of an honesty surface
is impossible by construction.

### 7.2 `composed_text`

An **ordered list of typed segments with stable ids** *(architecture term:
**segment**)*, each carrying its **load-bearing flag** and **a
`segment → served_number` reference set listing every number the segment
asserts**.

That reference set is what lets the conformance record express three states per
segment — judged / sampled-and-passed / not sampled (DR-060a) — and what orders
DR-058's multi-pass composition by load-bearing priority. **It is display only**
(AC-63): no number is learned by parsing prose.

### 7.3 `conformance_record`

The judge's **full record** (behind the authorized handle), the **outcome**
(always on the answer), **which R9 pass failed** when one did, and the
**per-segment judged/sampled set** (ui §1.2 Serve record).

**Sealed.** See §7.5 clause 1: it is **never written after it is sealed**.

### 7.4 `served_number`

Every weight-bearing number that reached a payload, with its **provenance
reference and replay handle**, **sealed with its answer version and never
updated in place**. Its **status is derived from `served_number_event`** over the
discriminant

```
PRESENT | EVICTED(MISSING-NUMBER) | WITHHELD(reason)
```

`EVICTED` is AC-12 (replay eviction with a typed `MISSING-NUMBER` mark);
`WITHHELD` is **AC-26's withheld parent — an unjudged or abstained conjunct under
strict-and**. **All three are distinct from *absent*, which is not representable
in a payload** (AC-63).

**AC-22's undeclared-operator limb is deleted, and AC-26's limb survives
(DR-074).** The two are not one rule and only one of them lost its trigger.

- **DR-074 makes the deployment-level scoring operator MANDATORY, never blank** —
  a **required** register row, with parent- and run-level overrides optional on
  top of it. So `WITHHELD(no operator declaration)` has **no reachable
  producer**: the resolution chain cannot terminate undeclared, and a row that
  could never be written is an **AC-77 orphan** (charter VR-4 — removed rather
  than left unreachable). It is removed here, not fenced.
- **`WITHHELD(strict-and conjunct unjudged or abstained)` is untouched.** Its
  trigger is a *conjunct*, not a *config*: under strict-and, a parent whose
  conjunct carries no judgement has no product to serve, and DR-074 changes
  nothing about that. AC-26 stands, the member stands, and the fixture that fires
  it stands.
- **The anti-defect property survives the deletion by a different mechanism.**
  What the withhold path used to protect was D2 — an operator arriving from a
  source literal. DR-074 preserves that property *via the mandatory register row*
  (the operator is always a recorded config value) rather than via a runtime
  fallback, and §6.4a/§6.5 record the **effective operator and the level that
  supplied it** so the property is checkable on frozen rows. Nothing is lost;
  the guard moved from runtime to configuration.

**The `served_number_event.status` enum is unchanged at three members** — the
deletion removes a *reason*, not a member (§13).

### 7.5 The eviction rule (AC-12 × AC-63 × AC-44)

**The problem, stated once.** The composed text was written from a bundle in
which every number was present, and it passed conformance against that bundle —
and the conformance verdict is a **frozen input artifact, never regenerated**
(AC-07). So when the continuous replay self-test later evicts a number (DR-059),
prose that recites it would otherwise keep serving: the reader would see a
number with **no origin and no replay handle**, which AC-63 states as an
absolute (*"or it does not arrive"*), and the conformance record would still
attest that segment as `JUDGED` against a fact that no longer exists — AC-44's
*"no served sentence may imply a check the ledger says did not run"*, read from
the other end.

**The rule, in the only shape the pack admits** (Plan.md §4.4; this supersedes
the round-1 wording, which wrote `SUPERSEDED` into the conformance record and
produced a part-composed / part-components answer — both halves were defects:
the first mutated a frozen replay input, the second minted a third
answer-surface state).

**1. The conformance record is never written after it is sealed.** AC-07 /
DR-060(b) make the serve decision replay **as stored data** with the conformance
verdict an input artifact *never regenerated*; if eviction edited its
per-segment states, a ceremony run after an eviction would replay a different
serve decision than the one served, and §4.1's standing rule 1 independently
forbids the unpreserved mutation. Its per-segment vocabulary stays the ruled
three — `JUDGED / SAMPLED_PASSED / NOT_SAMPLED` (DR-060a) — with **no fourth
member minted here**; a new typed state may only be minted where spec §12.3's
authority allows (AC-65, S-13).

**2. Suppression is a separate, append-only serve projection.**

```
segment_suppression {answer_id, answer_version, segment_id,
                     evicted_number_ref, at_seq}
```

written when a `served_number` transitions to `EVICTED(MISSING-NUMBER)` and
**keyed to it**. The **served** per-segment state is the **derived join** of the
frozen conformance record and the suppression rows — AC-88's *"status is
derived, never asserted"*, applied here. **The replay ceremony reads the
conformance record without the overlay**, because the overlay post-dates the
serve decision it is replaying.

**Its named served consumers, so it is not an orphan** (AC-77; the never-called
list is BLOCKING): the **tier-2 authorized record**
(`GET /v1/answers/{id}/inspection`, where the suppression rows say *which*
segments the eviction withdrew and why) and the **execution-ledger digest**
(`GET /v1/answers/{id}/ledger-digest`, AC-44 — the degradation is a thing that
happened and the digest is where the reader learns it happened). Under clause 3
there is no served composed text after an eviction, so **without these two
consumers named the rows would be charter G5 dead cost on the day they land**.

**2a. The carrier for both transitions, named once.** They are the only two
state changes eviction causes, and Seam D classes `served_number` as a **frozen
artifact**, so neither may be an in-place update (§4.1 standing rule 1). **One
append-only stream carries both:**

```
served_number_event {answer_id, answer_version, number_ref,
                     status ∈ {PRESENT, EVICTED, WITHHELD}, reason, at_seq}
```

- The number's **current status is derived from its latest event**.
- The **answer's current serve state is derived too**: an answer with ≥1
  `EVICTED` event for its version projects as **components-only + `DEFECT`** —
  which is clause 3 **expressed as a projection rather than as a write**.
- **Nothing is overwritten**: the original `served_number` rows, the composed
  text, the fact bundle and the conformance record all stay exactly as sealed.
- **Version selection on reads**: `GET /v1/answers/{id}` returns the **latest
  `answer_version` with its current derived projection**; `?version=` returns
  that version's artifacts **as sealed**, and **the replay ceremony always reads
  the sealed form**.

So the historical answer **replays byte-identically** while the live read
**shows the degradation** — the two questions eviction raises, answered by one
carrier.

**3. Eviction transitions the whole answer to components-only + `DEFECT`.**
`RULED(DR-049, DR-057)` and ui §4.0 give exactly **two** answer-surface states —
*"Composed, or components-only + DEFECT"* — and W20 renders those two. A
part-composed/part-components hybrid would be a third state with **no ruled
rendering**, and charter §5.2 row 12's fixture would be written against a
surface the interface contract does not admit. The two-state reading also
satisfies DR-059's *"the rest serves"* directly: the verified facts, badges and
node graph serve, the evicted number carries its typed missing-number mark, and
**one number is lost, never the answer**.

*Recorded for V, because the pack never ruled it* (Plan.md §8 rule (iii)):
evicting a single component number therefore **withdraws the whole composed
text**. This is the only reading consistent with ui §4.0's two states, and the
reading-experience cost is a consequence V may want to see. A **post-serve**
eviction is a *degradation of an already-served answer*, not a fourth
compose-time route into components-only — compose-time entry is only ever by
AC-53's three ruled routes.

**4. The fixture asserts three things**, alongside charter §5.2 row 12's own
assertions (S5): (a) the **frozen conformance record is byte-identical** before
and after the eviction; (b) the **historical replay** of the sealed answer
version still passes, reading the sealed artifacts **without the overlay**; and
(c) the **current projection** of that answer reads as `components-only +
DEFECT` with the evicted number carrying its typed missing-number mark.

### 7.6 `answer`

`(answer_id, answer_version, as_of)` (AC-73), `run_id`, **verdict state and
confidence band as ordered labels** with the cut-point matrix supplied by the
register (AC-66, AC-74), **`band_ceiling`**, **serve state as sealed at serve
time — with the *current* serve state derived from `served_number_event`** per
§7.5 clause 2a, root node, and refs to bundle / conformance record / composed
text.

- **`band_ceiling {label, basis}`** is AC-24's way-of-knowing ceiling label that
  charter VR-2 requires **every band to name**, computed from the
  `way_of_knowing` distribution over the answer's load-bearing nodes and
  **printed beside the band**. **DR-082 rules it a second, independent gate**
  beside DR-044(Q51)'s three blocking gates — not a restatement of them — and
  **DR-086 rules what firing does: it CAPS the confidence band.** The answer
  **serves**, cannot reach the top band, and **wears its ceiling label visibly**;
  it is **never a silent block**, which mirrors DR-014's cap + label + recorded
  lift-path pattern. Two schema consequences: the column is **non-optional** (an
  answer with no ceiling label would be an answer whose band names nothing,
  which VR-2 forbids), and `basis` records the **distribution the cap was
  computed from**, so the cap is replayable rather than re-derived. **The label
  vocabulary and the cut points are register rows V ratifies at DR-023** —
  **no value appears here** (AC-74, AC-76).
- **`phase`, `envelope_*`, `register_version` and `battery_version` live on
  `run` (§3), not here**; `answer` carries only their **serve-time
  projection** — because the envelope must be visible **before any answer
  exists** and the phase gate is read **during** the run (spec N-9; DR-053
  F-12).
- Verdict state and confidence band are **two independent axes**; an abstention
  is **neither**, and is carried in its own field (AC-66; DR-066(3); spec §12.3
  S-14).

### 7.7 `condition_mark` and `condition_mark_node`

```
condition_mark {mark, scope ∈ {answer, node}, subject_ref, reason, lift_path?}
```

with membership **imported from spec §12.3** (AC-65) — the closed set of **5
abstention kinds** (ignorance-ledger unknowns only) + **22 condition marks** +
**5 terminal routes**, of which spec §12.3's table is **the only place a typed
state may be minted**; sibling artifacts **cite, never extend**.

**The terminal-route count is five, in spec §12.3 itself.** Home 3 lists **five**
routes — inert stop (Q1) · false-presupposition non-answer (Q3) · value→human
(Q7, pure value acts only per DR-053) · `NOT_EMPIRICALLY_DECIDABLE` (Q9) ·
depth-zero, no-justification-no-split (Q10). Row 5's authority is **DR-037**, and
it was **placed in the table by DR-099 / amendment A-01** with DR-100 listing the
correction in its mechanical follow-through. **§12.3 and DR-037 now agree**, so
this document cites the §12.3 membership like every other sibling artifact
(AC-65, S-13) and carries **no exception**.

**The split that used to force an exception is history, and is recorded as
history so nobody re-derives it.** Plan.md AC-65 transcribed *"4 terminal
routes"* from a §12.3 Home-3 table that then listed only four while DR-037 and
spec §5.2 F-4 both enumerated five — the founding pack was split against itself,
and under S-13 an unplaced typed state is a specification defect. This document
therefore sourced the five to **DR-037** on the order-of-authority rule (the
ledger wins over a founding doc; spec §2 item 1, manifest §2.2 item 1). **That
workaround is retired.** The founding edit **minted no new typed state** — the
route's authority was always DR-037 — so the correction placed an
already-ruled state rather than creating one, and S-13's single-minting-place law
is untouched.

**Two consequences of the correction, both live now:**

- **A membership-and-count test MAY assert against the §12.3 Home-3 table for
  terminal routes.** The prohibition this section carried — *"no
  membership-and-count test may assert against the Home-3 table"*, which existed
  only to stop `FX-LG-04` freezing the known-incomplete side — is **lifted**.
  `FX-LG-04` asserts **5 abstention kinds + 22 condition marks + 5 terminal
  routes** against §12.3 itself, on the same footing as the other two homes.
- **Gap `TRACE-7 ≡ H-C-1` is DISCHARGED** (§19), and the founding table's own
  edit note says so.

**`condition_mark_node` is the single authoritative store of the affected set**
— a join table **populated at write time from the ledger rows that caused the
mark**.

**There is no `affected_node_ids` array on the mark row.** Two storage sites for
one fact is the same two-copies-no-reconciliation defect UI-9 was corrected for,
and AC-85's "one behaviour, one place" applies to data. The join is the one
shape that supports **both** write-time population and the read-time projection.

**The affected set is load-bearing, not decoration.** DR-021 knob 10 and ui §4
row 8 require the answer-level list to be *"echoed into **each affected node's**
provenance"*. An answer-scoped row whose only `subject_ref` is the answer would
project to the **empty set for every node** — so an enrichment row skipped for a
subtree would show `SKIPPED-BY-BUDGET` on the answer and **on none of the nodes
it describes**. That is a served-but-unreachable honesty surface, the D4 shape,
and it would silently fail charter §5.2 row 6's **BLOCKING** fixture if the
fixture inspects a node.

**The fact is stored once, at answer scope, with its affected set; the per-node
appearance is a read-time projection over that set** (Plan.md §6.6 UI-9).

### 7.8 `abstention`

Kind (**one per ignorance-ledger unknown**), the **price cell**
`(question_class, risk_tier, price)` **naming its register row**, the unlock
condition, and the ledger-unknown ref (AC-65). The price cell's *values* are
register rows (spec D-7), and the cell is **printed where it is used** (AC-75).

**DR-080 rules the question-class axis is its own vocabulary.** The three closed
sets of six are **three separate declared vocabularies**, not one axis, plus
**two explicit register-row mapping tables** — `Q8 type → abstention class` and
`(Q7 act, Q8 type) → scorecard task class`. So `question_class` here draws on the
**abstention-class vocabulary**, reached from a Q8 type through the first mapping
table, and never on the Q8 type directly. **The mapping tables' contents are V's
at register ratification** (DR-023); their **home is `register.register_row`**, on
§9.1's precedent — one mechanism for one kind of fact (AC-85).

### 7.9 `answer_index`

The list surface, **keyset-paginated** (AC-62), carrying **names, not numbers**:
verdict state, staleness state, abstention kind + cell *name*, serve state,
builds-on-previous flag (Plan.md §5.3; §6.6 UI-10).

**Decided here, under this lane's authority (SEAT-PROPOSAL): `answer_index` is a
read-time view — a projection over the authoritative rows, not a base table and
not a materialized cache.** Plan.md §7 row 3 assigns this document the table
shapes and their canonical owners, and nothing in the pack makes the carrier V's
choice, so leaving it open was a refusal of assigned work rather than a gap. Four
reasons, each a constraint rather than a preference:

1. **Every field it carries is derived elsewhere** — verdict state and serve
   state from `answer` (with serve state's *current* value derived from
   `served_number_event`, §7.5 clause 2a), staleness state from
   `core.staleness_state`, abstention kind and cell name from `serve.abstention`.
   A base table would be **a second writable store of facts that already have
   one** (AC-85; AC-88's *"status is derived, never asserted"*).
2. **Seam D puts it on the projection side by definition**: badges, marks and
   summaries are *computed at read time from stored typed fields*, and only the
   bundle, the conformance record and the served numbers are frozen (Plan.md
   §3.2 Seam D).
3. **AC-64 makes read-time computation mandatory, not optional**, for exactly
   one of its columns: an answer whose staleness changed after serving must show
   the change **on the next read**. A materialized index would serve a stale
   staleness state — the one failure AC-64 names.
4. **AC-62's keyset pagination does not need a materialized row.** The
   `(as_of, answer_id)` keyset index lives on `serve.answer`, the authoritative
   table (§16), and the view paginates over it; `limit` + opaque `cursor` are
   both sent and honoured, and the read stays side-effect-free.

**The invalidation contract a materialized form would have owed is therefore not
owed** — there is no cache to invalidate. If a later measurement shows the view
cannot meet a latency budget, the replacement is a materialized projection with
a **recorded derivation version**, on the same terms as `scorecard_cell` (§8,
AC-41): a cache with a replayable definition, never an independent write path.
That change would be a performance decision recorded against this section, not a
new authority for those facts.

### 7.10 `shadow_suppression` — AC-91's shadow-mode record (A-10, accepted)

**Accepted architecture at DR-099 (amendment A-10).** AC-91 has three limbs.
**Two already have homes and one did not:**

| AC-91 limb | Home |
|---|---|
| a withheld verdict tells the reader **why in prose** *and* **what would unlock it** | `condition_mark.lift_path` (§7.7) and `abstention`'s unlock condition (§7.8) — already carried |
| the value overlay **reuses this shape** | `overlay_run` (§11A.3) writes into the same record rather than a second table |
| the evidence gate runs in **shadow mode, publishing what it would have suppressed beside the unsuppressed band** | **nothing** — the carrier below |

```
shadow_suppression(
  answer_id, answer_version,
  gate ∈ {EVIDENCE_GATE, VALUE_OVERLAY},   -- AC-91's own two named users
  subject_ref,                              -- the verdict or node it would have hit
  would_have_suppressed,                    -- what the gate would have withheld
  unlock_condition,                         -- the same unlock the bound gate owes
  at_seq
)
```
Append-only, keyed to the answer version, and **published beside the unsuppressed
band** — the band itself is untouched, which is what "shadow" means.

**It is not `segment_suppression` (§7.5 clause 2), and conflating them would be a
serving defect.** `segment_suppression` records a suppression that **happened**,
withdrawing a segment after a replay eviction; `shadow_suppression` records one
that **did not happen** while the gate is observed rather than binding. One is a
degradation of a served answer, the other is evidence for a decision about
whether to bind a gate at all.

**Why the gate ships unbound — now ruled (DR-085).** The `OD-20` evidence gate
ships **tier-invariant with shadow mode**: **eligibility is the exact complement
of spec §5.2(f)'s evidence-free list**, the **tier × claim-type map is an empty
register table V fills**, and **until it is filled the gate publishes what it
would have suppressed beside the unsuppressed result**. This table is that
publication. Three consequences for the schema:

- **The eligibility rule is ruled, so the gate is buildable now** — it is a
  complement of a founding-doc list, not a register row, and it reads
  `core.node.claim_type` plus **DR-087**'s placement of `mixed` and `unknown` on
  the gated (fail-closed) side (§5.1).
- **The map's contents stay V's**, and an empty map is the *specified* state
  rather than a missing one: inventing per-cell eligibility is barred (DR-039,
  AC-76).
- **Both states must be exercisable** by a configuration a production caller can
  produce — the register-gated-branch discipline (charter G4), which is what
  keeps shadow mode from becoming a permanently dark branch.

### 7.11 The typed `unavailable` verdict (A-10, accepted)

**Accepted architecture at DR-099 (amendment A-10).** AC-90's honest-degradation
vocabulary has three clauses; each needs a representation that **cannot** decay
into a number.

| AC-90 clause | Carrier |
|---|---|
| *a verdict with no usable basis degrades to a typed `unavailable`, **never to a number*** | an **optional typed record on `answer`**, sibling to the abstention field: `verdict_unavailable {reason_ref}`. When present, **`verdict_state` is not populated and neither is the confidence band** |
| *a lean with no live supporting or attacking node returns **nothing**, never a fabricated even split* | **no `served_number` row is written.** There is no lean number, therefore no row — which is exactly the difference between "no row" and "a row carrying 0.5" |
| *a missing or malformed input is read at its **honest zero-information value**, never guessed* | `evidence.absence_row` (§11A.1) for the missing case; `raw_artifact`'s parse status and error for the malformed case (§6.2) — both already persisted unconditionally (AC-13) |

**`unavailable` is not a fourth `verdict_state` member, and must not become
one.** DR-066(3) closes verdict state at **SUPPORTED / CONTESTED /
UNSUPPORTED**, and AC-66 puts an abstention *"in its own field, never as a band
and never as a mid-range number"* (spec §12.3 S-14). The unavailable case takes
**that same shape**: its own field, no band, no number. Adding a member would
extend a ratified closed enum — the move §5.5(1) refuses for arrow kinds.

**No new reason vocabulary is minted here.** `reason_ref` points at the existing
typed vocabulary (`serve.condition_mark` / `serve.abstention`, spec §12.3).
**One residue V confirms, flagged rather than ruled** (DR-099's own note on
A-10): whether the token `unavailable` itself, when it **surfaces to a reader**,
needs placing in spec §12.3's table by amendment — because that table is the only
place a served typed state may be minted (AC-65, S-13). This section keeps it a
**field** precisely so no state is minted; the carrier is accepted either way.

---

## 8. `scorecard` — model ledger and scorecards (Plan.md §4.5)

| Table | Shape | Constraint |
|---|---|---|
| `model_identity` | provider, model id, **`model_version`** (a **required** key); a silent provider update **writes a revision trigger** | AC-42; AC-72's trigger mechanism (§10) |
| `session_assignment` | the model ledger proper: sessions and per-category model bests informing the next session's assignment — **in this same database** | DR-046; spec §16.5 K-22; AC-02 |
| `scorecard_cell` | key `(model_id, model_version, provider, task_class, metric, as_of)`; value, `n`, interval, population counts `{settled, unsettled, permanently_unscoreable, abstained}`, `basis` **with no ASSUMED / DEFAULT member** | AC-42; spec §16.2 K-3…K-11 |
| `routing_decision` | lane (served / uniform panel / critic-exempt), the guard trail, and the **propensity recorded per decision** | AC-40 (G2) |
| `answer_outcome` | `{answer, prior, posterior, basis, resolver, date, provenance}` with **read-back verification recorded as its own ledger action** | AC-73 |

**`scorecard_cell` is a derived view, materialised with a recorded derivation
version.** A scorecard is a **pure function of the ledger** (AC-41) — no
unrecorded smoothing window, no model in the loop, no unfrozen training set — so
the materialisation is **a cache with a replayable definition, never an
independent write path** (Plan.md §4.5).

Two reporting obligations the shape carries rather than describes: **a
leaderboard of point estimates is prohibited** (hence `n` and the interval are
columns, not options), and **at t=0 the router must behave exactly as it would
with no scorecard at all**, with capability cells at `basis: NONE` until settled
outcomes exist (AC-42, AC-43; spec §16.4 K-20/K-21, OQ-G1).

---

## 9. `register` (Plan.md §4.6)

| Table | Shape |
|---|---|
| `register_row` | key, declared type, value, unit, `register_version`, ratified-by, ratified-at, `is_provisional`, **recalibration owner + trigger + sign-off route** (charter A5.2), and the **resolution scope** (deployment / run / parent) where the row participates in a chain |
| `register_version` | an **immutable set of rows**; every run pins one, so a register change is visible in replay and cannot retroactively move a served number (AC-06, AC-74) |

**Rows are keys with no invented values**: the register skeleton ships **every
key the pack names and values only where the pack states one** (AC-76). The key
inventory itself lives in `05-register-skeleton.md`, not here.

AC-22's `OD-22` operator resolution chain (parent → run → deployment) is **one
instance of the same resolution-scope mechanism**, not a special case (Plan.md
§4.6).

**DR-074 rules the deployment level MANDATORY.** The deployment-level scoring
operator (accumulate vs strict-and) is **never blank — a required register row,
with no undeclared/withhold state at the deployment level**; parent- and
run-level overrides stay optional on top of it. Three schema consequences:

1. **`register_row` carries the operator key as a required row of every
   `register_version`** — a version missing it does not ratify, which is what
   makes "never blank" a property of the data rather than of the loader.
2. **The declare-once / withhold runtime machinery is dropped from the design**,
   because nothing is left to trigger it. §7.4 removes its served consequence and
   `03-module-design.md` §10 removes the failure row; DR-074's own words are that
   it is *"dropped from the design (nothing left to trigger it)"*.
3. **The anti-defect property is preserved by the mandatory row, not by the
   fallback**: the operator is *"a recorded config value, never a hardcoded
   literal"*, and §6.4a/§6.5 record the effective operator **and the supplying
   level** so a source-literal selection is detectable on frozen rows.

DR-074 also rescopes P-D2's fixture — from *"exercises the withhold path"* to
*"operator resolves from parent/run/deployment register rows, never a source
literal"* — which is `06-test-strategy.md`'s to carry.

### 9.1 The claim-type → composition map's canonical home (A-06, accepted)

AC-92 requires the **claim-type → composition map** to be *"held as data, never
a source literal"*, and Plan.md §4 names no table for it. **Accepted at DR-099
(amendment A-06): its canonical home is
`register.register_row`** — one V-ratified row whose declared type is a map from
the closed claim-type vocabulary (DR-062 `OD-16`) to its composition, pinned per
run through `register_version`.

**Why the register and not a new table**, in four constraints:

1. **The pack's own precedent for mappings is a register row.** Plan.md §6.2
   AM-3 disposes two structurally identical maps — `Q8 type → abstention class`
   and `(Q7 act, Q8 type) → scorecard task class` — as *"two explicit mapping
   tables as register rows"*. One mechanism for one kind of fact (AC-85).
2. **AC-74 already forbids the alternative it competes with.** Constants never
   live as source literals and every one of them is a register row; a map is the
   same fact with a wider declared type, and inventing a bespoke table for it
   would put one class of configuration outside the register V ratifies.
3. **Replay needs it pinned, and the register is what runs pin.** Every run pins
   a `register_version` (§3.2), so a composition-map change is visible in replay
   and cannot retroactively move a served number (AC-06). A free-standing table
   would need that pinning mechanism rebuilt beside it.
4. **AC-84 says this is how research lands** — validated findings become
   register rows, **not** changes to the graph shape, the ledger schema or the
   serve contract. A composition-map revision is precisely such a finding, and
   `OD-17` names the condition under which the type vocabulary itself may be
   revised.

**What remains V's after DR-099**: the row's **key name and its declared value
type** (`05-register-skeleton.md` owns the key inventory), and V's ratification
of the map's contents at DR-023. **This document names the home, not the
contents** — the map's members would be an invented mapping otherwise (DR-039,
AC-76). **The map's key domain is `core.node.claim_type`** (§5.1), which is where
the `OD-16` vocabulary is stored per row.

---

## 10. `memory` (Plan.md §4.7)

| Table | Shape | Constraint |
|---|---|---|
| `question_key` | the projection of **already-frozen fields** (settlement act, question type, declared field, normalized binding, hash of the frozen query set), with `as_of` and `policy_version` carried as **link attributes, not identity** — **the memory key is deliberately not the cache key** | AC-68; spec §17.1 M-2 |
| `memory_link` | typed directed edge `{REPEATS, REFINES, CONTRADICTS_PRIOR, RELATED_ONLY}` with tier, agreed/disagreed fields, decider, timestamp, key version, alias rows used. **No transitive closure** — enforced by the **absence of any closure job** plus a property test | AC-69; spec §17.3 M-9…M-11 |
| `alias_row` | `{surface, canonical, confirmed_by, confirmed_at, from_run_pair, key_version}`, written **only when a link is confirmed**, dated, reversible, and a **replayable input** | spec §17.2 M-8 |
| `pull_record` | pinned `{artifact_id, version, content_hash, as_of, staleness_state_at_pull}`; an **unpinned pull makes the new answer unreplayable**. The flat declared pull cap's register row is **printed where used** | AC-70, AC-75 |
| `asker_scope` | question-level pulls carry the **asker partition**; class-level facts do not | AC-71; DR-061 · `OD-M-20` |

Two standing rules of this schema: **link, never merge** — every ambiguous
default resolves to *"do not link, and say a candidate was found"* (AC-69) — and
**`NULL` is never agreement** (AC-68). The four match tiers
(`EXACT_QUESTION → SAME_BINDING → PARTIAL_BINDING → TERM_OVERLAP`) are
**computable as database predicates over already-frozen fields**; **there is no
embedding pipeline in the memory path for v1** (AC-68).

**The identity behind `asker_scope`'s partition is ruled at DR-070: the asker is
the requesting user/person.** No separate authenticated-principal / session-scope
model is built at this stage — authorization and user credentials are explicitly
**out of scope**, and V2's existing `user_dev_token` vertical slice is adopted as
sufficient. So the partition key is the requesting user, and the
`EXACT_QUESTION` tier is evaluated within it.

**DR-070 is a provisional simplification and the schema keeps the seam open.**
The ruling's own condition is that authorization/credentialing is *deferred, not
designed away*, and that real principal/session separation may be needed before a
multi-tenant or credentialed launch, with **charter-A5.2-style revisit language
carried when it is built**. `asker_id`, `session_id` and `caller_scope` therefore
stay **three distinct columns** on the run head (§3.2) even though one identity
currently populates the partition — collapsing them now would make the revisit a
migration of served history rather than a change of resolution rule. The stakes
DR-070 defers, recorded: if caller scope and asker identity are later conflated,
either the `EXACT_QUESTION` tier silently becomes per-asker or a question-level
pull crosses an asker boundary — a confidentiality failure, not a modelling
nicety (AC-71).

---

## 11. `core` — liveness (Plan.md §4.8)

- **`revision_trigger`** — watched conditions, including Q58's named ones, **a
  provider `model_version` change**, and a **`CONTRADICTS_PRIOR` link**.
- **`review_clock`** — class TTL review clocks.
- **`staleness_state`** — **per node and per answer**, over
  `{FRESH, UNDER_REVIEW, STALE, ARCHIVED_REVIVED}` (AC-72; ui §4 row 4).

**Retirement writes `ARCHIVED`; nothing is deleted** (AC-05). Retirement is
archival: the full graph is kept and **auto-revived by the next query through
staleness review** (AC-05; spec §13.2 T-7, DR-016).

Staleness is **a ceiling and a refusal rule, never a silent multiplier**, and a
fired trigger serves with a visible `STALE` / `UNDER-REVIEW` badge, never
silently (AC-72). Because the state is stored typed and the badge is a **read-
time projection** (Seam D), AC-64's freshness invariant holds by construction:
every read of an answer after a wake-up exposes that answer's current staleness
state.

**AC-89 × AC-62, the one cross-artifact contradiction on this path.** Manifest
§9.2d requires stale jobs to transition to failed *"on every read"*; ui §2
surface 14 forbids a read carrying a write side effect. **The obligation is
split**: the **state transition** is performed by a **scheduled reaper**; the
**read derives** the failed status from the job's deadline **without writing**.
That satisfies AC-88's *"status is derived, never asserted"* and AC-62
simultaneously, and preserves §9.2d's actual guarantee — a stuck job can never
masquerade as work-in-progress on any read — because the derivation is evaluated
on every read even when the reaper has not yet run (Plan.md §6.6 UI-13).

---

## 11A. Proposed carriers for the objects Plan.md §4 does not declare

**Status of this whole section: ACCEPTED at DR-099 (amendments A-06 and A-07).
Nothing here is carried by Plan.md §4** — these are the shapes that closed gaps
`DM-1`, `DM-2` and `DM-4`, which the merge verdict recorded as **REAL** and which
the FinalPlan consolidation carried to V. **Section numbering is deliberately
`11A`** so that adding it does not renumber the sections the rest of the C4 set
cites (Plan.md's own §4.1a uses the same device).

**Three rules held throughout.** (i) **No object is invented**: every table below
carries objects Plan.md §3.1 and §8 name by name, and a table that would need a
field the pack does not name is left with that field absent and said so.
(ii) **No enum is minted**: where membership is V's, the column is proposed and
the members are not. (iii) **These are homes, not behaviours** — where a
behaviour is open, the `Q-nn` marker travels with the carrier exactly as
everywhere else in this document.

**Why the gap is real rather than cosmetic.** `07-build-order.md` §4 promises S6
to deliver frozen queries, typed amendments, admissibility, access depth,
**absence rows**, provenance clusters, freshness, probe capture and instrument
certification; S8 to deliver the independence receipt, the symmetry diff and the
objection ledger; S10 to deliver reversal points. AC-44 (*everything executed is
recorded*), AC-70 (pinned pulls) and AC-13 (raw artifacts persisted
unconditionally) all require persistence for these, and **§4 declares no table
for any of them** — so three slices would reach their start date with no
data-model home (H-O-11).

### 11A.1 `evidence` — context 2's objects (slice S6; A-06, accepted)

A **seventh namespaced schema, `evidence`**, on the same database and the same
migration lineage — schemas, not databases, so AC-02 is unaffected (Plan.md
§2.4).

| Proposed table | Shape | What forces it |
|---|---|---|
| `query_set` | the **frozen** query set for a run: the queries as issued, `content_hash`, frozen-at sequence. Immutable. | spec §7.1; `memory.question_key` already hashes *"the frozen query set"* (§10), so the hash has a consumer before this table exists |
| `query_amendment` | **append-only** typed amendments against a frozen set: `{query_set_ref, kind, reason, at_seq}` — the set is never edited in place | spec §7.1; §4.1 rule 1 |
| `source_record` | a source with its **three-valued access depth** — `access_depth ∈ {OPENED_FULL, PREVIEW_ONLY, ACCESS_BLOCKED}`, a **required record** (spec §7.3 E-7; inventoried at §13), with **primary versus secondary recorded alongside it** as its own field. `CHECK`: **a preview-only source may never supply a number or quote** — the quote/number reference columns must be null at preview depth | Plan.md §3.1 context 2; **spec §7.3 E-7**; spec §7.2 |
| `evidence_item` | an extracted item: source ref, excerpt (truncation marked at word boundaries, non-truncated excerpts byte-identical — AC-92), admissibility under the mixed rule, **freshness stamp never cached**, and its **provenance cluster key** | AC-23; AC-92; spec §7.2–§7.4 |
| `absence_row` | a recorded absence: what was looked for, where, when, and the typed absence reason. **This is the row AC-90's honest zero-information value needs** — a missing input is read at that value, **never guessed** | AC-90; AC-44's *"could-not-dos"*; spec §7.3 |
| `probe_capture` | Q20/Q22's probe execution capture | spec §7.5; §3.5 Q22 |
| `instrument_certification` | Q23's instrument certification record | spec §7.5; §3.5 Q23 |
| `citation_route_record` | one row per citation attempt carrying its **typed route**. The **column exists; the enum's membership is under ratification** — **DR-084** rules that *architecture proposes the closed enum and V ratifies*, with **loud failure and no generic "other"**, and any member that surfaces to a reader placed in spec §12.3 by amendment (S-13 intact). The proposal is the DR-084 ratification package; **this document still mints no member** (DR-039, AC-76) | DR-020 knob 13 ("from day one"); **DR-084** |

**Two things this schema deliberately does not get.**

- **No table for the citation hard-kill gate and no coverage-gate state.**
  Charter §5.2's deferred table (`RATIFIED(DR-020 knob 7)`) says the hard-kill
  gate *"does not ship … it must not exist as code that cannot fire"*, and
  coverage *"ships as the diagnostic `UNCOVERED-SCOPE` note only"* — which
  already has a home, item 13 of `node_epistemic_record` (§5.3). Giving either a
  table would be shipping the deferred gate's carrier (Plan.md §6.7 D-4/D-5).
- **No second home for cluster collapse.** The **cluster key** is an
  evidence-side attribute (`evidence_item` above); the **collapse** is a
  compute-time gate inside the pure core whose record stays on `propagation_run`
  (§6.4). Two homes for one fact is the defect §7.7 was corrected for (AC-85).

### 11A.2 `critique` — context 5's objects (slice S8; A-06, accepted)

Proposed as tables in **`core`** rather than a new schema, because every one of
them is scoped to a run and joins the graph: `packet_fingerprint` is already a
named hash in §4.1 rule 4, and the residual objection set is already a **field of
the fact bundle** (AC-51) that needs an authoritative origin.

| Proposed table | Shape | What forces it |
|---|---|---|
| `critique_packet` | the **blinded, fingerprinted** packet: `packet_fingerprint`, the critic's lineage/maker, the blinding applied, run ref | Plan.md §3.1 context 5; §4.1 rule 4 names the hash |
| `independence_receipt` | Q39's receipt, **recorded even when there is no critic**; independence is **never fabricated**, and *"independence unknown"* carries a **typed reason, never a default of "independent"** | AC-92; Plan.md §3.1 context 5 |
| `symmetry_diff` | the set/count diff carrying AC-46's **two stamps** (`subject_item_id`, `stance_at_action`) and **no fairness scalar**; `UNINSTRUMENTED` withholds the fairness claim and **caps the confidence band, never the verdict state** | AC-46; AC-66; OQ-G8; spec §8.1 |
| `objection_record` | the residual objection set as a **first-class object**: which objections were closed, by what, and which still stand. The `fact_bundle`'s Q53 residual-objection **field projects from this table**, so the bundle is not a second writable store (AC-85) | AC-51; DR-049; manifest §6.2 item 12 |
| **`verification_trigger_basis`** | **DR-091's carrier** — the CROSS-entry leverage snapshot recorded as **the trigger's basis**. Shape below | **DR-091**; AC-29 |

#### `verification_trigger_basis` — the CROSS-entry trigger basis (DR-091)

**DR-091 rules the CASUAL-tier blind-verification trigger**: it is a **CROSS-entry
leverage snapshot**, *computed from the then-current graph by the pure core, no
model calls*, **recorded as the trigger's basis**; the **COMPOSE-time
recomputation is authoritative**. V explicitly authorized the proxy the plan
refused to select silently, so the proxy must be **visible on the record** —
which needs a carrier, and Plan.md §4 has none.

```
verification_trigger_basis(
  run_id, node_id,           -- graph-scoped like every graph FK (C-11)
  leverage_snapshot,         -- computed by the pure core from the then-current graph
  snapshot_at_seq,           -- BEFORE the CROSS row executes; the ordering is the point
  triggered,                 -- whether this basis fired the blind verification
  engine_version
)
```

Immutable, one row per `(run_id, node_id)` evaluation of the trigger.

**It is not `sensitivity_record`, and merging them would break AC-29.** They look
alike and are opposites in write order:

| | `verification_trigger_basis` | `sensitivity_record` (§11A.3) |
|---|---|---|
| computed | **before** CROSS, from the then-current graph | **after** the propagation run it describes |
| consumed by | a **routing decision** — whether to run blind verification | **nothing in the arithmetic**; it is an output |
| relation to a score | **never an input to one** | **never an input to one** |
| authority | a **proxy**; the COMPOSE-time recomputation supersedes it | the measured leverage/fragility for that run |

**AC-29's no-feedback rule holds in both directions, and this is the row where it
could have been lost.** A leverage snapshot that entered the evaluation snapshot
would make leverage a weight — precisely what AC-29 forbids and what charter §1
calls out. The snapshot is therefore **not a field of Seam A's evaluation
snapshot** (`03-module-design.md` §6.1 lists that snapshot's five fields, and this
is not among them), so the pure core **cannot** read it back; it computes it, the
shell records it, and the trigger reads it. The structural exclusion is the same
device §5.6 uses for the semantic-restatement flag.

**Tier scope, recorded.** DR-091 rules this trigger for **CASUAL** tier only;
**standard and high-stakes coverage is unchanged — always verify** (DR-019 knob
3). A standard-tier run therefore writes no trigger basis, because there is no
trigger to base: verification is unconditional. A row is a record that a
**decision** was made, so writing one where no decision existed would be a
fabricated provenance (AC-34).

**`objection_record` is also the home for lane 4's residual**: `03-module-design.md`'s objection-ledger residual under `DM-2` resolves here — one authoritative store, with the fact bundle's Q53 field and the served residual set both projecting from it (AC-85). No second carrier is owed.

**No table is proposed for the two maker predicates.**
`deployment_maker_capability` and `run_maker_reachability` are **evaluated, not
stored** — one over the register's configured provider set at startup and on
every register change, one over the ledger's recorded provider errors for a run
— and the counter that classifies capped runs against them is **ledger-derived**
(Plan.md §3.2 Seam C). Storing either would create a state that can disagree
with its own inputs.

### 11A.3 `valuation` — context 6's objects (slice S10; A-06, accepted)

#### 11A.3.0 The schema home, decided here

**This section named four tables and no schema.** §11A.1 puts context 2's objects
in a new `evidence` schema and §11A.2 puts context 5's in `core`; §11A.3 said
neither, so a builder reaching S10 had four accepted tables and nowhere to create
them. **Decided under this lane's authority** (Plan.md §7 row 3 assigns this
document the table shapes and their canonical owners; DR-099's A-06 accepted the
tables without naming their schema, so this is assigned work, not a ruling):

| Table | Schema | Why that one |
|---|---|---|
| `value_hinge` | **`core`** | a **run-scoped domain object that joins the graph** — the same test §11A.2 applied to context 5's four |
| `reversal_point` | **`core`** | likewise run-scoped and graph-joined; its served form is a projection field on `answer` (AC-55), and the origin sits with the run |
| `overlay_run` | **`ledger`** | an **append-only evaluation receipt** referencing the `propagation_run` it attaches to — the exact shape and discipline of §6.4, whose home is `ledger` |
| `sensitivity_record` | **`ledger`** | **one row per node per propagation run, written after it** — the exact shape and discipline of §6.5's `node_strength_record`, whose home is `ledger` |

**Why not all four in `core`, on §11A.2's precedent.** Because a schema here is a
**discipline namespace, not a context boundary**, and §1 already shows it:
`core` holds contexts 1, 3 and 10 and `ledger` is *"written by all"*
(`03-module-design.md` §4.3 row 15). Putting `overlay_run` in `core` would place
an append-only evaluation receipt outside the schema whose whole discipline is
append-only evaluation receipts, and putting `sensitivity_record` there would
split the *"one row per node per propagation run"* family across two schemas —
two readers of the same grain, two places to look. **No new schema is minted**,
so AC-02 is untouched either way; the split costs nothing and buys the join
locality both `ledger` rows need to `propagation_run`.

**Context 6 therefore spans two schemas, and that is not a boundary violation.**
Context ownership is `03-module-design.md` §4.1's and is unchanged: `valuation`
owns every invariant over all four tables, whichever schema they sit in.

| Table | Shape | What forces it |
|---|---|---|
| `value_hinge` | the hinge, with its weight as the **discriminated union** `{source: owner_elicited` \| `org_policy, owner, vector}` **or** `{source: none}` **with no vector field at all** — the storage half of the shape §13 already inventories | DR-017; Plan.md §6.6 UI-8 |
| `overlay_run` | the overlay's own evaluation record, referencing the `propagation_run` it attaches to and carrying the **detachment proof**: every strength recomputed with the overlay detached, asserted **byte-identical**. It **consumes that run's recorded arrow order and never re-derives it** (§6.4) — otherwise the detachment check can fail for a reason that is not overlay mutation | AC-30; DR-017; Plan.md §3.2 Seam A |
| `reversal_point` | the reversal point and the **rejected criteria served**; AC-55's degraded-mode obligation requires the reversal point as a **structured projection field that renders without composed prose**, which needs a stored origin | AC-55; DR-059; DR-053's two labelled sections |
| `sensitivity_record` | per node per propagation run: **leverage, fragility and the `LEVERAGE_UNRESOLVED` residual** — written **after** the propagation run it describes and **never an input to it**, which is AC-29's no-feedback rule expressed as a write order rather than as a convention | AC-29; DR-050; charter §1 |

**`sensitivity_record` is load-bearing beyond S10.** Charter §1 defines a
**load-bearing node** as one whose removal changes the verdict or its band, and
says *"which nodes those are is **computed, not asserted** (removal-based
leverage and fragility)"*. `answer.band_ceiling` is computed over *the answer's
load-bearing nodes* (§7.6) and `composed_text` segments carry a **load-bearing
flag** (§7.2) — so without this record, two shipped fields are computed from a
quantity with no home.

**DR-079 rules the non-node senses, and they project from this same record.** A
**sentence** is load-bearing iff it asserts a fact drawn from a load-bearing node
**or** states a served number; a **claim** is iff its node is; an **unknown** is
iff removing it would change the verdict or the band. All three read off the node
sense plus facts already stored — `composed_text`'s
`segment → served_number` reference set (§7.2) supplies the "states a served
number" limb, and `condition_mark_node` / `abstention` supply the unknown's
subject. **No fourth quantity and no new column is owed**: the projection is
computable from this record and the existing references, which is why DR-079 is a
projection rule rather than a carrier request.

**Flows A/B/C and DR-053's two labelled sections get no table**: they are
serve-time projections over `answer` plus the run's phase (§3.3), and phase is
already an event.

### 11A.4 The scheduled-judgement action member (A-07, accepted)

AC-11's completeness gate is defined over *"a node for which a judgement was
**scheduled** under the running job"* (§4), and Plan.md §4.3's ledger action
vocabulary supplies **no member that makes the predicate queryable**.

**Accepted at DR-099 (amendment A-07): one new member of the ledger action-kind
vocabulary, `JUDGEMENT_SCHEDULED`**, written by the stage runner at the moment a
judgement is scheduled, carrying the node in `subject_item_id` (AC-46's stamp,
already required on every action row). **Its DR-092 `action_scope` is
`ITEM_SCOPED`** (§6.1) — it carries a subject by construction.

The predicate then reads entirely off existing tables:

| AC-11 clause | Query over |
|---|---|
| the required-node set | distinct `subject_item_id` on `ledger_entry` rows with action kind `JUDGEMENT_SCHEDULED` for the running job |
| the gate's satisfaction | ≥1 `raw_artifact` row for that node **in any parse status** (AC-13) |
| the gate's failure | a required node with **no** `raw_artifact` row in any state ⇒ the job fails and **no aggregated run is written** |

**Why this does not engage spec §12.3's minting authority.** S-13's rule governs
**typed states a reader can be served** — condition marks, abstention kinds,
terminal routes. A ledger action kind is an **internal** vocabulary whose source
is spec §8.1 A-2, is never served, and already has a declared fall-through:
an executed check mapping to no member is `UNCLASSIFIED_ACTION` and is itself an
`UNINSTRUMENTED` trigger (§6.1). **DR-099 confirms the member**; what this
document asserts beyond the name is that **some** recorded scheduling action is
required, because otherwise AC-11's predicate is stated and unqueryable.

### 11A.5 What needs no new carrier, said so it is not re-raised

- **Budget (context 11).** The cost envelope is `run_progress_event` (§3.3);
  typed skips are the `SKIPPED_BY_BUDGET` ledger outcome (§6.1) plus the
  `SKIPPED-BY-BUDGET` condition mark with its affected set in
  `condition_mark_node` (§7.7); the rate frozen at run start is on the frozen
  head (§3.2). **Nothing in context 11 is homeless** — this closes the budget
  limb of the gap this document raised at round 1.
- **Memory, liveness, settlement, register** are declared by Plan.md §4.5–§4.8
  and are in §8–§11 above.
- **The eight citation failure routes** get a column here and no members — the
  membership is under **DR-084**'s propose-and-ratify route; see §11A.1 and §18.
- **The composition-budget tier (DR-078)** needs no carrier beyond §3.2's column:
  the per-tier *values* are register rows, and the asker's *choice* is a frozen
  field of the run.

---

## 12. Write-time invariant inventory — the DDL home and its named owner (AC-32)

**One authoritative definition per invariant, in the migration that creates its
table.** Application-level checks are **restatements for error quality and are
never the authority** (AC-85; Plan.md §2.4). **Every fixture for a DDL invariant
exercises the migrated database directly — inserting through the connection,
bypassing every application validator** — or it tests the restatement rather
than the authority (Plan.md §2.4).

| # | Invariant | Mechanism | Canonical owner (migration creating…) | Restated by (non-authoritative) | Constraint |
|---:|---|---|---|---|---|
| 1 | `run` frozen head is immutable | `UPDATE` **and** `DELETE` grants revoked + raising trigger | `core.run` | the runner | AC-05, AC-45, AC-50, AC-74 |
| 2 | run progress is append-only | `UPDATE`/`DELETE` revoked + raising trigger | `core.run_progress_event` | the runner | AC-45 |
| 3 | monotone phase transition | write-time check against the latest `PHASE` event | `core.run_progress_event` | the runner | DR-053; spec F-12 |
| 4 | activation row is immutable; transitions are events | `UPDATE`/`DELETE` revoked on both tables | `core.run_row_activation`, `core.run_row_activation_event` | the runner | AC-45; spec §1 |
| 5 | initial events exist in the run's creating transaction; empty stream is a typed error on read | same-transaction insert; read-side typed error | `core.run` + the two event tables | the runner | Plan.md §4.1a; AC-76 |
| 6 | node type, lifecycle vocabularies, path/depth consistency | `CHECK` against `kernel` enums; path/depth check | `core.node` | `graph` write API | AC-32, AC-35 |
| 7 | **non-blank claim, null-safe** | `claim_text text NOT NULL` **+** `CHECK (length(btrim(claim_text)) > 0)` | `core.node_text_revision` | `graph` write API | AC-32; manifest §6.4; charter A3.2 |
| 8 | exactly one live text per node | pointer from `node` into append-only revisions | `core.node_text_revision` | `graph` write API | manifest §6.2 |
| 9 | `action_consequence` is verdict-only | `CHECK` keyed on `subject_kind` | `core.stranger_restatement` | `serve` | AC-67 |
| 10 | arrow kind is closed and binds to polarity | `CHECK`: attack ⇒ `kind IN (rebutting, undercutting)`; support ⇒ `kind IS NULL` | `core.edge` | `graph` write API | AC-35; DR-062 `OD-19` |
| 11 | **undercut targets a SUPPORT edge** | graph-scoped composite FK `(run_id, target_edge_id, target_edge_polarity) → edge(run_id, edge_id, polarity)` **+** `CHECK` | `core.edge` | `graph` write API (error quality only) | AC-19; DR-066(2); C-11 |
| 12 | polymorphic target populates exactly one column | `CHECK` on `target_kind` vs the two target columns | `core.edge` | `graph` write API | AC-19 |
| 13 | strength/magnitude agreement | `CHECK ((strength IS NULL) = (magnitude_status = 'UNKNOWN'))` | `core.edge` | pure core | AC-28; `OD-04` |
| 14 | `strength_source` placement rule | `CHECK (strength_source <> 'UNDERCUT_TRANSMISSION' OR (kind = 'undercutting' AND target_kind = 'EDGE'))`; **the member is WRITABLE** — DR-071 extends `OD-06`'s producer set 2 → 3 | `core.edge` | pure core | AC-27; DR-062 `OD-06`; **DR-071** |
| 15 | arrow identity: **collapse vs typed integrity error** | partial unique index on the identity + upsert rule of §5.5(3) | `core.edge` | `graph` write API | AC-35; manifest §4.4 |
| 16 | graph-scoped endpoints | `UNIQUE (run_id, node_id)` on `node`; composite endpoint FKs on `edge` | `core.node`, `core.edge` | `graph` write API | AC-69; C-11 |
| 17 | no self-edge | `CHECK` | `core.edge` | `graph` write API | manifest §4.4 |
| 18 | acyclicity | recursive reachability check **inside the write transaction under a per-graph advisory lock** (layer two of the three-layer cycle law) | `graph` write API — **this one is not DDL** | construction refusal (layer 1); pure core typed error (layer 3) | AC-20; Plan.md §3.2 Seam B |
| 19 | ledger append-only + total order | `UPDATE`/`DELETE` revoked; `sequence` from a dedicated allocator under a write lock | `ledger.ledger_entry` | `ledger` package | AC-08, AC-45 |
| 20 | hash columns immutable and self-naming | separate `input_hash` / `contract_hash` / `content_hash` columns | `ledger.raw_artifact`, `serve.fact_bundle` | `ledger`, `serve` | AC-10 |
| 21 | serve artifacts sealed | `UPDATE` revoked on sealed rows; status carried on event streams | `serve.conformance_record`, `serve.served_number`, `serve.composed_text`, `serve.fact_bundle` | `serve` | AC-07; §4.1 rule 1 |
| 22 | suppression and status changes are append-only | `UPDATE`/`DELETE` revoked | `serve.segment_suppression`, `serve.served_number_event` | `serve` | AC-07, AC-45 |
| 23 | affected set stored **once**, in the join | no array column on the mark row | `serve.condition_mark_node` | `serve` read projection | AC-85; UI-9 |
| 24 | register version is an immutable row set | `UPDATE`/`DELETE` revoked | `register.register_version` | `register` | AC-06, AC-74 |
| 25 | no transitive closure in memory | **the absence of any closure job** + a property test | *(no DDL — a structural property)* | `memory` | AC-69 |
| **26** | **risk tier: policy may raise, never lower** | `CHECK` that a `tier_source = 'DEPLOYMENT_POLICY'` row's `risk_tier` is **strictly higher** than the declaration `tier_provenance_ref` points at | `core.run` | `apps/api` (error quality) | **DR-094** |
| **27** | **WAIT drain: no completed run holds a waiting row** | write-time check on the `TERMINAL` event against every `(run_id, battery_row_id)`'s **derived** activation state; at most one `TERMINAL` event per run | `core.run_progress_event` | the runner | **DR-089**; AC-88 |
| **28** | **deployment operator row is mandatory** | a `register_version` without the operator key **does not ratify** — the check belongs to the version-sealing path, not to a per-row `CHECK` | `register.register_version` | `register` loader (error quality) | **DR-074**; AC-74 |
| **29** | **`value_laden` is a flag, never a claim-type member** | `value_laden boolean NOT NULL` on `core.node`, with **no `CHECK` binding it to `claim_type`** — the absence is the invariant | `core.node` | `graph` write API | **DR-087**; DR-062 `OD-16` |

Rows 18, 25 and 28 are listed deliberately: **three of the invariants in this
inventory are not table DDL** — one is a write-transaction check, one is a
structural absence, one belongs to register-version sealing — and saying so is
what stops a builder looking for a constraint that cannot exist. Row 29 is the
fourth of its kind and the strangest to read: **the invariant is the absence of a
constraint**, and writing the obvious `CHECK` would re-create the exclusivity
DR-087 removed.

---

## 13. Closed-enum inventory, with a single source each

**The rule.** Every closed vocabulary is a Postgres `CHECK` against the `kernel`
enum **plus** an application-level exhaustiveness check; unknown members fail
loudly at write (AC-35, AC-65). `kernel` is the shared-kernel module that holds
the closed vocabularies every context speaks; **its single source for condition
marks, abstention kinds AND terminal routes is spec §12.3 — transcribed once,
with a test asserting membership and count against the spec's own table, and
never extended locally** (Plan.md §3.1 module 13; AC-65, S-13).

**There is no longer an exception for terminal routes.** This document carried
one — sourcing the five to **DR-037** because §12.3's Home-3 table listed four —
and it is retired: **DR-099 / amendment A-01 placed the depth-zero route in Home
3** (follow-through named at DR-100), so **all three homes now source the same
way**. **DR-037 remains the routes' authority**, cited in the table below as
provenance; what changed is that §12.3 now agrees with it, so the transcription
reads one table instead of two and `FX-LG-04` asserts all three counts against
§12.3.

**Where the pack enumerates the members, they appear below. Where it does not,
the source is named and the membership is left to be transcribed from it — a
member that cannot be sourced is a gap to raise, never a mint** (DR-039, AC-76;
spec S-13 calls an unplaced typed state a specification defect).

| Enum | Members | Single source of membership | Where enforced | Constraint |
|---|---|---|---|---|
| condition marks | **22**, not restated here | **spec §12.3** — the only place a typed state may be minted | `kernel` → `serve.condition_mark` | AC-65; DR-051 |
| abstention kinds | **5** (ignorance-ledger unknowns only), not restated here | **spec §12.3** | `kernel` → `serve.abstention` | AC-65; DR-051 |
| **terminal routes** | **5** — inert stop (Q1) · false-presupposition non-answer (Q3) · value→human (Q7, pure value acts only per DR-053) · `NOT_EMPIRICALLY_DECIDABLE` (Q9) · depth-zero, no-justification-no-split (Q10) | **spec §12.3 Home 3** — now **complete at five**, row 5 placed by **DR-099 / A-01** (follow-through DR-100); **DR-037** is the routes' authority and spec §5.2 F-4 enumerates the same five | `kernel` → `serve.condition_mark` (**Home 3**) | AC-65; DR-037; **DR-099 A-01** |
| node type | not enumerated in Plan.md | manifest §6.2 / §6.4 node-type vocabulary | `kernel` → `core.node` | AC-32, AC-35 |
| child kind | support, attack, defeater, shared-crux sub-claim, necessary condition, sub-question, assumption, scope carve-out | manifest §6.3, `RULED — DR-062 (OD-19)` | `kernel` → sibling-ordinal banding on `core.node` | AC-35 |
| arrow kind | `rebutting`, `undercutting` — **attacks only** | manifest §6.3, DR-062 `OD-19` | `core.edge` `CHECK`, bound to polarity | AC-35; §5.5(1) |
| edge polarity | `support`, `attack` | manifest §6.3 | `core.edge` `CHECK` | AC-18 |
| `target_kind` | `NODE`, `EDGE` | DR-066(2) via AC-19 (architecture-declared carrier) | `core.edge` `CHECK` | AC-19 |
| `magnitude_status` | `MEASURED`, `UNKNOWN` | architecture carrier for DR-062 `OD-04` (Plan.md §6.4 A-2) | `core.edge` `CHECK` | AC-28 |
| `strength_source` | `EVIDENCE_VERIFIER`, `CLUSTER_COLLAPSE`, `UNDERCUT_TRANSMISSION` — **three ruled producers, all writable** | DR-062 `OD-06` for the first two; **DR-071** extends the set 2 → 3 for the third | `core.edge` `CHECK` + the §5.5(4) placement rule | AC-27; **DR-071** |
| generation status | `pending → complete` \| `failed` \| `stale` (plus a derived-only "generating" that is **never persisted**) | manifest §6.2 lifecycle 1 | `core.node` `CHECK` | AC-32; **DR-076** (§14) |
| **`lift_kind`** | `FOLDER`, `JUDGED_ANCESTOR` | **DR-072**'s two named lifting predicates (folder-lift, then `OD-02`'s judged-ancestor lift) | `ledger.propagation_run` `lift_records` + `ledger.node_strength_record.lift_marker` | **DR-072**; §6.4a |
| **cluster-record `polarity`** | `support`, `attack` | **DR-073** (collapse applies to both polarities) | `ledger.propagation_run` `cluster_records` | AC-23; **DR-073** |
| **`action_scope`** | `ITEM_SCOPED`, `PRE_ITEM` — a **declared attribute of each action-kind member**, not a row column | **DR-092**; per-member assignment transcribed from spec §8.1's row contracts | `kernel`, beside the action-kind vocabulary | AC-46; **DR-092**; §6.1 |
| **`composition_budget_tier`** | `low`, `medium`, `high` — **the tier list V amended DR-078 with**; the per-tier **values** are register rows and appear nowhere here | **DR-078** | `core.run` `CHECK` | AC-74, AC-76; **DR-078** |
| path status | `active`, `abandoned` | manifest §6.2 lifecycle 2 | `core.node` `CHECK` | AC-32 |
| exploration decision | `continue, deepen, seek_evidence, challenge, abandon, reopen` | manifest §6.2 lifecycle 3 | `core.node` `CHECK` | AC-32 |
| `check_status` | `PASS`, `FAIL`, `NOT_SAMPLED` | spec §12.7's canonical `stranger_restatement` contract (DR-061 · `OD-S-06`) | `core.stranger_restatement` `CHECK` | AC-67 |
| restatement `subject_kind` | node, verdict | AC-67 (one row per node, one per verdict) | `core.stranger_restatement` `CHECK` | AC-67 |
| `tier_source` | `ASKER`, `DEPLOYMENT_POLICY`, `DERIVED` | Plan.md §4.1a; **DR-094** rules the authority — **the asker declares, deployment policy may RAISE but never lower**. See the `DERIVED` note below the table | `core.run` `CHECK` + §12 row 26 | **DR-094** |
| `run_progress_event.kind` | `ENVELOPE_CONSUMED`, `ENVELOPE_STATE`, `PHASE`, **`TERMINAL`** | Plan.md §4.1a; **DR-089** for the fourth member | `core.run_progress_event` `CHECK` | AC-88; **DR-089** |
| envelope state | `WITHIN`, `ENRICHMENT_SKIPPED`, `EXHAUSTED` | DR-052 (Plan.md §6.6 UI-7) | derived from `run_progress_event` | AC-49 |
| phase | `EMPIRICAL`, `VALUE` | DR-053; spec §5.5 F-11…F-13 | derived from `run_progress_event`; monotone write-time check | AM-9 |
| activation state | `ACTIVE`, `INACTIVE`, `WAIT`, `POLICY_BLOCKED` | spec §1, §3 row contracts, **re-derived and ratified in-repo per DR-083** — a written predicate per row, no import of the old research artifact | `core.run_row_activation_event` `CHECK` | AC-83; spec §1; **DR-083** |
| ledger action kind | not enumerated in Plan.md; **`UNCLASSIFIED_ACTION`** is a declared member and itself an `UNINSTRUMENTED` trigger | spec §8.1 A-2 | `ledger.ledger_entry` `CHECK` | AC-44 |
| `stance_at_action` | `SUPPORTS`, `ATTACKS`, `NEUTRAL`, `UNASSIGNED` | DR-045; spec §8.1 A-1 | `ledger.ledger_entry` `CHECK` | AC-46 |
| ledger typed outcome | `OK`, `FAILED`, `BLOCKED`, `TIMED_OUT`, `REFUSED`, `SKIPPED_BY_BUDGET` | Plan.md §4.3, carrying AC-44's typed-outcome and AC-49's visible budget skip | `ledger.ledger_entry` `CHECK` | AC-44, AC-49 |
| decision classification | `categorical`, `scalar` | manifest §7.2 (AC-48) | `ledger.decision_record` `CHECK` | AC-48 |
| per-segment conformance state | `JUDGED`, `SAMPLED_PASSED`, `NOT_SAMPLED` — **no fourth member** | DR-060(a) | `serve.conformance_record` `CHECK` | AC-07; §7.5 clause 1 |
| `served_number_event.status` | `PRESENT`, `EVICTED`, `WITHHELD` — **three members, unchanged** | Plan.md §4.4 clause 2a, carrying AC-12 / **AC-26** (**AC-22's undeclared-operator reason deleted at DR-074**, §7.4 — a reason died, not a member) | `serve.served_number_event` `CHECK` | AC-12, AC-63 |
| `serve_state` | `COMPOSED`, `RECOMPOSED_ONCE`, `COMPONENTS_ONLY` | `ui §1.2` Serve record (DR-049, DR-054, DR-057), as declared in `04-api-contract.md` §10 | `serve.answer` `CHECK` — **sealed** at serve time; the *current* state is derived from `served_number_event` (§7.5 clause 2a, §7.6), so an eviction changes the projection, never this column | AC-53; §7.6 |
| verdict state | `SUPPORTED`, `CONTESTED`, `UNSUPPORTED` — **closed at three**; an abstention is neither | DR-066(3) ratifying the GLOSSARY's canonical entry (charter VR-2 concurs) | `serve.answer` `CHECK` | AC-66; OQ-G4 |
| confidence band | **ordered labels**; membership and the cut-point matrix are **register rows** | DR-023 register (spec D-1) | `serve.answer` + `register` | AC-66, AC-74 |
| `condition_mark.scope` | `answer`, `node` | Plan.md §4.4 | `serve.condition_mark` `CHECK` | AC-65 |
| `shadow_suppression.gate` | `EVIDENCE_GATE`, `VALUE_OVERLAY` | AC-91's own two named users (the evidence gate; *"the value overlay reuses this shape"*) | `serve.shadow_suppression` `CHECK` | AC-91; §7.10 |
| `work_item.state` | `READY`, `CLAIMED`, `DONE`, `FAILED` (accepted at **DR-099 / A-05**). **Internal only — never a served typed state**, so S-13's minting authority is not engaged; *"past deadline"* is **derived from `claim_deadline`, never a stored member** | architecture-declared, carrying Plan.md §2.7's queue + AC-04 + AC-89 | `core.work_item` `CHECK` | AC-04, AC-89; §3.8 |
| way of knowing | `LOOKED_UP`, `RAN`, `REASONING` | manifest §4.2h (AC-24) | `ledger.node_strength_record`; `serve.answer.band_ceiling` basis | AC-24 |
| **access depth** | `OPENED_FULL`, `PREVIEW_ONLY`, `ACCESS_BLOCKED` — **three-valued and REQUIRED, not an adjective**; primary versus secondary is recorded **alongside** it, never folded into it | **spec §7.3 E-7** (`CARRIED-DESIGN`), transcribed | `kernel` → `evidence.source_record` `CHECK`, with §11A.1's *"a preview-only source may never supply a number or quote"* rule enforced beside it | AC-35; spec §7.3 E-7; §11A.1 |
| scorecard `basis` | `MEASURED_OUTCOME`, `MEASURED_PROCESS`, `EXTERNAL_BENCHMARK`, `NONE` — **no ASSUMED, no DEFAULT** | spec §16.2 K-3…K-11 | `scorecard.scorecard_cell` `CHECK` | AC-42 |
| routing lane | served, uniform panel, critic-exempt | spec §16.5 K-25 (DR-046) | `scorecard.routing_decision` `CHECK` | AC-40 |
| memory link kind | `REPEATS`, `REFINES`, `CONTRADICTS_PRIOR`, `RELATED_ONLY` | spec §17.3 M-9 | `memory.memory_link` `CHECK` | AC-69 |
| memory match tier | `EXACT_QUESTION`, `SAME_BINDING`, `PARTIAL_BINDING`, `TERM_OVERLAP` | spec §17.1–§17.2 M-4…M-7 | `memory.memory_link` `CHECK` | AC-68 |
| staleness state | `FRESH`, `UNDER_REVIEW`, `STALE`, `ARCHIVED_REVIVED` | Plan.md §4.8; ui §4 row 4 | `core.staleness_state` `CHECK` | AC-72 |
| `weight_source` | a **discriminated union**: `{source: owner_elicited` \| `org_policy, owner, vector}` **or** `{source: none}` **with no vector field at all** | DR-017 (which removed the `default` member); Plan.md §6.6 UI-8 | storage **and** wire | DR-017 |
| claim type | not restated here; **closed**, and adding a member is a type-vocabulary revision. **DR-087 leaves it closed**: `mixed` and `unknown` stay members (evidence-GATED, fail-closed) and **`value-laden` is NOT a member** — it is a cross-cutting flag, §5.1 | DR-062 `OD-16`, with `OD-17` naming the revision condition | `kernel` → `core.node.claim_type` `CHECK` | AC-35; **DR-087** |
| typed non-answer kinds | **imported by citation from the spec, never restated** | manifest O-11 → spec | `kernel` | AC-65 |
| the **eight typed citation failure routes** | **not enumerated here — under DR-084's propose-and-ratify route** (architecture proposes the closed enum, V ratifies) | **DR-084**; the proposal is the DR-084 ratification package, not this document | `kernel`, as a closed **evidence-subsystem** enum (not a condition mark), loud failure, **no generic "other"** | **DR-084**; DR-020 knob 13 |

**The Home-3 routing observation, re-checked after the correction — it holds.**
Two rows above route to `serve.condition_mark`: Home 2's **22 condition marks**
and Home 3's **5 terminal routes**. That is deliberate and unchanged by A-01,
because **spec §12.3's three Homes are membership homes, not storage homes** —
the Home → table mapping is this document's, and it is **Home 1 →
`serve.abstention`, Homes 2 and 3 → `serve.condition_mark`**. The correction
placed a route in Home 3; it did not move where a route is stored, and it minted
no state (the route's authority was always DR-037).

**Why the rows name their Home explicitly.** The table alone cannot tell a
condition mark from a terminal route — both are `serve.condition_mark.mark`
values — so the Home is the discriminator the `CHECK` and the exhaustiveness
switch are written against. Post-correction that discriminator is **complete on
both sides**: 22 + 5, with no member of either Home unplaced. Before A-01 the
Home-3 side was short one member, so the same routing was sound but its
membership was not; **the routing was never the defect, and it is not what the
correction repaired**.

**Note on `tier_source`'s third member — ROUTED, not left floating.** DR-094
names **two** suppliers — the asker declares, deployment policy may raise — and
names no producer for **`DERIVED`**. On the ledger's own AC-77 / charter VR-4
discipline (the one §5.5(4) applied to `UNDERCUT_TRANSMISSION`), a member with no
producer must be **removed rather than left unreachable**.

**It is not removed by this fold-in, and the reason is jurisdictional rather than
hesitant.** Removing a member is **schema surgery on a reachability finding**,
and reachability is decided **against a built system**, not against a document:
the question *"does any production path produce `DERIVED`?"* has no answer until
S9 builds the tier-resolution path. The board routes it accordingly — the **S09
ticket body (`t_c5e8ec5a`)** carries the audit verbatim as an entry obligation:

> **AUDIT: `DERIVED` may now be unreachable — if no production path produces it,
> remove the member or it is an `FX-ORPH-02` BLOCKING orphan, and rescope
> `FX-DB-07` from "all three suppliers" to the reachable set (trap).**

So the residue has **a named owner (S09), a named gate (`FX-ORPH-02`, which
BLOCKS), and a named fixture consequence (`FX-DB-07`)** — it cannot survive
silently, because an unreachable member reaches the never-called list and the
never-called list stops a release (charter A4.2). **This document has already
applied the fixture half**: §3.7's round-trip is rescoped to the **reachable**
suppliers, matching `FX-DB-07`'s landed scope, so nothing here asserts a
three-supplier guarantee any more. What remains is the removal decision itself,
which is S09's to make against the built path.

**Three enums are deliberately *not* in this table** because they are not
database vocabularies: the wire **error-code** enum lives in `packages/contract`
(`04-api-contract.md`; Plan.md §5.6), the **event vocabulary** likewise — including
**DR-076's node-lifecycle names**, which are minted in `04-api-contract.md` §12.3
under E1/E2 and are **event names, never columns** (§14) — and the register's own
**key inventory** lives in `05-register-skeleton.md`.

---

## 14. Derived, never stored

AC-88's *"status is derived, never asserted"* is a schema property here, not a
serving habit. The complete list of derived values named in Plan.md §4:

| Derived value | Derived from | Constraint |
|---|---|---|
| current phase / envelope state / envelope consumption | the latest matching `run_progress_event` | AC-88; §3.3 |
| a battery row's current activation state | the latest `run_row_activation_event` | AC-88; §3.5 |
| `last_evaluated_at_seq` | `at_seq` of that latest event | Plan.md §4.1a |
| node "generating" status | never persisted — derived only | manifest §6.2; **DR-076** |
| the node's **live lifecycle surface** — *generating → being judged → scored* | **never persisted, in all three positions**: *generating* as above; *being judged* from a `JUDGEMENT_SCHEDULED` ledger row (§11A.4) with no `reduced_judgement` yet; *scored* from the presence of a `node_strength_record` row for that node in the run's latest propagation run | **DR-076**; AC-88 |
| a ledger row's **item-scoped / pre-item** classification | its action kind's declared `action_scope` in `kernel` — a property of the kind, never a column on the row | **DR-092**; AC-85, AC-88; §6.1 |
| a run's **terminal state** | presence and value of its `TERMINAL` `run_progress_event` | **DR-089**; §3.3, §3.9 |
| the completeness-gate verdict ("required node") | scheduled-judgement ledger rows (§11A.4's `JUDGEMENT_SCHEDULED`) × `raw_artifact` presence | AC-11; §4 |
| a served number's current status | its latest `served_number_event` | §7.5 clause 2a |
| an answer's **current** serve state | ≥1 `EVICTED` event for that version ⇒ components-only + `DEFECT` | §7.5 clauses 2a, 3 |
| a segment's **served** state | the join of the sealed conformance record **and** `segment_suppression` | AC-88; §7.5 clause 2 |
| the per-node appearance of a condition mark | read-time projection over `condition_mark_node` | UI-9; §7.7 |
| an answer's coverage/status reconciliation | recomputed at read: drop items for non-current nodes; typed **pending** where work is active, typed **error** otherwise | AC-88 |
| a stale job's failed status on a read | the job's deadline, **without writing** (the reaper performs the transition) | AC-89 × AC-62; UI-13 |
| every badge, mark and provenance summary on the wire | stored typed fields, at read time | Seam D; AC-64 |
| `scorecard_cell` | the ledger, materialised with a recorded derivation version | AC-41 |

**The replay ceremony reads the sealed forms, never the derived overlays** —
because the overlay post-dates the serve decision it is replaying (§7.5 clause
2a; AC-07).

**DR-076 adds no column, and reading it as a column would be the defect.** The
ruling requires a pending node's lifecycle to be **observable live in the UI, not
only after settling**, and it says so as an **observability/streaming**
requirement that *"does not change what contributes to a served score"*. So the
live surface is **event-derived and streamed** — `04-api-contract.md` §12.3's
node-lifecycle names — over facts this schema already stores. A persisted
`lifecycle_state` column would be a fourth authority beside the three derivations
above, would need writing at three more points inside the run, and would be
exactly the *stored derivable state* the anti-pattern register forbids. **The
placeholder arrow is the structural half of the same ruling** and it *is* stored
— as an ordinary `edge` row (§5.5(5)) — because a connection is a fact, while a
lifecycle position is a projection of facts.

---

## 15. Append-only mechanics, partitioning, archival and revival

**Append-only mechanics.** `UPDATE` and `DELETE` grants are revoked **and** a
trigger raises — both, never one. The grant revocation is the fence; the trigger
is what makes the violation *loud* rather than a permission error at some other
layer (§4.1 rule 1; AC-45). For the `run` frozen head, `DELETE` matters as much
as `UPDATE` (§3.2).

**Total order.** The ledger's order is its **own `sequence` allocator taken
under a write lock**, so same-tick rows are orderable; **never a timestamp,
never a random tiebreak** (AC-08, AC-45; manifest §8.2g). This is a *different
mechanism for a different purpose* from the graph's **recorded arrow order**
(§6.4) — conflating them is the mistake §4.1 rule 5 exists to prevent.

**Partitioning.** `ledger_entry` and `raw_artifact` partition **by run range**.
**No partition is ever dropped** (AC-05). Partitioning is therefore a read/write
locality decision only; it can never become a retention policy.

**Archival and revival.** Nothing is deleted, anywhere, ever (AC-05).
Retirement is **archival**: `staleness_state` moves to `ARCHIVED`, the **full
graph is kept**, and the composite is **auto-revived by the next query through
staleness review** — `ARCHIVED_REVIVED` is the revived state (AC-05, AC-72;
spec §13.2 T-7, DR-016). An abandoned node is a **pause, not a deletion**: still
scored, still an arrow endpoint, reopenable (manifest §6.2). Everything except
`stale` enters the scored graph, and **the debug facet uses the identical node
set** (DR-062 `OD-18`).

---

## 16. The indexes this document declares

Only the indexes Plan.md names are declared here. **No index is invented**;
further index choice is a build-time performance decision, and adding one is
never a licence to change a constraint.

| Index | Purpose | Source |
|---|---|---|
| partial unique index on the **arrow identity** `(source_node_id, target_kind, coalesce(target_node_id, target_edge_id), polarity)` | the identity that §5.5(3)'s collapse-vs-error rule is evaluated against | Plan.md §2.4, §4.2(3) |
| `UNIQUE (run_id, node_id)` on `node`; `UNIQUE (run_id, edge_id, polarity)` on `edge` | the FK targets that make every endpoint **graph-scoped** | Plan.md §4.2(2), (5); C-11 |
| **materialized-path index** (`ltree` / text-path) on `node` | AC-33's cheap subtree operator; ancestor-triggered invalidation; AC-20's acyclicity check; AC-05's subtree revival, all of which want `WITH RECURSIVE` and path indexes | Plan.md §2.4; AC-33 |
| **keyset-pagination index** on `serve.answer`, read through the `answer_index` **view** (§7.9) | AC-62's real pagination (`limit` + opaque `cursor`, both sent and honoured); the index sits on the authoritative table, never on a materialized copy | Plan.md §4.4, §5.3; AC-85 |
| partition keys on `ledger_entry` / `raw_artifact` (run range) | §15 | Plan.md §4.3 |

---

## 17. Migration policy

**SEAT-PROPOSAL (Plan.md §2.4; V ratifies the stack per DR-005 as narrowed by
DR-024):** Drizzle ORM for schema declaration and typed queries + `drizzle-kit`
for migrations, **with hand-authored SQL in migrations for every invariant that
belongs in the database**. The policy, independent of which tool V ratifies:

1. **One migration timeline for one store** — a single migration lineage over
   one database with namespaced schemas (`core`, `ledger`, `memory`,
   `scorecard`, `register`, `serve`), so AC-02's "one store, multiple indexes"
   is enforced by the deployment rather than by discipline.
2. **Invariants live in DDL where they can** (AC-32, AC-35): `CHECK` constraints
   for closed enums and the polymorphic edge target; the **null-safe** non-blank
   claim check; **graph-scoped composite foreign keys** for every node and edge
   endpoint; the composite FK for the undercut's support-edge target; partial
   unique indexes for arrow identity; revoked `UPDATE`/`DELETE` grants plus
   triggers for append-only tables. A SQL-first path keeps that DDL readable and
   reviewable; **a tool that owns the schema hides exactly the layer the
   invariants must occupy**.
3. **Canonical DDL ownership is single and named** — the inventory is §12 of
   this document. Application-level checks are restatements and **never the
   authority** (AC-85).
4. **Every fixture for a DDL invariant exercises the migrated database
   directly**, inserting through the connection and bypassing every application
   validator (Plan.md §2.4).
5. **Recursive and path queries are first-class** — `WITH RECURSIVE` and
   `ltree`/text-path indexes are written, not generated (AC-33, AC-20, AC-05).
6. **Schema change is not how research lands.** Validated findings land as
   **register rows, scorecards or a strategy implementation — not** as changes
   to the graph shape, the ledger schema or the serve contract; the expected
   cost of adoption is **a register change plus a re-run** (AC-84; charter §6,
   A5.3, A5.5). A migration that changes a shape to adopt a finding is the
   defect that constraint names.
7. **Nothing is ever dropped by a migration**: not a row, not a partition, not
   an archived graph (AC-05). The one exception the plan names is a *declared*
   removal of an **unreachable** schema element, where AC-77 and charter VR-4
   require removal **rather than leaving it unreachable**. **The instance this
   document carried is discharged**: DR-071 makes `UNDERCUT_TRANSMISSION`
   writable (§5.5(4)), so S2's removal exit condition does not fire. **The one
   live candidate is `tier_source`'s `DERIVED`** (§13's note), whose audit is
   **routed to S09** with **`FX-ORPH-02` (BLOCKING)** as its gate — a named
   producer or a removal, decided against the built path rather than here.

---

## 18. How the ruled questions landed in this document

**Every question this document carried a `pending V` marker for is RULED**
(DR-068..DR-097; DR-100 closes the ARCHITECTURE loop). The table below is the
disposition: the ruling, and what it changed here. **No row in it is open.**

| Was | Ruling | What changed in this document |
|---|---|---|
| Q-03 (AM-12) — what an "asker" is | **DR-070** | the asker is the **requesting user/person**; authorization and credentials out of scope; `user_dev_token` adopted. §3.2 and §10 record the ruling **and** its provisional-simplification condition; the three identity columns stay distinct |
| Q-04 (A-1) — the undercut's arithmetic | **DR-071** | `UNDERCUT_TRANSMISSION` is **writable**, `OD-06`'s producer set goes 2 → 3, and the per-edge reduction is a recorded column (§5.5(4), §6.4a, §12 row 14, §13, §17 item 7) |
| Q-05 (A-3) — lifting composition | **DR-072** | folder-lift then judged-ancestor lift, both-ends markers in both cases, recorded as `lift_records` / `lift_marker` (§6.4a, §6.5, §13) |
| Q-06 (A-4) — collapse over attacks | **DR-073** | **both polarities**; the cluster record gains `polarity` and `key_basis`, and an unresolvable key **clusters alone as a real singleton record** (§6.4, §6.4a) |
| Q-07 (A-8) — the deployment operator default | **DR-074** | the deployment row is **mandatory, never blank**; the declare/withhold machinery is **deleted**; the effective operator **and its supplying level** are recorded (§7.4, §9, §6.4a, §6.5, §12 row 28) |
| Q-08 (A-9) — `pending` nodes and placeholder arrows | **DR-075** + **DR-076** | a `pending` node is an unjudged interior node under `OD-02`; **placeholder arrows are live endpoints** and *"endpoint absent"* narrows to foreign/deleted (§5.5(5)); the lifecycle surface is **event-derived, never persisted** (§14) |
| Q-09 (U-4 ≡ A-6) — what judge weight multiplies | **DR-077** | the weight is consumed in **selection** under a declared rule, never by averaging; dispersion is measured separately and typed absent below two judgements (§6.3, §6.4a, §6.5) |
| Q-10 (OQ-G3) — the composition-bundle budget | **DR-078** | an **independent register row**, user-facing as `low`/`medium`/`high`; the asker's choice is a frozen run-head column (§3.2, §13) |
| Q-11 (AM-1) — the non-node senses of "load-bearing" | **DR-079** | they **project from the node definition** by DR-079's rule, off `sensitivity_record` plus references this document already stores; **no new carrier** (§11A.3) |
| Q-12 (AM-3) — the three closed sets of six | **DR-080** | **three separate vocabularies** plus two register-row mapping tables; `abstention.question_class` draws on the abstention-class vocabulary, not on Q8's types (§7.8) |
| Q-13 (U-1) — `OD-11` layer-2 provenance depth | **DR-081** | layer 1 by default behind a register row V flips; a **serve-projection** rule with no data-model change — recorded here so the absence is deliberate |
| Q-14 (AQ-1) — the band rule and the ceiling label | **DR-082** + **DR-086** | a **second independent gate** that **caps the band** and wears its label, never blocks; `band_ceiling {label, basis}` is non-optional (§7.6) |
| Q-15 (OQ-G9) — the activation table | **DR-083** | **re-derived and ratified in-repo**, a written predicate per row, `POLICY_BLOCKED` loud rather than silent (§3.5, §13) |
| Q-16 (OQ-G10) — the eight citation routes | **DR-084** | ownership is ruled — **architecture proposes, V ratifies**; the carrier stands and **this document still mints no member** (§11A.1, §13) |
| Q-17 (U-2) — the evidence gate's eligibility | **DR-085** | **tier-invariant with shadow mode**; eligibility is the exact complement of spec §5.2(f)'s list; the tier × claim-type map is an **empty register table** (§7.10) |
| Q-18 (A-7) — `mixed`, `unknown`, `value-laden` | **DR-087** | `mixed`/`unknown` are **evidence-gated, fail-closed** claim types; **`value-laden` is a cross-cutting flag** on `core.node` and `OD-16` stays closed (§5.1, §13) |
| Q-20 (AM-10) — WAIT and run terminality | **DR-089** | the **WAIT drain law**, a typed `TERMINAL` event, and **Q61 as a post-completion settlement event outside the run lifecycle** (§3.3, §3.5, §3.9, §12 row 27) |
| Q-22 (AM-2) — the CASUAL blind-verification trigger | **DR-091** | the **CROSS-entry leverage snapshot** as the trigger basis, with a new carrier (§11A.2) — **never a score input**, AC-29 |
| Q-23 (AM-4) — the Q34 symmetry population | **DR-092** | **item-scoped actions only**, excluded **by kind never by value**; the action-kind vocabulary gains `action_scope` and `UNASSIGNED` stays a real signal (§6.1, §13, §14) |
| Q-25 (AM-5) — who sets the risk tier | **DR-094** | **the asker declares; policy may raise, never lower**, enforced at §12 row 26; `DERIVED`'s producer is flagged as an AC-77 residue (§13's note) |

**One Plan item in this document carries no question, and should not be looked
for.** **A-2** (nullable `strength` + `magnitude_status` + the binding `CHECK`,
§5.5) is **DESIGN-NEUTRALIZED** in Plan.md §6.4: no ruling was needed, because
`OD-04`'s successor lands as a value in the existing column rather than as a
schema change.

**What is still V's, and is not an open question.** Three things stay open by
their own rulings' terms and are marked at their sections rather than here:
**register values** (DR-023, AC-74/AC-76), the **DR-093** correctness/enrichment
split, and the **DR-084** citation-route membership.

---

## 19. Gap register for this document

**Ids are global** (`DM-*`, plus the cross-lane rows this document is party to);
`09-traceability.md` holds the consolidated index across all seven lanes, and
every **REAL** row travels from there into the FinalPlan consolidation and the V
register (H-C-10). Dispositions below are the **merged** ones from
`reviews/merge-verdict-c4.md`, not this lane's own.

**Every REAL row below is CLOSED at DR-099**, which ratified all thirteen
FinalPlan amendments. The table is kept rather than deleted because the
consolidated index cites these ids, and because a closed gap should be readable
as closed rather than absent.

| Gap | Verdict | State after DR-099 | Carrier, now accepted |
|---|---|---|---|
| **DM-1** — no `evidence` schema; context 2's objects have no home | **REAL** | **CLOSED — DR-099 (A-06)**. `07-build-order.md` still names the data-model dependency as an S6 entry criterion | **§11A.1** — `evidence` schema: `query_set`, `query_amendment`, `source_record`, `evidence_item`, `absence_row`, `probe_capture`, `instrument_certification`, `citation_route_record` |
| **DM-2** — no tables for `critique` / `valuation` objects | **REAL** | **CLOSED — DR-099 (A-06)**; the **schema home** §11A.3 left unnamed is decided at §11A.3.0 | **§11A.2** — `critique_packet`, `independence_receipt`, `symmetry_diff`, `objection_record` (+ `verification_trigger_basis`, DR-091); **§11A.3** — `value_hinge`, `reversal_point` in `core`; `overlay_run`, `sensitivity_record` in `ledger` |
| **DM-3** — the claim-type → composition map has no data home | **REAL** | **CLOSED — DR-099 (A-06)**. Still V's: the **key name and declared value type** (`05-register-skeleton.md`) and the map's contents at DR-023 | **§9.1** — canonical home is `register.register_row`; its **key domain is `core.node.claim_type`** (§5.1) |
| **DM-4** — AC-11's "scheduled judgement" input is not queryable | **REAL** | **CLOSED — DR-099 (A-07)**; `06-test-strategy.md`'s completeness-gate pair asserts against it | **§11A.4** — `JUDGEMENT_SCHEDULED`, a ledger action kind (not a served typed state, so S-13's minting authority is not engaged); `action_scope = ITEM_SCOPED` |
| **TRACE-7 ≡ H-C-1** — terminal-route count was five in DR-037 and four in spec §12.3 Home 3 | **REAL** *(cross-lane: 1, 3, 6)* | **DISCHARGED, 2026-08-06.** The directed founding-pack correction **landed**: `docs/founding/requirements-spec.md` §12.3 Home 3 now carries **five**, row 5 being Q10's depth-zero route with **authority DR-037**, placed as amendment **A-01** at **DR-099** and named in **DR-100**'s follow-through. The founding table's own edit note records the discharge. **The edit minted no typed state** — it placed an already-ruled one — so S-13's single-minting-place law is intact | **§7.7 and §13 carry five, now cited to §12.3 itself**; DR-037 travels as the routes' authority. **The test prohibition is lifted**: `FX-LG-04` asserts membership and count against the §12.3 Home-3 table like the other two homes |
| **TRACE-8** — AC-25's semantic-restatement flag has no record | **REAL** | **CLOSED — DR-099 (A-10)**; `06-test-strategy.md` asserts non-gating byte-identity at **`FX-PT-FLG`** | **§5.6** — `semantic_restatement_flag`, structurally excluded from the evaluation snapshot so *"changes no number"* is enforced rather than promised |
| **TRACE-9** — AC-91's shadow mode has no record | **REAL** | **CLOSED — DR-099 (A-10)**; eligibility and the shadow rule are ruled at **DR-085**, and only the map's **contents** stay V's | **§7.10** — `shadow_suppression`, append-only, distinct from `segment_suppression` |
| **TRACE-10** — AC-90's typed `unavailable` verdict has no carrier | **REAL** | **CLOSED — DR-099 (A-10)**, with one flagged residue: whether the token needs placing in spec §12.3 when it surfaces to a reader (AC-65, S-13) | **§7.11** — `answer.verdict_unavailable`, a typed field sibling to the abstention field; **not** a fourth `verdict_state` member |
| **MOD-4** — the Postgres-backed work-claim queue has no table | **REAL** *(cross-lane: 3 places the shape, 4 owns the module boundary)* | **CLOSED — DR-099 (A-05)**; `03-module-design.md` §4.4/§13 carries the ownership split | **§3.8** — `work_item`: `battery` owns the state, `apps/runner` executes, the reaper writes expiries, the fleet projection reads it; the one mutable operational table, with the ledger as its record |

**Two residues this fold-in opens, recorded so neither is silent:**

| Residue | Where | What is owed |
|---|---|---|
| `tier_source`'s **`DERIVED`** has no producer under DR-094 | §13's note; §12 row 26; §3.7 | **ROUTED to S09** (`t_c5e8ec5a`), whose body carries the audit as an entry obligation: a named producer or removal, with **`FX-ORPH-02` (BLOCKING)** as the gate and **`FX-DB-07`** rescoped to the reachable set. The fixture half is **already applied here** (§3.7); the removal decision is S09's, against the built path (AC-77, charter VR-4) |
| the token `unavailable` reaching a reader | §7.11 | V's confirmation that a field, not a state, is the right shape (AC-65, S-13) — DR-099's own flagged residue on A-10 |

**Closed at C4 rework round 1** (adjudicated **MISREAD**; the cited resolution is
applied above and neither is an open architecture question):

- **DM-5** — `answer_index` as table vs view. **Lane 3's choice, not V's**
  (Plan.md §7 row 3; AC-85/AC-88 already exclude an independently writable copy).
  **Chosen: a read-time view**, with the reasoning and the fallback contract in
  **§7.9**.
- **DM-6** — the eight citation failure routes. **Ownership is ruled at DR-084**
  — architecture proposes the closed enum, V ratifies — and the membership is
  under that ratification; this lane carries the column and no invented members
  (§11A.1, §13, §18).

---

*End of `02-data-model.md` — ARCH-V3-R1 / C4 lane 3, 2026-08-05. Authored from
Plan.md rev 3 §4 (with §2.4, §3.2, §6 and §8 where §4 points at them);
**revised at C4 rework round 1** against `reviews/merge-verdict-c4.md` (terminal
routes to five per DR-037; the `answer_index` choice; the
`DM-1`/`DM-2`/`DM-3`/`DM-4` carriers; `serve_state` inventoried) **and its sync
pass** (`TRACE-8`, `TRACE-9`, `TRACE-10`, `MOD-4` placed).*

***Revised 2026-08-06 at the DR-100 fold-in (PROG-V3-R1, ticket PRE-02)*** *against
`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` DR-068..DR-101:
provisional banner removed (DR-098/DR-099/DR-100); the §11A / §3.8 / §5.6 / §7.10
/ §7.11 carriers accepted (DR-099 A-05/A-06/A-07/A-10) and their gaps closed;
DR-070 (asker), DR-071 (`UNDERCUT_TRANSMISSION` writable + per-edge reduction),
DR-072 (lift records), DR-073 (both-polarity clusters), DR-074 (mandatory
operator + the withhold deletion sweep), DR-075 (live placeholder endpoints),
DR-076 (lifecycle derived-only), DR-077 (selection + dispersion), DR-078
(composition-budget tier on the run head), DR-079, DR-080, DR-083, DR-084,
DR-085, DR-087 (`value_laden`), DR-089 (`TERMINAL` + the WAIT drain law + §3.9),
DR-091 (`verification_trigger_basis`), DR-092 (`action_scope`), DR-094 (tier
authority) and DR-082/DR-086 (band ceiling as gate-with-cap) folded in; §11A.3.0
decides the valuation tables' schema home. **Rev 2 (same day, PRE-02 fix cycle):**
the **Home-3 restatement** — §7.7, §13's preamble and terminal-routes row, and
§19's `TRACE-7 ≡ H-C-1` row now read **present-tense five**, cited to
`spec §12.3` Home 3 itself after **DR-099 / A-01** placed row 5 there (DR-100
follow-through); the four-member split is recorded as **history**, the
membership-and-count test prohibition is **lifted**, `TRACE-7 ≡ H-C-1` is
**DISCHARGED**, and §13's Home → table routing is re-checked and confirmed
unchanged. **Rev 3 (same day, PRE-02 fix cycle, Codex findings + SP-8):** §13 gains
the **E-7 access-depth** transcription row (`OPENED_FULL` / `PREVIEW_ONLY` /
`ACCESS_BLOCKED`, source spec §7.3 E-7, carrier `evidence.source_record`) and
§11A.1's `source_record` row names the same enum; §3.7's `tier_source` round-trip
and §13/§17/§19's `DERIVED` residue are **rescoped and routed to S09** with
`FX-ORPH-02` as the blocking gate; §3.9's calibration row records the **INSERT-only**
`scorecard_cell` derivation write; the `served_number_event.status` provenance line
drops its stale AC-22 citation. **This document is accepted architecture.**
Sibling artifacts: `00-overview.md`, `01-decisions/`,
`03-module-design.md`, `04-api-contract.md`, `05-register-skeleton.md`,
`06-test-strategy.md`, `07-build-order.md`, `08-open-questions-for-V.md`,
`09-traceability.md`.*

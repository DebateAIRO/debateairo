> **CONDITIONAL** — authored against Plan.md rev 3 while the C2 plan
gate is FROZEN at the rework cap pending V steering (packet row VS-1;
see docs/missions/2026-08-05-v3-architecture/reviews/merge-verdict-plan-round3.md).
Nothing in this document is accepted architecture until V steers.

# FinalPlan consolidation — what the proposed V3 architecture is, and what V must decide

Mission ARCH-V3-R1, step C4 · FinalPlan role · 2026-08-05 · seat: Opus 5
(session `c2-author`, sticky-session law).

**What this document is.** One place from which V can see the whole proposal:
what the final plan consists of, the **13 directed amendments** the C4 work
raised against the frozen plan, what remains open, and the exact condition under
which the ARCHITECTURE loop closes. **It rules nothing.** It does not amend
Plan.md — Plan.md is frozen at rev 3 — and it does not edit any
`docs/architecture/` file. Every amendment below is a **proposal pending V's
VS-1 ratification**, carrying its source gap id, the Plan section it amends, the
C4 document that already carries the resolved design, and its authority.

**Citation discipline** (Plan.md's own, carried): every normative claim cites a
DR, a founding-doc section, a Plan AC id, or a C4 gap/fixture id. No invented
numbers (DR-039 / AC-76). SEAT-PROPOSAL labels are carried, not dropped.

---

## 1. What the final plan is

**The proposed final architecture = Plan.md rev 3 + the 20-document C4 set.**

| Component | What it is | Status |
|---|---|---|
| **`architecture/Plan.md` rev 3** | The frozen-gate artifact: the 92-row constraint base (AC-01…AC-92), the stack proposal, the context map and module boundaries, the data-model and API direction, the 67 dispositions, the C4 artifact-set plan and the G5 slicing. Rev 3 folds three rework rounds (32 + 25 findings) and the 13-item frozen-loop repair annex. | **FROZEN** at the C2 rework cap (3 of 3) pending VS-1. `reviews/merge-verdict-plan-round3.md`. |
| **The C4 set — 20 documents** | `00-overview.md`; `01-decisions/` (README + **14 ADRs**, `ADR-0001…ADR-0014`, each *"PROPOSED — V ratifies (DR-005/DR-024)"*); `02-data-model.md`; `03-module-design.md`; `04-api-contract.md`; `05-register-skeleton.md`; `06-test-strategy.md`; `07-build-order.md`; `08-open-questions-for-V.md`; `09-traceability.md`. | **CONDITIONAL** — every file carries the banner above; C4 rework round 1 of 3 applied per `reviews/merge-verdict-c4.md`. |

**The relationship between them, stated as a rule.** *The C4 set refines the plan
and never contradicts it — except where a directed amendment in §2 says so, and
each of those is listed there rather than applied silently.* Concretely:

- The C4 documents **expand** what Plan.md §7 assigned them: Plan §7 named ten
  artifacts and their scopes; the set delivers them, with `01-decisions/`
  expanded to a README plus fourteen ADR files (a naming decision the plan did
  not make — gap **G2-1**, disposition **STANDS**, `09` §8.1a).
- Where a C4 lane found the plan **short a fact** — a table with no home, an
  edge that forbids what a slice requires, a count that contradicts a DR — the
  lane resolved it in its own document **and** raised it as a gap. Those
  resolutions are §2's amendments. They are the only places the set goes beyond
  the plan.
- Where a C4 lane found a gap that the plan **already resolves**, the gap closes
  with its citation and is *not* preserved as an open question (`09` §8.2,
  17 MISREAD rows).
- **Nothing in the C4 set rules a V-QUESTION.** `08-open-questions-for-V.md`
  remains the single place V answers, at exactly **28** entries.

**Gap accounting, so the arithmetic is checkable.** `09-traceability.md` §8 is
the consolidated index and the only register of gap ids. It carries **38 ids**:
**13 REAL in §8.1** (DM-1…DM-4, MOD-2≡REG-5, API-1, BUILD-1, BUILD-2, TRACE-5,
TRACE-7, TRACE-8, TRACE-9, TRACE-10) + **11 post-round arrivals in §8.1a**
(API-4, MOD-4, REG-7, TRACE-8/9/10 restated, G2-1, G2-3, G2-4, ADR-0015,
and the S6/S8/S10 data-model headline) + **17 MISREAD in §8.2**. Of these,
**TRACE-5, BUILD-1 and BUILD-2 are already CLOSED inside the C4 set** (fixtures
minted and slices assigned); the rest either close as MISREAD or appear below.

---

## 2. Directed plan amendments — 13, pending V's VS-1 ratification

Each row: **what changes in Plan.md**, its **source gap/finding id**, the **Plan
section amended**, the **C4 document that already carries the resolved design**,
and the **authority** the change rests on. None is applied to Plan.md; all are
proposals for V.

### A-01 · The terminal-route count is FIVE, and the founding table needs a correction

- **Source:** `TRACE-7 ≡ H-C-1` (REAL, cross-lane 1/3/6).
- **Amends:** Plan.md **AC-65**, which reads *"5 abstention kinds … + 22
  condition marks + **4** terminal routes"*, and Plan.md **§3.1 module row 13**
  (`kernel`), whose test asserts *"membership and count against the spec's own
  table"*.
- **Carried by:** `02-data-model.md` §7.7/§13 (enum inventory at five);
  `06-test-strategy.md` §6.2 and `FX-LG-04`; `00-overview.md` §4.1; `09` §8.1.
- **Authority: DR-037**, which rules Q1, Q3, Q7, Q9 **and Q10** each own a
  terminal route code must enforce (*"inert stop; false-assumption non-answer;
  value→human; NOT_EMPIRICALLY_DECIDABLE; no-justification-no-split"*), and
  `requirements-spec.md` §5.2 F-4, which enumerates the same five. The ledger
  wins over a founding-doc table (Plan.md §1's order of authority; spec §2 item
  1).
- **The change, precisely:** AC-65's "4" becomes **5**; row 13's test asserts
  membership and count against the **five-member list sourced to DR-037**, not
  against spec §12.3's Home-3 table. Plan.md §3.1 context 1 already says *"the
  five terminal routes"*, so this also removes an internal contradiction.
- **The founding-pack half — a directed item for V, not for architecture.**
  `requirements-spec.md` §12.3's Home 3 lists **four** members. Under S-13 that
  table is *"the only place a typed state may be minted"*, so either the
  depth-zero no-split route is placed in it, **or** the spec states why it is not
  a Home-3 member **without contradicting DR-037**. **Architecture cannot make
  that correction** — spec §12.3 is founding text and S-13 reserves the minting
  authority. Recorded here as V's.

### A-02 · Mint ADR-0015 — "The deployment maker inventory: two predicates, not one"

- **Source:** `ADR-0015` (directed item, `09` §8.1a; merge-verdict-c4 addendum).
- **Amends:** Plan.md **§7 row 2**, which fixes the planned ADR set at
  **fourteen** named entries.
- **Carried by:** `01-decisions/README.md` §2 (interim record); the decision
  itself is specified at `03-module-design.md` §7.3 and fixtured by
  `FX-PRV-01a` / `FX-PRV-01b`.
- **Authority:** DR-055 / charter S4 / AC-38 — the deployment-capability half of
  the multi-maker launch gate is a real, contested, fixtured decision with **no
  addressable ADR**. Lane 2 declined the mint **on scope, not on merit**
  (Plan §7 row 2's fixed set), which is exactly the kind of decision the plan
  reserves to itself.
- **Also recorded, not proposed:** gaps **G2-3** and **G2-4** (Seams B/C/D and
  AC-11 / AC-24 decided inside other documents rather than as addressable ADRs)
  **STAND** — extending the set further is not a lane's to do, and this
  consolidation proposes exactly one addition, not a re-planning of §7 row 2.

### A-03 · `tools/acceptance-bundle` gets a read-only `register` edge

- **Source:** `MOD-2 ≡ REG-5` (REAL).
- **Amends:** Plan.md **§2.6**'s dependency table, whose single `tools/*` row
  permits only `kernel` and `contract`.
- **Carried by:** `03-module-design.md` §3.1 **edge row 27** (read-only
  `register`, with `db` reached read-only *through* `register`);
  `05-register-skeleton.md` §1.4 (the two rejected alternatives — an API call and
  a separate export artifact — recorded); `06-test-strategy.md` **`FX-REG-02`**.
- **Authority:** Plan.md **§8 S15** requires the acceptance bundle to *present
  the register for V's ratification*, and AC-74/charter A4.2/A4.4 make that
  presentation a **blocking** release artifact. The current edge list gives that
  obligation **no legal implementation path** — the plan contradicts itself, and
  one of the two sides must move.

### A-04 · Name `apps/scheduler`, and split charter S1's replay obligation into two limbs

- **Source:** `H-O-1` (BLOCKER, C4 round 1).
- **Amends:** Plan.md **§2.6** (the `apps/` inventory and the dependency table —
  `apps/scheduler` exists in neither) and **§2.7** (which names the reaper's
  scheduled job but no owning unit).
- **Carried by:** `03-module-design.md` §1.2, §3.1, §5.5.0 (the unit, its edge
  row, its credential scope, and its relationship to VR-3's three limbs);
  `06-test-strategy.md` **`FX-LG-01a`** (continuous limb — owner
  `apps/scheduler · job:replay-self-test`, recomputes with `propagation`, writes
  only through `serve`'s eviction writer) and **`FX-LG-01b`** (launch-ceremony
  limb — owner `apps/replay`, `published-arithmetic` only, **never writes**).
- **Authority:** charter **S1** carries two obligations in one sentence —
  *"continuously self-tested"* **and** *"at launch, one independent replay …
  must pass exactly"* — and **DR-063 VR-3**'s independence limbs bind the
  **ceremony**. AC-12's eviction is triggered by the *continuous* limb, which
  must **write**; `apps/replay` is read-only by attestation (`FX-IND-03`), so
  without a second unit the eviction carrier has no executor and either an
  attestation is falsified or AC-14's one-engine rule is broken. The split is
  what makes both limbs implementable; naming `apps/scheduler` is what gives the
  continuous limb an entry point (charter G1/A4.5).

### A-05 · The `work_item` table

- **Source:** `MOD-4` (REAL, cross-lane 3/4).
- **Amends:** Plan.md **§4** — the Postgres-backed work-claim queue is specified
  at §2.7 and has **no table and no schema home**, while three units read or
  write it.
- **Carried by:** `02-data-model.md` §3.8 (`work_item` — `battery` owns the
  state, `apps/runner` executes, the reaper writes expiries, the fleet
  projection reads it; the one mutable operational table, with the ledger as its
  record); `03-module-design.md` §4.4/§9.2/§13 (the package ownership split).
- **Authority:** AC-04's *"a crash mid-batch leaves completed work durable and
  resumable"*, AC-44's recording obligation, and AC-89's reaper. Without the
  table **`FX-SRV-10`'s write half has no addressable target** (`09` §8.1a).

### A-06 · The `evidence`, `critique` and `valuation` schemas, and the composition map's home

- **Source:** `DM-1`, `DM-2`, `DM-3` (REAL) — subsumed by the merge node's
  headline finding that **slices S6, S8 and S10 have no data-model home at all**
  (`merge-verdict-c4.md` §5; `09` §8.1).
- **Amends:** Plan.md **§4**, and **§4.4/§9's** silence on the claim-type →
  composition map.
- **Carried by:** `02-data-model.md` **§11A.1** (`evidence`: `query_set`,
  `query_amendment`, `source_record`, `evidence_item`, `absence_row`,
  `probe_capture`, `instrument_certification`, `citation_route_record`);
  **§11A.2** (`critique_packet`, `independence_receipt`, `symmetry_diff`,
  `objection_record`); **§11A.3** (`value_hinge`, `overlay_run`,
  `reversal_point`, `sensitivity_record`); **§9.1** (the composition map's
  canonical home is **`register.register_row`**).
- **Authority:** Plan.md §3.1 contexts 2, 5 and 6 require these objects and
  Plan.md §8 slices S6/S8/S10 require them replayable (AC-06); **AC-92 /
  manifest §5.2(f)** requires the claim-type → composition map *held as data,
  never a source literal*, which is why `09` §2's AC-92 cell reads *"no —
  pending FinalPlan carrier"*. The composition map's placement follows Plan.md
  §6.2 AM-3's own mapping-as-register-row precedent; **its contents remain V's
  at DR-023**.

### A-07 · `JUDGEMENT_SCHEDULED` as a ledger action member

- **Source:** `DM-4` (REAL).
- **Amends:** Plan.md **§4.3**'s closed action-kind vocabulary.
- **Carried by:** `02-data-model.md` §11A.4.
- **Authority:** **AC-11** defines a *required node* as one for which a
  judgement was **scheduled under the running job**; §4.3's vocabulary supplies
  no member or field making that predicate queryable, so the completeness gate's
  own input is unaddressable. It is a **ledger action kind, not a served typed
  state**, so spec §12.3 / S-13's minting authority is **not** engaged
  (`02` §19) — this is an architecture amendment, not a founding-pack one.

### A-08 · Ownership for `GET /v1/fleet` and `GET /v1/session`

- **Source:** `API-4` (REAL, cross-lane; found by lane 5 rework).
- **Amends:** Plan.md **§3.1**'s context map, which names no owner for fleet
  status or session, and **§4**, which names no table for either.
- **Carried by:** `03-module-design.md` §4.4 — fleet state is owned by
  **`battery`** as a read-time projection over the work-claim rows sequencing
  already owns, reached through `apps/api`'s **existing** edge (**no new edge**);
  `GET /v1/session` is owned by **`apps/api`**, the principal the front door
  authenticates. `04-api-contract.md` §4.3 is aligned to that assignment.
- **Authority:** AC-62 (*reads carry no write side effects* — the stale-worker
  reaping the surface used to ride on moves to `apps/scheduler`), AC-77 (a
  served surface with no owning unit is an orphan on the day it lands).
  **What an "asker" is remains `pending V — Q-03`**; the surface exists either
  way, and the amendment adds ownership, not a ruling.

### A-09 · The bootstrap register read path

- **Source:** `REG-7` (REAL; raised under `H-C-5`).
- **Amends:** Plan.md **§2.7**, whose four toolchain pins are one prose
  aggregate with no stable keys and no way to be read before the database exists.
- **Carried by:** `05-register-skeleton.md` §5.4a — four stable keys
  (`nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`,
  `typescriptVersion`), each `resolution_scope: bootstrap`, read from
  **`register.bootstrap.json`** through the **same loader**, with a CI equality
  assertion against the ratified rows (`06-test-strategy.md` **`FX-REG-01`**).
- **Authority:** AC-74 (constants never live as source literals) and AC-06
  (a run pins a `register_version`; two read locations with no equality
  assertion drift, and a run pins a register it did not use). **Values remain
  V's at DR-023** — every row reads *"— none stated"* (AC-76) — and the accepted
  values land at `07-build-order.md`'s pre-S0 gate **GPG-3**.

### A-10 · Data carriers for AC-25, AC-91 and AC-90

- **Source:** `TRACE-8`, `TRACE-9`, `TRACE-10` (REAL; raised under `H-O-5`).
- **Amends:** Plan.md **§4** — three constraints in the base have no record.
- **Carried by:** `02-data-model.md` **§5.6** `semantic_restatement_flag`
  (structurally excluded from the evaluation snapshot, so *"changes no number"*
  is **enforced** rather than promised — AC-25); **§7.10** `shadow_suppression`
  (append-only, distinct from `segment_suppression` — AC-91); **§7.11**
  `answer.verdict_unavailable` (a typed field sibling to the abstention field,
  **not** a fourth `verdict_state` member — AC-90).
- **Authority:** Plan.md §1's own law — *"a constraint with no design element
  carrying it is a gap"*. AC-25 (manifest §4.2i, DR-062 `OD-08`), AC-91
  (manifest §9.2f), AC-90 (manifest §9.2e).
- **One residue for V, flagged not ruled:** if `unavailable` ever **surfaces to
  a reader** as a typed state, AC-65 / S-13 require it be placed in spec §12.3.
  `02` §7.11 keeps it a field precisely to avoid minting a state; whether that
  holds is V's to confirm.

### A-11 · Pagination on the execution read

- **Source:** `API-1` (REAL).
- **Amends:** Plan.md **§5.3**, which declares real pagination for the answer
  index only, leaving `GET /v1/nodes/{nodeId}/executions` unbounded.
- **Carried by:** `04-api-contract.md` §7.5/§7.6 and §4's read table — keyset,
  ordered by the ledger `sequence`, **no value stated**.
- **Authority:** **AC-62** requires real pagination and **AC-44** makes the
  execution record unbounded by construction; an unbounded read of an
  append-only ledger is the truncation defect ui §2 surface 1 indicts. The page
  size is a **register row**, not a number stated here (AC-74/AC-76).

### A-12 · Charter A5.2 extended over a provisional *ordering* — SEAT-PROPOSAL

- **Source:** `REG-4` / `H-C-8` (adjudicated **MISREAD** as a gap, and therefore
  a proposal rather than a repair).
- **Amends:** nothing in Plan.md by right; it **offers** an extension of charter
  A5.2's discipline to `orderingPolicy`.
- **Carried by:** `05-register-skeleton.md` §3.2a — the extension is stated as an
  explicit **SEAT-PROPOSAL**, the owner/trigger/sign-off triple is **optional on
  that row until V rules**, and the row is removed from the A5.2-mandated count
  (7 → 6).
- **Authority — and its limit:** charter **A5.2** binds *"every provisional
  **number**"*. `orderingPolicy` (DR-020 knob 6) is a provisional **ordering**,
  not a number. Extending A5.2 to it is **new law, not existing law**, so it is
  labelled SEAT-PROPOSAL and V may simply decline it, leaving the row as the
  pack has it.

### A-13 · Six fixture ids the plan's test scope did not name

- **Source:** `TRACE-5` (CLOSED by the mint), `H-O-1`, `H-C-5`, `MOD-2 ≡ REG-5`.
- **Amends:** Plan.md **§7 doc 7**'s named-additions list.
- **Carried by:** `06-test-strategy.md`:
  - **`FX-PT-FLG`** (S3) — AC-25: the restatement flag is raised and every node
    and arrow strength is **byte-identical** to the flag-suppressed graph.
  - **`FX-PT-POS`** (S3) — AC-31: τ and arrow strengths invariant under
    relocation; `position_label` travels; independence failure is a **discount,
    never a bonus**.
  - **`FX-LG-01a` / `FX-LG-01b`** — charter S1's two limbs (A-04), each with its
    own owner, credential scope and independence obligations.
  - **`FX-REG-01`** (S0, re-asserted S15) — bootstrap equality: the build fails
    if `register.bootstrap.json` and the ratified register disagree on any
    bootstrap key. **Asserts equality, never a value.**
  - **`FX-REG-02`** (S15; edge present from S0) — the acceptance bundle actually
    reads the register through its declared edge (A-03), so the edge is not an
    unexercised dependency and an `FX-ORPH-02` entry on the day it lands.
- **Authority:** **AC-79** — *every gate is shown to fire both ways before it
  counts as adopted*; charter **VR-1/VR-5** and **A4.4** make fixture presence
  **blocking**. AC-25 and AC-31 previously had **no assertion anywhere**
  (`TRACE-5`), which is the untested-claim shape charter clause 4 indicts.

**Amendment count: 13.** Two are structural additions to the plan's own
inventories (**A-02** the ADR set, **A-04** the `apps/` set); five add data or
vocabulary carriers (**A-05, A-06, A-07, A-10**, and **A-09**'s keys); two repair
a contradiction inside the plan (**A-01** the count, **A-03** the edge); two
extend a contract surface (**A-08, A-11**); one is an offered discipline
(**A-12**, SEAT-PROPOSAL, declinable); one is test scope (**A-13**).

---

## 3. What remains open

Three registers, and nothing else. Each has one home; none is duplicated here.

### 3.1 The 28 questions for V

**`08-open-questions-for-V.md` is the single place V answers** — exactly
**28** `Q-nn` entries, `Q-nn` being the primary C4 address with the Plan.md §6
id in parentheses as provenance. The set is Plan.md §6.8's: 23 from the
V-QUESTION rows (A-6 restates U-4), 2 from §6.9's charter contradictions, 3 from
§6.10's architecture-raised questions. `09` §8.4 maps each to the AC rows it
affects, what ships anyway, and the slice it blocks from. Twelve block a slice at
or before **S6**; `07-build-order.md` §3.2 treats them as **entry criteria**, per
Plan.md §8 sequencing rule (iv).

**Nothing in the C4 set rules any of them**, and `09` §8's dispositions
explicitly rule none.

### 3.2 The pre-S0 gate — GPG-1 … GPG-4

`07-build-order.md` §3.1. **Not V-QUESTIONs** — steering and ratification acts:

| Id | What must be true before S0 |
|---|---|
| **GPG-1** | **VS-1 steering is recorded** — V has ratified the frozen-gate repairs and this conditional C4, or rejected them and re-opened the C2 loop. |
| **GPG-2** | **The ADR / stack set is accepted or replaced** (DR-005 as narrowed by DR-024). Plan.md §9 bounds a replacement: §3's context map, §4's data model and §5's API direction survive; only §2.2–§2.7 are re-instantiated. |
| **GPG-3** | **The bootstrap / toolchain pins have accepted values and a bootstrap read path** (A-09; AC-74, AC-76, DR-023). |
| **GPG-4** | **The resulting contract and register versions are identified** (AC-61, AC-74; Plan.md §4.1a, §2.6). |

### 3.3 The charter §9 contradictions

Plan.md **§6.9** disposes all seven: **five RESOLVED-BY-PACK**, **two
V-QUESTIONs** — item 6 (*"not shipped" vs "auto-activating"*, blocks from **S6**,
carried as **Q-19**) and item 7 (*is a register row with no executable unit
inside clause 4's reach?*, blocks from **S15**, carried as **Q-28**, and an S15
entry criterion because it decides whether the **BLOCKING** never-called list is
empty or contains every unratified register key). `06-test-strategy.md` and
`07-build-order.md` carry them at those slices.

### 3.4 Recorded, and deliberately not re-opened here

- The Opus plan lens's residual risks **R-1 … R-6** (accepted under its PASS,
  `reviews/opus-plan-rereview-2.md`). **R-1** (whether DR-066(1)'s *"full
  record"* means the structured record) and **R-4** (the consequence when the
  standing-misconfiguration counter trips) are each closable by one sentence and
  are the two a human should look at; neither is a directed modification, so
  neither is amended above.
- Gaps **G2-1, G2-3, G2-4** — **STAND** (`09` §8.1a): naming and ADR-scope
  observations, not missing contract facts.
- The **17 MISREAD** gaps (`09` §8.2) are closed with their citations and are
  **not** open architecture questions.

---

## 4. The ARCHITECTURE SATISFIED condition

**The marker is withheld. This seat does not emit it, and this document does not
emit it.** Under the orchestrator's recorded Night-Mode decision
(`reviews/merge-verdict-plan-round3.md` §3), ARCHITECTURE SATISFIED is **not**
emitted by this mission unless V steers otherwise, and the closure report states
what blocks.

**The condition, stated exactly.** The ARCHITECTURE loop closes when **all three**
hold:

1. **VS-1 is ratified** — V answers the morning packet's smallest steering
   question (*"ratify the frozen-gate repairs + conditional C4, or re-open the
   loop with a counter reset?"*) in the affirmative. This is **GPG-1**, and it
   unfreezes the C2 gate; until it happens every C4 banner stands and Plan.md
   rev 3 remains frozen.
2. **The 13 amendments in §2 are each accepted or redirected** — accepted into
   Plan.md as a rev-4 amendment set, or redirected (declined, deferred to the
   build phase, or replaced by V's own resolution). **A-01's founding-pack half
   is V's alone**: architecture cannot correct `requirements-spec.md` §12.3's
   Home-3 table, because S-13 reserves that minting authority. An amendment left
   neither accepted nor redirected leaves a known contradiction inside the
   proposed architecture, and the loop does not close over one.
3. **No blocking question is left unrouted** — every one of the 28 `Q-nn`
   entries either has V's answer or has a recorded route (an owner and a
   slice-entry criterion) such that no slice starts before its own blocking
   questions are answered (Plan.md §8 rule (iv); `07` §3.2). **This is a routing
   condition, not an answering condition**: the loop can close with questions
   open, but not with a question that blocks a slice and belongs to nobody.

**What is explicitly *not* part of the condition.** V answering all 28 questions;
the pre-S0 gate GPG-2/3/4 being satisfied (those gate **S0**, the first build
slice, not the architecture loop); and any C4 re-review round beyond the current
one. Conflating slice-entry with loop-closure would hold the architecture open
until the build is ready to start, which is not what the gate is for.

**If VS-1 is rejected**, the C2 revise→re-review loop re-opens with a counter
reset under the ≤2 unblock ceiling, the 13 directed repairs already applied at
rev 3 stand as the starting point, and this consolidation is re-authored against
whatever V steers.

---

*End of `FinalPlan-consolidation.md` — ARCH-V3-R1 / C4 FinalPlan role,
2026-08-05. Authored against Plan.md rev 3 under a frozen C2 gate; Plan.md and
every `docs/architecture/` file are untouched by it. **Nothing here is accepted
architecture until V steers** (packet row VS-1). Sibling evidence:
`reviews/merge-verdict-plan-round3.md`, `reviews/merge-verdict-c4.md` and its
addendum, `docs/architecture/09-traceability.md` §8,
`docs/architecture/08-open-questions-for-V.md`.*

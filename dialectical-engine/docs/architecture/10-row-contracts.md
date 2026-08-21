> **RATIFIED — `DR-106`, 2026-08-07 (VG-02 sitting).** V ruled: *"**THE
> ACTIVATION TABLE IS RATIFIED** — `docs/architecture/10-row-contracts.md`
> (71 written predicates) becomes the ruled activation contract, WITH riders as
> read."* This document is therefore **ruled architecture**, not a proposal. It
> was authored under **DR-083** as a proposal and the proposal banner is
> discharged by DR-106.
>
> **The three riders, as read at the sitting (DR-106):** **(a)** Q14 / Q40 / R6
> file `POLICY_BLOCKED`, **loud**, until V supplies fire conditions (§7.3;
> discharges **SP-4** as a filing, not as a predicate); **(b)** **SP-5's
> stage-law derivation stands** — Q26 and Q31 are ACTIVE-capable and do **not**
> move to `POLICY_BLOCKED`, so §7.3's count stays **3**; **(c)** *"opening event
> = WAIT for the 65 conditional rows; per-item rows file 0..N"* — which ratifies
> rider **R-A**'s opening derivation (**SP-13**) and rider **R-D**'s per-item
> reading (**SP-14**).
>
> **Three further rulings land on rows rather than on the banner, and are folded
> in below** (ticket **PRE-14**, 2026-08-07): **`DR-107(1)`** — Q61's
> run-creation filing (**SP-9**); **`DR-107(2)`** — the four "before X" trigger
> phrases (**SP-3**); **`DR-110(3)`** — Q46's filing when Q34's stamps are
> missing (**SP-7**). DR-106's own conditions column recorded *"Q61's
> run-creation filing (SP-9) still open"* at the moment of ratification;
> DR-107(1) closed it the same day.
>
> **What is still owed:** the three `POLICY_BLOCKED` predicates (rider (a)) and
> the stale founding sentences at **SP-1 / SP-2 / SP-10**, whose correction is
> **PRE-11 / PRE-13**'s (DR-111, DR-114) — not this document's.

# 10 — Row contracts: the re-derived activation table (all 71 rows)

Mission PROG-V3-R1 · ticket **PRE-05** (`t_1a358442`) · 2026-08-06 · seat: Claude
worker (Opus 5), authorized under **DR-102** epoch 1.
Authority: **DR-083** (Q-15) · **DR-089** (Q-20) · **ADR-0009** §4 ·
**FX-S22-05** (`06-test-strategy.md` §12, `07-build-order.md`).
Source material: **`docs/founding/requirements-spec.md` §3 in full** (§§3.1–3.13),
§1's activation vocabulary, §23.D's ratified residuals, and the decisions ledgers.
Reviewers on handoff: **Codex** + **Grok** (DR-101's maker-diversity diamond for a
Claude-authored ticket).

---

## 0. How to read this, knowing nothing

The engine answers a question by walking a written discipline — **the battery**:
62 questions (`Q1`…`Q62`) and 9 human-set rules (`R1`…`R9`), 71 rows in eleven
stages. Not every row runs on every question. *"Did the instrument pass its
negative fixture?"* is not a question you can ask of a run that measured nothing.

So each row needs a **written condition** that decides whether it runs — and,
just as important, a written record of what happened when it did not. That record
is the point. A row that quietly does not run is indistinguishable from a row that
ran and found nothing, and the difference between those two is the difference
between an honest answer and a flattering one.

**This document is the list of those conditions — one per row, all 71, in the
spec's own words.** Nothing here decides *what* a row does; that is
`requirements-spec.md` §3. This decides only **when it is owed, when it is
excused, and what has to be written down either way**.

---

## 1. What this document is, and what it is not

**What it is.** The activation table **DR-083** ordered: *"re-derived and ratified
in-repo as a first-class per-row contract field (`ACTIVE / INACTIVE / WAIT /
POLICY_BLOCKED`, written predicate per row, populated from spec §3's row
contracts)."* One row per battery row, carrying:

| Field | What it holds |
|---|---|
| **Row · label** | the row id and its `MACHINE` / `HYBRID` / `LLM` label from spec §3 |
| **Owner** | stage · owning context (`00-overview.md` §2, §4.1) · package |
| **Domain** | the activation states this row may legitimately occupy |
| **ACTIVE when** | the **written predicate**, quote-derived from spec §3 |
| **Off-ACTIVE limbs** | what `INACTIVE` / `WAIT` / `POLICY_BLOCKED` mean *for this row*, and what is recorded |
| **`run_row_activation` · zero-call** | the ADR-0009 event contract for this row, and the FX-S22-05 obligation where the row is one of the 13 MACHINE rows |

**What it is not.**

- **It is not an import.** DR-083: *"No import of the old research artifact."*
  `../research/18-activation-table.md` **is not present in this repository** and
  was not read. Where spec §3's *Fires* column transcribes that artifact's
  disposition, the quote is taken **from the spec**, which is founding law, and
  is labelled as such.
- **It is not a restatement of what a row does.** The *Requirement* text stays in
  spec §3. This document quotes it only where the requirement text **is** the
  activation rule (Q15's cache clause, Q20's recorded-INACTIVE clause, Q33's
  `UNADJUDICATED`, Q39's no-critic receipt, Q60's `PERMANENTLY_UNSCOREABLE`).
- **It invents no numbers** (AC-76 · DR-039). Every threshold, cap and cardinality
  in this document is quoted. The only counts minted here are counts *of rows*,
  and each is checked against spec §3.13.
- **It does not rule the open questions it finds.** §8 lists them for V.

---

## 2. The four-member domain, in the spec's own words

Spec §1, *Activation vocabulary* — quoted in full because every filing in §6
appeals to it:

> A row is **ACTIVE** when the run's recorded state already answers that row's own
> written condition and the answer is yes. **INACTIVE** means the state says no —
> the skip is recorded with its predicate and evidence, so a skipped row stays
> auditable and servable ("nothing could be measured" is an answer, not a
> silence). **WAIT** means the state does not yet hold what the condition asks
> about — and the system must **not** spend a model call guessing the missing
> input. **POLICY_BLOCKED** means the missing input is a V decision: the row is
> owed but unrunnable, and must never be filed as INACTIVE, because an inactive
> row reads as *satisfied* on a coverage report while a policy-blocked row is a
> hole in the specification. A cache hit never sets a row INACTIVE.

Four consequences this document treats as law, not preference:

- **L-1 · POLICY_BLOCKED is never INACTIVE** (spec §1; AC-83; ADR-0009's
  constraint table). A hole must read as a hole.
- **L-2 · A cache hit never sets a row INACTIVE** (spec §1; AC-83). Q15 states the
  positive form: *"A cache hit keeps this row ACTIVE and is merely satisfied from
  the archive."*
- **L-3 · An INACTIVE filing is a written record, not an absence.** Predicate **and**
  evidence, both persisted (spec §1; Q20's disposition names it explicitly).
- **L-4 · WAIT may never be resolved by a model call.** The missing input is
  fetched, computed or waited for — never guessed (spec §1).

**The `·A·` marker is retired** (spec §1): *"The marker survives only as
provenance and must not appear in V3 as a fire condition."* Exactly three rows are
unconditional — **Q1**, **Q51**, and **Q62's liveness limb** — and this table
files no fourth.

---

## 3. The activation-event contract (ADR-0009 · ADR-0007)

Every row's last column instantiates this contract; it is stated once here and
referenced, never re-derived per row.

ADR-0009 §4, quoted:

> `run_row_activation` is an immutable row carrying `{predicate_ref}`; every
> transition — `{state ∈ {ACTIVE, INACTIVE, WAIT, POLICY_BLOCKED},
> predicate_inputs as evaluated at this transition, skip_evidence, at_seq}` —
> lands on the append-only `run_row_activation_event` stream, with the current
> state derived from the latest event (ADR-0007) and a **mandatory initial event
> per battery row written in the same transaction as the run's frozen head**.

What each row therefore owes:

| Element | Per-row content in §6 |
|---|---|
| `predicate_ref` | points at **this document's** written predicate for the row (that is what DR-083 makes a first-class contract field) |
| **initial event** | the state the row opens at, in the run-creation transaction — named per row |
| `predicate_inputs` | the named inputs the predicate reads, as evaluated at each transition — named per row |
| `skip_evidence` | what an `INACTIVE` filing must carry for this row — named per row |
| **transitions** | the state moves this row may emit |

ADR-0009's own justification for why this is not bookkeeping: *"without it, a
runner restart cannot know which rows were WAIT under which predicate, so the
resumed run either re-fires rows the ledger already recorded or files WAIT rows as
INACTIVE — which spec §1 explicitly forbids."*

**Reads never write** (ADR-0007): the current activation state is *derived* from
the latest event; `last_evaluated_at_seq` is derived, never stored.

---

## 4. Standing riders — the rules that apply to every row

These are stated once and inherited by all 71 rows. A rider is **not** a silent
skip: each is written, sourced, and (where it is a derivation) flagged in §8.

**R-A · The opening state.** ADR-0009 mandates an initial activation event per
battery row in the run-creation transaction. At that instant the run holds only
its frozen head, so:

- the **three unconditional rows** (Q1, Q51, Q62's liveness limb) open **ACTIVE**;
- the **three rows with no written predicate** (Q14, Q40, R6 — §7.3) open
  **POLICY_BLOCKED** and stay there until V rules;
- **Q61 opens `INACTIVE`, carrying the settlement-watch handle as its evidence —
  never `WAIT`** (**`RULED — DR-107(1)`**, 2026-08-07): *"every run carries **71
  activation rows** — Q61's is born INACTIVE carrying the settlement-watch handle
  as evidence, never WAIT; the per-row initial-event law stays universal."* This
  is candidate shape **(i)** of the two SP-9 named; shape (ii) — no in-run
  activation record at all — is **rejected by the ruling**, so ADR-0009's
  *"mandatory initial event per battery row"* is universal and **a run has 71
  activation rows, not 70**. **DR-089's placement is untouched**: no `WAIT` event
  may be written for this row at any point in a run (§6.11);
- **every other row opens `WAIT`** — spec §1's exact case: *"the state does not
  yet hold what the condition asks about."* It may not open INACTIVE (that would
  file a skip before anything was evaluated) and may not open ACTIVE (nothing has
  answered its condition yet).

Count: **3 open ACTIVE · 3 open POLICY_BLOCKED · 64 open WAIT · 1 opens INACTIVE
(Q61) = 71.**

**`RULED — DR-106` rider (c)**, verbatim: *"opening event = WAIT for the 65
conditional rows; per-item rows file 0..N."* The 65 conditional rows are the 71
less the three unconditional and the three unpredicated rows; **DR-107(1) then
ruled the 65th — Q61 — to `INACTIVE`**, leaving **64 opening WAIT**. Rider (c)
therefore **discharges SP-13** (the opening-WAIT derivation) and **SP-14** (the
per-item `0..N` reading, rider R-D); Q61's exclusion from the WAIT limb is
DR-089's placement, now completed by DR-107(1)'s filing.

**R-B · The drain law (DR-089).** *"At debate (run) completion NOTHING remains in
a waiting state — every node is fulfilled and user-visible; a waiting node
completes as soon as its dependencies complete."* Therefore **no completed run may
carry a row in WAIT**: by the time the run records its terminal state, every
opening WAIT and every standing WAIT limb has drained to `ACTIVE` or `INACTIVE`.
`POLICY_BLOCKED` is **not** drained — it is a specification hole, not a pending
input, and it is visible at completion by design (L-1).

**R-C · The terminal-route drain, and what survives.** Five terminal routes can
stop a run before an answer (DR-037; `00-overview.md` §4.1 — the count is **five**,
the ledger over the founding table). A terminal stop does **not** leave downstream
rows in WAIT; each files **INACTIVE with the terminal verdict as its
`skip_evidence`** — that is how the drain law is satisfied on a run that stops
early. What still runs is **ruled**, at §23.D `OD-S-03`, **RATIFIED (DR-061)**,
adopted option (b):

> **Behaviour:** *"Three obligations are enforced as the derived minimum: the
> intent record, the provenance on whatever is served, and the run's liveness
> telemetry."* **Adopted:** *"minimum plus wording and the typed not-knowing"* —
> *"Minimum plus careful wording and the typed statement of what is not known."*

Mapped onto rows: **Q1** (intent record) · **Q51** (provenance on whatever is
served — *"for any output including terminal non-answers"*) · **Q62's liveness
limb** (liveness telemetry) · **the typed not-knowing = Q55's five typed
abstentions** · **the wording = the serve-composition text limb**. The last two
mappings are derivations, flagged **SP-8**.

**R-D · Per-item rows (`0..N` / `1..N`).** Seven rows are written as per-item
triggers (Q16, Q28, Q29, Q32, Q33, Q36, R2's item limb). ADR-0009 keeps the
activation record **per battery row** and makes the per-item work the unit of work
— *"an idempotent scoped work item — a `(row, node-set)` pair."* So the row-level
filing is **ACTIVE iff the item set is non-empty**, and **INACTIVE at zero items**
with the enumeration recorded as `skip_evidence`. *(Derived reading — flagged
SP-14.)*

**R-E · A label is not an activation state.** `MACHINE` is a prohibition on model
calls (spec §1, §5.1 F-1), not a fire condition. The 13 MACHINE rows have ordinary
predicates and can be INACTIVE like any other row; what they may never do is spend
a model call — including while *evaluating* their own predicate.

**R-F · A typed output is not an activation state.** `INERT`, `UNPRICED`,
`UNADJUDICATED`, `UNINSTRUMENTED`, `NOT_EMPIRICALLY_DECIDABLE`,
`LEVERAGE_UNRESOLVED`, `AMBIGUOUS_ATTRIBUTION`, `DEGRADED DIVERSITY` and
`UNFALSIFIED-AFTER-ROTATION` are **outputs of ACTIVE rows**. A row that produces
one has run. The single place the spec files a typed output *as* an activation
state is **Q60**: *"no resolver ⇒ `PERMANENTLY_UNSCOREABLE` (INACTIVE, recorded)."*

**R-G · The ordering-deadline rule is Q4's alone, and is `RULED — DR-107(2)` not
to be generalised.**
Spec §3.1 **Q4** states it, **of itself**: *"`before_first_search` is an **ordering
deadline, not an activation conjunct** — a missed deadline is a gate failure, never
a deactivation, or a run could delete its own answer rule simply by starting to
search."* **No source text extends that classification to any other row**, so this
document does **not** extend it. Four other rows carry a "before X" phrase inside
their written trigger — **Q5** (`before_evidence`), **R1** (`before Q15`), **R5**
(`before confident serve`), **R8** (`before source-plan freeze`) — and in all four
the phrase is **kept in the predicate exactly as §3 writes it**. This document
filed the conjunct-or-deadline question as an open ambiguity at **SP-3**; **V
ruled it at VG-02 — `DR-107(2)`, 2026-08-07**, verbatim: *"**SP-3**: Q5/R1/R5/R8
KEEP their literal conjunct predicates — **against the seat recommendation, V's
call** — the self-deactivation risk is accepted and monitored; Q4's deadline rule
is NOT generalized."* So the four phrases are **ruled conjuncts**, the literal
reading each row already carried is **the ruled reading**, and the
self-deactivation consequence stated per row is an **accepted and monitored
risk**, not an unresolved one. Nothing in the four rows' written text changes —
what changes is its status, from *adopted-pending-V* to **RULED**.

---

## 5. How to read a row in §6

- **Quotes** are spec §3 verbatim, or the named ledger row. Text outside quotes is
  the derivation, and any derivation that goes beyond the spec's words carries an
  **SP-n** flag pointing at §8.
- **Domain** notation: `WAIT⁰` = the mandatory opening event (rider R-A);
  **`INACTIVE⁰`** = the ruled opening `INACTIVE` (Q61 only — **`DR-107(1)`**,
  which **retires this table's former `UNDETERMINED` marker**: no row is
  undetermined any more); `→` = the states the row may settle into; `WAIT†` = a
  **standing** WAIT limb the spec writes for this row (Q18 and Q30), and
  **`WAIT‡`** = the **ruled** WAIT limb `DR-110(3)` writes for **Q46** alone.
- **`M n/13`** in the last column marks a MACHINE row and its index in spec
  §3.13's list — the 13-row set is readable off this table alone (§7.2).

---

## 6. The 71 row contracts

### 6.1 Stage 1 — LOCK (Q1–Q6) · context 1 Framing · `battery` + the run's framing state

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q1** · HYBRID | LOCK · ctx 1 Framing · `battery` | `ACTIVE⁰` (no INACTIVE limb) | **Unconditional.** §3.1 Fires: *"**always** (`run_opened`)"*; §1: *"Exactly three rows are unconditional: **Q1**, **Q51**, and **Q62's liveness limb**."* | **None.** Q1's `INERT` terminal is a **run-level stop**, not a self-deactivation (rider R-F); Q1's intent record survives every terminal route (rider R-C). | initial event `ACTIVE` in the run-creation transaction; `predicate_inputs {run_opened}`; no further transitions. |
| **Q2** · HYBRID | LOCK · ctx 1 Framing · `battery` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.1 Fires: *"trigger `Q1=CONTINUE`"*. | `INACTIVE` when Q1 returned `INERT`; `skip_evidence` = the typed INERT verdict id. | open `WAIT` `{Q1_route}` → `ACTIVE` on `Q1=CONTINUE`, else `INACTIVE` (rider R-C). |
| **Q3** · HYBRID | LOCK · ctx 1 Framing · `battery` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.1 Fires: *"trigger `Q1=CONTINUE`"*. | `INACTIVE` on `Q1=INERT`, evidence = the INERT verdict. Q3's own false-presupposition terminal is an **output**, not a deactivation (R-F). | open `WAIT` `{Q1_route}` → `ACTIVE`/`INACTIVE`. |
| **Q4** · HYBRID | LOCK · ctx 1 Framing · `battery` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.1 Fires: *"trigger `Q1=CONTINUE` + `before_first_search`"* — and the row's own text rules the second conjunct out of the predicate: *"`before_first_search` is an **ordering deadline, not an activation conjunct**"* (rider R-G). So the predicate is **`Q1=CONTINUE`** alone. | `INACTIVE` on `Q1=INERT`. A missed deadline is *"a gate failure, never a deactivation"* — it may not move this row off ACTIVE. | open `WAIT` `{Q1_route}` → `ACTIVE`/`INACTIVE`; the deadline is a serve/retrieval gate, not an activation transition. |
| **Q5** · HYBRID | LOCK · ctx 1 Framing · `battery` (+ ctx 9 `memory` for `CARRIED_POSTERIOR`) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.1 Fires, verbatim and entire: **`Q1=CONTINUE` + `before_evidence`** — *"trigger `Q1=CONTINUE` + `before_evidence`"*. **Both conjuncts are kept — `RULED — DR-107(2)`** (V's call at VG-02, 2026-08-07, against the seat's recommendation). The spec classifies `before_evidence` **nowhere**; Q4's deadline rule is stated of `before_first_search` only (rider R-G) and is **not** applied here. **SP-3 resolved — the literal conjunct reading this row already carried IS the ruled reading.** | `INACTIVE` on `Q1=INERT`. *"A silent 0.5 is forbidden; a retrospective prior is forbidden"* — both are gate failures, not deactivations. **Ruled consequence (DR-107(2)):** under the literal conjunct reading — **now the ruled one** — the row also files `INACTIVE` once evidence has been read without a prior recorded. The deadline reading is **not adopted**; the self-deactivation this admits is *"the self-deactivation risk … accepted and monitored"* (DR-107(2)), not an open question. | open `WAIT` `{Q1_route, before_evidence}` — **both written conjuncts are `predicate_inputs`** → `ACTIVE`/`INACTIVE`. Q54 reads this row's record: *"with no prior, movement claims are **unavailable, not zero**."* |
| **Q6** · HYBRID | LOCK · ctx 1 Framing · `battery` (+ ctx 11 `budget`, ctx 12 `register` for the price cell) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.1 Fires: *"trigger `Q1=CONTINUE`"*, blocked-on: *"— (price dependency **satisfied** by DR-012)"*. | `INACTIVE` on `Q1=INERT`. `UNPRICED` is an **output mark** on a row that ran, not a filing (R-F): *"A run whose cell cannot be resolved is marked `UNPRICED`."* | open `WAIT` `{Q1_route}` → `ACTIVE`/`INACTIVE`; §3.13 records the former `POLICY_BLOCKED on abstention` as released by **DR-010 / DR-011 / DR-012**. |

### 6.2 Stage 2 — ROUTE (Q7–Q10) · context 1 Framing · `battery`

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q7** · HYBRID | ROUTE · ctx 1 Framing · `battery` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.2 Fires: *"trigger `LOCK_complete`"*. | `INACTIVE` where LOCK ended in a terminal route (rider R-C); evidence = the terminal verdict. | open `WAIT` `{LOCK_complete}` → `ACTIVE`/`INACTIVE`. The pure-value route and DR-053's `DUAL ACT` are Q7 **outputs** (R-F). |
| **Q8** · HYBRID | ROUTE · ctx 1 Framing · `battery` (+ ctx 12 `register` for R7's standards) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.2 Fires: *"trigger `Q7 not terminal`"*, blocked-on: *"— (the halt is **removed** by DR-021 knob 10)"*. | `INACTIVE` where Q7 was terminal. An **unresolved type is not a deactivation**: *"An unresolved type auto-serves a visible factual fallback with a travelling label — no approval step … The old 'policy-blocked halts the run' branch is deleted."* | open `WAIT` `{Q7_terminality}` → `ACTIVE`/`INACTIVE`. §3.13: the former *"Unregistered fallback authorisation"* block on **Q8, R7 and every row downstream of a Q8 halt** was released by **DR-021 knob 10**. |
| **Q9** · HYBRID | ROUTE · ctx 1 Framing · `battery` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.2 Fires: *"trigger `live_answer_count > 1`"*. | `INACTIVE` at `live_answer_count ≤ 1`; `skip_evidence` = the live-answer enumeration. `NOT_EMPIRICALLY_DECIDABLE` is an **output** of an ACTIVE row (R-F). | open `WAIT` `{live_answer_count}` → `ACTIVE`/`INACTIVE`; the discriminator hand-off to Q20 is a payload, not a transition. |
| **Q10** · HYBRID | ROUTE · ctx 1 Framing · `battery` (+ ctx 3a `battery/decision` — the split decision Stage 6 consumes) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.2 Fires: *"trigger `Q7 not terminal`"*. | `INACTIVE` where Q7 was terminal. `no justification ⇒ depth-zero` is Q10's **output** and the gate on all of Stage 6 (R-F). | open `WAIT` `{Q7_terminality}` → `ACTIVE`/`INACTIVE`. **This row's stored output `Q10.split` is the predicate input for Q26–Q31, Q27, Q30 and Q48.** |

### 6.3 Stage 3 — AIM (Q11–Q14) · context 2 Inquiry · `evidence`

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q11** · HYBRID | AIM · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.3 Fires: *"trigger `research_route and Q4_present`"*. | `INACTIVE` on a non-research route or an absent Q4 record; `skip_evidence` = the route id and the Q4 lookup. | open `WAIT` `{research_route, Q4_present}` → `ACTIVE`/`INACTIVE`. The frozen, versioned, hashed query set is Q15's predicate input (`Q11_frozen`). |
| **Q12** · HYBRID | AIM · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.3 Fires: *"trigger `research_route`"*. | `INACTIVE` on a non-research route, evidence = the route id. An unknown may *"never be silently deleted or quietly converted into an assumption"* — a closure state is an output, not a deactivation. | open `WAIT` `{research_route}` → `ACTIVE`/`INACTIVE`. Q55 reads this ledger; DR-051 scopes the exactly-one law to **ledger unknowns only**. |
| **Q13** · HYBRID | AIM · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.3 Fires: *"trigger `research_route`"*. | `INACTIVE` on a non-research route. A plan without an opposition-capable class is **refused** — a gate failure on an ACTIVE row, not a skip. | open `WAIT` `{research_route}` → `ACTIVE`/`INACTIVE`. |
| **Q14** · HYBRID | AIM · ctx 2 Inquiry · `evidence` (+ ctx 5 `critique` consumes the hit criteria) | **`POLICY_BLOCKED`** (standing) | **No predicate is written.** §3.3's Fires cell carries only release history: *"was **policy-gated** `lineageEquivalence` → **UNBLOCKED by DR-013** · —"*. §14 develops the row's substance and states **no fire condition**. Per **DR-083** — *"a row whose predicate the spec only summarizes files as `POLICY_BLOCKED` — loud, never a silent skip"* — this row is **owed but unrunnable pending V**. | May **never** be filed `INACTIVE` (L-1): an INACTIVE filing would report a missing critic-criteria declaration as *satisfied*. Candidate readings exist (`research_route`, by parity with Q11–Q13; or *"before the critique runs"* read as an ordering deadline) — **named, not adopted** (SP-4). | initial event `POLICY_BLOCKED` in the run-creation transaction, `predicate_ref` = *"unwritten — pending V (VG-02)"*; no transition until V rules. Visible at completion by design. |

### 6.4 Stage 4 — HARVEST (Q15–Q19) · context 2 Inquiry · `evidence`

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q15** · **MACHINE** | HARVEST · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.4 Fires: *"trigger `Q11_frozen and research_route`"*. **Cache clause, in the row's own words:** *"A cache hit keeps this row **ACTIVE** and is merely satisfied from the archive."* | `INACTIVE` only where the route is non-research or the query set never froze; evidence = the frozen-set hash lookup. **A cache hit is never INACTIVE** (L-2 · AC-83). | open `WAIT` `{Q11_frozen, research_route}` → `ACTIVE`/`INACTIVE`. · **`M 1/13` — zero model calls, *"asserted by test"* (FX-S22-05).** |
| **Q16** · HYBRID | HARVEST · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.4 Fires: *"trigger per candidate source (0..N)"* → ACTIVE iff `candidate_source_count ≥ 1` (rider R-D). | `INACTIVE` at zero candidate sources; `skip_evidence` = the candidate enumeration. The eight typed citation-failure routes (DR-084, ratification pending at VG-02) are **outputs**; the hard-kill gate *"auto-activates when V3's character-level quote matcher ships"* — and **DR-088** rules that auto-activation *"counts as shipped dark"*, so until the matcher validates the gate is **written, never shipped inert**, with a NOT-SHIPPED attestation. | open `WAIT` `{candidate_source_count}` → `ACTIVE`/`INACTIVE`; per-source work is the `(row, node-set)` work item (ADR-0009 §2). |
| **Q17** · **MACHINE** | HARVEST · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.4 Fires: *"trigger `Q15_complete`"*. | `INACTIVE` where Q15 never completed (non-research route); evidence = Q15's own filing. **Absence is not a skip**: *"Absence is a servable finding, not a silence"* — a zero-result harvest keeps Q17 **ACTIVE** and produces absence rows. | open `WAIT` `{Q15_complete}` → `ACTIVE`/`INACTIVE`. · **`M 2/13` — zero model calls (FX-S22-05).** |
| **Q18** · HYBRID | HARVEST · ctx 2 Inquiry · `evidence` (+ ctx 10 `liveness`, §13) | `WAIT⁰ → ACTIVE / INACTIVE / WAIT†` | §3.4 Fires: *"trigger `answer_can_change_over_time`"*. | **Standing WAIT limb, written by the spec:** *"**no registry class ⇒ WAIT**, un-waited by one classification call"* — the one licensed un-waiting act, consistent with L-4 (the class is *fetched or classified*, not guessed). **DR-089 drain:** the limb must resolve before completion. `INACTIVE` where the answer cannot change over time; evidence = the volatility class. **Never cached:** *"age recomputed against `as_of` and never cached"* (L-2). | open `WAIT` `{answer_can_change_over_time, registry_class}`; `WAIT†` while the registry supplies no class → `ACTIVE`/`INACTIVE` after the classification call. Both WAIT states drain by completion (rider R-B). |
| **Q19** · HYBRID | HARVEST · ctx 2 Inquiry · `evidence` (+ `propagation` — M3 cluster collapse) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.4 Fires: *"trigger `admitted_source_count > 1`"*. | `INACTIVE` at `admitted_source_count ≤ 1`; `skip_evidence` = the admitted-source count. | open `WAIT` `{admitted_source_count}` → `ACTIVE`/`INACTIVE`. **DR-073**: cluster collapse applies to **both polarities**; a node with no resolvable key clusters alone. |

### 6.5 Stage 5 — RUN (Q20–Q25) · context 2 Inquiry · `evidence`

*Stage law (§3.5), which governs every filing in this stage:* *"if a claim can be
measured with the resources on hand, asserting it unmeasured is inadmissible; a
skip is **recorded** and downgrades the answer to documents-only. **The law forbids
a silent skip, not an INACTIVE state.**"*

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q20** · HYBRID | RUN · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.5 Fires: *"trigger `empirical_research_route`"*. | **The spec writes this row's INACTIVE contract into its enforcement cell:** *"INACTIVE must be recorded with predicate and evidence"*, and the requirement: *"'Nothing was runnable' is a **recorded state with its predicate and evidence**, never an absence."* Note the distinction: *"nothing runnable"* is an **ACTIVE** row's output that fires Q25; INACTIVE is reserved for a non-empirical route. | open `WAIT` `{empirical_research_route}` → `ACTIVE`/`INACTIVE`; `skip_evidence` mandatory on INACTIVE — this row is the spec's worked example of L-3. |
| **Q21** · HYBRID | RUN · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.5 Fires: *"trigger `runnable_selected`"*. | `INACTIVE` where no probe was selected; evidence = Q20's candidate enumeration and its no-runnable output. | open `WAIT` `{runnable_selected}` → `ACTIVE`/`INACTIVE`. The frozen, hashed, timestamped prediction must precede execution — that ordering lives in the row's **requirement** text, not in its trigger, so it is not a predicate element here (contrast Q5/R1/R5/R8, whose triggers *do* carry a "before" phrase — SP-3). |
| **Q22** · **MACHINE** | RUN · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.5 Fires: *"trigger `runnable_selected`"*. | `INACTIVE` where no probe was selected. **A blocked execution is not INACTIVE:** *"A blocked execution **routes explicitly to Q25**"* — the row ran, the block is its recorded output (row-boundary law, DR-040), and it is Q25's predicate input `Q22_blocked`. | open `WAIT` `{runnable_selected}` → `ACTIVE`/`INACTIVE`. · **`M 3/13` — zero model calls; *"No model narrates an execution or paraphrases a result into the evidence ledger"* (FX-S22-05).** |
| **Q23** · **MACHINE** | RUN · ctx 2 Inquiry · `evidence` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.5 Fires: *"trigger `instrument_used`"*. | `INACTIVE` where no instrument was used; evidence = the instrument inventory for the run. An instrument that cannot fail its negative fixture *"is not certified"* — an output of an ACTIVE row. | open `WAIT` `{instrument_used}` → `ACTIVE`/`INACTIVE`. · **`M 4/13` — zero model calls (FX-S22-05).** |
| **Q24** · HYBRID (narrow) | RUN · ctx 2 Inquiry · `evidence` (+ ctx 7 `serve`, §12) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.5 Fires: *"trigger `measurement_attempted`"*. | `INACTIVE` where no measurement was attempted; evidence = the attempt ledger's emptiness with Q20/Q22's filings. | open `WAIT` `{measurement_attempted}` → `ACTIVE`/`INACTIVE`. **Not a zero-call row:** *"One bounded model call writes the limitation sentence **only** when it is not derivable from the attempt diff"* — a conditional single call, outside FX-S22-05's 13-row assertion (§7.2 note). |
| **Q25** · HYBRID | RUN · ctx 2 Inquiry · `evidence` (+ §11 row-boundary home for Q22's blocker narrative) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.5 Fires: *"trigger `Q20_no_runnable or Q22_blocked`"*. | `INACTIVE` where something ran unblocked; evidence = Q22's capture id. | open `WAIT` `{Q20_no_runnable, Q22_blocked}` → `ACTIVE`/`INACTIVE`; disjunctive predicate — either input alone activates. |

### 6.6 Stage 6 — SPLIT (Q26–Q31) · context 3 Argumentation · `graph` (+ ctx 3a `battery/decision`)

*Stage law (§3.6), which supplies the row-level predicate wherever a row's own
cell does not:* *"**The whole stage runs only when Q10 decided to split.** The
generate/filter loop carries the hard cap declared at Q6."*

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q26** · HYBRID | SPLIT · ctx 3a Spawn decision · `battery/decision` (+ ctx 3 `graph` for what a spawn writes) | `WAIT⁰ → ACTIVE / INACTIVE` | **Stage law:** *"The whole stage runs only when Q10 decided to split"* ⇒ **`Q10.split = true`**. The row's own Fires cell carries release history only: *"was **policy-gated** `splitIterationLimit` → **UNBLOCKED by DR-020** (2 rounds / 3 attempts)"* — **stage-derived predicate, flagged SP-5**. | `INACTIVE` at `Q10.split = false` (depth-zero); evidence = Q10's persisted decision and justification. The cap (*"2 rounds / 3 attempts"*, DR-020, declared at Q6) bounds the loop **inside** an ACTIVE row — exhausting it produces an exhaustion mark, never a deactivation. | open `WAIT` `{Q10.split}` → `ACTIVE`/`INACTIVE`; the retry → lineage-rotation → abstain ladder runs inside the ACTIVE filing. |
| **Q27** · **LLM** *(the battery's single LLM row)* | SPLIT · ctx 3 Argumentation · `graph` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.6 Fires: *"trigger `Q10.split=true`"*. | `INACTIVE` at depth-zero; evidence = Q10's decision. `coverage_passed` is *"a forbidden claim"* — the row emits a diagnostic `UNCOVERED-SCOPE` note (DR-020 knob 8); the gate does not ship (`FX-DEF-02`). | open `WAIT` `{Q10.split}` → `ACTIVE`/`INACTIVE`. **LLM label:** code *"may persist, validate the shape, and nothing more"* (spec §1) — no machine gate is licensed to deactivate it. |
| **Q28** · HYBRID | SPLIT · ctx 3 Argumentation · `graph` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.6 Fires: *"trigger per Q26 child (0..N)"* → ACTIVE iff `Q26_child_count ≥ 1` (rider R-D). | `INACTIVE` at zero children (including at `Q10.split=false`); `skip_evidence` = the child enumeration. Coverage: *"load-bearing nodes exhaustive **always**; non-load-bearing sampled"* at the run-frozen rate (DR-019 knob 1, AC-50) — a sampling rate is **not** an activation state; an unsampled node is not an INACTIVE row. | open `WAIT` `{Q26_child_count}` → `ACTIVE`/`INACTIVE`; per-child isolated packets are `(row, node-set)` work items. |
| **Q29** · HYBRID | SPLIT · ctx 3 Argumentation · `graph` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.6 Fires: *"trigger per Q28 survivor (0..N)"* → ACTIVE iff `Q28_survivor_count ≥ 1` (rider R-D). | `INACTIVE` at zero survivors; evidence = Q28's pass/kill record per child. Falsifier-hunt exhaustion yields the visible `UNFALSIFIED-AFTER-ROTATION` mark — *"never silent deletion, never silent full citizenship"* — an output, not a filing (R-F). | open `WAIT` `{Q28_survivor_count}` → `ACTIVE`/`INACTIVE`. |
| **Q30** · HYBRID | SPLIT · ctx 3 Argumentation · `graph` (computation in ctx 6 `propagation`) | `WAIT⁰ → ACTIVE / INACTIVE / WAIT†` | §3.6 Fires: *"**activation** on `Q10.split=true`; **computation WAITs** for Q45's operator and the child values"* — the spec separates the two limbs explicitly. | **Standing WAIT limb, written by the spec:** the computation limb waits on `{Q45_operator, child_values}`. **DR-089 drain:** *"a waiting node completes as soon as its dependencies complete"* — the limb resolves when Q45 declares the operator and the child values exist, and **no completed run may leave it in WAIT**. `INACTIVE` at `Q10.split=false`. Low-leverage children are *"**deprioritised, never killed**"*. | open `WAIT` `{Q10.split}` → `ACTIVE` (judgement limb) with `WAIT†` on the computation limb → drains to the compose-stage arithmetic. Ranking is *"deferred to the compose-stage arithmetic"*, never guessed per child (L-4). |
| **Q31** · HYBRID | SPLIT · ctx 3 Argumentation · `graph` (+ ctx 5 `critique`, §14) | `WAIT⁰ → ACTIVE / INACTIVE` | **Stage law:** `Q10.split = true`. The row's own cell carries release history only: *"was **policy-gated** `lineageEquivalence` → **UNBLOCKED by DR-013**"* — **stage-derived predicate, flagged SP-5**. | `INACTIVE` at depth-zero; evidence = Q10's decision. **No-different-maker is not a deactivation:** the fallback is *"prompt diversification plus bias mitigations, **labelled `DEGRADED DIVERSITY`**"*, and *"at cold start the run is maker-only and says so."* | open `WAIT` `{Q10.split}` → `ACTIVE`/`INACTIVE`. **DR-090:** selection runs on *"the maker-diversity floor alone"*; *"measured behavioural difference"* is recorded as **unavailable, not approximated** — an unmeasured input may not be synthesised (L-4's spirit at the substance layer). |

### 6.7 Stage 7 — WEIGH (Q32–Q38) · context 4 Appraisal · `judgement`

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q32** · HYBRID | WEIGH · ctx 4 Appraisal · `judgement` (+ ctx 2 `evidence` for the Q2 binding) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.7 Fires: *"trigger per evidence item (0..N)"* → ACTIVE iff `evidence_item_count ≥ 1` (rider R-D). | `INACTIVE` at zero evidence items; `skip_evidence` = the admitted-item enumeration. A rejected item is a **recorded rejection** on an ACTIVE row: *"Wholly off-subject evidence is rejected before scoring, with the reason logged."* | open `WAIT` `{evidence_item_count}` → `ACTIVE`/`INACTIVE`; per-item typing is a `(row, node-set)` work item. |
| **Q33** · HYBRID | WEIGH · ctx 4 Appraisal · `judgement` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.7 Fires: *"trigger per claim or leaf (0..N)"* → ACTIVE iff `claim_or_leaf_count ≥ 1` (rider R-D). | **Zero adverse evidence is not INACTIVE** — the row's disposition says it *"fires even with zero adverse evidence → typed `UNADJUDICATED`"*, and the requirement: *"With no adverse evidence the row records `UNADJUDICATED`."* `INACTIVE` only where there is no claim or leaf at all. | open `WAIT` `{claim_or_leaf_count}` → `ACTIVE`/`INACTIVE`. A worked instance of rider R-F: the empty finding is an output, not a skip. |
| **Q34** · **MACHINE** (the verdict) | WEIGH (stage) · **ctx 5 Adjudication** · `critique` + `ledger` (`00-overview.md` §4.1 places *"the symmetry diff with no fairness scalar"* in ctx 5) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.7 Fires: *"trigger `evidence_on_both_sides`"*. | `INACTIVE` where evidence exists on one side only; `skip_evidence` = the per-side item sets. **Missing records are not INACTIVE:** *"Where records are missing the verdict is typed **`UNINSTRUMENTED`, which blocks the fairness claim** — never a silent pass."* | open `WAIT` `{evidence_on_both_sides}` → `ACTIVE`/`INACTIVE`. · **`M 5/13` — zero model calls, *the verdict limb only*.** The row also carries *"an openly-marked model **remediation layer** (substance: LLM) that never replaces the verdict and never gates"* — that call is **licensed** and sits **outside** FX-S22-05's assertion, which binds the verdict limb (§7.2 note). **DR-092:** the diff runs over *"item-scoped actions only"*; pre-item actions are excluded **by kind, never by value**. **Q46 depends on this row's two ledger stamps** (`subject_item_id`, `stance_at_action`; `FX-LED-04`). |
| **Q35** · HYBRID | WEIGH · ctx 4 Appraisal · `judgement` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.7 Fires: *"trigger `source_is_load_bearing`"*. Load-bearing is defined by **DR-079**: a claim is load-bearing iff its node is. | `INACTIVE` where no source is load-bearing; evidence = the load-bearing node set. A zero-weight source is **retained**: *"retained on the record at exactly zero weight — never deleted, never averaged in."* | open `WAIT` `{source_is_load_bearing}` → `ACTIVE`/`INACTIVE`. |
| **Q36** · HYBRID | WEIGH · ctx 4 Appraisal · `judgement` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.7 Fires: *"trigger per weighted claim + every served answer (1..N)"* — **cardinality `1..N`, not `0..N`**: every served answer supplies at least one instance, so any run that serves activates this row (rider R-D). | `INACTIVE` only on a run with no weighted claim **and** no served answer; evidence = both enumerations. Unmeasured certainty is **typed**, not skipped: *"A confidence with no measurement behind it is typed as unmeasured and may not be presented as measured."* | open `WAIT` `{weighted_claim_count, served_answer_count}` → `ACTIVE`/`INACTIVE`; rubric selection is *"keyed to a registry version"* (ctx 12 `register`). |
| **Q37** · HYBRID | WEIGH · ctx 4 Appraisal · `judgement` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.7 Fires: *"trigger `question_type=causal OR settlement_act=measurement`, **with a study result in use**"* — a disjunction under a conjunct. | `INACTIVE` where neither disjunct holds **or** no study result is in use; `skip_evidence` = the Q8 type, the Q7 act and the study-result inventory. A warned-about bias *"may **never** be averaged away"* — the disposition of repair / bound / exclude is enforced on an ACTIVE row. | open `WAIT` `{question_type, settlement_act, study_result_in_use}` → `ACTIVE`/`INACTIVE`. |
| **Q38** · HYBRID | WEIGH · ctx 4 Appraisal · `judgement` (+ manifest §5.2h dispersion) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.7 Fires: *"trigger `numeric_answer_planned`"*. | `INACTIVE` where no number is planned; evidence = the planned-answer shape. **Missing dispersion is not a skip and never a zero:** *"Fewer than two parseable judgements yields **no** dispersion measurement, and **that absence is never read as zero uncertainty**."* A number with no uncertainty source is *"unservable"* — a serving gate, not a deactivation. | open `WAIT` `{numeric_answer_planned}` → `ACTIVE`/`INACTIVE`. |

### 6.8 Stage 8 — CROSS (Q39–Q44) · context 5 Adjudication · `critique`

*Stage law (§3.8):* *"research and criticism never share a context; the agent that
produced an artifact never grades it."* This is an **isolation and ordering law**,
not a fire condition — it constrains how an ACTIVE row runs, and supplies no
predicate to a row whose own cell lacks one.

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q39** · **MACHINE** | CROSS · ctx 5 Adjudication · `critique` + `ledger` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.8 Fires: *"trigger `research_answer_reaches_CROSS` — **exempt from critic availability**"*. §14 L-7: the receipt is *"machine and unconditional at CROSS"*. | `INACTIVE` only where no research answer reaches CROSS (terminal route, rider R-C). **No critic is never INACTIVE:** *"The receipt is recorded even when no critic exists: **absence is itself a receipt state**"*, and its consequence is DR-014's cap-label-lift. | open `WAIT` `{research_answer_reaches_CROSS}` → `ACTIVE`/`INACTIVE`. · **`M 6/13` — zero model calls; the receipt is *"computed from logs and hashes with no model asked anything"* (FX-S22-05).** |
| **Q40** · HYBRID | CROSS · ctx 5 Adjudication · `critique` | **`POLICY_BLOCKED`** (standing) | **No predicate is written.** §3.8's Fires cell carries only release history: *"was **policy-gated** `lineageEquivalence` → **UNBLOCKED by DR-013** · —"*. §14 L-8 places the critique's substance at this row but states **no fire condition**; the stage law supplies isolation, not activation. Filed `POLICY_BLOCKED` under **DR-083**. | May **never** be filed `INACTIVE` (L-1): that would report an unperformed source-reopening and sum-rerun as *satisfied*. Candidate reading `eligible_critic_run` (Q41's predicate) is **named, not adopted** (SP-4). | initial event `POLICY_BLOCKED` in the run-creation transaction; `predicate_ref` = *"unwritten — pending V (VG-02)"*; no transition until V rules. |
| **Q41** · HYBRID | CROSS · ctx 5 Adjudication · `critique` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.8 Fires: *"trigger `eligible_critic_run`"*. | `INACTIVE` where no eligible critic ran; `skip_evidence` = Q39's receipt state (which records the absence). *"A critique that does neither is not a critique"* — recorded as such on an ACTIVE row. | open `WAIT` `{eligible_critic_run}` → `ACTIVE`/`INACTIVE`. **DR-055:** standard-and-above tiers execute real different-maker critique from day one; single-maker is *"legal only as labelled degraded operation under DR-014's caps"*. |
| **Q42** · **MACHINE** | CROSS · ctx 5 Adjudication · `critique` + `ledger` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.8 Fires: *"trigger `critic_agrees`"*. | `INACTIVE` where the critic did not agree, or no critic ran; evidence = the critique verdict and the unblinding log. | open `WAIT` `{critic_agrees}` → `ACTIVE`/`INACTIVE`. · **`M 7/13` — zero model calls; *"decided by the unblinding log, not by anyone's recollection"* (FX-S22-05).** |
| **Q43** · HYBRID | CROSS · ctx 5 Adjudication · `critique` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.8 Fires: *"trigger `split_or_composed_answer`"*. **The second conjunct is DROPPED, not open.** §3.8's cell marks `alternate_method_required` **OPEN** and §3.13 repeats it, but §23.D **`OD-S-02` is stamped RATIFIED (DR-061)**, adopted: *"**drop the undefined condition; the row fires on split or composed answers**."* Spec §2 item 1 — *"Where this spec and a DR disagree, the DR wins and this spec is wrong"* — so the predicate is the single conjunct. **§3's OPEN text is stale: flagged SP-1.** | `INACTIVE` where the answer was neither split nor composed; evidence = Q10's decision and the compose record. **No permanent WAIT:** the risk §23.D named — *"the row would sit permanently waiting and a checking obligation would disappear"* — is closed by the drop, and would in any case be forbidden by DR-089's drain law. | open `WAIT` `{split_or_composed_answer}` → `ACTIVE`/`INACTIVE`. The undefined conjunct is **not** a `predicate_input` and must not be evaluated. |
| **Q44** · HYBRID | CROSS · ctx 5 Adjudication · `critique` (+ ctx 7 `serve` — the residual set is served) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.8 Fires: *"trigger `CROSS_stage_entered`"*. | `INACTIVE` only where CROSS was never entered (terminal route, rider R-C). **No critic is not a skip:** *"It resolves at CROSS entry even when no critic ran."* | open `WAIT` `{CROSS_stage_entered}` → `ACTIVE`/`INACTIVE`. The residual objection set is *"a first-class served object"* and Q53's fact-bundle input. |

### 6.9 Stage 9 — COMPOSE (Q45–Q50) · context 6 Recomposition · `propagation` + `valuation`

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q45** · HYBRID with a machine-only fast path | COMPOSE · ctx 6 Recomposition · `propagation` (+ ctx 12 `register` for the operator row) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.9 Fires: *"trigger `multiple_components_to_compose`"*. | `INACTIVE` at a single component; `skip_evidence` = the component enumeration. **The withhold limb is unreachable at deployment level under DR-074:** the spec says *"With no declaration the parent number is withheld and the components are served alone"*, but DR-074 rules the deployment operator *"**MANDATORY, never blank**"* and *"the declare-once/withhold runtime machinery is **dropped from the design** (nothing left to trigger it)"*. **Flagged SP-6.** | open `WAIT` `{multiple_components_to_compose}` → `ACTIVE`/`INACTIVE`. **Conditional zero-call, but not one of the 13:** *"When they come from policy, config or a human the row runs with **zero model calls**. When they do not, exactly one bounded declaration call is mandatory"* — HYBRID, outside FX-S22-05 (§7.2 note). This row's operator is Q30's and Q46's predicate input. |
| **Q46** · **MACHINE** | COMPOSE · ctx 6 Recomposition · `propagation` | `WAIT⁰ → ACTIVE / INACTIVE`, **plus `WAIT‡` on missing stamps** (`RULED — DR-110(3)`) | §3.9 Fires: *"trigger `Q45_computable`"*. | `INACTIVE` where Q45 is not computable; evidence = Q45's filing. The halt is *"**bounded** by DR-050 at K=1 round per parent per run"*, after which the answer carries a visible `LEVERAGE_UNRESOLVED` residual — a bounded re-execution **inside** an ACTIVE row (ADR-0009 §2's scoped work item), never a re-activation loop. **`WAIT‡` — the stamp-less filing, `RULED — DR-110(3)`:** *"Q46 files WAIT when Q34's stamps are missing."* Never `INACTIVE` (that would read as *"no leverage/verification mismatch"*, a satisfied claim) and **not** `POLICY_BLOCKED`, which was the seat's recommendation and **V ruled against it**. | open `WAIT` `{Q45_computable}` → `ACTIVE`/`INACTIVE`. · **`M 8/13` — zero model calls (FX-S22-05).** **Build precondition:** *"Without Q34's two ledger stamps this gate cannot execute at all"* — the stamps are a build-time obligation (`FX-LED-04`). **The spec named no activation state for a stamp-less run; `DR-110(3)` supplies it: `WAIT`, with its consequence recorded in the ruling itself** — *"under DR-089's drain law a run cannot complete while Q46 waits — the filing FORCES the stamps before terminal."* So a stamp-less run **cannot reach a terminal state at all** (rider R-B: no completed run may carry a row in WAIT), and the missing stamps surface as a blocked completion rather than as a satisfied gate. **SP-7 resolved.** |
| **Q47** · **MACHINE** | COMPOSE · ctx 6 Recomposition · `propagation` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.9 Fires: *"trigger `approved_variant_count > 1`"*. | `INACTIVE` at one approved variant; `skip_evidence` = the approved-variant enumeration (a register read — DR-074's mandatory deployment row plus optional parent/run overrides). | open `WAIT` `{approved_variant_count}` → `ACTIVE`/`INACTIVE`. · **`M 9/13` — zero model calls; the rival operator is *"computable on demand"*, and where the band flips *"both readings are served with the deciding choice printed — never averaged, never an abstention"* (FX-S22-05).** |
| **Q48** · HYBRID | COMPOSE · ctx 6 Recomposition · `propagation` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.9 Fires: *"trigger `Q10.split=true and both_answers_exist`"* — a two-conjunct predicate. | `INACTIVE` at depth-zero, or where only one of the two answers exists; `skip_evidence` = Q10's decision plus the baseline/decomposed artifact ids. **The baseline is never regenerated to satisfy the predicate:** *"The stored holistic baseline is diffed against the decomposed answer — **never regenerated**"* (Q10 `[CD]`: the baseline *"is never regenerated"*). An unmatched comparison *"is marked non-comparable"* — an output, not a filing. | open `WAIT` `{Q10.split, both_answers_exist}` → `ACTIVE`/`INACTIVE`. |
| **Q49** · **MACHINE** | COMPOSE · ctx 6 Recomposition · `propagation` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.9 Fires: *"trigger `composed_answer_with_typed_ranges`"*. | `INACTIVE` where no composed answer carries typed ranges; evidence = the composed-answer shape. | open `WAIT` `{composed_answer_with_typed_ranges}` → `ACTIVE`/`INACTIVE`. · **`M 10/13` — zero model calls (FX-S22-05).** `[CD]` fragility is *"an **output, never a weight**"*; feeding sensitivity back into base scores is *"forbidden by construction"* — the no-feedback law is a write rule, not an activation rule. |
| **Q50** · HYBRID | COMPOSE · ctx 6 Recomposition · **`valuation`** (§15 value boundary) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.9 Fires: *"trigger `question_type ∈ {comparative, design}`"* — read off Q8's closed six. | `INACTIVE` for every other question type; `skip_evidence` = the Q8 type record. **Missing weights are not a deactivation:** *"Missing weights route to the value owner and the system serves the **conditional** result plus the reversal point — a full answer, not a value-choice abstention."* | open `WAIT` `{question_type}` → `ACTIVE`/`INACTIVE`. *"Weights are never model-supplied"*; all arithmetic is machine — but the row is HYBRID (criteria are LLM) and is **not** one of the 13. |

### 6.10 Stage 10 — SERVE (Q51–Q58) · context 7 Serving · `serve`

*Gate order (DR-049), which orders these rows without changing their predicates:*
**R9 → Q53 → conformance → Q51**.

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q51** · HYBRID | SERVE · ctx 7 Serving · `serve` | `ACTIVE⁰` (no INACTIVE limb) | **Unconditional.** §3.10 Fires: *"**always** — the sole never-disabled serving invariant, for any output **including terminal non-answers**"*; §1 names it one of the three unconditional rows. | **None.** A missing locator *"blocks serving"* — a gate failure, never a deactivation. A reasoning-only claim is *"downgraded from a verdict to a hypothesis plus a research plan"* — an output. | initial event `ACTIVE` in the run-creation transaction; `predicate_inputs {}`; no transitions. **Terminal-route survivor** (rider R-C). *"Q51 is the LAST gate in DR-049's order."* |
| **Q52** · HYBRID | SERVE · ctx 7 Serving · `serve` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.10 Fires: *"trigger `any_serve_candidate` (read **narrower than Q51** — excludes terminal non-answers)"*. | `INACTIVE` on a terminal non-answer; `skip_evidence` = the terminal route id. **Tension with OD-S-03(b)'s ruled *"careful wording"* survivor obligation — flagged SP-8.** | open `WAIT` `{any_serve_candidate, terminality}` → `ACTIVE`/`INACTIVE`. |
| **Q53** · **MACHINE** | SERVE · ctx 7 Serving · `serve` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.10 Fires: *"trigger `any_serve_candidate` — **the check still runs on an empty objection ledger**"*. | `INACTIVE` where there is no serve candidate at all. **An empty objection ledger is not INACTIVE** — the check runs and records. | open `WAIT` `{any_serve_candidate}` → `ACTIVE`/`INACTIVE`. · **`M 11/13` — zero model calls; a **serving precondition** (FX-S22-05).** Per DR-049 *"Q53's residual objection is a **FACT-BUNDLE FIELD**, not optional prose"*, and Q53 runs **second** in the gate order. |
| **Q54** · HYBRID | SERVE · ctx 7 Serving · `serve` (+ ctx 1 `battery` for Q5's prior) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.10 Fires: *"trigger `any_serve_candidate`; also requires Q5's recorded prior"*. | `INACTIVE` where there is no serve candidate. **A missing prior is not INACTIVE:** *"with no prior, movement claims are **unavailable, not zero**"* — the row is ACTIVE and serves the typed unavailability. `AMBIGUOUS_ATTRIBUTION` is likewise an output: *"no model call breaks a tie the record cannot break"* (L-4). | open `WAIT` `{any_serve_candidate, Q5_prior_present}` → `ACTIVE`/`INACTIVE`; belief updates are *"event-sourced: a belief update cites its cause when it is made"*, never reconstructed. |
| **Q55** · HYBRID | SERVE · ctx 7 Serving · `serve` + `kernel` (the closed abstention vocabulary) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.10 Fires: *"trigger `any_open_unknown_at_serve`"*. | `INACTIVE` where no unknown is open at serve; `skip_evidence` = the Q12 ledger's closure states. **DR-051 scope:** the exactly-one law binds *"**only** ignorance-ledger unknowns"*; every other typed state is a **condition mark** in the closed parallel enum, servable alongside. | open `WAIT` `{open_unknown_count}` → `ACTIVE`/`INACTIVE`. **Terminal-route survivor** — OD-S-03(b)'s *"typed statement of what is not known"* maps here (rider R-C, flagged SP-8). |
| **Q56** · **MACHINE** | SERVE · ctx 7 Serving · `serve` (price cell read from ctx 12 `register`) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.10 Fires: *"was **POLICY_BLOCKED** on `abstention` → **UNBLOCKED by DR-010/011/012**; the remaining conjunct **`class_history_sufficient`** is an ordinary trigger"* ⇒ predicate = **`class_history_sufficient`**. | `INACTIVE` where class history is insufficient; `skip_evidence` = the class-history count for the run's question-class × risk-tier cell. **No invented threshold:** what makes history "sufficient" is a register row, not a number this document may mint (AC-76 · DR-039). | open `WAIT` `{class_history_sufficient}` → `ACTIVE`/`INACTIVE`. · **`M 12/13` — zero model calls (FX-S22-05).** This is the spec's own worked example of a `POLICY_BLOCKED` row released by ruling — §3.13's *"Was: POLICY_BLOCKED on `abstention` · Released by: DR-010 / DR-011 / DR-012."* |
| **Q57** · HYBRID | SERVE · ctx 7 Serving · `serve` (+ ctx 6 `valuation` — the overlay) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.10 Fires: *"trigger `candidate_contains_or_may_contain_value_clause`"* — note the disjunction is **inside** the predicate: *may* contain is enough to activate. | `INACTIVE` only where the candidate provably contains no value clause; `skip_evidence` = the normative-clause detector's output over the draft. | open `WAIT` `{value_clause_detected_or_possible}` → `ACTIVE`/`INACTIVE`. A recommendation with no named normative owner is *"a **defect**, not a style choice"* — a gate failure on an ACTIVE row. |
| **Q58** · HYBRID | SERVE · ctx 7 Serving · `serve` + ctx 10 `liveness` (§13) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.10 Fires: *"trigger `empirical_serve_candidate`"*. | `INACTIVE` on a non-empirical serve candidate (e.g. a value-routed return); `skip_evidence` = the Q7 act and Q8 type. | open `WAIT` `{empirical_serve_candidate}` → `ACTIVE`/`INACTIVE`. The named conditions *"are **registered as watched revision triggers**"* (DR-015) — the watch is a liveness object, not a WAIT state on this row. |

### 6.11 Stage 11 — SETTLE (Q59–Q62) · context 8 Settlement · `settlement`

*This stage is where **DR-089** does its sharpest work, and it does two distinct
things that must not be conflated. For **Q59/Q60/Q62** it is the **drain law**: a
completed run may not hold a row open waiting. For **Q61** it is a **placement
ruling**, which is stronger — the row is not drained out of WAIT at completion,
it **never occupies intra-run WAIT at all**, because the standing watch lives
**outside** the run lifecycle and persists **across** runs.*

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **Q59** · HYBRID | SETTLE · ctx 8 Settlement · `settlement` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.11 Fires: *"trigger `answer_record_created`"*. The cell adds *"deployment scope depends on `stage11Rollout` (**OPEN**, §23 `OD-S-01`)"* — but **`OD-S-01` is stamped RATIFIED (DR-061)**, adopted *"**phased — recording from day one**, scoring and calibration later"*, so **the recording limb is ACTIVE from day one** and the OPEN annotation is stale (**flagged SP-10**). | `INACTIVE` where no answer record was created (a terminal route with no served answer record); evidence = the terminal route id. **No external resolver is not INACTIVE:** *"With no external resolver the answer is typed `PERMANENTLY_UNSCOREABLE` — **expected for a value choice, not a defect**"* — an output that becomes Q60's predicate input. | open `WAIT` `{answer_record_created}` → `ACTIVE`/`INACTIVE`. OD-S-01's ruled behaviour: *"Outcome ingestion waits for an outcome to arrive"* — that wait is the **standing watch outside the run** (DR-089), not a WAIT filing on this row. |
| **Q60** · **MACHINE** | SETTLE · ctx 8 Settlement · `settlement` | `WAIT⁰ → ACTIVE / INACTIVE` | §3.11 Fires: *"trigger `Q59_scoreable`"*. | **The spec files this row's INACTIVE limb itself:** *"no resolver ⇒ `PERMANENTLY_UNSCOREABLE` (**INACTIVE, recorded**)"* — the one place a typed output is also the activation filing (rider R-F), and it is **recorded**, per L-3, never silent. | open `WAIT` `{Q59_scoreable}` → `ACTIVE`/`INACTIVE`; `skip_evidence` = the `PERMANENTLY_UNSCOREABLE` typing and the resolver lookup. · **`M 13/13` — zero model calls; `[CD]` read-back verification (FX-S22-05).** Scoring keys on `(answer_id, answer_version, as_of)` *"because DR-015 lets an answer be woken and changed"*. |
| **Q61** · HYBRID | SETTLE · ctx 8 Settlement · `settlement` + ctx 9 `memory` (§17) + ctx 4 `judgement` (versioned weights) | **`INACTIVE⁰` — NO INTRA-RUN `WAIT`, ever.** In-run: `ACTIVE` never (the predicate cannot hold before completion) and **`WAIT` is forbidden by DR-089's placement, not merely drained by it**. The run-creation filing is **`INACTIVE`, carrying the settlement-watch handle as evidence** (`RULED — DR-107(1)`). Post-completion, **outside the run lifecycle**: `ACTIVE` when the predicate holds. | §3.11 Fires: *"trigger `resolver_outcome_arrived and Q60_valid` — **the battery's only cross-run trigger**"* — **evaluated by the Stage-11/settlement watch, not by the run**. §3.11's *"may sit in WAIT indefinitely without that being a defect"* is **superseded-in-part by DR-089**: *"Q61 is therefore **not an intra-run WAIT row but a post-completion settlement event** — the run records a typed terminal state at completion; the standing watch lives **outside the run lifecycle** (Stage-11/settlement) and fires when the resolver outcome arrives."* DR-089's conditions column: *"the indefinite watch persists **ACROSS runs, outside any run**."* | The row has **no in-run off-ACTIVE limb to file**, because it has no in-run ACTIVE state to leave. **DR-089 bounds the firing:** *"Q61 fires AFTER the debate is completed … if the debate is not completed or cannot complete, **it never fires for that debate**."* **The run-creation filing is `RULED — DR-107(1)`**, 2026-08-07, verbatim: *"every run carries **71 activation rows** — Q61's is born INACTIVE carrying the settlement-watch handle as evidence, never WAIT; the per-row initial-event law stays universal."* That is **candidate shape (i)** of the two SP-9 named; **shape (ii)** — no in-run activation record at all — is **rejected**. The tension SP-9 identified is resolved in favour of ADR-0009's *"mandatory initial event per battery row"*, **with DR-089's placement intact**: the row is a member of the run's activation set, and the `INACTIVE` filing is what carries its off-ACTIVE record. Per L-3 the filing is a written record with predicate **and** evidence — here the **settlement-watch handle** is that evidence. | **No `WAIT` event is written for this row at any point in a run** (DR-089). The run-creation event is **`INACTIVE`, with the settlement-watch handle as `skip_evidence`** (`DR-107(1)`) — so **a run has 71 activation rows, not 70**. Firing is a **settlement-job** event **outside** `run_row_activation`'s run scope, *"its outcome saved to the execution ledger (DR-027)"*; *"calibration updates version from the ledger record."* §3.11's *"mechanism design **DRAFT — V RULES**"* is stale under DR-061's wholesale ratification of §23 block B; its **founding-text correction is authorized at `DR-114(3)`** and belongs to **PRE-13**, not to this document. **A prior-session match never reduces the work** and never admits the prior verdict as evidence (L-2's sibling at the memory layer). |
| **Q62** · HYBRID | SETTLE · **liveness limb** ctx 10 `liveness` (§13) · **attribution limb** ctx 8 `settlement` (§16) | **liveness limb `ACTIVE⁰`** · attribution limb `WAIT⁰ → ACTIVE / INACTIVE` | §3.11 Fires: *"**always** (liveness limb) + trigger `wrong_resolved_outcome` (attribution limb)"*; §1 names *"Q62's liveness limb"* as the third unconditional row. Requirement: *"Liveness telemetry is written on **every closed run**."* | Liveness limb: **none**. Attribution limb `INACTIVE` where the resolved outcome was not wrong (or none arrived); `skip_evidence` = the resolution record. Retirement is *"**archival** — the full graph is kept and auto-revived by the next query; nothing is deleted"*; `UNDER-EXPLORED` is *"**never a retirement cause on its own**"* (DR-016 T-9). | two limbs on one `run_row_activation` row: initial event `ACTIVE` (liveness) in the run-creation transaction; the attribution limb transitions `WAIT → ACTIVE/INACTIVE` on the resolved outcome. **Terminal-route survivor** (rider R-C). |

### 6.12 The nine human-set rules (R1–R9)

*DR-036's standing law over this whole block:* *"A human-set rule may never be
labelled model-work: **content from the model, force from the machine**."* All nine
are **HYBRID**; none is one of the 13 MACHINE rows.

| Row · label | Owner | Domain | ACTIVE when — written predicate | Off-ACTIVE limbs | `run_row_activation` · zero-call |
|---|---|---|---|---|---|
| **R1** · HYBRID | AIM→HARVEST · ctx 2 Inquiry · `evidence` (§7) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.12 Fires, verbatim and entire: **`research_route before Q15`** — *"trigger `research_route before Q15`"*. **The `before Q15` phrase is kept in the predicate — `RULED — DR-107(2)`**; Q4's deadline rule is not extended to it (rider R-G). **SP-3 resolved as written.** | `INACTIVE` on a non-research route; evidence = the route id. Off-plan retrieval *"**cannot support a claim**"* — a refusal on an ACTIVE row. **Ruled consequence (DR-107(2)):** read literally — **the ruled reading** — the row is owed only ahead of Q15, so a post-Q15 evaluation files INACTIVE. The deadline reading is not adopted; the self-deactivation is accepted and monitored. | open `WAIT` `{research_route, before_Q15}` — both written elements are `predicate_inputs` → `ACTIVE`/`INACTIVE`. Whether the frozen set may grow mid-run is DR-008's typed-amendment rule, not an activation question. |
| **R2** · HYBRID | **binding limb** LOCK · ctx 1 `battery` (§6) · **item limb** WEIGH · ctx 2 `evidence` (§7, at Q32) | `WAIT⁰ → ACTIVE / INACTIVE` (both limbs) | §3.12 Fires: *"**always** (binding limb, **inheriting Q2's `Q1=CONTINUE` gate**) + trigger per evidence item"*. The "always" is **explicitly gated**, so it does **not** make a fourth unconditional row (spec §1's *"exactly three"* holds — **flagged SP-12** for the reviewer who reads "always" alone). Item limb: ACTIVE iff `evidence_item_count ≥ 1` (rider R-D). | `INACTIVE` on `Q1=INERT` (binding limb) or zero evidence items (item limb); evidence = the INERT verdict / the item enumeration. | open `WAIT` `{Q1_route, evidence_item_count}` → `ACTIVE`/`INACTIVE` per limb; the binding is *"set once and enforced at Q32 on every item"*. |
| **R3** · HYBRID | AIM · ctx 2 Inquiry · `evidence` (§6) | `WAIT⁰ → ACTIVE / INACTIVE` (**re-activating**) | §3.12 Fires: *"trigger `research_route at AIM`, **re-fires on new evidence** — the only row with an explicit re-activation clause"*. | `INACTIVE` on a non-research route; evidence = the route id. *"**No silent deletion**"*: an unknown's closure is a typed transition on an ACTIVE row. | open `WAIT` `{research_route}` → `ACTIVE`/`INACTIVE`, and **`ACTIVE → ACTIVE` re-entry on each new-evidence event** — the append-only stream (ADR-0009) carries repeated activations with their own `at_seq`, which is why re-activation needs no new state member. |
| **R4** · HYBRID | AIM · ctx 2 Inquiry · `evidence` (§6) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.12 Fires: *"trigger `research_route at AIM`"*. | `INACTIVE` on a non-research route. Single-class coverage is *"surfaced as a deficit"* — an output. | open `WAIT` `{research_route}` → `ACTIVE`/`INACTIVE`. |
| **R5** · HYBRID | CROSS · ctx 5 Adjudication · `critique` (§14) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.12 Fires, verbatim and entire: **`nonterminal researched answer before confident serve`** — *"trigger `nonterminal researched answer before confident serve`"*. **The `before confident serve` phrase is kept in the predicate — `RULED — DR-107(2)`**; Q4's deadline rule is not extended to it (rider R-G). **SP-3 resolved as written.** | `INACTIVE` on a terminal route or a non-researched answer; evidence = the terminal route / route id. **Ruled consequence (DR-107(2)):** read literally — **the ruled reading** — a run that has already served confidently files INACTIVE. The deadline reading is not adopted; the self-deactivation is accepted and monitored. **No eligible second lineage is not INACTIVE:** the answer *"serves but **cannot reach the top confidence band**, carries a visible 'independent critique unavailable' label with its reason, and records a lift condition whose later execution re-scores"* (DR-014 L-4). | open `WAIT` `{nonterminal_researched_answer, before_confident_serve}` — both written elements are `predicate_inputs` → `ACTIVE`/`INACTIVE`. |
| **R6** · HYBRID | LOCK/AIM · ctx 1 Framing · `battery` + ctx 9 `memory` (§6.4, §17) | **`POLICY_BLOCKED`** (standing) | **No predicate is written.** §3.12's Fires cell carries only release history: *"was **policy-gated** `lineageEquivalence` → **UNBLOCKED by DR-013**; the blind two-lineage comparison is now executable · —"*. §6.4's Requirement P-5 specifies **how** the comparison runs and states **no fire condition**. Filed `POLICY_BLOCKED` under **DR-083**. | May **never** be filed `INACTIVE` (L-1): the row's own law is that it *"**must never silently pass**"*, and an INACTIVE filing is exactly a silent pass on a coverage report. Candidate readings (`Q1=CONTINUE`, by LOCK parity; or `research_route at AIM`, by R3/R4 parity) are **named, not adopted** (SP-4). | initial event `POLICY_BLOCKED` in the run-creation transaction; `predicate_ref` = *"unwritten — pending V (VG-02)"*; no transition until V rules. The plain sentence stays *"display-only … never hashed, never part of an identity key"* (§17). |
| **R7** · HYBRID | ROUTE · ctx 1 Framing · `battery` + ctx 12 `register` (§5) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.12 Fires: *"trigger `beside Q8 type routing`"* — a **co-firing** predicate: R7 activates with Q8, so its input is Q8's, **`Q7 not terminal`**. The cell states the co-firing, not the conjunct — **derived reading, flagged SP-11**. | `INACTIVE` where Q7 was terminal (Q8's own INACTIVE limb). **An unresolved field is not INACTIVE:** *"An **unresolved field auto-serves with a visible label** and no approval step, and the label travels on the answer and in every node's provenance"* (DR-021 knob 10). | open `WAIT` `{Q7_terminality}` → `ACTIVE`/`INACTIVE`. §3.13 lists R7 with Q8 under the *"Unregistered fallback authorisation"* block, **released by DR-021 knob 10**. |
| **R8** · HYBRID | AIM · ctx 2 Inquiry · `evidence` (§6) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.12 Fires, verbatim and entire: **`AIM before source-plan freeze`** — *"trigger `AIM before source-plan freeze`"*. **The `before source-plan freeze` phrase is kept in the predicate — `RULED — DR-107(2)`**; Q4's deadline rule is not extended to it (rider R-G). **SP-3 resolved as written.** | `INACTIVE` where AIM was never entered (terminal route, rider R-C); evidence = the terminal route id. **Ruled consequence (DR-107(2)):** read literally — **the ruled reading** — the row files INACTIVE once the source plan has frozen. The deadline reading is not adopted; the self-deactivation is accepted and monitored. A vantage point adding no new source class is *"**dropped**, not recorded"* — an output rule. | open `WAIT` `{AIM_entered, before_source_plan_freeze}` — both written elements are `predicate_inputs` → `ACTIVE`/`INACTIVE`. The perspective-forking prohibition is *"spec law regardless of ratification path"* — a write rule, not an activation rule. |
| **R9** · HYBRID | SERVE · ctx 7 Serving · `serve` (§12) | `WAIT⁰ → ACTIVE / INACTIVE` | §3.12 Fires: *"trigger `serve_candidate_ready` + per-node limb scoped by `strangerTestCoverage` (DR-019)"*. | `INACTIVE` only where no serve candidate is ready. **Sampling is not deactivation:** *"load-bearing nodes exhaustive always; non-load-bearing sampled at an asker-derived rate that auto-ratchets up on failures"*, with the rate **frozen at run start** (AC-50 · DR-052). §3.13 lists R9's per-node limb under *"Cardinality unpriced (`strangerTestCoverage`)"*, **released by DR-019 knob 1**. | open `WAIT` `{serve_candidate_ready}` → `ACTIVE`/`INACTIVE`. **R9 runs FIRST in DR-049's gate order** (R9 → Q53 → conformance → Q51); **DR-057** adds the post-compose verdict pass, whose failure takes *"DR-049's components-only terminal — no new loop"* (not a re-activation). |

---

## 7. Roll-ups

### 7.1 Coverage and the closure checksum

| Disposition | Count | Rows |
|---|---:|---|
| **MACHINE** | **13** | Q15, Q17, Q22, Q23, Q34 (verdict limb), Q39, Q42, Q46, Q47, Q49, Q53, Q56, Q60 |
| **HYBRID** | **57** | 48 questions — Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q13, Q14, Q16, Q18, Q19, Q20, Q21, Q24, Q25, Q26, Q28, Q29, Q30, Q31, Q32, Q33, Q35, Q36, Q37, Q38, Q40, Q41, Q43, Q44, Q45, Q48, Q50, Q51, Q52, Q54, Q55, Q57, Q58, Q59, Q61, Q62 — plus all nine rules R1–R9 |
| **LLM** | **1** | Q27 |
| **Total** | **71** | 62 questions + 9 rules |

**13 + 57 + 1 = 71** — spec §3.13's checksum, preserved unchanged. Every id
appears **exactly once** in §6; **71/71 rows carry a written predicate or an
explicit `POLICY_BLOCKED` filing.**

Per-stage coverage: LOCK 6 · ROUTE 4 · AIM 4 · HARVEST 5 · RUN 6 · SPLIT 6 ·
WEIGH 7 · CROSS 6 · COMPOSE 6 · SERVE 8 · SETTLE 4 = **62 questions**; rules
**9**; **total 71**.

### 7.2 The 13 MACHINE rows — the FX-S22-05 zero-call set

Readable off §6 alone by the `M n/13` marker. `FX-S22-05` requires that *"each of
the **13 MACHINE rows** is proven to make **zero model calls**"*, that the `·A·`
marker is retired, that *"a cache hit never sets a row INACTIVE"* and that
*"`POLICY_BLOCKED` is never filed as INACTIVE"* (`06-test-strategy.md` §12).
Owning slices: **S0** (framing rows) · **S6** (evidence-stage rows) · **S15**
(complete 13-row attestation).

| # | Row | Stage | Predicate | Slice where the zero-call limb lands |
|---:|---|---|---|---|
| 1 | **Q15** | HARVEST | `Q11_frozen and research_route` | S6 |
| 2 | **Q17** | HARVEST | `Q15_complete` | S6 |
| 3 | **Q22** | RUN | `runnable_selected` | S6 |
| 4 | **Q23** | RUN | `instrument_used` | S6 |
| 5 | **Q34** (verdict limb) | WEIGH | `evidence_on_both_sides` | S6 / S8 |
| 6 | **Q39** | CROSS | `research_answer_reaches_CROSS` | S8 |
| 7 | **Q42** | CROSS | `critic_agrees` | S8 |
| 8 | **Q46** | COMPOSE | `Q45_computable` | S3 / S5 |
| 9 | **Q47** | COMPOSE | `approved_variant_count > 1` | S3 / S5 |
| 10 | **Q49** | COMPOSE | `composed_answer_with_typed_ranges` | S3 / S5 |
| 11 | **Q53** | SERVE | `any_serve_candidate` | S0 (framing/serve path) |
| 12 | **Q56** | SERVE | `class_history_sufficient` | S9 |
| 13 | **Q60** | SETTLE | `Q59_scoreable` | S12 |

*Slice column is the build-order home from `07-build-order.md` / `06-test-strategy.md`
§12, carried as a pointer; the **13-row membership** is this table's claim, and it
is spec §3.13's list verbatim.*

**Three rows that look zero-call and are NOT in the 13** — named here so the set
cannot be over-counted:

- **Q45** — *"HYBRID with a machine-only fast path"*: zero model calls **when the
  operator is policy/config/human-declared**, otherwise *"exactly one bounded
  declaration call is mandatory"*. Conditional, therefore not assertable as zero.
- **Q24** — *"HYBRID (narrow)"*: MACHINE for the ledger, diff and caveat binding;
  **one bounded model call** for the limitation sentence where the diff does not
  derive it.
- **Q34's remediation layer** — the row is MACHINE **in its verdict limb only**;
  the `UNINSTRUMENTED` explanation is an openly-marked model call that *"never
  replaces the verdict and never gates"*. FX-S22-05 binds the verdict limb.

(Q51 and Q54 also carry machine limbs — *"substance: MACHINE for the gates and
joins / for the facts"* — with composition-model text; both are HYBRID.)

### 7.3 The POLICY_BLOCKED register — loud, by construction

**3 rows** are filed `POLICY_BLOCKED`. In every case the spec's *Fires* cell
records **release history only** and no fire condition exists anywhere in the
document, which is exactly DR-083's *"a row whose predicate the spec only
summarizes"*.

| Row | Stage | What the spec says instead of a predicate | Why not INACTIVE | Candidate reading (named, **not adopted**) |
|---|---|---|---|---|
| **Q14** | AIM | *"was policy-gated `lineageEquivalence` → UNBLOCKED by DR-013 · —"* | an INACTIVE filing would report an undeclared critic-hit criterion as *satisfied* | `research_route` (Q11–Q13 parity) |
| **Q40** | CROSS | *"was policy-gated `lineageEquivalence` → UNBLOCKED by DR-013 · —"* | would report unreopened locators and unrerun sums as *satisfied* | `eligible_critic_run` (Q41's predicate) |
| **R6** | LOCK/AIM | *"was policy-gated `lineageEquivalence` → UNBLOCKED by DR-013; the blind two-lineage comparison is now executable · —"* | the row's own law is that it *"must never silently pass"* | `Q1=CONTINUE` or `research_route at AIM` |

All three are **unblocked as to policy** (DR-013 removed `lineageEquivalence`) and
**blocked as to specification** — the release left no predicate behind. Two
further rows in the same shape, **Q26** and **Q31**, are **not** filed
POLICY_BLOCKED because §3.6's stage law supplies a written predicate
(`Q10.split = true`); that derivation is flagged **SP-5** for V.

### 7.4 The WAIT register — and the drain

| Row | WAIT limb | Un-waited by | Drains before completion because |
|---|---|---|---|
| **all 64 conditional rows** *(every row except Q1, Q51, Q62, Q14, Q40, R6 — and **except Q61**)* | the mandatory **opening** event (rider R-A) | the run state answering the predicate | DR-089: *"at debate (run) completion NOTHING remains in a waiting state"* |
| **Q18** | *"no registry class ⇒ WAIT"* | *"one classification call"* | the class arrives or the row files INACTIVE on `answer_can_change_over_time = false` |
| **Q30** | *"computation WAITs for Q45's operator and the child values"* | Q45's declaration + the child values | DR-089: *"a waiting node completes as soon as its dependencies complete"* |
| **Q46** (`WAIT‡`) | *"Q46 files WAIT when Q34's stamps are missing"* — `RULED — DR-110(3)` | **Q34's two ledger stamps arriving** (`subject_item_id`, `stance_at_action`; `FX-LED-04`) — and by nothing else | **it does not drain on its own, and that is the ruling's point.** DR-110(3) records the consequence in terms: *"under DR-089's drain law a run cannot complete while Q46 waits — the filing FORCES the stamps before terminal."* The stamps are a build-time obligation, so at runtime the WAIT should be unreachable; where it is reached, **the run is blocked from terminal instead of filing a false satisfied state** |
| **Q61** | **NONE — the row never enters intra-run WAIT** | not applicable: there is no WAIT to un-wait | **not a drain case.** DR-089 does not drain Q61's WAIT at completion, it **removes the row from intra-run waiting altogether**: *"not an intra-run WAIT row but a post-completion settlement event"*, the standing watch *"lives outside the run lifecycle"*. §3.11's *"may sit in WAIT indefinitely"* is superseded-in-part. Run-creation filing **`INACTIVE` — `RULED — DR-107(1)`** |
| **Q43** | ~~permanent WAIT on `alternate_method_required`~~ | **conjunct dropped** by DR-061 (`OD-S-02`) | no undefined conjunct remains to evaluate |

**Three rows may hold WAIT past their opening event: Q18 and Q30 by the spec's
own words (`WAIT†`), and Q46 by `DR-110(3)`'s ruling (`WAIT‡`).** No other row
may, and **Q61 may not hold WAIT at all** — the difference matters: a drained
WAIT still *occupies* WAIT for part of the run, which is precisely the placement
DR-089 denies Q61.

**Q46's limb is the one WAIT the drain law cannot resolve from inside the run.**
Q18's class arrives, Q30's dependencies complete — both drain. Q46's stamps come
from a **build** obligation, not from run state, so DR-089's *"at debate (run)
completion NOTHING remains in a waiting state"* becomes, for this row, a
**blocking** law: the run cannot complete. That is the ruled behaviour, not a
defect in the drain law.

### 7.5 Domain census

| Filing | Count | Rows |
|---|---:|---|
| Opens **ACTIVE** (unconditional) | **3** | Q1 · Q51 · Q62 (liveness limb) |
| Opens **POLICY_BLOCKED** (standing) | **3** | Q14 · Q40 · R6 |
| Opens **WAIT**, settles ACTIVE/INACTIVE | **64** | all others |
| …of which may hold **WAIT past the opening event** | 3 | Q18 · Q30 (`WAIT†`, spec-written) · **Q46** (`WAIT‡`, `RULED — DR-110(3)`) |
| Opens **INACTIVE**, carrying the settlement-watch handle as evidence (never WAIT, per DR-089) — `RULED — DR-107(1)` | **1** | Q61 |
| **Total** | **71** | |

*No row is undetermined. DR-107(1)'s *"every run carries **71 activation rows**"*
closes the last open filing, so the census above is complete and every one of the
71 rows has a named opening state.*

---

## 8. Scrutiny points — what a reviewer must check, and what V must rule

Each item is either a **stale-text finding** (the ledger already rules it and a
founding sentence has not caught up) or a **derivation** this document had to make
and refuses to make silently.

**Status after VG-02 (2026-08-07).** Eight of the fifteen are discharged by the
sitting: **SP-3** (`DR-107(2)`), **SP-4** (`DR-106` rider (a) — the *filing*, not
the predicates), **SP-5** (`DR-106` rider (b)), **SP-7** (`DR-110(3)`), **SP-8**
(`DR-110(4)`), **SP-9** (`DR-107(1)`), **SP-13** and **SP-14** (`DR-106`
rider (c)). The stale-text items
**SP-1**, **SP-2** and **SP-10** are founding-file corrections owned by
**PRE-11 / PRE-13** (`DR-111`, `DR-114`), not by this document. The `Kind` column
below now carries each point's outcome.

| # | Kind / outcome | Point |
|---|---|---|
| **SP-1** | stale text | **Q43's `alternate_method_required` is DROPPED, not open.** §3.8's cell and §3.13 both call it OPEN; §23.D `OD-S-02` is **RATIFIED (DR-061)**, adopted (d) *"drop the undefined condition"*. Spec §2 item 1 gives the DR authority. Founding-text correction is a fold-in item, not a V ruling. |
| **SP-2** | stale text | **§3.13's *"Two residual runnability holes remain"* is stale.** Both named holes — `OD-S-02` and `OD-S-03` — are stamped RATIFIED (DR-061) in §23.D. |
| **SP-3** | **RULED — `DR-107(2)`, 2026-08-07** | **RESOLVED AS WRITTEN: Q5/R1/R5/R8 keep their literal conjunct predicates.** V's ruling, verbatim: *"Q5/R1/R5/R8 KEEP their literal conjunct predicates — **against the seat recommendation, V's call** — the self-deactivation risk is accepted and monitored; Q4's deadline rule is NOT generalized."* No row text changes; the four phrases move from *adopted-pending-V* to **RULED**, and the self-deactivation consequence each row states is an **accepted, monitored** risk. The question as originally posed, kept for the record: **Four "before X" trigger phrases were unclassified, and this document adopted no reading of them.** **Q5** (`before_evidence`) · **R1** (`before Q15`) · **R5** (`before confident serve`) · **R8** (`before source-plan freeze`). Only **Q4** carries the classification, and it states it **of `before_first_search` alone**: *"an ordering deadline, not an activation conjunct — a missed deadline is a gate failure, never a deactivation, or a run could delete its own answer rule simply by starting to search."* **No source text extends that to the other four rows**, so all four keep their phrase **inside the predicate, verbatim** (rider R-G), and each row states what turns on the answer. The stakes are symmetric and both are bad if guessed: read as conjuncts, four rows can **deactivate themselves by the passage of the run** — Q4's own warned-of failure mode; read as deadlines, four written trigger elements are **deleted from the contract** on an authority the spec does not give. **V rules each of the four at VG-02.** |
| **SP-4** | **filing RULED — `DR-106` rider (a)** · **predicates still owed** | **Q14, Q40, R6 have no written predicate.** Filed `POLICY_BLOCKED` per DR-083, and **that filing is now ratified**: DR-106 rider (a), as read — *"Q14/Q40/R6 file POLICY_BLOCKED, loud, until V supplies fire conditions."* Candidate readings stay named in §7.3 and **not adopted**. **What is still open is the fire conditions themselves**, which the rider defers rather than settles; until V supplies them the three rows are visibly owed on every run, by design. |
| **SP-5** | **RULED — `DR-106` rider (b)** | **Q26 and Q31 take their predicate from §3.6's stage law** (*"The whole stage runs only when Q10 decided to split"*), their own cells carrying release history only. **The derivation stands**: DR-106 rider (b), as read — *"SP-5's stage-law derivation stands (Q26/Q31 ACTIVE-capable)."* The alternative reading — both moving to `POLICY_BLOCKED`, making §7.3's count 5 — is **not taken**; the count stays **3**. |
| **SP-6** | ledger vs spec | **Q45's withhold limb is unreachable.** §3.9: *"With no declaration the parent number is withheld"*; **DR-074**: the deployment operator is *"MANDATORY, never blank"* and the withhold machinery is *"dropped from the design (nothing left to trigger it)"*. The activation contract keeps the row ACTIVE-on-predicate; the withhold branch is recorded as dead. |
| **SP-7** | **RULED — `DR-110(3)` (Q-N1), 2026-08-07** | **RESOLVED: a stamp-less run files `WAIT` on Q46.** The gap as raised: §3.9 says *"Without Q34's two ledger stamps this gate cannot execute at all"*, the stamps are a build obligation (`FX-LED-04`), and the spec named **no state** — with INACTIVE wrong because it would read as *"no leverage/verification mismatch"*, a satisfied claim. **V ruled `WAIT`, against the seat's `POLICY_BLOCKED` recommendation** (the packet's Q-N1 recommended POLICY_BLOCKED as the loud option): *"**Q-N1 = WAIT** (against seat recommendation, V's call): Q46 files WAIT when Q34's stamps are missing."* **The consequence is recorded in the ruling itself and is the reason it works:** *"under DR-089's drain law a run cannot complete while Q46 waits — the filing FORCES the stamps before terminal."* So the loudness the POLICY_BLOCKED recommendation was reaching for is supplied by the **drain law** instead of by the state name: the run is blocked from terminal, which is louder than a visible hole at completion. See §7.4's `WAIT‡` row. |
| **SP-8** | **RULED — `DR-110(4)` (Q-N2), 2026-08-07** | **The terminal-route survivor mapping.** `OD-S-03(b)` (RATIFIED, DR-061) adopts *"minimum plus careful wording and the typed not-knowing"*. Q1/Q51/Q62-liveness are named by the ruled *"derived minimum"*; the mapping of *"careful wording"* and *"typed not-knowing"* was this document's derivation, and it sat in tension with **Q52's** cell, which explicitly *"excludes terminal non-answers"*. **V resolved the tension without moving Q52:** *"the OD-S-03(b) wording obligation binds terminal non-answers via **Q51's always-fires path**; **Q52's exclusion stands**; no founding edit."* So the wording obligation rides the row that already fires unconditionally on every output *"including terminal non-answers"* (rider R-C), and Q52's written exclusion is left exactly as the spec has it. *(Status folded at PRE-14 beyond the ticket's three enumerated row deltas, because DR-110(4) answers this scrutiny point directly and is inside PRE-14's authority range — flagged for the reviewers.)* |
| **SP-9** | **RULED — `DR-107(1)`, 2026-08-07** | **RESOLVED: Q61 is born `INACTIVE`, carrying the settlement-watch handle as evidence — never `WAIT`.** V's ruling, verbatim: *"every run carries **71 activation rows** — Q61's is born INACTIVE carrying the settlement-watch handle as evidence, never WAIT; the per-row initial-event law stays universal."* That is **candidate shape (i)**; shape (ii) — no in-run activation record at all — is **rejected**, so **a run has 71 activation rows, not 70**, and ADR-0009's *"mandatory initial event per battery row"* holds without exception. What was already settled is untouched: DR-089 places Q61 **outside intra-run waiting** — *"not an intra-run WAIT row but a post-completion settlement event"* — no `WAIT` event may be written for it at any point in a run, and the firing lives on the Stage-11/settlement watch, *"outside the run lifecycle"*, *"ACROSS runs, outside any run"*. **The stale-text limb is separately authorized and is not this document's:** §3.11's *"mechanism design DRAFT — V RULES"* cell is corrected to RATIFIED under **`DR-114(3)`**, a founding-spec edit owned by **PRE-13**. |
| **SP-10** | stale text | **Q59's `stage11Rollout` is not OPEN.** §23.D `OD-S-01` is RATIFIED (DR-061), adopted *"phased — recording from day one, scoring and calibration later"*. The recording limb is ACTIVE day one; no operational calibration claim is made. |
| **SP-11** | derivation | **R7's trigger is a co-firing phrase, not a predicate** (*"beside Q8 type routing"*). Read here as Q8's own input, `Q7 not terminal`. **V to confirm** — the alternative is a `POLICY_BLOCKED` filing, which would make §7.3's count 4. |
| **SP-12** | reading aid | **R2's *"always"* is gated** — *"inheriting Q2's `Q1=CONTINUE` gate"* — so §1's *"exactly three rows are unconditional"* stands. Recorded because a reviewer reading the word "always" alone would count four. |
| **SP-13** | **RATIFIED — `DR-106` rider (c)** | **The opening state (rider R-A).** ADR-0009 mandates an initial event per row in the run-creation transaction but does not name its state. WAIT was derived from spec §1's definition (*"the state does not yet hold what the condition asks about"*); INACTIVE and ACTIVE are both provably wrong at that instant. **The derivation is ratified**: DR-106 rider (c), as read — *"opening event = WAIT for the 65 conditional rows."* It **fixes 64 opening events**; the 65th is **Q61**, ruled to `INACTIVE` at `DR-107(1)` (SP-9). |
| **SP-14** | **RATIFIED — `DR-106` rider (c)** | **Per-item cardinality (rider R-D).** Seven rows fire *"per item (0..N)"*. Row-level filing is read as ACTIVE iff the item set is non-empty, with the per-item work carried by ADR-0009's `(row, node-set)` work item. **Ratified** by DR-106 rider (c)'s second clause — *"per-item rows file 0..N"*. The alternative — one activation record per item — is **not taken**: it would have changed the ledger's shape and the meaning of "71 rows per run", which DR-107(1) independently fixes at **71**. |
| **SP-15** | reading aid | **Typed outputs are not activation states** (rider R-F): `INERT`, `UNPRICED`, `UNADJUDICATED`, `UNINSTRUMENTED`, `NOT_EMPIRICALLY_DECIDABLE`, `AMBIGUOUS_ATTRIBUTION`, `LEVERAGE_UNRESOLVED`. The single exception the spec itself writes is Q60's `PERMANENTLY_UNSCOREABLE` *(INACTIVE, recorded)*. |

---

## 9. What this document does not decide

- **It does not ratify itself** — VG-02 did (DR-083 ordered it; ticket **PRE-05**
  proposed it; **`DR-106`** ratified it on **2026-08-07**, with **`DR-107(1)`**,
  **`DR-107(2)`** and **`DR-110(3)`** ruling the three row-level points the
  proposal refused to derive. The status fold is ticket **PRE-14**.)
- **It does not mint state.** The activation enum is spec §1's and ADR-0009's;
  `kernel`'s closed vocabularies (condition marks, abstention kinds, the five
  terminal routes) are transcribed once against **spec §12.3** and **DR-037**,
  which remains *"the only typed-state mint"* (S-13).
- **It does not assign build slices.** §7.2's slice column is a pointer to
  `07-build-order.md` / `06-test-strategy.md` §12, not a new assignment.
- **It does not price anything.** No threshold, rate, cap or count beyond counts
  of rows appears here (AC-76 · DR-039).
- **It does not touch the founding pack.** The stale-text findings **SP-1**,
  **SP-2**, **SP-9**'s §3.11 limb and **SP-10** are recorded for the founding
  correction, **now authorized as PRE-11 (`DR-111(1)`) and PRE-13 (`DR-114`)**;
  no founding file was edited by this ticket or by the PRE-14 status fold.

# 05 — Register skeleton

Mission ARCH-V3-R1, step C4 (artifact 6 of the §7 set) · 2026-08-05 ·
seat: Opus 5 author, lane 4 (session `c4-lane-4`) · **rulings folded in
2026-08-06 (PROG-V3-R1 / PRE-03)** · **stack ruled 2026-08-07 (PROG-V3-R1 /
PRE-10 rev 2, `RULED — DR-117` / `DR-118`)**.

> **`RULED — DR-117` / `DR-118` — the bootstrap class is the original four PLUS
> one verdict-bearing image digest; §5.4c is new.**
> All the humans in the loop ruled the coding stack: **TypeScript on Node**,
> **Fastify + SSE**, **PostgreSQL + Drizzle**, **Hatchet** for durable execution
> (DR-118), **vLLM** over HTTP, **Docker Compose on Hetzner behind Cloudflare**.
> In this document that reaches exactly two places: **§5.4's bootstrap rows**
> (`nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`,
> `typescriptVersion` — unchanged from the C4 text, **joined by
> `vllmImageDigest`**) and **new §5.4c**, which applies an executable
> verdict-bearing test to the **Hatchet and vLLM image identities** and lands them
> on opposite sides of it.
>
> *An earlier ruling (**DR-105**) replaced the engine language with Python and
> PRE-10 rev 1 added two bootstrap keys for it; **DR-117 superseded that**, and
> those two keys are withdrawn — see §5.4-ii for the arithmetic in both
> directions.* **Every value is still `— none stated`**: DR-117 rules a stack,
> not a number. The five bootstrap values fill at **S00** under **DR-104**'s
> resolve-on-machine rule, are recorded in `register.bootstrap.json` and in a
> ledger follow-up row, and appear **nowhere in this document**.

> **RULED STATE — the provisional-status banner is discharged.** **DR-098** ratified the
> C2 frozen-gate repairs and this conditional C4 artifact set as the working
> architecture; **DR-099** ratified amendments **A-01…A-13**; **DR-100** emitted
> **ARCHITECTURE SATISFIED** and named this fold-in its mechanical
> follow-through. Every ruling in **DR-068…DR-097** that touches the register is
> folded into the sections below and cited inline as `RULED — DR-nnn`.
> **What the fold-in does not do:** it supplies no value. A ruling that *creates*
> a row does not fill it — values remain V's at **DR-023** (AC-76, DR-039).

**Source contract.** This document carries
`docs/missions/2026-08-05-v3-architecture/architecture/Plan.md` **rev 3** §4.6
(the register schema), §3.1 context 12 (what the register context owns), §2.7
(the configuration and lint gates) and §6.7's deferral table, per §7 row 6.

**Scope, stated as the plan states it** (§7 row 6): the register's schema · the
resolution-chain mechanism · provisional-row metadata (owner, recalibration
trigger, sign-off — charter A5.2) · the naked-constant printing rule (AC-75) ·
and **the key inventory drawn from the pack** — every constant the pack names,
with a value **only where the pack states one**.

**Explicitly out of scope: no invented values (AC-76). V ratifies the register at
DR-023.** A value in this document that is not quoted from the pack with its
citation is a defect, not a suggestion.

---

## 0. How to read this, knowing nothing

**What a register is, in one paragraph.** V3 refuses to let a number that can
change an answer live inside its source code. Every threshold, cap, share, flag
and policy value is a **row** in one ratified table — the register — read at run
time through one package, pinned per run, and **printed beside the answer
wherever it moved a number**. The reason is a defect this project exists to kill:
a constant that changes an answer without appearing beside it (spec §4 closing).
A **register skeleton** is that table with every key present and the values still
empty, so V can see exactly what is being asked of them (DR-023).

**Status.** SEAT-PROPOSAL for everything the pack left to this seat — the
DESCRIPTIVE key names, the `Scope` classification, the §5.4a bootstrap
mechanism. **The rulings folded in below are V's and are FINAL** (DR-068…DR-100);
where a section carries one it says `RULED — DR-nnn`, and that sentence is not
this seat's to move. **Values are unaffected either way**: the skeleton still
ships with every key present and every value empty except where the pack states
one (AC-76; V ratifies at DR-023).

**Citation shorthand**, identical to Plan.md's reading contract: `spec` =
`docs/founding/requirements-spec.md`; `manifest` =
`docs/founding/carryover-manifest.md`; `ui` = `docs/founding/ui-boundary-contract.md`;
`charter` = `docs/founding/quality-charter.md`; `ledger` =
`docs/founding/decisions-ledger.md` (DR-001…DR-067). `AC-nn` are Plan.md §1's
constraint rows.

**Open questions — all twelve that touched this document are RULED.**
`08-open-questions-for-V.md` remains the single place V answers, and this
document still rules none (Plan.md §9); it now *carries* the rulings. No row in
this document is marked `pending V` any longer.

**The `Q-nn ↔ Plan source ↔ ruling` mapping for every question this document
touches** (question index from `08-open-questions-for-V.md` §1; rulings from
`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md`):

| Q | Plan id | One line | Blocks from | Where here | **Ruling** |
|---|---|---|---|---|---|
| **Q-07** | §6.4 A-8 | Is the deployment operator declaration optional and unset by default? | S3 | §2.3, §5.4, §6 | **RULED — DR-074** (mandatory, never blank) |
| **Q-10** | §6.1 OQ-G3 | What declares the hard composition-bundle budget? | S5 | §2.5, §5.4 | **RULED — DR-078** (independent row + asker-facing tiers) |
| **Q-12** | §6.2 AM-3 | Are the three closed sets of six one axis, and what is `design`? | S5 | §5.4 | **RULED — DR-080** (three separate vocabularies + two mapping tables) |
| **Q-13** | §6.3 U-1 | What activates `OD-11`'s layer-2 per-side provenance detail? | S5 | §5.4 | **RULED — DR-081** (a register row V flips; layer 1 default) |
| **Q-14** | §6.10 AQ-1 | Is the band rule a second obligation, and what does the way-of-knowing ceiling say? | S5 | §4.3, §5.4 | **RULED — DR-082** (second independent gate) + **DR-086** (it caps, never blocks) |
| **Q-17** | §6.3 U-2 | What is the tier × claim-type eligibility map for the evidence gate? | S6 | §5.4 | **RULED — DR-085** (empty register table; tier-invariant shadow mode) |
| **Q-19** | §6.9 item 6 | Does an auto-activating hard-kill gate count as "shipped dark"? | S6 | §5.1 row 13, §5.4 | **RULED — DR-088** (counts as shipped dark; gate written, never inert) |
| **Q-21** | §6.2 AM-14 | What measured quantity licenses "measured behavioural difference"? | S7 | §5.5 | **RULED — DR-090** (recorded unavailable, never approximated) |
| **Q-24** | §6.1 OQ-G2 | Who supplies the per-row correctness/enrichment classification? | S9 | §5.4 | **RULED — DR-093** (architecture proposes 71 rows, V ratifies once) |
| **Q-25** | §6.2 AM-5 | Who sets the risk tier? | S9 | §2.5 | **RULED — DR-094** (asker declares; policy may RAISE, never lower) |
| **Q-27** | §6.5 C8 | Does V3 carry a verdict-first presentation flag at all? | S14 | §5.4, §5.5 | **RULED — DR-096** (no such flag; **the row is deliberately absent**) |
| **Q-28** | §6.9 item 7 | Is a register row with no executable unit inside charter clause 4's reach? | S15 | §1.3, §6 | **RULED — DR-097** (outside the reach + an advisory unread-key audit) |

### 0.1 The three laws this document exists to serve

| Law | Text | Source |
|---|---|---|
| **The register is drawn fresh and V-ratified** | *"V3's flag and configuration register is designed anew and ratified by V before production. Every numeric constant inherited from research is source material for a register row and nothing more … The knobs already ruled (§4) are register entries in waiting, not open questions."* | AC-74; DR-023; spec §20 W-5; charter A3.5 |
| **Naked constants are printed where they are used** | *"Any constant that can move a served verdict — the abstention cell, the provenance key width, a way-of-knowing ceiling, a topic or regeneration cap, an exploration share, a minimum-n gate — must be printed where it is used, in the served trail."* | AC-75; spec §4 closing |
| **No invented measurements** | *"A metric, label, threshold or rule enters only with hard facts behind it."* A key may be declared; a **value** may not be conjured. | AC-76; DR-039; manifest §2.2 item 9 |

### 0.2 Two naming disciplines used in every table below

| Marker | Meaning |
|---|---|
| **VERBATIM** | The pack names this key, in these words (spec §4 names 19 of them verbatim; other rows are named in ruled prose). The name is not this seat's to change. |
| **DESCRIPTIVE** | The pack names the **constant** but not a key for it. The name here is a placeholder so the row can exist and be counted; **V may rename it at ratification** without changing anything else. |

**Value column discipline.** `V's value (pack-stated only)` carries the pack's
own words where the pack states a value, with its DR. Where the pack states
none, the cell reads **`— none stated`**, and that is the honest content of the
skeleton (AC-76). Nothing in this document supplies a missing value.

---

## 1. The register's schema

Shape only; table DDL is `02-data-model.md`'s (Plan.md §7 row 3). Schema
namespace: `register`, inside the one database with one migration lineage
(AC-01, AC-02).

### 1.1 `register_row`

| Column | Purpose | Constraint |
|---|---|---|
| `key` | the row's identity — the name a caller reads | AC-74 |
| `declared_type` | the value's type, declared before any value exists | AC-74 |
| `unit` | what the number counts (rounds, days, share, ratio, days-since-query …); a bare number with no unit cannot be printed honestly | AC-75; Plan.md §4.6 |
| `value` | **empty until V ratifies**, except where the pack states one | AC-76, DR-023 |
| `register_version` | the version this row belongs to | AC-06, AC-74 |
| `ratified_by`, `ratified_at` | who ratified and when — V alone (DR-023) | AC-74 |
| `is_provisional` | true where the pack marks the value provisional | charter A5.2; DR-012 |
| `recalibration_owner` | who owns recalibrating it | charter A5.2 |
| `recalibration_trigger` | what event obliges recalibration | charter A5.2 |
| `signoff_route` | who signs the recalibration off — a Stage-11 job requiring V's sign-off | charter A5.2; spec §4 preamble |
| `resolution_scope` | `deployment` \| `run` \| `parent` — the level at which this row participates in a chain (§2) — plus the marker **`bootstrap`** on the **five** rows that must be readable before the database exists (§5.4a, §5.4-iii) | Plan.md §4.6; AC-22; **`bootstrap` added at C4 rework round 1 under H-C-5**; the fifth row added at **`RULED — DR-117`/`DR-118`** (§5.4c) |

### 1.2 `register_version`

An **immutable set of rows**. Every run pins one, so a register change is
visible in replay and **cannot retroactively move a served number**
(AC-06, AC-74; Plan.md §4.6). The pin lives on the `run` **frozen head**, whose
`UPDATE` and `DELETE` are both revoked — a mid-run `register_version` change
would make replay read a register the run did not use, breaking AC-06 with no
trace, because the ledger records what executed, not what the run row pinned
(Plan.md §4.1a).

### 1.3 The standing rules that bind the register to everything else

| Rule | Constraint |
|---|---|
| Rows are **keys with no invented values**: the skeleton ships with every key the pack names and values only where the pack states them | AC-76; Plan.md §4.6 |
| Register history is **append-only or versioned with the old row preserved**; nothing is deleted | AC-05, AC-45; Plan.md §4.1 rule 1 |
| **Every row that a register value moved records `register_row_key` + `register_version`**, so the constant can be printed where it was used | AC-75; Plan.md §4.1 |
| **No `process.env` read outside the register's loader**; every constant is read through `packages/register`. **This binds the compose environment too** (`RULED — DR-117`): a value injected as a container environment variable is still a constant, and reading it anywhere but the loader is the same defect | AC-74; Plan.md §2.7 |
| A constant may **never** be selected by a source literal — enforced by the `no-source-literal-constant` lint | AC-74; charter A3.5; Plan.md §2.7 |
| Reads and writes cross the one front door: `GET /v1/register` (deployment register read) and `PUT /v1/register/{key}` (deployment register write, **keys V-ratified**) | AC-60, AC-74; ui §2 surface 12; Plan.md §5.3 |
| Research findings land **as register rows, scorecards or a strategy implementation** — never as changes to the graph shape, the ledger schema or the serve contract; the expected cost of adopting a validated finding is **a register change plus a re-run** | AC-84; charter A5.3, A5.5 |
| **Register rows are data, not code.** An unratified row is **outside charter clause 4's orphan reach** — the never-called list stays about executable units, and **AC-74's ratify-before-production gate is what governs the register**. `RULED — DR-097` | **DR-097**; charter §5, VR-4; AC-74, AC-77 |
| **An advisory (non-blocking) audit reports any key no code ever reads after full build**, so a stale row is noticed without exemption paperwork. Advisory lane — it never blocks a release; the BLOCKING never-called list is unchanged. `RULED — DR-097` (V's amendment) | **DR-097**; charter A4.1/A4.2; `06-test-strategy.md` `FX-ORPH-07` |

### 1.4 Who may read the register, and how the acceptance bundle reads it

**Resolves gap MOD-2 ≡ REG-5 (adjudicated REAL).** Plan.md §2.6 permits
`tools/*` to depend on `kernel` and `contract` only, while Plan.md §8 S15
requires `tools/acceptance-bundle` to carry *"the register presented for V's
ratification"* — rows that live in a database table and are **not** decidable
from any static program walk. The contradiction is resolved by naming the
input explicitly:

| Reader | Path | Why this one |
|---|---|---|
| Engine packages and `apps/*` | `packages/register`'s loader (§1.3) | the single read path for constants (AC-74) |
| `tools/acceptance-bundle` | a **direct read-only `register` dependency** — `03-module-design.md` §3.1 **row 27** | the bundle is a build-time artifact that must show the register **as ratified**; an API call would make an acceptance artifact depend on a running deployment, and a separate export artifact would add a second copy of rows the register already owns (AC-85). It **never writes** — `PUT /v1/register/{key}` is the only write path (AC-74) |
| Operators and V | `GET /v1/register` (read) · `PUT /v1/register/{key}` (write, keys V-ratified) | ui §2 surface 12; AC-60, AC-74 |
| Tooling before the database exists | the bootstrap file of §5.4a, through the same loader | a register that lives only in Postgres cannot pin the Postgres it runs on |

The rejected options are recorded rather than dropped, because H-C-5 named all
three: **an API/artifact input** (rejected — couples an acceptance artifact to a
live service) and **a separate register-export artifact** (rejected — a second
representation of rows that are already authoritative, AC-85).

---

## 2. Resolution chains

### 2.1 The mechanism

A **resolution chain** is how a row that may be declared at more than one level
gets a value for one particular use, and how the level that supplied it is
recorded. Plan.md §4.6 makes `resolution_scope` a column on every row, so the
chain is one mechanism used in several places rather than a special case
(AC-22's `OD-22` chain is *"one instance of the same mechanism"*).

**Read order is narrowest first:** `parent` → `run` → `deployment`. **The
supplying level is recorded on the value it produced**, not inferred later
(AC-22).

### 2.2 The founding principle the chain must not break

*"No silent defaults. Each of these is a value only a human may set.
`Unresolved` never means null, zero or false — it means the dependent behaviour
**blocks, visibly**"* (spec §4 preamble). Every row in §5's inventory therefore
carries an *unresolved behaviour*, and spec §4's own table states it for the 19
named parameters; **the register loader may not substitute a default for a
missing value** (AC-74, AC-76).

### 2.3 The ruled instance — M2's operator chain · **RULED — DR-074**

**Q-07 is ruled.** The deployment-level scoring operator (accumulate vs
strict-and) is **MANDATORY, never blank** — a required register row, with **no
undeclared and no withhold state at the deployment level**. Parent- and
run-level overrides remain optional **on top of it**.

| Step | Behaviour | Authority |
|---|---|---|
| 1 | the operator **may be declared per parent** — an optional override | AC-22; DR-062 `OD-22`; DR-074 |
| 2 | otherwise the **run** level may supply it — an optional override | AC-22; DR-074 |
| 3 | otherwise the **deployment** level supplies it — **always**, because the deployment row is mandatory and can never be blank | AC-22; **DR-074** |
| — | the **supplying level is recorded on the number**; both operators stay computable on demand; **the identifier is a recorded run input, never a source literal** | AC-22; AC-74 |
| — | **Deleted by DR-074:** the former steps 4 and 5 — *"undeclared ⇒ one bounded declaration call"* and *"still no declaration ⇒ the parent number is withheld and its components are served"*. The **declare-once / withhold runtime machinery is dropped from the design**: with a mandatory deployment row nothing is left to trigger it, and charter G4 forbids a configuration branch no production caller can produce | **DR-074**, superseding DR-040 Q45's chain tail |

**What DR-074 preserves, and by which mechanism.** The anti-defect property is
D2's: *the operator is a recorded config value, never a hardcoded literal*.
Before this ruling that property leaned partly on the runtime withhold fallback;
after it, the property is carried **entirely by the mandatory register row**
(§5.4's `scoringOperator`) plus the `no-source-literal-constant` lint (§1.3).
Nothing is weakened — the fallback was the weaker guard, and the state it
guarded can no longer exist.

**The key this ruling mints.** Before DR-074 this section described a chain over
a row **§5 never named**, so no key existed for a builder to read or for the
acceptance bundle to present. A mandatory row needs a key, so one is minted:

| Key | Name | Scope | Declared type | Value | Where |
|---|---|---|---|---|---|
| `scoringOperator` | DESCRIPTIVE — V may rename at ratification | `deployment` (**MANDATORY**), overridable at `run` and `parent` | the closed operator vocabulary — **accumulate \| strict-and** | `— none stated`; **V's at DR-023** | §5.4 |

**Mandatory and valueless are not in tension.** DR-074 rules that the ratified
register **may not carry this row blank**; it does not say what fills it. The
skeleton therefore ships the key with `— none stated`, and a *ratified* register
in which this row is empty is a **defect**, not an incomplete draft — the same
shape §3.1 gives the A5.2 columns. Inventing the value here would be the AC-76 /
DR-039 violation this document exists to refuse.

### 2.4 Three other chain shapes the pack already forces

| Shape | Row(s) | Rule | Citation |
|---|---|---|---|
| **Frozen at run start** | `strangerTestCoverage`'s derived sample rate | the rate **freezes at run start** and is pinned on the `run` frozen head; the ratchet applies to the **next** run. Conformance coverage derives from it | AC-50; DR-019 knob 1 as amended by DR-052 |
| **Derived, then capped at deployment** | `graphMeasurementQuota` | derived from the asker's depth parameters, **capped by a V-owned deployment ceiling** — the chain ends in a bound, not in a value | DR-021 knob 12 |
| **Named per deployment** | Q59's external resolver | *"named by V per deployment"* — a deployment-scope row with no cross-deployment value | DR-021 knob 11 |

### 2.5 What is a run input rather than a register row

Recorded so the boundary is not blurred: the asker's own per-run properties —
decision/action owner (**the asker**), caller scope and `as_of` (caller-supplied,
**defaulting to now**), depth parameters and agent count — are **run inputs
recorded on the `run` frozen head**, not register rows (DR-021 knob 11;
Plan.md §4.1a).

**Who the asker is · `RULED — DR-070`.** The asker is **the requesting
user/person**. There is no separate authenticated-principal / session-scope model
at this stage — authorization and user credentials are explicitly **out of scope**
and V2's `user_dev_token` vertical slice is adopted as sufficient. The ruling is
recorded as a **provisional simplification**: real principal/session separation
may be needed before a multi-tenant or credentialed launch, and that revisit
carries A5.2-style language when it is built. Nothing here becomes a register row.

**The risk tier · `RULED — DR-094`.** The risk tier stays a **run input**, and
the authority question is answered: **the asker declares it; deployment policy
may RAISE it but never lower it.** `tier_source ∈ {ASKER, DEPLOYMENT_POLICY,
DERIVED}` is recorded and printed as designed, so a raise is visible rather than
silent. The deployment-policy limb is the only register-scoped half, and its
value is `— none stated`, V's at DR-023.

**The composition-budget tier · `RULED — DR-078`.** The asker's **tier selection
(low / medium / high)** for the hard composition-bundle budget is likewise a
**run input**, mirroring the existing asker-depth dial; the **per-tier bounds it
resolves against are register rows** (§5.4). The boundary is the same one this
section draws everywhere: the asker's *choice* rides the frozen head, the
*values the choice resolves to* ride the register.

---

## 3. Provisional rows and their metadata

### 3.1 The rule

> **A5.2 · RATIFIED(DR-012)** — *"Every provisional number names its owner, its
> recalibration trigger and who signs off — recalibration is a Stage-11 job
> requiring V's sign-off. A number with no recalibration path is a constant
> pretending to be a finding."* (charter §6)

Therefore: **a row with `is_provisional = true` and any of
`recalibration_owner`, `recalibration_trigger`, `signoff_route` empty is a
defect**, not an incomplete draft. The three columns exist in §1.1 for exactly
this reason.

Spec §4's preamble says the same from the other side: *"Where a value is marked
**provisional** it is a real V ruling that is expected to be recalibrated against
outcome data; recalibration is a Stage-11 job requiring V's sign-off."*

### 3.2 The rows the pack itself marks provisional

| Row | What is provisional | Trigger the pack names | Citation |
|---|---|---|---|
| `abstention` (the class × risk matrix cells) | the seeded standard-tier cells and the tier multipliers | *"PROVISIONAL until outcome data"*; recalibration is a Stage-11 job requiring V sign-off | DR-012; spec §4 row 4 |
| `livenessThreshold` (N per class) | the seeded N values | *"N values provisional like DR-012"* | DR-016; spec §4 row 11 |
| exploration share; new-model probation; depart-neutral n; detectability threshold | all four numbers | *"numbers provisional-recommended, DR-012 pattern"*; outcome data | DR-046; spec §16.4 K-17, K-18 |

**A5.2-mandated rows: 7** — the `abstention` matrix, `livenessThreshold`,
DR-046's four numbers, **and `orderingPolicy`**. Six of the seven are provisional
**numbers**, which is what A5.2's ruled text binds directly; the seventh is
carried by the **adopted** extension of §3.2a.

### 3.2a `orderingPolicy` — a provisional *ordering* · **RULED — DR-099, amendment A-13 ADOPTED**

`orderingPolicy` is marked provisional by DR-020 knob 6 (*"provisional until the
deferred retrieve-first experiment rules"*), and it is **not a number**, so
charter A5.2 as written did not reach it: its ruled text is *"every provisional
**number** names its owner, its recalibration trigger and who signs off"*.

**Amendment A-13 — the A5.2-over-orderings SEAT-PROPOSAL — is RATIFIED at
DR-099** (V, mid-walk: *"ratify all — we have discussed and re-discussed each of
every one"*, with A-01…A-13 adopted by reference to their FinalPlan-consolidation
text). A5.2's owner / recalibration-trigger / sign-off triple therefore
**extends to non-numeric provisional policy rows**. In force from this fold-in:

- **`orderingPolicy` carries all three columns, mandatorily.** §3.1's rule now
  applies to it in full: `is_provisional = true` with any of
  `recalibration_owner`, `recalibration_trigger` or `signoff_route` empty is a
  **defect**, not an incomplete draft.
- **The A5.2-mandated count reverts to 7** (§3.2, §5.6). The C4-rework-round-1
  correction *"7 → 6"* under finding **H-C-8** is **dead**: it read A5.2
  correctly as written, and A-13 changed what is written.
- **The ratified rationale is the proposal's own:** the recalibration exposure is
  identical — an ordering that is never revisited is *"a constant pretending to
  be a finding"* in the same way a number is. The consequence the proposal priced
  (a policy sitting provisional forever with no named owner, unreported by the
  acceptance bundle) is what the adoption removes.
- **The column *contents* are still V's at DR-023.** A-13 rules that the three
  columns are **owed** on this row, not what they say (AC-76).

### 3.3 Cold-start honesty, which is a register concern

At t=0 the router must behave **exactly as it would with no scorecard at all**,
and a capability cell's `basis` is `NONE` until settled outcomes exist —
`basis ∈ {MEASURED_OUTCOME, MEASURED_PROCESS, EXTERNAL_BENCHMARK, NONE}` with
**no ASSUMED and no DEFAULT member** (AC-42, AC-43; spec §16.4 K-20/K-21;
charter A5.4). A provisional register value is therefore never a substitute for
an absent measurement: *"at t=0 there is no pooled quantity, so the honest object
is an **absent cell, not 0.5**"* (spec §16.3 K-15).

---

## 4. The naked-constant printing rule (AC-75)

### 4.1 The obligation

Any constant that can move a served verdict is **printed where it is used, in the
served trail**. The pack names six examples in one sentence — *the abstention
cell, the provenance key width, a way-of-knowing ceiling, a topic or regeneration
cap, an exploration share, a minimum-n gate* — and the sentence ends with the
reason: *"A constant that changes an answer without appearing beside it is the
defect class this mission exists to kill"* (spec §4 closing; AC-75).

### 4.2 The mechanism, in three parts

1. **Every row a register value moved records `register_row_key` +
   `register_version`** (Plan.md §4.1). This is what makes printing possible
   without a second lookup path and without guessing which version applied.
2. **The run pins one `register_version`** (§1.2), so the printed constant is
   the one that actually executed, on replay as on the live read (AC-06).
3. **The served surface carries it as a typed projection field**, never as prose
   the reader must parse — every number arrives with its origin and its replay
   handle **or it does not arrive** (AC-63, AC-34). Field placement is
   `04-api-contract.md`'s.

### 4.3 The printings the pack names individually

| What prints | Where the pack says so |
|---|---|
| **The abstention cell** — every served answer names its cell `(question_class, risk_tier, price)` | spec §21 N-4 `RULED(DR-012)`; AC-65's `abstention` row (Plan.md §4.4) |
| **The provenance key** — printed **wherever a cluster changed a number** | AC-23; manifest §4.2g; DR-062 `OD-09` |
| **The pull cap** — *"a flat declared cap, printed where it is used"* | spec §17.4 M-16 (`OD-M-12`); Plan.md §4.7 |
| **The judge-weighting parameter** — *"a pure function of the ledger with its parameter recorded and printed"* | spec §16.3 K-15 |
| **The topic cap and the regeneration cap** | spec §4 closing; DR-019 knob 2, DR-020 knob 5 |
| **The exploration share and the minimum-n gate** | spec §4 closing; DR-046; spec §16.5 G4 |
| **The way-of-knowing ceiling** — carried as `band_ceiling {label, basis}` on the Answer, printing its register row. **`RULED — DR-082 / DR-086`**: the band rule is a **second, independent gate** beside DR-044(Q51)'s three blocking gates — not a restatement — and when it fires it **caps the confidence band**: the answer serves, cannot reach the top band, and wears its ceiling label visibly (DR-014's cap + label + recorded lift-path pattern). It **never silently blocks** | AC-24, AC-75; charter VR-2; Plan.md §5.4; **DR-082, DR-086** — the **label vocabulary and the cut points remain register rows V ratifies at DR-023** (§5.4) |

### 4.4 What the printing rule does not license

Printing a constant does **not** make it configurable where the pack closed it:
arrow strength has **only** its two ruled producers (AC-27), there is **no
default τ at any layer** (AC-21), and **a budget may never deactivate a
correctness or safety row** (AC-49). See §6.

---

## 5. The key inventory, drawn from the pack

**Reading rule for every table: a value appears only where the pack states one.**
Where the pack states none the cell reads `— none stated`, and the value is V's
at DR-023 (AC-76, DR-039).

**The `Scope` column is this seat's classification** under §1.1's
`resolution_scope`, read off how the pack uses the row (a matrix V sets is
deployment-scope; a value pinned at run start is run-scope). It carries **no
value** and is V's to correct at ratification.

### 5.1 The 19 V-owned knob parameters (spec §4)

Named verbatim by the spec, which calls them *"register entries in waiting, not
open questions"* (spec §20 W-5).

| # | Key | Name | Scope | V's value (pack-stated only) | Prov. | DR | Consumer |
|---:|---|---|---|---|:--:|---|---|
| 1 | `engineRelationship` | VERBATIM | deployment | `GREENFIELD_NEW_REPO` | — | DR-031 | repo/build (AC-82) |
| 2 | `queryAmendment` | VERBATIM | run | amendable mid-run, **typed**: *mechanical repair* keeps full confirmation power; *semantic re-aim* is exploration-only and confirmation requires re-freezing and re-running; every amendment logged with type and reason, visible at serving | — | DR-008 | `evidence` |
| 3 | `subjectRelevance` | VERBATIM | run | **mixed rule** — wholly off-subject **rejected before scoring** with a logged reason; partly relevant **admitted downgraded** with the off-subject share named and the downgrade visible at serving | — | DR-009 | `evidence` |
| 4 | `abstention` | VERBATIM | deployment (matrix) → run (cell) | cost-ratio `price = cost(abstain)/cost(wrong)`, strictly in `(0,1)`; **varies by question-class × product-risk matrix**; risk tiers casual / standard / high-stakes; **standard-tier seeds — lookup 0.8, measurement 0.7, comparative 0.55, causal 0.5, predictive 0.4, value 0.15**; **multipliers high-stakes ×0.6, casual ×1.3 (capped below 1)**; every served answer names its cell | **yes** | DR-010, DR-011, DR-012 | `serve`, `settlement` |
| 5 | `lineageEquivalence` | VERBATIM | deployment | **different maker = different lineage**; anything same-maker, including across model generations, is the **same** lineage | — | DR-013 | `providers`, `critique` |
| 6 | `criticUnavailable` | VERBATIM | deployment | **cap + label + lift path** — the answer serves but **cannot reach the top confidence band**; a visible "independent critique unavailable" label carries the reason; the lift condition is recorded and executing the critique later **re-scores** | — | DR-014 | `critique`, `serve` |
| 7 | `newHumanRules` | VERBATIM | deployment | **R6/R7/R8 ACCEPT** as written; **R9 AMEND** — every node *and* the verdict individually restatable | — | DR-018 | `serve`, `graph` |
| 8 | `comparisonValueOwnership` | VERBATIM | deployment | Pareto trigger computes **when** values hinge; **Flow A always** (conditional + reversal point, a *full* answer); **Flow B** one optional swing question per real hinge; **Flow C** opt-in standing profiles; `weight_source ∈ {owner_elicited, org_policy, none}` with **no `default` member**; every value-decided segment names whose weights decided it | — | DR-017 | `valuation` |
| 9 | `splitIterationLimit` | VERBATIM | deployment | **2 regeneration rounds (3 attempts)**, then a typed **"not runnable" abstention carrying the rejection evidence** | — | DR-020 knob 5 | `battery/decision`, `graph` |
| 10 | `orderingPolicy` | VERBATIM | deployment | **battery stage order as written** | **yes** | DR-020 knob 6 | `battery` |
| 11 | `livenessThreshold` | VERBATIM | deployment (per class) | **composite retirement**: retire when no queries for **N days (N per class, 180 for standard)** **and** no open revision triggers; retired = **archived**, full graph kept, auto-revived by the next query; **nothing deleted** | **yes** | DR-016 | `liveness` |
| 12 | `expiryPolicy` | VERBATIM | deployment | **snapshot + wake + propagate**: relevant-as-of at spawn; wake-ups on watched revision triggers and class-based TTL review clocks; woken changes re-assess ancestors with a model re-judging **only affected nodes**; fired-trigger answers serve with a visible **STALE / UNDER-REVIEW** badge, never silently | — | DR-015 | `liveness` |
| 13 | `citationEnforcement` | VERBATIM | deployment | **eight typed failure routes from day one**; the hard-kill gate auto-activates when the character-level quote matcher ships and validates. **`RULED — DR-084`:** the eight routes are a **closed enum architecture proposes and V ratifies** — loud failure, no generic "other"; any member surfacing to a reader is placed in **spec §12.3 by amendment**, so S-13's single-minting-place law stays intact. **`RULED — DR-088`:** auto-activation **counts as shipped dark and the charter's not-shipped rule wins** — "auto-activates" describes the *activation event* only; the gate is **written when the quote matcher validates, never shipped inert**, and a **NOT-SHIPPED attestation** stands in the acceptance bundle until then | — | DR-020 knob 7; **DR-084, DR-088** | `evidence` |
| 14 | `coverageUpgrade` | VERBATIM | deployment | **diagnostic `UNCOVERED-SCOPE` note first**; becomes a gate **only after outcome data sets the threshold** — the threshold itself `— none stated` | — | DR-020 knob 8 | `evidence`, `serve` |
| 15 | `graphMeasurementQuota` | VERBATIM | run (derived) → deployment (ceiling) | **derived from the asker's depth parameters, capped by a V-owned deployment ceiling** — the ceiling `— none stated` | — | DR-021 knob 12 | `evidence`, `budget` |
| 16 | `stage11Rollout` | VERBATIM | deployment | **phased** — spec §23.D `OD-S-01` `RATIFIED(DR-061)`, adopted phased. *(Spec §4 row 16's "OPEN — no DR" is stale body text and the DR wins — FLAG-3; Plan.md §6.1 OQ-G1.)* Recording limbs day one; outcome ingestion in WAIT; **no operational calibration claim**; capability cells `basis: NONE` until settled outcomes exist | — | DR-061 `OD-S-01` | `settlement` |
| 17 | `adoptionBar` | VERBATIM | — | **DISSOLVED** — DR-047 retires the race; the parameter no longer gates anything and **is not a V3 register row**. Its role passes to the Quality Charter | — | DR-047 | *(none)* |
| 18 | `strangerTestCoverage` | VERBATIM | run (frozen at start) | **load-bearing nodes exhaustive ALWAYS**; non-load-bearing sample rate **derived from the asker's run parameters** (depth, agent count); the rate **ratchets up on failures**; **freezes at run start**, ratchet applies to the **next** run. The derivation's constants `— none stated` | — | DR-019 knob 1; DR-052 | `serve` |
| 19 | Visible-fallback authorisation (Q8/R7 unresolved type or field) | VERBATIM | deployment | **AUTO-SERVE WITH LABEL, no approval step**; Q8's policy-block halt is **removed** for unresolved types; the label travels **on the answer and in every node's provenance** | — | DR-021 knob 10 | `battery`, `serve` |

**Unresolved behaviour is a per-row fact, not a global default.** Spec §4's table
states it for each of the 19 — e.g. unresolved `abstention` ⇒ the run is marked
`UNPRICED` and Q56 cannot run at all; unresolved `splitIterationLimit` ⇒ Stage 6
is `POLICY_BLOCKED` and cannot enter its regenerative loop; unresolved
`lineageEquivalence` ⇒ independence is never certified and Q14/Q31/Q40/Q41 sit in
WAIT. `packages/register` carries the column; the per-row texts are the spec's
and are cited, never restated (AC-85).

### 5.2 The six annexed V-set values (spec §4.1)

*"Values, not parameters of the report's register"* — recorded here so no ruled
value is homeless, and **not counted in the 19**.

| Key | Name | Scope | V's value (pack-stated only) | DR | Consumer |
|---|---|---|---|---|---|
| Topic-cap N | DESCRIPTIVE | deployment | **N = 7**; the menu must retain **at least one could-overturn topic** | DR-019 knob 2 | `battery`, `graph` |
| Blind-verification coverage | DESCRIPTIVE | deployment | CROSS **always** for STANDARD and HIGH-STAKES tiers, for contested verdicts and for flip-sensitive nodes; **only CASUAL may be sampled or skipped** | DR-019 knob 3 | `critique` |
| Steering authority | DESCRIPTIVE | deployment | **menu + free-text annotations**; every annotation logged **verbatim**, typed as human-steer input, disclosed in the served trail | DR-019 knob 4 | `apps/api`, `serve` |
| Budget-override policy | DESCRIPTIVE | deployment | **typed skip for ENRICHMENT ONLY**; every skip carries a visible **`SKIPPED-BY-BUDGET`**; **protected core never skippable** — provenance, abstention typing, standard-and-above blind verification, citation routes, **and serve-conformance** | DR-021 knob 9 + DR-052 | `budget` |
| Run cost envelope | DESCRIPTIVE | run | **derived from asker depth × risk tier**; exhaustion ⇒ typed enrichment skips first, then a hard stop serving already-verified components with `ENVELOPE_EXHAUSTED` — **never a silent timeout**. The derivation's constants `— none stated` | DR-052 | `budget` |
| Per-run ownership | DESCRIPTIVE | run / deployment | decision-and-action owner = **the asker**; caller scope and `as_of` **caller-supplied, defaulting to now**; **Q59's external resolver named by V per deployment** (the deployment limb is the only register-scoped half — value `— none stated`) | DR-021 knob 11 | `apps/api`, `settlement` |

### 5.3 Ruled constants elsewhere in the pack

Constants a DR states outside spec §4. Each is a register row under AC-74
(*"constants never live as source literals"*), and each carries the value its DR
states — no more.

| Key | Name | Scope | V's value (pack-stated only) | Prov. | Citation | Consumer |
|---|---|---|---|:--:|---|---|
| `max_recompose` | VERBATIM (DR-049) | deployment | **2** — after the second conformance failure the answer serves **components-only + visible `DEFECT`**; never blank, never unchecked prose, no new loop | — | DR-049; AC-53 | `serve` |
| Deepening halt bound | DESCRIPTIVE | run | **K = 1** halt-and-deepen round **per parent per run**; after it, recombination proceeds and the answer carries a visible `LEVERAGE_UNRESOLVED` residual naming the carrying piece and its verification thinness | — | DR-050; Plan.md §3.1 context 6 | `valuation`, `serve` |
| Exploration share | DESCRIPTIVE | deployment | **~20%** (next-best or random) once understanding has accrued; **no monopoly — diversity of thinking is mandatory** | **yes** | DR-046; spec §16.4 K-17 | `settlement` |
| New-model probation | DESCRIPTIVE | deployment | **~50-round** process-fact probation | **yes** | DR-046; spec §16.4 K-18 | `settlement` |
| Depart-neutral minimum n | DESCRIPTIVE | deployment | capability weight **departs neutral at n ≥ 30 settled per class** | **yes** | DR-046; spec §16.4 K-18, §16.5 G4 | `settlement` |
| Detectability threshold | DESCRIPTIVE | deployment | **~293 per class** for full authority; **best-model HARD routing only past it** | **yes** | DR-046; spec §16.4 K-18, K-19 | `settlement` |
| Pull cap | DESCRIPTIVE | deployment | **a flat declared number, printed where used** — the number itself `— none stated` | — | DR-061 `OD-M-12`; spec §17.4 M-16 | `memory` |
| Conformance sampling rate | DESCRIPTIVE | run | **load-bearing sentences always judged; non-load-bearing sampled at the frozen stranger rate** — the rate is row 18's, frozen at run start; **the protected core forbids skipping the judge ROLE, never mandates exhaustive sampling** | — | DR-060(a); charter A2.5 | `serve` |
| Provenance-cluster key composition | DESCRIPTIVE | run (recorded input) | key = **underlying study/dataset identity + producing model family**; **source domain and publisher are fallbacks**; **producing-run identity always applies**; counting is otherwise **uncapped** | — | DR-062 `OD-09`; AC-23; manifest §4.2g | `evidence`, `propagation` |

### 5.4 Carrier keys the architecture needs, with no pack-stated value

Every row here exists because a design element would otherwise carry a number
that nobody ruled. **All values are `— none stated`; V's at DR-023.** Every row
whose *behaviour* was open is now **ruled**, and the ruling is named in its
`Status` cell; **no row in this table is `pending V` any longer.**

| Key | Name | Scope | What it holds | Status | Citation |
|---|---|---|---|---|---|
| `scoringOperator` — **the mandatory deployment operator** | DESCRIPTIVE | deployment (**MANDATORY**) → run → parent (both optional overrides) | which combination operator the scoring arithmetic applies — the closed vocabulary **accumulate \| strict-and** | **`RULED — DR-074`**: a **required row that may never be blank** in a ratified register; there is **no undeclared and no withhold state at the deployment level**, and the declare-once/withhold runtime machinery is dropped with it. Value `— none stated`; V's at DR-023 — the ruling says the row must be filled, **not what fills it** (AC-76). **Minted here at PRE-03**: §2.3 described this chain over a row §5 had never named | AC-22, AC-74; DR-062 `OD-22`; **DR-074**; §2.3 |
| `claimTypeCompositionMap` | DESCRIPTIVE | deployment | `Partial<Record<ClaimType, ClaimTypeCompositionMember>>`, where **`ClaimTypeCompositionMember`** is `{ branch: EVIDENCE_AWARE \| EVIDENCE_FREE; clarityDecayPerAmbiguity: number; terms: Array<{metric: steelman_fidelity \| counter_resilience \| evidence_quality \| evidence_relevance \| context_fit \| clarity \| fallacy_resilience; coefficient: number}>; caps: Array<{whenFatalType: string; to: number; why: string; by: string}>; uncertaintyLadder: Array<{atMost: number; label: string}> }` | **`RULED — DR-128` structural mint only.** The key and declared member type exist; the row value and every claim-type cell remain `— none stated`, V's at DR-023. A missing row or cell is typed-absent and loud (`CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED` / `COMPOSITION_UNRESOLVED`), never synthesized (AC-76). | **DR-128**; DR-023; AC-76; DR-099 A-06; FX-LG-16 |
| Band cut-point matrix (question class × risk tier) | DESCRIPTIVE | deployment | the cut points turning ordered verdict/confidence **labels** into a served band | value `— none stated`; **all band numbers deferred to DR-023**. **`RULED — DR-082 / DR-086`**: the way-of-knowing ceiling is a **second, independent gate** over this band that **caps** it rather than blocking the serve — the cut points stay register rows V ratifies, and **no number is stated here** | AC-66, AC-74; DR-063 VR-2; spec D-1; Plan.md §4.4; **DR-082, DR-086** |
| Way-of-knowing ceiling **label vocabulary + its cut** | DESCRIPTIVE | deployment | the vocabulary of `band_ceiling.label` and the cut at which the load-bearing nodes' way-of-knowing distribution fires the ceiling | **`RULED — DR-086`** (semantics): when the gate fires the answer **serves, cannot reach the top band, and wears its ceiling label visibly** — DR-014's cap + label + recorded lift-path pattern, **never a silent block**. **`RULED — DR-082`** (structure): it is a **second, independent gate**, not a restatement of DR-044(Q51)'s three. **Both DRs make the label vocabulary and the cut points register rows V ratifies at DR-023**; value `— none stated`, and *"inventing a cut here is barred by DR-039"* | AC-24, AC-75; charter VR-2; Plan.md §5.4; **DR-082, DR-086**; DR-023 |
| Hard composition-bundle budget — **the independent row** | DESCRIPTIVE | deployment | that a bundle bound exists at all, distinct from the DR-052 cost envelope, and which tier list resolves it | **`RULED — DR-078`**: an **independent register row**, *not* derived from the DR-052 cost envelope — so **`DEFECT` and `ENVELOPE_EXHAUSTED` stay distinguishable**. **V's amendment:** the cap is **user-facing as a tier list the asker selects per run** (`low` / `medium` / `high`), mirroring the asker-depth dial; the asker's choice is a **run input** (§2.5) and the three bounds below are the register's. Value `— none stated`; *"inventing a number here is barred by DR-039"* | DR-058; **DR-078**; spec §12.1b S-9c |
| Composition-bundle budget · tier **`low`** | DESCRIPTIVE | deployment | the bundle bound applied when the asker selects the `low` tier | **`RULED — DR-078`** (the row exists and is per-tier). Value `— none stated`; **V ratifies the per-tier values at DR-023** — DR-078 states *"the register carries the per-tier values … no number invented here"* | **DR-078**; AC-76, DR-039; DR-023 |
| Composition-bundle budget · tier **`medium`** | DESCRIPTIVE | deployment | the bundle bound applied when the asker selects the `medium` tier | **`RULED — DR-078`**. Value `— none stated`; V's at DR-023 | **DR-078**; AC-76, DR-039; DR-023 |
| Composition-bundle budget · tier **`high`** | DESCRIPTIVE | deployment | the bundle bound applied when the asker selects the `high` tier | **`RULED — DR-078`**. Value `— none stated`; V's at DR-023 | **DR-078**; AC-76, DR-039; DR-023 |
| Provider call bounds | DESCRIPTIVE | deployment (per call site) | `{max_attempts, token_ceiling, deadline}` attached per call site | values `— none stated`; every attempt, including schema-failure retries, is a ledger row | Plan.md §6.2 AM-13; AC-44 |
| Configured provider set | DESCRIPTIVE | deployment | which providers are configured, resolved to distinct **makers** by `deployment_maker_capability` | **at least two provider implementations ship**; adding or switching the *configured* second provider is a **register-row change only** | AC-36, AC-37, AC-38; DR-013, DR-055; Plan.md §3.2 |
| Projection layering depth — **the `OD-11` layer-2 flip row** | DESCRIPTIVE | deployment | layer 1 by default; layer 2 per-side provenance detail behind this row | **`RULED — DR-081`**: layer 2 activates **behind a register row V flips**; **layer 1 is the default**; **both states are testable before the flip**, so **nothing ships dark** (charter VR-4 class 1, G4 — the register-gated branch shape, not the not-written one). Flip state `— none stated`; V's at DR-023. Supplies DR-066(2)'s required named condition | DR-066(2); manifest `OD-11`; **DR-081**; charter VR-4/G4 |
| Evidence-gate tier × claim-type eligibility map | DESCRIPTIVE | deployment | which claim types the evidence gate binds, per risk tier | **`RULED — DR-085`**: ships as an **EMPTY register table V fills**. Until it is filled the `OD-20` gate runs **tier-invariant with shadow mode** — publishing what it would have suppressed **beside** the unsuppressed result (`shadow_suppression`, `02` §7.10). Eligibility is the **exact complement of spec §5.2(f)'s evidence-free list**. Map contents V's, later. Related: **`RULED — DR-087`** — `mixed` and `unknown` are **evidence-GATED (fail-closed)**, and `value-laden` is a **cross-cutting flag, not a claim type** (`OD-16`'s vocabulary stays closed), so neither adds a row here | DR-062 `OD-20`; AC-91; **DR-085, DR-087** |
| `Q8 type → abstention class` map | DESCRIPTIVE | deployment | the mapping that resolves the abstention cell's class axis | **`RULED — DR-080`**: the three closed sets of six are **separate vocabularies**, so this is a **real, explicit mapping table** — not a shared axis and not a rename. Contents V's at register ratification; *"inventing the mapping is barred by DR-039"* | DR-012; spec §21 N-3, §3.2; **DR-080** |
| `(Q7 act, Q8 type) → scorecard task class` map | DESCRIPTIVE | deployment | the mapping that resolves the scorecard cell's task-class key | **`RULED — DR-080`**: the second of the two mapping tables the ruling mints, keyed on the **pair**. Contents V's at register ratification (AC-76) | spec §16.2 K-3; **DR-080** |
| Memory v1 option rows (four) | DESCRIPTIVE | deployment | spec D-11's four v1-scoped memory decisions, each a register-gated branch whose **v1 option is the default value** | named later upgrades; values `— none stated` | spec D-11; Plan.md §6.7 |
| Deployment measurement ceiling | DESCRIPTIVE | deployment | the V-owned ceiling capping `graphMeasurementQuota` | value `— none stated` | DR-021 knob 12 |
| Coverage-gate threshold | DESCRIPTIVE | deployment | the threshold that would turn `UNCOVERED-SCOPE` from a note into a gate | **does not ship as a gate**: charter §5.2's deferred table says coverage *"ships as the diagnostic UNCOVERED-SCOPE note only"*. **`RULED — DR-088`**: the underlying auto-activation conflict is resolved — **auto-activation counts as shipped dark and the charter's not-shipped rule wins**, so a deferred gate is **not written** and a NOT-SHIPPED attestation stands in its place; charter §9 contradiction 6 is closed. Value `— none stated` and the row stays unread until outcome data and a V ruling turn the note into a gate | DR-020 knob 8; charter §5.2, §9 item 6; **DR-088** |
| `nodeRuntimeVersion` | DESCRIPTIVE | deployment · **bootstrap** | the pinned Node LTS line the engine and tooling run on — **including the workers** (`RULED — DR-117`: workers TypeScript initially) | value `— none stated`; resolves on the machine at S00 per **DR-104** | AC-74, AC-76; **DR-117**; Plan.md §2.2, §2.7 |
| `pnpmVersion` | DESCRIPTIVE | deployment · **bootstrap** | the pinned package-manager version that resolves the one lockfile | value `— none stated`; resolves on the machine at S00 per **DR-104** | AC-74, AC-76; Plan.md §2.7 |
| `postgresMajorVersion` | DESCRIPTIVE | deployment · **bootstrap** | the pinned Postgres major the migrations, `CHECK`s, advisory locks and `SKIP LOCKED` semantics are written against. Also the image tag the `postgres` service and the database tests' container start from, **read through the loader and never a literal in a compose or test file**. **The durable-execution engine is a co-tenant on this same major** (DR-118; ADR-0003 rule 4) | value `— none stated`; resolves on the machine at S00 per **DR-104** | AC-01, AC-04, AC-74; **DR-024, DR-117, DR-118**; Plan.md §2.4, §2.7 |
| `typescriptVersion` | DESCRIPTIVE | deployment · **bootstrap** | the pinned compiler version the exhaustiveness and orphan-audit walks depend on — **both directions of AC-61, because there is one program graph** (`RULED — DR-117`) | value `— none stated`; resolves on the machine at S00 per **DR-104** | AC-61, AC-74; **DR-117**; Plan.md §2.2, §2.7 |
| `vllmImageDigest` | DESCRIPTIVE | deployment · **bootstrap** | the **exact digest** of the local serving runtime's image. A register row because it is **verdict-bearing**: a serving-runtime build can change tokenization, sampling and numeric execution **with the model weights and recorded `model_version` unchanged**, so the same recorded inputs can produce a different artifact (§5.4c's test). Read by the compose file before any V3 process can read the database, hence bootstrap | value `— none stated`; resolves on the machine at S00 per **DR-104**. **Exact digest, never a floating tag** | AC-74, AC-76; **DR-117**; §5.4c; `01-decisions/ADR-0018-deployment-topology.md` clause 3 |
| `declaredPollInterval` | DESCRIPTIVE | deployment | the **stated interval** of a declared poll, where a client polls rather than subscribes — AC-62 permits *"event-driven or a declared poll with a **stated interval**"*, and an interval with no row is either a source literal (AC-74 forbids) or an undeclared poll (AC-62 forbids). Type: duration; unit declared on the row. Consumers: `apps/api`, the **kept `web` package** (`RULED — DR-069`: no fence — it reads the row through the same in-repo contract as any other consumer) | value `— none stated` | AC-62, AC-74, AC-76; ui §2 surface 14; `04-api-contract.md` §4.2; **DR-069** |
| `paginationLimitMax` | DESCRIPTIVE | deployment | the **maximum** `limit` any keyset-paginated read will honour, across the answer index and `GET /v1/nodes/{nodeId}/executions`. Type: integer count. Consumers: `apps/api`, `contract`'s page envelope | value `— none stated`. The executions-pagination limb is **ratified as amendment A-12 at DR-099**, so this row's second consumer is settled rather than proposed | AC-62, AC-74, AC-76; `04-api-contract.md` §7.3; **DR-099 (A-12)** |
| `paginationLimitDefault` | DESCRIPTIVE | deployment | the `limit` applied when a caller sends none — kept **separate from the maximum** because `04-api-contract.md` §7.3 names *"the maximum **and** default"* as register rows, and one row cannot carry two bounds without a silent default (spec §4 preamble) | value `— none stated` | AC-62, AC-74, AC-76; `04-api-contract.md` §7.3 |
| `convergenceEpsilon` | DESCRIPTIVE | deployment | the tolerance of house rule H8's **convergence comparison** — the max-delta comparison over the overlapping node set that decides whether work has converged. Consumers: `battery` (stop conditions), `budget` (the cost-soft tie-break) | value `— none stated` | AC-49, AC-74, AC-76; manifest §11 H8; `06-test-strategy.md` `FX-HR-H8` |
| `convergenceStopDefaults` | DESCRIPTIVE · **consolidated, see §5.4b** | deployment | H8's remaining stop-condition defaults, held as **one typed row** rather than as separately invented keys | **member set UNRATIFIED — the row has no readable members until gap REG-8 is disposed** (§5.4b, §7). Value `— none stated` and **unreadable**: a consumer read of the unresolved row is a **typed loud failure, never a default**. **DR-068…DR-100 did not touch REG-8** — it is a naming-authority gap, not one of the 28 V-QUESTIONs — so the row is carried forward **unchanged and loud**; its resolution sitting is **VG-02** (the register + ratification-package sitting). **This fold-in picks neither of §5.4b's two forms**. **DISPOSED at VG-02 — DR-107(3), 2026-08-07 (PRE-14 fold): shape RULED as one consolidated typed row (member record, one ratification act); values still V's at DR-023, so the row remains loud-on-read until valued** | AC-49, AC-74, AC-76; spec §4 preamble (*"`Unresolved` never means null, zero or false"*); manifest §11 H8; `06-test-strategy.md` `FX-HR-H8`; §7 REG-8 |
| Per-row correctness/enrichment classification | DESCRIPTIVE | deployment | which battery rows are enrichment (hence budget-skippable) and which are correctness | **`RULED — DR-093`**: produced by **architecture proposing the full 71-row split and V ratifying once** — one sitting, alongside the register (the wholesale-register pattern of DR-061/DR-062). On the record: this is **one-time design-time config, fully automatic at runtime, with no human in any user's loop**. **Until ratified, rows behave as correctness (never skipped).** Modelled as a per-row **contract field** whose unset value is a distinct typed `UNCLASSIFIED` state, **reported by the acceptance bundle as an outstanding item**. The proposal drafts with the register-ratification package; **LRD-1** (charter §5.2 row 6's fixture) becomes constructible at ratification | AC-49; charter §5.2 row 6; **DR-093**; DR-061/DR-062 pattern |

#### 5.4-i What DR-068…DR-097 changed in this table, stated as a delta

Recorded explicitly so a reviewer can check the recount in §5.6 against the
rulings rather than against a diff.

| Change | Row(s) | Ruling |
|---|---|---|
| **+1 row minted** | `scoringOperator` — the mandatory deployment operator | **DR-074**. §2.3 described a resolution chain over a row this inventory never named; a mandatory row needs a key |
| **+3 rows minted** | the three per-tier composition-bundle bounds (`low`, `medium`, `high`) | **DR-078**. The independent budget row stays; V's amendment makes the cap **user-facing as a tier list**, and the register carries the per-tier values |
| **−1 row deleted** | *Verdict-first presentation flag* | **DR-096** — see the deliberate-absence note below |
| **9 rows re-stated, none added** | band cut-point matrix · way-of-knowing ceiling · composition budget (parent row) · projection layering flip · evidence-gate eligibility map · the two `Q8`/`(Q7,Q8)` mapping tables · coverage-gate threshold · per-row correctness/enrichment classification | DR-078, DR-080, DR-081, DR-082, DR-085, DR-086, DR-088, DR-093. Each carried `pending V`; each now carries its ruling. **No value moved** |

**The deliberate absence, recorded · `RULED — DR-096`.** There is **no
verdict-first presentation flag row in this register, and there will not be
one.** Q-27 is ruled: *"No verdict-first presentation flag. The verdict banner
renders unconditionally; honesty surfaces 1 and 4 always have their landing
place; the register carries no such row."* The row that formerly sat in §5.4
marked *pending V — Q-27* is **deleted, not emptied and not deferred**.

The absence is written down rather than left silent for two reasons this
document already applies elsewhere. **(1)** A reader who remembers the earlier
draft, or who reads `ui §6 C8`, will look for the row; finding nothing, the
honest answer must be *"ruled out"*, not *"lost in an edit"* — the same
discipline §5.4b applies to REG-8's unratified members. **(2)** A deleted row is
the one shape that cannot be re-smuggled: §5.5 now carries it as a **never-a-row**
entry, so a later hand adding a presentation flag contradicts a listed
prohibition instead of filling a gap. The rendering consequence is the ruling's
own: **every honesty surface renders independently of any presentation flag**,
because there is no flag to render independently of.

### 5.4a The bootstrap class, and what the lockfile pins instead (H-C-5)

**The problem the five bootstrap rows create.** `nodeRuntimeVersion`,
`pnpmVersion`, `postgresMajorVersion`, `typescriptVersion` and
**`vllmImageDigest`** (§5.4c) are needed **before** the database-backed register
can be read: you cannot run a migration
to learn which Postgres major to install. A register that only exists in
Postgres cannot pin the Postgres it runs on.

**The read path, stated so a builder can execute it** *(SEAT-PROPOSAL, lane 4,
C4 rework round 1)*:

1. **Bootstrap source** — a version-controlled file at the workspace root,
   `register.bootstrap.json`, carrying **only** rows whose
   `resolution_scope` is marked **bootstrap**, in the same
   `{key, declared_type, unit, value}` shape as `register_row` (§1.1). Values
   stay empty until accepted; the file is the *location*, not a licence to
   invent one (AC-76).
2. **One loader, still.** `packages/register`'s loader reads the bootstrap file
   for bootstrap-class keys and the database for everything else, so the
   *"no `process.env` read outside the register's loader"* rule (§1.3) is
   unchanged and there is still **one** read path for constants (AC-74).
3. **No two sources of truth.** Once ratified, the same five keys exist as
   `register_row`s in the pinned `register_version`, and a **CI assertion fails
   the build if the bootstrap file and the ratified register disagree** on any
   bootstrap key. Fixture owed to `06-test-strategy.md`; the id is lane 6's to
   mint.
4. **Who accepts the values.** They are V's at DR-023 like every other row, and
   `07-build-order.md`'s pre-S0 gate is where accepted bootstrap values are
   recorded (lane 7, finding H-C-2). **`RULED — DR-104` fixes how they fill**: the
   five pins take the **current LTS/stable that resolves on the build machine at
   S00 scaffold time**, and the S00 worker records the exact numerals — and the
   exact image digest — in `register.bootstrap.json` and in a ledger follow-up
   row. `FX-REG-01` asserts
   equality thereafter. **Nothing in this document supplies one.**

**What is *not* a register row: dependency versions.** Library versions —
Fastify, Drizzle and `drizzle-kit`, Vitest, fast-check, Testcontainers, ESLint,
and the durable-execution engine's SDK — **and the `hatchet-engine` image
digest, which §5.4c's test acquits** — are pinned by the **one pnpm lockfile**
and the compose file, and audited as build inputs. They are not register rows and not naked constants:
they select no behaviour that can move a served verdict (AC-74/AC-75 are about
constants that can), and putting them in the register would create a second
pinning mechanism for a fact the lockfile already pins exactly (AC-85). The
distinction is load-bearing for **H2-a**, whose test asserts **byte-identical
build inputs — the lockfile included — except the one named register row**
(Plan.md §3.2).

The five bootstrap keys are different in kind because each names a **deployment
property no lockfile can express**: the runtime line, the package manager that
resolves the lockfile itself, the database major whose `CHECK`, advisory-lock and
`SKIP LOCKED` semantics the DDL is written against (AC-01, AC-04), the compiler
whose program graph the AC-61 orphan audit walks — **and the serving runtime
whose build can move a produced artifact under fixed inputs** (§5.4c).

### 5.4b The one consolidation choice, stated explicitly (H-C-14)

> **RESTORATION NOTE — PRE-10 rev 2.3.** This section was **accidentally deleted
> by a scripted edit during rev 2.3** and is restored here from
> `docs/missions/2026-08-05-v3-architecture/logs/codex-c4-final.log` (the C4-era
> text, lines 487–508) **plus the two-resolution-forms framing that §7's REG-8 row
> quotes verbatim and that survived the deletion**. It is a **reconstruction, not
> a byte-recovery**: reviewers should verify it against REG-8 (§7) and
> `09-traceability.md`'s `convergenceStopDefaults` row before this ticket is
> receipted. No content was invented; **nothing was silently repaired**.

Four of the five controls added at C4 round 3 map one-to-one onto a control
another C4 document names individually: one poll interval, one pagination
maximum, one pagination default, one convergence epsilon. **The fifth does not.**
`06-test-strategy.md` `FX-HR-H8` says *"**Epsilon and defaults** are register
rows (DR-023) — no value is asserted here"*, naming **epsilon** singly and the
**defaults** collectively. The pack names no member of that set.

**Choice made here:** one consolidated typed row, `convergenceStopDefaults`,
whose **members are not enumerated**. **Why:** minting a key per imagined stop
condition would invent controls the pack never named — AC-76 and DR-039 bar
exactly that, and an invented key is worse than a missing one because a builder
will implement against it. One named row keeps AC-74 satisfied (the values are
register-resident, never source literals) while leaving the shape to whoever
rules the members.

**What is still open, and where it is tracked:** whether
`convergenceStopDefaults` stays one typed row or becomes N stable keys is a
**cross-lane choice** between this document and `06-test-strategy.md`'s H8 row.
Recorded as gap **REG-8** (§7), since the question is which document gets to name
the members, not what their values are.

> **RULED — `DR-107(3)`, 2026-08-07 (VG-02 sitting), status folded by PRE-14.**
> V disposed REG-8: `convergenceStopDefaults` is **one consolidated typed row**
> — a member record, ratified in **one ratification act**; FX-HR-H8's constants
> become nameable. Of the two resolution forms below, form **(i)** is taken at
> the *shape* level. **Values remain V's at DR-023** and are still `— none
> stated`, so the row stays **loud-on-read** until the value sitting — the
> shape ruling does not make the row readable.

**The two resolution forms — V / FinalPlan picks one, and this seat picks
neither** (the framing §7's REG-8 row carries): **(i)** **freeze a declared type /
member contract** for the row under the appropriate authority, after which the
row becomes readable and the gap is citation-closed; or **(ii)** **preserve the
choice as pending**, in which case the row's **UNRATIFIED, loud-on-read** state
*is* the accepted carrier and the gap stays open in the adjudication record.
**Either way it must appear exactly once in the consolidated index.** Until then
the row has **no readable members** and a consumer read is a **typed loud
failure, never a default** (spec §4 preamble: *"`Unresolved` never means null,
zero or false"*). **DR-068…DR-100 did not touch REG-8** — it is a
naming-authority gap, not one of the 28 V-QUESTIONs — so the row carries forward
unchanged and loud; its sitting is **VG-02**.

### 5.5 What may never become a register row

Recorded because a register is the easiest place to smuggle back a ruled-out
default.

| Never a row | Why |
|---|---|
| Arrow strength | **closed** to the evidence verifier's grounded score or provenance cluster collapse; *"no author, policy, model or configuration row may set it freely"* (AC-27; DR-062 `OD-06`) |
| Any default τ, at any layer | AC-21 (M1) — an unjudged node emits no arrow and carries a typed record; deriving an interior base score from children is forbidden |
| Any row that deactivates a correctness or safety row | AC-49 — *"a budget may never deactivate a correctness or safety row"*; the protected core is never budget-skippable |
| An aggregate quality score | charter A1.3 `RATIFIED(DR-039)` — *"no proxy metric may stand in for V's judgment … none may be declared 'the bar'"*; `tools/acceptance-bundle` emits none and no CI gate computes one (Plan.md §6.9 item 2) |
| Condition marks, abstention kinds, terminal routes | closed and centrally owned; spec §12.3's table is the only place a typed state may be minted, transcribed once into `kernel` and **never extended locally** (AC-65, S-13) |
| A V2 value carried across as authority | AC-74 — every inherited constant is *"source material for a register row and nothing more"*; DR-033 removes any obligation to reproduce a V2 value |
| A supplier of the "measured behavioural difference" metric | **`RULED — DR-090`**: rival-carver selection runs on the **maker-diversity floor alone (DR-013)**, and the measured criterion is **recorded as unavailable, not approximated** — no proxy, no register row standing in for a metric that does not exist (DR-039). A future real metric lands as a **register/scorecard upgrade, with no re-architecture** |
| A verdict-first presentation flag | **`RULED — DR-096`**: V3 carries **no such flag at all**. The verdict banner renders unconditionally and honesty surfaces 1 and 4 always have their landing place, so there is nothing for a flag to gate. The `pending V — Q-27` row that sat in §5.4 is **deleted** (§5.4-i); re-adding it contradicts a ruling rather than filling a gap |

### 5.6 Count of the skeleton as shipped

| Group | Rows | Values stated by the pack |
|---|---:|---|
| §5.1 spec §4 parameters | 19 *(one — `adoptionBar` — dissolved and not shipped as a row)* | 18 carry ruled content; `stage11Rollout` resolved to **phased** by DR-061 `OD-S-01` |
| §5.2 annexed V-set values | 6 | 6 carry ruled content; two carry an unvalued limb (the envelope's derivation constants; the per-deployment external resolver) |
| §5.3 ruled constants elsewhere | 9 | 7 carry a stated number or rule; 2 (`pull cap`, conformance sampling rate) state a **form** with no number |
| §5.4 carrier keys | **28** — the prior 27 plus the DR-128 structural mint `claimTypeCompositionMap`; the bootstrap aggregate remains **five stable keys** (`nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion`, `vllmImageDigest`) | **0** — all `— none stated`; DR-128 mints shape only and supplies no claim-type cell (AC-76/DR-023) |
| **Total keys in the skeleton** | **61** *(+1 dissolved)* | values only where cited above |

**Counts corrected at C4 rework round 1** (finding H-C-5): §5.4 was 15 rows and
the total 48, because "Runtime/tool version pins" was carried as a single prose
row with no key a build or a run could reference or audit.

**Counts corrected again at C4 rework round 3** (finding H-C-14): §5.4 18 → 23
and the total 51 → 56, adding **`declaredPollInterval`**,
**`paginationLimitMax`**, **`paginationLimitDefault`**, **`convergenceEpsilon`**
and **`convergenceStopDefaults`**. Each is a control another C4 document already
declares as a register row — `04-api-contract.md` §4.2 (the poll interval) and
§7.3 (the two pagination limits), `06-test-strategy.md` `FX-HR-H8` (epsilon and
the stop defaults) — while this document claims to be the canonical inventory.
An unnamed key leaves a builder inventing one or writing the literal AC-74
forbids. **Values remain `— none stated`**; the one consolidation is §5.4b's.

**Recount at the PRE-03 fold-in (DR-100 follow-through): §5.4 23 → 26, total
56 → 59.** The arithmetic, so it is checkable line by line against the ledger
rather than against a diff (§5.4-i carries the same delta as a table):

| Δ | Rows | Ruling |
|---:|---|---|
| **−1** | the *verdict-first presentation flag* row is **deleted** — a deliberate absence, not an empty cell | **DR-096** |
| **+1** | `scoringOperator`, the mandatory deployment operator row, **minted here** | **DR-074** |
| **+3** | the per-tier composition-bundle bounds `low`, `medium`, `high` | **DR-078** (V's tier-list amendment; three tiers, V's own words) |
| **net +3** | 23 → **26**, and 56 → **59** | |

Nothing else in the four groups moved: §5.1 (19/18 shipped), §5.2 (6) and §5.3
(9) are untouched by DR-068…DR-097, which created no constant outside §5.4. **No
value was added anywhere** — every one of the four new rows ships `— none
stated` (AC-76, DR-039).

### 5.4c Container image tags — the verdict-bearing test, applied (`RULED — DR-117`, `DR-118`)

**The deployment runs two services the C4 set never mentioned** — `hatchet-engine`
(DR-118) and `vllm` (DR-117), each started from a container image at some
identity. Neither ADR states one, correctly: a numeral in a document is the
defect AC-74/AC-76 forbid. *Where* each identity is pinned is a real question,
and this document is the inventory that owes the answer.

**The classification test, stated executably — it is the rule, and the two
services land on opposite sides of it:**

> With **all other recorded inputs held fixed**, change **only the image digest**
> and run the same work. **If any produced artifact or served result differs, that
> digest is verdict-bearing** and is subject to the register discipline (AC-74:
> ratified by V, printed with its provenance, read through one loader). If nothing
> observable differs, it is build provenance and a compose pin suffices.

**`vllm` — VERDICT-BEARING. It is a register row.** An earlier draft of this
section argued that an image tag *"selects which build runs, not how a number is
computed"*. **That premise is false for a serving runtime and is withdrawn.** A
vLLM build can change request handling, tokenization, sampling and numeric
execution **while the model weights and the recorded `model_version` stay
identical** — so the same recorded inputs can produce a different artifact, which
is exactly what the test convicts. The consequence follows from AC-74 rather than
from preference:

| | |
|---|---|
| **Key** | `vllmImageDigest` |
| **Class** | DESCRIPTIVE · deployment · **bootstrap** — the compose file must start the service **before** any V3 process can read the database-backed register, which is §5.4a's own criterion and the same reason `postgresMajorVersion` is bootstrap |
| **Value** | `— none stated`. V's at DR-023; resolved on the machine and **recorded at S00 under DR-104**'s rule, like every other bootstrap pin |
| **Form** | an **exact digest**, never a floating tag — a moving identity makes the deployment unreproducible and breaks **H2-a**'s byte-identical build-input assertion at the container boundary |

**`hatchet-engine` — NOT verdict-bearing. It stays a compose build input**, pinned
to an exact digest and named in the acceptance bundle's input list alongside the
lockfile. **The surviving distinction is what the dispatcher does: it computes no
served number.** It decides *when a worker is asked to try*; every number that
reaches a reader is produced by a model call through Seam C's gateway and recorded
in **our** ledger (ADR-0017 clause 2).

**The sharpest objection to that, answered rather than avoided:** a dispatcher
build can change delivery and timing, and therefore **which of two overlapping
real attempts wins** under the accepted case-D overlap. That is real — and it is
**not** the test's condition. Both attempts are **real calls with real artifacts**;
the settled outcome points at one of them; replay against the recorded winner is
deterministic (AC-06/AC-07), and the loser is recorded as a superseded attempt
rather than lost (ADR-0017 §3(e)). **Race-winner non-determinism among real
outcomes is a cost and consistency property, not a computation of a served
number.** If that ever ceases to be true — if a dispatcher build is ever shown to
change a *produced artifact* under fixed inputs — the same test convicts it and it
becomes a register row on the same terms as `vllmImageDigest`.

**Required of both, and not optional:**

- **Exact digests, never floating tags** — for the register row and the compose
  pin alike.
- **Both build identities are frozen in the provenance the acceptance bundle
  carries**, alongside the lockfile, so *"what was running"* is answerable from
  the bundle rather than from the host.
- **No numeral appears here.** The digests are recorded at S00 — the register row
  through `register.bootstrap.json` (§5.4a), the compose pin in the compose file —
  and the evaluation record flags that vendor compose examples and version pins
  **must be re-checked at the implementation ticket**
  (`ratification/hatchet-vs-inngest-grok.md` §"Uncertainty").

**Status.** The **test** and the **`vllmImageDigest` row** are this seat's
application of AC-74 to a question DR-117/DR-118 left open; the **classification
of each service** follows from the test rather than from taste. A reviewer who can
show a dispatcher build changing a produced artifact under fixed inputs overturns
the `hatchet-engine` row without re-opening a ruling.

#### 5.4-ii The PRE-10 recount, in both directions — net ZERO (`RULED — DR-117`)

Recorded as a round trip rather than silently reverted, so a reviewer who saw the
rev-1 numbers can check the arithmetic instead of wondering which is current.

| Pass | Δ | Rows | Ruling |
|---|---:|---|---|
| **rev 1** | **+2** | `pythonVersion` · `uvVersion` — the interpreter line and the Python package manager | **DR-105** (engine = Python/FastAPI) |
| **rev 1** | | §5.4 26 → 28; total 59 → 61 | |
| **rev 2** | **−2** | the same two rows, **withdrawn** — there is no Python interpreter and no Python lockfile to pin | **DR-117** (DR-105 superseded) |
| **rev 2** | | §5.4 **28 → 26**; total **61 → 59** | |
| **net** | **0** | the inventory is exactly what the PRE-03 fold-in left | |

**The four surviving bootstrap keys were never deleted in either pass**, and no
row was re-valued at any point. What moved in rev 1 was only the *description* of
what three of them pin (narrowed to the web side and the consumer half of the
AC-61 audit); rev 2 restores those descriptions and, per `RULED — DR-117`,
`nodeRuntimeVersion` covers the workers as well. §5.1, §5.2 and §5.3 were
untouched by both passes. **No value moved in either direction** (AC-76, DR-039).

#### 5.4-iii The PRE-10 rev-2.3 delta (`RULED — DR-117` / `DR-118`): §5.4 26 → 27, total 59 → 60

| Δ | Row | Why |
|---:|---|---|
| **+1** | **`vllmImageDigest`** — DESCRIPTIVE · deployment · **bootstrap** | §5.4c's verdict-bearing test **convicts the serving runtime**: a vLLM build can change tokenization, sampling and numeric execution with `model_version` unchanged, so the same recorded inputs can produce a different artifact. AC-74 then requires a register row |
| **0** | `hatchet-engine` image digest | the same test **acquits the dispatcher** — it computes no served number. Stays an exact compose pin, audited as a build input |

**Value `— none stated`** (AC-76, DR-039); it resolves on the machine and is
recorded at **S00** under **DR-104**, exactly like the other bootstrap pins.

**Bootstrap-class keys: 5** — the five above, readable before the
database-backed register exists (§5.4a). **The `hatchet-engine` image digest is
NOT among them** — §5.4c's test acquits the dispatcher and convicts the serving
runtime.

**Provisional rows requiring the full A5.2 triple: 7** — the `abstention`
matrix, `livenessThreshold`, DR-046's four routing numbers (§3.2), **and
`orderingPolicy`**. `orderingPolicy` is provisional and is a **policy, not a
number**, so charter A5.2 as written did not reach it; **amendment A-13 extends
A5.2 to non-numeric provisional policy rows and is RATIFIED at DR-099** (§3.2a),
so the row carries the full triple and is counted here. *(The count was
corrected 7 → 6 at C4 rework round 1 under finding H-C-8, against A5.2 as it then
read; **A-13 changed what A5.2 reads, and the count reverts to 7**.)*

---

## 6. Two standing questions about the register itself — **both RULED**

Both were carried in `08-open-questions-for-V.md`; both are answered in
DR-068…DR-097 and the answers are folded in above.

| Question | Asks | The ruling | Blocks from |
|---|---|---|---|
| **Q-28** (charter §9 item 7) | *Is a register row with no executable unit inside charter clause 4's reach — i.e. is an unratified register key an orphan?* | **`RULED — DR-097`: OUTSIDE the reach.** Register rows are **data, not code**; the never-called list stays about **executable units**; **AC-74's ratify-before-production gate is what governs the register**. The plan's SEAT-PROPOSAL (class (3) is outside, because VR-4 itself distinguishes it from code-behind-a-flag) is the ruled answer. **Plus V's amendment:** an **advisory, non-blocking audit reports any key no code ever reads after full build**, so a stale row is noticed **without exemption paperwork**. The priced alternative did not happen: the S15 never-called list is **not** non-empty by construction, and **no unratified key needs a dated A4.3 exemption**. Charter §9 contradiction 7 is resolved and **LRD-2 is satisfied** | **S15** — answered ahead of it |
| **Q-07** (A-8) | *Is the deployment-level operator declaration optional and unset by default?* | **`RULED — DR-074`: NOT optional — MANDATORY, never blank.** §2.3 carries the consequences: the chain has three steps, not five; the bounded declaration call and the withheld-parent terminal are **deleted from the design**; the D2 anti-defect property is carried by the mandatory row plus the `no-source-literal-constant` lint. The key `scoringOperator` is minted at §5.4 | **S3** — answered ahead of it |

**Where the advisory audit lives.** DR-097's amendment is an **advisory lane**
addition, not a change to the BLOCKING never-called list: `tools/orphan-audit`
gains an unread-key report over the ratified register, fixtured as
**`FX-ORPH-07`** in `06-test-strategy.md` §11 and reported (never blocking) in
the S15 bundle. Advisory force is charter A4.1/VR-5's classification, and it is
what keeps DR-097's "outside the reach" ruling from meaning "unobserved".

**The one item that was a proposal rather than a question — now adopted.**
**§3.2a's extension of charter A5.2 to non-numeric provisional policy rows** was
a SEAT-PROPOSAL, deliberately not counted among the 28. It was walked as
**amendment A-13** and **RATIFIED at DR-099**; §3.2a and §5.6 carry the
consequence (the A5.2-mandated count reverts to **7**).

---

## 7. Gap register (register-skeleton gaps, merged dispositions)

**Ids are global** (`REG-*`), per the C4 rework-round-1 convention; the single
consolidated register of all lane gaps is `09-traceability.md`'s gap index
(lane 1). Dispositions are the merge node's
(`reviews/merge-verdict-c4.md` §5), not this seat's.

| Id | Gap | Merged disposition | State after this round |
|---|---|---|---|
| **REG-4** | Charter A5.2 binds *"every provisional **number**"*, but `orderingPolicy` is a provisional **ordering** | **MISREAD** — applying A5.2 to an ordering is a **new SEAT-PROPOSAL**, not a Plan gap and not existing law | **closed, and the proposal is now ratified.** The round-1 disposition stands as a reading of A5.2 *as it then was*: §3.2a stated the extension as an explicit SEAT-PROPOSAL and removed the row from the A5.2-mandated count (7 → 6). **That proposal was walked as amendment A-13 and RATIFIED at DR-099**, so A5.2 now reaches non-numeric provisional policy rows: the triple is **mandatory** on `orderingPolicy` and **the count reverts to 7** (§3.2a, §5.6). Nothing about the disposition was wrong — the law changed |
| **REG-5 ≡ MOD-2** | Plan.md §8 S15 requires the acceptance bundle to present the register, while §2.6 gives `tools/*` only `kernel` and `contract` | **REAL** — FinalPlan must choose the bundle's register input and update the edge list | **resolved here.** §1.4 chooses a **direct read-only `register` dependency** and records the two rejected alternatives; `03-module-design.md` §3.1 row 27 carries the edge. Carried to lane 1's consolidated index and to FinalPlan as a Plan.md §2.6 amendment |
| **REG-6** | Spec §4 row 16 calls `stage11Rollout` *"OPEN — no DR"* while DR-061 `OD-S-01` ratifies it as **phased** | **MISREAD** — the authority rule plus DR-061 resolves it; Plan.md FLAG-3 already records the correction | **closed.** §5.1 row 16 carries the DR's value with FLAG-3 cited |
| **REG-7** | The bootstrap pins must be readable **before** the database-backed register exists, and Plan.md names no location | **REAL** (raised at round 1 under H-C-5) | **resolved as a mechanism**, values still V's: §5.4a names `register.bootstrap.json`, one loader, and a CI equality assertion against the ratified rows — fixtured at `06-test-strategy.md` **`FX-REG-01`** (S0, re-asserted at S15). The **accepted values** land at `07-build-order.md`'s pre-S0 gate (lane 7, H-C-2), and **`RULED — DR-104`** fixes how they fill: resolved on the build machine at S00. **A stack replacement and its reversal (DR-105 → DR-117) moved the class 4 → 6 → 4, and DR-117/DR-118's verdict-bearing test then made it 5 (§5.4-iii), all without touching the mechanism** — one file, one loader, one equality assertion — which is the payoff of resolving REG-7 as a mechanism rather than as a list (§5.4-ii) |
| **REG-8** | `FX-HR-H8` names *"epsilon **and defaults**"* as register rows; the pack names **epsilon** singly and the defaults **collectively**, with no member named anywhere | **REAL** (raised at round 3 under H-C-14) — a naming-authority question, not a value question | **carrier shipped, member set UNRATIFIED.** §5.4b ships `convergenceStopDefaults` as one typed row with **no readable members**, a **typed loud failure on any consumer read** until this row is disposed, and the resulting **launch-readiness dependency** on `FX-HR-H8`'s tolerance-bearing limb. **The two resolution forms, both from the final review — V / FinalPlan picks one and this seat picks neither:** (i) **freeze a declared type / member contract** for the row under the appropriate authority, after which the row becomes readable and this gap is citation-closed; or (ii) **preserve the choice as pending**, in which case the unratified state above *is* the accepted carrier and the gap stays open in the adjudication record. **Either way it must appear exactly once in the consolidated index** and may not disappear from it. **State after the PRE-03 fold-in: UNCHANGED and still open.** DR-068…DR-100 ruled the 28 V-QUESTIONs; **REG-8 is not one of them** — it is a naming-authority gap, so no ruling reached it, the row stays **UNRATIFIED with a typed loud failure on read**, and **this fold-in picks neither form**. Its sitting is **VG-02** (the register + ratification-package sitting, alongside DR-093's 71-row split and DR-084's route enum) |

---

## 8. What this skeleton does not decide

- **It supplies no value the pack has not stated** (AC-76, DR-039). The empty
  cells are the deliverable, not an omission. **That includes the five bootstrap
  pins**: §5.4a names where they are read from and how they are kept consistent;
  their **values** are accepted at `07-build-order.md`'s pre-S0 gate and
  ratified by V at DR-023.
- **It ratifies nothing.** V draws and ratifies the register before production
  (AC-74, DR-023); this is the list being put in front of V. **Folding in a
  ruling is not ratifying a value**: DR-074 makes `scoringOperator` mandatory
  and DR-078 mints three tier rows, and all four still ship empty.
- **It rules no open question** — it now **carries** the rulings. All 28
  questions were ruled by V at DR-068…DR-097 and closed at DR-100;
  `08-open-questions-for-V.md` remains the register of what was asked and, per
  its annotations, of which DR answered each. Where this document states a
  behaviour it cites the DR that ruled it, never its own judgement.
- **It does not resolve REG-8.** The `convergenceStopDefaults` member set is
  still **UNRATIFIED**, still a **typed loud failure on read**, and this
  document still **picks neither** of §5.4b's two forms (§7). That sitting is
  **VG-02**, not this fold-in.
- **It does not carry table DDL** (`02-data-model.md`), **wire shapes**
  (`04-api-contract.md`), **fixtures** (`06-test-strategy.md`) or **module
  boundaries** (`03-module-design.md`). Each is cited, never restated (AC-85).

---

*End of `05-register-skeleton.md` — ARCH-V3-R1 / C4 lane 4, 2026-08-05; rulings
DR-068…DR-101 folded in 2026-08-06 under PROG-V3-R1 ticket **PRE-03** (DR-100
follow-through). The provisional-status banner is discharged by DR-098/DR-100: this is
accepted architecture. **What is still owed is unchanged — V ratifies the
register's values at DR-023**, and gap **REG-8**'s member set is still
unratified and still fails loud on read (§7). A ruling folded in here creates
rows; it fills none.*

# ADR-0011 — The register mechanism and resolution chains

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §4.6, with §4.1 (standing rule 6), §4.1a, §2.7 (config and lint rows), §3.1 context 12, §3.3 and §6.7 |
| **Label carried from the plan** | Plan.md §1 preamble: **SEAT-PROPOSAL throughout**. All values remain V's at DR-023 (sitting: **VG-02**). |

## Rulings folded in (PRE-04, 2026-08-06)

| Ruling | Q-nn | What it changes here |
|---|---|---|
| **DR-074** | Q-07 (A-8) | The deployment-level scoring operator is **MANDATORY, never blank** — a **required** register row, with **no undeclared/withhold state at the deployment level**. Parent- and run-level overrides stay optional on top. **The declare-once / withhold runtime machinery is DROPPED from the design.** The anti-defect property is preserved by the mandatory row, not by a runtime fallback. New **clause 8**. *(Scope: this deletes the **configuration** reason `WITHHELD(no operator declaration)` (AC-22 / DR-040 Q45) only. **AC-26 / DR-062 `OD-05`'s strict-and limb is untouched and the `WITHHELD` member stays reachable** — clause 8's producer table.)* |
| **DR-097** | Q-28 | **Unratified register rows are OUTSIDE charter clause 4's orphan reach** — data, not code. This retires what this ADR called *"the single largest open risk attached to this ADR"*. V's amendment adds an **advisory, non-blocking** audit lane reporting keys no code reads (ADR-0010 G6). |
| **DR-078** | Q-10 (OQ-G3) | The hard composition-bundle budget is an **independent register row**, distinct from DR-052's cost envelope — **with V's amendment: it is user-facing as a tier list ("low / medium / high") the asker selects per run**, the register carrying the per-tier values. |
| **DR-080** | Q-12 (AM-3) | The three closed sets of six are **separate vocabularies** — three declared vocabularies plus **two explicit register-row mapping tables** (`Q8 type → abstention class`; `(Q7 act, Q8 type) → scorecard task class`). |
| **DR-081** | Q-13 (U-1) | `OD-11`'s layer-2 per-side provenance detail activates behind **a register row V flips**, layer 1 default, **both states testable before the flip** — clause 6's register-gated branch, instantiated. |
| **DR-088** | Q-19 | Confirms clause 6's limit: auto-activation counts as shipped dark; the not-written branch stands, with the NOT-SHIPPED attestation. |

## Context

Four rules make configuration a first-class subsystem rather than a file:

- **AC-74** — the flag/configuration register is **drawn fresh and V-ratified
  before production**; every inherited numeric constant is source material for a
  register row and nothing more; **constants never live as source literals**
  (DR-023; spec §20 W-5; charter A3.5).
- **AC-75** — **naked constants are printed where they are used**, in the served
  trail: the abstention cell, the provenance key width, a cap, an exploration
  share, a minimum-n gate (spec §4 closing; N-4; M-16).
- **AC-76** — no invented measurements: a metric, label, threshold or rule enters
  only with hard facts behind it (DR-039; manifest §2.2 item 9).
- **AC-06** — replay from frozen records (DR-034): a register change must not be
  able to retroactively move an already-served number.

A fifth force is structural rather than numeric. **AC-22** declares the
composition operator **per parent on a resolution chain** — parent → run →
deployment — with the **supplying level recorded on the number** (DR-040 Q45;
DR-062 OD-22; DR-029 H4; DR-031 Q47). That is not a special case: it is one
instance of a general mechanism the register must provide.

## Options considered

### Option A — environment variables and configuration files *(rejected)*

Rejected on four counts: no ratification record (AC-74), no resolution chain
(AC-22), no way to print a constant where it was used (AC-75), and reads scatter
across the codebase so no inventory exists for the orphan audit (AC-77).

### Option B — constants in source, governed by code review *(rejected)*

Rejected by AC-74 in terms — constants never live as source literals — and
because charter A3.5 wants the register drawn fresh rather than inherited.

### Option C — a register table with immutable versions, a per-row resolution chain, and provisional-row metadata *(chosen)*

## Decision

### 1. The rows and their versions

- **`register_row`** — key, declared type, value, unit, `register_version`,
  ratified-by, ratified-at, `is_provisional`, recalibration owner + trigger +
  sign-off route (charter A5.2), and the **resolution scope** (deployment / run
  / parent) where the row participates in a chain.
- **`register_version`** — an **immutable set of rows**. Every run pins one on
  its frozen head, so a register change is visible in replay and cannot
  retroactively move a served number (AC-06, AC-74). `UPDATE` and `DELETE` are
  revoked on that head (ADR-0006).

### 2. Rows are keys with no invented values

The register skeleton ships **every key the pack names, and values only where the
pack states one** (AC-76 · DR-039). `05-register-skeleton.md` is the inventory;
**no C4 document supplies a value the pack does not state.** V ratifies at
DR-023.

### 3. Printing, and the row that moved a number

Plan.md §4.1 standing rule 6: **every row that a register value moved records
`register_row_key` + `register_version`**, so the constant can be printed where
it was used (AC-75). Printing is not a serve-time lookup of a current value; it
is a record of the value that actually applied.

### 4. Resolution chains are the general mechanism

A row declaring a resolution scope resolves along its declared chain, and **the
supplying level is recorded on the number** (AC-22). The operator chain
parent → run → deployment is one instance; nothing about the mechanism is
operator-specific.

**The chain's foot is mandatory (DR-074).** See clause 8: the deployment level
always supplies a value, so a resolution chain **terminates in a declared value
or in a visible `Unresolved`, never in a runtime fallback**.

### 5. No configuration read outside the loader

**No `process.env` read outside the register's loader** (Plan.md §2.7), enforced
alongside the `no-source-literal-constant` lint rule. The register is the only
door.

### 6. The register-gated branch, and its limit

A deferred capability may ship as a **register-gated branch only where the pack
has not said otherwise**, and that branch **must be exercisable in both states by
a configuration a production caller can produce** (charter VR-4 class 1, G4;
Plan.md §3.3).

**Where the pack says a gate does not ship, it is not written.** Charter §5.2's
deferred table (`RATIFIED(DR-020 knob 7)`) says the citation hard-kill gate
"does not ship … it must not exist as code that cannot fire", and
coverage-as-gate "ships as the diagnostic `UNCOVERED-SCOPE` note only". Those two
take the **not-written** branch, and **the register-gated branch may not be used
to license them** (AC-78; Plan.md §6.7, §8 S6). The acceptance bundle carries a
**NOT-SHIPPED attestation** in place of a firing fixture (ADR-0010).

### 7. The register's write and read surfaces

`PUT /v1/register/{key}` is the deployment register write, with keys V-ratified
(AC-74); `GET /v1/register` is the deployment register read, kept **separate**
from the identity/session surface (Plan.md §5.3).

### 8. The deployment operator row is mandatory, and the declare/withhold *config* machinery is gone (DR-074)

**The deployment-level scoring operator (accumulate vs strict-and) is MANDATORY,
never blank** — a **required** register row, with **no undeclared and no
withhold state at the deployment level**. Parent- and run-level overrides remain
optional **on top of it**.

**The declare-once / withhold runtime machinery is DROPPED from the design.**
With a mandatory deployment row there is nothing left to trigger it: no
"undeclared ⇒ one bounded declaration call", no "no declaration ⇒ parent number
withheld" at the deployment level. **The anti-defect property is preserved — the
operator is a recorded config value, never a hardcoded literal — by the
mandatory register row, not by the runtime fallback.** This is the D2 defect's
answer, and it is now structural rather than procedural.

**What "dropped" reaches, and what it does not — stated precisely, because the
two are easy to conflate.** DR-074 kills a **configuration** path. It does not
touch the **arithmetic** path that shares the same served-number member:

| Producer of `WITHHELD(reason)` | Trigger | Status after DR-074 |
|---|---|---|
| `WITHHELD(no operator declaration)` — **AC-22 / DR-040 Q45** | a *config* fact: the resolution chain terminates with no declared operator | **DELETED.** The chain cannot terminate undeclared, so the reason has no reachable producer and is **removed, not fenced** (AC-77 / charter VR-4). |
| `WITHHELD(strict-and conjunct unjudged or abstained)` — **AC-26 / DR-062 `OD-05`** | an *arithmetic* fact: **strict-and has no identity element** (manifest §4.2b), so a parent whose conjunct carries no judgement has no product to serve — components are served instead | **LIVE, untouched.** DR-074 changes nothing about a conjunct's judgement state. |

So **`WITHHELD(reason)` remains reachable, the discriminant member stands, and no
V ruling is required** — the deletion removes **a reason, not a member**. Treating
a missing conjunct as certainly true would be D1's failure mode in a new costume,
which is exactly why `OD-05`'s limb exists and why it survives a configuration
ruling. `FX-SRV-06` (the number slot's three states) is **unaffected**; only
`FX-PT-D2`'s undeclared-parent limb is deleted. The landed carrier text is
`02-data-model.md` §7.4, which scopes `WITHHELD` to exactly the AC-26 limb.

**Two consequences a builder must not re-invent:**

1. **`05-register-skeleton.md` marks the operator key REQUIRED.** A deployment
   whose register lacks it is not a deployment that falls back — it is a
   deployment that does not start.
2. **The `P-D2` property fixture (`FX-PT-D2`) is rescoped**, in DR-074's own
   words, from *"exercises the withhold path"* to **"operator resolves from
   parent/run/deployment register rows, never a source literal"**. The
   undeclared-parent limb is **unconstructible** under this ruling — a **deleted
   limb, not a deferred one**, and therefore not a coverage gap;
   `06-test-strategy.md` §5 and `07-build-order.md` carry the rescope
   (tickets PRE-03, PRE-01).

**The AC-77 obligation is discharged where it lands, not deferred.** The rule is
that no unreachable unit may sit indefinitely — shown live or removed. Both
halves are satisfied here without a new ruling: the undeclared-operator **reason**
is removed (nothing can produce it), and the member it shared is **shown live**
by AC-26's strict-and limb. What a builder must not do is read DR-074's
"withhold machinery is dropped" as licence to delete `WITHHELD` from the
discriminant — that would delete AC-26's ruled behaviour along with AC-22's dead
one.

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- AC-74 becomes checkable by a lint rule rather than by reviewer memory.
- Replay is protected against configuration drift by construction: the pinned
  `register_version` is unerasable, so a replay reads the register the run
  actually used (AC-06).
- Every deferred value in the pack has a landing place that is not a code
  change — which is what AC-84 means by "the expected cost of adoption is a
  register change plus a re-run" (charter §6, A5.3, A5.5).
- Provisional rows are visibly provisional: owner, recalibration trigger and
  sign-off route are columns, not conventions (charter A5.2).

**Costs and risks:**

- ~~**The skeleton ships with unfilled keys**, and whether an unfilled key is an
  entry on the BLOCKING never-called list is genuinely undecided — the single
  largest open risk attached to this ADR.~~ **RETIRED by DR-097.** An unratified
  register row is **outside** charter clause 4's orphan reach: register rows are
  **data, not code**, the never-called list stays about **executable units**, and
  **AC-74's ratify-before-production gate** governs the register instead. No
  unfilled key blocks a release and none needs a dated exemption.
- A register row is a runtime input, so a row that no code reads is still dead
  cost — and DR-097's amendment gives it a home: **an advisory, non-blocking
  audit reports any key no code ever reads after a full build** (ADR-0010's G6).
  Stale rows are noticed without exemption paperwork. Advisory means advisory: a
  G6 finding is reviewed, not enforced.
- **The skeleton still ships with unfilled keys**, and that remains a cost: every
  value V has not set is a behaviour not exercisable end to end. What changed is
  only its *classification*, not its existence.
- Every value V has not yet set is a behaviour that cannot be exercised end to
  end. Plan.md's answer is the register-gated-branch discipline of clause 6 —
  both states must be reachable by a production-producible configuration — but a
  builder who ships a branch reachable only in test has shipped a G4 violation
  wearing a register row's clothes.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-74 — register drawn fresh, V-ratified; no source-literal constants | DR-023; spec §20 W-5; charter A3.5 | `register_row` + `register_version`; the lint rule; the loader as the only door |
| AC-75 — naked constants printed where used | spec §4 closing; N-4; M-16 | `register_row_key` + `register_version` recorded on every row a value moved |
| AC-76 — no invented measurements | DR-039; manifest §2.2 item 9 | keys ship valueless unless the pack states a value |
| AC-22 — operator declared per parent on a resolution chain, supplying level recorded | DR-040 Q45; DR-062 OD-22; DR-029 H4; DR-031 Q47 | the resolution-scope column and the recorded supplying level |
| AC-06 — replay from frozen records | DR-034; spec §12.5 S-17 | every run pins one immutable `register_version` |
| AC-50 — rates frozen at run start | DR-052; DR-019 knob 1 | run-scoped values pinned on the immutable head (ADR-0006) |
| AC-78 — deferred gates not shipped dark | DR-020 knobs 7–8; charter §5.2; spec §22.1 | clause 6's limit on the register-gated branch |
| AC-84 — research findings land as register rows, not shape changes | charter §6, A5.3, A5.5 | the register as the declared landing place |
| AC-66 — band numbers deferred | DR-066(3); charter VR-2; spec §12.8 S-27 | bands are ordered labels; the cut-point matrix is a register table |
| AC-77 — no orphaned modules | DR-047 clause 4; charter §5, A4.2, VR-4 | the register-gated branch must be exercisable in both states |
| **DR-074** — the deployment operator row is mandatory; the declare/withhold **config** machinery dropped | ARCH-V3-R1 ledger DR-074 (Q-07) | clause 8; the operator key marked REQUIRED; P-D2 rescoped; the AC-26 / `OD-05` strict-and limb explicitly preserved |
| AC-26 / DR-062 `OD-05` — strict-and has no identity element; an unjudged or abstained conjunct withholds the parent | manifest §4.2b; `FX-SRV-06` | clause 8's producer table — the surviving `WITHHELD` reason, unaffected by DR-074 |
| **DR-097** — unratified register rows are outside charter clause 4's orphan reach | ARCH-V3-R1 ledger DR-097 (Q-28) | the retired risk above; ADR-0010's advisory G6 lane |
| **DR-078 / DR-080 / DR-081** — tiered budget row; two mapping tables; the layer-2 flip | ARCH-V3-R1 ledger (Q-10, Q-12, Q-13) | named register rows below, all values still V's at DR-023 |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.
**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-07 (DR-074)** — the deployment operator row is **mandatory, never
  blank**; overrides stay optional above it; the declare-once/withhold runtime
  machinery is **dropped**, which deletes the **configuration** reason
  `WITHHELD(no operator declaration)` and **nothing else** — AC-26 / `OD-05`'s
  strict-and limb keeps the member reachable. Clause 8.
- **RULED — Q-28 (DR-097)** — an unratified register key is **not** an orphan.
  Register rows are data, not code; AC-74's ratify-before-production gate
  governs them; V's amendment adds the **advisory** unread-key report (ADR-0010
  G6). Nothing about the register blocks S15.
- **RULED — Q-19 (DR-088)** — auto-activation **does** count as shipped dark;
  the charter's not-shipped rule wins, so clause 6's not-written branch stands
  as authored and the acceptance bundle keeps its **NOT-SHIPPED attestation**.
  §6.7's D-4/D-5 row and slice S6 are unchanged.
- **RULED — Q-13 (DR-081)** — `OD-11`'s layer-2 per-side provenance detail
  activates behind **a register row V flips**; **layer 1 is the default**, and
  **both states are testable before the flip** — nothing ships dark. This is
  clause 6's register-gated branch with a named condition, which is what
  DR-066(2)'s sequenced-adoption rule required.
- **RULED — Q-10 (DR-078)** — the hard composition-bundle budget is an
  **independent register row**, distinct from DR-052's cost envelope, so
  `DEFECT` and `ENVELOPE_EXHAUSTED` stay distinguishable. **V's amendment: the
  cap is user-facing as a tier list — "low / medium / high" — that the asker
  selects per run**, mirroring the existing asker-depth dial; the register
  carries the **per-tier values** and the asker's choice resolves which applies.
- **RULED — Q-12 (DR-080)** — the three closed sets of six are **separate
  vocabularies**: three declared vocabularies plus **two explicit register-row
  mapping tables** — `Q8 type → abstention class`, and
  `(Q7 act, Q8 type) → scorecard task class`.

**Still reserved (not a Q-nn), and unchanged:**

- **Every value.** DR-023 reserves them to V; `05-register-skeleton.md` ships
  **keys**. That now includes the DR-078 **per-tier** values, the DR-080
  **mapping-table contents**, the DR-081 **flip**, the DR-082/086 band label
  vocabulary and cut points, and the DR-085 tier × claim-type map. The sitting
  is **VG-02**; the bootstrap pins and toolchain versions are **VG-01**.
  Inventing any of them here is barred (AC-76 · DR-039).
*(`WITHHELD(reason)`'s reachability is **not** a reserved question: clause 8's
producer table settles it against AC-26 / DR-062 `OD-05` and manifest §4.2b. It
was raised as one at the PRE-04 handoff and **withdrawn at rework round 1** —
that framing conflated two independent producers.)*

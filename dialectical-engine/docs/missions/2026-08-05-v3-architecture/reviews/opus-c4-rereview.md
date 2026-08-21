# H4 re-review — independent Opus lens, C4 artifact set

Mission ARCH-V3-R1, stage H4 · 2026-08-05 · seat: **`h4-reviewer`** (same
independent Opus seat, never an author of any reviewed file).
Lens unchanged: **RED-TEAM / PACK-COHERENCE**.

**Independence law honoured.** `reviews/codex-c4-review.md` exists at the current
file state and was **not opened**; `logs/codex-c4-review.log` likewise. The only
cross-lens input consumed is `reviews/merge-verdict-c4.md` and its addendum —
the coordinator's routing, which the packet directs me to read.

**Inputs.** `reviews/merge-verdict-c4.md` (+ addendum); the current file state of
`docs/architecture/` (11,362 lines across 10 documents + 14 ADRs + a new
`01-decisions/README.md`); founding pack re-checked at
`docs/founding/{requirements-spec,decisions-ledger,quality-charter,ui-boundary-contract,carryover-manifest}.md`.

---

## LENS VERDICT: **CHANGES REQUESTED** (REWORK ROUND: 2 of 3)

**Verification: 17 of 19 findings REPAIRED · 2 PARTIAL.**
**New findings: 3 MAJOR · 2 MINOR (H-O-20 … H-O-24).**
**Gap adjudications: 24 of 24 honoured in `09` §8; 0 dropped, 0 reversed.**
**Regression: 6 previously-clean areas spot-checked, 0 damaged.**

**Why not PASS, stated narrowly.** The rework is strong — `apps/scheduler`,
structural rule 6, the two-limb replay split, `02` §11A, the canonical Q-04
shapes and lane 1's consolidated gap index are all better than the repairs I
asked for. **One item is a genuine break, not a cosmetic one:**
`04-api-contract.md` §10 — the document that **freezes the wire vocabulary**
(W1's deliverable) — still declares `terminal routes` as a **closed four-member**
enum sourced to `spec §12.3` Home 3, while `kernel`, `02` §13, `00` §4.1 and the
S0 count gate `FX-LG-04` now hold **five**. The fifth route (depth-zero, Q10) is
a route ordinary runs take, and spec **F-4** rules that *"each terminal route is
a recorded, **servable** outcome, never a silence"* — with `04` §10's own note
that *"a terminal route **is** the answer"*. On the current file state a
depth-zero run has **no wire representation**, and `04` §10's own single-source
rule is violated by the set's own kernel.

The three MAJOR items are **one-lane sync edits** (lane 5 twice; a mechanical id
sweep across lanes 1/3/6/7). If the merge node prefers, they are directed repairs
rather than a rework round; I am naming them as breaks because the verdict law I
was given turns on whether an item enables a realistic failure against a pack
obligation, and H-O-21 does.

---

## 1. Per-finding verification — H-O-1 … H-O-19

Verdicts: **REPAIRED** (verified at the current file state, and attacked) ·
**PARTIAL** (the repair landed in some documents and not others).

| # | Sev (r1) | Verdict | Evidence at the current file state, and the attack I ran |
|---|---|---|---|
| **H-O-1** | BLOCKER | **REPAIRED** | `03` §1.2 mints **`apps/scheduler`** with two named entry points (`job:replay-self-test`, `job:reaper`), edge row 24, and §5.5.0's two-limb table; `06` splits `FX-LG-01` into **`FX-LG-01a`** (continuous, `apps/scheduler`, recomputes with `propagation`) and **`FX-LG-01b`** (ceremony, `apps/replay`, `published-arithmetic` only, never writes). **Attacks run, all four survive:** (i) *FX-IND-03 falsified?* No — `apps/replay` stays read-only, full stop; the writing unit is a different app. (ii) *Ledger purity?* `ledger` still cannot import `propagation` (row 8 unchanged); §5.5.0 solves the hand-off by putting the snapshot and per-node record **types in `kernel`** (row 1, importable by all) — a type home, not a dependency. (iii) *VR-3 reopened?* Correctly scoped: charter §7 S1/VR-3 bind *"the ceremony"*, and §5.5.0's independence row reads *"not required by any ruling … DR-034's continuous limb requires only no model in the path"* — verified against the charter's own text at line 289/371. (iv) *Shared engine correctly scoped to AC-14?* Yes, and it is the right rule: *"a separate implementation here would be the second scoring path AC-14 forbids; sharing the engine is required, not tolerated"*. **Residual, minor:** the credential scope is stated for the self-test limb only → **H-O-24**. |
| **H-O-2** | BLOCKER | **PARTIAL** | `03` §3.1 row 21 gained **`settlement`** and **`critique`** with an acyclicity argument (`apps/*` are sinks); `03` §4.4 assigns `GET /v1/fleet` to **`battery`** and `GET /v1/session` to **`apps/api`**. **But `04` §4.3's Status column still reads "not reachable" for `/v1/scorecards`, `POST /v1/nodes/{id}/feedback` and `POST /v1/investigations/{id}/executions`**, and `04` §18's API-4 row repeats *"remain lane 4's edge-list repair"* — which lane 4 completed. → **H-O-20**. |
| **H-O-3** | MAJOR | **REPAIRED** | `apps/scheduler · job:reaper` in `03` §1.2 (a **named entry point in the published entry-point list**, charter G1/A4.5, so not an AC-77 orphan), edge row 24, `09` §1.6 AC-89 owner column, `02` §3.8's *"the scheduler's reaper writes expiries"*. |
| **H-O-4** | MAJOR | **PARTIAL** | Unified to **five** in `00` §4.1 + §13, `02` §7.7 + §13 (`terminal routes | 5`, sourced to **DR-037**), `03` §4.1, `06` §6.2 + `FX-LG-04` + §16. **DR-037 verified at source** (`decisions-ledger.md` line 65: *"inert stop; false-assumption non-answer; value→human; NOT_EMPIRICALLY_DECIDABLE; no-justification-no-split"* — five), and the ledger-wins rule is spec §2 item 1. **`04` §10 is the holdout at four.** → **H-O-21**. |
| **H-O-5** | MAJOR | **REPAIRED** | All five false Doc-`02` cells now read `—` with the reason and a gap id: AC-25 → **TRACE-8**, AC-29/AC-55 → **DM-2**, AC-91 → **TRACE-9**, AC-92 → **DM-3**. Exactly the required modification. |
| **H-O-6** | MAJOR | **REPAIRED** | `09` §1.6 AC-92 now states *"the claim-type → composition map has **NO** named `02` table or register row — its data home is unresolved (DM-3)"*; §8.1 DM-3 records *"this is why §2's AC-92 row reads 'no — pending FinalPlan carrier'"*. The false completeness claim on Plan §7 row 1's named check is gone. |
| **H-O-7** | MAJOR | **REPAIRED** | `09` §8.2 closes **TRACE-1** and **TRACE-2** as MISREAD with the exact citations (`FX-SRV-10`, `FX-SRV-11` at `06` §9.5), and §1.6's AC-89/AC-90 fixture cells now carry those ids. |
| **H-O-8** | MAJOR | **REPAIRED** | `06` §15 adds a **"Roster ↔ slice-map completeness"** clause; §12 gains a **standing** row for the CI-cross-cutting subset; `FX-S22-05` (S0/S6/S15), `FX-PT-D4` (S5/S14), `FX-HR-H2a` (S8 + S15), `FX-LG-04`, `FX-LG-06`, `FX-LED-03/04`, `FX-HR-H1` all now appear. Spot-verified S0, S1, S15 rows. |
| **H-O-9** | MAJOR | **REPAIRED, and better than asked** | `08` Q-04 now carries a three-row **named-shape** table (`transmission-reduction` / `inert` / `recorded-on-propagation_run`) with an explicit *"the answer options are named shapes, never letters … the letters used in Plan §4.2(4) and §6.4 collide — '(a)' names two different answers there — so they are retired here"*, and declares itself the canonical set for `02`, `ADR-0005` and `07`. |
| **H-O-10** | MAJOR | **REPAIRED, and better than asked** | New **structural rule 6** at `03` §3.3: *"Frozen facts are read; rules are called."* Its worked case is exactly the one I raised — Q53's residual objection is `critique`-owned, `serve` reads the rows and never imports the package, and **before S8 exists the field carries the typed empty set**, because *"an absent field would be a different thing from an empty one, and only the second is legal (AC-63)"*. AC-91's `evidence` limb resolves the same way. |
| **H-O-11** | MAJOR | **REPAIRED** | `02` **§11A** proposes an `evidence` schema (8 tables incl. `absence_row`, `citation_route_record` with the membership left to Q-16), `critique` tables in `core` (incl. `objection_record` as the single authoritative store the fact-bundle field projects from), `valuation` tables (incl. `sensitivity_record`, with the load-bearing-node argument), and **§11A.4**'s `JUDGEMENT_SCHEDULED` action member for DM-4. `09` §8.1 carries DM-1/DM-2/DM-3/DM-4 and the S6/S8/S10 headline. Numbering as `11A` to avoid renumbering cited sections — correct discipline. |
| **H-O-12** | MAJOR | **REPAIRED** | `07` §4 S5 now reads *"`FX-SRV-13` — `band_ceiling`, carried **conditionally, not as a settled gate**"*, matching `06` FX-SRV-13's own hedge and the entry-criteria row that says the answer decides it. |
| **H-O-13** | MINOR | **REPAIRED** | `02` §13 line 1515 adds `serve_state | COMPOSED, RECOMPOSED_ONCE, COMPONENTS_ONLY`, single source `ui §1.2` as declared in `04` §10, enforced by a `serve.answer` `CHECK`, with the sealed-vs-derived distinction stated. |
| **H-O-14** | MINOR | **REPAIRED** | `04` §3.4 and §4's export row now read *"§2, §3"* and *"tiering per §2/§3"*. |
| **H-O-15** | MINOR | **REPAIRED** | New `01-decisions/README.md`: the fourteen-ADR map against Plan §7 row 2's planned set, the lane's `Q-nn ↔ Plan-id` table, and gap rows **G2-1 … G2-5** — including **G2-3** (*"AC-38's deployment half has no ADR at all"*) and the **ADR-0015 directed item** at §2. The scope refusal is recorded as a scope refusal, not a merit one. |
| **H-O-16** | MINOR | **REPAIRED** | `09` §1's fixture column now carries `FX-*` ids throughout, and §8.3 exists for *"rows with no `FX-*` address, and why"*. |
| **H-O-17** | MINOR | **REPAIRED** | `SI-1` and `SI-2` are gone from `08` (grep: zero hits); the document returns to exactly the 28 `Q-nn` entries, so the wrong "12" count no longer sits in what V reads first. |
| **H-O-18** | MINOR | **REPAIRED** | `06` §8's Q51 row now reads *"**fires:** `FX-C52-01` · `FX-SRV-01b` · **does not fire:** `FX-SRV-01a`"* — the pairing matches §9.6. |
| **H-O-19** | MINOR | **REPAIRED** | `04` §3.1 row now carries an explicit **SEAT-PROPOSAL** column: *"DR-066(1) rules the scope; the three-step resolution chain is this seat's proposal, and it is `08`'s Q-03 SEAT-PROPOSAL, not a ruling"*. |

---

## 2. Gap adjudications — honoured in `09` §8?

**Yes, all 24, and the two lanes' own gap registers agree with the consolidated
index.** Checked row by row:

| My round-1 adjudication | State in `09` §8 |
|---|---|
| Lane 1 G-1 → **MISREAD** (`FX-SRV-10` exists) | §8.2 **TRACE-1**, closed with that exact citation |
| Lane 1 G-2 → **MISREAD** (`FX-SRV-11` exists) | §8.2 **TRACE-2**, same |
| Lane 1 G-3, G-4, G-6 → REAL-but-handled | §8.2 TRACE-3, TRACE-4, TRACE-6, each closed with the reason I gave |
| Lane 1 G-5 → **REAL** (AC-25/AC-31 unasserted) | §8.1 **TRACE-5**, and **closed this round** — lane 6 minted `FX-PT-FLG` and `FX-PT-POS` at S3 |
| Lane 1 G-7 → **REAL** (terminal routes) | §8.1 **TRACE-7 ≡ H-C-1**, five by DR-037, founding-table correction directed to FinalPlan/V |
| Lane 3 gaps 1, 2, 3, 4 → **REAL** | §8.1 **DM-1, DM-2, DM-3, DM-4** |
| Lane 3 gap 5 (`answer_index` kind) → REAL-but-minor | §8.2 **DM-5**, closed as a lane design choice — acceptable, `02` §7.9 now states the chosen kind |
| Lane 3 gap 6 (eight citation routes) → REAL, correctly refused | §8.2 **DM-6**, closed to **Q-16** |
| Lane 4 03 G-2 / 05 G-5 → **REAL** | §8.1 **MOD-2 ≡ REG-5**, resolved by edge row 27 + `FX-REG-02` |
| Lane 4 03 G-1, G-3 → REAL-but-resolved / correctly-open | §8.2 **MOD-1**, **MOD-3** (owner = `graph.materialiseSnapshot`) |
| Lane 4 05 G-4, G-6 → REAL, minor | §8.2 **REG-4** (now an explicit SEAT-PROPOSAL), **REG-6** |
| Lane 5 18.1, 18.2, 18.3 → **REAL** | §8.1 **API-1** (closed: `04` §7.5 keyset-paginates the executions read on the ledger `sequence`), §8.2 **API-2**, **API-3** |
| Lane 6's four → **REAL**, incl. the zero-strength-sources catch | §8.2 **TEST-1**, closed on Plan §7 row 7's "in full" |
| Lane 7 G-1, G-2 → **REAL** | §8.1 **BUILD-1**, **BUILD-2**, both now slice-assigned |
| Lane 7 G-3, G-4 → REAL / handled | §8.2 **BUILD-3**, **BUILD-4** |
| Lane 2's list **UNVERIFIABLE** | Now verifiable: `01-decisions/README.md` §3 carries **G2-1 … G2-5**; §8.1a carries G2-1, G2-3, G2-4 and the ADR-0015 directed item; §8.2 closes G2-2 |
| My H-O-5's required modification | Produced three **new** REAL rows the set did not previously hold: **TRACE-8**, **TRACE-9**, **TRACE-10** |

**Nothing was dropped, downgraded without a citation, or silently reversed.** The
one place a disposition changed direction — lane 1's G-1/G-2 → MISREAD — is the
merge node's adjudication and it is correct; I verified `FX-SRV-10`/`FX-SRV-11`
at source again this round.

---

## 3. Red-team of the round's NEW content

### 3.1 The pre-S0 gate GPG-1 … GPG-4 — **holds**

`07` §3.1. Attacked on three axes:

- **Is it a disguised V-QUESTION set?** No, and the document says why: *"GPG-1 is
  a steering act, GPG-2 is the ratification DR-005/DR-024 already assigns to V,
  and GPG-3/GPG-4 are mechanism-plus-values"*. None mints a question, so the
  28-question count is unchanged. Verified: `08`'s index is still exactly 28.
- **Does it contradict Plan §8's "nothing else starts before S0 is green"?** No —
  it sits *before* S0, which is the correct place for a gate whose subject is the
  banner every C4 file carries.
- **Is GPG-3 satisfiable without inventing a number?** Yes: the *mechanism* is
  `05` §5.4a and the *values* are V's; the gate asks for accepted values, which
  is a V act, not an architecture act. AC-76 intact.

### 3.2 `work_item`'s mutable-table justification — **holds, and it stays outside provenance**

`02` §3.8. The argument is the right one and it is stated in the right terms:
*"Rule 1 governs **facts** … a work claim is **execution state, not a record**:
its entire history is written append-only to the ledger (AC-44), and nothing in a
served answer or a replay reads this table."* Two guards make it checkable rather
than asserted: **"A `work_item` row is therefore never a provenance source for
any number" (AC-34)**, and **`state` is an internal vocabulary, never a served
typed state**, with *"past deadline" derived, not a stored member — otherwise the
reaper and the read would be two authorities for one fact* (AC-89 × AC-62).
I attacked it from the replay side: could a `work_item` update change a replayed
number? No — replay reads `ledger`/`serve` frozen rows only, and the fleet
projection is the table's only served consumer. Clean.

### 3.3 `shadow_suppression` vs `segment_suppression` — **no confusion; the distinction is explicit**

`02` §7.10 and §1.1. They are different objects with different triggers, and the
document says so in terms: `segment_suppression` withdraws a segment **after a
replay eviction** (AC-12); `shadow_suppression` records **what a gate would have
suppressed while unbound** (AC-91's shadow mode). Different schemas of meaning,
both append-only, both separately inventoried, and `shadow_suppression.gate` is a
closed two-member enum (`EVIDENCE_GATE`, `VALUE_OVERLAY`) sourced to AC-91's own
two named users — no member minted. The only open half is eligibility, correctly
left at **Q-17**. `09` §8.1 carries it as **TRACE-9**, REAL, carrier proposed.

### 3.4 The bootstrap register path — **holds, and `FX-REG-01` is the right shape**

`05` §5.4a + `06` `FX-REG-01`. The problem is real and well stated (*"you cannot
run a migration to learn which Postgres major to install"*). The solution is one
loader, two read locations, and **a CI equality assertion that fails the build if
the file and the ratified register disagree** — so there is no second source of
truth. Attacked on the AC-06 axis: could the file and the database drift and let a
run pin a register it did not use? Only if the assertion is absent, which is
exactly what `FX-REG-01` blocks, and it lands at **S0** and is re-asserted at
**S15** against the ratified `register_version`. Attacked on the AC-76 axis: the
fixture *"asserts equality, never a value"*, and all four rows read
`— none stated`. Clean.

### 3.5 `07`'s three bundle-artifact classifications — **correct, and correctly reasoned**

`07` §4 S15 classifies three S15 items as **bundle artifacts, not fixtures**: the
register's ratification (*"V's ratification act"*), the **consumer manifest**
(AC-61) and the **`UNCLASSIFIED` battery-row report** (Q-24). Checked against
charter A4.4, which requires a firing fixture **for every path in §5.2** — none of
the three is a §5.2 path, so classifying them as artifacts does not weaken A4.4.
And each is still *produced* under an existing gate: the manifest by
`FX-ORPH-01`'s required build input, the `UNCLASSIFIED` report by `06` §13's
contents list. The rule `07` §2 states — *"a gate with no fixture id is either a
bundle artifact or a gap"* — is the right discriminator and it is applied
consistently.

---

## 4. New findings

### H-O-20 · MAJOR · `04` still declares three endpoints "not reachable" after lane 4 made them reachable

**Where.** `04-api-contract.md` §4.3 Status column — *"`/v1/scorecards`,
`POST /v1/nodes/{id}/feedback` … **not reachable** — no `apps/api → settlement`
edge and `serve` has none either"* and *"`POST /v1/investigations/{id}/executions`
… **not reachable** on the current edge list"* — and §18's API-4 row, *"the three
endpoints with no legal path … remain lane 4's edge-list repair"*.

**Against.** `03-module-design.md` §3.1 **row 21**, current file state:
`apps/api` → `contract, kernel, db, register, serve, battery, ledger,`
**`settlement`**`,` **`critique`** — *"the last two added at C4 rework round 1
under H-O-2"*, with the acyclicity argument supplied.

**Breaking scenario.** The two lanes repaired one finding and did not sync. `04`
is the **frozen contract** document; its §4.3 exists precisely so that *"declaring
the surface without declaring what it needs is how an endpoint reaches CI with no
legal implementation path"*. A builder reading `04` concludes three endpoints are
unbuildable and files a blocker against a repair that already landed; a reviewer
checking H-O-2 from `04` concludes the BLOCKER is unrepaired. The information is
not merely stale — it is now **false**.

**Required modification.** `04` §4.3's three Status cells read *reachable — `03`
§3.1 row 21*; `04` §18's API-4 row records the edge-list half as closed and keeps
only the open half (**MOD-4**, the queue's table).

**Owning lane: 5.**

---

### H-O-21 · MAJOR · `04` §10 still freezes `terminal routes` at four members while the kernel enum the S0 gate asserts holds five

**Where.** `04-api-contract.md` §10, closed-enum table:
*"**terminal routes** | **4 members — imported by citation** | `spec §12.3`
**Home 3** | Answer (a terminal route *is* the answer)"*.

**Against.** `02` §13 (`terminal routes | **5**` — inert stop, false-presupposition
non-answer, value→human, `NOT_EMPIRICALLY_DECIDABLE`, depth-zero — sourced to
**DR-037**, with *"spec §12.3 Home 3 is known-incomplete at four"*); `00` §4.1 and
§13; `03` §4.1; `06` §6.2 and **`FX-LG-04`**, the **S0** membership-and-count gate,
which now asserts *"5 abstention kinds + 22 condition marks + **5 terminal
routes**"*. Merge verdict adjudication 3 fixed the count at five; lane 5 was not
in that adjudication's routing line.

**Verified at source.** `decisions-ledger.md` line 65, **DR-037** (`V-RULING`,
FINAL): *"Q1, Q3, Q7, Q9, Q10 all HYBRID — each owns a terminal route code must
enforce (inert stop; false-assumption non-answer; value→human;
NOT_EMPIRICALLY_DECIDABLE; **no-justification-no-split**)"* — five. Spec §5.2 is
headed *"The five terminal routes code must enforce (DR-037)"*. Spec §12.3 Home 3
lists four. The ledger wins (spec §2 item 1).

**Breaking scenario — this is the one genuine break of the round.** `04` §10's own
rule is *"every closed vocabulary has **exactly one source**, is transcribed
**once** into `packages/kernel`, and is **cited — never extended**"*, backed by
`require-exhaustive-switch`. On the current file state `kernel` holds five and
`contract` declares four:

- the exhaustiveness lint over the wire enum fails against the kernel's fifth
  member, **or**
- the fifth member is silently dropped at the boundary — and a **depth-zero run
  has no wire representation at all**, against spec **F-4**: *"Each terminal route
  is a **recorded, servable outcome**, never a silence"*, and against `04` §10's
  own note that *"a terminal route **is** the answer"*.

Depth-zero (Q10: no recorded justification ⇒ the question is answered undivided)
is an ordinary outcome, not an exotic one. AC-65's *"sibling artifacts cite, never
extend"* is satisfied in the wrong direction: `04` cites a table the set has
already ruled incomplete.

**Required modification.** `04` §10's terminal-routes row reads **5**, sourced to
**DR-037** with `spec §12.3` Home 3 marked known-incomplete (the wording `02` §13
already uses), and `04` §12.3's `run.terminal` event row repoints from
*"`spec §12.3` Home 3"* to the same source.

**Owning lane: 5.**

---

### H-O-22 · MAJOR · The `FX-LG-01` split left 17 dangling references, and `06` asserts the propagation is complete

**Where.** `06` §15: *"`FX-LG-01` **splits into `FX-LG-01a` … and `FX-LG-01b`**,
so **every id that referenced the old undivided row now names the limb it
meant**"*. Grep over `docs/architecture/` for `FX-LG-01` not followed by `a`/`b`
returns **17 hits**:

| File | Hits | Where it bites |
|---|---|---|
| `07-build-order.md` | 4 | §4 S1's two gate bullets; **§5 matrix A's "Replay ceremony" and "Continuous replay self-test" rows**; §4 S15's ceremony gate |
| `09-traceability.md` | 4 | §1.2 AC-06 and AC-07 fixture cells; §7's S0 and S1 slice rows; the CI-gates paragraph |
| `00-overview.md` | 2 | §7.2's AC-06 and AC-07 spine rows |
| `06-test-strategy.md` | 2 | §12's **standing** row (*"`FX-LG-01`'s continuous limb"*) and §15's own prose |
| `03-module-design.md` | 1 | §5.5.0's *"Fixture consequence, owed to lane 6: `FX-LG-01` currently carries both limbs"* — stale, since lane 6 has now split it |

**Breaking scenario.** The merge fixed *"`FX-*` is the only fixture address"* as a
cross-lane convention, and `07` §5's launch-readiness matrix plus `07` §4 S15's
gate list are what the acceptance bundle is assembled against. A bundle assembler
resolving *"Replay ceremony — `FX-LG-01`"* finds no such id in `06` §15's roster;
the two rows that need to be distinguishable — the ceremony limb (a **launch
gate**, run by a separate principal, `FX-IND-03`) and the continuous limb (a
**production safety property**, run by `apps/scheduler`) — collapse back into one
address, which is precisely the conflation `03` §5.5.0 was written to end.

**Required modification.** Mechanical sweep: every bare `FX-LG-01` becomes
`FX-LG-01a` or `FX-LG-01b` per the limb meant. `03` §5.5.0's "owed to lane 6"
paragraph is retired as discharged.

**Owning lanes: 7, 1, 6, 4** (one edit each; lane 6 also owns the §15 claim).

---

### H-O-23 · MINOR · `03` §3.2's closing paragraph contradicts its own §3.1 row 27 and §13

**Where.** `03` §3.2 still ends: *"**Recorded as a gap, not silently fixed**
(see §13): Plan.md gives `tools/*` `kernel` and `contract` only … **The edge is
not added here**; the item is raised for the plan owner."* Against `03` §3.1
**row 27** (`tools/acceptance-bundle` → `kernel, contract, register (read-only),
db`) and `03` §13 **MOD-2 ≡ REG-5** (*"**resolved here.** Edge row 27 gives …"*),
and `06` **`FX-REG-02`**, which fixtures the edge being exercised.

**Breaking scenario.** None at runtime — but the document states both that the
edge exists and that it was deliberately not added, and a reader resolving the
contradiction the wrong way removes a row a BLOCKING S15 obligation depends on.

**Required modification.** Delete or rewrite the stale paragraph.

**Owning lane: 4.**

---

### H-O-24 · MINOR · `apps/scheduler`'s credential scope is stated for one of its two jobs, and the other job's only purpose is a write the stated scope forbids

**Where.** `03` §5.5.0's credential row and `06` `FX-LG-01a` both read:
*"read-only on every schema **except** append rights on `serve`'s two eviction
streams."* That row's column header is **Continuous limb**. `job:reaper` — the
same app's other entry point — exists to *"write expiries"* to the work-claim rows
(`02` §3.8; `03` §1.2), which are in schema `core`, not `serve`. No document
states `job:reaper`'s credential scope.

**Breaking scenario.** Bounded, and it fails safe: if a deployer grants
`apps/scheduler` the one scope that is written down, `job:reaper` cannot write and
stale claims are never transitioned. AC-89's *guarantee* still holds — the read
derives the failed status from `claim_deadline` without writing (`02` §3.8,
`FX-SRV-10`), so **no reader is ever misled**; what is lost is cleanup, and
`FX-SRV-10`'s write half silently never fires. It is a MINOR because the
disposition's user-visible half is independent of it.

**Required modification.** One line: `job:reaper`'s credential scope (write on the
work-claim rows, read-only elsewhere), stated beside the self-test's in `03`
§5.5.0 or §1.2. Note this compounds with **MOD-4** — the table it writes has no
schema home yet.

**Owning lane: 4.**

---

## 5. Regression spot-checks — six previously-clean areas

| Area | Result |
|---|---|
| **Literature vectors** (`06` `FX-LV-01/02`) | **Clean.** `F = 0.125`, `B = 0.25`, `D = 0.4375`, `A = 0.59375`; `gamma = 0.76`, `beta = 0.09`, `alpha = 0.165` — unchanged, still the authors' numbers, still no V2 baseline anywhere (AC-80) |
| **`published-arithmetic`'s symbol pin** | **Clean.** Exactly `agg`, `σ`, `product` in `06` `FX-IND-01`, `07` §4 S1 and `ADR-0012`; the "fails if `apps/replay` declares any local arithmetic symbol" clause survives verbatim |
| **Condition-mark index citations in `04`** | **Clean.** Home 1 #4, Home 2 #4 / #12 / #22 all still resolve correctly against `spec §12.3` (re-verified at source). *Home 3's citation is the H-O-21 exception* |
| **AC-65's counts** | **Clean** on the two unchanged limbs: 5 abstention kinds + 22 condition marks, everywhere; only the terminal-route limb moved, deliberately |
| **The undercut's composite FK** | **Clean.** `(run_id, target_edge_id, target_edge_polarity) REFERENCES edge (run_id, edge_id, polarity)` plus the `kind <> 'undercutting' OR …` `CHECK`, identical in `02` §5.5(2) and `ADR-0005` §2; `FX-DB-04a/b` unchanged |
| **`05`'s no-invented-values discipline** | **Clean.** The four new bootstrap keys each read `— none stated`; §5.4a's fixture *"asserts equality, never a value"*. No number entered the register this round |

Two areas improved rather than regressed: `02` §7.9 now states `answer_index`'s
chosen form (closing DM-5), and `04` §7.5 keyset-paginates the executions read on
the ledger `sequence` (closing API-1) — *"the total order is the sequence, never a
timestamp and never a random tiebreak, so the cursor is stable and a page boundary
cannot reorder or drop a row"*, which is the correct cursor argument.

---

## 6. Residual risks — what a PASS would be granted over once H-O-20…H-O-22 land

Recorded now so the next merge node does not have to re-derive them. **None is a
finding**; each is a consequence the set states honestly and V should see.

- **R-A · The set's biggest open items are now data-model homes, not designs.**
  `DM-1`/`DM-2`/`DM-3`/`DM-4` and `MOD-4` are all *"lane 3 / FinalPlan"* — five
  REAL gaps whose repair is a table each. `02` §11A proposes four of the five;
  **`MOD-4`, the work-claim table, is the one with a fixture already pointing at
  it** (`FX-SRV-10`'s write half *"has no addressable target"* until it exists).
  It is the highest-value FinalPlan item in the set.
- **R-B · `apps/scheduler` is a new SEAT-PROPOSAL unit with no Plan.md mandate.**
  `03` §1.2 says so plainly (*"a lane-4 SEAT-PROPOSAL — Plan.md names the
  obligations and names no unit"*). It is the right answer to H-O-1, but it is an
  architecture-invented container and V should be shown it as one.
- **R-C · The terminal-route correction is a founding-pack edit V must actually
  make.** The set now builds five; `spec §12.3` Home 3 still lists four; S-13 says
  *"a new typed state may not be minted without being placed in this table"*.
  Until V places depth-zero (or states why it is not a Home-3 member), the kernel
  transcription is correct-by-DR and *unplaced-by-spec*. `09` §8.1 TRACE-7 routes
  it; nobody has done it.
- **R-D · Structural rule 6's second half is review-enforced, not CI-enforced.**
  `03` §3.3 says so: the import half is a graph assertion, the *"no
  re-implementation"* half is *"checked at review, not by CI"*. That is honest and
  probably unavoidable, but it means AC-85's strongest new guard is a convention.
- **R-E · 28 questions, 19 of them blocking at or before S6, plus four GPG gates
  before S0.** Unchanged from round 1 and correctly recorded. It remains the
  single largest determinant of whether the build order is executable.

---

*End of `opus-c4-rereview.md` — ARCH-V3-R1 / H4 round 2, independent Opus lens,
2026-08-05. Verdict **CHANGES REQUESTED**, rework round 2 of 3, on three
sync-level items (H-O-20, H-O-21, H-O-22) of which one — `04` §10's four-member
terminal-route enum against the kernel's five — is a genuine break. This file is
the lens's only output; no reviewed file was modified.*

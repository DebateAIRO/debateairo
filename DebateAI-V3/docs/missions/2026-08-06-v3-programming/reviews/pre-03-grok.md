# PRE-03 · Grok independent peer review

| Field | Value |
|---|---|
| Ticket | `t_a888ab35` — PRE-03 · Fold-in C: `05-register-skeleton.md` + `06-test-strategy.md` + `00-overview.md` + `08` annotations + banner sweep |
| Reviewer | Grok (independent peer lens under DR-101) |
| Variant | Claude-authored ticket; dual reviewers = Codex + Grok |
| Date | 2026-08-06 |
| Verdict | **CHANGES REQUESTED** |
| Scope under review | `docs/architecture/05-register-skeleton.md`, `06-test-strategy.md`, `00-overview.md`, `08-open-questions-for-V.md` only |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-03-codex*` file, or any ticket comment posted **after** the `READY FOR PEER REVIEW` marker. Read ticket body + comments through that marker (incl. orchestrator note on PRE-08 Home-3 restatement). |

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. Ticket body + comments through `READY FOR PEER REVIEW` (claude-worker).
3. `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` — DR-068…DR-101, with weight on DR-074 / 078 / 080–082 / 085–086 / 093 / 096 / 097 / 099.
4. The four in-scope architecture files (read directly; untracked — git diff not used).
5. Spot-check only: `docs/founding/requirements-spec.md` §12.3 Home 3 (to adjudicate the orchestrator’s PRE-08 restatement note). No Codex review artifacts.

**File-contract check.** Judged only the four named files. Cross-references into `07-build-order.md` treated as provisional records of dependency, not as PRE-03 rulings of slice direction (PRE-01 still in flight).

---

## Red-team results (8 checks)

### (1) Recount arithmetic — **PASS**

Independent count of `05` §5.4 carrier table (data rows between `### 5.4` and `#### 5.4-i`):

| Group | Independent count | Document claim |
|---|---:|---:|
| §5.1 parameters | 19 (1 dissolved, not shipped) | 19 / 18 shipped |
| §5.2 annexed | 6 | 6 |
| §5.3 ruled elsewhere | 9 | 9 |
| §5.4 carrier keys | **26** | **26** |
| Total skeleton keys | 18+6+9+26 = **59** (+1 dissolved) | **59** (+1 dissolved) |

§5.4-i delta matches the table body: **−1** (DR-096 verdict-first) **+1** (DR-074 `scoringOperator`) **+3** (DR-078 low/medium/high) ⇒ 23 → 26, 56 → 59.

**A5.2-mandated = 7:** `abstention` matrix + `livenessThreshold` + DR-046’s four numbers + `orderingPolicy` (A-13 / DR-099). H-C-8’s 7→6 correction is correctly marked dead.

### (2) DR-074 did not delete AC-26 strict-and / WITHHELD — **PASS**

- `05` §2.3: chain is **three steps** (parent → run → deployment mandatory). Former steps 4/5 (bounded declaration + withheld-parent terminal) deleted as design machinery; closed type remains **`accumulate \| strict-and`**.
- `06` P-D2 rescope note (after `FX-PT-D2`): undeclared-parent limb **deleted not deferred**; **`FX-SRV-06`’s `WITHHELD(reason)` is explicitly unaffected** — other producers remain (AC-22 strict-and conjunct, **AC-26**).
- `FX-SRV-06` row still lists states `PRESENT \| EVICTED \| WITHHELD(reason)` with citations **AC-12, AC-22, AC-26, AC-63**.

Mandatory-row deletion removed one *route into* WITHHELD, not the *state*. Faithful to DR-074’s text.

### (3) DR-078 three-tier reading — **PASS (defensible)**

Ledger DR-078: independent register row (distinct from DR-052 envelope) **plus** user-facing tier list `"low / medium / high"`; *"the register carries the per-tier values … no number invented here"*; affected path names *tiered rows* plural.

Fold-in mints:

1. parent independent composition-budget row  
2. tier `low`  
3. tier `medium`  
4. tier `high`  

All values `— none stated`. Not a single tiered blob; not inventing counts beyond V’s own three tier names. Alternative “one tiered row only” would under-read the amendment.

### (4) Five new fixture ids — **PASS**

| id | Collisions | Slice assignment | Plausible vs S-ticket scopes |
|---|---|---|---|
| `FX-WIRE-02` | Continues WIRE-01; free | S1 · S14 | Executions pagination / API-1 / A-12 — ledger+interface |
| `FX-WIRE-03` | free | S0 · S13 | `GET /v1/session` / DR-070 — walking surface + per-asker memory |
| `FX-ORPH-07` | Continues ORPH-06; kept apart from ORPH-02 | S15 | DR-097 advisory unread-key — launch bundle |
| `FX-LG-17` | Continues LG-16 | S7 · S14 | DR-075/076 lifecycle — SPLIT spawn + UI live |
| `FX-LG-18` | free | S7 · S12 | DR-089 drain + standing watch — run vs settlement boundary |

All five appear in §9.10, §12, and §15. Cross-lane slice notes name **`07` §5.1 (PRE-01)** as authority and state PRE-03 does **not** pick direction — honest provisional dependency recording, not a rival ruling.

### (5) `08` RULED blocks — **PASS**

- Header: 28 questions / 30 rulings; Q-08 and Q-14 duals named.
- 28 `### Q-nn` headings; 30 DR-068…DR-097 annotation markers (Q-08: DR-075+076; Q-14: DR-082+086).
- Sampled for ledger fidelity (question text left below as history):

| Q | Block(s) | Faithful to ledger? | Question text altered? |
|---|---|---|---|
| Q-02 | DR-069 | NO FENCE; honour-system cost; supersedes seat | No |
| Q-07 | DR-074 | MANDATORY; machinery dropped; P-D2 rescope | No |
| Q-08 | DR-075 + DR-076 | Both halves; DR-076 flagged **CUSTOM** | No |
| Q-10 | DR-078 | Independent row + tier list; no invented number | No |
| Q-14 | DR-082 + DR-086 | Second gate; caps never blocks; four gates + cap | No |
| Q-24 | DR-093 | Propose-once 71-row; correctness until ratified | No |
| Q-27 | DR-096 | No flag; deliberate absence | No |
| Q-28 | DR-097 | Outside orphan reach + advisory unread-key audit | No |

Adoption status called out where the ledger does (supersedes / amends / adopts / custom). Index Ruling column present for all 28.

### (6) `00` serve walk vs `06` FX-SRV-13 — **PASS**

`00` §6 step 7: four blocking gates then the way-of-knowing ceiling as a **second independent gate that does not block**; caps band, serves, visible label; **“Four gates plus the cap”**; cap adds no terminal.

`FX-SRV-13`: independent gate after three blocking gates pass; CAPS; never silently blocks; adds no terminal (`FX-LG-03`). Aligned. Step 8’s third compose-time `DEFECT` via independent composition budget (DR-078) stays distinguishable from `ENVELOPE_EXHAUSTED`.

### (7) Zero `CONDITIONAL` in `docs/architecture/` — **PASS**

Repo-wide grep over `docs/architecture/`: **0 hits**. In-scope files use “provisional-status banner” phrasing; no literal `CONDITIONAL` token.

### (8) No invented values — **PASS**

All newly minted register rows (`scoringOperator`, three composition-budget tiers) ship **`— none stated`**. Fixtures assert mechanism / non-blank deployment presence / advisory non-blocking report — no thresholds, cuts, or budget numbers invented. REG-8 still UNRATIFIED + loud failure; no shape picked; sitting named **VG-02**.

---

## Finding (blocks approval)

### F1 · Present-tense Home-3 incompleteness survives after PRE-08 correction (orchestrator restatement miss)

**Severity:** medium — factual overstatement of founding-pack state inside in-scope fold-in prose; does not break the DR-row inventory, but leaves the ruled-state narrative wrong on a board-critical closed contradiction.

**Orchestrator note (ticket comment before READY FOR PEER REVIEW):** stale *“Home 3 known-incomplete at four”* caveats are factually false after PRE-08’s landing; restate in `00-overview.md` and `06-test-strategy.md`; the *“must not assert against §12.3”* caution is now **moot**.

**Ground truth (read for adjudication only):** `docs/founding/requirements-spec.md` §12.3 Home 3 now has **row 5** (depth-zero), with dated edit note `RULED(DR-099 A-01; follow-through DR-100)`.

**Still present in PRE-03 files (present tense):**

| Location | Stale claim |
|---|---|
| `00-overview.md` §4.1 (~L328–332) | *“Home-3 table **lists four** and **omits** depth-zero”*; FX-LG-04 pinned against the *“known-incomplete table”*; PRE-08 still framed as mere *“scheduled work”* rather than a correction that has already landed in the founding pack |
| `06-test-strategy.md` §6.2 source table (~L414) | Home 3: *“Depth-zero is **absent** — **four**”* |
| `06` §6.2 (~L424–431) | *“must not assert count against §12.3 **while §12.3 carries four**”* / *“known-incomplete table”* as live caution |

Partial update exists (A-01 authorized; PRE-08 named; five-route authority for `FX-LG-04`) but does **not** discharge the present-tense incompleteness claim the orchestrator called out.

**Required repair (minimal):**

1. Restate Home-3 as **now five** (row 5 placed under DR-099/A-01 / PRE-08), keeping any historical “was four” only in past tense.
2. Mark the “do not count against incomplete §12.3” caution **discharged / moot** — both DR-037 and §12.3 Home 3 now yield five; `FX-LG-04` may safely assert agreement with either without freezing a lower-authority four-row table.
3. Drop or past-tense “known-incomplete” / “scheduled work only” framing that implies the founding table is still open.

No other DR-fold, recount, fixture-id, or invented-value defect is attached to this finding.

---

## Non-findings / residuals (do not block if F1 fixed alone)

- **Band label + cut as one §5.4 row** rather than split rows: ticket language can be read either way; worker’s choice (keep the pre-existing pair: band cut-point matrix + ceiling label/cut) does not invent a value and matches DR-082/086’s “register rows V ratifies” without over-minting. Acceptable.
- **FX-LG-17/18 slice placement** inferred while PRE-01 is open: documented as provisional, `07` §5.1 named as authority — correct dependency honesty.
- **FX-ORPH-01 manifest→type-graph** and §13 bundle row follow `07` §3.4 direction: same provisional-record discipline; not a PRE-03 direction claim.
- **Plan.md AC-65 still saying “4 terminal routes”** is PRE-09 scope, not PRE-03.

---

## Verdict

**CHANGES REQUESTED** — one finding:

1. Restate `00` §4.1 and `06` §6.2 Home-3 / §12.3 incompleteness language to present-tense **five** after PRE-08’s founding correction; discharge the now-moot “must not assert against incomplete §12.3” caution.

All eight primary red-team limbs on the DR fold-in itself **pass**. Re-review after F1 should be short.

---

# PRE-03 · Grok independent peer review — rev 2

| Field | Value |
|---|---|
| Ticket | `t_a888ab35` — PRE-03 (re-review after F1 rework) |
| Reviewer | Grok (independent peer lens under DR-101) |
| Date | 2026-08-06 |
| Verdict | **APPROVED** |
| Scope under re-review | F1 repair in `00-overview.md` §4.1 / §4.3 and `06-test-strategy.md` §6.2; spot-confirm `05` + `08` untouched; residual red-team limbs |
| Independence | Did **not** read any Codex verdict or any `reviews/pre-03-codex*` file. Read own rev-1 review, ticket REWORK ACKNOWLEDGED + rev-2 handoff comments, then the named source files directly. |

---

## What was verified (rev 2)

### (1) Present-tense FIVE at named sites — **PASS**

| Site | Present-tense claim | History / residual |
|---|---|---|
| `00` §4.1 | *"The terminal-route count is FIVE, and the founding pack now says so in one voice"* — §5.2, DR-037, and §12.3 Home 3 all enumerate five | Split closed in **past** tense (*"formerly listed four and omitted depth-zero"*); PRE-08 / A-01 / DR-099 landing named; Plan.md AC-65 four-route string scoped to PRE-09 |
| `00` §4.3 (kernel row) | Home-3 table and DR-037's list **now agree at five** since A-01 | Live contrast between §12.3 and DR-037 removed |
| `06` §6.2 heading + preamble | *"The terminal-route count is FIVE"*; *"founding pack now says five in one voice"* | Source table Home-3 row lists all five members; parenthetical *"listed four … until that date"* is past tense |
| Ground truth | `requirements-spec.md` §12.3 Home 3 **row 5** present (depth-zero), edit note `RULED(DR-099 A-01; follow-through DR-100)` | Confirmed by direct read, not worker report |

### (2) Caution discharged-as-history; future-divergence retained — **PASS (reasoning sound)**

- Heading: *"What FX-LG-04 must not do — **DISCHARGED**, recorded as history."*
- Old live caution demoted to a **quoted past statement** (*while §12.3 carries four / known-incomplete table*), then marked **moot in its own terms** because DR-037 and §12.3 both yield five.
- **Why kept rather than deleted** is explicit and correct: the episode is why `FX-LG-04` survived the correction (pinned to the five-member list / highest-authority reading); a four-row freeze would have failed the build on the day row 5 landed.
- **Future-divergence assertion retained**: *every member found in §12.3 Home 3 is present in the five* kept as a **future**-divergence detector — not re-enabled as a present incompleteness freeze. That is the right residual discipline under S-12/S-13 (cite membership; detect drift), not a re-litigation of the closed split.

### (3) TRACE-7 DISCHARGED + no-mint — **PASS**

`06` §6.2 blockquote: **`DISCHARGED 2026-08-06`**. States PRE-08 applied row 5; **correction minted no typed state** (authority was DR-037 all along; edit *placed* an already-ruled state); S-13 intact; TRACE-7 ≡ H-C-1 and R-3 discharged per the spec's own note. Matches founding edit note.

### (4) `05` and `08` untouched in rev 2 — **PASS (spot-check)**

File mtimes: `05` and `08` last written **22:55**; `00` / `06` last written **23:05–23:06** (after REWORK ACKNOWLEDGED). Content still carries rev-1-approved material:

- `05`: `scoringOperator` (DR-074), A5.2-mandated = **7**, deliberate DR-096 absence, §5.4 carrier count **26**, §5.6 total **59**.
- `08`: **28** `### Q-nn` headings; header *ALL 28 QUESTIONS ARE RULED*; `RULED — DR-nnn` annotation form present (sample includes DR-068 under Q-01).

### (5) Eight previously-passing red-team limbs unaffected — **PASS (spot-check)**

Independent §5.4 data-row recount between `### 5.4` and `#### 5.4-i`: **26** (first row still `scoringOperator`). Document claims of 26 / 59 still present. Fixture id **`FX-WIRE-02`** still present with S1 · S14 assignment and mechanism-not-number assertion. No evidence rev 2 reopened recount, fixture minting, RULED blocks, serve-walk, invented values, or WITHHELD/DR-078 limbs.

### (6) Zero `CONDITIONAL` — **PASS**

`docs/architecture/` tree: **0** hits for the literal token `CONDITIONAL`.

### (7) Grep — no remaining present-tense four-route claim on Home 3 / §12.3 — **PASS**

Across the four PRE-03 files, hits for four-route / known-incomplete language are only:

1. **Past-tense / quoted history** inside the discharged-caution block (`06` §6.2).
2. **Past parenthetical** on the Home-3 source-table row (*listed four until that date*).
3. **Accurate Plan.md AC-65 / PRE-09 residue** (`00` §4.1; `06` §6.2 Plan row) — out of PRE-03 repair scope and correctly framed as digest lag, not founding incompleteness.

No live claim that Home 3 or §12.3 presently carries four.

---

## Findings (rev 2)

**None.** F1 is closed.

---

## Verdict (rev 2)

**APPROVED**

F1 fully applied: present-tense five at `00` §4.1 / §4.3 and `06` §6.2; caution discharged-as-history with sound future-divergence retention; TRACE-7 DISCHARGED with no-mint; `05`/`08` untouched; prior red-team limbs and CONDITIONAL sweep clean.

---

# PRE-03 · Grok independent peer review — rev 3 / rev 3.1 (delta)

| Field | Value |
|---|---|
| Ticket | `t_a888ab35` — PRE-03 (delta check over rev 3 + rev 3.1) |
| Reviewer | Grok (independent peer lens under DR-101) |
| Date | 2026-08-06 |
| Verdict | **APPROVED** |
| Scope under re-review | Delta only: DR-069 prose (00/06/05), AC-22 spine row (00), FX-LG-17/18 subordination (06), §12 tie-break supersession (06), §2.4 header repair (05). Spot-confirm recount + roster + rev-2 F1 still hold. |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-03-codex*` file, or any peer-review body from the other diamond. Read own rev-1/rev-2 reviews, ticket rev-3 + rev-3.1 handoffs (`claude-worker` READY comments + orchestrator contract extension), then the named source regions and authority (ledger DR-069, manifest OD-05, landed `07` §3.3 / §5.1) directly. |

---

## What was verified (delta only)

### (1) DR-069 rewording — no overstatement — **PASS**

Ledger DR-069 exact text (source of truth):

> **NO FENCE.** … plain, always-visible package beside the engine packages — not a separately-checked-out workspace, not a separate repository. … **DR-003's clean-room mandate has no enforcement mechanism under this ruling** — compliance is an honour system, not a checked barrier. The consumer-manifest mechanism (§2.6/§2.7's fence-cost) is **not required**.

Rev-3 scope-limit guard (worker-added) in `00` and matching note in `06` §14:

- Removes **one barrier: the UI checkout separation**.
- Does **not** touch import fences (`propagation`/`battery/decision` purity, `apps/replay` VR-3, `contract`-only interface imports, battery sub-package fence) — those remain **code-coupling rules a build can check**.
- Consumer-manifest **not required** is stated as a ledger consequence of NO FENCE (no second build to emit it), with AC-61's **obligation retained** via the intra-repo type-graph pass (`07` §3.4) — *"removed the fence, not the obligation"*.
- P2/AC-81 prohibition **stands**; no CI substitute invented (`06` P2 points 1–2).

Test against overstatement: no site claims DR-069 removes import fences, the reading-level rule itself, AC-61 force, or any barrier beyond checkout separation + the ledger-stated "manifest not required" consequence. `05` §5.4 `declaredPollInterval` cell is a minimal NO-FENCE consumer note only. `08` left untouched (preserved Q-02 history + existing RULED annotation) — correct.

**No overstatement.**

### (2) AC-22 spine fix vs OD-05 / surviving AC-26 — **PASS**

`00` constraint spine AC-22 now reads:

- Operator resolves **parent → run → deployment**; deployment row **MANDATORY and never blank** (DR-074); supplying level recorded; never a source literal.
- Former *"no declaration ⇒ withheld parent"* tail **deleted with the undeclared state**.
- **AC-26's limb below is untouched**, so `WITHHELD(reason)` keeps a live producer.

Surviving AC-26 row (unchanged wording): *"Strict-and has no identity element; an unjudged conjunct withholds the parent"* → `FX-SRV-06`.

Manifest OD-05 / DR-062 (option b): strict-and has no identity element; every declared conjunct must be judged, or the parent number is withheld and components are served.

**Match:** the live WITHHELD producer is the **strict-and unjudged/abstained conjunct** limb (OD-05 → AC-26), not the deleted undeclared-operator path (DR-074). Same distinction rev-1 check (2) verified inside `06` P-D2 / `FX-SRV-06`; now carried into `00` so the two documents cannot drift. Serve-walk step 4 in `00` §6 agrees.

### (3) FX-LG-17/18 subordination vs landed `07` §3.3 — **PASS**

Landed `07` §3.3:

| Ruling | Owning slices |
|---|---|
| DR-076 | **S7** (spawn half) · **S14** (UI half) |
| DR-089 | **S12** (the watch) · **S7** (the intra-run WAIT drain half); watch = third `apps/scheduler` job with G1 entry-point + own credential scope |

`06` sites checked:

- §9.10 rows: PROVISIONAL per `07` §3.3; slices match exactly; closing note subordinates and states *"if §3.3 moves either, `07` is right and these rows are the ones to repair"*; consistency confirmed against landed text (not inferred).
- §12 S7 / S12 / S14 entries: provisional tags present; S12 notes third scheduler job.
- §15 minted-ids table: Slice-authority column distinguishes FX-LG-17/18 as PROVISIONAL — `07` §3.3.

**No slice moved** relative to §3.3; pure attribution fix. Consistent.

### (4) `06` §12 one-voiced after rev 3.1 — **PASS**

- Old ambiguous sentence quoted and marked **SUPERSEDED and carries no force**.
- Adjacent cross-lane paragraph: *"`07` §5.1 is the one to read and this table is the one to repair."*
- Landed `07` §5.1: *"`07` §5.1 is the operative tie-break, this document owns fixture-slice assignment, and `06` §12 is the table repaired when the two disagree."*

The two paragraphs now agree with each other and with `07`. No residual live claim that matrix A is the repair target under the old ambiguous reading. **One-voiced.**

### (5) `05` §2.4 header repair — **PASS**

| Check | Result |
|---|---|
| Four-cell header | `Shape \| Row(s) \| Rule \| Citation` |
| Separator | four cells |
| Three data rows | four cells each |
| Citations restored in render | `AC-50; DR-019 knob 1 as amended by DR-052` · `DR-021 knob 12` · `DR-021 knob 11` |
| Cell content | Matches the three known chain shapes; no evidence of Rule/Row(s) body rewrites — header/separator only as claimed |

### (6) Recount + roster exhaustiveness unaffected — **PASS**

Independent recount of `05` §5.4 data rows between `### 5.4` and `#### 5.4-i`: **26** (first row still `scoringOperator`). Document still claims 23→26 / 56→59. Five minted fixtures all present in §12 (WIRE-02/03, ORPH-07, LG-17/18). Zero literal `CONDITIONAL` in `docs/architecture/`. Rev-2 F1 still holds: present-tense FIVE at `00` §4.1 and `06` §6.2; only residual "known-incomplete" is inside the discharged-history block.

---

## Findings (rev 3 / rev 3.1)

**None.** Prior rev-2 APPROVED holds through the delta.

---

## Verdict (rev 3.1)

**APPROVED**

Delta is clean: DR-069 scope-limited to checkout barrier (no overstatement vs ledger); AC-22 spine aligns with OD-05-surviving AC-26; FX-LG-17/18 subordinated to and consistent with landed `07` §3.3; §12 one-voiced under `07` §5.1; §2.4 four-cell header restores citations without cell rewrites; recount 26 / 56→59 and roster exhaustiveness untouched.

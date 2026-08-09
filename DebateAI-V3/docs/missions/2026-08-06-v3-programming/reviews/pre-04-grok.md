# PRE-04 · Grok independent peer review

| Field | Value |
|---|---|
| Ticket | `t_c3538824` — PRE-04 · ADRs: mint ADR-0015 + ADR-0016, resolve numbering conflict, fold rulings into `01-decisions/` |
| Reviewer | Grok (independent peer lens under DR-101) |
| Variant | Claude-authored ticket; dual reviewers = Codex + Grok |
| Date | 2026-08-06 |
| Verdict | **APPROVED** |
| Scope under review | `docs/architecture/01-decisions/` only (17 files: 15 amended + 2 new) |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-04-codex*` file, or any ticket comment posted **after** the `READY FOR PEER REVIEW` marker. Orchestrator ADJUDICATION on handoff finding 1 (WITHHELD reachability) was read as permitted context. |

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. Ticket body + comments through `READY FOR PEER REVIEW` (claude-worker) and the post-handoff **ORCHESTRATOR ADJUDICATION** on WITHHELD only.
3. `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` — especially **DR-068 / DR-069**, **DR-074**, **DR-097**, **DR-098**, **DR-099 / A-02**, plus DR-070/071/076/079/082/086/089 as sampled against fold-ins.
4. `docs/architecture/03-module-design.md` **§7.3** (two-predicate maker inventory table + counter).
5. `FinalPlan-consolidation.md` **A-02** (mint text, fixtures, authority).
6. Directory: all 16 ADRs + README (full read of 0015/0016/README; red-team sample weighted to **0010, 0011, 0013, 0006, 0007, 0008**, with cross-checks on 0009/0014).

**File-contract check.** Judged **only** `docs/architecture/01-decisions/`. No production code. Fixture / module-design citations were read as external authorities for (1) and (7), not as in-scope edits.

---

## Red-team sample strategy

A first pass over 0015/0016/README would likely pass on surface completeness. Weight was shifted toward ADRs a skim reviewer treats as “already settled stack”:

| Priority | File | Why |
|---|---|---|
| P0 | ADR-0010 | DR-069 void + G1 rewrite + DR-097 G6 — easiest place to overstate “not required” into invented mechanism |
| P0 | ADR-0011 | DR-074 mandatory operator / withhold drop / P-D2 rescope — WITHHELD trap |
| P0 | ADR-0013 | DR-070 provisional asker — easy to collapse tier model further than the DR |
| P1 | ADR-0006 | DR-089 WAIT drain fold into ledger ADR |
| P1 | ADR-0007 | DR-079 load-bearing projection; no quiet carrier overclaim |
| P1 | ADR-0008 | DR-076 lifecycle events as observability-only |
| Spot | ADR-0009, ADR-0014 | DR-089/083/093; band cap + WITHHELD flag |

---

## Checklist (ticket / red-team verifies)

### (1) ADR-0015 faithful to DR-099/A-02 + module-design §7.3; fixtures right — **PASS**

| Authority claim | ADR-0015 |
|---|---|
| Title / subject: two predicates, not one | Title + Decision table match A-02 and §7.3 |
| Owner context 16 `providers` | Header field exact |
| Decision text at `03` §7.3 | Restated; predicate names, timing, reads, consequences align with §7.3 table |
| Authorities DR-055 / charter S4 / AC-38 (+ DR-013 / DR-014 held apart) | Constraints + context |
| Fixtures `FX-PRV-01a` / `01b` | Both present with correct fail/pass arms |
| Counter fixture `FX-PRV-02` | Present (required by §7.3 counter; listed in `06-test-strategy.md`) |
| Adjacent `FX-HR-H2a` | Explicitly **not** a substitute for the inventory predicates — correct |

**Options trail.** Option A is Plan §3.2 / §7.3’s own indictment (one predicate as liveness → DR-055 becomes dead clothes). Option B is the authored converse single-predicate shape; rejection is grounded in DR-055’s transient precision + DR-014 still needing a predicate — **no new numeric law, no new gate invented**. Acceptable construction.

**No invented measurements** in the new file (AC-76 / DR-039).

### (2) ADR-0016 verbatim on DR-068/069 incl. honour-system + do-not-re-raise — **PASS**

- Decision section quotes **full ledger rows** for DR-068 and DR-069 (decision / conditions / affected / supersedes / status).
- Honour-system cost is **plain fact** (clause 3 + costs), not a residual-risk hedge.
- DR-069 conditions column gets **its own clause 6**: *accepted trade-off, not a gap — do not re-raise as an open question.*
- Consumer-manifest **not required** is recorded; “voided not optional” is the ticket-prescribed reading under AC-77/G5 (optional manifest = orphan). Not an overstatement of the ledger relative to the ticket body.

### (3) Numbering resolution recorded and sound — **PASS**

README §2 + reciprocal Numbering notes in both new ADRs:

1. **ADR-0015** = maker inventory — DR-099/A-02 names **number and subject**; DR-100 follow-through repeats “mint ADR-0015”.
2. **ADR-0016** = repo layout / no-fence — DR-069 asks for a **document**, not a number; DR-068’s “ADR-0015 scope” is a **pre-DR-099 stale forward-reference**.
3. No renumber of 0001..0014; free number assigned (G2-1 discipline).

Tie-break (“ruling that names number AND subject keeps the number”) is the ticket’s own resolution and is the only resolution consistent with A-02 + DR-100. Attacked as instructed: DR-068’s affected-rows string is weaker than an individually-ruled mint that names both number and subject.

### (4) Statuses honest — no fabricated itemized ratification — **PASS**

| Set | Status string | Honest? |
|---|---|---|
| ADR-0001…0014 | `ACCEPTED wholesale via DR-098 (VS-1) — no per-technology ratification row exists; itemized confirmation pending at VG-01` | Yes — matches DR-098 wholesale acceptance; README explicitly denies per-ADR / itemized technology ratification |
| ADR-0015 | Individually minted at DR-099/A-02 | Yes |
| ADR-0016 | Records DR-068+DR-069 FINAL | Yes |

No “Nobody has decided this.” on proposed-by rows. Old `PROPOSED — V ratifies` appears **only** in README’s change record as spent history.

### (5) Pending-V → RULED; hunt for overstatement — **PASS** (no blocking overstatement)

- Grep: **zero** `pending V` in ADR bodies; README only as change-record mention.
- Scripted Q-nn → DR map over every `RULED — Q-nn (DR-…)` marker: **0 mismatches** against ledger DR-068…DR-097 (incl. Q-08 dual and Q-14 dual).

**Sampled fold-ins vs ledger (overstatement hunt):**

| Sample | Claim in ADR | Ledger | Overstate? |
|---|---|---|---|
| **0010 G1** | Manifest voided; AC-61 via **intra-repo static type-graph pass** | DR-069: no fence; consumer-manifest **not required** | No — replacement mechanism is the ticket-prescribed consequence of one type graph; not claimed as a separate V mint |
| **0010 G6** | Unratified rows outside clause-4 orphan reach + advisory unread-key lane | DR-097 exact | No |
| **0011 cl.8** | Operator **mandatory**; declare/withhold **dropped**; P-D2 rescoped in DR-074’s words | DR-074 exact | No |
| **0011 / 0014 WITHHELD** | Producer reachability **raised, not ruled** | No DR-068…101 disposes it | Correct restraint. Orchestrator adjudication (permitted context): member still reachable via AC-26/OD-05 strict-and limb — so leaving the member standing is consistent |
| **0013 cl.5** | Asker = requesting user; credentials out of scope; `user_dev_token`; **provisional** + A5.2-style revisit; tier classes unmoved; does **not** rule three-field payload shape | DR-070 FINAL — provisional simplification | No — does not design away principal/session; re-introducibility preserved |
| **0006** | WAIT drain; Q61 post-completion outside run | DR-089 | No |
| **0007** | Non-node load-bearing projects from node definition; carriers-only lifted for sampling | DR-079 | No — “lifted” is Plan’s pre-ruling restriction discharging, not a stronger DR |
| **0008 + DR-076** | Observability/streaming only; names deferred; projection-grade law unchanged | DR-076 | No |
| **0009 cl.5–6** | WAIT drain policy fixed; activation in-repo; propose-and-ratify-once correctness-until-then | DR-089 / 083 / 093 | No |
| **0014 cl.7** | Second independent gate; `band_ceiling {label,basis}`; caps never blocks; labels/cuts still V’s | DR-082 + DR-086 | No |

### (6) Zero CONDITIONAL banners — **PASS**

Grep `CONDITIONAL` in `01-decisions/`: **zero hits**. README’s change record uses lower-case “conditional-authorship banner” so the marker word does not reappear.

### (7) DR citations resolve — **PASS**

- Distinct DR numbers cited in the directory resolve against founding + ARCH-V3-R1 ledgers (scripted set-membership; **no undefined DR-NNN**).
- Relative links among ADRs / README present and reciprocal for 0015↔0016.
- Fixture ids cited by ADR-0015 resolve in `06-test-strategy.md` (FX-PRV-01a/01b/02, FX-HR-H2a).

### (8) Judge only `01-decisions/` — **PASS**

Review confined to that directory. External docs used only as authorities.

---

## Scrutiny points from handoff (independent answers)

1. **WITHHELD(reason) reachability.** Worker correctly raised without inventing a disposition. Orchestrator adjudication: still reachable via manifest §4.2b / AC-26 strict-and limb (no identity element). **No CHANGES REQUESTED** — ADR-0011/0014 are honest about the open producer question at handoff time; they do not falsely delete the discriminant member.
2. **0015/0016 assignment.** Sound; keep as recorded.
3. **0015 options trail.** Option B construction is acceptable; no smuggled law.
4. **0013 / DR-070.** Reading is correct: head of auth chain collapsed; tiers and payload classes unmoved; three-field re-introducibility reserved to PRE-02 / 02-data-model.
5. **0010 / PRE-01 sibling.** G1 cites PRE-01 for routing bookkeeping while PRE-01 is still `running`. **Non-blocking observation:** the *mechanism* (intra-repo type-graph pass) is independently required by PRE-04’s own ticket body and by DR-069’s one-repo consequence; if PRE-01 lands a different routing, G1 would need a follow-up edit. That is cross-ticket risk, not a false claim that DR-069 minted the tool name.
6. **No invented numbers.** Confirmed on the two new ADRs; fold-ins push values to DR-023 / VG-01 / VG-02.

---

## Non-blocking observations (do not block APPROVED)

1. **ADR-0013 constraints table (AC-57 row)** still says tier 2 evaluates against `session → asker → answer ownership` while clause 5 collapses the session head for this stage. Clause 5 is the authoritative fold-in; table is slightly stale wording, not a ruling overstatement.
2. **PRE-01 cross-cite** on G1/ADR-0016 clause 5 is bookkeeping fragility while PRE-01 is in flight (see scrutiny #5).
3. **WITHHELD flag** can be soft-updated later to cite the orchestrator/AC-26 limb if V wants the open question closed in-doc; not required for this ticket’s DONE WHEN.

---

## Verdict

**APPROVED.**

All eight red-team verifies pass. Minting, numbering resolution, status honesty, banner purge, RULED markers, and sampled ruling fold-ins (including the easy-to-overstate 0010/0011/0013 and the skimmed 0006/0007/0008 set) are faithful to the ledger and the ticket body. No blocking findings.

---

# PRE-04 · Grok delta review (rev 2)

| Field | Value |
|---|---|
| Ticket | `t_c3538824` — PRE-04 rev 2 |
| Reviewer | Grok (independent peer lens under DR-101) |
| Date | 2026-08-06 |
| Prior verdict | **APPROVED** (rev 1) |
| This verdict | **APPROVED** (rev 2) — prior approval **holds** |
| Delta scope | ADR-0011 clause 8 + fold-in/constraints/Q-07 bullet/Still-reserved note; ADR-0014 clause 4 + costs + constraints + DR-074 fold-in row; README §4 one record row |
| Independence | Did **not** read any `reviews/pre-04-codex*` file or full Codex review body. Judged documents against ground truth only. Rev-2 handoff text on the ticket was read as the declared rework surface. |

---

## Authority for this delta (in order)

1. This file’s rev-1 review (limbs that must remain untouched).
2. Ticket rev-2 handoff (`READY FOR PEER REVIEW (rev 2)` on `t_c3538824`) — scope claim only.
3. **DR-074** (ARCH-V3-R1 ledger): deployment operator **MANDATORY, never blank**; declare-once/withhold runtime machinery **dropped**; anti-defect via mandatory row; P-D2 rescoped.
4. **Manifest §4.2b / DR-062 `OD-05`**: **strict-and has no identity element** — unjudged or abstained conjunct ⇒ parent emits **no number**, components served; D1 costume if a missing conjunct is treated as true.
5. **Landed `02-data-model.md` §7.4**: two-limb split — AC-22 undeclared-operator reason deleted (removed, not fenced, AC-77/VR-4); AC-26 strict-and limb untouched; deletion removes a **reason**, not a **member**; three-member discriminant unchanged.
6. Direct read of the three changed surfaces (untracked files as they sit on disk).

---

## Red-team delta (five attacks)

### (1) Two-producer split vs DR-074 + OD-05 — exact claim? — **PASS**

| Authority | Claim | ADR-0011 / ADR-0014 |
|---|---|---|
| DR-074 | Drop declare-once/withhold **config/runtime** path; operator mandatory at deployment | Stated; scoped as *config* machinery; deployment row never blank |
| DR-074 consequences | Only the undeclared-operator served reason dies | `WITHHELD(no operator declaration)` — AC-22 / DR-040 Q45 — **DELETED** |
| OD-05 / §4.2b | Strict-and has **no identity element**; unjudged/abstained ⇒ withhold parent, serve components | `WITHHELD(strict-and conjunct unjudged or abstained)` — AC-26 / DR-062 `OD-05` — **LIVE, untouched** |
| Net | Reason deleted; member reachable | Explicit: “deletion removes **a reason, not a member**”; three-member discriminant stands; no V ruling required |

**Over-deletion hunt.** No residual “WITHHELD may now be unreachable / open question / flagged for V” framing (grep zero on the false open-question strings). The rev-1 “RAISED, NOT SILENTLY FIXED” blocks are gone from both ADRs and replaced with the two-producer table / producer note. Discriminant still `PRESENT | EVICTED | WITHHELD(reason)`.

**Resurrection hunt.** The dead config limb is not kept live: tables and constraints mark it **DELETED** / “removed reason, not removed member.” AC-22’s *other* legitimate load (operator per parent; supplying level recorded) remains in ADR-0011’s constraints — that is not resurrection of the withhold reason.

**Exactness.** “Declare/withhold machinery dropped” is still said (DR-074’s own words) but immediately bounded so a builder cannot take it as licence to drop the member. Matches the ledger without inventing a new rule and without under-stating OD-05.

### (2) AC-77 / VR-4 removal-not-fence for the dead limb — **PASS**

- Dead reason: no reachable producer once the deployment row is mandatory → **orphan if left as a constructible branch**.
- Law: shown live **or** removed (AC-77; charter VR-4 class).
- Text chooses **removed, not fenced** for the config reason; shared member **shown live** by AC-26.
- Same formulation as `02` §7.4 (“removed here, not fenced”). Correct discharge of both halves without a new V mint.

### (3) Over-deletion hazard names `FX-SRV-06` — **PASS**

ADR-0014 costs bullet: risk is reading “withhold machinery is dropped” as licence to drop `WITHHELD` itself (would delete AC-26’s ruled behaviour and put an unmeasured conjunct back on the D1 path). **`FX-SRV-06` is the fixture that catches it.** Also named in ADR-0011 (three states unaffected; only `FX-PT-D2` undeclared-parent limb deleted) and in both constraints tables. Catcher named correctly.

### (4) Rev-1 limbs untouched — **PASS**

| Limb | Status after rev 2 |
|---|---|
| Numbering resolution (0015 = maker inventory; 0016 = repo layout; tie-break) | Intact in README §2 + reciprocal notes |
| Status honesty (wholesale DR-098 string; 0015 individual mint; 0016 records DR-068+069) | Intact on sampled headers |
| Verbatim DR-068 / DR-069 recording (honour-system; do-not-re-raise clause 6) | Intact in ADR-0016 |
| Zero CONDITIONAL / no fabricated itemized ratification | Untouched by this rework surface |

Rework is confined to the declared surface (0011, 0014, one README §4 row). No collateral edit of minting, numbering, or status law.

### (5) One voice with landed `02` §7.4 — **PASS**

| Motif | `02` §7.4 | ADR-0011 / 0014 |
|---|---|---|
| Two independent producers / limbs | Yes | Producer table / “Which WITHHELD reason” block |
| Config reason deleted | AC-22 undeclared-operator | Same spelling + AC-22/DR-040 Q45 |
| Arithmetic limb live | AC-26 strict-and conjunct | Same + OD-05 + §4.2b no-identity-element |
| Reason not member | Explicit | Explicit |
| Remove not fence (AC-77/VR-4) | Explicit | Explicit |
| Three-member discriminant | Unchanged | Unchanged |
| Carrier cross-cite | — | Both ADRs point at §7.4 |

One voice. No competing open-question story left in `01-decisions/`.

---

## Non-blocking observations (do not block APPROVED)

1. README §4 still carries the original shorter fold-in row (“machinery **dropped**”) *above* the Rev 2 scoped row. That is change-record history, not current law; the Rev 2 row withdraws the over-broad reading. Acceptable.
2. Rev-1 non-blocking observation #3 (soft-update the WITHHELD open-question flag) is **discharged** by this rework.
3. Outside this ticket’s file contract: `06-test-strategy.md` line ~286 still says FX-SRV-06 “has other producers (AC-22’s strict-and conjunct case, AC-26)” — a stale joint attribution of the arithmetic limb. Not in PRE-04 scope; flag only if a later ticket touches test strategy.

---

## Verdict (rev 2)

**APPROVED.** Prior rev-1 approval **holds**. The single correction is exact against DR-074 + OD-05 / manifest §4.2b and speaks with landed `02` §7.4: delete the AC-22 config reason, keep the AC-26/OD-05 limb and the `WITHHELD` member, remove-not-fence the dead reason, name `FX-SRV-06` as the over-deletion catcher. No blocking findings.

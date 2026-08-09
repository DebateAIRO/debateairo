# PRE-01 · Grok independent peer review

| Field | Value |
|---|---|
| Ticket | `t_e7632c8f` — PRE-01 · Fold-in A: `07-build-order.md` + `09-traceability.md` against DR-068…DR-101 |
| Reviewer | Grok (independent peer lens under DR-101; Claude-authored ticket) |
| Date | 2026-08-06 |
| Verdict | **APPROVED** |
| Scope under review | `docs/architecture/07-build-order.md` and `docs/architecture/09-traceability.md` **only** |
| Consistency context (not judgment targets) | Plan.md (PRE-09 status block), S05/S09 ticket bodies, `06` §§9.5/12, FinalPlan-consolidation §4, both mission ledgers |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-01-codex*` file, or any ticket comment after the `READY FOR PEER REVIEW` marker. Orchestrator notes before that marker are contract. |

---

## Verdict

**APPROVED**

No blocking findings. All six red-team limbs hold. Residual notes are recorded; none rises to CHANGES REQUESTED.

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. `hermes kanban show t_e7632c8f` through `READY FOR PEER REVIEW: PRE-01 complete` (stopped there).
3. Mission ledgers: `2026-08-05-v3-architecture/decisions-ledger.md` (DR-068…DR-101) and `2026-08-06-v3-programming/decisions-ledger.md` (DR-102+).
4. The two files under review (untracked — read directly).
5. Consistency context for the named checks only.

---

## Hard checks (ticket DONE WHEN + red-team)

### (0) Zero CONDITIONAL; no invented numbers; 16-vs-13 stated — **PASS**

| Check | Evidence |
|---|---|
| `CONDITIONAL` in either file | **0 hits** (grep). Residual wording is `provisional-status` (banner removal narrative) — not a CONDITIONAL banner. |
| DR-068…DR-102 present in **both** files | Scripted presence check — **no missing DR**. |
| All 28 `Q-nn` present in 07 | Q-01…Q-28 all appear, each with a ruling citation. |
| 16-vs-13 discrepancy | 07 §5.1 explicitly records: ticket body says **sixteen** unassigned roster fixtures then enumerates **thirteen ids**; section implements the **enumeration**; verified figures stated as **13 ids / 17 placements**; the unsupported count is **not** restated as a claim (AC-76 / DR-039). |

---

### (1) Sample 12 of 28 RULED rows (weighted to the tricky ones) — **PASS**

For each sample: ledger grant → folded claim → overstatement hunt.

| Sample | Ledger grant (abbrev.) | Folded claim (07 / 09) | Overstatement? |
|---|---|---|---|
| **Q-02 / DR-069** | NO FENCE; plain in-repo package; clean-room is honour system; consumer-manifest **not required** | 07 §3.2/S0 + §3.4: NO FENCE; honour system; type-graph pass replaces manifest; **no optional manifest kept** | **No.** §3.4 correctly records that DR-069 does not name a replacement and that the type-graph pass is a **choice on the record**, not smuggled as an obvious consequence. |
| **Q-07 / DR-074** | Deployment operator **mandatory, never blank**; declare/withhold machinery **dropped**; P-D2 rescoped to register-row resolution | 07 S3 entry + FX-PT-D2 rescope; WITHHELD-for-undeclared limb flagged AC-77 trap; FX-SRV-06 rescoped at S5 | **No.** Deletion of machinery is explicit; anti-defect property preserved via mandatory register row, not runtime fallback — matches ledger words. |
| **Q-08 / DR-075** | Pending = unjudged interior under OD-02; placeholder arrows **live endpoints**; serving placeholder as claim still forbidden | 07 S3 Q-08 row: both halves; AC-86 preserved | **No.** |
| **Q-08 / DR-076** (amendment) | Spawn-time structural connectivity + **live lifecycle observability**; **not arithmetic**; event names not invented | §3.3 → S7 spawn half + S14 UI half; names deferred to PRE-02 under E1/E2; `generating` derived-only | **No.** Does not invent event names or change served-score arithmetic. |
| **Q-14 / DR-082** | Second independent gate (not restatement); `band_ceiling {label, basis}` on Answer | 07 S5 + FX-SRV-13 un-hedged half (i) | **No.** Semantics completed by DR-086 kept separate. |
| **Q-14 / DR-086** | Fire **caps** band; serves; visible label; recorded lift path; **never silently blocks**; four gates + the cap | Serve order paragraph: four gates + cap; "firing that blocks is a defect" | **No.** Does not promote the cap to a fifth blocking gate. |
| **Q-20 / DR-089** | WAIT drain at completion; Q61 = **post-completion settlement** outside run lifecycle; typed terminal state | §3.3 third scheduler job at S12; S7 drain half; G1 entry-point + own credential scope | **No.** Does not invent a job name (mint left to PRE-02 / `03`). |
| **Q-24 / DR-093** | Propose-and-ratify-once; until ratified rows behave as correctness; LRD-1 constructible at ratification | S9 carriers-only zone struck; LRD-1 = mechanism ruled, constructible at VG-02 | **No.** Does not invent the 71-row split or claim ratification already done. |
| **Q-28 / DR-097** | Register rows **outside** clause 4 orphan reach; AC-74 governs; **plus** advisory unread-key audit; LRD-2 discharged | S15 entry; advisory lane; fixture id not minted here | **No.** LRD-2 discharge matches ledger ("LRD-2 satisfied"). |
| **Q-10 / DR-078** | Independent composition-budget row + user-facing low/medium/high tier; values V's; DEFECT ≠ ENVELOPE_EXHAUSTED | S5 + S0 carrier column; values at VG-02 | **No** numbers invented. |
| **Q-18 / DR-087** | mixed/unknown evidence-gated fail-closed; value-laden = **flag, not claim type** | §3.3 + S6; OD-16 stays closed | **No.** |
| **Q-19 / DR-088** | Auto-activation counts as shipped dark; NOT-SHIPPED attestation stands | S6 FX-DEF-01 shape stands; §8 pending-V paragraph struck | **No.** |

**Also spot-checked (not in the 12, no issue):** DR-071 writable `UNDERCUT_TRANSMISSION` (S2 carriers-only struck); DR-091 authorized proxy (S8); DR-096 deliberate absence of verdict-first flag (S14 + 09 register note).

---

### (2) GPG-2 wholesale-satisfied vs Plan.md "stack STILL OPEN" — **PASS with residual consistency note**

**What 07 claims (ticket-required):**

- GPG-1 **SATISFIED — DR-098**.
- GPG-2 **SATISFIED WHOLESALE — DR-098**: C4 artifact set (ADRs + Plan §2 stack *as a set*); **no per-technology row exists and none may be fabricated**; itemized confirmation **rides VG-01 agenda item 2 as confirmation of an existing acceptance, not a re-opening**.
- GPG-3 / GPG-4 **OPEN at VG-01**.
- S0 hard block = GPG-3/4 only (GPG-1/2 already satisfied).

**What Plan.md (PRE-09 status re-record) claims:**

- `"V ratifies the stack (DR-005 as narrowed by DR-024)"` — **STILL OPEN** (= GPG-2).
- *"Nothing in DR-098…DR-100 accepts or replaces the stack."*

**What FinalPlan-consolidation §4 says:**

- GPG-2/3/4 are **explicitly not** part of the architecture-closure condition; they gate **S0**, not the architecture loop.
- GPG-1 = VS-1 (C2 repairs + conditional C4) — that is what DR-098 discharges.

**Distinction drawn in 07?** Yes: **wholesale set acceptance (DR-098 / C4)** vs **itemized stack confirmation at VG-01**. 09's reverse index says the same (DR-098 → GPG-1 + GPG-2, wholesale, no per-technology row). The six-row still-owed table correctly omits GPG-2 under that reading and keeps GPG-3/4.

**Do they contradict?** On the plain reading of Plan.md's *"nothing accepts the stack"* bullet — **yes**, they contradict the premise that acceptance has already occurred. On the board reading (PRE-01 MUST DO + VG-01 item 2 framing *"accepted per DR-098's wholesale VS-1 ratification, or replaced"*) — 07 and VG-01 agree that DR-098 already did wholesale set acceptance and VG-01 is confirmatory.

**Silent breakage?** **No.** S00 is a child of VG-01 on the board, so S0 cannot start until the sitting that includes GPG-2 confirmation has closed — regardless of whether 07 labels GPG-2 "satisfied" or "open". The practical gate force is preserved. Soft "If V wishes" language in 07 is slightly weaker than VG-01's required agenda item, but not a sequencing hole.

**Judgment:** Within PRE-01's **ticket contract** ("GPG-2 = satisfied wholesale"), the fold-in is consistent and the distinction is drawn honestly enough to be usable. The Plan.md tension is a **cross-ticket residual** (PRE-09 vs PRE-01 authority readings of DR-098), not a silent overstatement of a Q-nn ruling. Not CHANGES REQUESTED against this ticket.

---

### (3) Tie-break attack (plain-English reading) — **PASS**

**Resolution in 07 §5.1:** `"matrix A's slice assignment is the one to repair"` → plain English: **matrix A is the artifact repaired; `06` §12's slice assignment governs.**

Grounds given (grammar; exhaustiveness of `06` §12 vs matrix A as a view; ownership split unchanged) are coherent and recorded on the record.

**Opposite reading (matrix A wins) — would it break existing board/doc text?**

| Surface | What it says | Breaks under plain-English? | Breaks under opposite? |
|---|---|---|---|
| **S05** ticket | FX-SRV-16 "follows PRE-01's reconciliation ruling" | No | N/A |
| **S09** ticket | FX-SRV-16 "here per 06 §12/09 §7; confirm against PRE-01" — S9 owns the inspect-a-node subject | **No** — plain-English puts owning limb at **S9** | **Yes** — matrix-A-wins would leave S9 without the fixture it already claims |
| **06 §9.5** | FX-SRV-16 at **S5 / S9** (two limbs) | No — 07 keeps both limbs, S9 owning | Opposite would collapse to S5-only and fight 9.5 |
| **06 §12** original ambiguous sentence | shared with matrix A | Resolved, not deleted | — |
| **PRE-03** ticket (contract) | "FX-SRV-16 slice = S9, matrix-A repair rule" | Aligns | Contradicts |

**Three divergences:** FX-SRV-16 (two limbs, S9 owning), FX-LG-06 and FX-S22-05 (09 §7 omissions, not true slice conflicts) — all handled without inventing slices. **No board/doc text relied on matrix-A-wins that now breaks.**

---

### (4) §§3.3 / 3.4 — ruling-created work vs ledger walk — **PASS**

**§3.3 table (work no slice previously owed):**

| Ruling | Present? | Owning slices match ledger / ticket? |
|---|---|---|
| DR-076 | Yes | S7 + S14 + API vocab (PRE-02 mints names) |
| DR-089 | Yes | S12 watch + S7 drain; third scheduler job; G1 list + credential scope |
| DR-097 | Yes | S15 advisory lane; id not minted |
| DR-078 | Yes | S5 behaviour + S0 carrier; values VG-02 |
| DR-087 | Yes | S6 flag field |
| DR-099 A-05 | Yes | `work_item` DDL at S0 |
| DR-099 A-06 | Yes | evidence S6 / critique S8 / valuation S10 / composition map S4 |

**Walk DR-083 / 084 / 093:** not new "created work" rows in §3.3 — correctly treated as entry-criterion + ratification-package residues (PRE-05/07/06 → VG-02). Present in §3.2 and 09 §8.4.

**Walk A-07…A-11:** not every amendment needs a §3.3 row (only work no slice previously owed). Coverage elsewhere:

| Amendment | Where reflected in 07/09 |
|---|---|
| A-07 `JUDGEMENT_SCHEDULED` | 07 S1 gates (`FX-LED-01a/b`); 09 reverse index + DM-4 gap |
| A-08 fleet/session | 07 S0: `GET /v1/session`; 09 API-4 |
| A-09 bootstrap | 07 GPG-3 mechanism; 09 REG-7 |
| A-10 TRACE-8/9/10 carriers | 09 §5 accepted + slice-gated |
| A-11 executions pagination | 09 API-1 residue (id still unminted — correctly not invented) |

**Nit (non-blocking):** 07 S1 cites "§3.3" next to `JUDGEMENT_SCHEDULED` / DM-4, but A-07 is **not** a §3.3 table row. The work is present in the slice body; the cross-ref is slightly loose.

**§3.4 DR-069 vs AC-61:** conflict stated plainly; type-graph pass chosen; no optional manifest; GPG-4 limb narrowed; PRE-03 directed repair on `06` §11 recorded. Matches ticket MUST DO. **No optional-manifest orphan invented.**

---

### (5) 09 reverse index + six-row still-owed table — **PASS**

**Reverse index (DR-068…DR-102):** present; DR-100/101/102 recorded as process / no architecture constraint so greps resolve. First-binding slices named for substantive rows.

**Six-row "genuinely still owed":**

| Owed | Present? |
|---|---|
| GPG-3 bootstrap **values** (VG-01) | Yes |
| GPG-4 version identifiers (VG-01) | Yes |
| Register **values** (VG-02) | Yes (tiers, maps, flip, labels/cuts, eligibility, composition contents) |
| Three ratification packages (VG-02) | Yes (DR-093 / DR-084 / DR-083) |
| **REG-8** member shape (VG-02) | Yes — called out as the one gap-register row no ruling of DR-068…DR-101 touches |
| AC-74 register ratified before production | Yes |

**Omissions hunted:**

| Candidate | Status |
|---|---|
| REG-8 | **Present** |
| VG-01 values | **Present** (GPG-3 + GPG-4) |
| VG-02 sitting | **Present** (values + three packages + REG-8) |
| Founding stale strings / TRACE-7 | **Discharged** — DR-099/A-01 + PRE-08; orchestrator pre-handoff note honoured. Cell states DISCHARGED. |
| GPG-2 | Omitted under wholesale-satisfied reading (see check 2). Not an omission under the ticket contract. |
| Unminted fixture ids (DR-097 audit, API-1 pagination, `GET /v1/session`) | Correctly left unminted; residue named for PRE-03 / PRE-02. |

---

### (6) Ticket surface checklist — **PASS**

| MUST DO | Status |
|---|---|
| §3.2 entry-criteria table: all 28 RULED with DR cites | Done |
| GPG-1 SATISFIED; GPG-2 wholesale; GPG-3/4 OPEN | Done (per ticket) |
| Stale carriers-only zones struck with DR + quoted struck text | Done (S2–S9, S14, §8) |
| P-D2 undeclared-parent limb deleted / rescoped | Done |
| Fixture-slice tie-break resolved + three divergences + roster placements | Done |
| Ruling-created work assigned | Done (§3.3 + slice bodies) |
| DR-069 vs AC-61 → type-graph; no optional manifest | Done (§3.4) |
| CONDITIONAL banners removed | Done |
| 09 §7 AC join + §8 gap register (TRACE-7, ADR-0015, DM/MOD, REG-8, Q→DR) | Done |
| Contract: only the two files | Worker claim; scope respected for this review |

---

## Residual notes (non-blocking)

1. **Plan.md GPG-2 wording vs 07/09** — cross-ticket residual; see check (2). If V wants one sentence of harmony, a later Plan.md micro-note can say "itemized confirmation at VG-01; wholesale set acceptance recorded at DR-098 / 07 §3.1" without reopening PRE-01.
2. **S1 → §3.3 cross-ref for A-07** — loose; work is present.
3. **TRACE-7 cell trailing hedge** ("Until PRE-08 lands…") sits beside an explicit DISCHARGED claim; harmless once PRE-08 is known landed, slightly chatty.

None of these is a ruling overstatement, an invented number, a missing ruling-created work item, or a CONDITIONAL residue.

---

## Independence attestation

- No Codex review file or verdict read.
- No ticket comments after `READY FOR PEER REVIEW` read.
- Judgment targets = the two architecture files only.
- Ledger DR-068…DR-101 and ticket MUST DO are the authority for fold-in fidelity.

---

*End of pre-01-grok.md rev 1 — Grok peer lens, PROG-V3-R1 / PRE-01.*

---

# PRE-01 · Grok independent peer review — **rev 2**

| Field | Value |
|---|---|
| Ticket | `t_e7632c8f` — PRE-01 rev 2 |
| Reviewer | Grok (independent peer lens under DR-101) |
| Date | 2026-08-06 |
| Verdict | **APPROVED** |
| Scope under re-review | Flipped tie-break ownership in `07` §5.1 (+ consequential `09` §7 intro); six verbatim strike-quotations in `07` |
| Prior basis | Rev 1 **APPROVED**, partly on a grammar reading that **this rev withdraws** |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-01-codex*` file, or any peer-review content beyond the worker's rev-2 handoff and the two architecture files. Landed `06` §12 / §9.5 used only as consistency context for the ownership and FX-SRV-16 checks. |

---

## Verdict

**APPROVED**

No blocking findings on the five red-team limbs. The ownership flip is a normative re-attribution that **does not move any concrete slice assignment** rev 1 already validated; the three-merits grounds are sound and do not re-open the old ambiguity; 07 and landed 06 speak one direction with the residual old sentence recorded as **no force**; the two spot-checked strike-quotations are internally consistent with their DRs; zero `CONDITIONAL`; ledger DR-068…DR-102 still present in both files.

---

## What changed under this re-review

Rev 1 resolved the ambiguous `06` §12 sentence as **plain English**: matrix A is the artifact repaired; **`06` §12's slice assignment governs**. That resolution rested in part on a **grammar** ground.

Rev 2 **withdraws the grammar argument** and **flips ownership**:

- **`07` §5.1 is the operative tie-break**
- **`07` owns the schedule** (slice placement, entry criteria, gate force, launch judgement, LRDs)
- **`06` owns the roster as an obligation** (existence, id, what a fixture asserts; exhaustiveness law binds the table, not assignment authorship)
- The old ambiguous sentence is **superseded, not re-interpreted**
- Residual old wording in landed `06` is routed to **PRE-03** with an explicit **no force** clause meanwhile

Strike work: six sites now carry former text **verbatim** in blockquotes (or full-clause quotes), then strike clause-by-clause with the DR that struck each clause — including three additive completions of the same auditability class (S5 `FX-SRV-13` hedge, S6 `FX-DEF-01` Q-19 conditional, §8 pending-V paragraph).

Worker claim (honoured as scope bound for this re-review): **no concrete slice assignment changed** — only the normative ownership statement and the strike records.

---

## Red-team (rev 2)

### (1) Does the flipped ownership break anything rev 1 validated? — **PASS**

**Rev-1 breakage path under "matrix A wins":** if that reading meant **S5-only** for `FX-SRV-16`, then S09 (inspect-a-node subject at S9), `06` §9.5's "S5 / S9", and PRE-03's "slice = S9" would fight the fold-in.

**What rev 2 actually does:** it does **not** collapse to S5-only. Concrete reconciliation is unchanged:

| Surface | Still says | Breaks under flip? |
|---|---|---|
| `07` §4 S5 | `FX-SRV-16` serve/projection limb; **owning slice is S9** | No |
| `07` §4 S9 | `FX-SRV-16` **owning slice** | No |
| `07` §5.1 table | **Two limbs, S9 owning**; S5 = read-time projection (AC-85) | No |
| `09` §7 | S5 carries projection limb in `FX-SRV-02…16`; S9 carries **owning slice, per `07` §5.1** | No |
| Landed `06` §9.5 | S9 owns; S5 projection half; "reconciled per `07` §5.1" | No |
| Landed `06` §12 S9 | `FX-SRV-16` **owning slice — reconciled per `07` §5.1 (PRE-01)** | No |

**Why the old breakage path does not fire:** rev 1's hazard was a *concrete assignment change* (S5-only). Split ownership re-attributes **who authors** the schedule without moving the assignment. `FX-SRV-16` stays two-limb with **S9 owning**. `FX-LG-06` / `FX-S22-05` remain three limbs each (re-labelled as **not disagreements** — `07`/`06` already agreed; they were `09` omissions). Roster table still **13 ids / 17 placements**, framed as adoption where `07` was silent, not override.

**Judgment:** flipped ownership does **not** break the board/doc surfaces rev 1 checked. PASS.

---

### (2) Is the three-merits argument sound, or does it smuggle ambiguity back? — **PASS**

| Ground | Claim | Sound? |
|---|---|---|
| **1. Scheduling subject** | Slice assignment is a scheduling statement; `06` §12's own preamble already delegates entry criteria and the launch-readiness matrix to `07`; *when* a fixture first fires is inseparable from §3/§4 ordering | **Yes.** Matches landed `06` preamble and the job of matrix A. |
| **2. Exhaustiveness as obligation, not authority** | `06` §12 stays exhaustive against the roster; that law binds the **table** to carry every id; it does **not** make `06` author of slice placement. Dual duty: `07` places every roster id; `06` carries every id it places | **Yes.** This is the key reclassification that lets both exhaustiveness and single-owner assignment hold at once. It does not leave a residual "who wins on slice?" question. |
| **3. Clean split** | `06` owns roster (existence / id / assertion); `07` owns schedule (slice / entry / gate force / LRDs); `07` mints no fixture id | **Yes.** Corollary is usable: slice or gate-force disagreement → edit `06`; existence/id/assertion disagreement → `06` governs, edit `07`. |

**Ambiguity hunt:** does "adopts `06` where silent" smuggle the old dual reading back? **No.** Silence is distinguished from disagreement: adoption fills `07`'s placement duty without invoking the tie-break; disagreement still has one owner (`07` rules, `06` is repaired). Grammar is withdrawn on the record rather than half-kept. The operative sentence is singular: *"`07` §5.1 is the operative tie-break, this document owns fixture-slice assignment, and `06` §12 is the table repaired when the two disagree."*

**Judgment:** three-merits is sound; no smuggled ambiguity. PASS.

---

### (3) Do 07 and landed 06 speak ONE direction? Residual old sentence loud enough to have no force? — **PASS**

| Document | Operative ownership statement |
|---|---|
| **`07` §5.1** | `07` §5.1 operative; `07` owns assignment; ambiguous sentence **superseded** |
| **Landed `06` §12** | Original tie-break quote is **SUPERSEDED and carries no force**; *"`07` owns slice assignment … `07` §5.1 is the one to read and this table is the one to repair"* |
| **`09` §7** intro | Same single voice as `07` §5.1; cites landed `06` naming the same owner |

**Residual / PRE-03:** `07` §5.1 carries a blockquoted directed repair — original ambiguous wording still appears in landed `06` (now as a historical quote wrapped in supersession language) and **PRE-03 owns the strike/rewrite**. Until then: **this section and `06` §12's cross-lane-reconciliation paragraph are the operative rule; the superseded sentence has no force.**

That is loud enough: both sides name the same owner, both mark the old sentence as having no force, and the cleanup is routed out of this ticket's file contract. A reader who follows either operative paragraph gets `07` as owner. PASS.

*Note (non-blocking):* `07`'s residual note still says "`06` currently contradicts itself" in slightly stronger terms than landed `06`'s current preamble (which already wraps the old sentence in SUPERSEDED). That is descriptive overstatement about an out-of-contract residual, not a live two-owner rule inside PRE-01's files. Not CHANGES REQUESTED.

---

### (4) Strike-quotations — spot-verify two of six (internal consistency) — **PASS**

Six full-quote strike sites present: S5 `FX-SRV-13` hedge; S6 `FX-DEF-01` Q-19 conditional; S6 carriers-only zone; S7 carriers-only zone; S9 carriers-only zone; §8 "pending V" paragraph. Spot-checked **S7** and **S6 zone** against the blockquotes' own clauses and ledger grants (no external pre-fold blob required for the internal-consistency test the red-team asks).

#### Spot A — S7 (DR-089 / DR-090)

**Quoted former zone (both halves):** Q-20 open → state machine that can implement any of three readings; runner policy + terminality recorded only after V rules. Q-21 open → maker-diversity floor alone; measured difference recorded unavailable, not approximated.

| Clause | DR | Does the DR rule what the clause claims? |
|---|---|---|
| "any of the three readings" / "recorded only after V rules" | **DR-089** WAIT drain; typed terminal state at completion; policy is ruled | **Yes** — both deferral limbs are dead; fold-over-activation-stream + typed terminal state replace them |
| Q-21 behavioural words (maker-diversity floor; unavailable not approximated) | **DR-090** rules **exactly those words** | **Yes** — strike correctly hits **status** (*with Q-21 open* stopgap), not the behaviour; words survive as permanent law |

**Judgment:** DR↔clause mapping is exact; the Q-21 status-vs-words distinction is the right audit move. PASS.

#### Spot B — S6 carriers-only zone (DR-083 / DR-085 + heading honesty)

**Quoted former zone:** Q-17 shadow mode until answered; empty tiering-map register table; Q-15 POLICY_BLOCKED for summarised predicates until answered.

| Clause | Treatment | Ledger match? |
|---|---|---|
| Q-17 "until answered … shadow mode" | Struck by **DR-085** — shadow mode **is** the ruling (tier-invariant), not a temporary posture | **Yes** (DR-085: tier-invariant with shadow mode; map empty until V fills) |
| Empty register table | **Not struck** — reclassified value-pending VG-02 | **Yes** — DR-085 keeps the empty table; contents are V's |
| Q-15 POLICY_BLOCKED until answered | Struck by **DR-083** — filing is the ruling's own requirement, not an interim gap-marker | **Yes** (DR-083: summarised predicate → POLICY_BLOCKED, loud, never silent skip) |
| DR-084 / DR-087 / DR-088 in strike heading | Explicitly **strike no clause of the quoted text** (they close remaining questions / remove ground for a new zone) | **Honest** — does not smuggle false clause-level strikes |

**Judgment:** internal consistency holds; partial-strike and non-strike limbs are recorded, not over-deleted. PASS.

*(Secondary glance, not full second pair: S9 DR-093 partial strike preserves "behave as correctness" + bundle outstanding-item; DR-094 kills "whichever way V rules"; §8 DR-088 kills pending-V in the direction that leaves the attestation standing — all match ledger.)*

---

### (5) Zero CONDITIONAL; ledger ids intact — **PASS**

| Check | Result |
|---|---|
| `CONDITIONAL` in `07` or `09` | **0** hits |
| DR-068…DR-102 present in **both** files | Scripted presence check — **no missing DR** |
| Concrete assignment inventory | Unchanged per §5.1 table and §4 limbs (FX-SRV-16 two limbs S9 owning; 13/17 roster placements) |

---

## Residual notes (non-blocking, rev 2)

1. **PRE-03 cleanup of `06` residual quote** — already directed and no-force; optional later polish if the historical quote still confuses skimmers.
2. **`07`'s "06 contradicts itself" wording** is slightly stronger than landed `06`'s SUPERSEDED wrap — descriptive only; operative rule is single-voiced.
3. Rev-1 residuals (Plan.md GPG-2 wording; S1→§3.3 A-07 cross-ref; TRACE-7 hedge chat) are **out of this rework's claimed touch set** and were not re-opened.

None rises to CHANGES REQUESTED.

---

## Independence attestation (rev 2)

- No Codex review file or Codex verdict body read.
- No `reviews/pre-01-codex*` content read.
- Ticket surface read through the worker's **READY FOR PEER REVIEW (rev 2)** handoff only for scope of delta; judgment targets = `07` / `09` (plus `06` as consistency context for ownership / FX-SRV-16).
- Ledger DR-068…DR-101 and the rev-2 MUST-fix delta are the authority for this re-review.

---

*End of pre-01-grok.md rev 2 — Grok peer lens, PROG-V3-R1 / PRE-01.*

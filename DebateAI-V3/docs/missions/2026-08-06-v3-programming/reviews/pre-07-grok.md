# PRE-07 Grok peer review — `citation-routes.md`

**Ticket:** `t_ddb54539` (PRE-07 · DR-084 ratification package: the eight typed citation-failure routes)  
**Lens:** Grok (DR-101 independent peer; Claude-authored ticket; maker-diversity diamond with Codex)  
**Verdict:** **APPROVED**  
**Date:** 2026-08-06  
**Artifact judged:** `docs/missions/2026-08-06-v3-programming/ratification/citation-routes.md` only (new, untracked; read directly; no git).  
**Not read:** any Codex verdict, any `reviews/pre-07-codex*` file, any ticket comments after the `READY FOR PEER REVIEW` marker.

**Comments read through:** `claude-worker` `READY FOR PEER REVIEW` (2026-08-06 23:07). Earlier: `HERMES AUTHORIZED NEXT` (claude, 22:51).

---

## Contract under review

Ticket DONE WHEN (body):

- Exactly eight named routes, each: name, triggering condition, what is recorded, what serves (typed, visible), and its `citation_route_record` carrier (02-data-model §11A.1)
- For any member that would surface to a reader as a typed state: draft the spec §12.3 amendment text for V (S-13; draft is V's to apply — do not edit the founding spec in this ticket)
- Show the complement property: every citation failure lands in exactly one route (no residue, no overlap) — DR-051 closed-enum discipline

Authority: **DR-084** (propose/ratify) · **DR-088** (hard-kill not shipped) · **DR-020 knob 7** (eight routes from day one) · **DR-051 / S-11…S-13** · founding §7.3 E-7/E-8/E-9, §7.5 E-13, §3.4 Q16, §3.8 Q40, §3.10 Q51, §12.3 · `02-data-model.md` §11A.1.

**Reviewer posture:** red-team the closure proof. Escape / double-land / wrong serve consequence = blocking. SP-4 and SP-5 are judgment calls the seat invites.

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. Ticket body + comments through `READY FOR PEER REVIEW` only.
3. Mission ledger **DR-084**, **DR-088**; founding ledger **DR-020 knob 7**, **DR-051**.
4. `requirements-spec.md` §7.3 (E-7, E-8, E-9), §7.1 (DR-008 amendments), §7.5 E-13, §3.4 Q16, §3.8 Q40, §3.10 Q51, §12.3 Homes 1–3 (22 condition marks, ending at `MISSING-NUMBER`).
5. `02-data-model.md` §11A.1 (`citation_route_record` carrier; membership unminted; no hard-kill table).
6. The work: `ratification/citation-routes.md` in full.

---

## File-contract / hygiene checks

| Check | Result |
|---|---|
| Banner `PROPOSED-FOR-RATIFICATION` | **PASS** — opens the file; V rules at VG-02; no mint claimed |
| Single new file | **PASS** — only this ratification artifact is the PRE-07 work product |
| Founding spec not edited by this ticket | **PASS** — `UNVERIFIED-CITATION` / `CITATION-WITHDRAWN` count **0** in `requirements-spec.md`; Home 2 still ends at row **22** `MISSING-NUMBER`. Working-tree diff on the founding spec is **A-01** terminal-route row 5 only (pre-existing; ticket note confirms not this worker's) |
| Two marks are V's-to-apply drafts | **PASS** — §7 paste-ready rows + edit note; §7.4 flags AC-65 / FX-LG-04 / 02 §13 as consequential follow-through, **not applied** |
| No invented numbers (AC-76 / DR-039) | **PASS** — membership count **eight** is DR-020 knob 7's own; 22→24 is the existing Home-2 count plus the two drafts; R8 explicitly forbids a similarity scalar |
| DR-088 hard-kill machinery | **PASS** — see § below |

---

## (4) DR-088 held

Grep of the artifact for kill / gate / register machinery:

| Pattern | Occurrences | Reading |
|---|---|---|
| `is_hard_killed` / `kill_reason` | only in **forbidden-and-absent** lists (§6, §8) | carrier deliberately omitted |
| Global kill predicate | described as **not written** | no predicate text |
| Register key enabling a kill | **none proposed**; §10: "Register values. None are proposed" | clean |
| R8 as "primary kill candidate" | narrative note only; **"not a kill today"** | permitted foreshadowing, not a gate |
| Serve consequences | Q51 block, E-7 CHECK, E-13 refuse-or-state — all pre-existing pack rules | not the deferred hard-kill |

**Verdict:** DR-088 holds. Routes ship; gate does not. No shipped-dark kill column, key, or predicate.

---

## (5) Two proposed marks vs the 22-member closed enum

| Claim | Evidence |
|---|---|
| Home 2 today has **22** marks | Spec §12.3 rows 1–22; last is `MISSING-NUMBER` |
| Draft adds rows **23** `UNVERIFIED-CITATION` (R6) and **24** `CITATION-WITHDRAWN` (R7+R8) | Artifact §7.1–§7.2 only |
| Eight routes themselves stay out of §12.3 | Explicit: evidence-subsystem enum per 02 §13 / §11A.1 |
| Five routes need no mint | §7.3 maps R1–R5 to existing surfaces (absence, Q51/DEFECT path, E-7 depth, E-13 statement) |
| Nothing pre-applied | founding spec grep empty for both draft mark names |

**PASS.** S-13 intact. Draft is V's paste; this ticket does not mint.

---

## (6) Banner · single file · no invented numbers

All three hold (table above). The only count the package mints is **eight**, already ruled. Consequence counts (three serve-blocking/refusing, five serve-labelled) are roll-ups of the eight, not new thresholds.

---

## (1) Six adversarial citation-failure scenarios — ladder traces

Method: for each scenario, force a citation attempt under D1, walk rungs 1→6 under first-failure, and ask whether the attempt **escapes all eight**, **lands in two**, or **lands in a route whose serve consequence is wrong**.

### ADV-1 · Archived-then-superseded chain

**Setup:** Source S archived at full depth as version V1 at retrieval time T1. Live locator later presents V2, then V3. Citation still names V1/T1 and a span extracted from V1.

| Rung | Observation | Branch |
|---:|---|---|
| 1 | Complete `source_record` with locator/version/time triple | descend |
| 2 | Access depth `OPENED_FULL` (was opened; reopen reaches *a* document) | descend |
| 3 | Observed live version ≠ archived V1 (or retrieval outside `as_of` envelope) | **R5 `SOURCE_SUPERSEDED`** |

Later rungs unreachable. Single route.

**Serve:** E-13 refuse-or-state (artifact's reuse of the existing freshness surface). Not R8 (engine misquote) — rung-3-before-exactness prevents accusing the engine when the **world** moved.  

**Double-route risk (dead):** if reopen fails entirely, depth is `ACCESS_BLOCKED` → **R3** at rung 2, never R5. Correct priority: unreachable before superseded.

**Result:** lands in exactly one route; consequence is the pack's existing freshness limb, not a silent drop. **No break.**

---

### ADV-2 · Span byte-identical in a SUPERSEDED version only

**Setup:** Quoted characters match archived V1 **exactly**. Live artifact is V2; the span is gone or altered there. Engine is honest against the archive, dishonest if judged only against live text without version check.

| Rung | Observation | Branch |
|---:|---|---|
| 1–2 | Complete record, `OPENED_FULL` | descend |
| 3 | Live version ≠ archived | **R5** — stop |

Does **not** reach R7/R8. Without rung 3, live compare would yield R7 or R8 and **wrongly allege engine fabrication**.

**Serve-consequence press:** R5 reuses E-13's answer-level refuse-or-state vocabulary for a **per-citation** version-identity failure. E-13's ruled trigger is newest-source age on a fast/slow question, not "this URL's etag moved." That is the softest authority link in the package (see Soft residual SR-1). It is **not** a wrong *type* of loudness (still refuse-or-state, never silent, never R8-as-misquote), and first-failure still partitions cleanly.

**Result:** single correct route under the ladder; no escape; no double-land. **No closure break.** Soft residual noted, not blocking.

---

### ADV-3 · Preview-depth sources feeding absence rows

**Setup A — mixed store:** Search Q returned zero for claim-support S₁ → typed `absence_row`. Unrelated source U exists at `PREVIEW_ONLY`. Citation names U as support for a number.

| Rung | Observation | Branch |
|---:|---|---|
| 1 | Citation resolves to source U (complete record) | descend (absence for S₁ is irrelevant to this resolution) |
| 2 | `PREVIEW_ONLY` | **R4** |

Limb (b) if a number/quote was taken: refused at `source_record` CHECK; nothing enters the fact bundle. Limb (a) if neither: serves at preview depth, visibly.

**Setup B — phantom URL after a productive search:** Hits exist (so no zero-result absence for that query), but the citation names a URL never harvested.

| Rung | Observation | Branch |
|---:|---|---|
| 1 | No `source_record`, no covering absence | **R2 `CITATION_UNBACKED`** |

R1 and R4 cannot co-fire on one attempt: R1 requires *no* source record; R4 requires a source at preview depth. Absence rows do not "feed" a second route onto a resolved source.

**Result:** exclusive landings. **No break.**

---

### ADV-4 · Instrument-certified probe with dead locator

**Setup:** Q22/Q23 produced `probe_capture` + `instrument_certification`. Claim kind is **ran**. At Q40-style reopen the instrument/locator is dead.

**Path if the probe is modeled as (or projected into) a `source_record` with access depth:**

| Rung | Observation | Branch |
|---:|---|---|
| 1 | Complete record | descend |
| 2 | `ACCESS_BLOCKED` on reopen | **R3 `SOURCE_UNREACHABLE`** |

Serve: citation carrying blocked depth; `blocked_not_lazy`; no number/quote invented. Certification does not override dead access — correct (certification is instrument fitness, not liveness).

**Path if the probe lives only in `probe_capture` with no `source_record`:** rung 1's three-way split is phrased over `source_record` / absence. A pure-probe binding is then either (i) still a citation attempt and would currently read as **R2** (harsh: serve-block on a real measurement), or (ii) out of D1 and handled by Q51's locator gate alone without a `citation_route_record` row.

The package's producers, Q16/Q40 vocabulary, and `source_ref → source_record` carrier are **harvest-document native**. E-8's "citation failures" and Q16's three-valued access depth are the founding home of this enum. Probe/ran claims already have Q51's locator gate and the probe tables.

**Result under the harvest-native reading the ladder is built for:** dead locator → R3. **No escape of a document-citation failure.** Soft residual SR-2: fold-in ticket should state whether ran-claims mint `citation_route_record` rows or stay on the Q51-only path — documentation, not a residue hole in the eight for E-8's domain. **No blocking closure break.**

---

### ADV-5 · Mechanical-repair query amendment mid-run (DR-008)

**Setup:** Frozen query set amended mid-run with type **mechanical repair** (typo / alias). Full confirmation power retained (E-2). Post-amendment retrieval finds source S; citation binds a span; all archive and exact-compare succeed.

| Ladder | Result |
|---|---|
| D3 failure? | **No** — attempt succeeds under D2 → `VERIFIED` / not a member |
| Route row? | `outcome=VERIFIED`, `route` null per §6 CHECK |
| Parallel honesty | Condition mark **`AMENDED-SEARCH`** (#21) already exists for the amendment itself — outside this enum by design (§5.4 boundary pattern) |

**Hostile variant:** pre-amendment zero-result wrote an `absence_row`; post-repair finds S. Citation of S resolves to a complete source → not R1. Residual absence is a separate ledger fact, not a second route on the same attempt.

Semantic re-aim used as confirmation is a **DR-008** violation (off-plan / exploration-only), not a ninth citation-failure species — different subsystem, already typed.

**Result:** no escape, no double-land, no wrong route. **No break.**

---

### ADV-6 · Non-quoting citation of a fully-opened source

**Setup:** Source opened at full depth, current, medium supports text, but the citation is **source-level only** — no span extracted (ordinary "see Smith (2020)" support).

| Rung | Observation | Branch |
|---:|---|---|
| 1–3 | Complete, `OPENED_FULL`, current | descend |
| 4 | No character-level comparison **result** exists (`NO_SPAN_CITED`) | **R6 `EXACT_COMPARE_UNAVAILABLE`** |

Serve: citation + excerpt path labelled **not character-verified**; draft mark `UNVERIFIED-CITATION` (V to apply). Not R7/R8 (no compare ran). Not R2 (source is real and archived). Not VERIFIED under D2 (D2 requires character-exact span match).

**Result:** exactly one route; consequence matches the shortfall (shown, not checked). **No closure break.** SP-5 judgment below.

---

### Extra stress (not required by ticket, recorded)

| Case | Landing | Note |
|---|---|---|
| Compare `EXECUTION_FAILED` after engine crash | R6 | Must not be R8 (no result ⇒ no mismatch allegation) |
| Span present, whitespace/normalization differs | R8 | AC-92 byte-identity; no similarity scalar |
| Version string same, content silently replaced | passes rung 3 on version field; R7/R8 catches content | content is the backstop |
| Soft-match "close enough" treated as success | outside enum — false VERIFIED is an implementation bug against D2/AC-92, not residue | |
| Budget skip of compare | unreachable — protected core (DR-021 knob 9 + DR-052); violation ≠ ninth route | |

**Closure claim after six required attacks + extras:** every constructed **citation failure** hit exactly one leaf; none escaped; none double-routed; no serve consequence inverted a known pack rule into silence or a false misquote. **Complement property holds under the ladder.**

---

## (2) SP-4 · R6 three-cause merge — does it ever serve a MISLEADING label?

Seat's least-certain call: `MEDIUM_UNSUPPORTED` ∪ `NO_SPAN_CITED` ∪ `EXECUTION_FAILED` → one route → one reader mark `UNVERIFIED-CITATION`.

| Cause | Reader-facing truth of "opened, but nothing compared character-for-character" | Misleading? |
|---|---|---|
| `MEDIUM_UNSUPPORTED` | Source cannot support exact text compare | **No** — accurate |
| `NO_SPAN_CITED` | Nothing was selected to compare | **No** — accurate |
| `EXECUTION_FAILED` | Compare was owed and did not complete | **No** — "not verified" is true; alleging `SPAN_MISMATCH` would be the **lie** |

**Press result:** merging source-side limits with engine-side failure does **not** serve a misleading **label**. The label is the shared observable (no successful character check). Cause is recorded on the row (`compare_unavailable_reason` + ledger ref); S-19/digest can be loud internally without minting a fourth reader mark.

Withdrawing the span on `EXECUTION_FAILED` would over-claim (you do not know it mismatches). Serve-blocking would over-punish scans and source-level cites. Same loudness class is the right individuation rule the seat applies at SP-3 for R2's two limbs.

**Judgment: accept the merge. Not blocking.**

---

## (3) SP-5 · Every ordinary non-quoting citation wears `UNVERIFIED-CITATION` — honest or diluting noise?

**Honest labeling.** Under D2 and E-8, success is a character-exact reading of a span the engine actually opened. A source-level cite that pins no sentence was not checked character-for-character. Marking it otherwise would recreate the silent pass R6 exists to kill (Q36 at citation scale).

**Dilution risk is real but is a composition discipline problem, not a false mark.** If the serve surface routinely emits "according to X" without spans, readers may habituate to the badge. The pack's own law pushes the other way: E-8 obliges span extraction; Q16's enforcement includes extract spans; no-span is framed as the exception. The fix for dilution is **extract spans as the norm**, not drop the label so unchecked cites look checked.

**Judgment: honest. Dilution is a product risk for V at ratification, not a closure or wrong-consequence defect. Not blocking.**

---

## Ticket completeness vs DONE WHEN

| Requirement | Status |
|---|---|
| Exactly eight named routes with trigger / recorded / serves / loudness | **PASS** — R1–R8 §4 |
| Carrier fields for `citation_route_record` | **PASS** — §6 proposal (fold-in later; 02 §11A.1 still mints no members) |
| §12.3 amendment draft for reader-facing members only | **PASS** — two Home-2 drafts; five routes need no mint |
| Complement / closure proof (totality, disjointness, reachability, no disguised other) | **PASS** — §5; red-team did not break it |
| DR-088 / no hard-kill | **PASS** |
| No founding-spec edit / no pre-mint | **PASS** |
| Loud failure, no generic "other" | **PASS** — R2 positive definition, first on the ladder |
| Boundary re-homes (not-searched, reasoning-only, E-5, E-10, S-9e; budget skip unreachable) | **PASS** — §5.4 |

Scrutiny points SP-1…SP-10 are correctly offered to V/reviewers; SP-8 and SP-10 are out-of-file-contract findings raised not fixed — appropriate.

---

## Soft residuals (non-blocking; not CHANGES REQUESTED)

| ID | Point | Why not blocking |
|---|---|---|
| **SR-1** | R5 `VERSION_DRIFT` reuses E-13's refuse-or-state surface; E-13's ruled trigger is newest-source age, not per-URL version identity | Partition and anti-misquote ordering still correct; no silence; no invented kill; V may want a sharper local phrasing at VG-02 without a new mark |
| **SR-2** | Ran/probe claims vs `source_ref → source_record` — document whether they write `citation_route_record` or stay Q51-only | Outside E-8 harvest core the ladder proves; fold-in / carrier ticket |
| **SR-3** | SP-8 access-depth missing from 02 §13 inventory; SP-10 `DEFECT` Says-column vs S-7 Q51 branch | Seat already raised; out of PRE-07 file contract |

---

## Verdict

The DR-084 package specifies eight routes, proves complement under a fixed first-failure ladder, drafts exactly two §12.3 marks for V without applying them, holds DR-088, invents no numbers, and survives six adversarial traces plus SP-4/SP-5 pressure without a blocking escape, double-land, or inverted serve consequence.

**GROK REVIEW: APPROVED**

---

# PRE-07 Grok peer review — rev 2 DELTA CHECK

**Ticket:** `t_ddb54539` (PRE-07 · DR-084)  
**Lens:** Grok (DR-101 independent peer)  
**Verdict:** **APPROVED**  
**Date:** 2026-08-06  
**Scope:** rev-2 delta only — re-test limbs that rev-1 traces under-specified, plus two new attacks on the repaired seams.  
**Artifact judged:** `docs/missions/2026-08-06-v3-programming/ratification/citation-routes.md` rev 2 (banner, §3.1, §3.2, R5–R8, §7.2, §9.1–§9.2).  
**Not read:** any Codex verdict body, any `reviews/pre-07-codex*` file (ticket handoff names the four findings for orientation only; closure re-tested from the artifact + founding pack).

**Comments read through:** `claude-worker` `READY FOR PEER REVIEW (rev 2)` (2026-08-06 23:30).

---

## What rev 1 under-specified (self-audit)

| Prior trace | Defect in the *trace*, not the package's intent | What rev 2 put under the leaf |
|---|---|---|
| **ADV-3 / ADV-5** | Walked the closure table / narrative partition; did not force the **leaf trigger formulas** of R1/R2 | §3.1 predicates + rewritten R1/R2 triggers |
| **ADV-4** | Assumed reopen state was "carried" without naming **which obliged field** supplies it | §3.2 attempt depth derived from A-2 action + typed outcome via `ledger_entry_ref` |
| **SR-1** | Soft residual on R5 ↔ E-13 authority link | R5 limb-split; E-13 only on freshness; drift = disclosure + rider **R5-a** |

---

## (1) ADV-3 / ADV-5 re-run against **leaf triggers**

Method: evaluate R1 and R2 from their **rev-2 trigger formulas only** (`¬P_ref ∧ P_abs` and `(P_ref ∧ ¬P_rec) ∨ (¬P_ref ∧ ¬P_abs)`), then continue the ladder only if both reject. Truth table §3.1 is the oracle; leaves must agree.

### ADV-3 · Preview-depth sources feeding absence rows

**Setup A — mixed store.** Absence row for support search S₁; citation names unrelated source U at `PREVIEW_ONLY`.

| Predicate | Value |
|---|---|
| P_ref | **T** (names U) |
| P_rec | **T** (complete record for U) |
| P_abs | **T** (absence for S₁ exists) — **not consulted** |

| Leaf | Formula result |
|---|---|
| R1 | needs `¬P_ref` → **false** |
| R2 | needs `(T ∧ ¬T)` or `(¬T ∧ ¬…)` → **false** |

Descend. Rung 2: attempt depth `PREVIEW_ONLY` → **R4**. Absence cannot attach a second route. **Lands where §3.1 says (descend, then R4).** No double-land.

**Setup B — phantom URL.** Citation names a URL with no `source_record` / no triple.

| Predicate | Value |
|---|---|
| P_ref | **T** |
| P_rec | **F** |
| P_abs | any — not consulted |

R2 leaf: `P_ref ∧ ¬P_rec` → **R2**. R1 cannot fire. **Matches table row (T, F, ·).**

**Homeless cell (the actual rev-1 hole):** incomplete record **plus** covering absence — `P_ref=T`, `P_rec=F`, `P_abs=T`.

| Leaf | Result |
|---|---|
| R1 | false (`P_ref`) |
| R2 | **true** (`P_ref ∧ ¬P_rec`) |

No homelessness. Implementer reading only the leaf text reaches R2. **No break.**

### ADV-5 · Mechanical-repair amendment mid-run (hostile residual absence)

Post-repair citation of found source S; pre-amendment `absence_row` still in the store.

| Predicate | Value |
|---|---|
| P_ref | **T** |
| P_rec | **T** |
| P_abs | **T** — **not consulted** |

R1/R2 leaves both false → descend. Full open + current + exact compare → **VERIFIED** (`outcome=VERIFIED`, `route` null). Residual absence remains a separate ledger fact. **Leaf path agrees with the table.** No break.

---

## (2) ADV-4 re-run — ledger-derived attempt depth

**Question:** does the derivation chain (A-2 action vocabulary + typed outcome → depth in force) exist in the pack's obliged records, or is it package invention?

| Link | Pack home | Present? |
|---|---|---|
| Closed action kinds include **locator resolution**, **access depth**, **rechecks (Q40)**, **exact quote comparison (Q16)** | **A-2** (`requirements-spec.md` §8.1) — *no member without a row that already obliges the record* | **Yes** |
| Typed outcomes on executed actions: `OK` / `FAILED` / `BLOCKED` / `TIMED_OUT` / `REFUSED` / `SKIPPED_BY_BUDGET` | A-2's surrounding ledger law; **DR-027** / **AC-44**; A-5 treats `BLOCKED`/`FAILED`/`SKIPPED_BY_BUDGET` as first-class | **Yes** |
| Three-valued access depth | **E-7** | **Yes** |
| Attempt depth derived, not stored | **AC-88**; carrier already had `ledger_entry_ref` (§6) | **Yes** — no second home (AC-85) |

**Re-trace (document-citation / Q40 reopen):**

| Attempt | Access-depth / recheck entry | Derived depth | Landing |
|---|---|---|---|
| A1 (Q16 harvest) | outcome `OK`, value `OPENED_FULL`; compare matches | `OPENED_FULL` | **VERIFIED** |
| A2 (Q40 reopen, 404) | outcome `FAILED` (or `BLOCKED` / `TIMED_OUT` / `REFUSED`) | **`ACCESS_BLOCKED`** | rung 2 → **R3** |

Two attempts, two `citation_route_record` rows (02 §11A.1: one row per attempt). Not a double-land on one unit. Harvest `OPENED_FULL` no longer lets A2 skip rung 2.

**Probe/ran soft residual (prior SR-2):** still outside the harvest-native proof; now **SP-11** — documentation for fold-in, not a residue hole in E-8's domain. **No blocking break on the ADV-4 limb.**

---

## (3) Two new adversarial cases on repaired seams

### ADV-7 · Absence row + named source with **partial** record

**Setup:** Claim C has a typed `absence_row` (search returned zero for one support query). Separately, a citation on C **names** source U, which has a `source_record` but **missing** archived `{locator, version, retrieval_time}` (partial / incomplete triple).

| Predicate | Value |
|---|---|
| P_ref | **T** |
| P_rec | **F** (incomplete triple) |
| P_abs | **T** |

| Leaf | Result |
|---|---|
| R1 `¬P_ref ∧ P_abs` | **false** |
| R2 `(P_ref ∧ ¬P_rec) ∨ …` | **true** → **R2 `CITATION_UNBACKED`** |

Serve: Q51 locator/provenance gate blocks serving. Cannot be re-read as R1 (*"searched and found nothing"*) — the run did retrieve something incomplete; the honest finding is *the store does not back the citation*. Cannot double with R3/R4 (no complete record to carry attempt depth). **Exactly one route; matches §3.1.** No break.

### ADV-8 · `COMPARE_EXECUTION_NOT_OK` after a **later-added** ledger outcome member

**Setup:** Source fully opened, current, medium supports text, span cited. Exact-quote-comparison action **exists**. Typed outcome is a non-`OK` member that rev-1's three-cause list could not name (e.g. `BLOCKED` / `REFUSED` today, or any **future** non-`OK` membership the ledger grows).

| Rung | Observation | Branch |
|---:|---|---|
| 1–3 | complete, attempt `OPENED_FULL`, current | descend |
| 4 | no successful character-level **result** | **R6** |
| Reason split | owed → supportable → executed → outcome ≠ `OK` | **④ `COMPARE_EXECUTION_NOT_OK`** |

Reason ④ **does not restate** the ledger enum: outcome is read through `ledger_entry_ref` (AC-85), so ④'s domain **is** the ledger's non-`OK` set. A later-added non-`OK` member still lands in ④ without a citation-route amendment. Does **not** reach R7/R8 (those require a completed compare that typed `not-found` / `deviates`). Does **not** escape. Mark remains `UNVERIFIED-CITATION` (shared observable: no successful character check) — SP-4 still open via rider **R6-a**, not a silent pass.

**Result:** total under ordered reason split; immune to ledger-vocabulary growth by construction. **No break.**

---

## (4) Renamed mark · no unratified remedy · rows 23–24 still V's

| Check | Evidence | Result |
|---|---|---|
| Draft name | §7.2 `CITATION-RECHECK-FAILED` (row **24**) | **PASS** |
| Draft *Says* | *"a cited span was re-checked against its source and failed — absent, or deviating character-for-character; the span supports nothing"* | **PASS** — Q40 failure + AC-90 zero only |
| Unratified remedy absent from *Says* | No "withdrawn"; no "rest of the answer stands" in the draft row | **PASS** |
| Withdrawal behaviour | Explicitly **not claimed** on R7/R8; rider **R7/R8-a** only | **PASS** |
| `CITATION-WITHDRAWN` | Changelog / rename rationale only — not the live draft | **PASS** |
| Founding §12.3 | Still ends at row **22** `MISSING-NUMBER`; zero hits for either draft mark name in `requirements-spec.md` | **PASS** — V's-to-apply; S-13 intact |
| Consequential counts | §7.4 flags AC-65 / FX-LG-04 / 02 §13 (22→24); not applied | **PASS** |

---

## (5) Soft residuals after the limb split

| ID | Rev-1 status | Rev-2 status |
|---|---|---|
| **SR-1** (R5 / E-13) | Soft residual: package reused E-13 refuse-or-state for per-URL version drift | **RESOLVED as authority hygiene.** `OUTSIDE_FRESHNESS_ENVELOPE` keeps E-13 verbatim (it *is* newest-source age vs `as_of`). `VERSION_DRIFT` is **disclosure only** (both versions served); E-13 is **not** cited for drift. Any louder drift consequence is rider **R5-a** for V — not asserted, not a closure hole. |
| **SR-2** (ran/probe vs `citation_route_record`) | Soft | **Still soft** — carried as **SP-11**; fold-in documentation, not E-8 residue |
| **SR-3** (SP-8 / SP-10) | Soft, out of contract | **Unchanged** — raised not fixed; correct for this ticket |

No new soft residual opened by the repairs. R6 four-cause merge remains SP-4 / rider **R6-a** (judgment call, not a totality defect).

---

## Hygiene re-check (rev 2, skim)

| Check | Result |
|---|---|
| Eight-route count / names | **Unchanged** |
| DR-088 | **Holds** — no kill predicate, register key, or `is_hard_killed` |
| Invented numbers | **None** — eight from DR-020 knob 7; 22→24 is draft arithmetic only |
| Riders R5-a / R6-a / R7/R8-a | Change post-fire reader behaviour, not which route fires — **do not break complement** |
| File contract | Single ratification file; founding mint still V's |

---

## Delta verdict

Rev 2 repairs the real holes beneath rev-1's weak limbs: leaf triggers now match the rung-1 truth table (including the incomplete-record + absence cell); attempt depth is derived from pack-obliged A-2 actions and typed outcomes; R6's reason domain is total by reference to the ledger; R5/R7/R8 claim only ruled consequences; the renamed mark carries no smuggled remedy. Re-tests of ADV-3/4/5 and new ADV-7/ADV-8 find no escape, double-land, or inverted serve consequence. SR-1 is closed by the limb split; SR-2/SR-3 remain soft and out of blocking scope.

**GROK REVIEW (rev 2): APPROVED**

---

# PRE-07 Grok peer review — rev 3 DELTA CHECK

**Ticket:** `t_ddb54539` (PRE-07 · DR-084)  
**Lens:** Grok (DR-101 independent peer)  
**Verdict:** **APPROVED**  
**Date:** 2026-08-06  
**Scope:** rev-3 delta only — confirm rev-2 approval holds after two residual repairs (rung 2 rebuilt on recorded `attempt_access_depth` + CARRIER-1; R6 fifth reason `COMPARE_RESULT_MISSING`).  
**Artifact judged:** `docs/missions/2026-08-06-v3-programming/ratification/citation-routes.md` rev 3 (banner, §3.2, R3/R4/R6, §5.1, §5.3, §6, §9.1–§9.2, SP-4/SP-8).  
**Not read:** any Codex verdict body, any `reviews/pre-07-codex*` file (ticket handoff names residual themes for orientation only; re-test from artifact + founding pack only).

**Comments read through:** `claude-worker` `READY FOR PEER REVIEW (rev 3)` (2026-08-06 23:46).

---

## Authority re-checked for this delta (not from the other lens)

| Source | What was verified |
|---|---|
| **E-7** (`requirements-spec.md` §7.3) | Access depth is a **three-valued required record** — `OPENED_FULL` / `PREVIEW_ONLY` / `ACCESS_BLOCKED` — not an adjective; preview-only may never supply a number or quote |
| **Q16** | Enforcement: archive triple; **record opened / preview-only / blocked**; extract spans; exact compare where available |
| **Q40** | *"reopens the locators"*; typed `verified` / `deviates` / `not-found` per checked item |
| **02 §11A.1** | `source_record` carries the three-valued depth as **required record** (per source) + preview `CHECK`; `citation_route_record` = one row per citation attempt, membership unminted |
| **02 §13** | Access-depth inventory row names carrier **`evidence.source_record`** (per source) |
| **02 §6.1** | `ledger_entry` columns listed; **no typed action-result payload**; `action_scope` deliberately **not** a row column (property of the kind) |
| **02 §6.2** | `raw_artifact` is model-call shaped (raw text / parse / assessment), not an E-7 depth |

---

## (1) CARRIER-1 — placement argument or invented column?

### What §11A.1 and E-7 actually say

- **E-7** obliges the **three-valued required record**. It does not name the storage table.
- **§11A.1** places that record on **`source_record.access_depth`** — grain: **per source**.
- **§13** inventories the same enum with the same per-source carrier.
- **Q40** is a second act: it **reopens** locators. A source readable at harvest and a teaser on reopen are two openings that **must be allowed to disagree**.

### Placement vs invention

| Claim | Reading | Result |
|---|---|---|
| New vocabulary? | Domain is **exactly** E-7's three values | **No mint** |
| New obligation? | E-7 already requires the depth as a required record of access; Q40 is a second opening of the same locators | **No new rule of substance** — the gap is **where one opening's value is written** |
| Invented column on a sealed table? | `citation_route_record` is declared in §11A.1 with **no columns**; §6 of this package is the field proposal for fold-in (SP-9) | **Within contract** — same surface that already proposed `route`, `ledger_entry_ref`, etc. |
| Mirror of pack voice? | §6.1 keeps `action_scope` **off** the row because it is a property of the **kind** (two rows must not disagree). Access depth is the **mirror**: a property of the **opening**; held only per source, two openings **cannot** disagree | **Sound use of AC-85 reasoning**, not free invention |

**Judgment:** **placement argument, not an invented obligation.** CARRIER-1 is correctly typed as a **carrier rider** (fold-in with SP-8/SP-9), not as a behavioural rider that changes which route fires *after* a row exists. Rung-2 totality for the `OK`-reopen-at-changed-depth cell **depends** on the fold-in writing the column — the package says so explicitly and does not smuggle a derivation from a non-existent ledger payload (rev 2's withdrawn claim).

### Does `NOT NULL` + write-time failure actually prevent silent `OPENED_FULL` inheritance?

| Path | What happens under rev 3 |
|---|---|
| Reopen 404 / non-`OK` | Ruled today: typed outcome non-`OK` ⇒ `attempt_access_depth = ACCESS_BLOCKED` (`CHECK`) → **R3**. No inheritance. |
| Harvest attempt | Ruled today: value `CHECK`-equal to `source_record` → one fact, two readers (AC-85). |
| Reopen `OK` at teaser depth, **depth written** | `attempt_access_depth = PREVIEW_ONLY` → **R4**. Cannot descend past rung 2 on harvest `OPENED_FULL`. |
| Reopen `OK` at changed depth, **depth omitted** | Column is **`NOT NULL`** → **write-time failure** of the `citation_route_record` row. The attempt does **not** land a route by silently reading harvest `OPENED_FULL`. |

**What `NOT NULL` does *not* catch:** an implementer who **writes the wrong non-null value** (`OPENED_FULL` when the reopen was a teaser). That is a lying write, not silent null-inheritance — outside the anti-inheritance claim the package makes, and no CHECK can bind reopen depth to harvest `source_record` without recreating the contradiction CARRIER-1 exists to allow.

**Verdict on (1):** the silent-inheritance escape Codex's teaser-reopen case named is **closed** under recorded + `NOT NULL` discipline. **No blocking finding.** Soft residual: closure for the third case **rides the fold-in** of CARRIER-1 (honestly declared; same class as SP-9).

---

## (2) Fifth reason · four-boolean leaf · residue bucket test

### Totality structure

Ordered questions (R6 reason domain):

| # | Question | Leaf when answer is no / shortfall |
|---:|---|---|
| 1 | Comparison **owed**? | ① `NO_SPAN_CITED` |
| 2 | Medium **supportable**? | ② `MEDIUM_UNSUPPORTED` |
| 3 | **Executed** (entry exists)? | ③ `COMPARE_NOT_EXECUTED` |
| 4 | Outcome **`OK`**? | ④ `COMPARE_EXECUTION_NOT_OK` |
| 5 | Result **persisted**? | ⑤ `COMPARE_RESULT_MISSING` = `owed ∧ supportable ∧ executed ∧ OK ∧ ¬result` |

⑤ is reached **only** when rung 4's own precondition still holds (*no comparison result exists for this citation*) **and** the four prior tests all pass. That is a **positive conjunction**, not "everything else we could not name." Same structural test §5.4 applies to R2.

Rejecting the "impossible under DR-027" shortcut is correct: §6.1/S-19 record-before-math targets **model judgements**; a character compare is a **machine** action; P4 does not force atomic ledger+result write. Naming the cell is cheaper and more honest than inventing an atomicity invariant.

### Adversarial case: compare executed `OK`, result row present but for the **wrong span**

**Setup:** Source `OPENED_FULL`, current, medium supports text. Citation binds span **Sₐ**. Ledger shows exact-quote-comparison outcome `OK`. A comparison-result row exists but is keyed to span **Sᵦ** ≠ Sₐ.

| Reading of "result for **this citation**" (R6 trigger / rung 4) | Landing |
|---|---|
| Strict (join on `evidence_item_ref` / span identity) — **correct under D1** | No result for Sₐ. If the `OK` entry is itself for Sₐ → **R6 ⑤**. If the only entry is for Sᵦ and Sₐ has none → **R6 ③**. Never R7/R8 (those require a result **for this citation**). Never VERIFIED. |
| Loose join (source-only) | Could false-`VERIFIED` or false-R8 — **implementation bug against "for this citation"**, not an open leaf in the enum |

⑤ does **not** become a residue bucket under this case: the wrong-span fact is either "no execution for this span" (③) or "OK execution with no result attached to this span" (⑤). Both are named; the completeness audit (not this enum) chases cross-link defects. **No escape. No double-land. No silent pass.**

**SP-4 note:** pressure grew (three engine-side leaves now). Seat keeps the merge open via **R6-a** and still prices a split at **nine** routes. Judgment call, not a totality defect — same posture as rev 1/2. Minor editorial lag: the R6 "merge stays V's" cell still says "Reasons ①–④" while SP-4 correctly says five — non-blocking prose drift.

**Verdict on (2):** **PASS.** Total without becoming a residue bucket.

---

## (3) Prior adversarial traces under rebuilt rung 2

Method: re-walk each attempt with **`attempt_access_depth` recorded, `NOT NULL`**, three cases as in §3.2.

| Trace | Rung-2 observation under rev 3 | Landing | Change vs rev 2? |
|---|---|---|---|
| **ADV-1** archived-then-superseded | harvest / reopen `OPENED_FULL` | descend → **R5** | same |
| **ADV-2** span exact only in superseded version | `OPENED_FULL` | **R5** before exactness | same (anti-misquote order held) |
| **ADV-3A** absence + unrelated preview source | `PREVIEW_ONLY` (harvest or attempt) | **R4** | same |
| **ADV-3B** phantom URL | never reaches rung 2 (`P_ref ∧ ¬P_rec` → **R2**) | **R2** | same |
| **ADV-4** dead locator on Q40 reopen | non-`OK` outcome ⇒ `ACCESS_BLOCKED` (`CHECK`) | **R3** | **stronger**: value is recorded, not "derived" from a missing payload |
| **ADV-5** mechanical-repair success | `OPENED_FULL` + current + exact match | **VERIFIED** | same |
| **ADV-6** source-level no-span cite | `OPENED_FULL` | **R6 ①** | same |
| **ADV-7** absence + partial named record | R2 at rung 1 | **R2** | same |
| **ADV-8** compare non-`OK` outcome | `OPENED_FULL` → R6 | **R6 ④** | same; ⑤ does not steal this cell |
| **Teaser reopen** (new stress for this delta) | reopen `OK` at teaser → write `PREVIEW_ONLY` (CARRIER-1) | **R4** | **fixed** (rev 2 would have inherited harvest `OPENED_FULL` and descended) |

**Result:** all six original traces + both rev-2 constructions still land in exactly one correct leaf; the residual teaser-reopen escape is closed. **No break.**

---

## (4) Eight routes · names · marks · DR-088

| Check | Evidence | Result |
|---|---|---|
| Count | R1–R8; roll-up table; "enum is still eight" | **PASS** |
| Route names | `NO_SOURCE_FOUND`, `CITATION_UNBACKED`, `SOURCE_UNREACHABLE`, `PREVIEW_DEPTH_ONLY`, `SOURCE_SUPERSEDED`, `EXACT_COMPARE_UNAVAILABLE`, `SPAN_NOT_FOUND`, `SPAN_MISMATCH` | **Unchanged** |
| Mark names | §7.1 `UNVERIFIED-CITATION`; §7.2 `CITATION-RECHECK-FAILED` | **Unchanged** from rev 2 |
| Founding mint | zero hits for either draft mark in `requirements-spec.md`; Home 2 still ends at 22 | **S-13 held** |
| Reasons ≠ routes | five `compare_unavailable_reason` members, still eight routes | **PASS** |
| DR-088 | `is_hard_killed` / `kill_reason` only in forbidden lists; no kill predicate; no register key; R8 "primary kill candidate" remains narrative foreshadowing | **Holds** |

---

## Soft residuals after rev 3 (non-blocking)

| ID | Point | Why not blocking |
|---|---|---|
| **SR-2 / SP-11** | ran/probe vs `citation_route_record` | unchanged; documentation for fold-in |
| **SR-3** | SP-8 / SP-10 | SP-8 now correctly paired with CARRIER-1 as one gap (vocabulary inventory + placement grain); still out of PRE-07 apply scope |
| **SR-4** *(new, soft)* | Rung-2 totality for `OK` reopen-at-changed-depth **depends on CARRIER-1 fold-in** | Declared; fail-loud via `NOT NULL` until applied; no silent `OPENED_FULL` path |
| Editorial | R6 "merge" cell still says ①–④ while domain is five | Prose only; SP-4 is accurate |

No new blocking residual. Prior SR-1 remains closed by the R5 limb split (rev 2).

---

## Delta verdict

Rev 3 repairs both residual seams without expanding the enum: rung 2 tests a **recorded** E-7 value (`attempt_access_depth`, `NOT NULL`), with two cases settled by ruled fields today and the third filed as **placement rider CARRIER-1** rather than a fake derivation from §6.1's columnless result payload; R6's reason domain is the **leaf set of four ordered booleans**, and the fifth member is a positive last leaf, not a residue bucket — wrong-span result does not escape under "for this citation" scoping. All six original adversarial traces and both rev-2 constructions still land correctly; the teaser-reopen escape is closed. Eight names, two draft marks, and DR-088 are unchanged. Prior approval **holds**.

**GROK REVIEW (rev 3): APPROVED**

---

# PRE-07 Grok — rev 4 BOUNDED DELTA RECEIPT (cap)

**Ticket:** `t_ddb54539` (PRE-07 · DR-084)  
**Lens:** Grok (DR-101 independent peer)  
**Receipt:** **CLEAN — delta holds**  
**Date:** 2026-08-06  
**Scope:** rev-4 directed repairs only — confirm rev-3 approval is not undone. Not a fresh review.  
**Artifact judged:** `docs/missions/2026-08-06-v3-programming/ratification/citation-routes.md` rev 4 (§3.1–§3.2, §4 · R6 merge, §5.1 rung 2, §6, §9 · SP-8 / CARRIER-1 / §9.2 rev-4 log).  
**Not read:** any Codex verdict body, any `reviews/pre-07-codex*` file.

**Comments read through:** `claude-worker` `READY FOR RECEIPT (rev 4)` (2026-08-06 23:58).

---

## CHECK (1) · NULL-on-R1/R2 vs ADV traces through rungs 1–2

Two nastiest rung-1/2 limbs re-run under scoped depth (`NULL` exactly on R1/R2; required on every row that descends; four `CHECK`s; `opening_action_ref`).

### ADV-3 · absence + preview / phantom (rungs 1–2)

| Setup | Predicates / depth | Landing under rev 4 | Undo? |
|---|---|---|---|
| **A** — absence for S₁; citation names U at `PREVIEW_ONLY` | R1/R2 false (`P_ref ∧ P_rec`); descend; `attempt_access_depth = PREVIEW_ONLY` (required, non-null); `opening_action_ref` non-null | **R4** | **No** — same leaf; depth still required because the attempt opened |
| **B** — phantom URL | `P_ref ∧ ¬P_rec` → **R2** at rung 1; depth never tested; `attempt_access_depth IS NULL` (`CHECK` 1) | **R2** | **No** — NULL is correct; inventing `ACCESS_BLOCKED` would be the typed lie the scoping prevents |

### ADV-4 · dead locator on Q40 reopen (rungs 1–2)

| Step | Observation | Landing under rev 4 | Undo? |
|---|---|---|---|
| Rung 1 | complete `source_record` + triple | descend (depth not consulted — §3.1) | same |
| Rung 2 | opening non-`OK` ⇒ `ACCESS_BLOCKED` (`CHECK` 4); depth **required** (not a rung-1 terminal) | **R3** | **No** — scoping *preserves* the requirement for every opening attempt; no-silent-inheritance still fails the write on an unrecorded reopen |

**Verdict:** scoping does **not** undo either trace. It only stops R1/R2 from inventing a depth for openings that never happened. R3…R8 still carry depth; teaser-reopen → R4 (CARRIER-1) still holds.

---

## CHECK (2) · SP-8 retirement factually right?

| Claim | Evidence in `02-data-model.md` | Result |
|---|---|---|
| §13 carries `access depth` | §13 inventory row: `OPENED_FULL` / `PREVIEW_ONLY` / `ACCESS_BLOCKED` — *"three-valued and REQUIRED, not an adjective"*; home `kernel` → `evidence.source_record` `CHECK` | **Confirmed** |
| §11A.1 names the column | `source_record`: `access_depth ∈ {…}`, *"required record … inventoried at §13"* | **Confirmed** |
| Inventory limb closed | SP-8's original claim ("no row in §13") is false against current text | **Retirement correct** |
| Placement limb survives | §13 enforcement site is still `evidence.source_record` (per source); CARRIER-1 still files per-opening write on `citation_route_record` | **Correct split** |

**Verdict:** SP-8 retirement is factually right. Only CARRIER-1's placement limb remains. **No blocking note.**

---

## CHECK (3) · eight routes · five reasons · marks · consequences

| Item | Status |
|---|---|
| Eight names R1–R8 | **Unchanged** (`NO_SOURCE_FOUND` … `SPAN_MISMATCH`) |
| Five R6 reasons ①–⑤ | **Unchanged domain**; merge prose now reads ①–⑤ (rev-3 editorial lag closed) |
| Draft marks | **`UNVERIFIED-CITATION`** · **`CITATION-RECHECK-FAILED`** — unchanged |
| Serve consequences / roll-up loudness | **Unchanged** (R2 block; R4 refuse-at-write; R5 E-13 limb + drift disclosure; R6 labelled; R7/R8 AC-90 zero + digest; riders unmoved) |
| DR-088 | **Holds** (skim; no kill machinery added) |

**PASS.**

---

## Soft notes (non-blocking)

| ID | Note |
|---|---|
| **N1** | R2-after-physical-fetch still forces `NULL` depth (`CHECK` 1) while keeping the opening under `ledger_entry_ref` — consistent with R2's positive definition; not a new residue |
| **N2** | CARRIER-1 fold-in still load-bearing for `OK` reopen-at-changed-depth totality (prior SR-4); scoping did not remove that dependency |
| **N3** | SP-4 / R6-a still open for V — unchanged judgment, not a receipt concern |

---

## Receipt verdict

Rev-4 delta does **not** break rev-3 approval. NULL-on-R1/R2 is a constraint fix that aligns recorded depth with openings actually performed; ADV-3 and ADV-4 still land in exactly one correct leaf through rungs 1–2; SP-8 inventory claim is closed against `02` §13; eight routes, five reasons, marks, and consequences stand.

**GROK RECEIPT: CLEAN — delta holds**

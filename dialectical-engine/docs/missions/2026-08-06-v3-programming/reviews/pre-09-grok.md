# PRE-09 Grok peer review (independent lens)

**Ticket:** `t_4fa6e77b` — PRE-09 · Plan.md rev-4 amendment record + AC-65 five-route string (A-01 Plan-side half)
**Reviewer:** Grok (DR-101 peer lens; Claude-authored ticket)
**Protocol:** Independent; no Codex verdict or post–rev-2 comments read
**Scope judged:** `docs/missions/2026-08-05-v3-architecture/architecture/Plan.md` only (1927 lines)
**Contract sources read:** ticket body; orchestrator CONTRACT EXTENSION; both worker handoffs through `READY FOR PEER REVIEW (rev 2)`; DR-098 / DR-099 / DR-100; FinalPlan-consolidation §2 + §4
**Posture:** red-team — try to break the edits; stack-open bullet given hardest scrutiny

---

## Verdict

**APPROVED**

No blocking findings. All seven verification limbs hold.

---

## Work under review (four hunks)

| # | Edit | Location |
|---|---|---|
| 1 | AC-65 `4` → `5` terminal routes + DR-037 / §5.2 F-4 citation | §1.6 L225 |
| 2 | §3.1 module row 13 kernel-test source re-pointed to DR-037 five-member list | §3.1 L765 |
| 3 | Rev-4 header addendum + 13-row carried-by table; rev-3 freeze block kept, marked superseded | L1–L47 |
| 4 | L71 status re-recording (rev-2 contract extension); original paragraph kept, marked superseded | L71–L105 |

---

## Verification (1) — AC-65 = 5 with DR-037 + §5.2 F-4

**PASS.**

Body now reads `+ **5 terminal routes** *(rev 4 · A-01)*`. Citation cell adds **DR-037 and spec §5.2 F-4** for the five routes, with the ledger-wins-over-founding-doc clause that A-01 itself carries (Plan.md §1 order of authority; spec §2 item 1), ratified under DR-099.

Cross-check against authority:
- FinalPlan-consolidation §2 A-01: change is precisely AC-65's "4" → **5**, authority **DR-037** + `requirements-spec.md` §5.2 F-4.
- Founding ledger DR-037: Q1, Q3, Q7, Q9, **and Q10** each own a terminal route — five members.

No invented count. Rest of the AC-65 sentence (closed enum / S-13 minting / sibling cite-never-extend) left intact — correct, because founding-pack half of A-01 is still V's alone.

---

## Verification (2) — row-13 licensed by A-01 Amends; kernel test → DR-037 five-member list

**PASS.**

FinalPlan-consolidation §2 A-01 **Amends** clause explicitly names both limbs:
1. Plan.md **AC-65**
2. Plan.md **§3.1 module row 13** (`kernel`), whose test asserts membership and count against the five-member list sourced to DR-037, not against spec §12.3's Home-3 table

Ticket MUST-DO (1) parenthetical restates the same second limb. The worker flagged this as the one edit outside the AC-65 string and marked it independently revertible — unnecessary caution given the Amends clause, but not a defect.

Edited row 13:
- Condition marks / abstention kinds remain sourced to spec §12.3 (AC-65) — correct non-exception.
- Terminal routes carved out as the one exception *(rev 4 · A-01, DR-099)*: membership and count against the **five-member list sourced to DR-037 (spec §5.2 F-4)**.
- Founding-table half left as V's (S-13) — matches A-01's directed-item language, not silently applied here.

This also resolves the internal contradiction A-01 notes: §3.1 context 1 already said "the five terminal routes" (L732); AC-65 and row 13 now agree.

---

## Verification (3) — rev-4 header = pure ratification RECORD; 13-row table faithful to §2

**PASS.**

Header states, and holds to:
- **Rev 4 = rev 3 + A-01…A-13** ratified wholesale under **DR-099**, accepted *"into Plan.md as a rev-4 amendment set"* (FinalPlan §4 conjunct 2).
- C2 unfrozen / VS-1 via **DR-098**; ARCHITECTURE loop **CLOSED** via **DR-100**.
- Explicit **"RECORD of ratification, not a re-derivation"** — no absorption of amendment substance into rev-3 prose beyond A-01's Plan-side half.
- DR-100 follow-through correctly routed off-file (C4 fold-in, ADR-0015 mint, CONDITIONAL banners, founding-table correction).

Thirteen-row table checked against FinalPlan-consolidation §2 row-by-row:

| Amendment | Plan section (table) | Carried-by fidelity |
|---|---|---|
| A-01 | AC-65 + §3.1 row 13 | carriers + DR-037/F-4 + founding-pack half as V's ✓ |
| A-02 | §7 row 2 (fourteen-ADR set) | ADR-0015, 01/03/FX-PRV ✓ |
| A-03 | §2.6 | edge row 27, FX-REG-02 ✓ |
| A-04 | §2.6 + §2.7 | scheduler + FX-LG-01a/b ✓ |
| A-05 | §4 | work_item / 02 §3.8 ✓ |
| A-06 | §4 + §4.4/§9 silence | §11A.1–3 + map home §9.1 ✓ |
| A-07 | §4.3 | JUDGEMENT_SCHEDULED; S-13 not engaged ✓ |
| A-08 | §3.1 + §4 | fleet→battery, session→apps/api ✓ |
| A-09 | §2.7 | bootstrap keys; values V's at DR-023 / GPG-3 ✓ |
| A-10 | §4 | three carriers; unavailable not a verdict_state member ✓ |
| A-11 | §5.3 | keyset pagination; no value stated ✓ |
| A-12 | nothing by right (SEAT-PROPOSAL) | 7→6; declinable ✓ |
| A-13 | §7 doc 7 | six fixture ids listed ✓ |

§2's own closing tally carried as a blockquote — matches FinalPlan's amendment-count paragraph. Rev-3 freeze blockquote preserved with superseded tail (DR-098 discharge). No re-derivation of amendment substance into plan body beyond the licensed A-01 text.

---

## Verification (4) — L71 status block; hardest scrutiny on "stack STILL OPEN"

**PASS** (including the stack bullet).

Original four-line status paragraph preserved **verbatim**, with supersession tail. New blockquote above is clause-by-clause RECORD style matching the rev-4 header.

### Bullet-by-bullet

| Clause | Worker disposition | Authority check |
|---|---|---|
| "SEAT-PROPOSAL throughout" | **SUPERSEDED** | DR-098 accepts C2 repairs + conditional C4 as *"the working architecture"*; DR-100 emits ARCHITECTURE SATISFIED and closes the loop; rev 4 = rev 3 + A-01…A-13 per DR-099. Document-level provisional status is discharged. ✓ |
| "Nothing in this document is a ruling" | **STILL HOLDS** (now load-bearing) | Correct. Rulings live in the ledger; Plan.md records and cites. Header is ratification RECORD, not a ruling. §6 dispositions remain dispositions until C4 fold-in. ✓ |
| "every V-QUESTION in §6" | **DISCHARGED** | DR-100 conjunct 3: DR-068…DR-097, all **28** ruled. Folding answers into C4 is DR-100 mechanical follow-through, correctly **not** applied here; §6 still reads as authored. ✓ |
| "V ratifies the stack (DR-005 as narrowed by DR-024)" | **STILL OPEN** | See deep check below. ✓ |
| Citation discipline (last sentence) | unchanged / still binding | DR-039; AC-76. ✓ |

### Deep check — "stack STILL OPEN" vs DR-098 wholesale C4 acceptance

Red-team question: if DR-098 accepted the C4 set as the working architecture, did that silently ratify the stack and make "STILL OPEN" false?

**No. The worker's distinction holds.**

1. **FinalPlan-consolidation §4 explicitly excludes GPG-2/3/4 from architecture closure:**
   > *"What is explicitly not part of the condition. … the pre-S0 gate GPG-2/3/4 being satisfied (those gate **S0**, the first build slice, not the architecture loop)."*

2. **GPG-2 is a distinct act from VS-1 / GPG-1** (FinalPlan §3.2):
   - **GPG-1** = VS-1 = ratify frozen-gate repairs + conditional C4 → **DR-098**
   - **GPG-2** = ADR / stack set accepted or replaced (DR-005 as narrowed by DR-024) → **no DR among DR-098…DR-100 states this**

3. **No DR itemizes stack ratification.** DR-098 accepts C2 repairs + conditional C4 as working architecture (architecture-loop / VS-1). DR-099 ratifies amendments A-01…A-13. DR-100 closes the architecture loop on the three FinalPlan §4 conjuncts. None says "stack accepted under GPG-2" or "DR-005 stack ratified."

4. **§9's replacement bound still governs** in Plan.md itself (L1909–L1912): if V rules a different language, §3 context map / §4 data model / §5 API direction survive; only §2.2–§2.7 re-instantiate — exactly FinalPlan GPG-2's bound language.

5. **Board narrative consistency:** DR-098 wholesale-accepts C4 *for architecture-loop purposes* (GPG-1 / VS-1). That is not GPG-2. FinalPlan warns against conflating slice-entry with loop-closure. Programming may open while GPG-2/3/4 still gate S0. The status bullet correctly refuses to let supersession sweep the stack clause.

Observation (not a finding; out of PRE-09 exclusive scope): §2 body and §9 end matter still describe the stack as SEAT-PROPOSAL / awaiting V ratification — consistent with STILL OPEN. §9's end-note that V must still ratify "the 28 questions" is body-stale relative to DR-068…DR-097, but the L71 supersession already records discharge without rewriting §6/§9 prose; that restraint matches the RECORD discipline and the ticket's no-prose-rewrite rule.

---

## Verification (5) — nothing deleted; superseded text survives marked

**PASS.**

- Rev-3 freeze blockquote kept in full with superseded tail (L43–L47).
- Original status paragraph kept verbatim with superseded tail (L100–L105).
- No silent deletion of pre-rev-4 claims. Markers are explicit and dated.

---

## Verification (6) — no remaining four-route strings

**PASS.**

Repo grep over Plan.md for `four terminal` / `4 terminal` / `4 terminal routes` / `four terminal routes`: **zero hits**.

Other terminal-route sites remain true and correctly untouched:
- L289 — `non-answer` is a Home-3 terminal route (single route, not a count of four)
- L732 — already "the five terminal routes"
- L765 — "lists four until A-01's founding-pack half is applied" describes the **founding table's** still-unfixed state, not a Plan count of four routes
- AC-53 / S5 "terminals" / "six terminal fixtures" are composition-terminal concepts, not DR-037 routes

---

## Verification (7) — Plan.md only

**PASS (scope).**

Review limited to Plan.md. Parallel-lane mid-edit files ignored. File contract held.

---

## What was tried and failed to break

| Attack | Result |
|---|---|
| Row 13 out of ticket "AC-65 string only" body language | Defeated by A-01 Amends + MUST-DO (1) parenthetical |
| "Working architecture" (DR-098) = GPG-2 stack ratification | Defeated by FinalPlan §4 exclusion + separate GPG-1/GPG-2 rows + no stack DR |
| Header re-derives amendments instead of recording | Defeated: carriers only, substance left in FinalPlan §2 / C4 |
| Four-route residue elsewhere in file | Grep clean |
| Silent deletion of superseded freeze/status | Both preserved with markers |
| AC-65 still asserting S-13 mint-only-at-§12.3 while count is five | Deliberate A-01 shape: ledger wins for count; founding-pack half remains V's |

---

## Non-blocking observations (do not block APPROVED)

1. Body prose in §2 ("Every row is a SEAT-PROPOSAL") and §9 end-note (V ratifies stack **and** the 28 questions; "Nothing here is final") remain as authored. L71 supersession is the correct RECORD-layer fix for PRE-09; a later routed ticket may want a §9 end-note tail for the 28-question limb only — **not** this ticket's contract.
2. Worker correctly left founding-pack half of A-01 unapplied (S-13 / V's).

---

## Summary table

| # | Check | Result |
|---|---|---|
| 1 | AC-65 = 5 + DR-037 + §5.2 F-4 | PASS |
| 2 | Row 13 licensed; kernel test → DR-037 five-list | PASS |
| 3 | Rev-4 RECORD; 13-row table faithful to §2 | PASS |
| 4 | L71 bullets accurate; stack STILL OPEN correct | PASS |
| 5 | Superseded text survives marked | PASS |
| 6 | No remaining four-route strings | PASS |
| 7 | Plan.md only | PASS |

**GROK REVIEW: APPROVED**

comments read through: READY FOR PEER REVIEW (rev 2) handoff @ 2026-08-06 22:39; no later comments read

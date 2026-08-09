# PRE-13 · Grok independent peer review

| Field | Value |
|---|---|
| Ticket | `t_588f92c2` — PRE-13 · DR-114 founding corrections: four DR-061-falsified status strings (§4 ×2, §3.11 Q61, §17) |
| Reviewer | Grok (independent peer lens under DR-101) |
| Variant | Claude-authored ticket; dual reviewers = Codex + Grok |
| Date | 2026-08-07 |
| Verdict | **APPROVED** |
| Scope under review | Four surgical sites in `docs/founding/requirements-spec.md` only: (1) §4 knob row 16 *V's value* + *DR* cells; (2) §4 register-status line under the table + shared dated note; (3) §3.11 Q61 *Fires · blocked-on* cell after the `·` + its dated note; (4) §17.8 closing note + dated note. |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-13-codex*` file, or any post-handoff ticket comment after the worker's `READY FOR PEER REVIEW` marker |
| Comments read through | `2026-08-07 09:48` `claude-worker`: `READY FOR PEER REVIEW: PRE-13 landed FOUR surgical edits…` |

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. Ticket body (`hermes kanban show t_588f92c2`) through the worker handoff `READY FOR PEER REVIEW` — stopped there for review criteria.
3. **PROG ledger** `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` **DR-114** (FINAL):
   - All four remaining DR-061-falsified founding strings **AUTHORIZED** for correction (quote-correct-date-cite):
     1. §4 row 16 `stage11Rollout` OPEN→phased (OD-S-01)
     2. §4 status line 18-of-19→19-of-19
     3. §3.11 Q61 DRAFT—V-RULES→RATIFIED (DR-061 block B, **with the DR-089 ruling chain noted**)
     4. §17 close-at-artifact-review→closed at DR-061, dated
4. **Founding ledger** `docs/founding/decisions-ledger.md` **DR-061** (FINAL): SPEC REGISTER RATIFIED WHOLESALE — all 51 rows of §23 adopt seat recommendations by reference (includes `OD-S-01` and `OD-M-01…OD-M-24`).
5. **Architecture ledger** `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` **DR-089** (FINAL): WAIT drain law; Q61 is **not an intra-run WAIT row but a post-completion settlement event**; **amends the literal reading** of §3 Q61's *"may sit in WAIT indefinitely"* (supersedes-in-part). **Read for ground truth only — not to be applied by this founding correction.**
6. Spec ground truth (working tree, pre-existing law):
   - **§23** header: `Status: CLOSED` · `Open count: 0`; blocks table **B** = 24 rows, `RATIFIED — DR-061`
   - **§23.D `OD-S-01`**: `RATIFIED (DR-061) · adopted: phased — recording from day one, scoring and calibration later`; Recommendation (b) = *"what the behaviour-while-unresolved already describes"*
   - **§25.1** withdrawal row (2026-08-05): `` `stage11Rollout` having no DR | **WITHDRAWN — RULED.** … §4 row 16 carries it ``

Work product inspected:

- `git diff docs/founding/requirements-spec.md` and `git show HEAD:…` pre-image — **only** the four PRE-13 sites judged.
- Other dirty hunks (PRE-11 §3.8/§3.11 Q59/§3.13; PRE-08/PRE-12 §12.3; etc.) **ignored** per ticket fence.
- Independent greps for the four falsified strings; table pipe-counts on Q60/Q61 and register rows 15–17; byte-compare of the four consequence clauses and of each preservation blockquote against the git pre-image.

---

## What changed (four sites only)

### Site 1 — §4 row 16 (`stage11Rollout`)

| | Before | After |
|---|---|---|
| *V's value* | `**OPEN — no DR.** … **Behaviour while unresolved:** <four clauses>. Ruling owed… §23 OD-S-01` | `**phased** — recording from day one, scoring and calibration later (**RATIFIED** at §23 OD-S-01, option (b)). **What the value rules:** <same four clauses>` |
| *DR* | `—` | `DR-061` |
| Fifth col | `contracts kept; no operational calibration claim` | **unchanged** |

### Site 2 — §4 register-status line

| Before | After |
|---|---|
| `**Register status: 18 of 19 carry a V value; stage11Rollout (row 16) is the one open row**, listed once in §23.` | `**Register status: 19 of 19 carry a V value; zero open rows.** stage11Rollout (row 16) was the last one open and is ruled by DR-061 at §23 OD-S-01.` |

One shared **Edit note — 2026-08-07** after the status line: blockquotes both superseded strings (row-16 cell + count line), cites DR-061 · OD-S-01 + DR-114, points at §23 CLOSED / Open count 0 and §25.1's 2026-08-05 withdrawal, states the two travel together, claims no new decision.

### Site 3 — §3.11 Q61 blocked-on (after the `·`)

| | Before | After |
|---|---|---|
| Fires limb | `trigger resolver_outcome_arrived and Q60_valid — **the battery's only cross-run trigger**; may sit in WAIT indefinitely without that being a defect` | **byte-identical, untouched** |
| Blocked-on | `mechanism design **DRAFT — V RULES** (§17, §23 block B)` | `mechanism design **RATIFIED** by DR-061 (§17, §23 block B)` |

Dated edit note after PRE-11's Q59 note: quotes superseded string; grounds in DR-061 wholesale block B; **points onward** to DR-089 as post-completion settlement restructure **cited not restated**; explicitly leaves Fires untouched and takes no position on it.

### Site 4 — §17.8 closing note

| Before | After |
|---|---|
| `… this mechanism **leaves** for V — <24-item list> — … and **close at V's artifact review**.` | `… this mechanism **left** for V — <same 24-item list> — … and **all 24 closed at DR-061 on 2026-08-05**, ratified wholesale with the rest of the register.` |

Dated edit note: superseding clause quoted with list elided as `[…]` and disclosed; cites DR-061 + DR-114; **scope note** leaves the §17.8 heading *"The design's open questions"* verbatim (outside the four sites).

---

## Red-team (ticket VERIFYs)

### (1) Site 3 — no smuggled decision; Fires "may sit in WAIT indefinitely" restraint — **PASS**

**Fires limb:** pre-image and working tree are **byte-identical**:

> trigger `resolver_outcome_arrived and Q60_valid` — **the battery's only cross-run trigger**; may sit in WAIT indefinitely without that being a defect

Only the blocked-on limb after `·` changes (`DRAFT — V RULES` → `RATIFIED` by DR-061). That matches DR-114(3): the falsified string is the mechanism-design status, not the Fires reading.

**Note restraint vs DR-089:** DR-089 *does* supersede-in-part the literal Fires reading (architecture ledger: amends *"may sit in WAIT indefinitely"*; Q61 = post-completion settlement event outside the run lifecycle). The PRE-13 note:

- labels DR-089 as *"Q61's post-completion settlement restructure"* (ticket-authorized phrasing);
- says the ruling chain *continues elsewhere* and the DR is **"cited here, not restated"**;
- states the edit **"leaves the *Fires* text untouched and takes no position on it"**;
- does **not** re-gloss Fires, does **not** drop or rewrite "may sit in WAIT indefinitely", does **not** import WAIT-drain / TERMINAL / standing-watch law into the founding cell.

The clause *"it governs how this row's *Fires* limb is read"* is a directional pointer (why Fires is left alone), not an application of DR-089's supersession. That is the restraint DR-114 asked for: note the chain, do not apply it. **No decision smuggled.**

### (2) Site 1 — four consequence clauses byte-identical to old behaviour-while-unresolved — **PASS**

Pre-image body after `**Behaviour while unresolved:**`:

```text
Q59/Q60 and Q62's liveness limb write from day one because DR-046's model ledger and the scorecards depend on them (§16); Q61's outcome ingestion stays in WAIT until an outcome arrives; **no operational calibration claim is made** and capability cells stay `basis: NONE`.
```

Working-tree body after `**What the value rules:**`:

```text
Q59/Q60 and Q62's liveness limb write from day one because DR-046's model ledger and the scorecards depend on them (§16); Q61's outcome ingestion stays in WAIT until an outcome arrives; **no operational calibration claim is made** and capability cells stay `basis: NONE`
```

Difference = **trailing sentence-final period only** (pre-image closed the Behaviour sentence before *"Ruling owed…"*; the successor phrase is gone, so the period is not carried). The four clauses themselves — recording limbs day one, Q61 outcome ingestion WAIT, no operational calibration claim, `basis: NONE` — are **byte-identical**. That is exactly OD-S-01 option (b)'s argument (*phased = what behaviour-while-unresolved already describes*). Fifth column unchanged. No drift finding.

(Note: §23.D's own *Behaviour while unresolved* prose is a *different* wording of the same four ideas. The ticket correctly preserves **§4's** behaviour text, not a re-copy of §23's rephrase.)

### (3) Superseded strings verbatim in all blockquotes — **PASS**

| Site | Blockquote vs git pre-image |
|---|---|
| 1 | Full row-16 *V's value* cell (OPEN — no DR … Ruling owed — §23 OD-S-01) — **exact** after soft-wrap join; note also records **—** in the DR column |
| 2 | Full status line including line-break after "the one" — **exact** |
| 3 | `mechanism design **DRAFT — V RULES** (§17, §23 block B)` — **exact** |
| 4 | Closing clause with **"leaves for V"** and **"close at V's artifact review"**; 24-item list **disclosed as elided** (`[…]`) — elision is labeled in the note body; the falsified status strings are preserved |

### (4) Sweep truth — four falsified strings only inside preservation quotes — **PASS**

Independent search on the working-tree file:

| Falsified string | Hits outside `>` blockquotes | Hits inside blockquotes |
|---|---|---|
| `18 of 19` | **0** | 1 (site 2 note) |
| `OPEN — no DR` | **0** | 1 (site 1 note) |
| `DRAFT — V RULES` | **0** | 1 (site 3 note) |
| `close at V's artifact review` | **0** | 1 (site 4 note; soft-wrapped as `close at` / `V's artifact review`) |

Present-tense cells use `phased` / `19 of 19` / `RATIFIED` / `closed at DR-061` only.

### (5) Table arity intact — **PASS**

| Region | Pipe count | Expected |
|---|---|---|
| Q59–Q62 data rows | 7 each | 6-column table |
| Register rows 15 / 16 / 17 | 6 each | 5-column table |

No column collapse or merge on the edited cells.

---

## Other red-team (smuggling / authority / fence)

| Check | Result |
|---|---|
| Authority is DR-061 + DR-114 only for the four sites | **PASS** — every edit note tags `RULED(DR-061 …; correction authorized DR-114)` |
| "Decides nothing new" held | **PASS** — values already on the register; corrections make §4/§3.11/§17 agree with §23 |
| Site 1 value text matches OD-S-01 adopted option (b) | **PASS** — *phased — recording from day one, scoring and calibration later* |
| Site 2 travels with site 1 (count cannot assert an open row the table no longer has) | **PASS** — shared note states this explicitly |
| Site 4 heading left outside scope | **PASS** — scope note leaves *"The design's open questions"* verbatim |
| PRE-11 Q59 note address (25.1 vs 23) | **Out of contract** — worker cosmetic flag noted; PRE-13 correctly cites §25.1; non-blocking observation only, not a finding |
| PRE-08 / PRE-11 / PRE-12 hunks | **Not judged** |

---

## Verdict

**APPROVED.**

Four quote-correct-date-cite corrections under DR-114; no new decisions; Fires restraint on Q61 held; consequence clauses preserved; falsified strings quarantine to blockquotes; table arity intact.

```text
GROK REVIEW: APPROVED
```

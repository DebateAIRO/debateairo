# PRE-11 · Grok independent peer review

| Field | Value |
|---|---|
| Ticket | `t_55e4ca74` — PRE-11 · DR-111 founding corrections: three DR-061-falsified status strings |
| Reviewer | Grok (independent peer lens under DR-101) |
| Variant | Claude-authored ticket; dual reviewers = Codex + Grok |
| Date | 2026-08-07 |
| Verdict | **APPROVED** |
| Scope under review | Surgical edits to `docs/founding/requirements-spec.md` only — §3.8 Q43, §3.11 Q59, §3.13 residual-holes roll-up |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-11-codex*` file, or any post-handoff ticket comment after the worker's `READY FOR PEER REVIEW` marker |

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. Ticket body (`hermes kanban show t_55e4ca74`) through the worker handoff `READY FOR PEER REVIEW: PRE-11 …` — stopped there for review criteria; did not read later comments.
3. `docs/founding/decisions-ledger.md` **DR-061** (V-RULING, FINAL): SPEC REGISTER RATIFIED WHOLESALE — all 51 rows of requirements-spec §23 adopt seat recommendations **by reference** to the register's own option text, including `OD-S-01..04, OD-S-06`.
4. `docs/founding/requirements-spec.md` **§23.D** ratified rows (live text):
   - **`OD-S-01` — RATIFIED (DR-061) · adopted: phased — recording from day one, scoring and calibration later** · option (b).
   - **`OD-S-02` — RATIFIED (DR-061) · adopted: drop the undefined condition; the row fires on split or composed answers** · option (d).
   - **`OD-S-03` — RATIFIED (DR-061) · adopted: minimum plus wording and the typed not-knowing** · option (b) full text: *Minimum plus careful wording and the typed statement of what is not known*.
5. `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` **DR-111(1)**: PRE-11 AUTHORIZED — surgical correction of the three named DR-061-falsified founding strings in the A-01/PRE-08 shape.

Work product inspected:

- `git diff docs/founding/requirements-spec.md` (full; PRE-08 §12.3 row-5 hunk ignored as pre-existing).
- `git show HEAD:docs/founding/requirements-spec.md` pre-image for §3.8 / §3.11 / §3.13.
- Working-tree post-edit cells + three dated edit notes.
- Independent §3 sweep for remaining falsified `OPEN` status strings (see red-team item 4).

---

## Red-team checklist (ticket VERIFYs)

### (1) No corrected sentence claims MORE than §23.D grants — **PASS**

| Site | Live corrected claim | §23.D grant | Overclaim? |
|---|---|---|---|
| §3.8 Q43 blocked-on | Conjunct **dropped**; row fires on split or composed answers; **CLOSED** by DR-061 / `OD-S-02` | Adopted option **(d)**: drop the undefined condition; row fires on split or composed answers | **No** |
| §3.8 Q43 requirement close | Activation = `split_or_composed_answer`; option **(d)**; conjunct dropped, not carried as a gate | Same (d); behaviour-while-unresolved already used the plain split/composed reading | **No** — removes the falsified "undefined gate awaiting V" rather than inventing a gate |
| §3.11 Q59 blocked-on | `stage11Rollout` = **phased** — recording from day one, scoring and calibration later (**RATIFIED** DR-061 / `OD-S-01`) | Adopted option **(b)** with that exact phrase | **No** |
| §3.13 roll-up | Both residuals **closed**; OD-S-02 = dropped conjunct / fires split-or-composed; OD-S-03 = **derived minimum plus careful wording and the typed statement of what is not known** | OD-S-02 (d); OD-S-03 (b) option text | **No** — "derived" is the register's own label for the minimum (behaviour-while-unresolved); the plus-two limbs match option (b) verbatim |

Every edit note asserts **"This edit decides nothing new"** and cites DR-061 as authority + DR-111(1) as correction authorization. That is accurate: no option letter, no new conjunct, no behaviour change beyond what wholesale ratification already bound.

### (2) Superseded strings preserved verbatim vs git pre-image — **PASS**

Whitespace-normalized comparison of edit-note blockquotes against `git show HEAD:…` pre-image:

| Superseded string | In HEAD pre-image | In edit-note blockquote |
|---|---|---|
| Q43 OPEN blocked-on fragment (`**OPEN**: §2's extra conjunct … (§23, \`OD-S-02\`)`) | **Yes** | **Yes** (line-wrapped only) |
| Q43 activation close (`**Adopted activation reading: the appendix reading (\`split_or_composed_answer\`), with \`alternate_method_required\` recorded as an undefined gate awaiting V.**`) | **Yes** | **Yes** |
| Q59 (`deployment scope depends on \`stage11Rollout\` (**OPEN**, §23 \`OD-S-01\`)`) | **Yes** | **Yes** |
| §3.13 full residual-holes paragraph | **Yes** | **Yes** |

A-01/PRE-08 shape satisfied: original quoted in blockquote, present-tense correction, dated edit note citing DR-061 + DR-111(1).

### (3) §3.13 does not erase OD-S-03's three-part content — **PASS**

OD-S-03 option **(b)** three parts:

1. **Minimum** (register: "derived minimum" = intent record, provenance, liveness telemetry)
2. **Careful wording**
3. **Typed statement of what is not known**

Live §3.13 sentence:

> … is **the derived minimum plus careful wording and the typed statement of what is not known** (§23 `OD-S-03`, DR-061).

All three limbs present; not collapsed to "closed" or "minimum only". The survivor-set framing (`INERT`, ill-posed, value-routed) is carried forward from the pre-image (not newly narrowed). Option letter **(b)** is recorded in the edit note.

### (4) Worker's §3 sweep claim — **PASS** (verified independently)

Independent scan of §3 (from `## 3. Row-closure table` through `## 4.`):

- Literal status-token **`OPEN`** in **live** (non-blockquote, non-edit-note) cells: **zero** after this edit.
- The only remaining `OPEN` occurrences inside §3 sit inside the three edit-note blockquotes (historical superseded text) — correct.
- Natural-language "open" in Q16 / Q40 / Q55 triggers (`open my sources`, `any_open_unknown_at_serve`) are not status tokens and are not falsified by §23.D.
- Worker's claim *"exactly two literal OPEN strings existed in §3 — Q43 and Q59 — both fixed; no other §3 status string is falsified by §23.D"* holds under the stated criterion (falsified **by §23.D**).

**Out-of-scope residue** (correctly untouched; not a PRE-11 defect):

| Residue | Why out of PRE-11 |
|---|---|
| §3.11 Q61 `mechanism design **DRAFT — V RULES** (§17, §23 block B)` | Authority is block B (OD-M-\*), not a §23.D residual string; outside the three named sites |
| §4 knob row 16 `stage11Rollout` still `**OPEN — no DR.**` | Outside file-site contract (§3 only for this ticket's three sites); worker correctly escalated |
| §4 register-status "18 of 19" / one open row | Same |
| §17 "close at V's artifact review" for block B | Outside `docs/founding/` site list for this ticket |

### (5) Three PRE-11 hunks touch nothing else — **PASS**

```text
git status --porcelain docs/founding/
 M docs/founding/requirements-spec.md

git diff --stat docs/founding/
 docs/founding/requirements-spec.md | 80 ++++++++++++++++++++++++++++++++++----
 1 file changed, 73 insertions(+), 7 deletions(-)
```

Hunk map (`git diff -U0`):

| Hunk | Role |
|---|---|
| `@@ -312 +312` | PRE-11 · Q43 row cell |
| `@@ -314,0 +315,19` | PRE-11 · Q43 edit note |
| `@@ -343 +362` | PRE-11 · Q59 row cell |
| `@@ -347,0 +367,13` | PRE-11 · Q59 edit note |
| `@@ -396,5 +428,24` | PRE-11 · §3.13 rewrite + edit note |
| `@@ -1404,0 +1456,15` | **PRE-08 pre-existing** §12.3 A-01 row-5 insert — **ignored per ticket** (not PRE-11; not authored under this ticket) |

No other founding file dirty. No PRE-12 §12.3 partition-law sites in the PRE-11 hunks. Checksums / disposition tables / R1–R9 rows / non-named Q rows untouched by PRE-11.

---

## Protocol / shape compliance

| Requirement | Result |
|---|---|
| File contract: `docs/founding/requirements-spec.md` only | **Met** |
| Three sites only (§3.8 Q43, §3.11 Q59, §3.13 roll-up) | **Met** |
| A-01/PRE-08 shape (quote + correct + dated note citing DR-061 + DR-111) | **Met** on all three |
| Present-tense correction consistent with ratified register | **Met** |
| No git ops by worker (reviewer does not evaluate push; none required) | N/A for this lens |

---

## Findings

**None blocking.**

Nits (informational only — do not request changes):

1. Worker handoff counted "five hunk headers of which L1404 is PRE-08"; the full uncommitted diff has **six** headers (five PRE-11 + one PRE-08). Substance of the scope claim is still correct.
2. Out-of-scope §4 / Q61 / §17 staleness is real DR-061 residue and should remain on the orchestrator's follow-through list — not this ticket's rework.

---

## Verdict

**APPROVED**

All five red-team probes pass. The three corrections are pure DR-061 alignment under DR-111(1) authorization; no smuggled decision; superseded strings preserved; OD-S-03 three-part content intact; §3 sweep claim independently verified; PRE-11 hunks confined to the three named sites (PRE-08 §12.3 hunk disregarded as instructed).

# PRE-08 · Grok independent peer review

| Field | Value |
|---|---|
| Ticket | `t_7d9e70ad` — PRE-08 · A-01 founding-table correction |
| Reviewer | Grok (independent peer lens under DR-101) |
| Variant | Claude-authored ticket; dual reviewers = Codex + Grok |
| Date | 2026-08-06 |
| Verdict | **APPROVED** |
| Scope under review | Surgical edit to `docs/founding/requirements-spec.md` §12.3 Home 3 only |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-08-codex*` file, or any ticket comment after the `READY FOR PEER REVIEW` marker |

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. Ticket body (`hermes kanban show t_7d9e70ad`) through the handoff comment `READY FOR PEER REVIEW: PRE-08 · A-01 founding-table correction applied.` — stopped there.
3. `docs/founding/decisions-ledger.md` **DR-037** (V-RULING, FINAL): five terminal routes owned by Q1 / Q3 / Q7 / Q9 / Q10 — *inert stop; false-assumption non-answer; value→human; NOT_EMPIRICALLY_DECIDABLE; no-justification-no-split*.
4. `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md`:
   - **DR-099**: A-01 ruled individually — *"five terminal routes + founding-table correction authorized"*.
   - **DR-100**: mechanical follow-through includes *"apply A-01's founding-table correction"*.

Work product inspected:

- `git diff docs/founding/requirements-spec.md` — single hunk, +15 / −0.
- `git status --porcelain` / `docs/founding/` porcelain — only `M docs/founding/requirements-spec.md`.
- Working-tree §12.3 Home 3 (post-edit) and `git show HEAD:…` (pre-edit) for byte comparison of rows 1–4.
- Spec §5.2 F-4 table (unmodified) for membership cross-check.

---

## Checklist (ticket VERIFYs)

### (1) Home 3 lists exactly FIVE terminal routes matching DR-037 + §5.2 F-4 — **PASS**

Post-edit Home 3 membership:

| # | Home 3 route | Owning row | DR-037 phrase | §5.2 F-4 route |
|---:|---|---|---|---|
| 1 | `INERT` | Q1 | inert stop | **`INERT`** |
| 2 | false-presupposition non-answer | Q3 | false-assumption non-answer | False-presupposition non-answer |
| 3 | value → human | Q7 | value→human | Value → human |
| 4 | `NOT_EMPIRICALLY_DECIDABLE` | Q9 | NOT_EMPIRICALLY_DECIDABLE | **`NOT_EMPIRICALLY_DECIDABLE`** |
| 5 | depth-zero (no justification, no split) | Q10 | no-justification-no-split | **Depth-zero (no justification, no split)** |

Count = **5**. Order matches both authorities (Q1 → Q3 → Q7 → Q9 → Q10). Row 5's label matches F-4's fifth member (case-only difference on "Depth"/"depth", consistent with Home 3's existing lower-case prose style on rows 2–3). The Raised-by cell quotes DR-037's exact fifth phrase `no-justification-no-split`.

Pre-existing naming variance *false-assumption* (DR-037) vs *false-presupposition* (F-4 / Home 3) is **not** introduced by this edit; rows 1–4 are unchanged.

### (2) Added row carries authority annotations + dated edit note — **PASS**

Row 5 Raised-by cell:

- `**authority: DR-037**` with the fifth-route quote `*"no-justification-no-split"*`.
- `**placed here by DR-099 / amendment A-01**`.

Edit note immediately under the table:

- Dated **2026-08-06**.
- Tagged `RULED(DR-099 A-01; follow-through DR-100)`.
- States the prior four-vs-five defect under S-13.
- Explicitly asserts **no new typed state is minted**.
- Cites TRACE-7 ≡ H-C-1 and residual risk R-3 discharge.

This satisfies the ticket's MUST DO for annotation + non-silent history.

### (3) NOTHING else changed in `docs/founding/` — **PASS**

Evidence:

```text
git status --porcelain docs/founding/
 M docs/founding/requirements-spec.md

git diff --stat  (founding)
 docs/founding/requirements-spec.md | 15 +++++++++++++++
 1 file changed, 15 insertions(+)
```

Single file, single insertion hunk after former row 4. No other founding file dirty. No deletions.

### (4) No new typed state minted (S-13; already-ruled state placed) — **PASS**

S-13: a new typed state may not be minted without placement in this table, and this table is the only mint site. An **unplaced** already-ruled state is the defect this ticket fixes.

Row 5 is not a fresh invention:

- Named and owned by Q10 in **DR-037** (FINAL).
- Already enumerated as the fifth row of **§5.2 F-4** (untouched by this edit).
- Placement authorized by **DR-099 / A-01**; mechanical follow-through named in **DR-100**.

The edit **places** an already-ruled route into the S-13 home table. The edit note correctly records that fact. This is the opposite of an unauthorized mint.

### (5) Pre-existing rows untouched — **PASS**

Byte-identical comparison of rows 1–4 (HEAD vs working tree):

```text
| 1 | `INERT` | Q1 · §5.2 |
| 2 | false-presupposition non-answer | Q3 · §5.2 |
| 3 | value → human | Q7 · §5.2 (pure value acts only, per DR-053) |
| 4 | `NOT_EMPIRICALLY_DECIDABLE` | Q9 · §5.2 |
```

Rows 1–4 identical? **True**. Row 3's DR-053 pure-value parenthetical preserved. S-13 / S-14 prose after the insert is intact (shifted down by the insert only).

---

## Red-team (silent breakage / founding contradiction)

| Probe | Result |
|---|---|
| Does row 5 invent semantics beyond DR-037 / F-4? | **No.** Label and ownership match F-4; authority cites DR-037's fifth phrase. |
| Does Home 3's intro ("these *are* the answer; they end the run") conflict with depth-zero (undivided answer; Stage 6 skipped)? | Pre-existing classification tension, if any, already lives in DR-037 + §5.2 F-4 (both already call this a terminal route). **This edit does not create or widen it** — it only places the already-classified fifth member into the mint table. |
| Does the edit leave founding-pack internal contradiction (four vs five)? | **Resolved for Home 3.** §5.2 already said five; Home 3 now says five. Zero `four terminal` / `4 terminal` strings remain as live counts inside the edited Home-3 block. |
| Does asymmetric authority markup on row 5 (vs bare rows 1–4) imply rows 1–4 lack authority? | **No.** Rows 1–4 were already members under DR-037 / F-4; row 5 is the A-01 *placement* correction and correctly carries the placement authority. |
| Scope leak into architecture / Plan / AC-65? | **None.** Worker correctly left Plan.md AC-65 ("**4** terminal routes") and C4 "known-incomplete at four" caveats untouched — those are outside the exclusive §12.3 file contract. They are **stale residue for PRE fold-in tickets**, not PRE-08 defects. Flagging them for orchestrator is appropriate; acting on them here would have violated scope. |
| Does placing the route re-open architecture loop or mint ADR-class work? | **No.** DR-100 already closed architecture and listed this as mechanical follow-through. |
| Could a reader misread the edit note as minting under DR-099 rather than placing under DR-037? | Edit note and row cell both state authority = DR-037 and placement = DR-099/A-01. Clear enough. |

**Red-team conclusion:** no silent founding contradiction introduced; no unauthorized mint; no scope creep; residual out-of-scope staleness is correctly deferred.

---

## Findings

**Blocking findings:** none.

**Non-blocking observations (for orchestrator / later PRE tickets, not CHANGES REQUESTED):**

1. **Plan.md AC-65** still carries the literal count of **4** terminal routes — A-01's Plan-side half, outside PRE-08's exclusive founding-file contract. Needs a separate routing ticket if not already covered.
2. **C4 caveats** that still assert "Home 3 is known-incomplete at four" are now factually past-tense after this correction; they belong to PRE-01/02/03 fold-in, not this ticket.
3. Pre-existing **DR-037 "false-assumption"** vs **F-4/Home 3 "false-presupposition"** naming variance remains (rows 1–4 untouched). Not in scope to normalize here.

---

## Verdict

All five ticket VERIFYs pass. The edit is the authorized A-01 founding-table correction: five terminal routes in §12.3 Home 3, authority-annotated, dated, S-13-compliant (place, do not mint), founding-scope surgical, pre-existing rows byte-identical.

**GROK REVIEW: APPROVED**

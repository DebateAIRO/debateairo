# SPEC — T5 Node detail drawer

**Version:** v1 (2026-08-31) · **Status:** FROZEN at creation.

**Mission:** `ui-overhaul` · **Design source:** TURN 5.

## Intent

Replace NodeDetailDrawer presentation with TURN 5: way of knowing, review
agree/dispute line (`REVIEW AGREED BY:` / disputed counterpart when present),
base score and final strength with sources, replay handle, stranger
restatement, defeaters, judge disagreement, condition marks,
challenge/regenerate, generation history — under Terracotta/Chamber. Behavior
remains the existing drawer contract; this slice is the visual/copy overhaul
of that contract.

## Screen inventory

| ID | Region | Notes |
|---|---|---|
| T5-S1 | Drawer chrome | Debate title crumb; Scoring n/m; mode; close |
| T5-S2 | Root / node header | ROOT CLAIM or stance (`↓ CON` etc.); model line |
| T5-S3 | Body | Claim text |
| T5-S4 | Way of knowing | e.g. `WAY OF KNOWING · EMPIRICAL` + short label |
| T5-S5 | Review verdict line | `REVIEW AGREED BY:` or `REVIEW DISPUTED BY:` plus reviewer model line when the node has a cross-review (design TURN 5:302–304) |
| T5-S6 | Scores | `BASE SCORE` with source; `FINAL STRENGTH` with source |
| T5-S7 | Replay | `REPLAY` handle string |
| T5-S8 | Restatement / defeaters / judge disagreement | labeled sections |
| T5-S9 | Condition marks | chips such as Not falsified / Single model lineage / Under-explored |
| T5-S10 | Actions | `⚐ Challenge` · `↻ Regenerate` (owner); locked/hidden in publicMode |
| T5-S11 | Generation history | Compare versions; ACTIVE vs ARCHIVED entries |
| T5-S12 | Mode + tokens | Terracotta ↔ Chamber |

## States

1. Open on root vs non-root node.
2. Fields present vs typed absence (show labeled absence, do not invent values).
3. Review verdict present (`REVIEW AGREED BY:` / `REVIEW DISPUTED BY:`) vs absent
   (no fabricated reviewer line).
4. Owner/authenticated mutate vs publicMode read-only (no challenge/regenerate
   success path).
5. Generation history empty vs multiple versions.

## Copy (binding labels)

- `WAY OF KNOWING · …`
- `REVIEW AGREED BY:` · `REVIEW DISPUTED BY:` (when the node has that review
  state; model attribution line follows)
- `BASE SCORE` · `FINAL STRENGTH` · `REPLAY` · `RESTATEMENT` · `DEFEATERS` ·
  `JUDGE DISAGREEMENT`
- `GENERATION HISTORY` · `Compare versions` · `ACTIVE` · `ARCHIVED`
- Actions: Challenge · Regenerate

## Requirements

### R1 — Drawer opens from tree/card

Selecting Details/open-node from T1 (or public read open) opens T5 drawer on
that node.

### R2 — Score + provenance regions

BASE SCORE and FINAL STRENGTH labels render with their source suffixes when
data exists; typed absence when not.

### R3 — Review verdict line

When the node carries a cross-review, the drawer shows the binding label
`REVIEW AGREED BY:` or `REVIEW DISPUTED BY:` plus the reviewer model line.
When no review exists, the drawer does not invent one (typed absence / omit).

### R4 — Replay / restatement / defeaters / disagreement

Labeled sections render; values or explicit empty/absence states.

### R5 — Condition marks visible

Condition mark chips from the node/record set render in the drawer.

### R6 — Challenge / Regenerate owner-only

Owner session shows actions that call existing mutate paths; publicMode does
not offer a working mutate path (locked/absent per T3).

### R7 — Generation history

History list distinguishes ACTIVE vs ARCHIVED versions when multiple exist.

### R8 — Mode toggle

Drawer/header participates in Terracotta ↔ Chamber.

### R9 — Render pins move to NEW UI

Existing `tests/render/**` pins that assert OLD node-detail / honesty /
drawer / provenance copy or chrome for this surface must move to the NEW UI
(which exact pin files = ARCH — examples include `prov01-honesty-drawer` and
any sibling drawer pins). OLD-UI-exact pins for the replaced drawer must not
remain as the mission’s passing bar.

## NON-goals

- New scoring backend.
- Changing challenge/regenerate API semantics.
- Public mutate unlock without auth (T3).

## OPEN QUESTIONS

1. **Field order vs design (ARCH):** if current drawer order differs from TURN 5
   vertical order, match design order unless accessibility requires otherwise —
   ARCH records the chosen order.
2. **Shared vocab:** `claim`/`node` product terms vs design `joint` — keep
   product terms inside drawer (propose); V-DECISION shared with T9.

## Acceptance — V manual (browser)

1. Open a debate → open a node Details on a node that has a cross-review.
   **Expect:** drawer with way of knowing, `REVIEW AGREED BY:` or
   `REVIEW DISPUTED BY:` plus reviewer model line, base/final, replay,
   restatement, defeaters, disagreement, condition marks, history.
2. Open a node with no cross-review (if available). **Expect:** no fabricated
   `REVIEW AGREED BY:` / `REVIEW DISPUTED BY:` line.
3. As owner, confirm Challenge and Regenerate visible. **Expect:** present.
4. As public reader on publicMode debate, open node. **Expect:** read fields
   (including review line when present); Challenge/Regenerate locked or absent.
5. Toggle mode. **Expect:** drawer remains readable in both modes.

## Acceptance — automated

- Drawer render test asserts section labels including `REVIEW AGREED BY:` (or
  disputed counterpart) when the fixture has a cross-review.
- publicMode test asserts mutate actions locked/absent.
- `tests/render/**` pins named by ARCH for this surface pass against NEW UI;
  three-run law.

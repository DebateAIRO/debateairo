# ARCH-01 — ACCEPTANCE-COMMAND thread, ROUND 4 (cap waived by V)

**Ticket:** `t_e1208546` (PLAN-06). **This round exists only because V waived the 3-round cap**
(V-DECISIONS-PACKET Row 6). It is not a free round: the fix must close the CLASS.
**Your file:** `docs/missions/public-debate-access/slices/S01/PLAN.md` + `DECISIONS.md`.
SPECs FROZEN. No product code, no worktrees, no test files — those belong to the coding seat,
which has FINISHED and is holding at `READY FOR PEER REVIEW`.

Open your handoff with `SKILLS LOADED: <list>`.

## The defect, measured by the Router in the S01 worktree

`vitest -t` takes a **JS regex**. In a regex `\|` is an **escaped literal pipe**, not
alternation. Multi-pattern filters in this PLAN are written `a\|b` — because a bare `|` breaks
a markdown table — so they search for a title containing a literal `|` character:

    -t 'replay_handle'                  ->  Tests 1 passed | 20 skipped (21)
    -t 'disagreement'                   ->  Tests 1 passed | 20 skipped (21)
    -t 'replay_handle\|disagreement'    ->  Tests 21 skipped (21)      <-- ZERO matched
    -t 'replay_handle|disagreement'     ->  Tests 2 passed | 19 skipped (21)

**Reproduce this before you change anything.**

## Why this is the fifth variant and not a typo

The affected step-level acceptances still PASS. They pass because the coder named its tests to
match the malformed regex. Real titles now in `tests/unit/s8-publication.test.ts`:

    "publishes the tree|tree survives publish by value without field drift"
    "protects ledger_unknown_ref|redact only its abstention value"
    "removes residual handle|handle residual marker values from published JSON"

Those literal pipes are not English. They exist so a broken filter finds exactly one title.

**Read that against the invariant you yourself wrote this same round:** a PASS must have
*exclusive provenance* — traceable to the one real-world fact it claims. Here the PASS is
produced by **the shape of a test's name**. Rename any of those tests to read naturally and the
acceptance breaks while the feature still works. Your invariant did not fail; it was written
minutes before this instance was found, and this is its first live test.

**One arm is already broken, not merely fragile.** `S01-C2`'s new presence arm joins FIVE
patterns with `\|`, so it needs one title containing five literal pipes. Measured against the
coder's completed implementation: `Tests 21 skipped (21)` — `vt=0 guard=1`, the arm FAILS. It is
unpassable as written. `S01-C3`'s two-pattern arm passes only via the contrived `tree|tree`
title.

## Scope, measured — S01 only

`S02`, `S03`, `S04` contain **zero** occurrences; confirm that rather than assuming it.
Within S01, 9 sites: **5 inside markdown table cells** (lines 301, 302, 303, 315, 316) and
**4 in step-level `**Acceptance test:**` lines** (984, 1051, 1133, 1388) which are NOT in tables
and therefore have no rendering excuse at all.

## The real constraint, and it is a genuine tension

A bare `|` inside a markdown table cell breaks the table. So a fix that only unescapes will
render the cluster table as garbage. **Any fix must satisfy BOTH rendering and execution.**
The Router deliberately does not prescribe one — several shapes exist (move executable commands
out of table cells into fenced blocks the table references; give each acceptance a single
pattern; carry the pattern in a shell variable; use an entity in the cell and the literal in the
block). Choose by the shape, apply to the class, and say why in DECISIONS.md.

**Also decide, and this is the part that outlives S01:** should an acceptance's PASS ever depend
on a test's *title* at all? `-t` filtering makes every such acceptance hostage to a rename. If
your answer is that it should not, say what replaces it.

## What is NOT in scope for you

Renaming the three contorted tests is the **coding seat's** job on its own ticket, not yours.
Say what the titles should become; do not edit test files.

## Standing

- Reproduce first. RUN every command you touch and paste one observed result.
- The coder is DONE and waiting. Do not disturb its clusters — verification text only.
- A finding is a finding: non-blocking sets WHEN, never WHETHER.
- Say plainly what you could not do rather than inferring it.

Return control at `REWORK READY FOR REVIEW` or a genuine blocker.

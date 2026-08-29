# ARCH-01 — REWORK, SCOPE-BOUNDARY thread, round 1 of 3

**Ticket:** `t_5560836d` (PLAN-02). **Slice thread:** S03/S04 — this is a NEW thread at
round 1. It does NOT consume the S01 acceptance-command thread's budget.
**Your files:** `docs/missions/public-debate-access/slices/S03/PLAN.md`,
`.../S04/PLAN.md`, and the matching `DECISIONS.md` (append-only).
**Frozen:** all SPEC.md. **Not yours:** worktrees (the Router syncs those), PROGRESS.md
(orchestrator is sole writer), any product file.

Open your handoff with `SKILLS LOADED: <list>`.

## What is already done — do not redo it

Your own rework round 4 (PLAN-03, `t_71699495`) retrofitted every acceptance step with a
taxonomy Category line and a dated observed run. The Router re-measured that claim rather
than trusting it, by counting acceptance steps against Category lines:

| slice | acceptance steps | categorized |
|-------|------------------|-------------|
| S01   | 19               | 19          |
| S02   | 22               | 22          |
| S03   | 11               | 10          |
| S04   | 10               | 9           |

60 of 62. The original complaint on `t_5560836d` — "several S03 acceptances already pass
against unmodified code" — is ANSWERED for 8 of them: 5 REGRESSION-BASELINE and 3
VERIFICATION-ONLY (`Change: none`) are legitimately green before and after, and each now
carries the run that showed it. **Do not "fix" those.** A gate that condemns a correct
regression baseline is a worse defect than the one it was chasing.

## Finding 1 — the residue, and it is ONE CLASS (2 instances)

    S03/PLAN.md:326   S03-C1-5   **Acceptance test:** N/A — this is a scope boundary, not a test.
    S04/PLAN.md:428   S04-C4-3   **Acceptance test:** N/A — this step exists to state a boundary

Two numbered PLAN steps that are boundary STATEMENTS wearing an acceptance field. They are
uncategorized because the taxonomy has no box for them — `grep -c SCOPE-BOUNDARY` across all
four PLANs returns 0.

Per spine item 16, **choose the remedy by the shape and apply it to the class**, not to S03
alone. Two shapes fit; pick one and apply it to BOTH instances:

- **(a)** Add a fourth category `SCOPE-BOUNDARY` and label both. Keeps the boundary where a
  reader actually hits it, at the cost of a PLAN step that is not testable.
- **(b)** Move both into the slice's `DECISIONS.md` and delete the numbered steps, so every
  numbered PLAN step is testable by construction.

The Router does not choose between these — PLAN.md is your file. State which and why in
DECISIONS.md. Whichever you pick, afterwards `grep -c '^\*\*Acceptance test:\*\*'` and
`grep -c '^\*\*Category ('` must agree in every one of the four PLANs.

## Finding 2 — NOT resolved by categorization, and the seat was right

The S03-CODE seat's sharpest line, verbatim:

> a positive probe that public debates are visible cannot prove tab mutual exclusion — it
> already passes when both lists are always stacked.

That is a real gap and labelling the step does not close it. `S03-C3` (PLAN.md:436-446)
probes `?tab=public` for `≥1` occurrence of `/public/debate/`, and the bare `/` likewise.
Both would pass on a page that simply stacks both lists and has no tabs at all.

**Mutual exclusion needs a NEGATIVE assertion** — with `?tab=public`, the "your debates"
content must be ABSENT — or the PLAN must say explicitly that S03-C3 pins presence only and
name the step that pins exclusion. Either is acceptable; silence is not. Decide and record.

## Standing constraints

- Rework rounds: **max 3** on this thread. Round 4 does not exist — it becomes a V
  DECISIONS PACKET row.
- **Reproduce before you change.** Run the two greps above and paste what you observed.
- RUN every command you touch and paste one observed result per PLAN you edit.
- A finding is a finding: non-blocking sets WHEN it is fixed, never WHETHER.
- Do not touch S01 or S02 PLANs on this thread — S01 is being edited on a live parallel
  thread right now and a concurrent write will collide.

Return control at `REWORK READY FOR REVIEW` or a genuine blocker.

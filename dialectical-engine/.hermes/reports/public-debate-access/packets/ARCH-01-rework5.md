# ARCH-01 — ACCEPTANCE-COMMAND thread, ROUND 2 of 3

One round remains after this. Handoff OPENS with `SKILLS LOADED: <list>`.

## PLAN-04 — BLOCKING. Ticket `t_eade6007`.

The `Tests +[0-9]+ passed` guards you added last round are written as `cmd | grep -qE ...`.
`grep -q` exits on first match and closes the pipe; vitest then writes to a closed pipe and dies:

```
node:events:497
      throw er; // Unhandled 'error' event
```
stderr carries 2 EPIPE/broken-pipe mentions — **and the pipeline still exits 0**, because the
status is grep's, not vitest's. So the command cannot tell "tests passed" from "vitest crashed
after printing the summary." Reproduce it yourself before changing anything.

## This is the THIRD variant of one family — fix the family, not the variant

1. **Round 3:** acceptance on a gitignored path → could never observe its change.
2. **Round 1 (this thread):** `--reporter=basic` → crashed *before* running.
3. **Now:** `grep -q` → crashes *during* the run, and hides it.

Each looked like verification and verified nothing. The through-line is that **the assertion and
the command's own health were never separated**.

## The one idiom, Router-verified, apply it everywhere

```sh
out=$(pnpm exec vitest run <file> 2>&1); vt=$?
printf '%s' "$out" | grep -qE 'Tests +[0-9]+ passed'
```

Measured result on a real file: `vitest exit=0`, `guard=0`, summary `Tests 19 passed (19)`.
It never closes a pipe early, and it keeps **vitest's own exit code** available so a crash cannot
hide behind grep's status. **Assert on BOTH `$vt` and the summary match** — either alone is one of
the three failures above.

Apply across all four PLANs. Then, as last round, **RUN every command you touch** and paste one
observed result per PLAN into the handoff. Last round that practice found two defects beyond the
one you were sent for; it is the highest-yield thing you do.

## Do not disturb real progress

The S01 seat has written product code and **cluster C1 is COMPLETE with three 16/16 GREEN runs**.
C2's unfiltered suite is 19/19 GREEN but correctly not declared complete pending these commands.
Change verification commands only — nothing about C1's or C2's substance is in question.

## Bounds

SPECs FROZEN. `PLAN.md` edits and `DECISIONS.md` APPENDS only, citing `t_eade6007`. No product
code, no tests, no `PROGRESS.md`, no worktrees — the Router syncs those. V's four rulings unchanged.

## Handoff

`SKILLS LOADED`, then `REWORK READY FOR REVIEW` on `t_f864a84b` with: the count of guards
converted per PLAN, one RUN result per PLAN pasted verbatim, and confirmation that each converted
command asserts on both the exit code and the summary. Append to your self-report: why three
successive attempts to make acceptance commands rigorous each introduced a new way for them to
lie, and what single check would have caught all three at authoring time. Then stop.

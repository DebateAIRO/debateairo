# ARCH-01 — ACCEPTANCE-COMMAND REPAIR (new thread, round 1 of 3)

**Rework accounting, stated plainly so the cap is not evaded:** the S01 *design* thread closed at
3 of 3 with a PASS. This is a **new, independent thread** about the acceptance commands themselves
— round 1 of 3. If it reaches round 3 without closing, it becomes a V DECISIONS PACKET row.

Handoff OPENS with `SKILLS LOADED: <list>`.

## PLAN-03 — BLOCKING. Ticket `t_71699495`. No cluster in this mission is currently verifiable.

`vitest 4.1.10` removed `--reporter=basic`. It dies before running a single test:

```
⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Failed to load custom Reporter from basic
```

Your PLANs use that flag **32 times** — S01 ×17, S02 ×6, S04 ×7, S03 ×2 — including **every
cluster verification command**. So every cluster's verification currently produces a startup crash
rather than evidence. Reproduce it yourself before changing anything:
`npx vitest run tests/unit/s8-publication.test.ts --reporter=basic`.

**The mechanical part is small:** vitest's default reporter is fine; drop the flag. Do it across
all four PLANs, and confirm by running a representative command from each.

## The part that actually matters — this is the THIRD instance of one cause

Your own round-3 self-report named it: *"verified a check EXISTS, never verified it
DISCRIMINATES."* The three instances, all yours, all the same shape:

1. **Round 3:** an acceptance test on a gitignored path — could never observe its change.
2. **Round 2 (adjacent):** open-shape bags marked "COPIED-AND-FLAGGED" — a checklist row that
   cannot close a wildcard.
3. **Now:** 32 acceptance commands that do not execute at all.

**The remedy is procedural, and it belongs in the plan, not just in a report: RUN every acceptance
command you author, at authoring time, and record its observed pre-fix result beside it.** A
command you have not executed is a guess about a command.

Add to each acceptance line an explicit **category and expected pre-fix result** — the taxonomy
the S03 coding seat proposed and the Router's gate now enforces:

- `FEATURE-ASSERTION` — **must be RED pre-fix.** If it is green before the feature exists, it pins
  nothing and is a defect.
- `REGRESSION-BASELINE` — legitimately GREEN pre-fix and must STAY green.
- `VERIFICATION-ONLY` (`Change: none`) — legitimately GREEN; it guards against side effects.

The Router's gate flags any pre-fix GREEN command whose category is undeclared. Three S01 commands
are currently in that state (`grep -c "auth: \"public\""`, `grep -c "disclosed answer-only"`,
`grep -n "export const PublicDebateSchema"`); at least `S01-C3-4` is a correct regression guard —
declare them so a reviewer and the gate both stop guessing.

## Bounds

SPECs stay FROZEN. `PLAN.md` edits and `DECISIONS.md` APPENDS only — never edit a DECISIONS line;
append one citing `t_71699495`. No product code, no tests, no `PROGRESS.md`. V's four rulings are
unchanged and closed.

**Sync note the Router got wrong last round:** you edit the MAIN tree. The coding seats read
worktree copies. The Router owns syncing them and will do so before resuming any lane — do not
edit worktrees yourself.

## Handoff

`SKILLS LOADED: <list>`, then `REWORK READY FOR REVIEW` on `t_f864a84b`, stating: the count of
`--reporter=basic` occurrences removed per PLAN, one representative command per PLAN that you RAN
with its observed result pasted verbatim, and the category now declared on every acceptance line.
Append to your self-report: why "author a command" and "run the command" stayed separate acts
across three rounds, and what would have closed that gap at round 0. Then stop.

# ARCH-01 — ACCEPTANCE-COMMAND thread, ROUND 3 of 3 (FINAL)

**Ticket:** `t_f910328a` (PLAN-05, BLOCKING). Also on this round, non-blocking:
`t_ffcb2df1` (REV03-N1).
**This is the last round on this thread.** There is no round 4 — if this does not close it,
it goes to the V DECISIONS PACKET as an unresolved row.
**Your file:** `docs/missions/public-debate-access/slices/S01/PLAN.md` + its `DECISIONS.md`
(append-only). SPECs FROZEN. Do not touch worktrees — the Router syncs those. Do not touch
product code: **S01-CODE has finished and posted READY FOR PEER REVIEW**, with all four
clusters green under the three-run law. Verification-command text only.

Open your handoff with `SKILLS LOADED: <list>`.

## Finding 1 — BLOCKING, and it is the FOURTH variant of your own family

A Grok blind lens was asked one question: *construct a case where the new capture-then-check
idiom passes while the acceptance has verified nothing.* It found one. The Router reproduced
it independently before writing this brief.

`grep -qE 'Tests +[0-9]+ passed'` is **unanchored** and searches the WHOLE capture. Vitest
prints skipped test **titles** on their own lines. A title containing the substring
`Tests <n> passed` therefore satisfies the guard on a run that executed nothing:

    it("Tests 1 passed is in the title")   +   -t "feature-not-written-zzzz"
    observed:  vt=0  guard=0   ->  COMPOUND PASSES
    real summary: "Tests  2 skipped (2)"
    guard matched: "↓ …/pollution.test.ts > router B1 probe > Tests 1 passed is in the title"

Clean control, no polluting title: `vt=0 guard=1` → correctly fails.

**Reproduce this yourself before changing anything.** Then note what it means: three rounds
running, the assertion has been checkable against text that is not the thing being asserted.
Round 3 fixed *where the status came from*; this is about *what the guard is allowed to read*.

**The replacement, already tested by the Router against a hostile matrix — verify it, do not
take it on trust:**

    out=$(pnpm exec vitest run <file> [-t "<pat>"] 2>&1); vt=$?
    sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
    printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
      && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?
    [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]

Three changes, each load-bearing: **anchor** to the summary line so a title cannot satisfy it;
require a **nonzero** pass count so `Tests 0 passed` cannot; **reject `failed`** so a mixed run
cannot. Matrix (old vs new), measured:

| case | expected | old | new |
|------|----------|-----|-----|
| A real pass | PASS | PASS | PASS |
| B vacuous `-t`, clean file | FAIL | FAIL | FAIL |
| C vacuous `-t`, **polluted title** | FAIL | **PASS** | FAIL |
| D real failure | FAIL | FAIL | FAIL |
| E mixed pass + fail | FAIL | FAIL | FAIL |
| F nonexistent file | FAIL | FAIL | FAIL |
| G whole polluted file | PASS | PASS | PASS |

Apply to all 8 step-level commands and the 1 cluster-table row in S01. S02/S03/S04 have no
vitest capture-first commands — **confirm that, do not assume it.**

## Finding 2 — non-blocking (`t_ffcb2df1`), sets WHEN not WHETHER

S01-C2/C3 are FEATURE-ASSERTION but run whole-file with no presence arm, so before the new
tests exist they can go green on the file's pre-existing tests rather than on the assertion's
own subject. Distinct from Finding 1: that is the guard reading the wrong TEXT, this is the
command's SCOPE being wider than its claim. The `test -f <path> &&` guard already used at
S01-C1-5 is one precedent; requiring a *named* test to have run is another. Your call.

## The thing worth saying out loud

Four rounds, four variants, one family. Each fix was correct and each left a different way for
a command to look like verification and verify nothing. Before you close this round, answer in
DECISIONS.md: **what property should an acceptance command have, such that a fifth variant is
not possible?** Not another patch — the invariant. If the honest answer is "no single
expression can carry it," say that, and say what structure would.

## Standing

- Reproduce before you change. Run every command you touch; paste one observed result.
- A finding is a finding — non-blocking sets WHEN, never WHETHER.
- Say plainly what you could not do rather than inferring it.
- Round 3 of 3. No round 4.

Return control at `REWORK READY FOR REVIEW` or a genuine blocker.

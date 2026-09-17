# H-FIX — self-report (case file)

Same seat as the h-diag diagnoses, now with write authority. One round, no rework. Fourteen
gate-runs, ~45 minutes. Two files changed, 86 insertions, 3 deletions. The test that has been red
since T0 is green, and I have a reverted-mutant proof for each half of why.

## The thing that made this round cheap, and it was not the code

The product fix is one line of SQL. The round was cheap because the **diagnosis was already
paid for** — I inherited `owned: true`, `live: false`, `candidates_count: 0`,
`PRE_REGRESSION_predicate_matches: 1`, and a dated regressing hunk. Writing the fix took one
edit; every minute after that went into proving it, and that is the correct ratio.

**The lesson worth generalizing: a fix lane that inherits a measured diagnosis should spend its
budget on refutation, not on re-deriving the cause.** I spent four of fourteen gate-runs on
mutants and two on regression suites — six of fourteen purely on trying to break my own work.
That is what turned "the test passes" into "here is why each half is load-bearing and here is the
one thing neither suite can catch".

## What I nearly got wrong

**I nearly restored the two `NOT EXISTS` clauses.** It was the packet's first suggested
mechanism, it is literally the pre-regression code, and it would have made every test green. It
is also wrong: the helper additionally checks `identity_user.state='active'`, which the inlined
pair never did, so restoring the pair would have silently dropped the active-user check on the
ENCRYPTED path. `2d1f86b8` broke one path while tightening another, and "revert the regression"
would have undone both halves. **The reason I caught it is that I read the helper's body before
choosing, rather than trusting the diagnosis's own summary of it** — and the diagnosis was mine,
which is exactly the summary I was most likely to trust.

That is a sharper version of D60: rigour downstream of a false premise produces a confident wrong
answer faster, and the premise you are least likely to re-check is the one you wrote yourself.

**I also nearly shipped without the whole-file run.** My second test calls `sweep`, which archives
every qualifying run in the register version — a global side effect inside a suite that shares one
database across 87 tests. I declared the block last so it could not reach anything, then almost
treated "declared last" as proof. It is an assumption; the filtered `-t` run skips the other 85
tests and says nothing about ordering. The whole-file run (87/87) is the only thing that licenses
the claim. Filed in TOOLING-TRAPS.md.

## The finding I did not expect, and would not have found without the neighbouring mutant

The worker contract's §2.4 — "build one neighbouring mutant it should NOT catch" — is the step
that looks like ceremony. It produced the most interesting result of the round.

`IS DISTINCT FROM 1` → `IS DISTINCT FROM 2` was caught by **nothing**. Not by my tests, which is
correct — they only exercise unencrypted runs. But also not by the 48-test
`s6-content-encryption-database` suite, which is where encrypted-path coverage lives. So the
encrypted half of the guard I just wrote is **unpinned**: delete its left operand tomorrow and an
erased or deactivated owner's encrypted run silently re-enters `recordQuery`'s candidate set, with
a green suite.

I would not have discovered that by writing more tests for my own change — my tests were already
passing. It came from asking what my tests should *fail* to catch, and then checking whether
anything else caught it. **Recommendation: make §2.4 two-sided.** It currently reads "confirm your
test does not catch the neighbour". It should read "confirm your test does not catch it, then find
the test that SHOULD — and if there is none, that absence is a finding." The one-sided version
would have let me report "correctly scoped" and stop, one step short of the actual result.

## What repeatedly cost tokens, across all three assignments in this seat

1. **Re-deriving line numbers after every merge.** Three assignments, three re-derivations
   (`:3990` → `:4035` → `:3962`/`:4044` as my own comments shifted them). The packet handled this
   well by naming the tip and telling me to re-derive; the deeper fix is D53's — cite by unique
   pattern, not by line. My mutant logs cite lines that were already stale by the next run.
2. **The `git checkout <sha> -- path` staging trap** shaped every revert I did. I avoided it by
   copying pristine files to the scratchpad instead. It is already in TOOLING-TRAPS; it earned its
   place three times today.
3. **Nothing else.** Three assignments in one seat with warm context was dramatically cheaper than
   three cold seats would have been — the fix lane knew why `live: false` mattered without
   re-reading a single migration.

## How this becomes a one-prompt machine

1. **Keep diagnosis and fix in one warm seat, with an external reviewer.** This is the strongest
   structural finding across all three assignments. The fix took one edit because the seat already
   held the measurements; a cold fix seat would have re-run the gate isolation to understand
   `live: false`. The router's "never review your own homework" is satisfied by the codex
   reviewer — and my report tells that reviewer explicitly that the diagnosis and the fix share an
   author, so the independent verification matters more than usual. **Diagnose-then-fix in one
   seat, review in another** should be the default shape, not an exception.
2. **`tools/probe-run.sh` — third time asking.** I did not need the scratch-copy harness this
   round because I had write authority, but I needed its cousin: save-pristine → mutate → run →
   restore → prove porcelain. I hand-rolled that four times today. It is twenty lines and every
   refutation duty in the fleet needs it.
3. **A "which sibling call sites guard this?" check belongs in review.** The defect, the fix, and
   the untested gap all turn on one fact: twelve call sites, eleven guarded, one not. That count
   was three greps. A reviewer asked to check "does this call site match its siblings" would have
   caught `2d1f86b8` at review time and saved eight days of a stable-red test.
4. **Bulk "chore/checkpoint" commits should be forbidden from touching `packages/`** — now D62,
   and this round is its second exhibit: the fix comment has to name `2d1f86b8` explicitly so the
   next reader does not re-simplify the guard away.

## What I did NOT do, by contract

No push, no merge, no self-Done, no board or DECISIONS edit. No credential touched. Did not fix
`assertPrivateContentLive` (`packages/db/src/index.ts:485`) — out of contract, named in the report.
Did not touch the fixture to manufacture a runner-up. Never ran two gate-runs in one worktree at
once — the error I made in the diagnosis lane and did not repeat. TOOLING-TRAPS.md appended only,
byte count checked before and after. Final tree: two files modified, nothing staged, 0 mode
changes, no stray files, HEAD unmoved at `d08ee928`.

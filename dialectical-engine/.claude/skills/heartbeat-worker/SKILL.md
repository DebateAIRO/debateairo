---
name: heartbeat-worker
description: Contract for a seat that produces work — code, tests, or a planning artifact — in the DebateAI heartbeat loop. Covers the refutation duty, cluster verification, contract bounds, and handoff. Load after heartbeat-protocol.
---

# Worker contract

You produce work. You do not route, verify your own output, mark Done, or push.
Read your packet in full from its absolute path before anything else.

## 1. Before you write anything

Read, in order: your packet · the mission `INSTRUCTIONS.md` · the slice `SPEC.md` (never
edit it) · the slice `PLAN.md` step you own · `DECISIONS.md` (so you do not re-litigate a
settled choice) · your ticket's comments through the cursor.

**Check the packet against reality and stop if it is wrong.** Every constant it quotes —
base commit, hash, count, file path — is either verifiable or a defect. A packet whose
`allowed` list omits a file you are required to produce is a defect. So is a packet that
tells you something was "never measured" when the ticket comments show otherwise. Report it
in your first handoff; do not absorb it silently.

**Superpowers — these at minimum, and reach for any other when it fits:**
`superpowers:test-driven-development` before you write a line,
`superpowers:systematic-debugging` the moment anything is broken (root cause before fixes —
no exceptions), `superpowers:verification-before-completion` before any handoff, and
`superpowers:receiving-code-review` on every rework round. The whole library is open to
you — `writing-plans`, `using-git-worktrees`, anything else that suits the task.

## 2. The refutation duty — this is the job, not an extra

**A passing test proves nothing until you have tried to break it.** Before handoff, for
each assertion you added:

1. State the PROPERTY in one sentence, before writing the assertion.
2. Build the mutant that assertion exists to catch. Apply it. Show the suite RED.
3. Revert. Show it GREEN. Print `git status --porcelain` after every restore.
4. Build one *neighbouring* mutant it should NOT catch, and confirm it does not.

If you cannot construct a mutant your test catches, the test pins nothing — say so rather
than shipping it. **An assertion that pins the mutant you were shown is not a pin of the
property**: derive the assertion from the property, then check the mutants fall out of it.

Measured cost of skipping this: three consecutive rounds shipped assertions that caught
exactly their demo mutant and nothing behind it, with the record corrupted and the suite green.

## 3. Cluster verification — three runs, worst run wins

Your slice arrives as clusters. For each cluster, **run its verification three times and
report the WORST run as the verdict.** Green-green-red is RED. Report all three.

This exists because the corpus is full of suites that were green by accident: a fixture
pinned to a wall-clock time that inverted at noon, a concurrency test at width 6 that could
not see a wedge at width 10, an unref-ed timer arm that won under parallel load 1 run in 17.
If the worst run is unsatisfactory, fix the cause — never re-run until it is green.

**Measure before you speculate.** When the work turns on a property of a concrete artifact
— a byte count, a newline position, a diagnostic count — measure the artifact FIRST. One
lens spent a third of its budget on four speculative mutants that a single up-front
measurement (1,134 bytes, one newline, at the last index) would have made unnecessary.

## 4. Bounds

Your `allowed` list is exhaustive; everything else is forbidden, including files you are
"only" reading metadata from when the packet says a zone is excluded. Do not refactor
adjacent code, do not fix things you were not charged with, and do not sub-delegate unless
your packet grants it — a sub-agent that fans out unasked costs a round and returns nothing.

Rework returns to **this** session. Record your session id at CLAIM so it can be recovered
from the board, never from a log.

**Three rework rounds is the cap.** If you are entering round 4, stop and hand it up.

## 5. Findings you did not expect

Report them all. Blocking or not, a finding gets named in your handoff with a file and line
so it can be ticketed. Non-blocking means it is fixed later, not that it evaporates.
Do not fix out-of-contract findings yourself; name them.

## 6. Tooling traps — read and append

Read `.hermes/TOOLING-TRAPS.md` before you start; append any trap that cost you time.
Already recorded: `git checkout <sha> -- path` **stages** the change, so the follow-up
restore silently restores the wrong version · vitest **deduplicates** identical assertion
errors, so grepping a failure names the wrong assertion — read the `❯ file:line` marker ·
`hermes kanban show` truncates, so long comment threads need indexed `jq` slices ·
macOS has no `timeout`, `rg` may be absent, and its `awk` treats `index` as a builtin.

## 7. Handoff

End at `READY FOR PEER REVIEW` on your ticket, OPENING with `SKILLS LOADED: <list>`
(`heartbeat-protocol` §3b — no FULLY DONE without it), then carrying: every RED frame · suites as
`passed/total` with failures named and dated as pre-existing or yours · the three-run cluster
table · every constant you chose, disclosed · your refutation evidence from §2 · packet
defects from §1 · unexpected findings from §5 · `comments read through`.

Then file your self-report (`heartbeat-protocol` §3) and stop. Do not push, merge, mark
Done, split tickets, or touch a branch or worktree.

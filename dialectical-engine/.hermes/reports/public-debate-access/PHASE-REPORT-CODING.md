# Phase report — CODING loop · mission `public-debate-access` · 2026-08-29

Written at the coding-loop gate. Nothing here is a verdict; verdicts are Hermes's and merges are
V's. Every number below was measured, and where it could not be, that is said rather than estimated.

## Slice status

| Slice | What it delivers | State |
|---|---|---|
| **S01** | Public envelope carries the redacted argument tree | **COMMITTED** on `dev` at `4138f72` (4 commits). Unpushed, unmerged. Two real anonymous-data leaks found and closed by blind review. |
| **S02** | Public debate DETAIL page — read parity, no mutation affordance | Implementation in flight. All 8 declared files modified, 3 new components, 4 new render tests. One correct block already spent and resolved. |
| **S03** | Your Debates / Public Debates tabs on the library page | Implemented and locally green; 2 blocking review findings, both now addressed or in flight. |
| **S04** | Publication-contract audit + QA verdict inputs | **Blocked on S02**, correctly — its C2-1 verifies state "after S01/S02 land". Ticket `t_76050188`. |
| **QA-01** | Final QA loop | Not started. Packet authored and ready (`packets/QA-01.md`). |

## The mission's signature finding: one defect family, now **nine** variants

Every one is the same shape — **a check that returns the right answer for a reason unrelated to the
property it claims.** Each was found by a different seat, and each cost real time until the class
was named:

1. Gitignored path — the command could never observe its own change.
2. `--reporter=basic` — removed in vitest 4.1.10; the run crashed before starting.
3. Live `| grep -q` — crashed the run *and* stole its exit status.
4. Unanchored guard — matched a *skipped test's title* instead of the summary.
5. Markdown-escaped `\|` in a `-t` filter — a literal pipe in a JS regex, matching nothing.
6. Absolute line ranges — observes the wrong place, and goes **silent** when the assertion is negative.
7. A backticked **file reference** executed as a command — fails identically in every state of the code.
8. A scan root not tied to the artifact it polices — passed while the mandated file did not exist.
9. **Variant 5 again**, inside the fix for finding B2 — escaped pipes in a `node -e` compound condition.

**Variants 7 and 9 are the load-bearing lessons.** Variant 7 lived in the Router's own pre-dispatch
gate: it reported four feature-assertion clusters as verified-RED when it had executed nothing. It
was *worse* than variant 1, because a `.tsx` path is never executable, so it would have reported RED
in every state of the code forever — including a correct implementation. Variant 9 matters because
V waived the rework cap (Row 6) *specifically* to close variant 5's class, and the class came back
the first time a new `||` was written. **A fix that only removes existing occurrences was never a
class fix.** Architecture is answering that now.

Two further instances were in *review setup* rather than in acceptance commands: a coverage count
that reported "9 of 9" against a PLAN with 22 acceptance steps (ten stated in prose, silently
excluded), and a blindness check that grepped `git status` — which says nothing about a committed,
unmodified file — and so verified *"was it modified"* when the question was *"does it exist."*

## What worked, and should propagate

- **Asking a reviewer to CONSTRUCT a counterexample rather than to "review."** Three for three: both
  S01 data leaks and REV-05's B1 were found this way, and REV-04 predicted a plan-table-only lens
  would have missed its finding entirely.
- **Mutation-testing an assertion in both directions** — S03's seat proved its test was *sensitive*
  (a real mutant fails) and *specific* (a neighbouring styling mutant still passes). That is the
  only evidence offered all mission that a green test means anything.
- **Blocking instead of complying.** S01's seat blocked 7 times, was right 7 times, and consumed
  zero rework rounds. S02's seat blocked once, was right, and found more than the Router had.
- **Reproducing a finding before routing it.** Several reports have been wrong; several have been
  righter than expected. Both are only discoverable by re-running them.

## Defects charged to the Router, disclosed

1. A dispatch packet that **contradicted itself** — granting Row 7 authority in one paragraph and
   forbidding the C5 change in another. Cost one seat cycle. Retracted in the resume packet.
2. **Variant 7 in the pre-dispatch gate** (above), plus the silent coverage count.
3. **A broken blindness guarantee** — the author's self-report was committed at the lens's base
   commit, so withholding the copy withheld nothing. Disclosed by the lens, not exploited.
4. **Dispatching S03's B1 rework and Architecture's B2 ruling in parallel** as though independent.
   The ruling changed the markup the seat's new test asserts. The follow-up round is explicitly
   **not** charged against that seat's rework cap.

## Open for V

- **Row 8 — CLOSED.** Live probes deferred to QA. Consequence recorded: QA inherits three
  unverified acceptances and must state which runtime it observed, at which commit, before
  reporting any verdict on them.
- **Nothing is pushed and nothing is merged.** S01 sits on `dev`, 4 commits ahead of origin.
- The **dev-branch triage** (7 pre-existing failures, unrelated to this mission) was delivered and
  is awaiting a go-ahead. Nothing has been fixed.

# Review packet — DEPTH-01 (dual diamond, DR-153)

**Board:** `debateai-v3` · **Ticket:** `t_d5d1a650` (`review`) · READ-ONLY.
Both lenses must greenlight.

## What this ticket is — and why it is unusual

It ships **no code**. V ruled (DR-154(1)): *"a debate should go as deep as I
select it."* V declined to pick a depth and made depth an ask-time choice, so
the register needs a cost-envelope member PER SELECTABLE DEPTH instead of the
single `{standard, depth 1, 9}` it holds today.

The worker was forbidden from choosing the numbers (AC-76/DR-039). Its
deliverable is a PROPOSAL for V to ratify:
`docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md`.

**So this review is about whether the ARITHMETIC IS TRUE**, not whether code is
good. If the numbers are wrong, V ratifies a wrong register row and every debate
either gets refused or silently overspends V's own model subscriptions.

## Orchestrator's independent gates

root `tsc` clean · root vitest **60 files / 418 tests** · architecture
`{"edgeRowsChecked":27,"violations":[]}` — unchanged, as required for a
docs-only ticket. (The 13 modified tracked files are prior tickets' work
already dual-approved, not this one's.)

## The proposal's claims — verify each against the code

Cost model, cited to real call sites:

| organ | claimed call site | claimed rule |
|---|---|---|
| node-authoring JUDGE | `apps/runner/src/index.ts:347-355` | one per authored node |
| FAIR-01 critic JUDGE | `:456-467` | one per run |
| COMPOSER | `:745-765` | one per composition attempt |
| segment CONFORMANCE | `:807-825` | one per segment per attempt |
| post-compose R9 | `:827-843` | one after segment conformance passes |

Base table: depth 1→**9**, 2→**10**, 3→**11**, 4→**12**.
With PRO-01 + PANEL-01 (M=2 makers): 1→**10**, 2→**14**, 3→**22**, 4→**38**,
5→**70** (declared not recommended). Proposed ceiling **N=4**, on economic
grounds.

## What to judge

1. **Are the call sites real and the count rules right?** Read the runner.
   Does COMPOSER really fire once per attempt, and is `max_recompose` handled
   (DR-049 fixes it at 2)? Is R9 once per composition or once per run? A
   miscount here is the whole ticket.
2. **Is the serve arithmetic (`7`) actually constant across depths?** The
   proposal holds it fixed while nodes grow. Is segment count really
   independent of node count? If segments scale with nodes, the table is wrong
   in the direction that hurts — under-provisioned envelopes refuse real runs.
3. **Ground truth.** The settled two-maker run spent **8** attempts at depth 1;
   a later run spent **6**. Does the model predict 8 for that run's shape? If
   it predicts 9 for a run that used 8, is the difference explained (a retry
   that did not happen, a skipped recompose) or hand-waved?
4. **PRO-01 growth.** `2^d − 1` for a binary pro/con tree — check the exponent
   and whether the ROOT question card is correctly excluded (it is synthetic,
   not a node). Off-by-one here doubles or halves the cost.
5. **PANEL-01 shape.** DR-154(2): each maker AUTHORS its own root position
   (N independent roots), which is NOT the shipped `runJudgePanel` grading
   shape. Does the arithmetic model authorship or grading?
6. **Tiers.** The engine escalates the asker tier to the deployment floor
   (`packages/register/src/index.ts:356-365`), so sub-floor members are
   unreachable. Does the proposal handle that, and does it cover every tier
   `/new` offers? EXEC-01 lost a revision to exactly this mismatch.
7. **The boot hazard.** `acceptance/runtime-policy.ts` pins the envelope to a
   ONE-MEMBER tuple and refuses to boot on a second member. Is that called out
   as a same-pass requirement?

## Verdict

`APPROVED` or `CHANGES REQUESTED`; BLOCKING → ADVISORY with file:line and the
concrete failing case. A wrong number is BLOCKING even though no code shipped —
V will ratify this into law. "Nothing blocking" is legitimate.

Write to `reviews/depth01-<yourname>-rev1.md` and print to stdout.

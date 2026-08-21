# Review packet — EXEC-01 (dual diamond, DR-153)

**Repo:** `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`
**Board:** `debateai-v3` · **Ticket:** `t_6fae713b` (status `review`)
**Author:** Codex (gpt-5.6-sol) · **You are one of TWO independent lenses.**
Both an Opus 5 lens and a Grok lens must greenlight before this can be done.
You are READ-ONLY: you produce a verdict and findings. Do not edit code, do not
run git, do not mutate the board.

## What to read

1. `docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-codex-handoff.md`
   — the author's claims, with pasted output.
2. `docs/missions/2026-08-06-v3-programming/goal-packets/EXEC-01-codex-goal.md`
   — the contract it had to satisfy.
3. `docs/missions/2026-08-06-v3-programming/CODING-LOOP-PROTOCOL.md` — the
   standing laws (TDD, DDD, SOLID, pattern register P1–P18, the 27-row
   dependency-edge table, DR-115, AC-76/DR-039, DR-121, git is V-gated).
4. `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` — DR-149..DR-153
   are today's.
5. The diff itself. Changed files per the handoff inventory:
   `acceptance/main.ts`, `acceptance/run-acceptance.ts`, `acceptance/ceremony.test.ts`,
   `packages/battery/src/index.ts`, `apps/api/src/index.ts`,
   `apps/v2-ui/lib/v3/liveEvents.ts`, `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx`,
   `apps/v2-ui/app/new/page.tsx`, and three test files under `tests/unit/`.

## The problem it was meant to solve

V could not start a debate from the UI. Two defects: (1) depth 3 — the form's
old default — returned a bare 500 that was really a lawful envelope refusal;
(2) at depth 1 the ask returned `202 QUEUED` and then NOTHING EVER RAN, because
the acceptance harness wired a `NoopDispatcher` with an empty `dispatch()`.
The goal packet was explicit that fixing (1) alone would be WORSE than useless,
because it converts a visible error into a silent forever-QUEUED stall.

## Verify, do not trust

The handoff pastes live output. Treat every claim as a hypothesis:

- **Does queued work actually execute, non-blocking?** Is the 202 genuinely
  returned before execution, or is there a hidden await? Are dispatch failures
  swallowed — any floating promise, unhandled rejection, or `catch {}` that
  loses the reason?
- **P8 / no mode branch:** confirm PRODUCT code carries no acceptance-mode
  branch and the substitution lives only at the acceptance composition root.
  A conditional smuggled into `apps/api` or `packages/*` is a blocking finding.
- **DDD:** `recordTerminalFailure` was added to `packages/battery`. Does the
  aggregate own that invariant, or is this an anemic setter reaching across a
  boundary? Check it against `03-module-design.md` and the 27-row edge table.
- **DR-115 (ABSOLUTE):** is `ACCEPTANCE_EXECUTION_FAILED` a REAL recorded
  reason, or a default that masks the actual cause? Does any path invent a
  terminal, a reason, or a run state that was never observed? Does the UI
  render a failure it did not receive?
- **AC-76/DR-039 — look hard here:** `/new` now "defaults and constrains depth
  to the only ruled member (1)" and displays "up to 9 model attempts". Are
  those numbers READ from the register, or HARDCODED literals in the UI? A
  hardcoded 1 or 9 that silently drifts from a future V ruling is exactly the
  defect class this law exists to prevent. Say plainly which it is.
- **The stall failure mode must not reappear in the error path:** if the runner
  throws, times out, or the process dies mid-run, does the work item still
  reach a typed terminal — or can it sit in QUEUED forever again?
- **TDD honesty:** the log claims a live RED where a DDL check
  (`run_progress_event_kind_check`) rejected the first design. Confirm the RED
  tests genuinely failed for the stated reason before the fix, and that the
  pasted output is real rather than narrated.
- **Evidence rows left in the live DB** (`75383998…`, `63f3cd76…`,
  `a317e588…`): is leaving them correct, and does any of them poison the
  standing stack or a later ceremony?

## Also check

Test quality (are the new tests capable of failing for the right reason?),
naming and cohesion, error-path coverage, and anything in the changed files
that would embarrass us in front of V.

## Your verdict

Return one of `APPROVED` / `CHANGES REQUESTED`, then findings ranked
BLOCKING → ADVISORY. Every finding: file:line, what is wrong, why it violates
a named law or breaks a real scenario, and the concrete failing case. No
speculative nitpicks presented as defects — if you are unsure, say so and mark
it advisory. Write your verdict to
`docs/missions/2026-08-06-v3-programming/reviews/exec01-<yourname>-rev1.md`
and print it to stdout as well.

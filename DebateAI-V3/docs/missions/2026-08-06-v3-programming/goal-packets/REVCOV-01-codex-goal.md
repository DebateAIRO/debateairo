# /goal packet — REVCOV-01 (Codex seat) — complete review coverage (DR-184/184-A/186)

**Board:** debateai-v3 · **Assignee:** codex · review: single Opus
adversarial lens + orchestrator gates (DR-186(9), Grok seat unfunded —
disclosed). **Lane (DR-168):** prev = DISC-01 (t_1589a6cc, done) · next =
none. Standing law: CODING-LOOP-PROTOCOL.md (v2 amendments) + ledger
through DR-186.

## The spec, in order, IN FULL
1. reviews/dr184-architecture-plan.md — the design (in-run review
   resilience; the catch-up job; projectJudgedStanding; answer
   versioning; census).
2. reviews/dr184-claude-verdict.md — AUTHORIZATION: GRANTED; its ELEVEN
   binding conditions C-1..C-11 are contract. The heaviest: C-1 the
   ceiling arithmetic is 1584 (not 1572) with formula_version bump and the
   panel-1 drop's shipped-test consequence handled declaredly; C-2 the
   catch-up MUST NOT die on exhausted call budgets (fresh accounting for
   catch-up review attempts — the lens proved node 1 of 70 throws
   CALL_BUDGET_EXHAUSTED as planned); C-3 the answer-version repair
   threads factBundleVersion through ALL THREE inserts (duplicate-key
   collision otherwise); C-4 hasJudgedBasis gains the incoming-arrow
   disjunct (a judged cross-root ATTACKER is basis — V's "gains or loses
   power"); C-5/C-6 declare the two behavior changes (class-D served
   root; low-score un-veiling); C-9 arm the tripwire for the catch-up.
3. Ledger DR-184, DR-184-A, DR-186 verbatim — every value ruled: T-KEEP,
   DERIVED-STANDING-UNREVIEWED, pinned panel, pinned ceiling, fourth
   census term, reference-not-copy, typed refusal + sentinel
   (CATCH_UP_NUMBER_WOULD_MOVE), and ZERO in-run review holds (reviews
   get retries + the final attempt — fix the cap-coupling so the final
   attempt survives the cap — but never a wait).

## DELIVERS (summary; the plan + conditions govern)
In-run: review resilience per DR-186(8); the silent-darkness fix (halts
record progress events). Serve: projectJudgedStanding with the extended
closure; DERIVED-STANDING-UNREVIEWED mark (27→28 with required record);
census fourth term in the stickyControl slot. Catch-up: runReviewCatchUp
+ acceptance CLI — pinned panel, pinned ceiling, fresh call-budget
accounting, probes first, typed refusals, resumable, serves answer v2
via supersedes (three-insert threading), never mutates v1. Tests:
mutation-proof per the plan's obligations as repaired by C-8/C-10, incl.
the sentinel pair.

## DONE WHEN
Every gate green with REAL pasted output; vitest list proof; mutation
ledger (P1); handoff handoffs/REVCOV-01-codex-handoff.md; progress log;
review + "READY FOR PEER REVIEW — REVCOV-01".

## FORBIDDEN
No grok CLI calls (seat unfunded — discovery will honestly record it);
no API keys (DR-179); no evaluator; no unruled literals; no standing-
stack control (V's served debate lives there; the catch-up RUN against it
is the orchestrator's post-close ceremony, not yours).

## Return rule
Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.

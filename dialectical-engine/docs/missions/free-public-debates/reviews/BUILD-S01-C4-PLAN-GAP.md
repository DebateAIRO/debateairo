# Plan gap found at BUILD(S01-C4) — relayed by the orchestrator as FACTS (2026-09-21 03:30)

- verdict: **REWORK** of PLAN cluster C4 only (a BUILD→ARCH feedback edge; not an ARCH-REV pass — that review reached its cap at pass 3 with PASS)
- source: the second BLOCKED comment by BUILD-S01-C4 on ticket t_4990de08 (session 01a0c14d-c07b-7021-b6c3-f402ce1bab7e) and its self-report `.hermes/reports/free-public-debates/agent-reports/BUILD-S01-C4.md`

## G1 (blocking) — the erasure function cannot insert the PRIVATE visibility event the plan orders

1. PLAN C4-S4 (the block that replaces `0040_account_erasure.sql:4534-4538`) orders `core.prepare_private_run_erasure` to INSERT a `core.run_visibility_event` row with state PRIVATE for a bound published run, inside the erasure transaction.
2. Every insert into `core.run_visibility_event` passes the trigger function `core.enforce_publication_v2_ref_binding()`. At lane head `11184e70` its newest definition is C2's: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine/migrations/0067_system_run_publication.sql:43-69`. It admits a row only when (a) it is the pinned system PUBLISHED shape (actor token `…00f1`, state PUBLISHED, a PREPARED system intent), or (b) `actor_ref_version=2` AND an unconsumed, unexpired `identity.publication_event_binding` row matches the event id, the actor token and the run. Anything else raises SQLSTATE 55000 `PUBLICATION_V2_REF_BINDING_REQUIRED`.
3. The erasure path holds a `DELETE_PRIVATE_DEBATE` grant, not a publication binding; the plan forbids consuming an UNPUBLISH grant and names no actor token, no `actor_ref_version`, no binding provenance for the PRIVATE row, and does not say whether `0068` may `CREATE OR REPLACE` that trigger function (a file C2 owns the newest definition of).
4. The seat's RED frame at `11184e70`: `tests/integration/fpd-s01-c4-delete-published.test.ts rc=1 passed=4 failed=6 (expect 4/6)` — six intended failures, among them "bound system-published admission", "PRIVATE/latest membership", "erasure-role success". The seat stopped rather than invent an authorization shape.

The remedy is ARCH's. What the revision must leave decidable by a stranger: the exact shape of the PRIVATE row the erasure writes (actor token, `actor_ref_version`, warning version), what admits it through the trigger (and which migration redefines the trigger, if any), what that admission can NOT be used for (a PRIVATE row on a run that is not bound; a PRIVATE row outside an erasure), the audit row it leaves, and the RED case for each guard.

# Grok review packet — BUG-02 rev1 (dual diamond)

You are the GROK lens on ticket t_59d211be (BUG-02). Codex claims done; you
verify with production-path causality. The Opus lens runs in parallel
(it owns the ONE live-run verification — you spend NO model calls and start
NO runs). Independent verdicts; do not coordinate.

Repo root: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
(git root = PARENT /Users/vladmihaimiron/Documents/DebateAIRO)

## Ground truth
1. `docs/missions/2026-08-06-v3-programming/goal-packets/BUG-02-codex-goal.md`
   — the contract (mechanisms A/B/C, DELIVERS, FORBIDDEN).
2. `docs/missions/2026-08-06-v3-programming/handoffs/BUG-02-codex-handoff.md`
   — the claims + mutation ledger.
3. The BUG-02 delta = `git diff 6c6fbca` at the parent git root (everything
   uncommitted is this ticket).

## ISOLATION (DR-163, ABSOLUTE)
Real tree READ-ONLY (suite runs allowed); mutations only inside your clone
(`cp -Rc /Users/vladmihaimiron/Documents/DebateAIRO /private/tmp/bug02-grok-clone`,
delete after). NO stack process control (PG 55432 / API 8790 / UI 3000 stay
up); NO runs started; sole real-tree write = your verdict file.

## Verify by evidence
1. **Mechanism A (client run-first fallback):** trace the new client flow in
   `apps/v2-ui/lib/api.ts` + `DebatePageClient.tsx` — when both answer
   reads would 404, does the client actually read the run projection and
   drive the loading surface? Does an honest RUN_NOT_FOUND remain loud?
   Does the "repeated answer-404 probe loop" actually disappear (count the
   fetch calls in the new flow)?
2. **Mechanism B (projection honesty):** `packages/db/src/index.ts`
   readLoadingProjection — does the CASE now have a settled arm? Is
   CLAIMED presented as running to the user surface? Run the NEW
   integration tests on real embedded PG in your clone and mutate the CASE
   back (drop the settled arm) — the named test must go red. Verify the
   contract vocabulary change is TYPE-layer only (no kernel/DDL/migration
   in the diff — FORBIDDEN list).
3. **Mechanism C (no user-visible errors):** could any in-flight state still
   surface an error banner/toast/not-found page? Mutate to resurface (e.g.
   rethrow the swallowed 404) and confirm the named test goes red.
4. **F1 sweep** on the new tests: assertions that cannot fail for their
   believed reason (source pins, import-satisfiable, predicate-only,
   self-witnessing).
5. **No invented numbers:** any new poll interval/timeout literal in the
   diff must trace to an existing ruled value or be flagged BLOCKING.
6. **SSR/client parity:** the server path (serverApi.getDebateServer) and
   the new client path must classify the same way (served/loading/failed/
   not_found) — divergence is a finding.

## Verdict
Write EXACTLY ONE file:
`docs/missions/2026-08-06-v3-programming/reviews/bug02-grok-rev1.md`
with file:line evidence, findings (BLOCKING vs advisory), and final line
"VERDICT: APPROVED" or "VERDICT: BLOCKING" with reasons.

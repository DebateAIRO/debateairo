# /goal packet — LOAD-01 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_4020ac7b` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok).
**NIGHT MODE:** questions to the handoff's QUESTIONS FOR V section.

Standing law: `CODING-LOOP-PROTOCOL.md` + ledger through DR-165. Read the
ticket body (`hermes kanban --board debateai-v3 show t_4020ac7b`).

## V's ruling (DR-165(1)) — and V hit this personally

V asked the engine's FIRST human question ("Messi or ronaldo?"), got a 404
while the run executed, and only saw the debate after reloading minutes
later. V: *"I want those 404s to never happen. a Loading state would be
nice... I think V2 had a loading state."*

## Diagnose first (reproduce-first is mandatory)

EXEC-01 built typed live run states and the SSE `run.terminal` projection;
the UI has `liveDebateDetail` (`apps/v2-ui/lib/v3/adapter.ts`) and a live
streaming view in `DebatePageClient` — yet V's real flow (POST from `/new` →
navigate to `/debate/<run_ref>` → work item CLAIMED, no answer yet) rendered
404. Find WHY: likely the SSR/first-fetch path 404s on `readAnswer(run_ref)`
before the client live view mounts, or the run-projection fallback broke
under later contract churn. Your RED is V's exact flow, driven with provider
doubles (a queued run with no answer).

Also find V2's own loading state (V remembers one — look in
`apps/dialectical-engine/web`) and restore its BEHAVIOUR on V3 data.

## DELIVERS

1. Navigating to a debate whose run is QUEUED/CLAIMED/executing shows a
   LOADING/generating state in V2's vocabulary — question line visible,
   progress if the stream provides it — NEVER a 404.
2. A run at a typed FAILED terminal shows the typed failure (EXEC-01's
   states) — never a 404, never an infinite spinner. DR-115: do not fabricate
   progress for a dead run.
3. A genuinely nonexistent id still 404s honestly — do not swallow real
   not-found.
4. XREV-01 A-8 (routed here): a mid-review loud stop must reach the page as
   typed failure, not a hang — cover that terminal in your states.
5. Mutation-proof tests per the house standard (state which mutation each
   key assertion kills), plus a live proof against a real queued run using
   provider doubles.

## Environment

The standing stack is UP serving V's two live debates — do NOT restart any
service. The standing API predates today's later migrations; your live proof
runs on your own composition with doubles. Never `next build` into
`.next-dev`.

## DONE WHEN

V's exact flow shows loading → settles into the debate; failed and
nonexistent cases honest; mutation proofs stated; every gate green with REAL
pasted output EACH; handoff `handoffs/LOAD-01-codex-handoff.md`; progress log
`handoffs/LOAD-01-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — LOAD-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.

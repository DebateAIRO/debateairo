# /goal packet — BUG-02 (Codex seat, PROG-V3-R1) — in-flight debate UX: no loading bar, 404 noise, states that lie

**Board:** `debateai-v3` · **Assignee:** codex · **Roster (V steer, this
ticket):** Codex implements · dual diamond (Opus 5 + Grok). ONE ticket; no
architecture consult (V-bounded).
**Lane (DR-168):** prev = BUG-01 (t_fcd509b0, done) · next = none.

Standing law: `CODING-LOOP-PROTOCOL.md` (v2 amendments included) + ledger
through DR-171. DR-165(1) binds: "I want those 404's to never happen. a
'Loading' state would be nice" — V has now hit the 404-noise/no-loading hole
LIVE on run 008b5ba8-596c-4c2c-b7f9-3eba78eb5df5 ("how does someone
efficiently lose weight?", 2026-08-13 ~18:35Z).

## What V experienced (all three are the defect)

Started a debate from /new → navigated to /debate/<run_id> → saw a status
"CLAIMED" → then 404s ("on answer and on the debate id") → NO loading bar
ever appeared → after ~3 minutes the debate "finally loaded". V's words:
"no error should be thrown. Also, the loading bar did not show itself at
all."

## Diagnosed mechanisms (verify each with a RED first)

A. **Client data layer never falls back to the run projection.**
   `apps/v2-ui/lib/api.ts:142-155` `getDebateBundle` = readAnswer →
   (NOT_FOUND) → readRunAnswer → (NOT_FOUND) → THROW. The page's `refresh()`
   (`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:~414-436`) swallows the
   NotFound and returns — so client-side navigation to an in-flight debate
   renders NO loading UI and polls two 404ing endpoints. The SSR path
   (`apps/v2-ui/app/debate/[id]/page.tsx` + `lib/serverApi.ts:62-99`
   getDebateServer) already has the correct three-way fallback (served /
   loading-from-run-projection / honest not_found) — the CLIENT must gain
   the same shape: when both answer reads 404, read the run projection
   (`/v1/runs/:id`, contract client `readRun`) and drive the LOAD-01
   loading surface from it; only an honest RUN_NOT_FOUND may surface as
   not-found.

B. **`readLoadingProjection` reports states that lie.**
   `packages/db/src/index.ts:313-343`: CASE has arms for FAILED / CLAIMED /
   READY(→QUEUED), ELSE 'RUNNING'. Two lies: (1) a work item stays
   state='CLAIMED' for its whole execution (claim TTL hours), so V watched
   "CLAIMED" while 16 model calls were running; (2) after the work item
   SETTLES the CASE falls to ELSE and reports 'RUNNING' FOREVER — live-
   proven: run 008b5ba8 serves its answer while /v1/runs/:id says RUNNING.
   Fix the projection to report an honest settled/served terminal state
   (vocabulary: extend `RunLoadingProjection["state"]` / contract
   `RunProjectionSchema` member as needed — a TYPE-layer vocabulary
   extension for an existing DB fact, not a new DB value; if you find this
   requires a kernel/DDL change STOP and hand back — that would need the
   architecture loop). CLAIMED-while-executing should present as the
   running/working state to the user surface (the projection may keep
   internal truth; the UI must not show "CLAIMED" as a resting state for
   minutes).

C. **404 noise must not reach the user.** The in-flight probe pair
   (`/v1/answers/<run_id>` with a RUN id, then `/v1/runs/<id>/answer`)
   fires every poll. Reorder/branch so the client asks the run projection
   FIRST when it knows the id came from an ask redirect, or otherwise
   ensure no repeated by-design 404 loop; no error banner, toast, or
   not-found page for a run that exists. (Mechanism yours; the OUTCOME —
   zero user-visible errors and minimal 404 chatter for an in-flight run —
   is the contract.)

## DELIVERS

1. Client in-flight flow: loading surface (the LOAD-01 bar/progress) renders
   immediately for an existing unserved run, updates from run
   projection/SSE events, flips to the debate when the answer serves —
   without a manual refresh.
2. Honest projection states per B (settled arm; no eternal RUNNING).
3. No user-visible error for the in-flight window per C.
4. Tests under the ENFORCED suite (tests/render for the client states with
   mocked transport: answer 404 + run 200 CLAIMED/RUNNING/settled; unit/
   integration for the projection CASE on real embedded PG — extend
   tests/integration/database.test.ts).
5. Mutation-proof (P1): each load-bearing assertion names its mutation —
   at minimum: drop the client run-projection fallback → red; revert
   projection settled arm → red; resurface the error banner on in-flight
   404 → red; break the serve-flip → red.

## DONE WHEN

Every gate green with REAL pasted output EACH (typecheck, architecture,
integration on embedded PG, full vitest, lint); `vitest list` collection
proof (P2); mutation ledger in the handoff; handoff
`handoffs/BUG-02-codex-handoff.md`; progress log
`handoffs/BUG-02-progress.log`; status `review` + comment
`READY FOR PEER REVIEW — BUG-02`.

## FORBIDDEN

No kernel vocabulary/DDL/migration changes (STOP and hand back if needed);
no new dependency edges; no touching the standing stack (PG 55432, API
8790, UI 3000 — live verification is the DIAMOND's job with one real run);
no invented numbers (poll intervals etc. that are not already ruled must
come from existing register rows or be surfaced as questions, never
literals); scope = this ticket's three mechanisms only.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.

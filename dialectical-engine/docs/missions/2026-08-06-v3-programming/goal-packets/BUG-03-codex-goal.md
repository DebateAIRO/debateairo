# /goal packet — BUG-03 (Codex seat, PROG-V3-R1) — the debates buffer hides generating runs

**Board:** `debateai-v3` · **Assignee:** codex · **Roster:** Codex implements ·
dual diamond (Opus 5 + Grok). ONE ticket.
**Lane (DR-168):** prev = BUG-02 (t_59d211be, done) · next = none.

Standing law: `CODING-LOOP-PROTOCOL.md` (v2 amendments) + ledger through
DR-172-A.

## What V experienced (2026-08-14, live)

V asked "How do I fry scream?" (depth 5, a long generation), navigated BACK
to the home debates buffer while it generated — and the run is nowhere. V's
words: "I cannot see it in the debates buffer as 'generating' (which thats
how it should be) and idk where to go to see it and idk even if it's done."
People WILL navigate away during long generations; the home surface must
carry their open runs.

## Diagnosed mechanism

The home page reads ONLY the served-answer index:
`apps/v2-ui/lib/serverApi.ts:41` → `readAnswerIndex` → `/v1/answers`
(`serve.readAnswerIndex`, asker-scoped). No API surface lists an asker's
OPEN runs at all (`apps/api/src/index.ts` has no runs index route). An
in-flight or failed-pre-answer run is therefore invisible everywhere except
its direct /debate/<id> URL — which the user has no way to rediscover.

## DELIVERS

1. **An asker-scoped open-runs surface in the index path**: extend the
   answers index response (or add a sibling read the home page consumes in
   the same request flow) to include the asker's runs that have NO served
   answer yet — each with run_ref, question_line, the honest projection
   state (generating-class / FAILED with terminal_reason), and enough to
   order them. Asker scoping identical to `readAnswerIndex` (S05: the
   asker sees their own, never a stranger's). DR-115: states from the
   run/work-item projection (BUG-02's honest states), never invented.
2. **The home debates buffer renders them**: open runs appear alongside
   served debates, newest first — a generating entry shows an in-progress
   affordance (reuse the LOAD-01/BUG-02 loading vocabulary) and links to
   /debate/<run_id> (which handles the in-flight view since BUG-02); a
   failed run shows its typed failure honestly (banner vocabulary), also
   linking through. A served run appears ONCE (as its answer entry — no
   duplicates).
3. Reuse the existing HOME_PAGE_SIZE bound; no new literals (AC-76 —
   any new limit must be an existing ruled value or a typed question).
4. Tests under the ENFORCED suite: integration on real embedded PG for the
   new read (in-flight visible to owner, invisible to foreign asker,
   served run not duplicated, failed run carries terminal_reason); render
   tests for the home page mixed states (generating entry present +
   linking, failed entry honest, no duplicate for served).
5. Mutation-proof (P1) with the ledger in the handoff — at minimum: drop
   the open-runs read → red; leak foreign asker's runs → red; duplicate a
   served run → red; render a generating run as done (or silently omit
   it) → red.

## DONE WHEN

Every gate green with REAL pasted output EACH (typecheck, architecture,
integration on embedded PG, full vitest, lint, generate:contract zero-drift
if the contract gains the index member); `vitest list` collection proof
(P2); mutation ledger; handoff `handoffs/BUG-03-codex-handoff.md`; progress
log `handoffs/BUG-03-progress.log`; status `review` + comment
`READY FOR PEER REVIEW — BUG-03`.

## FORBIDDEN

No kernel/DDL/migration changes unless the read genuinely needs a migration
(none expected — the tables exist; STOP and hand back if you disagree); no
new dependency edges; NO touching the standing stack (PG 55432 / API 8790 /
UI 3000 — V's first real depth-5 debate is IN FLIGHT on it; live
verification is the diamond's job); scope = this surface only.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
